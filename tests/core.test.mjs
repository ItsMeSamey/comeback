import test from 'node:test';
import assert from 'node:assert/strict';
import { demo, solve, validate, dateAt, dayNumber, exportCalendar, finishTask, windows } from '../core.mjs';
const blank = () => ({ start: '2026-10-28', tasks: [], availability: Array.from({ length: 7 }, () => []) });
const task = (id, overrides = {}) => ({ id, title: id, minutes: 60, priority: 3, energy: 3, due: '2026-10-28', dependsOn: [], ...overrides });
export function assertValidPlan(input, result) {
  const seen = new Map(); let lastEnd = -1, points = 0;
  for (const block of result.schedule) {
    const t = input.tasks.find(t => t.id === block.id);
    assert.ok(t, 'scheduled task exists'); assert.ok(!seen.has(t.id), 'no task repeated');
    assert.equal(block.end - block.start, t.minutes);
    assert.ok(block.day * 1440 + block.start >= lastEnd, 'no overlap');
    assert.ok(block.day >= 0 && block.day < 7);
    assert.ok(input.availability[block.day].some(id => { const w = windows.find(w => w.id === id); return block.start >= w.start && block.end <= w.end; }), 'inside availability');
    assert.ok(dayNumber(block.date) <= dayNumber(t.due), 'finishes by date deadline');
    assert.equal(block.date, dateAt(input.start, block.day));
    for (const id of t.dependsOn) { assert.ok(seen.has(id), 'prerequisite completed'); assert.ok(seen.get(id) <= block.day * 1440 + block.start); }
    lastEnd = block.day * 1440 + block.end; seen.set(t.id, lastEnd); points += block.points;
  }
  assert.equal(points, result.score);
  assert.equal(result.schedule.length + result.omitted.length, input.tasks.length);
  assert.ok(result.score >= result.baselineScore);
}
test('demo is feasible and explicitly reports impossible work', () => {
  const input = demo(), result = solve(input); assertValidPlan(input, result);
  assert.equal(result.omitted.find(t => t.id === 'lab').reason, 'No uninterrupted window fits before the deadline.');
  assert.deepEqual(solve(input), result, 'deterministic');
});
test('empty work and empty availability are handled', () => {
  assert.equal(solve(blank()).score, 0);
  const input = blank(); input.tasks = [task('a')];
  const result = solve(input); assert.equal(result.schedule.length, 0); assert.equal(result.omitted.length, 1);
});
test('calendar arithmetic is timezone-independent over leap years, DST, and year boundaries', () => {
  assert.equal(dateAt('2024-02-28', 1), '2024-02-29');
  assert.equal(dateAt('2026-12-31', 1), '2027-01-01');
  assert.equal(dateAt('2026-11-01', 1), '2026-11-02');
  assert.throws(() => dayNumber('2026-02-29'));
  assert.throws(() => dayNumber('2026-2-01'));
});
test('deadlines include their entire day, but never the next day', () => {
  const input = blank(); input.availability[0] = ['evening']; input.availability[1] = ['morning'];
  input.tasks = [task('a', { minutes: 120, energy: 1 }), task('past', { due: '2026-10-27' }), task('b')];
  const result = solve(input); assertValidPlan(input, result);
  assert.ok(result.schedule.every(b => b.day === 0));
  assert.ok(result.omitted.some(t => t.id === 'past' && t.reason.includes('before')));
});
test('work cannot bridge the lunch break or cross disconnected windows', () => {
  const input = blank(); input.availability[0] = ['morning', 'afternoon'];
  input.tasks = [task('a', { minutes: 180 }), task('b', { minutes: 180 }), task('c', { minutes: 30 })];
  const result = solve(input); assertValidPlan(input, result); assert.equal(result.schedule.length, 2);
});
test('dependencies are enforced even when input order is reversed', () => {
  const input = blank(); input.availability[0] = ['morning'];
  input.tasks = [task('last', { dependsOn: ['middle'], priority: 5 }), task('middle', { dependsOn: ['first'] }), task('first')];
  const result = solve(input); assertValidPlan(input, result); assert.deepEqual(result.schedule.map(b => b.id), ['first', 'middle', 'last']);
});
test('invalid imports fail before scheduling', () => {
  for (const value of [null, [], {}, { ...blank(), availability: [] }, { ...blank(), start: '2026-02-30' }, { ...blank(), tasks: [task('a', { minutes: 31 })] }, { ...blank(), tasks: [task('a', { priority: 9 })] }, { ...blank(), tasks: [task('a', { energy: 0 })] }, { ...blank(), tasks: [task('a', { dependsOn: ['missing'] })] }, { ...blank(), tasks: [task('a'), task('a')] }, { ...blank(), tasks: [task('a', { dependsOn: ['b'] }), task('b', { dependsOn: ['a'] })] }, { ...blank(), tasks: [task('a', { dependsOn: ['a'] })] }, { ...blank(), tasks: [task('a', { title: '' })] }, { ...blank(), availability: [['wrong'], [], [], [], [], [], []] }, { ...blank(), tasks: Array.from({ length: 17 }, (_, i) => task('t' + i)) }]) assert.throws(() => validate(value));
});
test('normalization removes unknown fields and does not mutate the input', () => {
  const input = demo(); input.untrusted = true; const before = JSON.stringify(input); const validated = validate(input); solve(input);
  assert.equal(validated.untrusted, undefined); assert.equal(JSON.stringify(input), before);
  validated.tasks[0].title = 'changed'; assert.notEqual(input.tasks[0].title, 'changed');
});
test('explicit unsupported versions fail while absent legacy version is accepted', () => {
  assert.equal(validate(blank()).version, 1);
  for (const version of [2, '1', null]) assert.throws(() => validate({ ...blank(), version }), /Unsupported planner version/);
});
test('finishing a prerequisite atomically frees its dependents without mutating the original', () => {
  const input = blank(); input.availability[0] = ['morning'];
  input.tasks = [task('prep', { minutes: 180 }), task('next', { dependsOn: ['prep'] }), task('other', { dependsOn: ['prep'] })];
  assert.equal(solve(input).schedule.some(b => b.id === 'next'), false);
  const before = structuredClone(input), finished = finishTask(input, 'prep');
  assert.deepEqual(input, before); assert.deepEqual(finished.tasks.map(t => t.dependsOn), [[], []]);
  assert.deepEqual(new Set(solve(finished).schedule.map(b => b.id)), new Set(['next', 'other']));
  assert.throws(() => finishTask(input, 'missing'), /no longer exists/);
});
test('search improves on greedy for a tight importance tradeoff', () => {
  const input = blank(); input.availability[0] = ['morning'];
  input.tasks = [task('long', { minutes: 180, priority: 5 }), task('short1', { priority: 4 }), task('short2', { priority: 4 }), task('short3', { priority: 4 })];
  const result = solve(input); assert.equal(result.baselineScore, 530); assert.equal(result.score, 1290); assertValidPlan(input, result);
});
test('a very narrow beam still retains the complete baseline', () => {
  const input = demo(); const result = solve(input, { beamWidth: 1 }); assert.ok(result.pruned > 0); assertValidPlan(input, result);
});
test('calendar escaping, UTF-8 folding, CRLF, and floating wall-clock times', () => {
  const input = blank(); input.availability[0] = ['morning'];
  input.tasks = [task('a', { title: 'Check, cite; \\ review\n' + 'é'.repeat(55) })];
  const output = exportCalendar(input, solve(input));
  assert.ok(output.includes('DTSTART:20261028T090000\r\n')); assert.ok(output.includes('DTEND:20261028T100000\r\n'));
  assert.ok(!output.includes('TZID')); assert.ok(!/(?<!\r)\n/.test(output));
  for (const line of output.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  const unfolded = output.replaceAll('\r\n ', '');
  assert.ok(unfolded.includes('SUMMARY:Check\\, cite\\; \\\\ review\\n')); assert.ok(unfolded.endsWith('END:VCALENDAR\r\n'));
});
test('calendar task UID survives rescheduling and DTSTAMP records the current export instant', () => {
  const input = blank(); input.availability[0] = ['morning']; input.availability[1] = ['morning'];
  input.tasks = [task('a', { due: '2026-10-29' })];
  const first = exportCalendar(input, solve(input), new Date('2026-10-28T12:34:56.789Z'));
  input.availability[0] = [];
  const second = exportCalendar(input, solve(input), new Date('2026-10-28T14:00:01Z'));
  assert.equal(first.match(/^UID:.*$/m)[0], second.match(/^UID:.*$/m)[0]);
  assert.notEqual(first.match(/^DTSTART:.*$/m)[0], second.match(/^DTSTART:.*$/m)[0]);
  assert.ok(first.includes('DTSTAMP:20261028T123456Z')); assert.ok(second.includes('DTSTAMP:20261028T140001Z'));
  const before = Date.now(), real = exportCalendar(input, solve(input)), after = Date.now();
  const stamp = real.match(/DTSTAMP:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
  const instant = Date.parse(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`);
  assert.ok(instant >= Math.floor(before / 1000) * 1000 && instant <= after);
});
// Independent exhaustive oracle: enumerate subsets and all placements across a three-hour window.
function oracle(tasks, minute = 540, done = new Set()) {
  let best = 0;
  for (const t of tasks) {
    if (done.has(t.id) || minute + t.minutes > 720 || t.dependsOn.some(id => !done.has(id))) continue;
    const next = new Set(done); next.add(t.id);
    best = Math.max(best, t.priority * 100 + (3 - Math.abs(3 - t.energy)) * 10 + oracle(tasks, minute + t.minutes, next));
  }
  return best;
}
test('unpruned search matches an independent exhaustive oracle on 40 seeded small cases', () => {
  let seed = 9173; const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
  for (let i = 0; i < 40; i++) {
    const input = blank(); input.availability[0] = ['morning'];
    input.tasks = Array.from({ length: 6 }, (_, j) => task('t' + j, { minutes: (random(4) + 1) * 30, priority: random(5) + 1, energy: random(3) + 1, dependsOn: j && random(3) === 0 ? ['t' + random(j)] : [] }));
    const result = solve(input, { beamWidth: Infinity }); assert.equal(result.score, oracle(input.tasks)); assert.equal(result.exact, true); assertValidPlan(input, result);
  }
});
