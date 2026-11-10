// Runway — GitHub-backed sync. The data file lives in a private repo and is
// read/written through the Contents API with optimistic concurrency (sha).
// Local is the working copy; every sync merges local and remote (last write
// wins per item) and pushes only when the merged result differs from remote.
import { mergeData, normalizeData, canonical } from './store.js';

const LS_TOKEN = 'runway:token';
const LS_SYNC = 'runway:syncstate';
export const DEFAULT_SYNC = { owner: 'blendrcaribbean', repo: 'runway-data', path: 'data.json', branch: 'main' };

const b64encode = (str) => {
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

class ConflictError extends Error { constructor() { super('conflict'); this.name = 'ConflictError'; } }

export class GitHubSync {
  constructor(store, { fetch: f = (...a) => fetch(...a) } = {}) {
    this.store = store;
    this.fetch = f;
    this.listeners = new Set();
    this.status = { state: 'off', message: '', lastSyncedAt: null };
    this.timer = null;
    this.inflight = null;
    this.again = false;
    this.state = { sha: null, etag: null };
    try { const raw = localStorage.getItem(LS_SYNC); if (raw) this.state = { ...this.state, ...JSON.parse(raw) }; } catch {}
    try { this.status.lastSyncedAt = this.state.lastSyncedAt || null; } catch {}
  }

  get config() { return { ...DEFAULT_SYNC, ...(this.store.prefs.sync || {}) }; }
  get token() { try { return localStorage.getItem(LS_TOKEN) || ''; } catch { return ''; } }
  get enabled() { return !!this.token; }

  setToken(token) { try { token ? localStorage.setItem(LS_TOKEN, token.trim()) : localStorage.removeItem(LS_TOKEN); } catch {} this.state = { sha: null, etag: null }; this.saveState(); this.setStatus(token ? 'pending' : 'off'); }
  setConfig(cfg) { this.store.savePrefs({ sync: { ...this.config, ...cfg } }); this.state = { sha: null, etag: null }; this.saveState(); }
  disconnect() { this.setToken(''); }

  saveState() { try { localStorage.setItem(LS_SYNC, JSON.stringify(this.state)); } catch {} }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  setStatus(state, message = '') {
    this.status = { ...this.status, state, message };
    if (state === 'synced') { this.status.lastSyncedAt = Date.now(); this.state.lastSyncedAt = this.status.lastSyncedAt; this.saveState(); }
    for (const fn of this.listeners) fn(this.status);
  }

  url(ref) { const { owner, repo, path, branch } = this.config; return `https://api.github.com/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${encodeURIComponent(branch)}` : ''}`; }
  headers(extra = {}) {
    return { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...extra };
  }

  async getRemote({ useEtag = true } = {}) {
    const h = this.headers(useEtag && this.state.etag ? { 'If-None-Match': this.state.etag } : {});
    const res = await this.fetch(this.url(true), { headers: h, cache: 'no-store' });
    if (res.status === 304) return { unchanged: true, sha: this.state.sha };
    if (res.status === 404) return null;
    if (res.status === 401) throw new Error('GitHub rejected the token (401). Check that it is valid and not expired.');
    if (res.status === 403) throw new Error('Access denied (403). The token needs Contents: Read and write on the data repo.');
    if (!res.ok) throw new Error(`GitHub read failed (${res.status}).`);
    const j = await res.json();
    if (j.type !== 'file') throw new Error('The data path is not a file.');
    let data;
    try { data = JSON.parse(b64decode(j.content || '')); } catch { throw new Error('The remote data file is not valid JSON.'); }
    return { sha: j.sha, etag: res.headers.get('etag'), data };
  }

  async putRemote(data, sha) {
    const { branch } = this.config;
    const device = /iPhone|iPad/.test(navigator.userAgent) ? 'phone' : /Android/.test(navigator.userAgent) ? 'android' : 'desktop';
    const body = { message: `Runway sync (${device}) ${new Date().toISOString()}`, content: b64encode(JSON.stringify(data, null, 2) + '\n'), branch };
    if (sha) body.sha = sha;
    const res = await this.fetch(this.url(false), { method: 'PUT', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    if (res.status === 409 || res.status === 422) throw new ConflictError();
    if (res.status === 401) throw new Error('GitHub rejected the token (401).');
    if (res.status === 403) throw new Error('The token cannot write to the data repo (403).');
    if (!res.ok) throw new Error(`GitHub write failed (${res.status}).`);
    const j = await res.json();
    return { sha: j.content?.sha || null };
  }

  schedule(delay = 1500) {
    if (!this.enabled) return;
    this.setStatus('pending');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync('change'), delay);
  }

  async sync(reason = 'manual') {
    if (!this.enabled) { this.setStatus('off'); return this.status; }
    if (this.inflight) { this.again = true; return this.inflight; }
    this.inflight = this._sync(reason).finally(() => {
      this.inflight = null;
      if (this.again) { this.again = false; this.schedule(300); }
    });
    return this.inflight;
  }

  async _sync(reason, attempt = 0) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.setStatus('offline'); return this.status; }
    this.setStatus('syncing');
    const store = this.store;
    const versionAtStart = store.version;
    try {
      const remote = await this.getRemote({ useEtag: !store.dirty && reason !== 'manual' });
      if (remote === null) {
        // No file yet: create it from local.
        const { sha } = await this.putRemote(store.data, null);
        this.state.sha = sha; this.state.etag = null; this.saveState();
        store.markSynced(versionAtStart);
        this.setStatus('synced');
        return this.status;
      }
      if (remote.unchanged) {
        if (!store.dirty) { this.setStatus('synced'); return this.status; }
        // ETag said unchanged but we have local edits: fetch for a fresh sha and merge.
        return this._sync(reason === 'manual' ? 'manual' : 'manual', attempt);
      }
      const remoteData = normalizeData(remote.data);
      const merged = normalizeData(mergeData(remoteData, store.data));
      const changedRemote = canonical(merged) !== canonical(remoteData);
      const changedLocal = canonical(merged) !== canonical(store.data);
      if (changedRemote) {
        const { sha } = await this.putRemote(merged, remote.sha);
        this.state.sha = sha; this.state.etag = null;
      } else {
        this.state.sha = remote.sha; this.state.etag = remote.etag || null;
      }
      this.saveState();
      if (changedLocal) store.adopt(merged); else if (store.version !== versionAtStart) { /* local moved on; leave dirty */ }
      store.markSynced(versionAtStart);
      this.setStatus('synced');
      return this.status;
    } catch (e) {
      if (e instanceof ConflictError && attempt < 3) { this.state.etag = null; return this._sync('manual', attempt + 1); }
      if (e instanceof TypeError) { this.setStatus(navigator.onLine === false ? 'offline' : 'error', 'Network error while contacting GitHub.'); return this.status; }
      this.setStatus('error', e.message || String(e));
      return this.status;
    }
  }

  // Verify a token/config pair without changing anything: reads the file (or confirms the repo exists).
  async test() {
    const r = await this.getRemote({ useEtag: false });
    if (r === null) {
      const { owner, repo } = this.config;
      const res = await this.fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: this.headers() });
      if (res.status === 404) throw new Error(`Repo ${owner}/${repo} not found, or the token has no access to it.`);
      if (!res.ok) throw new Error(`Could not reach the repo (${res.status}).`);
      return { exists: false };
    }
    return { exists: true, tasks: r.data?.tasks?.length ?? 0 };
  }

  start() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this.sync('online'));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.sync('visible'); });
    setInterval(() => { if (document.visibilityState === 'visible') this.sync('interval'); }, 90000);
    if (this.enabled) this.sync('start'); else this.setStatus('off');
  }
}
