# Runway

A quiet, tactile personal task app for the weeks before departure. Main projects show as single rows; tap one to see its steps. Dark smoked glass, neon edges, and physical 3D controls.

**Live app:** https://blendrcaribbean.github.io/runway/
**Data:** your private repo `runway-data` (every save is a commit).

## How it works

- **Static PWA** on GitHub Pages: plain HTML, CSS and JavaScript modules, no build step, no framework.
- **Storage:** a local copy in the browser plus `data.json` in the private `runway-data` repo, written through the GitHub Contents API with a fine-grained token that you paste once per device.
- **Sync:** on open, when the app comes back to the foreground, after every change (debounced), and every 90 s while visible. Local and remote are merged item by item, newest edit wins, deletions carry a tombstone so they survive sync and can be undone. Write conflicts are detected by the file's SHA and retried after a merge.
- **Offline:** the app shell is cached by a service worker; edits queue locally and sync when back online. The cloud icon shows the state (green synced, amber pending, grey offline, red error). Tap it for details.

## Set up a device

1. Open the live URL. On iPhone, Share → **Add to Home Screen**. On Android/desktop Chrome, use the install prompt.
2. Create a token at <https://github.com/settings/personal-access-tokens/new>: Resource owner = your account; Repository access = **Only select repositories → runway-data**; Permissions → Repository → **Contents: Read and write**. Nothing else. Pick the longest expiry you are comfortable with.
3. In the app: cloud icon → paste the token → **Connect**. The owner/repo fields are prefilled. The token is stored only in that browser.

## Day to day

- **Today**: overdue, due today, next 7 days. Tap a row to expand its steps; the round button on the left completes the whole project (undo from the toast or restore from Done).
- **Schedule**: week strip with task dots, protected days (amber) and departure (magenta). Week or Day mode. Reschedule from the row's button or the ⋯ menu.
- **Plan**: everything by plan week, category chips, filters, search, Reorder mode (drag the handle).
- **Done**: completed and archived tasks, restore any time.
- `+` adds a task (title, category, date; more details optional). Keyboard: `n` new, `/` search, `1`–`4` switch views.
- Settings (gear): Sync, Plan dates & protected windows, Categories (rename, recolour, reorder, merge, delete), Backup (JSON/Markdown export, JSON import with preview), Appearance.

## Deploying changes

Push to `main`; GitHub Pages serves the root of this repo. Bump `VERSION` in `sw.js` so installed copies fetch fresh files. Never put task data in this repo: it is public.

## Reseeding

The original schedule lives in `runway-data/source/`; `node scripts/seed.mjs` in that repo regenerates `data.json` with the same stable IDs. Importing that file through Settings → Backup → Import merges by ID without duplicating.
