export const DAY = 1440;
export const LIMIT = 16;
export const windows = [
  { id: 'morning', label: 'Morning', start: 9 * 60, end: 12 * 60, energy: 3 },
  { id: 'afternoon', label: 'Afternoon', start: 14 * 60, end: 17 * 60, energy: 2 },
  { id: 'evening', label: 'Evening', start: 19 * 60, end: 21 * 60, energy: 1 }
];
export function dayNumber(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Use a date in YYYY-MM-DD format.');
  const time = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) throw new Error('That calendar date does not exist.');
  return time / 86400000;
}
export function dateAt(start, offset = 0) { return new Date((dayNumber(start) + offset) * 86400000).toISOString().slice(0, 10); }
export function clock(minutes) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
export function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a planner object.');
  if (Object.hasOwn(input, 'version') && input.version !== 1) throw new Error('Unsupported planner version. Use a version 1 backup.');
  const start = input.start;
  dayNumber(start);
  if (dayNumber(start) < dayNumber('2000-01-01') || dayNumber(start) > dayNumber('2099-12-24')) throw new Error('Choose a week between 2000 and 2099.');
  if (!Array.isArray(input.tasks) || input.tasks.length > LIMIT) throw new Error(`Use at most ${LIMIT} work blocks.`);
  const ids = new Set();
  const tasks = input.tasks.map(t => {
    if (!t || typeof t.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(t.id) || ids.has(t.id)) throw new Error('Work block IDs must be unique letters, numbers, underscores or hyphens.');
    ids.add(t.id);
    if (typeof t.title !== 'string' || !t.title.trim() || t.title.length > 120) throw new Error('Each work block needs a title of 1-120 characters.');
    if (!Number.isInteger(t.minutes) || t.minutes < 30 || t.minutes > 180 || t.minutes % 30) throw new Error('Work blocks must be 30-180 minutes in half-hour steps.');
    if (!Number.isInteger(t.priority) || t.priority < 1 || t.priority > 5) throw new Error('Importance must be between 1 and 5.');
    if (!Number.isInteger(t.energy) || t.energy < 1 || t.energy > 3) throw new Error('Focus demand must be between 1 and 3.');
    dayNumber(t.due);
    if (!Array.isArray(t.dependsOn) || t.dependsOn.some(id => typeof id !== 'string') || new Set(t.dependsOn).size !== t.dependsOn.length) throw new Error('Dependencies must be a list of unique work block IDs.');
    return { id: t.id, title: t.title.trim(), minutes: t.minutes, priority: t.priority, energy: t.energy, due: t.due, dependsOn: [...t.dependsOn] };
  });
  const byId = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    if (!byId.has(id)) throw new Error('A dependency refers to a missing work block.');
    if (visiting.has(id)) throw new Error('Dependencies contain a cycle.');
    if (visited.has(id)) return;
    visiting.add(id); byId.get(id).dependsOn.forEach(visit); visiting.delete(id); visited.add(id);
  }
  tasks.forEach(t => visit(t.id));
  if (!Array.isArray(input.availability) || input.availability.length !== 7 || input.availability.some(day => !Array.isArray(day) || day.some(w => !windows.some(win => win.id === w)) || new Set(day).size !== day.length)) throw new Error('Availability must contain seven days of named time windows.');
  return { version: 1, start, tasks, availability: input.availability.map(day => [...day]) };
}
function prepare(input) {
  const data = validate(input);
  const slots = [];
  data.availability.forEach((enabled, day) => windows.filter(w => enabled.includes(w.id)).forEach(w => {
    for (let minute = w.start; minute < w.end; minute += 30) slots.push({ day, minute, absolute: day * DAY + minute, energy: w.energy, window: w.id });
  }));
  const indexed = data.tasks.map((t, index) => ({ ...t, index, bit: 1 << index, mask: t.dependsOn.reduce((mask, id) => mask | (1 << data.tasks.findIndex(x => x.id === id)), 0), deadline: (dayNumber(t.due) - dayNumber(data.start) + 1) * DAY }));
  return { data, slots, indexed };
}
function placement(task, slots, index) {
  const slot = slots[index], count = task.minutes / 30, endIndex = index + count;
  if (!slot || !slots[endIndex - 1] || slots[endIndex - 1].absolute !== slot.absolute + task.minutes - 30 || slots[endIndex - 1].window !== slot.window || slots[endIndex - 1].day !== slot.day || slot.absolute + task.minutes > task.deadline) return null;
  const fit = 3 - Math.abs(slot.energy - task.energy);
  // Importance dominates a single block's energy bonus. This is a planning score, not predicted grades.
  return { id: task.id, index: task.index, day: slot.day, start: slot.minute, end: slot.minute + task.minutes, energy: slot.energy, fit, points: task.priority * 100 + fit * 10, endIndex };
}
function greedy({ slots, indexed }) {
  let index = 0, mask = 0, score = 0, finishCost = 0;
  const schedule = [];
  while (index < slots.length) {
    const options = indexed.filter(t => !(mask & t.bit) && (mask & t.mask) === t.mask).map(t => ({ task: t, block: placement(t, slots, index) })).filter(x => x.block).sort((a, b) => a.task.deadline - b.task.deadline || b.task.priority - a.task.priority || a.task.index - b.task.index);
    if (!options.length) { index++; continue; }
    const { task, block } = options[0];
    schedule.push(block); score += block.points; finishCost += block.day * DAY + block.end; mask |= task.bit; index = block.endIndex;
  }
  return { score, mask, schedule, finishCost };
}
export function solve(input, { beamWidth = 96 } = {}) {
  if (!(beamWidth === Infinity || (Number.isInteger(beamWidth) && beamWidth > 0 && beamWidth <= 4096))) throw new Error('Invalid search width.');
  const prepared = prepare(input), { data, slots, indexed } = prepared;
  const baseline = greedy(prepared);
  const layers = Array.from({ length: slots.length + 1 }, () => new Map());
  layers[0].set(0, { mask: 0, score: 0, schedule: [], finishCost: 0 });
  const compare = (a, b) => b.score - a.score || a.finishCost - b.finishCost || a.mask - b.mask;
  let expanded = 0, pruned = 0;
  function offer(index, state) {
    const old = layers[index].get(state.mask);
    if (!old || compare(state, old) < 0) layers[index].set(state.mask, state);
  }
  for (let index = 0; index < slots.length; index++) {
    let states = [...layers[index].values()].sort(compare);
    if (states.length > beamWidth) { pruned += states.length - beamWidth; states = states.slice(0, beamWidth); }
    for (const state of states) {
      expanded++;
      offer(index + 1, state);
      for (const task of indexed) {
        if (state.mask & task.bit || (state.mask & task.mask) !== task.mask) continue;
        const block = placement(task, slots, index);
        if (block) offer(block.endIndex, { mask: state.mask | task.bit, score: state.score + block.points, schedule: [...state.schedule, block], finishCost: state.finishCost + block.day * DAY + block.end });
      }
    }
    layers[index].clear();
  }
  const best = [...layers.at(-1).values()].sort(compare)[0] || { score: 0, mask: 0, schedule: [], finishCost: 0 };
  // Retain the baseline so pruning can never make the reported result worse than it.
  const winner = compare(best, baseline) <= 0 ? best : baseline;
  const schedule = winner.schedule.map(b => ({ ...b, date: dateAt(data.start, b.day) }));
  const omitted = indexed.filter(t => !(winner.mask & t.bit)).map(t => {
    let reason;
    if (t.deadline <= 0) reason = 'Deadline is before this planning week.';
    else if (t.dependsOn.some(id => !schedule.some(b => b.id === id))) reason = 'A prerequisite is also unscheduled. Move it or reduce the workload first.';
    else if (!slots.some((_, i) => placement(t, slots, i))) reason = 'No uninterrupted window fits before the deadline.';
    else reason = 'Competes with other work for available time. This heuristic does not prove the task is impossible.';
    return { id: t.id, reason };
  });
  return { schedule, omitted, score: winner.score, baselineScore: baseline.score, baselineCount: baseline.schedule.length, expanded, pruned, totalMinutes: schedule.reduce((sum, b) => sum + b.end - b.start, 0), capacityMinutes: slots.length * 30, exact: pruned === 0 };
}
export function finishTask(input, id) {
  const data = validate(input);
  if (!data.tasks.some(task => task.id === id)) throw new Error('That work block no longer exists.');
  return validate({ ...data, tasks: data.tasks.filter(task => task.id !== id).map(task => ({ ...task, dependsOn: task.dependsOn.filter(prerequisite => prerequisite !== id) })) });
}
export function exportCalendar(input, result, now = new Date()) {
  const data = validate(input);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Calendar export needs a valid timestamp.');
  const exportedAt = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const escape = s => s.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const stamp = (date, minute) => `${date.replaceAll('-', '')}T${clock(minute).replace(':', '')}00`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Comeback//Student Planner//EN', 'CALSCALE:GREGORIAN'];
  for (const b of result.schedule) {
    const t = data.tasks.find(t => t.id === b.id);
    if (!t) throw new Error('Calendar schedule contains an unknown task.');
    lines.push('BEGIN:VEVENT', `UID:${t.id}-comeback@local.invalid`, `DTSTAMP:${exportedAt}`, `DTSTART:${stamp(b.date, b.start)}`, `DTEND:${stamp(b.date, b.end)}`, `SUMMARY:${escape(t.title)}`, `DESCRIPTION:${escape('Comeback study block. Importance ' + t.priority + '/5. Deadline ' + t.due + '. Synthetic demo unless replaced by your own work.')}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // RFC 5545: fold by UTF-8 octets, not JavaScript character count.
  return lines.map(line => {
    const chunks = []; let current = '', bytes = 0;
    for (const char of line) {
      const length = new TextEncoder().encode(char).length;
      if (bytes + length > 75) { chunks.push(current); current = ' '; bytes = 1; }
      current += char; bytes += length;
    }
    chunks.push(current); return chunks.join('\r\n');
  }).join('\r\n') + '\r\n';
}
export function demo(start = '2026-10-28') {
  return {
    version: 1, start,
    availability: [['evening'], ['morning', 'afternoon'], ['evening'], ['morning'], [], ['afternoon', 'evening'], ['morning']],
    tasks: [
      { id: 'sources', title: 'Find three credible essay sources', minutes: 90, priority: 4, energy: 3, due: dateAt(start, 1), dependsOn: [] },
      { id: 'outline', title: 'Build the essay argument', minutes: 60, priority: 5, energy: 3, due: dateAt(start, 2), dependsOn: ['sources'] },
      { id: 'draft', title: 'Write the first complete draft', minutes: 180, priority: 5, energy: 3, due: dateAt(start, 3), dependsOn: ['outline'] },
      { id: 'edit', title: 'Revise and check citations', minutes: 90, priority: 5, energy: 2, due: dateAt(start, 5), dependsOn: ['draft'] },
      { id: 'stats', title: 'Practice confidence intervals', minutes: 90, priority: 4, energy: 3, due: dateAt(start, 1), dependsOn: [] },
      { id: 'quiz', title: 'Complete the statistics quiz', minutes: 60, priority: 5, energy: 2, due: dateAt(start, 2), dependsOn: ['stats'] },
      { id: 'reading', title: 'Read the seminar chapter', minutes: 120, priority: 2, energy: 2, due: dateAt(start, 3), dependsOn: [] },
      { id: 'slides', title: 'Draft group presentation slides', minutes: 120, priority: 3, energy: 2, due: dateAt(start, 5), dependsOn: [] },
      { id: 'admin', title: 'Send placement paperwork', minutes: 30, priority: 2, energy: 1, due: dateAt(start, 1), dependsOn: [] },
      { id: 'lab', title: 'Finish the lab analysis', minutes: 180, priority: 4, energy: 3, due: dateAt(start, 0), dependsOn: [] }
    ]
  };
}
