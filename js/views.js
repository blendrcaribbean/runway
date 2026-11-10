// Runway — view renderers. Each returns an HTML string; app.js mounts it.
import { app, store, windowFor, isDeparture, onDate, byDate } from './state.js';
import { esc, attr, icon, icons, catTile, ring, checkbox, priorityDot, todayISO, addDays, diffDays, fmtShort, fmtLong, fmtDow, weekStart, dueLabel, parseISO, toISO } from './ui.js';

export const VIEWS = [
  { id: 'today', label: 'Today', icon: 'navToday' },
  { id: 'schedule', label: 'Schedule', icon: 'navSchedule' },
  { id: 'all', label: 'Plan', icon: 'navAll' },
  { id: 'done', label: 'Done', icon: 'navDone' },
];

const overdueTasks = (today = todayISO()) => store.activeTasks().filter(t => t.targetDate && t.targetDate < today);

export const overdueCount = () => overdueTasks().length;
export function renderNav() {
  return VIEWS.map(v => `<button type="button" class="nav-btn ${app.view === v.id ? 'is-active' : ''}" data-action="nav" data-view="${v.id}" ${app.view === v.id ? 'aria-current="page"' : ''}><i class="led" aria-hidden="true"></i>${icon(v.icon)}<span>${v.label}</span><span class="n" hidden></span></button>`).join('');
}
// Update the existing keys in place so the press-in / pop-out transitions can run.
export function updateNav(nav) {
  if (nav.children.length !== VIEWS.length) nav.innerHTML = renderNav();
  const n = overdueCount();
  for (const btn of nav.children) {
    const active = btn.dataset.view === app.view;
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    const badge = btn.querySelector('.n');
    if (btn.dataset.view === 'today' && n) { badge.hidden = false; badge.textContent = n; badge.setAttribute('aria-label', `${n} overdue`); } else badge.hidden = true;
  }
}

export function renderHeader(syncState) {
  const today = todayISO(), meta = store.data.meta;
  const titles = { today: 'Today', schedule: 'Schedule', all: 'Plan', done: 'Completed' };
  const parts = [];
  if (app.view === 'today') {
    parts.push(esc(fmtLong(today)));
    if (meta.departureDate) { const d = diffDays(today, meta.departureDate); parts.push(`<span class="cnt">${d > 1 ? `${d} days to departure` : d === 1 ? 'Departure tomorrow' : d === 0 ? 'Departure day' : 'Departed'}</span>`); }
    const w = windowFor(today); if (w) parts.push(`<span class="prot">${esc(w.label)}</span>`);
  } else if (app.view === 'schedule') {
    parts.push(app.schedule.mode === 'week' ? 'Week view' : 'Day view');
    if (meta.departureDate) parts.push(`Departure ${esc(fmtShort(meta.departureDate))}`);
  } else if (app.view === 'all') {
    const n = store.activeTasks().length; parts.push(`${n} active task${n === 1 ? '' : 's'}`);
    const s = store.activeTasks().reduce((a, t) => a + store.progress(t).total, 0); if (s) parts.push(`${s} steps`);
  } else if (app.view === 'done') {
    const n = store.completedTasks().length; parts.push(`${n} completed`);
    const a = store.archivedTasks().length; if (a) parts.push(`${a} archived`);
  }
  const syncLabel = { off: 'Not synced to GitHub', synced: 'Synced', pending: 'Changes waiting to sync', syncing: 'Syncing…', offline: 'Offline, will sync later', error: 'Sync problem' }[syncState] || '';
  return `<div><h1>${titles[app.view]}</h1><p class="sub">${parts.map(p => p.startsWith('<span') ? p : `<span>${p}</span>`).join('')}</p></div>
    <div class="tools">
      <button type="button" class="sync" data-action="sync-info" data-state="${syncState}" aria-label="${attr(syncLabel)}" title="${attr(syncLabel)}">${icon('cloud')}</button>
      <button type="button" class="b3 icon sm graphite" data-action="search" aria-label="Search">${icons.search}</button>
      <button type="button" class="b3 icon sm graphite" data-action="settings" aria-label="Settings">${icons.gear}</button>
    </div>`;
}

// ---------- task row ----------
export function taskRow(t, { today = todayISO(), context = 'active', sortable = false, showDate = true } = {}) {
  const cat = store.category(t.categoryId);
  const { done, total } = store.progress(t);
  const open = app.expanded.has(t.id);
  const subs = store.liveSubtasks(t);
  let whenCls = '';
  if (t.targetDate && !t.done) { if (t.targetDate < today) whenCls = 'overdue'; else if (onDate(t, today)) whenCls = 'today'; }
  if (t.hardDeadline) whenCls += ' fixed';
  const when = showDate ? `<span class="when ${whenCls}">${t.hardDeadline ? icon('lock') : ''}${esc(dueLabel(t, today))}</span>` : '';
  const badges = [
    t.timeBlock === 'full-day' ? `<span class="badge fullday">${icon('clock')}Full day</span>` : '',
  ].join('');
  const deps = (t.dependsOn || []).map(id => store.task(id)).filter(Boolean);
  const notes = [
    t.deadlineNote ? `<span class="lbl">Deadline</span>${esc(t.deadlineNote)}` : '',
    t.notes ? `<span class="lbl" style="${t.deadlineNote ? 'margin-top:8px' : ''}">Notes</span>${esc(t.notes)}` : '',
  ].filter(Boolean).join('');
  const actions = context === 'active'
    ? `<button type="button" class="b3 sm graphite" data-action="reschedule">${icon('calendar')}<span>${t.targetDate ? 'Reschedule' : 'Schedule'}</span></button>
       <button type="button" class="b3 sm graphite icon" data-action="edit" aria-label="Edit task">${icons.pencil}</button>`
    : context === 'completed'
      ? `<button type="button" class="b3 sm green" data-action="restore">${icon('restore')}<span>Restore</span></button>`
      : `<button type="button" class="b3 sm cyan" data-action="unarchive">${icon('restore')}<span>Unarchive</span></button>
         <button type="button" class="b3 sm graphite" data-action="delete">${icon('trash')}<span>Delete</span></button>`;
  return `<article class="task ${open ? 'is-open' : ''} ${t.done ? 'is-done' : ''}" data-id="${t.id}">
    <div class="task-main" data-action="toggle-expand">
      ${sortable ? `<span class="grip task-grip" aria-label="Drag to reorder">${icons.grip}</span>` : ''}
      ${checkbox(t.done, { action: 'complete', label: t.done ? 'Reopen task' : `Complete ${t.title}` })}
      ${catTile(cat)}
      <div class="task-body">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          <span class="cat">${esc(cat?.name || 'Uncategorized')}</span>
          ${when ? `<span class="sep"></span>${when}` : ''}
          ${t.priority !== 'normal' ? `<span class="sep"></span>${priorityDot(t.priority)}` : ''}
          ${badges}
        </div>
      </div>
      <div class="task-side">${total ? ring(done, total, 26) : ''}<span class="chev">${icons.chevron}</span></div>
    </div>
    <div class="task-sub"><div class="task-sub-inner"><div class="task-sub-pad">
      ${subs.length ? `<div class="steps-head"><span>Steps</span><span class="steps-n">${done}/${total}</span></div><ul class="subs" data-task="${t.id}">${subs.map(s => `<li class="sub ${s.done ? 'is-done' : ''}" data-id="${s.id}"><span class="grip" aria-label="Drag to reorder">${icons.grip}</span>${checkbox(s.done, { cls: 'sm', action: 'sub-toggle', label: s.done ? 'Mark step not done' : 'Mark step done', data: `data-sub="${s.id}"` })}<span class="sub-title">${esc(s.title)}</span></li>`).join('')}</ul>` : ''}
      ${context === 'active' ? `<div class="sub-add"><span class="grip" style="visibility:hidden">${icons.grip}</span><input type="text" class="sub-input" placeholder="Add a step…" data-sub-add="${t.id}" enterkeyhint="done" autocomplete="off" autocapitalize="sentences"></div>` : ''}
      ${notes ? `<div class="task-notes">${notes}</div>` : ''}
      ${deps.length ? `<div class="deps">${deps.map(d => `<button type="button" class="badge dep" data-action="dep-jump" data-dep="${d.id}">${icon('link')}${d.done ? 'Done · ' : 'Waits on · '}${esc(d.title)}</button>`).join('')}</div>` : ''}
      <div class="task-actions">${actions}<span class="spacer"></span><button type="button" class="b3 sm graphite icon" data-action="more" aria-label="More actions">${icons.more}</button></div>
    </div></div></div>
  </article>`;
}

const section = (title, tasks, { hot = false, meta = '', empty = '', neon = false, today = todayISO(), context = 'active' } = {}) =>
  `<section class="section"><div class="section-head"><h2 class="${hot ? 'hot' : ''}">${esc(title)} <span class="n">${tasks.length}</span></h2>${meta ? `<span class="meta">${meta}</span>` : ''}</div>
   <div class="panel glass ${neon ? 'neon' : ''}">${tasks.length ? tasks.map(t => taskRow(t, { today, context })).join('') : empty}</div></section>`;

const emptyState = (title, body, iconName = 'check') => `<div class="empty"><div class="orb">${icons[iconName]}</div><h3>${esc(title)}</h3><p>${body}</p></div>`;

// ---------- Today ----------
export function renderToday() {
  const today = todayISO();
  const active = store.activeTasks();
  const overdue = active.filter(t => t.targetDate && t.targetDate < today).sort(byDate);
  const todays = active.filter(t => onDate(t, today)).sort(byDate);
  const horizon = addDays(today, 7);
  const upcoming = active.filter(t => t.targetDate && t.targetDate > today && t.targetDate <= horizon).sort(byDate);
  const later = active.filter(t => t.targetDate && t.targetDate > horizon).sort(byDate);
  const unscheduled = active.filter(t => !t.targetDate);
  let html = '';
  if (overdue.length) html += section('Overdue', overdue, { hot: true, today });
  const nextUp = upcoming[0] || later[0];
  const emptyToday = !active.length
    ? emptyState('All clear', 'Nothing on the runway. Tap + to add a task.', 'sparkle')
    : emptyState(overdue.length ? 'Nothing else due today' : 'Nothing due today', nextUp ? `Next up: ${esc(nextUp.title)} · ${esc(dueLabel(nextUp, today))}` : unscheduled.length ? `${unscheduled.length} unscheduled task${unscheduled.length === 1 ? '' : 's'} in the plan.` : 'Enjoy the quiet.');
  html += section('Today', todays, { today, neon: true, empty: emptyToday });
  if (upcoming.length) html += section('Next 7 days', upcoming, { today });
  else if (later.length) html += section('Next up', later.slice(0, 3), { today, meta: later.length > 3 ? `${later.length - 3} more in plan` : '' });
  if (unscheduled.length) html += `<section class="section"><div class="section-head"><h2>Unscheduled <span class="n">${unscheduled.length}</span></h2><button type="button" class="linkish" data-action="nav" data-view="all" data-unscheduled="1">Open in plan</button></div></section>`;
  return html;
}

// ---------- Schedule ----------
function tasksOn(d, active) { return active.filter(t => onDate(t, d)).sort((a, b) => (a.hardDeadline === b.hardDeadline ? 0 : a.hardDeadline ? -1 : 1) || byDate(a, b)); }

export function renderSchedule() {
  const today = todayISO();
  const active = store.activeTasks();
  const sel = app.schedule.selected;
  const ws = weekStart(sel), we = addDays(ws, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const groups = store.groups();
  const planGroup = groups.find(g => g.start && g.end && g.start <= we && g.end >= ws);
  const strip = days.map(d => {
    const ts = tasksOn(d, active);
    const colors = [...new Set(ts.map(t => store.category(t.categoryId)?.color || '#6b7280'))].slice(0, 3);
    const w = windowFor(d);
    return `<button type="button" class="day ${d === today ? 'is-today' : ''} ${d === sel ? 'is-sel' : ''} ${w ? 'is-prot' : ''} ${isDeparture(d) ? 'is-dep' : ''} ${d < today ? 'is-past' : ''}" data-action="day" data-date="${d}" aria-label="${attr(fmtLong(d))}, ${ts.length} tasks" ${d === sel ? 'aria-pressed="true"' : ''}>
      <span class="dow">${esc(fmtDow(d)).slice(0, 3)}</span><span class="num">${parseISO(d).getDate()}</span><span class="dots">${colors.map(c => `<i style="--c:${c}"></i>`).join('')}</span></button>`;
  }).join('');
  const title = app.schedule.mode === 'week' ? `${fmtShort(ws)} – ${fmtShort(we)}` : fmtLong(sel);
  let html = `<div class="sched-bar">
      <div class="sched-title">${esc(title)}${planGroup ? `<small>${esc(planGroup.name)} · ${esc(fmtShort(planGroup.start))} – ${esc(fmtShort(planGroup.end))}</small>` : ''}</div>
      <div class="row gap">
        <button type="button" class="b3 xs graphite icon" data-action="sched-prev" aria-label="Previous">${icons.chevronLeft}</button>
        <button type="button" class="b3 xs graphite" data-action="sched-today">Today</button>
        <button type="button" class="b3 xs graphite icon" data-action="sched-next" aria-label="Next">${icons.chevronRight}</button>
      </div></div>
    <div class="daystrip">${strip}</div>
    <div class="row between" style="padding:0 2px 8px">
      <div class="seg"><button type="button" class="seg-btn ${app.schedule.mode === 'week' ? 'is-active' : ''}" data-action="sched-mode" data-mode="week">Week</button><button type="button" class="seg-btn ${app.schedule.mode === 'day' ? 'is-active' : ''}" data-action="sched-mode" data-mode="day">Day</button></div>
      ${planGroup?.focus ? `<span class="meta" style="font-size:12px;color:var(--text-3);text-align:right;max-width:55%">${esc(planGroup.focus)}</span>` : ''}
    </div>`;

  const dayBlock = (d, { showEmpty }) => {
    const ts = tasksOn(d, active);
    const w = windowFor(d), dep = isDeparture(d);
    if (!ts.length && !showEmpty && !w && !dep) return `<div class="dayhead"><h3><span class="d">${esc(fmtDow(d))} ${parseISO(d).getDate()}</span></h3></div><div class="ghost">—</div>`;
    return `<div class="dayhead"><h3 class="${d === today ? 'is-today' : ''}">${esc(fmtDow(d))} ${parseISO(d).getDate()}${d === today ? '<span class="d">· Today</span>' : ''}</h3>
        ${dep ? `<span class="prot dep">${icon('plane')}Departure</span>` : w ? `<span class="prot">${icon('warning')}${esc(w.label)}</span>` : ''}</div>
      ${ts.length ? `<div class="panel glass">${ts.map(t => taskRow(t, { today })).join('')}</div>` : `<div class="ghost">${dep ? 'Travel day.' : w ? 'Kept light on purpose.' : 'Nothing scheduled.'}</div>`}`;
  };

  if (app.schedule.mode === 'week') {
    html += days.map(d => dayBlock(d, { showEmpty: false })).join('');
  } else {
    if (sel === today) { const od = active.filter(t => t.targetDate && t.targetDate < today).sort(byDate); if (od.length) html += section('Overdue', od, { hot: true, today }); }
    html += dayBlock(sel, { showEmpty: true });
  }
  const unscheduled = active.filter(t => !t.targetDate);
  if (unscheduled.length) {
    const closed = app.all.closed.has('__unscheduled');
    html += `<button type="button" class="group-head ${closed ? 'is-closed' : ''}" data-action="group-toggle" data-group="__unscheduled"><h3>Unscheduled <span class="d">${unscheduled.length}</span></h3><span class="chev">${icons.chevron}</span></button>
      ${closed ? '' : `<div class="panel glass">${unscheduled.map(t => taskRow(t, { today })).join('')}</div>`}`;
  }
  return html;
}

// ---------- Plan (All) ----------
function matches(t, q) {
  if (!q) return true;
  const hay = [t.title, t.notes, t.deadlineNote, store.category(t.categoryId)?.name, ...store.liveSubtasks(t).map(s => s.title)].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}
export function filteredTasks() {
  const f = app.all;
  let list = f.status === 'active' ? store.activeTasks() : f.status === 'completed' ? store.completedTasks() : store.tasks({ all: true }).filter(t => !t.archived);
  if (f.category !== 'all') list = list.filter(t => (t.categoryId || 'none') === f.category);
  if (f.priorities.length) list = list.filter(t => f.priorities.includes(t.priority));
  if (f.fixedOnly) list = list.filter(t => t.hardDeadline);
  if (f.unscheduledOnly) list = list.filter(t => !t.targetDate);
  if (f.q) list = list.filter(t => matches(t, f.q));
  return list;
}
export function activeFilterCount() { const f = app.all; return (f.status !== 'active') + (f.priorities.length > 0) + f.fixedOnly + f.unscheduledOnly + (f.groupBy !== 'plan'); }

export function renderAllList() {
  const today = todayISO();
  const f = app.all;
  const list = filteredTasks();
  const context = f.status === 'completed' ? 'completed' : 'active';
  const sortable = f.reorder && f.groupBy !== 'date' && !f.q;
  if (!list.length) return emptyState(f.q ? 'No matches' : 'Nothing here', f.q ? 'Try a different word, or clear the search.' : 'Adjust the filters or add a task with +.', f.q ? 'search' : 'inbox');
  const block = (key, name, dates, focus, tasks) => {
    if (!tasks.length) return '';
    const closed = f.closed.has(key);
    return `<section class="section" style="margin-top:4px"><button type="button" class="group-head ${closed ? 'is-closed' : ''}" data-action="group-toggle" data-group="${attr(key)}"><h3>${esc(name)}${dates ? `<span class="d">${esc(dates)}</span>` : ''}<span class="d">${tasks.length}</span></h3><span class="chev">${icons.chevron}</span></button>
      ${closed ? '' : `${focus ? `<div class="group-focus">${esc(focus)}</div>` : ''}<div class="panel glass ${sortable ? 'sortable' : ''}" data-sort-group="${attr(key)}">${tasks.map(t => taskRow(t, { today, context, sortable })).join('')}</div>`}</section>`;
  };
  if (f.groupBy === 'plan') {
    const groups = store.groups();
    let html = groups.map(g => block(g.id, g.name, g.start && g.end ? `${fmtShort(g.start)} – ${fmtShort(g.end)}` : '', g.focus, list.filter(t => t.groupId === g.id))).join('');
    html += block('__nogroup', 'No plan group', '', '', list.filter(t => !t.groupId || !groups.some(g => g.id === t.groupId)));
    return html;
  }
  if (f.groupBy === 'category') {
    let html = store.categories().map(c => block(c.id, c.name, '', '', list.filter(t => t.categoryId === c.id))).join('');
    html += block('__nocat', 'Uncategorized', '', '', list.filter(t => !store.category(t.categoryId)));
    return html;
  }
  // by date
  const sorted = list.slice().sort(byDate);
  const buckets = [['Overdue', t => t.targetDate && t.targetDate < today], ['This week', t => t.targetDate && t.targetDate >= today && t.targetDate <= addDays(weekStart(today), 6)], ['Later', t => t.targetDate && t.targetDate > addDays(weekStart(today), 6)], ['Unscheduled', t => !t.targetDate]];
  return buckets.map(([name, fn]) => block('d_' + name, name, '', '', sorted.filter(fn))).join('');
}

export function renderAll() {
  const f = app.all;
  const counts = {};
  for (const t of (f.status === 'completed' ? store.completedTasks() : store.activeTasks())) counts[t.categoryId || 'none'] = (counts[t.categoryId || 'none'] || 0) + 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const chips = [`<button type="button" class="chip plain ${f.category === 'all' ? 'is-on neutral' : ''}" data-action="chip-cat" data-cat="all">All <span class="n">${total}</span></button>`]
    .concat(store.categories().map(c => `<button type="button" class="chip ${f.category === c.id ? 'is-on' : ''}" style="--c:${attr(c.color)}" data-action="chip-cat" data-cat="${c.id}">${catTile(c, 'xs')}${esc(c.name)}${counts[c.id] ? `<span class="n">${counts[c.id]}</span>` : ''}</button>`));
  if (counts.none) chips.push(`<button type="button" class="chip ${f.category === 'none' ? 'is-on neutral' : ''}" data-action="chip-cat" data-cat="none">Uncategorized <span class="n">${counts.none}</span></button>`);
  const nf = activeFilterCount();
  return `<div class="search">${icon('search')}<input type="search" id="search" class="search-input" placeholder="Search tasks and steps" value="${attr(f.q)}" autocomplete="off" enterkeyhint="search">${f.q ? `<button type="button" class="b3 xs graphite icon clear" data-action="clear-search" aria-label="Clear search">${icons.x}</button>` : ''}</div>
    <div class="chips">${chips.join('')}</div>
    <div class="row between" style="padding:0 4px 6px">
      <div class="row gap">
        <button type="button" class="b3 xs graphite" data-action="filters">${icon('filter')}<span>Filters${nf ? ` · ${nf}` : ''}</span></button>
        <button type="button" class="b3 xs ${f.reorder ? 'cyan' : 'graphite'}" data-action="reorder-toggle" aria-pressed="${f.reorder}">${icon('grip')}<span>${f.reorder ? 'Done' : 'Reorder'}</span></button>
      </div>
      <span class="meta" style="font-size:12px;color:var(--text-3)">${f.groupBy === 'plan' ? 'By plan week' : f.groupBy === 'category' ? 'By category' : 'By date'}</span>
    </div>
    <div id="all-list">${renderAllList()}</div>`;
}

// ---------- Done ----------
export function renderDone() {
  const today = todayISO();
  const done = store.completedTasks();
  const archived = store.archivedTasks();
  const bucket = (t) => { const d = t.completedAt ? toISO(new Date(t.completedAt)) : null; return d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : 'Earlier'; };
  let html = '';
  if (!done.length && !archived.length) html += `<div class="panel glass" style="margin-top:14px">${emptyState('Nothing completed yet', 'Completed tasks land here and can be restored any time.', 'navDone')}</div>`;
  for (const name of ['Today', 'Yesterday', 'Earlier']) {
    const ts = done.filter(t => bucket(t) === name);
    if (ts.length) html += section(name, ts, { today, context: 'completed' });
  }
  if (archived.length) {
    const closed = !app.done.showArchived;
    html += `<section class="section"><button type="button" class="group-head ${closed ? 'is-closed' : ''}" data-action="toggle-archived"><h3>Archived <span class="d">${archived.length}</span></h3><span class="chev">${icons.chevron}</span></button>
      ${closed ? '' : `<div class="panel glass">${archived.map(t => taskRow(t, { today, context: 'archived' })).join('')}</div>`}</section>`;
  }
  return html;
}
