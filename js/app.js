// Runway — controller: mounts views, handles events, wires sync and undo.
import { app, store, sync } from './state.js';
import { $, $$, icons, toast, makeSortable, haptic, todayISO, addDays } from './ui.js';
import { renderHeader, updateNav, renderToday, renderSchedule, renderAll, renderAllList, renderDone } from './views.js';
import { openAddSheet, openEditSheet, openRescheduleSheet, openTaskMenu, openSettings, openSyncSheet, openFilters } from './sheets.js';

const main = $('#view'), top = $('#top'), nav = $('#nav'), fab = $('#fab');
fab.innerHTML = icons.plus;
document.documentElement.classList.toggle('html-reduce', !!store.prefs.reduceEffects);

function render({ keepScroll = true } = {}) {
  const scroll = main.scrollTop;
  top.innerHTML = renderHeader(sync.status.state);
  updateNav(nav);
  main.innerHTML = { today: renderToday, schedule: renderSchedule, all: renderAll, done: renderDone }[app.view]();
  fab.style.display = app.view === 'done' ? 'none' : '';
  main.scrollTop = keepScroll ? scroll : 0;
  afterRender();
}
app.render = render;

function afterRender() {
  // Re-focus the inline "add step" field if we just used it.
  if (app.focusSubAdd) { const inp = $(`[data-sub-add="${app.focusSubAdd}"]`, main); app.focusSubAdd = null; inp?.focus(); }
  // Subtask drag-reorder inside expanded rows.
  $$('.subs', main).forEach(ul => makeSortable(ul, { itemSelector: '.sub', handleSelector: '.grip', onDrop: (ids) => { app.suppressClick = true; store.reorderSubtasks(ul.dataset.task, ids); } }));
  // Task drag-reorder in Plan view when reorder mode is on.
  $$('.panel.sortable', main).forEach(p => makeSortable(p, { itemSelector: '.task', handleSelector: '.task-grip', onDrop: (ids) => { app.suppressClick = true; store.reorderTasks(ids); } }));
  // Checkbox pop animation for the step just ticked.
  if (app.justOn) { const el = $(`[data-id="${app.justOn.task}"] [data-sub="${app.justOn.sub}"]`, main); el?.classList.add('just-on'); app.justOn = null; }
}

function setView(view, { unscheduled = false } = {}) {
  app.view = view; store.savePrefs({ lastView: view });
  if (view === 'all' && unscheduled) app.all.unscheduledOnly = true;
  render({ keepScroll: false });
}

// ---------- events ----------
document.getElementById('app').addEventListener('click', (e) => {
  if (app.suppressClick) { app.suppressClick = false; return; }
  const el = e.target.closest('[data-action]'); if (!el) return;
  const action = el.dataset.action;
  const row = el.closest('.task'); const id = row?.dataset.id;
  switch (action) {
    case 'nav': setView(el.dataset.view, { unscheduled: !!el.dataset.unscheduled }); break;
    case 'add': openAddSheet({
      categoryId: app.view === 'all' && app.all.category !== 'all' && app.all.category !== 'none' ? app.all.category : undefined,
      targetDate: app.view === 'schedule' && app.schedule.mode === 'day' ? app.schedule.selected : undefined,
    }); break;
    case 'settings': openSettings(); break;
    case 'sync-info': openSyncSheet(); break;
    case 'search': setView('all'); requestAnimationFrame(() => $('#search', main)?.focus()); break;
    case 'toggle-expand': {
      if (e.target.closest('.task-grip')) break;
      const open = row.classList.toggle('is-open');
      if (open) app.expanded.add(id); else app.expanded.delete(id);
      haptic(4);
      break;
    }
    case 'complete': {
      const t = store.task(id); if (!t) break;
      if (t.done) { const undo = store.setTaskDone(id, false); toast(`Reopened “${t.title}”`, { action: 'Undo', onAction: undo }); break; }
      el.classList.add('is-on'); haptic(12);
      row.classList.add('leaving');
      setTimeout(() => { const undo = store.setTaskDone(id, true); app.expanded.delete(id); toast(`Completed “${t.title}”`, { action: 'Undo', onAction: undo }); }, 260);
      break;
    }
    case 'sub-toggle': {
      const sub = el.dataset.sub; const t = store.task(id); const s = t?.subtasks.find(x => x.id === sub); if (!s) break;
      app.justOn = s.done ? null : { task: id, sub }; haptic(6);
      store.setSubtaskDone(id, sub, !s.done);
      break;
    }
    case 'reschedule': openRescheduleSheet(id); break;
    case 'edit': openEditSheet(id); break;
    case 'more': openTaskMenu(id); break;
    case 'restore': { const t = store.task(id); const undo = store.setTaskDone(id, false); toast(`Restored “${t.title}”`, { action: 'Undo', onAction: undo }); break; }
    case 'unarchive': { const t = store.task(id); const undo = store.setTaskArchived(id, false); toast(`Unarchived “${t.title}”`, { action: 'Undo', onAction: undo }); break; }
    case 'delete': { const t = store.task(id); const undo = store.deleteTask(id); toast(`Deleted “${t.title}”`, { action: 'Undo', onAction: undo }); break; }
    case 'dep-jump': {
      const dep = el.dataset.dep; app.expanded.add(dep);
      if ($(`.task[data-id="${dep}"]`, main)) render(); else setView('all');
      $(`.task[data-id="${dep}"]`, main)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
    case 'toggle-archived': app.done.showArchived = !app.done.showArchived; render(); break;
    case 'group-toggle': { const g = el.dataset.group; if (app.all.closed.has(g)) app.all.closed.delete(g); else app.all.closed.add(g); render(); break; }
    case 'chip-cat': app.all.category = el.dataset.cat; render(); break;
    case 'clear-search': app.all.q = ''; render(); $('#search', main)?.focus(); break;
    case 'filters': openFilters(); break;
    case 'reorder-toggle': app.all.reorder = !app.all.reorder; if (app.all.reorder && app.all.groupBy === 'date') app.all.groupBy = 'plan'; render(); break;
    case 'sched-mode': app.schedule.mode = el.dataset.mode; render(); break;
    case 'day': app.schedule.selected = el.dataset.date; render(); break;
    case 'sched-prev': app.schedule.selected = addDays(app.schedule.selected, app.schedule.mode === 'week' ? -7 : -1); render(); break;
    case 'sched-next': app.schedule.selected = addDays(app.schedule.selected, app.schedule.mode === 'week' ? 7 : 1); render(); break;
    case 'sched-today': app.schedule.selected = todayISO(); render(); break;
  }
});

// Inline "add a step" and search typing.
main.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-sub-add]')) {
    const id = e.target.dataset.subAdd, title = e.target.value.trim();
    if (!title) return;
    e.preventDefault(); app.focusSubAdd = id; store.addSubtask(id, title);
  }
  if (e.key === 'Escape' && e.target.matches('#search')) { app.all.q = ''; render(); }
});
let searchTimer = null;
main.addEventListener('input', (e) => {
  if (!e.target.matches('#search')) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    app.all.q = e.target.value;
    const list = $('#all-list', main); if (list) list.innerHTML = renderAllList();
    afterRender();
    const hasClear = !!$('.search .clear', main);
    if (hasClear !== !!app.all.q) { const pos = e.target.selectionStart; render(); const s = $('#search', main); s?.focus(); try { s?.setSelectionRange(pos, pos); } catch {} }
  }, 120);
});
// Tapping into the inline step field must not toggle the row.
main.addEventListener('click', (e) => { if (e.target.matches('[data-sub-add]')) e.stopPropagation(); }, true);

// Keyboard shortcuts on desktop.
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches('input, textarea, select') || document.body.classList.contains('has-sheet')) return;
  if (e.key === 'n') openAddSheet();
  else if (e.key === '/') { e.preventDefault(); setView('all'); requestAnimationFrame(() => $('#search', main)?.focus()); }
  else if (['1', '2', '3', '4'].includes(e.key)) setView(['today', 'schedule', 'all', 'done'][Number(e.key) - 1]);
});

// ---------- wiring ----------
store.on((type, label) => {
  if (type === 'change') { render(); if (label !== 'sync') sync.schedule(); }
});
sync.on((status) => {
  const dot = $('.sync', top); if (dot) dot.dataset.state = status.state;
  if (status.state === 'error' && !sync._errToasted) { sync._errToasted = true; toast(`Sync problem: ${status.message}`, { kind: 'error', duration: 8000 }); }
  if (status.state === 'synced') sync._errToasted = false;
});

// Midnight rollover: re-render so "Today" moves on.
(function scheduleMidnight() {
  const n = new Date(), next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 5);
  setTimeout(() => { render(); scheduleMidnight(); }, next - n);
})();

render({ keepScroll: false });
sync.start();
