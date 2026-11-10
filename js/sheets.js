// Runway — sheets: add/edit task, reschedule, menus, settings, sync, categories, backup, filters.
import { app, store, sync, windowFor, isDeparture } from './state.js';
import { PRIORITIES, CATEGORY_ICONS, CATEGORY_COLORS } from './store.js';
import { esc, attr, icon, icons, catTile, todayISO, addDays, fmtShort, fmtWeekday, fmtLong, weekStart, timeAgo, openSheet, closeSheet, closeAllSheets, confirmSheet, toast, makeSortable, download, haptic, $, $$ } from './ui.js';

const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : '';
const rerender = () => app.render();

// ---------- form pieces ----------
const categoryPicker = (selected) => `<div class="cat-picker" data-field="categoryId">${store.categories().map(c => `<button type="button" class="cat-opt ${c.id === selected ? 'is-on' : ''}" style="--c:${attr(c.color)}" data-cat="${c.id}">${catTile(c, 'xs')}<span class="nm">${esc(c.name)}</span></button>`).join('')}</div>`;
const prioritySeg = (p) => `<div class="seg wide" data-field="priority">${PRIORITIES.map(x => `<button type="button" class="seg-btn ${x === p ? 'is-active' : ''}" data-val="${x}">${cap(x)}</button>`).join('')}</div>`;
const toggleRow = (name, on, title, desc = '') => `<div class="toggle-row"><div><div class="t">${esc(title)}</div>${desc ? `<div class="d">${esc(desc)}</div>` : ''}</div><button type="button" class="toggle ${on ? 'is-on' : ''}" data-toggle="${name}" role="switch" aria-checked="${on}" aria-label="${attr(title)}"></button></div>`;
const groupSelect = (groupId) => `<select class="in" name="groupId"><option value="">No plan group</option>${store.groups().map(g => `<option value="${g.id}" ${g.id === groupId ? 'selected' : ''}>${esc(g.name)}${g.start ? ` · ${fmtShort(g.start)} – ${fmtShort(g.end)}` : ''}</option>`).join('')}</select>`;
const editSubRow = (s = {}) => `<li class="edit-sub" data-id="${attr(s.id || '')}"><span class="grip">${icons.grip}</span><input type="text" class="in sm" value="${attr(s.title || '')}" placeholder="Step" autocomplete="off"><button type="button" class="del" aria-label="Remove step">${icons.x}</button></li>`;
const subtasksEditor = (list) => `<ul class="edit-subs" id="edit-subs">${list.map(editSubRow).join('')}</ul><div class="row" style="margin-top:6px"><button type="button" class="b3 xs graphite" data-add-sub>${icon('plus')}<span>Add step</span></button></div>`;
const dateQuick = (today) => `<div class="quick">${[['Today', today], ['Tomorrow', addDays(today, 1)], ['Next Mon', addDays(weekStart(today), 7)], ['No date', '']].map(([l, v]) => `<button type="button" class="chip plain" data-quick="${v}">${l}</button>`).join('')}</div>`;

function wireForm(sheet) {
  sheet.addEventListener('click', (e) => {
    const opt = e.target.closest('.cat-opt'); if (opt) { $$('.cat-opt', opt.parentElement).forEach(x => x.classList.remove('is-on')); opt.classList.add('is-on'); haptic(); return; }
    const seg = e.target.closest('.seg[data-field] .seg-btn'); if (seg) { $$('.seg-btn', seg.parentElement).forEach(x => x.classList.remove('is-active')); seg.classList.add('is-active'); seg.parentElement.dispatchEvent(new CustomEvent('segchange', { bubbles: true, detail: seg.dataset.val })); return; }
    const tg = e.target.closest('.toggle[data-toggle]'); if (tg) { tg.classList.toggle('is-on'); tg.setAttribute('aria-checked', tg.classList.contains('is-on')); tg.dispatchEvent(new CustomEvent('togglechange', { bubbles: true, detail: tg.classList.contains('is-on') })); haptic(); return; }
    const add = e.target.closest('[data-add-sub]'); if (add) { const ul = $('#edit-subs', sheet); ul.insertAdjacentHTML('beforeend', editSubRow()); ul.lastElementChild.querySelector('input').focus(); return; }
    const del = e.target.closest('.edit-sub .del'); if (del) { del.closest('.edit-sub').remove(); return; }
    const q = e.target.closest('[data-quick]'); if (q) { const inp = $('[name=targetDate]', sheet); inp.value = q.dataset.quick; inp.dispatchEvent(new Event('change', { bubbles: true })); $$('[data-quick]', sheet).forEach(x => x.classList.toggle('is-on', x === q)); return; }
  });
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.edit-sub input')) { e.preventDefault(); const ul = $('#edit-subs', sheet); ul.insertAdjacentHTML('beforeend', editSubRow()); ul.lastElementChild.querySelector('input').focus(); }
    if (e.key === 'Enter' && e.target.matches('input[name=title]')) { e.preventDefault(); $('[data-submit]', sheet)?.click(); }
  });
  const subs = $('#edit-subs', sheet);
  if (subs) makeSortable(subs, { itemSelector: '.edit-sub', handleSelector: '.grip', onDrop: () => {} });
}
const readSubs = (sheet) => $$('.edit-sub', sheet).map(li => ({ id: li.dataset.id || null, title: li.querySelector('input').value }));
function readForm(sheet) {
  const v = (n) => $(`[name=${n}]`, sheet)?.value ?? '';
  const on = (n) => $(`.toggle[data-toggle=${n}]`, sheet)?.classList.contains('is-on') ?? false;
  const spans = on('spans');
  return {
    title: v('title').trim(), categoryId: $('.cat-opt.is-on', sheet)?.dataset.cat || null,
    priority: $('.seg[data-field=priority] .seg-btn.is-active', sheet)?.dataset.val || 'normal',
    targetDate: v('targetDate') || null, startDate: spans && v('targetDate') ? (v('startDate') || null) : null,
    hardDeadline: on('hard'), deadlineNote: v('deadlineNote').trim() || null, notes: v('notes').trim(), groupId: v('groupId') || null,
    timeBlock: on('fullday') ? 'full-day' : null,
  };
}
const windowHint = (date) => { if (!date) return ''; const w = windowFor(date); if (isDeparture(date)) return `<span style="color:var(--magenta)">${esc(fmtWeekday(date))} is departure day.</span>`; return w ? `<span style="color:var(--amber)">${esc(fmtWeekday(date))} is inside “${esc(w.label)}” (${esc(fmtShort(w.start))} – ${esc(fmtShort(w.end))}). Keep it light.</span>` : ''; };

// ---------- add ----------
export function openAddSheet(defaults = {}) {
  const today = todayISO();
  const d = { categoryId: store.categories()[0]?.id || null, targetDate: null, priority: 'normal', groupId: null, ...defaults };
  openSheet(`
    <label class="field"><span>Task</span><input class="in" name="title" placeholder="What needs doing?" autocomplete="off" autocapitalize="sentences" autofocus></label>
    <div class="field"><span>Category</span>${categoryPicker(d.categoryId)}</div>
    <div class="field"><span>Target date</span>${dateQuick(today)}<div class="row gap"><input type="date" class="in" name="targetDate" value="${attr(d.targetDate || '')}"></div><div class="hint" id="date-hint" style="margin-top:8px">${windowHint(d.targetDate)}</div></div>
    <button type="button" class="b3 xs graphite" data-more>${icon('chevron')}<span>More details</span></button>
    <div id="more" hidden style="margin-top:14px">
      <div class="field"><span>Priority</span>${prioritySeg(d.priority)}</div>
      ${toggleRow('hard', false, 'Fixed deadline', 'A real deadline, not a planning target.')}
      <label class="field" style="margin-top:8px"><span>Plan group</span>${groupSelect(d.groupId)}</label>
      <label class="field"><span>Notes</span><textarea class="in" name="notes" placeholder="Context, links, constraints…"></textarea></label>
      <div class="field"><span>Steps</span>${subtasksEditor([])}</div>
    </div>
    <div class="sheet-foot" style="margin-top:16px"><button type="button" class="b3 coral wide" data-submit>${icon('plus')}<span>Add task</span></button></div>
  `, { title: 'New task', onMount: (sheet, ctx) => {
    wireForm(sheet);
    setTimeout(() => $('[name=title]', sheet)?.focus(), 80);
    $('[data-more]', sheet).addEventListener('click', (e) => { const m = $('#more', sheet); m.hidden = !m.hidden; e.currentTarget.querySelector('span').textContent = m.hidden ? 'More details' : 'Fewer details'; });
    $('[name=targetDate]', sheet).addEventListener('change', (e) => { $('#date-hint', sheet).innerHTML = windowHint(e.target.value); });
    $('[data-submit]', sheet).addEventListener('click', () => {
      const f = readForm(sheet);
      if (!f.title) { $('[name=title]', sheet).focus(); return; }
      const t = store.addTask({ ...f, subtasks: readSubs(sheet) });
      app.expanded.add(t.id);
      ctx.close(); haptic();
      toast(`Added “${t.title}”`);
    });
  } });
}

// ---------- edit ----------
export function openEditSheet(id) {
  const t = store.task(id); if (!t) return;
  const others = store.activeTasks().filter(x => x.id !== id);
  const depChips = () => (t.dependsOn || []).map(d => store.task(d)).filter(Boolean).map(d => `<span class="badge dep" data-dep="${d.id}">${icon('link')}${esc(d.title)}<button type="button" class="dep-x" aria-label="Remove dependency" style="margin-left:4px;color:inherit">${icons.x}</button></span>`).join('');
  let deps = [...(t.dependsOn || [])];
  openSheet(`
    <label class="field"><span>Task</span><input class="in" name="title" value="${attr(t.title)}" autocomplete="off"></label>
    <div class="field"><span>Category</span>${categoryPicker(t.categoryId)}</div>
    <div class="field"><span>Target date</span><div class="grid2"><input type="date" class="in" name="targetDate" value="${attr(t.targetDate || '')}"><button type="button" class="b3 graphite" data-cleardate>No date</button></div><div class="hint" id="date-hint" style="margin-top:8px">${windowHint(t.targetDate)}</div></div>
    ${toggleRow('spans', !!t.startDate, 'Spans several days', 'Show it on every day from a start date to the target.')}
    <label class="field" id="start-field" ${t.startDate ? '' : 'hidden'}><span>Start date</span><input type="date" class="in" name="startDate" value="${attr(t.startDate || '')}"></label>
    ${toggleRow('hard', t.hardDeadline, 'Fixed deadline', 'A real deadline, not a planning target.')}
    <label class="field" style="margin-top:8px"><span>Deadline note</span><input class="in" name="deadlineNote" value="${attr(t.deadlineNote || '')}" placeholder="e.g. Fixed (signing November 18)"></label>
    <div class="field"><span>Priority</span>${prioritySeg(t.priority)}</div>
    ${toggleRow('fullday', t.timeBlock === 'full-day', 'Full-day block', 'Reserve the whole day for this.')}
    <label class="field" style="margin-top:8px"><span>Plan group</span>${groupSelect(t.groupId)}</label>
    <label class="field"><span>Notes</span><textarea class="in" name="notes">${esc(t.notes || '')}</textarea></label>
    <div class="field"><span>Steps</span>${subtasksEditor(store.liveSubtasks(t))}</div>
    <div class="field"><span>Waits on</span><div class="deps" id="deps" style="margin:0 0 8px">${depChips()}</div>
      <select class="in sm" name="dep"><option value="">Add a dependency…</option>${others.map(o => `<option value="${o.id}">${esc(o.title)}</option>`).join('')}</select></div>
    <div class="sheet-foot" style="justify-content:space-between;margin-top:10px"><button type="button" class="b3 ghost" data-delete style="--fg:var(--red)">${icon('trash')}<span>Delete</span></button><button type="button" class="b3 coral" data-submit>${icon('check')}<span>Save</span></button></div>
  `, { title: 'Edit task', onMount: (sheet, ctx) => {
    wireForm(sheet);
    $('[name=targetDate]', sheet).addEventListener('change', (e) => { $('#date-hint', sheet).innerHTML = windowHint(e.target.value); });
    $('[data-cleardate]', sheet).addEventListener('click', () => { $('[name=targetDate]', sheet).value = ''; $('#date-hint', sheet).innerHTML = ''; });
    sheet.addEventListener('togglechange', (e) => { if (e.target.dataset.toggle === 'spans') $('#start-field', sheet).hidden = !e.detail; });
    $('[name=dep]', sheet).addEventListener('change', (e) => { const v = e.target.value; if (v && !deps.includes(v)) { deps.push(v); t.dependsOn = deps; $('#deps', sheet).innerHTML = depChips(); } e.target.value = ''; });
    $('#deps', sheet).addEventListener('click', (e) => { const b = e.target.closest('.dep-x'); if (!b) return; const did = b.closest('[data-dep]').dataset.dep; deps = deps.filter(x => x !== did); t.dependsOn = deps; $('#deps', sheet).innerHTML = depChips(); });
    $('[data-submit]', sheet).addEventListener('click', () => {
      const f = readForm(sheet);
      if (!f.title) { $('[name=title]', sheet).focus(); return; }
      store.updateTask(id, { ...f, dependsOn: deps });
      store.setSubtasks(id, readSubs(sheet));
      ctx.close(); haptic();
      toast('Saved');
    });
    $('[data-delete]', sheet).addEventListener('click', async () => {
      const ok = await confirmSheet({ title: 'Delete task?', body: `“${t.title}” and its ${store.liveSubtasks(t).length} steps will be removed. You can undo this right after.`, confirmLabel: 'Delete', destructive: true });
      if (!ok) return;
      const undo = store.deleteTask(id); ctx.close();
      toast(`Deleted “${t.title}”`, { action: 'Undo', onAction: undo });
    });
  } });
}

// ---------- reschedule ----------
export function openRescheduleSheet(id) {
  const t = store.task(id); if (!t) return;
  const today = todayISO();
  const base = t.targetDate && t.targetDate > today ? t.targetDate : today;
  const quick = [['Tomorrow', addDays(today, 1)], ['+2 days', addDays(base, 2)], ['Next Mon', addDays(weekStart(today), 7)], ['+1 week', addDays(base, 7)], ['Unschedule', '']];
  openSheet(`
    <p class="confirm-body" style="margin-bottom:12px"><b style="color:var(--text)">${esc(t.title)}</b><br><span style="font-size:13.5px">${t.targetDate ? `Currently ${esc(fmtWeekday(t.targetDate))}${t.hardDeadline ? ' · fixed deadline' : ''}` : 'Currently unscheduled'}</span></p>
    <div class="quick">${quick.map(([l, v]) => `<button type="button" class="chip plain" data-pick="${v}">${l}${v ? ` <span class="n">${esc(fmtShort(v))}</span>` : ''}</button>`).join('')}</div>
    <div class="field"><span>Or pick a date</span><div class="grid2"><input type="date" class="in" name="targetDate" value="${attr(t.targetDate || '')}"><button type="button" class="b3 cyan" data-apply>${icon('check')}<span>Apply</span></button></div><div class="hint" id="date-hint" style="margin-top:8px">${windowHint(t.targetDate)}</div></div>
    ${toggleRow('hard', t.hardDeadline, 'Fixed deadline', 'Keeps the lock badge and sorts first on its day.')}
  `, { title: t.targetDate ? 'Reschedule' : 'Schedule', size: 'compact', onMount: (sheet, ctx) => {
    wireForm(sheet);
    const apply = (date) => {
      const hard = $('.toggle[data-toggle=hard]', sheet).classList.contains('is-on');
      const undo = store.reschedule(id, { targetDate: date || null, hardDeadline: hard });
      ctx.close(); haptic();
      toast(date ? `Moved to ${fmtWeekday(date)}` : 'Unscheduled', { action: 'Undo', onAction: undo });
    };
    sheet.addEventListener('click', (e) => { const p = e.target.closest('[data-pick]'); if (p) apply(p.dataset.pick); });
    $('[name=targetDate]', sheet).addEventListener('change', (e) => { $('#date-hint', sheet).innerHTML = windowHint(e.target.value); });
    $('[data-apply]', sheet).addEventListener('click', () => apply($('[name=targetDate]', sheet).value));
    sheet.addEventListener('togglechange', (e) => { if (e.target.dataset.toggle === 'hard') store.updateTask(id, { hardDeadline: e.detail }); });
  } });
}

// ---------- task menu ----------
export function openTaskMenu(id) {
  const t = store.task(id); if (!t) return;
  const items = [];
  if (!t.done && !t.archived) items.push(['edit', 'pencil', 'Edit'], ['reschedule', 'calendar', t.targetDate ? 'Reschedule' : 'Schedule']);
  items.push(['duplicate', 'copy', 'Duplicate'], ['move', 'navAll', 'Move to plan group…']);
  if (t.done) items.push(['restore', 'restore', 'Restore to active']);
  items.push(t.archived ? ['unarchive', 'archive', 'Unarchive'] : ['archive', 'archive', 'Archive']);
  items.push(['delete', 'trash', 'Delete', 'danger']);
  openSheet(`<div class="menu">${items.map(([a, i, l, cls = '']) => `<button type="button" class="menu-item ${cls}" data-menu="${a}">${icon(i)}<span>${l}</span></button>`).join('')}</div>`,
    { title: t.title, size: 'compact', onMount: (sheet, ctx) => {
      sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-menu]'); if (!b) return;
        const a = b.dataset.menu; ctx.close();
        if (a === 'edit') openEditSheet(id);
        else if (a === 'reschedule') openRescheduleSheet(id);
        else if (a === 'duplicate') { const c = store.duplicateTask(id); app.expanded.add(c.id); toast(`Duplicated as “${c.title}”`); }
        else if (a === 'move') openMoveSheet(id);
        else if (a === 'restore') { const undo = store.setTaskDone(id, false); toast(`Restored “${t.title}”`, { action: 'Undo', onAction: undo }); }
        else if (a === 'archive') { const undo = store.setTaskArchived(id, true); toast(`Archived “${t.title}”`, { action: 'Undo', onAction: undo }); }
        else if (a === 'unarchive') { const undo = store.setTaskArchived(id, false); toast(`Unarchived “${t.title}”`, { action: 'Undo', onAction: undo }); }
        else if (a === 'delete') {
          const ok = await confirmSheet({ title: 'Delete task?', body: `“${t.title}” will be removed. You can undo right after.`, confirmLabel: 'Delete', destructive: true });
          if (ok) { const undo = store.deleteTask(id); toast(`Deleted “${t.title}”`, { action: 'Undo', onAction: undo }); }
        }
      });
    } });
}
function openMoveSheet(id) {
  const t = store.task(id); if (!t) return;
  const gs = [{ id: '', name: 'No plan group' }, ...store.groups()];
  openSheet(`<div class="menu">${gs.map(g => `<button type="button" class="menu-item" data-g="${g.id}">${icon((t.groupId || '') === g.id ? 'check' : 'navSchedule')}<span>${esc(g.name)}${g.start ? ` <span style="color:var(--text-3);font-weight:500"> · ${esc(fmtShort(g.start))} – ${esc(fmtShort(g.end))}</span>` : ''}</span></button>`).join('')}</div>`,
    { title: 'Move to plan group', size: 'compact', onMount: (sheet, ctx) => {
      sheet.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; store.updateTask(id, { groupId: b.dataset.g || null }); ctx.close(); toast('Moved'); });
    } });
}

// ---------- filters ----------
export function openFilters() {
  const f = app.all;
  openSheet(`
    <div class="field"><span>Show</span><div class="seg wide" data-field="status">${[['active', 'Active'], ['completed', 'Completed'], ['all', 'All']].map(([v, l]) => `<button type="button" class="seg-btn ${f.status === v ? 'is-active' : ''}" data-val="${v}">${l}</button>`).join('')}</div></div>
    <div class="field"><span>Priority</span><div class="quick" style="margin:0">${PRIORITIES.map(p => `<button type="button" class="chip plain ${f.priorities.includes(p) ? 'is-on neutral' : ''}" data-pri="${p}">${cap(p)}</button>`).join('')}</div></div>
    ${toggleRow('fixed', f.fixedOnly, 'Fixed deadlines only')}
    ${toggleRow('unsched', f.unscheduledOnly, 'Unscheduled only')}
    <div class="field" style="margin-top:10px"><span>Group by</span><div class="seg wide" data-field="groupBy">${[['plan', 'Plan week'], ['category', 'Category'], ['date', 'Date']].map(([v, l]) => `<button type="button" class="seg-btn ${f.groupBy === v ? 'is-active' : ''}" data-val="${v}">${l}</button>`).join('')}</div></div>
    <div class="sheet-foot" style="justify-content:space-between"><button type="button" class="b3 ghost" data-reset>Reset</button><button type="button" class="b3 coral" data-apply>${icon('check')}<span>Apply</span></button></div>
  `, { title: 'Filters', size: 'compact', onMount: (sheet, ctx) => {
    wireForm(sheet);
    sheet.addEventListener('click', (e) => { const p = e.target.closest('[data-pri]'); if (p) p.classList.toggle('is-on'), p.classList.toggle('neutral', p.classList.contains('is-on')); });
    $('[data-reset]', sheet).addEventListener('click', () => { Object.assign(app.all, { status: 'active', priorities: [], fixedOnly: false, unscheduledOnly: false, groupBy: 'plan' }); ctx.close(); rerender(); });
    $('[data-apply]', sheet).addEventListener('click', () => {
      Object.assign(app.all, {
        status: $('.seg[data-field=status] .is-active', sheet).dataset.val,
        priorities: $$('[data-pri].is-on', sheet).map(x => x.dataset.pri),
        fixedOnly: $('.toggle[data-toggle=fixed]', sheet).classList.contains('is-on'),
        unscheduledOnly: $('.toggle[data-toggle=unsched]', sheet).classList.contains('is-on'),
        groupBy: $('.seg[data-field=groupBy] .is-active', sheet).dataset.val,
      });
      ctx.close(); rerender();
    });
  } });
}

// ---------- settings ----------
export function openSettings() {
  const st = sync.status;
  const pill = `<span class="status-pill ${st.state}"><i></i>${{ off: 'Not connected', synced: 'Synced', pending: 'Pending', syncing: 'Syncing', offline: 'Offline', error: 'Error' }[st.state]}</span>`;
  openSheet(`<div class="menu">
      <button type="button" class="menu-item" data-go="sync">${icon('cloud')}<span style="flex:1">Sync with GitHub</span>${pill}</button>
      <button type="button" class="menu-item" data-go="plan">${icon('plane')}<span>Plan dates &amp; protected weeks</span></button>
      <button type="button" class="menu-item" data-go="cats">${icon('navAll')}<span>Categories</span></button>
      <button type="button" class="menu-item" data-go="backup">${icon('download')}<span>Backup, export &amp; import</span></button>
      <button type="button" class="menu-item" data-go="look">${icon('sparkle')}<span>Appearance</span></button>
    </div>
    <p class="hint" style="margin:16px 2px 0">Runway · your data lives in your private GitHub repo and a local copy on this device.</p>`,
    { title: 'Settings', size: 'compact', onMount: (sheet, ctx) => {
      sheet.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (!b) return; ctx.close(); ({ sync: openSyncSheet, plan: openPlanSheet, cats: openCategoriesSheet, backup: openBackupSheet, look: openAppearanceSheet })[b.dataset.go](); });
    } });
}

export function openSyncSheet() {
  const cfg = sync.config;
  const render = () => {
    const st = sync.status;
    const label = { off: 'Not connected', synced: 'Synced', pending: 'Changes waiting', syncing: 'Syncing…', offline: 'Offline', error: 'Error' }[st.state];
    return `
      <div class="row between wrapping" style="margin-bottom:12px"><span class="status-pill ${st.state}"><i></i>${label}</span><span class="kv">Last synced <b>${timeAgo(st.lastSyncedAt)}</b>${store.dirty ? ' · <b style="color:var(--amber)">unsynced edits</b>' : ''}</span></div>
      ${st.state === 'error' ? `<p class="err">${esc(st.message)}</p>` : ''}
      ${sync.enabled ? `
        <div class="setting"><div class="grow"><div class="t">${esc(cfg.owner)}/${esc(cfg.repo)}</div><div class="d">${esc(cfg.path)} on ${esc(cfg.branch)} · token stored only on this device</div></div></div>
        <div class="row gap wrap" style="margin-top:12px">
          <button type="button" class="b3 cyan" data-syncnow>${icon('cloud')}<span>Sync now</span></button>
          <button type="button" class="b3 graphite" data-change>Change repo</button>
          <button type="button" class="b3 ghost" data-disconnect style="--fg:var(--red)">Disconnect</button>
        </div>
        <div id="cfg" hidden style="margin-top:16px">` : `<div id="cfg">`}
        <div class="grid2"><label class="field"><span>Repo owner</span><input class="in" name="owner" value="${attr(cfg.owner)}" autocapitalize="off" autocomplete="off"></label><label class="field"><span>Repo name</span><input class="in" name="repo" value="${attr(cfg.repo)}" autocapitalize="off" autocomplete="off"></label></div>
        <div class="grid2"><label class="field"><span>Branch</span><input class="in" name="branch" value="${attr(cfg.branch)}" autocapitalize="off"></label><label class="field"><span>File</span><input class="in" name="path" value="${attr(cfg.path)}" autocapitalize="off"></label></div>
        <label class="field"><span>${sync.enabled ? 'New token (optional)' : 'Fine-grained personal access token'}</span><input class="in" type="password" name="token" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <p class="hint">Create one at <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>: Repository access → <b>Only select repositories</b> → <b>${esc(cfg.repo)}</b>; Permissions → Repository → <b>Contents: Read and write</b>. Nothing else. The token never leaves this device except to talk to GitHub.</p>
        <div id="cfg-msg"></div>
        <button type="button" class="b3 coral wide" data-connect>${icon('link')}<span>${sync.enabled ? 'Save &amp; test' : 'Connect'}</span></button>
      </div>`;
  };
  const ctx = openSheet(render(), { title: 'Sync with GitHub', onMount: (sheet) => {
    const body = $('.sheet-body', sheet);
    const bind = () => {
      $('[data-syncnow]', sheet)?.addEventListener('click', async () => { await sync.sync('manual'); body.innerHTML = render(); bind(); });
      $('[data-change]', sheet)?.addEventListener('click', () => { $('#cfg', sheet).hidden = !$('#cfg', sheet).hidden; });
      $('[data-disconnect]', sheet)?.addEventListener('click', async () => {
        const ok = await confirmSheet({ title: 'Disconnect GitHub?', body: 'The token is removed from this device. Your tasks stay here and in the repo; nothing is deleted.', confirmLabel: 'Disconnect', destructive: true });
        if (ok) { sync.disconnect(); body.innerHTML = render(); bind(); rerender(); }
      });
      $('[data-connect]', sheet)?.addEventListener('click', async () => {
        const btn = $('[data-connect]', sheet), msg = $('#cfg-msg', sheet);
        const v = (n) => $(`[name=${n}]`, sheet).value.trim();
        const token = v('token');
        if (!sync.enabled && !token) { msg.innerHTML = '<p class="err">Paste a token first.</p>'; return; }
        btn.disabled = true; msg.innerHTML = '<p class="hint">Testing access…</p>';
        const prevToken = sync.token;
        sync.setConfig({ owner: v('owner'), repo: v('repo'), branch: v('branch') || 'main', path: v('path') || 'data.json' });
        if (token) sync.setToken(token);
        try {
          const r = await sync.test();
          msg.innerHTML = `<p class="ok">Connected. ${r.exists ? `Found ${r.tasks} tasks in the repo.` : 'The data file does not exist yet; it will be created on first sync.'}</p>`;
          await sync.sync('manual');
          body.innerHTML = render(); bind(); rerender();
          toast('GitHub sync connected');
        } catch (e) {
          if (token) sync.setToken(prevToken || '');
          msg.innerHTML = `<p class="err">${esc(e.message)}</p>`; btn.disabled = false;
        }
      });
    };
    bind();
  } });
  return ctx;
}

export function openPlanSheet() {
  const m = store.data.meta;
  const winRow = (w = {}) => `<div class="edit-sub" data-id="${attr(w.id || '')}" style="gap:6px"><input class="in sm" name="wl" value="${attr(w.label || '')}" placeholder="Label" style="flex:1.4"><input type="date" class="in sm" name="ws" value="${attr(w.start || '')}"><input type="date" class="in sm" name="we" value="${attr(w.end || '')}"><button type="button" class="del" aria-label="Remove">${icons.x}</button></div>`;
  const grpRow = (g = {}) => `<div class="edit-sub" data-id="${attr(g.id || '')}" style="gap:6px"><input class="in sm" name="gn" value="${attr(g.name || '')}" placeholder="Name" style="flex:1.4"><input type="date" class="in sm" name="gs" value="${attr(g.start || '')}"><input type="date" class="in sm" name="ge" value="${attr(g.end || '')}"><button type="button" class="del" aria-label="Remove">${icons.x}</button></div>`;
  openSheet(`
    <div class="grid2"><label class="field"><span>Departure</span><input type="date" class="in" name="departureDate" value="${attr(m.departureDate || '')}"></label><label class="field"><span>Return</span><input type="date" class="in" name="returnDate" value="${attr(m.returnDate || '')}"></label></div>
    <div class="h3">Protected windows</div><p class="hint">Days to keep light. They show an amber marker in the schedule and a warning when you move a task into them.</p>
    <div id="wins">${(m.protectedWindows || []).map(winRow).join('')}</div>
    <button type="button" class="b3 xs graphite" data-add-win style="margin-top:6px">${icon('plus')}<span>Add window</span></button>
    <div class="h3">Plan groups</div><p class="hint">The week groupings used to organise the plan. Tasks keep their group when dates move.</p>
    <div id="grps">${store.groups().map(grpRow).join('')}</div>
    <button type="button" class="b3 xs graphite" data-add-grp style="margin-top:6px">${icon('plus')}<span>Add group</span></button>
    <div class="sheet-foot" style="margin-top:18px"><button type="button" class="b3 coral" data-save>${icon('check')}<span>Save</span></button></div>
  `, { title: 'Plan dates', onMount: (sheet, ctx) => {
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-add-win]')) $('#wins', sheet).insertAdjacentHTML('beforeend', winRow());
      if (e.target.closest('[data-add-grp]')) $('#grps', sheet).insertAdjacentHTML('beforeend', grpRow());
      const del = e.target.closest('.del'); if (del) del.closest('.edit-sub').remove();
    });
    $('[data-save]', sheet).addEventListener('click', () => {
      const wins = $$('#wins .edit-sub', sheet).map(r => ({ id: r.dataset.id || ('w_' + Math.random().toString(36).slice(2, 8)), label: $('[name=wl]', r).value.trim() || 'Protected', start: $('[name=ws]', r).value || null, end: $('[name=we]', r).value || null, kind: 'low-load' })).filter(w => w.start && w.end);
      store.updateMeta({ departureDate: $('[name=departureDate]', sheet).value || null, returnDate: $('[name=returnDate]', sheet).value || null, protectedWindows: wins });
      const keep = new Set();
      $$('#grps .edit-sub', sheet).forEach((r, i) => {
        const name = $('[name=gn]', r).value.trim(); if (!name) return;
        const patch = { name, start: $('[name=gs]', r).value || null, end: $('[name=ge]', r).value || null, order: i };
        if (r.dataset.id && store.group(r.dataset.id)) { store.updateGroup(r.dataset.id, patch); keep.add(r.dataset.id); }
        else { const g = store.addGroup(patch); store.updateGroup(g.id, { order: i }); keep.add(g.id); }
      });
      for (const g of store.groups()) if (!keep.has(g.id)) store.deleteGroup(g.id);
      ctx.close(); toast('Plan updated');
    });
  } });
}

export function openCategoriesSheet() {
  const counts = {}; for (const t of store.tasks({ all: true })) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
  const row = (c) => `<div class="cat-row" data-id="${c.id}"><span class="grip">${icons.grip}</span>${catTile(c, 'sm')}<span class="nm">${esc(c.name)}</span><span class="cnt">${counts[c.id] || 0}</span><button type="button" class="b3 xs graphite icon" data-edit="${c.id}" aria-label="Edit ${attr(c.name)}">${icons.pencil}</button></div>`;
  openSheet(`<div id="cat-list" class="list-ui">${store.categories().map(row).join('')}</div>
    <div class="row" style="margin-top:10px"><button type="button" class="b3 graphite" data-add>${icon('plus')}<span>Add category</span></button></div>
    <p class="hint" style="margin-top:14px">Drag the handle to reorder. Tap the pencil to rename, recolour, merge or delete.</p>`,
    { title: 'Categories', onMount: (sheet, ctx) => {
      makeSortable($('#cat-list', sheet), { itemSelector: '.cat-row', handleSelector: '.grip', onDrop: (ids) => store.reorderCategories(ids) });
      sheet.addEventListener('click', (e) => {
        const ed = e.target.closest('[data-edit]'); if (ed) { ctx.close(); openCategoryEditSheet(ed.dataset.edit); }
        if (e.target.closest('[data-add]')) { ctx.close(); openCategoryEditSheet(null); }
      });
    } });
}
function openCategoryEditSheet(id) {
  const c = id ? store.category(id) : { name: '', color: CATEGORY_COLORS[store.categories().length % CATEGORY_COLORS.length], icon: 'flag' };
  const others = store.categories().filter(x => x.id !== id);
  openSheet(`
    <label class="field"><span>Name</span><input class="in" name="name" value="${attr(c.name)}" placeholder="Category name" autocomplete="off"></label>
    <div class="field"><span>Colour</span><div class="swatches">${CATEGORY_COLORS.map(col => `<button type="button" class="swatch ${col === c.color ? 'is-on' : ''}" style="--c:${col}" data-color="${col}" aria-label="${col}"></button>`).join('')}</div></div>
    <div class="field"><span>Icon</span><div class="icon-opts">${CATEGORY_ICONS.map(i => `<button type="button" class="icon-opt ${i === c.icon ? 'is-on' : ''}" data-icon="${i}" aria-label="${i}">${icons[i]}</button>`).join('')}</div></div>
    ${id ? `<div class="h3">Merge or delete</div>
      <div class="grid2"><select class="in sm" name="into"><option value="">Choose a category…</option>${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select><button type="button" class="b3 sm graphite" data-merge>Merge into it</button></div>
      <p class="hint" style="margin-top:8px">Merging moves every task in “${esc(c.name)}” to the chosen category and removes “${esc(c.name)}”.</p>
      <button type="button" class="b3 ghost sm" data-delete style="--fg:var(--red)">${icon('trash')}<span>Delete category</span></button>` : ''}
    <div class="sheet-foot" style="margin-top:16px"><button type="button" class="b3 coral" data-save>${icon('check')}<span>${id ? 'Save' : 'Add'}</span></button></div>
  `, { title: id ? 'Edit category' : 'New category', onMount: (sheet, ctx) => {
    sheet.addEventListener('click', async (e) => {
      const sw = e.target.closest('[data-color]'); if (sw) { $$('.swatch', sheet).forEach(x => x.classList.remove('is-on')); sw.classList.add('is-on'); return; }
      const ic = e.target.closest('[data-icon]'); if (ic) { $$('.icon-opt', sheet).forEach(x => x.classList.remove('is-on')); ic.classList.add('is-on'); return; }
      if (e.target.closest('[data-save]')) {
        const f = { name: $('[name=name]', sheet).value.trim(), color: $('.swatch.is-on', sheet)?.dataset.color, icon: $('.icon-opt.is-on', sheet)?.dataset.icon };
        if (!f.name) { $('[name=name]', sheet).focus(); return; }
        if (id) store.updateCategory(id, f); else store.addCategory(f);
        ctx.close(); toast(id ? 'Category saved' : 'Category added');
      }
      if (e.target.closest('[data-merge]')) {
        const into = $('[name=into]', sheet).value; if (!into) return;
        const ok = await confirmSheet({ title: 'Merge categories?', body: `All “${c.name}” tasks move to “${store.category(into).name}”. “${c.name}” is removed.`, confirmLabel: 'Merge' });
        if (ok) { store.mergeCategories(id, into); ctx.close(); toast('Categories merged'); }
      }
      if (e.target.closest('[data-delete]')) {
        const n = store.tasks({ all: true }).filter(t => t.categoryId === id).length;
        const into = $('[name=into]', sheet).value || null;
        const ok = await confirmSheet({ title: 'Delete category?', body: n ? `${n} task${n === 1 ? '' : 's'} will move to ${into ? `“${store.category(into).name}”` : 'Uncategorized'}.` : 'This category has no tasks.', confirmLabel: 'Delete', destructive: true });
        if (ok) { store.deleteCategory(id, into); ctx.close(); toast('Category deleted'); }
      }
    });
  } });
}

export function openBackupSheet() {
  const stamp = new Date().toISOString().slice(0, 10);
  openSheet(`<div class="menu">
      <button type="button" class="menu-item" data-b="json">${icon('download')}<span>Export JSON backup</span></button>
      <button type="button" class="menu-item" data-b="md">${icon('download')}<span>Export Markdown</span></button>
      <button type="button" class="menu-item" data-b="import">${icon('upload')}<span>Import JSON…</span></button>
      <button type="button" class="menu-item danger" data-b="reset">${icon('warning')}<span>Clear this device's local copy</span></button>
    </div>
    <input type="file" accept="application/json,.json" id="import-file" hidden>
    <p class="hint" style="margin-top:14px">JSON backups contain everything, including completed and archived tasks. Importing shows a preview first and never overwrites newer edits unless you choose Replace.</p>`,
    { title: 'Backup & export', size: 'compact', onMount: (sheet, ctx) => {
      const file = $('#import-file', sheet);
      sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-b]'); if (!b) return;
        const a = b.dataset.b;
        if (a === 'json') download(`runway-backup-${stamp}.json`, store.exportJSON());
        else if (a === 'md') download(`runway-${stamp}.md`, store.exportMarkdown(), 'text/markdown');
        else if (a === 'import') file.click();
        else if (a === 'reset') {
          const ok = await confirmSheet({ title: 'Clear local copy?', body: sync.enabled ? 'Removes tasks stored on this device and reloads them from GitHub. Unsynced edits on this device are lost.' : 'Removes all tasks stored on this device. Without GitHub sync there is no other copy. Export a backup first.', confirmLabel: 'Clear', destructive: true });
          if (ok) { localStorage.removeItem('runway:data'); localStorage.removeItem('runway:dirty'); localStorage.removeItem('runway:syncstate'); location.reload(); }
        }
      });
      file.addEventListener('change', async () => {
        const f = file.files[0]; if (!f) return;
        let incoming; try { incoming = JSON.parse(await f.text()); } catch { toast('That file is not valid JSON', { kind: 'error' }); return; }
        if (!incoming || !Array.isArray(incoming.tasks)) { toast('Not a Runway backup (no tasks array)', { kind: 'error' }); return; }
        const p = store.previewImport(incoming);
        ctx.close();
        openSheet(`<p class="confirm-body"><b style="color:var(--text)">${p.total} tasks</b> in the file · <b style="color:var(--green)">${p.added} new</b> · <b style="color:var(--cyan)">${p.updated} newer than yours</b> · ${p.same} unchanged or older.</p>
          <div class="menu"><button type="button" class="menu-item" data-m="merge">${icon('link')}<span>Merge (keeps newest of each)</span></button><button type="button" class="menu-item danger" data-m="replace">${icon('warning')}<span>Replace everything with the file</span></button></div>`,
          { title: 'Import preview', size: 'compact', onMount: (s2, c2) => {
            s2.addEventListener('click', async (e) => {
              const m = e.target.closest('[data-m]'); if (!m) return;
              if (m.dataset.m === 'merge') { store.importMerge(incoming); c2.close(); toast('Imported and merged'); }
              else { const ok = await confirmSheet({ title: 'Replace all data?', body: 'Your current tasks on this device are replaced by the file. After the next sync the repo matches too.', confirmLabel: 'Replace', destructive: true }); if (ok) { store.importReplace(incoming); c2.close(); toast('Replaced from file'); } }
            });
          } });
      });
    } });
}

export function openAppearanceSheet() {
  openSheet(`${toggleRow('reduce', !!store.prefs.reduceEffects, 'Reduce glass effects', 'Turns off blur and ambient glow for older phones.')}
    <p class="hint" style="margin-top:12px">Runway is dark by design: smoked glass, neon edges and tactile controls.</p>`,
    { title: 'Appearance', size: 'compact', onMount: (sheet) => {
      wireForm(sheet);
      sheet.addEventListener('togglechange', (e) => { if (e.target.dataset.toggle === 'reduce') { store.savePrefs({ reduceEffects: e.detail }); document.documentElement.classList.toggle('html-reduce', e.detail); } });
    } });
}
