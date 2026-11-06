import test from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../core.mjs';

// Keep the reference model independent of the solver's slots, masks and helpers.
const referenceWindows = {
  morning: { start: 540, end: 720, energy: 3 },
  afternoon: { start: 840, end: 1020, energy: 2 },
  evening: { start: 1140, end: 1260, energy: 1 }
};
const calendarDate = (start, offset) => {
  const date = new Date(start + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const pointsFor = (task, energy) => task.priority * 100 + (3 - Math.abs(energy - task.energy)) * 10;
const availability = entries => Array.from({ length: 7 }, (_, day) => entries[day] || []);
const work = (id, changes = {}) => ({ id, title: id, minutes: 60, priority: 3, energy: 3, due: '2026-11-03', dependsOn: [], ...changes });

function exhaustive(input) {
  const candidates = new Map(input.tasks.map(task => {
    const placements = [];
    input.availability.forEach((names, day) => {
      if (calendarDate(input.start, day) > task.due) return;
      for (const name of names) {
        const window = referenceWindows[name];
        for (let minute = window.start; minute + task.minutes <= window.end; minute += 30) {
          placements.push({ start: day * 1440 + minute, end: day * 1440 + minute + task.minutes, score: pointsFor(task, window.energy) });
        }
      }
    });
    return [task.id, placements];
  }));
  let bestScore = 0, bestFinishCost = 0;
  const done = new Set();
  // Every prefix is a candidate subset. Every legal next task/start is visited,
  // including deliberate gaps and later days; no states are merged or pruned.
  function visit(cursor, score, finishCost) {
    if (score > bestScore || (score === bestScore && finishCost < bestFinishCost)) {
      bestScore = score; bestFinishCost = finishCost;
    }
    for (const task of input.tasks) {
      if (done.has(task.id) || task.dependsOn.some(id => !done.has(id))) continue;
      done.add(task.id);
      for (const placement of candidates.get(task.id)) {
        if (placement.start >= cursor) visit(placement.end, score + placement.score, finishCost + placement.end);
      }
      done.delete(task.id);
    }
  }
  visit(0, 0, 0);
  return { score: bestScore, finishCost: bestFinishCost };
}

function independentlyCheck(input, result) {
  const completed = new Map();
  let cursor = 0, score = 0, minutes = 0, finishCost = 0;
  for (const block of result.schedule) {
    const task = input.tasks.find(item => item.id === block.id);
    assert.ok(task, 'returned task exists');
    assert.ok(!completed.has(task.id), 'each task appears once');
    assert.ok(Number.isInteger(block.day) && block.day >= 0 && block.day < 7);
    assert.ok(Number.isInteger(block.start) && block.start % 30 === 0);
    assert.equal(block.end - block.start, task.minutes);
    assert.equal(block.date, calendarDate(input.start, block.day));
    assert.ok(block.date <= task.due, 'actual placement meets its deadline');
    const window = input.availability[block.day].map(name => referenceWindows[name]).find(item => block.start >= item.start && block.end <= item.end);
    assert.ok(window, 'whole block fits an enabled window');
    const start = block.day * 1440 + block.start, end = block.day * 1440 + block.end;
    assert.ok(start >= cursor, 'chronological non-overlapping blocks');
    for (const prerequisite of task.dependsOn) {
      assert.ok(completed.has(prerequisite), 'prerequisite is completed');
      assert.ok(completed.get(prerequisite) <= start, 'prerequisite finishes first');
    }
    assert.equal(block.energy, window.energy);
    assert.equal(block.fit, 3 - Math.abs(window.energy - task.energy));
    assert.equal(block.points, pointsFor(task, window.energy));
    score += pointsFor(task, window.energy); minutes += task.minutes; finishCost += end;
    cursor = end; completed.set(task.id, end);
  }
  assert.equal(result.score, score, 'score is independently recomputed');
  assert.equal(result.totalMinutes, minutes);
  const capacity = input.availability.flat().reduce((sum, name) => sum + referenceWindows[name].end - referenceWindows[name].start, 0);
  assert.equal(result.capacityMinutes, capacity);
  const omitted = result.omitted.map(item => item.id);
  assert.equal(new Set(omitted).size, omitted.length, 'omissions are unique');
  assert.deepEqual([...omitted].sort(), input.tasks.filter(task => !completed.has(task.id)).map(task => task.id).sort());
  return { score, finishCost };
}

const fixtures = [
  {
    name: 'later matching energy can beat earlier completion',
    start: '2026-11-01', availability: availability({ 0: ['morning'], 1: ['evening'] }),
    tasks: [work('light', { minutes: 120, energy: 1 })]
  },
  {
    name: 'deadline before the week and prerequisite deadline conflict',
    start: '2026-11-01', availability: availability({ 0: ['evening'], 1: ['morning'] }),
    tasks: [work('old', { due: '2026-10-31' }), work('prep', { minutes: 180 }), work('dependent', { due: '2026-11-01', dependsOn: ['prep'], priority: 5 })]
  },
  {
    name: 'reverse input dependency chain crosses disconnected windows',
    start: '2026-11-01', availability: availability({ 0: ['morning', 'afternoon'], 2: ['evening'] }),
    tasks: [work('last', { energy: 1, dependsOn: ['middle'] }), work('middle', { minutes: 180, energy: 2, dependsOn: ['first'] }), work('first', { minutes: 180, due: '2026-11-01' })]
  },
  {
    name: 'equal scores prefer earlier total completion across days',
    start: '2026-11-01', availability: availability({ 0: ['morning'], 2: ['morning'] }),
    tasks: [work('long', { minutes: 120 }), work('short', { minutes: 30 })]
  },
  {
    name: 'month boundary and a deadline beyond the horizon',
    start: '2026-10-31', availability: availability({ 0: ['evening'], 1: ['afternoon'], 6: ['morning'] }),
    tasks: [work('october', { due: '2026-10-31', energy: 1 }), work('november', { due: '2026-11-01', energy: 2 }), work('later', { due: '2026-11-10', minutes: 180 })]
  },
  {
    name: 'empty availability omits every block',
    start: '2026-11-01', availability: availability({}),
    tasks: [work('a'), work('b', { dependsOn: ['a'] })]
  }
];

let seed = 20261106;
const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
for (let index = 0; index < 16; index++) {
  const start = index % 2 ? '2026-10-31' : '2026-12-30';
  const input = {
    name: `seeded mixed-window case ${index + 1}`,
    start,
    availability: availability({ 0: [random(2) ? 'morning' : 'evening'], 1: ['afternoon'], 3: [random(2) ? 'evening' : 'morning'] }),
    tasks: []
  };
  for (let taskIndex = 0; taskIndex < 4; taskIndex++) {
    input.tasks.push(work('t' + taskIndex, {
      minutes: (random(6) + 1) * 30,
      priority: random(5) + 1,
      energy: random(3) + 1,
      due: calendarDate(start, random(6) - 1),
      dependsOn: taskIndex && random(2) ? ['t' + random(taskIndex)] : []
    }));
  }
  if (index % 2) input.tasks.reverse();
  fixtures.push(input);
}

for (const fixture of fixtures) {
  test(`independent multi-window oracle: ${fixture.name}`, () => {
    const expected = exhaustive(fixture);
    const actual = solve(fixture, { beamWidth: Infinity });
    assert.equal(actual.exact, true);
    assert.equal(actual.pruned, 0);
    assert.deepEqual(independentlyCheck(fixture, actual), expected);
  });
}
