import { demo, solve, validate, dateAt, dayNumber, clock, windows, exportCalendar, finishTask, LIMIT } from './core.mjs';
const $ = id => document.getElementById(id);
const STORAGE = 'comeback-v1';
const RECOVERY = 'comeback-v1-unreadable';
const dayLabel = (date, short = true) => new Intl.DateTimeFormat('en', { weekday: short ? 'short' : 'long', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
const dateLabel = date => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
const focusNames = { 1: 'Light', 2: 'Medium', 3: 'High' };
const hours = minutes => (minutes / 60).toLocaleString('en', { maximumFractionDigits: 1 });
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
let data = demo(), demoMode = true, result, previous = null, editingId = null, storageWorks = true, loadFailed = false;
let recoveryRaw = null, unreadableSave = null, saved = null, storageReadFailed = false;
try { recoveryRaw = localStorage.getItem(RECOVERY); } catch { /* The current save may still be readable. */ }
try {
  saved = localStorage.getItem(STORAGE);
  if (saved !== null) { const parsed = JSON.parse(saved); data = validate(parsed); demoMode = parsed.syntheticDemo === true; }
} catch {
  unreadableSave = saved;
  if (saved !== null) recoveryRaw = saved;
  storageReadFailed = saved === null;
  $('status').textContent = saved !== null
    ? 'Saved data could not be opened. The synthetic demo is loaded. Your unreadable save is preserved; use Download unreadable save to recover its original text. Save current plan JSON exports the displayed plan only.'
    : 'Browser storage could not be read. The synthetic demo is loaded and changes stay in memory. Save current plan JSON backs up the displayed plan; no original saved text could be recovered.';
  storageWorks = false; loadFailed = true;
}
function announce(message) { $('status').textContent = message; }
function showError(message) { $('error').textContent = message; $('error').hidden = !message; }
function save() {
  try {
    if (storageReadFailed) throw new Error('Preserve any unreadable browser storage until access is restored.');
    if (unreadableSave !== null) {
      localStorage.setItem(RECOVERY, unreadableSave);
      unreadableSave = null;
    }
    localStorage.setItem(STORAGE, JSON.stringify({ ...data, syntheticDemo: demoMode })); storageWorks = true;
  }
  catch { storageWorks = false; }
  $('storage-note').textContent = storageWorks ? (recoveryRaw !== null ? 'Saved on this device; unreadable save retained separately' : 'Saved on this device') : (unreadableSave !== null ? 'Unreadable save preserved; changes stay in memory. Download both backups.' : 'Storage unavailable - use Save current plan JSON');
}
function commit(next, message, mode = demoMode) {
  const validated = validate(next);
  const focused = document.activeElement?.id;
  const returnFocus = $('task-dialog').contains(document.activeElement) ? (editingId ? `edit-${editingId}` : 'add-task') : focused;
  previous = { data, result, demoMode, returnFocus };
  data = validated; demoMode = mode;
  render(true); save(); showError(''); announce(message);
  if (focused) $(focused)?.focus();
}
function taskById(id) { return data.tasks.find(t => t.id === id); }
function render(changed = false) {
  result = solve(data);
  $('week-start').value = data.start;
  $('mode-tag').textContent = demoMode ? 'SYNTHETIC DEMO' : 'YOUR LOCAL PLAN';
  $('demo-notice').textContent = demoMode ? 'This is a synthetic student week. Try removing a window to see the plan recover.' : 'Your plan stays in this browser. Save JSON for a portable backup; clearing browser data removes the saved plan.';
  $('task-count').textContent = String(data.tasks.length);
  $('add-task').disabled = data.tasks.length >= LIMIT;
  $('add-task').title = data.tasks.length >= LIMIT ? 'Maximum 16 blocks. Remove one before adding another.' : 'Add a work block';
  renderTasks(); renderAvailability(); renderResult();
  $('change-note').hidden = !changed || !previous;
  if (changed && previous) {
    const oldIds = new Set(previous.result.schedule.map(b => b.id)), newIds = new Set(result.schedule.map(b => b.id));
    const dropped = [...oldIds].filter(id => !newIds.has(id) && taskById(id)).map(id => taskById(id).title);
    const gained = [...newIds].filter(id => !oldIds.has(id)).map(id => taskById(id).title);
    const note = $('change-note'); note.replaceChildren();
    note.append(node('strong', '', 'Plan updated. '));
    note.append(document.createTextNode(`${result.schedule.length} blocks now fit. ${dropped.length ? 'Moved out: ' + dropped.join('; ') + '. ' : ''}${gained.length ? 'Newly fits: ' + gained.join('; ') + '. ' : ''}`));
    const undo = node('button', 'text-button', 'Undo last change');
    undo.id = 'undo-change';
    undo.addEventListener('click', () => {
      const restore = previous; data = restore.data; demoMode = restore.demoMode; previous = null;
      render(); save(); showError(''); announce('Last change undone.');
      const target = $(restore.returnFocus);
      const fallback = $('add-task').disabled ? $('week-start') : $('add-task');
      (target && !target.disabled ? target : fallback).focus();
    });
    note.append(undo);
  }
}
function renderTasks() {
  const list = $('task-list'); list.replaceChildren();
  if (!data.tasks.length) list.append(node('p', 'empty-state', 'Start with one finishable step. Add a work block, then choose when you are available.'));
  for (const t of data.tasks) {
    const row = node('article', 'task'); row.dataset.priority = t.priority;
    row.append(node('div', 'priority-line'));
    const content = node('div');
    const title = node('button', 'task-title', t.title); title.id = `edit-${t.id}`; title.setAttribute('aria-label', `Edit ${t.title}`); title.addEventListener('click', () => openForm(t.id)); content.append(title);
    content.append(node('p', 'task-meta', `${hours(t.minutes)}h  /  ${focusNames[t.energy]} focus  /  Due ${dateLabel(t.due)}`));
    if (t.dependsOn.length) content.append(node('p', 'task-depends', 'After: ' + t.dependsOn.map(id => taskById(id).title).join(', ')));
    row.append(content);
    const controls = node('div', 'task-controls'); controls.append(node('span', 'importance', `${t.priority}/5`));
    const finish = node('button', 'text-button', 'Finish'); finish.id = `finish-${t.id}`; finish.setAttribute('aria-label', `Mark ${t.title} finished`);
    finish.title = 'Mark completed: remove this block and clear it from prerequisites. Undo is available.';
    finish.addEventListener('click', () => { commit(finishTask(data, t.id), `Finished ${t.title}. Its prerequisite links are cleared. Undo is available.`); $('add-task').focus(); });
    const remove = node('button', 'icon-button delete-button', '×'); remove.id = `remove-${t.id}`; remove.setAttribute('aria-label', `Remove ${t.title}`);
    remove.addEventListener('click', () => {
      const dependents = data.tasks.filter(x => x.dependsOn.includes(t.id));
      if (dependents.length) { showError(`Edit these blocks to remove their prerequisite first: ${dependents.map(x => x.title).join(', ')}.`); return; }
      commit({ ...data, tasks: data.tasks.filter(x => x.id !== t.id) }, `Removed ${t.title}.`);
      $('add-task').focus();
    });
    controls.append(finish, remove); row.append(controls); list.append(row);
  }
}
function renderAvailability() {
  const head = node('tr'); head.append(node('th', '', 'Window'));
  for (let i = 0; i < 7; i++) {
    const date = dateAt(data.start, i), th = node('th', '', dayLabel(date)); th.scope = 'col'; th.append(node('span', 'date-number', date.slice(-2))); head.append(th);
  }
  $('availability-head').replaceChildren(head);
  const rows = windows.map(w => {
    const row = node('tr'), th = node('th', '', w.label); th.scope = 'row'; row.append(th);
    for (let day = 0; day < 7; day++) {
      const td = node('td'), enabled = data.availability[day].includes(w.id);
      const toggle = node('button', 'window-toggle', enabled ? '✓' : '−');
      toggle.id = `window-${day}-${w.id}`;
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.setAttribute('aria-label', `${dayLabel(dateAt(data.start, day), false)} ${dateLabel(dateAt(data.start, day))}, ${w.label}, ${clock(w.start)} to ${clock(w.end)}`);
      toggle.addEventListener('click', () => {
        const availability = data.availability.map(x => [...x]);
        availability[day] = enabled ? availability[day].filter(id => id !== w.id) : [...availability[day], w.id];
        commit({ ...data, availability }, `${w.label} on ${dayLabel(dateAt(data.start, day), false)} ${enabled ? 'protected from study' : 'available for study'}.`);
      });
      td.append(toggle); row.append(td);
    }
    return row;
  });
  $('availability-body').replaceChildren(...rows);
}
function renderResult() {
  const metrics = [[`${result.schedule.length}/${data.tasks.length}`, 'blocks fit this week'], [`${hours(result.totalMinutes)}h`, `of ${hours(result.capacityMinutes)}h available`], [String(result.omitted.length), 'need a different plan']];
  $('metrics').replaceChildren(...metrics.map(([value, label], i) => { const el = node('div', `metric${i === 2 && result.omitted.length ? ' alert' : ''}`); el.append(node('strong', '', value), node('span', '', label)); return el; }));
  const improvement = result.score - result.baselineScore;
  $('score-note').textContent = `${result.score} planning points. ${improvement ? '+' + improvement : 'Same score'} vs. earliest-deadline baseline (${result.baselineScore}).`;
  $('export-calendar').disabled = !result.schedule.length;
  const schedule = $('schedule'); schedule.replaceChildren();
  if (!result.schedule.length) {
    const empty = node('div', 'empty-plan'); empty.append(node('strong', '', data.tasks.length ? 'Something needs to give.' : 'Your next step starts here.'), node('p', '', data.tasks.length ? 'Open a study window, shorten a block, or revisit a deadline. Unscheduled work is listed below.' : 'Add work and availability to make your first plan.')); schedule.append(empty);
  } else {
    for (let day = 0; day < 7; day++) {
      const date = dateAt(data.start, day), group = node('div', 'day-group'), label = node('div', 'day-label', dayLabel(date)); label.append(node('span', '', dateLabel(date))); group.append(label);
      const blocks = node('div', 'day-blocks'), today = result.schedule.filter(b => b.day === day);
      if (!today.length) blocks.append(node('p', 'free-day', data.availability[day].length ? 'Room to breathe. No work assigned.' : 'Time protected.'));
      for (const b of today) {
        const t = taskById(b.id), block = node('article', `block ${focusNames[b.energy].toLowerCase()}`);
        const time = node('time', '', `${clock(b.start)} - ${clock(b.end)}`); time.dateTime = `${date}T${clock(b.start)}`;
        block.append(time, node('h3', '', t.title), node('p', '', `Importance ${t.priority}/5 · ${b.fit === 3 ? 'Energy matches' : b.fit === 2 ? 'Close energy fit' : 'Energy compromise'}${t.dependsOn.length ? ' · Prerequisites scheduled' : ''}`)); blocks.append(block);
      }
      group.append(blocks); schedule.append(group);
    }
  }
  const omitted = $('unscheduled'); omitted.replaceChildren(); omitted.classList.toggle('all-fit', !result.omitted.length);
  if (!result.omitted.length) { omitted.append(node('h3', '', data.tasks.length ? 'Everything fits. Leave yourself some margin.' : 'No overdue promises here.'), node('p', '', data.tasks.length ? 'Estimates can be wrong. Add buffer by closing windows or increasing block lengths.' : 'Only the work you add will appear in your plan.')); }
  else {
    omitted.append(node('h3', '', `${result.omitted.length} block${result.omitted.length === 1 ? '' : 's'} need a different plan`), node('p', '', 'A clear limit is more useful than a calendar full of wishful thinking.'));
    for (const item of result.omitted) { const entry = node('div', 'omitted-item'), title = node('button', 'task-title', taskById(item.id).title); title.setAttribute('aria-label', 'Edit unscheduled block: ' + taskById(item.id).title); title.addEventListener('click', () => openForm(item.id)); entry.append(title, node('p', '', item.reason)); omitted.append(entry); }
  }
  $('method-copy').textContent = `Each complete block earns importance × 100 plus an energy-fit bonus of 10, 20 or 30. This plan earns ${result.score} points; an earliest-deadline greedy plan earns ${result.baselineScore}. The search explored ${result.expanded.toLocaleString()} states and pruned ${result.pruned.toLocaleString()}. ${result.exact ? 'No states were pruned, so the result maximizes this score within this model.' : 'The search keeps up to 96 states per time step. It is a heuristic, so a better arrangement may exist.'} All work blocks are indivisible. They must fit one available window and finish by the end of their deadline day. Prerequisites must finish first. Morning is treated as high focus, afternoon medium, evening light. This fixed energy model may not match your rhythm.`;
}
function openForm(id = null) {
  editingId = id; const t = taskById(id);
  $('task-form').reset(); $('form-error').hidden = true;
  $('dialog-title').textContent = t ? 'Edit a work block' : 'Add a work block';
  $('task-title').value = t?.title || '';
  $('task-minutes').value = String(t?.minutes || 60);
  $('task-due').value = t?.due || dateAt(data.start, 6);
  $('task-priority').value = String(t?.priority || 3);
  $('task-energy').value = String(t?.energy || 2);
  const options = $('dependency-options'); options.replaceChildren();
  for (const candidate of data.tasks.filter(x => x.id !== id)) {
    const label = node('label'), checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.name = 'dependency'; checkbox.value = candidate.id; checkbox.checked = !!t?.dependsOn.includes(candidate.id); label.append(checkbox, document.createTextNode(candidate.title)); options.append(label);
  }
  if (!options.children.length) options.append(node('p', 'muted', 'Add another block to set a prerequisite.'));
  $('task-dialog').showModal(); $('task-title').focus();
}
$('task-form').addEventListener('submit', event => {
  event.preventDefault();
  const task = { id: editingId || `work-${crypto.randomUUID().slice(0, 12)}`, title: $('task-title').value, minutes: Number($('task-minutes').value), priority: Number($('task-priority').value), energy: Number($('task-energy').value), due: $('task-due').value, dependsOn: [...document.querySelectorAll('input[name="dependency"]:checked')].map(el => el.value) };
  try {
    const tasks = editingId ? data.tasks.map(t => t.id === editingId ? task : t) : [...data.tasks, task];
    commit({ ...data, tasks }, 'Work block saved. Your plan has been recalculated.'); $('task-dialog').close(); $(`edit-${task.id}`)?.focus();
  } catch (error) { $('form-error').textContent = error.message; $('form-error').hidden = false; }
});
$('add-task').addEventListener('click', () => openForm());
for (const id of ['close-dialog', 'cancel-dialog']) $(id).addEventListener('click', () => $('task-dialog').close());
$('week-start').addEventListener('change', () => {
  try { commit({ ...data, start: $('week-start').value }, 'Week changed. Existing deadlines stay on their original dates.'); }
  catch (error) { $('week-start').value = data.start; showError(error.message); }
});
$('reset-demo').addEventListener('click', () => commit(demo(), 'Synthetic example restored. Undo is available.', true));
$('clear-data').addEventListener('click', () => commit({ version: 1, start: data.start, tasks: [], availability: Array.from({ length: 7 }, () => []) }, 'Empty plan started. Your previous plan can be restored with Undo.', false));
$('help-button').addEventListener('click', () => { const open = $('how-it-works').hidden; $('how-it-works').hidden = !open; $('help-button').setAttribute('aria-expanded', String(open)); });
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })), a = node('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export-calendar').addEventListener('click', () => { download(`comeback-${data.start}.ics`, exportCalendar(data, result), 'text/calendar;charset=utf-8'); announce('Calendar snapshot downloaded, not synced. Repeat imports may retain old blocks or create duplicates; review your calendar and timezone after importing.'); });
$('export-data').addEventListener('click', () => { download(`comeback-${data.start}.json`, JSON.stringify({ ...data, syntheticDemo: demoMode }, null, 2) + '\n', 'application/json'); announce('Current displayed plan backup downloaded.' + (recoveryRaw !== null ? ' Use Download unreadable save for the separate original text.' : '')); });
$('download-recovery').hidden = recoveryRaw === null;
$('download-recovery').addEventListener('click', () => { if (recoveryRaw !== null) { download('comeback-unreadable-save.txt', recoveryRaw, 'text/plain;charset=utf-8'); announce('Unreadable save downloaded as its unchanged original text.'); } });
$('import-data').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 100000) throw new Error('Choose a JSON file smaller than 100 KB.');
    const parsed = JSON.parse(await file.text());
    commit(parsed, 'Planner imported and checked. Undo is available.', parsed.syntheticDemo === true);
  } catch (error) { showError('Import failed: ' + error.message); }
  event.target.value = '';
});
render();
if (!loadFailed) save();
else $('storage-note').textContent = recoveryRaw !== null ? 'Unreadable save preserved - download it separately from the current plan' : 'Storage unavailable - use Save current plan JSON';
