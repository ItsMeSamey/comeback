import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
const window = new Window({ url: 'http://127.0.0.1:4179', settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
window.document.write(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
const $ = id => document.getElementById(id);
await import('../app.mjs');
function click(id) { $(id).click(); }
function change(id, value) { $(id).value = value; $(id).dispatchEvent(new window.Event('change', { bubbles: true })); }
function submit() { $('task-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); }
test('initial interface renders synthetic schedule and unscheduled reasons', () => {
  assert.equal($('task-count').textContent, '10');
  assert.ok($('mode-tag').textContent.includes('SYNTHETIC'));
  assert.equal(document.querySelectorAll('.block').length, 9);
  assert.ok($('unscheduled').textContent.includes('Finish the lab analysis'));
  assert.equal(document.querySelectorAll('.window-toggle').length, 21);
  for (const el of document.querySelectorAll('button')) assert.ok(el.textContent.trim() || el.getAttribute('aria-label'));
});
test('availability toggle recalculates and undo restores original plan', () => {
  const before = $('metrics').textContent;
  $('window-1-morning').focus();
  click('window-1-morning'); assert.equal($('window-1-morning').getAttribute('aria-pressed'), 'false');
  assert.notEqual($('metrics').textContent, before); assert.equal($('change-note').hidden, false);
  $('undo-change').focus();
  click('undo-change'); assert.equal($('metrics').textContent, before); assert.equal($('window-1-morning').getAttribute('aria-pressed'), 'true');
  assert.equal(document.activeElement.id, 'window-1-morning');
});
test('editing a dependency into a cycle fails without corrupting the plan', () => {
  click('edit-sources');
  const depends = [...document.querySelectorAll('input[name="dependency"]')].find(el => el.value === 'draft'); depends.checked = true; submit();
  assert.equal($('form-error').hidden, false); assert.ok($('form-error').textContent.includes('cycle')); assert.equal($('task-count').textContent, '10');
  click('cancel-dialog');
});
test('adding, editing and deleting a task works and treats HTML as text', () => {
  click('add-task'); $('task-title').value = '<img src=x onerror=alert(1)> Study'; $('task-minutes').value = '30'; submit();
  assert.equal($('task-count').textContent, '11'); assert.equal(document.querySelectorAll('#task-list img').length, 0);
  const saved = JSON.parse(localStorage.getItem('comeback-v1')); const task = saved.tasks.at(-1); assert.ok(task.title.includes('<img'));
  click('edit-' + task.id); $('task-title').value = 'Edited study'; submit(); assert.ok($('task-list').textContent.includes('Edited study'));
  document.querySelector('[aria-label="Remove Edited study"]').click(); assert.equal($('task-count').textContent, '10');
});
test('removing a prerequisite is blocked with a useful explanation', () => {
  document.querySelector('[aria-label="Remove Find three credible essay sources"]').click();
  assert.equal($('error').hidden, false); assert.ok($('error').textContent.includes('Build the essay argument')); assert.equal($('task-count').textContent, '10');
});
test('Finish clears all prerequisite references and undo restores the complete prior plan', () => {
  const before = JSON.parse(localStorage.getItem('comeback-v1')), scheduleBefore = $('schedule').textContent;
  click('finish-sources');
  const after = JSON.parse(localStorage.getItem('comeback-v1'));
  assert.equal(after.tasks.some(t => t.id === 'sources'), false);
  assert.ok(after.tasks.every(t => !t.dependsOn.includes('sources')));
  assert.equal(document.getElementById('finish-sources'), null);
  assert.ok(!$('schedule').textContent.includes('Find three credible essay sources'));
  click('undo-change');
  assert.deepEqual(JSON.parse(localStorage.getItem('comeback-v1')), before);
  assert.equal($('schedule').textContent, scheduleBefore);
});
test('changing week preserves deadlines and reports infeasible work', () => {
  change('week-start', '2026-11-20'); assert.equal(document.querySelectorAll('.block').length, 0); assert.ok($('unscheduled').textContent.includes('before this planning week')); click('undo-change');
});
test('empty state is useful and reset restores synthetic attribution', () => {
  click('clear-data'); assert.equal($('task-count').textContent, '0'); assert.equal($('mode-tag').textContent, 'YOUR LOCAL PLAN'); assert.equal($('export-calendar').disabled, true); assert.ok($('schedule').textContent.includes('Add work'));
  click('reset-demo'); assert.equal($('task-count').textContent, '10'); assert.equal($('mode-tag').textContent, 'SYNTHETIC DEMO');
});
test('explanation control toggles accessible expanded state', () => {
  click('help-button'); assert.equal($('help-button').getAttribute('aria-expanded'), 'true'); assert.equal($('how-it-works').hidden, false);
  click('help-button'); assert.equal($('help-button').getAttribute('aria-expanded'), 'false');
});
test('JSON import validates before replacing data and supports undo', async () => {
  const importer = $('import-data');
  Object.defineProperty(importer, 'files', { configurable: true, value: [{ size: 10, text: async () => '{"tasks":[]}' }] });
  importer.dispatchEvent(new window.Event('change'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal($('task-count').textContent, '10'); assert.ok($('error').textContent.includes('Import failed'));
  const beforeVersionImport = localStorage.getItem('comeback-v1');
  const future = { version: 2, start: '2026-10-28', tasks: [], availability: [[], [], [], [], [], [], []] };
  Object.defineProperty(importer, 'files', { configurable: true, value: [{ size: 100, text: async () => JSON.stringify(future) }] });
  importer.dispatchEvent(new window.Event('change'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok($('error').textContent.includes('Unsupported planner version'));
  assert.equal(localStorage.getItem('comeback-v1'), beforeVersionImport);
  const valid = { start: '2026-10-28', tasks: [], availability: [[], [], [], [], [], [], []] };
  Object.defineProperty(importer, 'files', { configurable: true, value: [{ size: 100, text: async () => JSON.stringify(valid) }] });
  importer.dispatchEvent(new window.Event('change'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal($('task-count').textContent, '0'); assert.equal($('mode-tag').textContent, 'YOUR LOCAL PLAN');
  click('undo-change'); assert.equal($('task-count').textContent, '10');
});
test('a corrupt stored plan exports exact raw recovery and survives edits and reload', async () => {
  const isolated = new Window({ url: 'http://127.0.0.1:4179', settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  isolated.document.write(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  isolated.localStorage.setItem('comeback-v1', 'broken but recoverable original');
  globalThis.document = isolated.document; globalThis.localStorage = isolated.localStorage;
  try {
    await import('../app.mjs?corrupt-storage-test');
    assert.equal(localStorage.getItem('comeback-v1'), 'broken but recoverable original');
    assert.ok($('status').textContent.includes('preserved')); assert.equal($('task-count').textContent, '10');
    assert.equal($('download-recovery').hidden, false);
    const createObjectURL = URL.createObjectURL; let downloaded;
    URL.createObjectURL = blob => { downloaded = blob; return 'blob:recovery-test'; };
    try { click('download-recovery'); assert.equal(await downloaded.text(), 'broken but recoverable original'); }
    finally { URL.createObjectURL = createObjectURL; }
    click('clear-data'); assert.equal(JSON.parse(localStorage.getItem('comeback-v1')).tasks.length, 0);
    assert.equal(localStorage.getItem('comeback-v1-unreadable'), 'broken but recoverable original');
    isolated.document.open(); isolated.document.write(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
    await import('../app.mjs?recovery-reload-test');
    assert.equal($('task-count').textContent, '0'); assert.equal($('download-recovery').hidden, false);
    assert.equal(localStorage.getItem('comeback-v1-unreadable'), 'broken but recoverable original');
  } finally { globalThis.document = window.document; globalThis.localStorage = window.localStorage; await isolated.happyDOM.close(); }
});
test('recovery storage failure preserves the unreadable primary while edits remain in memory', async () => {
  const isolated = new Window({ url: 'http://127.0.0.1:4179', settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  isolated.document.write(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  const storage = isolated.localStorage; storage.setItem('comeback-v1', 'original needing recovery');
  globalThis.document = isolated.document;
  globalThis.localStorage = { getItem: key => storage.getItem(key), setItem: (key, value) => { if (key === 'comeback-v1-unreadable') throw new Error('quota'); storage.setItem(key, value); } };
  try {
    await import('../app.mjs?recovery-quota-test'); click('clear-data');
    assert.equal($('task-count').textContent, '0');
    assert.equal(storage.getItem('comeback-v1'), 'original needing recovery');
    assert.equal(storage.getItem('comeback-v1-unreadable'), null);
    assert.ok($('storage-note').textContent.includes('changes stay in memory'));
    assert.equal($('download-recovery').hidden, false);
  } finally { globalThis.document = window.document; globalThis.localStorage = window.localStorage; await isolated.happyDOM.close(); }
});
test('storage read failure does not claim recovered text or overwrite inaccessible data', async () => {
  const isolated = new Window({ url: 'http://127.0.0.1:4179', settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  isolated.document.write(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  globalThis.document = isolated.document; let writes = 0;
  globalThis.localStorage = { getItem: () => { throw new Error('access denied'); }, setItem: () => { writes++; } };
  try {
    await import('../app.mjs?storage-read-failure-test');
    assert.ok($('status').textContent.includes('no original saved text could be recovered'));
    assert.ok(!$('status').textContent.includes('Download unreadable save'));
    assert.equal($('download-recovery').hidden, true);
    click('clear-data'); assert.equal($('task-count').textContent, '0'); assert.equal(writes, 0);
    assert.ok($('storage-note').textContent.includes('Storage unavailable'));
  } finally { globalThis.document = window.document; globalThis.localStorage = window.localStorage; await isolated.happyDOM.close(); }
});
test.after(async () => { await window.happyDOM.close(); });
