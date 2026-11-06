import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { solve, dateAt, windows, dayNumber } from '../core.mjs';
let seed = 20261028;
const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
const rows = [];
for (let caseId = 0; caseId < 60; caseId++) {
  const start = '2026-10-28';
  const input = { start, availability: Array.from({ length: 7 }, () => windows.filter(() => random(3) !== 0).map(w => w.id)), tasks: Array.from({ length: 16 }, (_, i) => ({ id: 't' + i, title: 'Synthetic task ' + i, minutes: (random(6) + 1) * 30, priority: random(5) + 1, energy: random(3) + 1, due: dateAt(start, random(8) - 1), dependsOn: i && random(4) === 0 ? ['t' + random(i)] : [] })) };
  const begin = performance.now(), result = solve(input), ms = performance.now() - begin;
  assert.ok(result.score >= result.baselineScore);
  const done = new Map(); let lastEnd = -1;
  for (const b of result.schedule) {
    const t = input.tasks.find(t => t.id === b.id);
    assert.ok(!done.has(t.id)); assert.equal(b.end - b.start, t.minutes); assert.ok(b.day * 1440 + b.start >= lastEnd);
    assert.ok(dayNumber(b.date) <= dayNumber(t.due));
    assert.ok(input.availability[b.day].some(id => { const w = windows.find(w => w.id === id); return b.start >= w.start && b.end <= w.end; }));
    for (const id of t.dependsOn) assert.ok(done.has(id) && done.get(id) <= b.day * 1440 + b.start);
    lastEnd = b.day * 1440 + b.end; done.set(t.id, lastEnd);
  }
  assert.equal(result.schedule.length + result.omitted.length, input.tasks.length);
  rows.push({ case: caseId + 1, score: result.score, baseline: result.baselineScore, gain: result.score - result.baselineScore, ms: Math.round(ms * 100) / 100, expanded: result.expanded });
}
const times = rows.map(r => r.ms).sort((a, b) => a - b);
console.log(JSON.stringify({ note: 'Synthetic reproducible workloads, not measured student outcomes. Runtime depends on hardware and shared machine load.', seed: 20261028, cases: rows.length, tasksPerCase: 16, beamWidth: 96, improvedCases: rows.filter(r => r.gain > 0).length, tiedCases: rows.filter(r => r.gain === 0).length, worseCases: rows.filter(r => r.gain < 0).length, totalScore: rows.reduce((n, r) => n + r.score, 0), totalBaselineScore: rows.reduce((n, r) => n + r.baseline, 0), medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.ceil(times.length * .95) - 1], maxMs: times.at(-1), rows }, null, 2));
