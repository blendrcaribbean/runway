// Runway — local state, persistence, merge and mutations.
// Data shape: { schema, meta, categories[], groups[], tasks[] }.
// Every entity carries updatedAt (ms) for last-write-wins merging and an
// optional deletedAt tombstone so deletions survive sync and can be undone.

const LS_DATA = 'runway:data';
const LS_PREFS = 'runway:prefs';
const TOMBSTONE_TTL = 30 * 86400000;

export const now = () => Date.now();
export const uid = (prefix) => {
  const r = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  return `${prefix}_${r.slice(0, 12)}`;
};

export const PRIORITIES = ['critical', 'high', 'normal', 'low'];
export const CATEGORY_ICONS = ['briefcase', 'trend', 'gem', 'home', 'car', 'id', 'star', 'wrench', 'cart', 'heart', 'book', 'phone', 'plane', 'flag'];
export const CATEGORY_COLORS = ['#3d8bff', '#ff8a3d', '#ff3fa4', '#8a63ff', '#22d3e6', '#32d583', '#ffb02e', '#ff5a36', '#a3e635', '#f472b6', '#94a3b8'];

// Default categories carry updatedAt 0 so anything already synced always wins.
export const DEFAULT_CATEGORIES = [
  { id: 'c_work',     name: 'Work',                 color: '#3d8bff', icon: 'briefcase', order: 0 },
  { id: 'c_bizdev',   name: 'Business Development', color: '#ff8a3d', icon: 'trend',     order: 1 },
  { id: 'c_opalite',  name: 'Opalite',              color: '#ff3fa4', icon: 'gem',       order: 2 },
  { id: 'c_house',    name: 'House',                color: '#8a63ff', icon: 'home',      order: 3 },
  { id: 'c_vehicles', name: 'Vehicles',             color: '#22d3e6', icon: 'car',       order: 4 },
  { id: 'c_personal', name: 'Personal / Admin',     color: '#32d583', icon: 'id',        order: 5 },
].map(c => ({ ...c, createdAt: 0, updatedAt: 0 }));

export function emptyData() {
  return {
    schema: 1,
    meta: { appName: 'Runway', planningDate: null, departureDate: null, returnDate: null, protectedWindows: [], updatedAt: 0 },
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    groups: [],
    tasks: [],
  };
}

// ---------- merge (pure) ----------
const newer = (a, b) => ((b.updatedAt || 0) > (a.updatedAt || 0) ? b : a);
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || String(a.id).localeCompare(String(b.id));

function mergeById(aList = [], bList = [], mergeItem = newer) {
  const map = new Map();
  for (const x of aList) if (x && x.id) map.set(x.id, x);
  for (const y of bList) {
    if (!y || !y.id) continue;
    const x = map.get(y.id);
    map.set(y.id, x ? mergeItem(x, y) : y);
  }
  return [...map.values()].sort(byOrder);
}

function mergeTask(a, b) {
  const win = newer(a, b), lose = win === a ? b : a;
  return { ...win, subtasks: mergeById(lose.subtasks, win.subtasks, newer) };
}

export function mergeData(a, b) {
  if (!a) return b; if (!b) return a;
  const meta = newer(a.meta || {}, b.meta || {});
  return {
    schema: 1,
    meta: { ...meta },
    categories: mergeById(a.categories, b.categories),
    groups: mergeById(a.groups, b.groups),
    tasks: mergeById(a.tasks, b.tasks, mergeTask),
  };
}

export function canonical(data) {
  const sort = (v) => Array.isArray(v) ? v.map(sort)
    : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = sort(v[k]), o), {})
    : v;
  return JSON.stringify(sort(data));
}

function normalizeTask(t) {
  return {
    id: t.id, title: t.title || 'Untitled', categoryId: t.categoryId ?? null, groupId: t.groupId ?? null,
    targetDate: t.targetDate ?? null, startDate: t.startDate ?? null,
    hardDeadline: !!t.hardDeadline, deadlineNote: t.deadlineNote ?? null,
    priority: PRIORITIES.includes(t.priority) ? t.priority : 'normal',
    notes: t.notes || '', timeBlock: t.timeBlock ?? null, dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
    subtasks: (t.subtasks || []).map((s, i) => ({
      id: s.id, title: s.title || '', done: !!s.done, completedAt: s.completedAt ?? null,
      order: s.order ?? i, createdAt: s.createdAt ?? 0, updatedAt: s.updatedAt ?? 0, ...(s.deletedAt ? { deletedAt: s.deletedAt } : {}),
    })),
    done: !!t.done, completedAt: t.completedAt ?? null, archived: !!t.archived,
    order: t.order ?? 0, createdAt: t.createdAt ?? 0, updatedAt: t.updatedAt ?? 0,
    ...(t.deletedAt ? { deletedAt: t.deletedAt } : {}),
  };
}

export function normalizeData(d) {
  const base = emptyData();
  if (!d || typeof d !== 'object') return base;
  return {
    schema: 1,
    meta: { ...base.meta, ...(d.meta || {}) , protectedWindows: Array.isArray(d.meta?.protectedWindows) ? d.meta.protectedWindows : [] },
    categories: Array.isArray(d.categories) && d.categories.length ? d.categories.slice().sort(byOrder) : base.categories,
    groups: Array.isArray(d.groups) ? d.groups.slice().sort(byOrder) : [],
    tasks: Array.isArray(d.tasks) ? d.tasks.map(normalizeTask).sort(byOrder) : [],
  };
}

// ---------- store ----------
class Store {
  constructor() {
    this.data = emptyData();
    this.prefs = { reduceEffects: false, sync: null, lastView: 'today' };
    this.listeners = new Set();
    this.version = 0;
    this.dirty = false;
  }

  load() {
    try { const raw = localStorage.getItem(LS_DATA); if (raw) this.data = normalizeData(JSON.parse(raw)); } catch (e) { console.warn('Could not read local data', e); }
    try { const raw = localStorage.getItem(LS_PREFS); if (raw) this.prefs = { ...this.prefs, ...JSON.parse(raw) }; } catch (e) { /* ignore */ }
    try { this.dirty = localStorage.getItem('runway:dirty') === '1'; } catch (e) { /* ignore */ }
    this.purgeTombstones();
    return this;
  }

  hasLocalData() { try { return !!localStorage.getItem(LS_DATA); } catch { return false; } }

  persist() {
    try { localStorage.setItem(LS_DATA, JSON.stringify(this.data)); localStorage.setItem('runway:dirty', this.dirty ? '1' : '0'); }
    catch (e) { console.warn('Could not persist', e); }
  }
  savePrefs(patch) { this.prefs = { ...this.prefs, ...patch }; try { localStorage.setItem(LS_PREFS, JSON.stringify(this.prefs)); } catch {} this.emit('prefs'); }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, detail) { for (const fn of this.listeners) fn(type, detail); }

  commit(label, { silent } = {}) {
    this.version++;
    this.dirty = true;
    this.persist();
    if (!silent) this.emit('change', label);
  }
  markSynced(versionAtStart) {
    if (this.version === versionAtStart) { this.dirty = false; this.persist(); }
  }

  // Replace local data after a merge with remote (does not mark dirty by itself).
  adopt(data) {
    this.data = normalizeData(data);
    this.persist();
    this.emit('change', 'sync');
  }

  purgeTombstones() {
    const cutoff = now() - TOMBSTONE_TTL;
    const alive = (x) => !x.deletedAt || x.deletedAt > cutoff;
    this.data.tasks = this.data.tasks.filter(alive).map(t => ({ ...t, subtasks: t.subtasks.filter(alive) }));
    this.data.categories = this.data.categories.filter(alive);
    this.data.groups = this.data.groups.filter(alive);
  }

  // ----- lookups -----
  task(id) { return this.data.tasks.find(t => t.id === id && !t.deletedAt) || null; }
  category(id) { return this.data.categories.find(c => c.id === id && !c.deletedAt) || null; }
  group(id) { return this.data.groups.find(g => g.id === id && !g.deletedAt) || null; }
  categories() { return this.data.categories.filter(c => !c.deletedAt).sort(byOrder); }
  groups() { return this.data.groups.filter(g => !g.deletedAt).sort(byOrder); }
  tasks({ done = false, archived = false, all = false } = {}) {
    return this.data.tasks.filter(t => !t.deletedAt && (all || (t.done === done && t.archived === archived))).sort(byOrder);
  }
  activeTasks() { return this.tasks({ done: false, archived: false }); }
  completedTasks() { return this.data.tasks.filter(t => !t.deletedAt && t.done && !t.archived).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)); }
  archivedTasks() { return this.data.tasks.filter(t => !t.deletedAt && t.archived).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }
  liveSubtasks(t) { return (t.subtasks || []).filter(s => !s.deletedAt).sort(byOrder); }
  progress(t) { const subs = this.liveSubtasks(t); return { done: subs.filter(s => s.done).length, total: subs.length }; }

  // ----- task mutations -----
  addTask(fields) {
    const ts = now();
    const order = Math.min(0, ...this.data.tasks.map(t => t.order)) - 1; // new tasks go to the top of their lists
    const t = normalizeTask({ id: uid('t'), createdAt: ts, updatedAt: ts, order, ...fields });
    t.subtasks = (fields.subtasks || []).filter(s => s.title?.trim()).map((s, i) => ({ id: uid('s'), title: s.title.trim(), done: !!s.done, completedAt: null, order: i, createdAt: ts, updatedAt: ts }));
    this.data.tasks.push(t);
    this.commit('add-task');
    return t;
  }
  updateTask(id, patch) {
    const t = this.task(id); if (!t) return null;
    Object.assign(t, patch, { updatedAt: now() });
    this.commit('update-task');
    return t;
  }
  setTaskDone(id, done) {
    const t = this.task(id); if (!t) return null;
    const ts = now();
    Object.assign(t, { done, completedAt: done ? ts : null, updatedAt: ts });
    this.commit(done ? 'complete-task' : 'reopen-task');
    return () => this.setTaskDone(id, !done);
  }
  setTaskArchived(id, archived) {
    const t = this.task(id); if (!t) return null;
    Object.assign(t, { archived, updatedAt: now() });
    this.commit('archive-task');
    return () => this.setTaskArchived(id, !archived);
  }
  deleteTask(id) {
    const t = this.data.tasks.find(t => t.id === id); if (!t) return null;
    const ts = now();
    Object.assign(t, { deletedAt: ts, updatedAt: ts });
    this.commit('delete-task');
    return () => { const x = this.data.tasks.find(t => t.id === id); if (x) { delete x.deletedAt; x.updatedAt = now(); this.commit('restore-task'); } };
  }
  duplicateTask(id) {
    const t = this.task(id); if (!t) return null;
    const ts = now();
    const copy = normalizeTask({ ...t, id: uid('t'), title: `${t.title} (copy)`, done: false, completedAt: null, archived: false, createdAt: ts, updatedAt: ts, order: t.order + 0.5,
      subtasks: this.liveSubtasks(t).map((s, i) => ({ ...s, id: uid('s'), done: false, completedAt: null, order: i, createdAt: ts, updatedAt: ts })) });
    delete copy.deletedAt;
    this.data.tasks.push(copy);
    this.renumber();
    this.commit('duplicate-task');
    return copy;
  }
  reschedule(id, { targetDate, startDate, hardDeadline }) {
    const t = this.task(id); if (!t) return null;
    const before = { targetDate: t.targetDate, startDate: t.startDate, hardDeadline: t.hardDeadline };
    const patch = { updatedAt: now() };
    if (targetDate !== undefined) patch.targetDate = targetDate;
    if (startDate !== undefined) patch.startDate = startDate;
    if (hardDeadline !== undefined) patch.hardDeadline = !!hardDeadline;
    if (patch.startDate && patch.targetDate && patch.startDate > patch.targetDate) patch.startDate = null;
    if (patch.targetDate === null) patch.startDate = null;
    Object.assign(t, patch);
    this.commit('reschedule');
    return () => this.reschedule(id, before);
  }
  reorderTasks(idsInOrder) {
    // Assign fractional orders so the given ids fall in sequence without touching others.
    const ts = now();
    const set = new Set(idsInOrder);
    const tasks = this.data.tasks.filter(t => !t.deletedAt).sort(byOrder);
    const slots = tasks.filter(t => set.has(t.id)).map(t => t.order);
    idsInOrder.forEach((id, i) => { const t = this.task(id); if (t) { t.order = slots[i] ?? i; t.updatedAt = ts; } });
    this.renumber();
    this.commit('reorder-tasks');
  }
  renumber() {
    // Keep orders integral and stable across the full list.
    const live = this.data.tasks.slice().sort(byOrder);
    live.forEach((t, i) => { if (t.order !== i) t.order = i; });
  }

  // ----- subtasks -----
  addSubtask(taskId, title) {
    const t = this.task(taskId); if (!t || !title.trim()) return null;
    const ts = now();
    const s = { id: uid('s'), title: title.trim(), done: false, completedAt: null, order: Math.max(-1, ...t.subtasks.map(s => s.order)) + 1, createdAt: ts, updatedAt: ts };
    t.subtasks.push(s); t.updatedAt = ts;
    this.commit('add-subtask');
    return s;
  }
  updateSubtask(taskId, subId, patch) {
    const t = this.task(taskId); const s = t?.subtasks.find(s => s.id === subId); if (!s) return null;
    const ts = now();
    Object.assign(s, patch, { updatedAt: ts }); t.updatedAt = ts;
    this.commit('update-subtask');
    return s;
  }
  setSubtaskDone(taskId, subId, done) {
    const t = this.task(taskId); const s = t?.subtasks.find(s => s.id === subId); if (!s) return null;
    const ts = now();
    Object.assign(s, { done, completedAt: done ? ts : null, updatedAt: ts }); t.updatedAt = ts;
    this.commit('toggle-subtask');
    return s;
  }
  deleteSubtask(taskId, subId) {
    const t = this.task(taskId); const s = t?.subtasks.find(s => s.id === subId); if (!s) return null;
    const ts = now();
    Object.assign(s, { deletedAt: ts, updatedAt: ts }); t.updatedAt = ts;
    this.commit('delete-subtask');
    return () => { const x = t.subtasks.find(s => s.id === subId); if (x) { delete x.deletedAt; x.updatedAt = now(); t.updatedAt = x.updatedAt; this.commit('restore-subtask'); } };
  }
  reorderSubtasks(taskId, idsInOrder) {
    const t = this.task(taskId); if (!t) return;
    const ts = now();
    idsInOrder.forEach((id, i) => { const s = t.subtasks.find(s => s.id === id); if (s && s.order !== i) { s.order = i; s.updatedAt = ts; } });
    t.updatedAt = ts;
    this.commit('reorder-subtasks');
  }
  // Replace the whole subtask list from an edit form (keeps ids where given).
  setSubtasks(taskId, list) {
    const t = this.task(taskId); if (!t) return;
    const ts = now();
    const keep = new Set();
    list.forEach((item, i) => {
      if (!item.title.trim()) return;
      let s = item.id && t.subtasks.find(s => s.id === item.id);
      if (s) { if (s.title !== item.title.trim() || s.order !== i || s.deletedAt) { s.title = item.title.trim(); s.order = i; delete s.deletedAt; s.updatedAt = ts; } }
      else { s = { id: uid('s'), title: item.title.trim(), done: false, completedAt: null, order: i, createdAt: ts, updatedAt: ts }; t.subtasks.push(s); }
      keep.add(s.id);
    });
    for (const s of t.subtasks) if (!keep.has(s.id) && !s.deletedAt) { s.deletedAt = ts; s.updatedAt = ts; }
    t.updatedAt = ts;
    this.commit('set-subtasks');
  }

  // ----- categories -----
  addCategory({ name, color, icon }) {
    const ts = now();
    const c = { id: uid('c'), name: name.trim() || 'New category', color: color || CATEGORY_COLORS[this.categories().length % CATEGORY_COLORS.length], icon: icon || 'flag', order: Math.max(-1, ...this.data.categories.map(c => c.order)) + 1, createdAt: ts, updatedAt: ts };
    this.data.categories.push(c);
    this.commit('add-category');
    return c;
  }
  updateCategory(id, patch) {
    const c = this.category(id); if (!c) return null;
    Object.assign(c, patch, { updatedAt: now() });
    this.commit('update-category');
    return c;
  }
  reorderCategories(idsInOrder) {
    const ts = now();
    idsInOrder.forEach((id, i) => { const c = this.category(id); if (c && c.order !== i) { c.order = i; c.updatedAt = ts; } });
    this.commit('reorder-categories');
  }
  // Move every task from `fromId` to `intoId`, then tombstone `fromId`.
  mergeCategories(fromId, intoId) {
    if (fromId === intoId) return;
    const from = this.category(fromId); if (!from) return;
    const ts = now();
    for (const t of this.data.tasks) if (t.categoryId === fromId) { t.categoryId = intoId; t.updatedAt = ts; }
    Object.assign(from, { deletedAt: ts, updatedAt: ts });
    this.commit('merge-categories');
  }
  deleteCategory(id, reassignTo = null) { this.mergeCategories(id, reassignTo); }

  // ----- groups & meta -----
  updateGroup(id, patch) { const g = this.group(id); if (!g) return; Object.assign(g, patch, { updatedAt: now() }); this.commit('update-group'); }
  addGroup({ name, start, end, focus }) {
    const ts = now();
    const g = { id: uid('g'), name: name.trim() || 'New group', start: start || null, end: end || null, focus: focus || '', order: Math.max(-1, ...this.data.groups.map(g => g.order)) + 1, createdAt: ts, updatedAt: ts };
    this.data.groups.push(g); this.commit('add-group'); return g;
  }
  deleteGroup(id) {
    const g = this.group(id); if (!g) return; const ts = now();
    for (const t of this.data.tasks) if (t.groupId === id) { t.groupId = null; t.updatedAt = ts; }
    Object.assign(g, { deletedAt: ts, updatedAt: ts }); this.commit('delete-group');
  }
  updateMeta(patch) { Object.assign(this.data.meta, patch, { updatedAt: now() }); this.commit('update-meta'); }

  // ----- import / export -----
  exportJSON() { return JSON.stringify(this.data, null, 2); }
  previewImport(incoming) {
    const inc = normalizeData(incoming);
    const mine = new Map(this.data.tasks.map(t => [t.id, t]));
    let added = 0, updated = 0, same = 0;
    for (const t of inc.tasks) { const m = mine.get(t.id); if (!m) added++; else if ((t.updatedAt || 0) > (m.updatedAt || 0)) updated++; else same++; }
    return { added, updated, same, total: inc.tasks.length, categories: inc.categories.length };
  }
  importMerge(incoming) { this.data = normalizeData(mergeData(this.data, normalizeData(incoming))); this.commit('import-merge'); }
  importReplace(incoming) { this.data = normalizeData(incoming); this.commit('import-replace'); }

  exportMarkdown() {
    const d = this.data;
    const cat = (id) => this.category(id)?.name || 'Uncategorized';
    const lines = [`# ${d.meta.appName || 'Runway'} — Task Export`, '', `**Exported:** ${new Date().toISOString().slice(0, 10)}  `];
    if (d.meta.departureDate) lines.push(`**Departure:** ${d.meta.departureDate}  `);
    if (d.meta.returnDate) lines.push(`**Return:** ${d.meta.returnDate}  `);
    lines.push('');
    const groups = [...this.groups(), { id: null, name: 'Unscheduled', start: null, end: null }];
    const writeTask = (t) => {
      lines.push(`### ${t.done ? '✅ ' : ''}${t.title}`);
      lines.push(`- **Category:** ${cat(t.categoryId)}`);
      if (t.targetDate) lines.push(`- **Target:** ${t.targetDate}${t.startDate ? ` (from ${t.startDate})` : ''}`);
      lines.push(`- **Priority:** ${t.priority[0].toUpperCase() + t.priority.slice(1)}`);
      if (t.hardDeadline) lines.push(`- **Deadline type:** Fixed${t.deadlineNote ? ` — ${t.deadlineNote}` : ''}`);
      else if (t.deadlineNote) lines.push(`- **Deadline type:** ${t.deadlineNote}`);
      if (t.notes) for (const n of t.notes.split('\n')) lines.push(`- **Note:** ${n}`);
      if (t.dependsOn?.length) lines.push(`- **Dependency:** ${t.dependsOn.map(id => this.task(id)?.title || id).join(', ')}`);
      for (const s of this.liveSubtasks(t)) lines.push(`- [${s.done ? 'x' : ' '}] ${s.title}`);
      lines.push('');
    };
    for (const g of groups) {
      const ts = this.data.tasks.filter(t => !t.deletedAt && !t.archived && (t.groupId || null) === g.id).sort(byOrder);
      if (!ts.length) continue;
      lines.push(`## ${g.name}${g.start ? ` — ${g.start} to ${g.end}` : ''}`, '');
      if (g.focus) lines.push(`**Focus:** ${g.focus}`, '');
      ts.forEach(writeTask);
    }
    const archived = this.archivedTasks();
    if (archived.length) { lines.push('## Archived', ''); archived.forEach(writeTask); }
    return lines.join('\n');
  }
}

export const store = new Store();
