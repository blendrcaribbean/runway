// Runway — shared UI helpers: escaping, dates, icons, 3D components, toasts, sheets.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = esc;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- dates (local, ISO yyyy-mm-dd) ----------
const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000); // b - a
export const weekStart = (iso) => { const d = parseISO(iso); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toISO(d); }; // Monday
export const inRange = (iso, start, end) => !!iso && (!start || iso >= start) && (!end || iso <= end);

const fmtCache = new Map();
const fmt = (opts) => { const k = JSON.stringify(opts); if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat(undefined, opts)); return fmtCache.get(k); };
export const fmtShort = (iso) => iso ? fmt({ month: 'short', day: 'numeric' }).format(parseISO(iso)) : '';
export const fmtWeekday = (iso) => iso ? fmt({ weekday: 'short', month: 'short', day: 'numeric' }).format(parseISO(iso)) : '';
export const fmtLong = (iso) => iso ? fmt({ weekday: 'long', month: 'long', day: 'numeric' }).format(parseISO(iso)) : '';
export const fmtDow = (iso) => fmt({ weekday: 'short' }).format(parseISO(iso));
export const fmtMonthYear = (iso) => fmt({ month: 'long', year: 'numeric' }).format(parseISO(iso));

export function relativeLabel(iso, today = todayISO()) {
  if (!iso) return 'No date';
  const d = diffDays(today, iso);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d < -1) return `${-d} days overdue`;
  if (d < 7) return fmtDow(iso);
  return fmtShort(iso);
}
export function dueLabel(task, today = todayISO()) {
  if (!task.targetDate) return 'Unscheduled';
  if (task.startDate && task.startDate !== task.targetDate) return `${fmtShort(task.startDate)} – ${fmtShort(task.targetDate)}`;
  return relativeLabel(task.targetDate, today);
}
export function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return 'just now'; if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  return fmtShort(toISO(new Date(ts)));
}

// ---------- icons ----------
const S = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
export const icons = {
  check: S('<path d="M5 12.5l4.2 4.2L19 7.5"/>', 'stroke-width="2.6"'),
  chevron: S('<path d="M6 9l6 6 6-6"/>'),
  chevronLeft: S('<path d="M15 6l-6 6 6 6"/>'),
  chevronRight: S('<path d="M9 6l6 6-6 6"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.4"'),
  minus: S('<path d="M5 12h14"/>'),
  x: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>'),
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  calendar: S('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  lock: S('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
  flag: S('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  undo: S('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
  grip: S('<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>'),
  trash: S('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  pencil: S('<path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/>'),
  copy: S('<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5a2 2 0 012-2h10"/>'),
  archive: S('<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a2 2 0 002 2h10a2 2 0 002-2V9M10 13h4"/>'),
  restore: S('<path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.8 2.8L3 8"/><path d="M3 3v5h5"/>'),
  clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  link: S('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'),
  cloud: S('<path d="M7 18a4.5 4.5 0 01-.6-9 6 6 0 0111.6 1.5A3.8 3.8 0 0117.5 18H7z"/>'),
  download: S('<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>'),
  upload: S('<path d="M12 15V4M7 9l5-5 5 5M4 20h16"/>'),
  more: S('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
  warning: S('<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18.5v.1"/>'),
  sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  sparkle: S('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
  inbox: S('<path d="M4 13l2.5-8h11L20 13v6H4z"/><path d="M4 13h5l1.5 2.5h3L15 13h5"/>'),
  filter: S('<path d="M4 6h16M7 12h10M10 18h4"/>'),
  arrowRight: S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  // nav
  navToday: S('<rect x="3" y="4" width="18" height="17" rx="3.5"/><path d="M3 9h18M8 2.5v3M16 2.5v3"/><path d="M8.5 15l2.3 2.3L16 12.5" stroke-width="2.3"/>'),
  navSchedule: S('<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="16" r="3.5"/><path d="M18 14.5V16l1 1"/>'),
  navAll: S('<rect x="3" y="4" width="7" height="7" rx="2"/><rect x="14" y="4" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
  navDone: S('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5" stroke-width="2.3"/>'),
  // categories
  briefcase: S('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 12h18"/>'),
  trend: S('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  gem: S('<path d="M7 3h10l4 6-9 12L3 9l4-6z"/><path d="M3 9h18M9 3l3 6 3-6M12 9v12"/>'),
  home: S('<path d="M3 11l9-7 9 7v9a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 20v-9z"/><path d="M9.5 21v-7h5v7"/>'),
  car: S('<path d="M4 15l1.6-5.3A2 2 0 017.5 8h9a2 2 0 011.9 1.4L20 15"/><rect x="3" y="15" width="18" height="4" rx="1.5"/><circle cx="7.5" cy="19.5" r="1.5"/><circle cx="16.5" cy="19.5" r="1.5"/>'),
  id: S('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.5-1.6 1.6-2.5 3-2.5s2.5.9 3 2.5M14 10h4M14 14h3"/>'),
  star: S('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  wrench: S('<path d="M14.5 6.5a4 4 0 005.2 5.2L13 18.4a2.2 2.2 0 01-3.1-3.1L16.6 8.6a4 4 0 00-2.1-2.1z"/><path d="M3 21l4.5-4.5"/>'),
  cart: S('<path d="M3 4h2l2.5 11h11L21 7H6.5"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>'),
  heart: S('<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z"/>'),
  book: S('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z"/><path d="M4 19a2 2 0 012-2h13"/>'),
  phone: S('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/>'),
  plane: S('<path d="M2.5 15.5l19-9-5 15-3.5-6.5L2.5 15.5z"/><path d="M13 15l8.5-8.5"/>'),
};
export const icon = (name, cls = '') => `<span class="ic ${cls}">${icons[name] || icons.flag}</span>`;

// ---------- components ----------
export const catTile = (cat, extra = '') => {
  const color = cat?.color || '#6b7280', name = cat?.icon || 'flag';
  return `<span class="tile ${extra}" style="--c:${attr(color)}" aria-hidden="true">${icons[name] || icons.flag}</span>`;
};
export function ring(done, total, size = 30) {
  const r = 11, c = 2 * Math.PI * r, pct = total ? done / total : 0;
  const cls = pct === 1 ? 'is-full' : pct === 0 ? 'is-empty' : '';
  return `<svg class="ring ${cls}" width="${size}" height="${size}" viewBox="0 0 30 30" aria-label="${done} of ${total} steps done">
    <circle class="ring-bg" cx="15" cy="15" r="${r}"/><circle class="ring-fg" cx="15" cy="15" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(2)}" transform="rotate(-90 15 15)"/></svg>`;
}
export const checkbox = (checked, { cls = '', label = 'Mark complete', action = 'toggle', data = '' } = {}) =>
  `<button type="button" class="chk ${checked ? 'is-on' : ''} ${cls}" data-action="${action}" ${data} aria-pressed="${checked}" aria-label="${attr(label)}">${icons.check}</button>`;
export const priorityDot = (p) => p === 'normal' ? '' : `<span class="pri pri-${p}" title="${p} priority"><i></i>${p === 'critical' ? 'Critical' : p === 'high' ? 'High' : 'Low'}</span>`;

// ---------- toast ----------
let toastTimer = null;
export function toast(message, { action, onAction, duration = 6000, kind = '' } = {}) {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  host.innerHTML = '';
  const el = document.createElement('div');
  el.className = `toast glass ${kind}`;
  el.innerHTML = `<span class="toast-msg">${esc(message)}</span>${action ? `<button type="button" class="b3 sm graphite toast-act">${icon('undo')}<span>${esc(action)}</span></button>` : ''}`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  const dismiss = () => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 260); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(dismiss, duration);
  if (action) el.querySelector('.toast-act').addEventListener('click', () => { clearTimeout(toastTimer); dismiss(); onAction?.(); });
  return dismiss;
}

// ---------- sheets (bottom sheet on phone, dialog on desktop) ----------
const sheetStack = [];
export function openSheet(html, { title = '', onMount, onClose, size = '' } = {}) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet glass ${size}" role="dialog" aria-modal="true" ${title ? `aria-label="${attr(title)}"` : ''}>
      <div class="sheet-grip" aria-hidden="true"></div>
      ${title ? `<header class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="b3 icon sm graphite" data-sheet-close aria-label="Close">${icons.x}</button></header>` : ''}
      <div class="sheet-body">${html}</div>
    </div>`;
  document.body.appendChild(back);
  document.body.classList.add('has-sheet');
  const sheet = back.querySelector('.sheet');
  const ctx = { back, sheet, close: () => closeSheet(ctx) , onClose };
  sheetStack.push(ctx);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) ctx.close(); });
  back.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) ctx.close(); });
  const esc_ = (e) => { if (e.key === 'Escape') { ctx.close(); } };
  document.addEventListener('keydown', esc_); ctx.keyHandler = esc_;
  requestAnimationFrame(() => requestAnimationFrame(() => back.classList.add('is-in')));
  onMount?.(sheet, ctx);
  return ctx;
}
export function closeSheet(ctx = sheetStack[sheetStack.length - 1]) {
  if (!ctx) return;
  const i = sheetStack.indexOf(ctx); if (i >= 0) sheetStack.splice(i, 1);
  document.removeEventListener('keydown', ctx.keyHandler);
  ctx.back.classList.remove('is-in');
  setTimeout(() => { ctx.back.remove(); if (!sheetStack.length) document.body.classList.remove('has-sheet'); }, 240);
  ctx.onClose?.();
}
export function closeAllSheets() { while (sheetStack.length) closeSheet(); }

export function confirmSheet({ title, body, confirmLabel = 'Confirm', destructive = false }) {
  return new Promise((resolve) => {
    let decided = false;
    const ctx = openSheet(`<p class="confirm-body">${esc(body)}</p>
      <div class="row gap end">
        <button type="button" class="b3 graphite" data-sheet-close>Cancel</button>
        <button type="button" class="b3 ${destructive ? 'coral' : 'cyan'}" data-confirm>${esc(confirmLabel)}</button>
      </div>`, { title, size: 'compact', onClose: () => { if (!decided) resolve(false); } });
    ctx.sheet.querySelector('[data-confirm]').addEventListener('click', () => { decided = true; resolve(true); ctx.close(); });
  });
}

// ---------- drag to reorder (pointer events; works for touch and mouse) ----------
export function makeSortable(container, { itemSelector, handleSelector, onDrop }) {
  if (!container || container.__sortable) return;
  container.__sortable = true;
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest(handleSelector); if (!handle) return;
    const item = handle.closest(itemSelector); if (!item || !container.contains(item)) return;
    e.preventDefault();
    const startY = e.clientY;
    const originTop = item.getBoundingClientRect().top; // where the item sat when the drag began
    let moved = false, translate = 0;
    item.classList.add('is-dragging');
    item.setPointerCapture?.(e.pointerId);
    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      if (Math.abs(dy) > 3) moved = true;
      // Visual position follows the pointer; the DOM position follows the visual centre.
      const naturalTop = item.getBoundingClientRect().top - translate;
      translate = originTop + dy - naturalTop;
      item.style.transform = `translateY(${translate}px)`;
      const centre = originTop + dy + item.offsetHeight / 2;
      const others = [...container.querySelectorAll(itemSelector)].filter(x => x !== item);
      let before = null;
      for (const o of others) { const r = o.getBoundingClientRect(); if (centre < r.top + r.height / 2) { before = o; break; } }
      if (before !== item.nextElementSibling) {
        container.insertBefore(item, before);
        const nt = item.getBoundingClientRect().top - translate;
        translate = originTop + dy - nt;
        item.style.transform = `translateY(${translate}px)`;
      }
    };
    const onUp = () => {
      item.removeEventListener('pointermove', onMove); item.removeEventListener('pointerup', onUp); item.removeEventListener('pointercancel', onUp);
      item.classList.remove('is-dragging'); item.style.transform = '';
      if (moved) onDrop([...container.querySelectorAll(itemSelector)].map(x => x.dataset.id));
    };
    item.addEventListener('pointermove', onMove); item.addEventListener('pointerup', onUp); item.addEventListener('pointercancel', onUp);
  });
}

export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };
export const download = (filename, text, type = 'application/json') => {
  const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
};
