// Runway — shared runtime state: the store, the sync engine and transient UI state.
import { store } from './store.js';
import { GitHubSync } from './sync.js';
import { todayISO, inRange } from './ui.js';

store.load();
export { store };
export const sync = new GitHubSync(store);

export const app = {
  view: ['today', 'schedule', 'all', 'done'].includes(store.prefs.lastView) ? store.prefs.lastView : 'today',
  expanded: new Set(),
  schedule: { mode: 'week', selected: todayISO() },
  all: { category: 'all', q: '', status: 'active', priorities: [], fixedOnly: false, unscheduledOnly: false, groupBy: 'plan', reorder: false, closed: new Set() },
  done: { showArchived: false },
  focusSubAdd: null,
  suppressClick: false,
  render: () => {},
};

export const windowFor = (date) => (store.data.meta.protectedWindows || []).find(w => inRange(date, w.start, w.end)) || null;
export const isDeparture = (date) => !!date && store.data.meta.departureDate === date;
export const onDate = (t, d) => !!t.targetDate && (t.targetDate === d || (!!t.startDate && t.startDate <= d && d <= t.targetDate));
export const byDate = (a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999') || (a.order ?? 0) - (b.order ?? 0);
