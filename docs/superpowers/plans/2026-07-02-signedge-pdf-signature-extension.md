# SignEdge PDF Signature Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Microsoft Edge extension that saves hand-drawn signatures locally and stamps them onto PDFs, then package it for the Edge Add-ons store.

**Architecture:** Vanilla JS + HTML/CSS, no framework. Three libraries vendored locally into `/lib` (no remote code, MV3-compliant): `signature_pad` for drawing, `pdf.js` to render PDF pages for on-screen positioning, and `pdf-lib` to write the signature image into the original PDF bytes so text stays selectable. Signatures live in `chrome.storage.local`. Pure logic (storage wrapper, pixel-trim, coordinate math) is factored into small modules with unit tests; DOM/canvas UI is verified with explicit manual checklists.

**Tech Stack:** Manifest V3, JavaScript (ES modules), `signature_pad@5.1.3`, `pdfjs-dist@6.1.200`, `pdf-lib@1.17.1`, `vitest@4.1.9` (dev), Node 24 / npm 11.

## Global Constraints

- Manifest V3 only. `manifest_version: 3`.
- `permissions` MUST be exactly `["storage"]`. No host permissions. No `tabs` permission (not needed for `chrome.tabs.create`).
- No remote code. All three runtime libraries are vendored into `/lib` and loaded from the extension origin. No CDN `<script src>`.
- No `eval`. pdf.js must be initialized with `isEvalSupported: false`.
- Storage is local-only: `chrome.storage.local`. Never `chrome.storage.sync`, never network.
- Signature record shape (used across tasks): `{ id: string, name: string, dataUrl: string, createdAt: number }`. `dataUrl` is a trimmed transparent PNG (`data:image/png;base64,...`).
- Placement record shape (used across viewer + export): `{ id: string, sigId: string, pageIndex: number, xFrac: number, yFrac: number, wFrac: number, hFrac: number }`. Fractions are of the **displayed (rotated) page**, top-left origin, y-down. `xFrac,yFrac` locate the image's top-left corner; `wFrac,hFrac` are its size.
- Pinned versions: `signature_pad@5.1.3`, `pdfjs-dist@6.1.200`, `pdf-lib@1.17.1`, `vitest@4.1.9`.
- Dev OS is Windows; use forward slashes in code paths (they work in Node on Windows) and PowerShell for shell steps where noted.
- Each task ends with a git commit. Commit messages end with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

```
/package.json              # npm scripts, devDeps (vitest), dep pins for vendoring
/scripts/vendor.mjs        # copies prebuilt lib files from node_modules into /lib
/manifest.json             # MV3 manifest
/popup.html  /pad.html  /viewer.html
/src/
  storage.js               # chrome.storage.local wrapper (pure-ish, unit-tested)
  trim.js                  # trimBounds(imageData) pure pixel math (unit-tested)
  coords.js                # normalized<->viewport helpers (pure, unit-tested)
  popup.js                 # popup UI logic
  pad.js                   # signature pad UI logic
  viewer.js                # PDF render + placement + export
  ui.css                   # shared styles
/lib/                      # vendored: signature_pad, pdf.mjs, pdf.worker.mjs, pdf-lib
/icons/                    # 16/32/48/128 png
/test/
  storage.test.js
  trim.test.js
  coords.test.js
/store/                    # listing text, privacy policy, SUBMISSION.md, screenshots/
/docs/superpowers/         # spec + this plan
```

---

## Task 1: Project scaffold, manifest, vendored libraries, minimal popup

**Files:**
- Create: `package.json`, `scripts/vendor.mjs`, `manifest.json`, `popup.html`, `src/popup.js`, `src/ui.css`, `icons/README.txt`
- Create (temporary placeholder icons): `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, `icons/icon128.png`

**Interfaces:**
- Produces: a loadable unpacked extension; an `npm run vendor` script that populates `/lib`; `npm test` wired to vitest.

- [ ] **Step 1: Initialize npm and install dev + vendor dependencies**

Run (PowerShell, in project root):
```powershell
npm init -y
npm install --save-dev vitest@4.1.9
npm install signature_pad@5.1.3 pdfjs-dist@6.1.200 pdf-lib@1.17.1
```
Expected: `node_modules/` created; `package.json` lists the four packages. (`node_modules/` is already gitignored.)

- [ ] **Step 2: Add npm scripts to `package.json`**

Merge these fields into `package.json` (keep existing generated fields):
```json
{
  "type": "module",
  "scripts": {
    "vendor": "node scripts/vendor.mjs",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Write the vendor script**

Create `scripts/vendor.mjs`:
```js
// Copies the exact prebuilt library files the extension loads at runtime
// from node_modules into /lib, so the shipped extension contains no node_modules
// and no remote code (MV3 requirement).
import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lib = join(root, 'lib');

const files = [
  ['node_modules/signature_pad/dist/signature_pad.umd.min.js', 'lib/signature_pad.umd.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'lib/pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'lib/pdf.worker.min.mjs'],
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'lib/pdf-lib.min.js'],
];

await mkdir(lib, { recursive: true });
for (const [from, to] of files) {
  await copyFile(join(root, from), join(root, to));
  console.log('vendored', to);
}
console.log('done');
```

- [ ] **Step 4: Run the vendor script and verify `/lib` is populated**

Run: `npm run vendor`
Expected output ends with `done` and `/lib` contains: `signature_pad.umd.min.js`, `pdf.min.mjs`, `pdf.worker.min.mjs`, `pdf-lib.min.js`.
If a source path is missing, inspect the package layout:
Run: `node -e "console.log(require('node:fs').readdirSync('node_modules/pdfjs-dist/build'))"`
and adjust the path in `vendor.mjs` to the actual `pdf.min.mjs` / `pdf.worker.min.mjs` filenames, then re-run.

- [ ] **Step 5: Create placeholder icons**

Create four small placeholder PNGs so the manifest loads (replaced with real icons in Task 10). Run (PowerShell):
```powershell
$b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
$bytes = [System.Convert]::FromBase64String($b64)
foreach ($n in 16,32,48,128) { [System.IO.File]::WriteAllBytes("icons/icon$n.png", $bytes) }
Write-Output "placeholder icons written"
```
Also create `icons/README.txt` with the single line: `Placeholder icons — replaced with real branded icons in Task 10.`

- [ ] **Step 6: Write `manifest.json`**

Create `manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "SignEdge — Save & Reuse Signatures",
  "version": "0.1.0",
  "description": "Draw and save signatures once, then stamp them onto any PDF. Everything stays on your device.",
  "permissions": ["storage"],
  "action": {
    "default_title": "SignEdge",
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 7: Write a minimal popup**

Create `src/ui.css`:
```css
:root { font-family: "Segoe UI", system-ui, sans-serif; }
body { margin: 0; }
.popup { width: 320px; padding: 12px; box-sizing: border-box; }
h1 { font-size: 15px; margin: 0 0 8px; }
button { font: inherit; padding: 8px 12px; border: 1px solid #999; border-radius: 6px; background: #f7f7f7; cursor: pointer; }
button.primary { background: #0a6cff; color: #fff; border-color: #0a6cff; }
```

Create `popup.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><link rel="stylesheet" href="src/ui.css"></head>
  <body>
    <div class="popup">
      <h1>SignEdge</h1>
      <p id="status">Loaded.</p>
      <button id="ping" class="primary">It works</button>
    </div>
    <script type="module" src="src/popup.js"></script>
  </body>
</html>
```

Create `src/popup.js`:
```js
document.getElementById('ping').addEventListener('click', () => {
  document.getElementById('status').textContent = 'Popup script is running.';
});
```

- [ ] **Step 8: Manual verification — load unpacked in Edge**

1. Open Edge → `edge://extensions` → enable **Developer mode**.
2. Click **Load unpacked** → select the project root folder.
3. Confirm the extension appears with the SignEdge name and no manifest errors.
4. Click the toolbar icon → the popup opens → click **It works** → status text changes to "Popup script is running."
Expected: all four checks pass, zero errors in the extension card.

- [ ] **Step 9: Commit**

```powershell
git add -A
git commit -m "feat: scaffold MV3 extension with vendored libs and minimal popup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Storage module (chrome.storage.local wrapper)

**Files:**
- Create: `src/storage.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Produces:
  - `listSignatures(): Promise<Signature[]>` — returns array sorted by `createdAt` ascending.
  - `addSignature(name: string, dataUrl: string): Promise<Signature>` — creates `{id,name,dataUrl,createdAt}`, persists, returns it.
  - `renameSignature(id: string, name: string): Promise<void>`
  - `deleteSignature(id: string): Promise<void>`
  - `Signature = { id, name, dataUrl, createdAt }`
  - IDs generated with `crypto.randomUUID()`.

- [ ] **Step 1: Write the failing tests**

Create `test/storage.test.js`:
```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addSignature, listSignatures, renameSignature, deleteSignature } from '../src/storage.js';

function mockChrome() {
  let store = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key) => ({ [key]: store[key] })),
        set: vi.fn(async (obj) => { Object.assign(store, obj); }),
      },
    },
  };
  globalThis.crypto ??= {};
  let n = 0;
  globalThis.crypto.randomUUID = () => `id-${++n}`;
  // deterministic time
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  return () => store;
}

describe('storage', () => {
  beforeEach(() => { mockChrome(); });

  it('starts empty', async () => {
    expect(await listSignatures()).toEqual([]);
  });

  it('adds and lists a signature', async () => {
    const sig = await addSignature('Full', 'data:image/png;base64,AAA');
    expect(sig).toMatchObject({ id: 'id-1', name: 'Full', dataUrl: 'data:image/png;base64,AAA', createdAt: 1000 });
    const all = await listSignatures();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Full');
  });

  it('renames a signature', async () => {
    const sig = await addSignature('Old', 'data:image/png;base64,AAA');
    await renameSignature(sig.id, 'New');
    const all = await listSignatures();
    expect(all[0].name).toBe('New');
  });

  it('deletes a signature', async () => {
    const sig = await addSignature('X', 'data:image/png;base64,AAA');
    await deleteSignature(sig.id);
    expect(await listSignatures()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/storage.test.js`
Expected: FAIL — cannot import `../src/storage.js` (module/exports missing).

- [ ] **Step 3: Implement `src/storage.js`**

```js
// Local-only signature storage. All records live under one key in
// chrome.storage.local. No network, no chrome.storage.sync.
const KEY = 'signedge.signatures';

async function readAll() {
  const res = await chrome.storage.local.get(KEY);
  const list = res[KEY];
  return Array.isArray(list) ? list : [];
}

async function writeAll(list) {
  await chrome.storage.local.set({ [KEY]: list });
}

export async function listSignatures() {
  const list = await readAll();
  return list.slice().sort((a, b) => a.createdAt - b.createdAt);
}

export async function addSignature(name, dataUrl) {
  const sig = { id: crypto.randomUUID(), name, dataUrl, createdAt: Date.now() };
  const list = await readAll();
  list.push(sig);
  await writeAll(list);
  return sig;
}

export async function renameSignature(id, name) {
  const list = await readAll();
  const sig = list.find((s) => s.id === id);
  if (sig) { sig.name = name; await writeAll(list); }
}

export async function deleteSignature(id) {
  const list = await readAll();
  await writeAll(list.filter((s) => s.id !== id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/storage.test.js`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```powershell
git add src/storage.js test/storage.test.js
git commit -m "feat: add local signature storage module with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Pixel-trim core

**Files:**
- Create: `src/trim.js`
- Test: `test/trim.test.js`

**Interfaces:**
- Produces: `trimBounds(imageData): {x, y, w, h}` — given a `{data: Uint8ClampedArray, width, height}` (RGBA), returns the tight bounding box of non-transparent pixels (alpha > 0). Returns `{x:0,y:0,w:0,h:0}` if fully transparent.

- [ ] **Step 1: Write the failing tests**

Create `test/trim.test.js`:
```js
import { describe, expect, it } from 'vitest';
import { trimBounds } from '../src/trim.js';

// build a WxH RGBA buffer, mark listed [x,y] pixels opaque
function make(width, height, pixels) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of pixels) {
    const i = (y * width + x) * 4;
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
  }
  return { data, width, height };
}

describe('trimBounds', () => {
  it('returns zero box for fully transparent input', () => {
    expect(trimBounds(make(4, 4, []))).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('finds a single opaque pixel', () => {
    expect(trimBounds(make(4, 4, [[2, 1]]))).toEqual({ x: 2, y: 1, w: 1, h: 1 });
  });

  it('finds the bounding box of scattered pixels', () => {
    const box = trimBounds(make(10, 10, [[1, 2], [7, 2], [3, 8]]));
    expect(box).toEqual({ x: 1, y: 2, w: 7, h: 7 }); // x:1..7 -> w7, y:2..8 -> h7
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/trim.test.js`
Expected: FAIL — `trimBounds` not exported.

- [ ] **Step 3: Implement `src/trim.js`**

```js
// Pure bounding-box of non-transparent pixels in an RGBA ImageData-like object.
export function trimBounds({ data, width, height }) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/trim.test.js`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```powershell
git add src/trim.js test/trim.test.js
git commit -m "feat: add pixel trim bounds helper with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Signature pad UI (draw → trim → save)

**Files:**
- Create: `pad.html`, `src/pad.js`
- Modify: `src/ui.css` (append pad styles)

**Interfaces:**
- Consumes: `signature_pad` (global `SignaturePad` from `lib/signature_pad.umd.min.js`), `trimBounds` from `src/trim.js`, `addSignature` from `src/storage.js`.
- Produces: `pad.html` — a standalone extension page that saves a trimmed transparent PNG and closes itself.

- [ ] **Step 1: Append pad styles to `src/ui.css`**

```css
.pad-wrap { padding: 16px; max-width: 620px; }
.pad-canvas { border: 1px dashed #888; border-radius: 8px; touch-action: none; width: 600px; height: 240px; background: transparent; }
.pad-row { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
.pad-row input[type=text] { font: inherit; padding: 8px; border: 1px solid #999; border-radius: 6px; flex: 1; }
.pad-hint { color: #666; font-size: 13px; }
```

- [ ] **Step 2: Write `pad.html`**

```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><link rel="stylesheet" href="src/ui.css"></head>
  <body>
    <div class="pad-wrap">
      <h1>New signature</h1>
      <p class="pad-hint">Draw your signature below. Use a pen, finger, or mouse.</p>
      <canvas id="pad" class="pad-canvas" width="1200" height="480"></canvas>
      <div class="pad-row">
        <input id="name" type="text" placeholder="Name (e.g. Full signature)" />
        <button id="clear">Clear</button>
        <button id="save" class="primary">Save</button>
      </div>
      <p id="err" class="pad-hint" style="color:#c00"></p>
    </div>
    <script src="lib/signature_pad.umd.min.js"></script>
    <script type="module" src="src/pad.js"></script>
  </body>
</html>
```
Note: the canvas backing store is 1200×480 (2× the 600×240 CSS size) so saved PNGs are crisp when stamped.

- [ ] **Step 3: Write `src/pad.js`**

```js
import { trimBounds } from './trim.js';
import { addSignature } from './storage.js';

const canvas = document.getElementById('pad');
const errEl = document.getElementById('err');
// Transparent background so exported PNG has no white box.
const pad = new SignaturePad(canvas, { penColor: '#111', backgroundColor: 'rgba(0,0,0,0)' });

document.getElementById('clear').addEventListener('click', () => {
  pad.clear();
  errEl.textContent = '';
});

document.getElementById('save').addEventListener('click', async () => {
  errEl.textContent = '';
  if (pad.isEmpty()) { errEl.textContent = 'Please draw a signature first.'; return; }
  const name = (document.getElementById('name').value || '').trim() || 'Signature';

  const ctx = canvas.getContext('2d');
  const full = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const box = trimBounds(full);
  if (box.w === 0) { errEl.textContent = 'Please draw a signature first.'; return; }

  // Crop to the drawn area onto a fresh transparent canvas.
  const out = document.createElement('canvas');
  out.width = box.w; out.height = box.h;
  out.getContext('2d').putImageData(ctx.getImageData(box.x, box.y, box.w, box.h), 0, 0);
  const dataUrl = out.toDataURL('image/png');

  try {
    await addSignature(name, dataUrl);
    window.close();
  } catch (e) {
    errEl.textContent = 'Could not save: ' + (e && e.message ? e.message : 'unknown error');
  }
});
```

- [ ] **Step 4: Manual verification**

1. `npm run vendor` (ensures `lib/signature_pad.umd.min.js` exists), then reload the unpacked extension in `edge://extensions`.
2. Temporarily open the pad directly: in a new tab visit `chrome-extension://<your-extension-id>/pad.html` (copy the ID from the extension card).
3. Draw something, leave the name blank, click **Save** → the tab closes.
4. Reopen `pad.html`, draw, type a name "Full", click **Save** → closes.
5. Click **Save** with an empty canvas → shows "Please draw a signature first." and does not close.
Expected: saves succeed (verified visually in Task 5's popup grid), empty-save is blocked.

- [ ] **Step 5: Commit**

```powershell
git add pad.html src/pad.js src/ui.css
git commit -m "feat: signature drawing pad that saves trimmed transparent PNGs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Popup signature library (grid + actions + open viewer)

**Files:**
- Modify: `popup.html`, `src/popup.js`, `src/ui.css` (append)

**Interfaces:**
- Consumes: `listSignatures`, `deleteSignature`, `renameSignature` from `src/storage.js`.
- Produces: the real popup — a grid of saved signatures with rename/delete, a **New signature** button (opens `pad.html`), and **Open a PDF to sign** (opens `viewer.html`). Opens pages via `chrome.tabs.create({ url: chrome.runtime.getURL(...) })`.

- [ ] **Step 1: Append popup grid styles to `src/ui.css`**

```css
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
.card { border: 1px solid #ddd; border-radius: 8px; padding: 6px; text-align: center; }
.card img { max-width: 100%; height: 56px; object-fit: contain; background:
  repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 12px 12px; }
.card .nm { font-size: 12px; margin: 4px 0; word-break: break-word; }
.card .row { display: flex; gap: 4px; justify-content: center; }
.card .row button { padding: 3px 7px; font-size: 12px; }
.empty { color: #666; font-size: 13px; }
.actions { display: flex; gap: 8px; }
.actions button { flex: 1; }
```

- [ ] **Step 2: Rewrite `popup.html`**

```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><link rel="stylesheet" href="src/ui.css"></head>
  <body>
    <div class="popup">
      <h1>SignEdge</h1>
      <div id="grid" class="grid"></div>
      <p id="empty" class="empty" hidden>No signatures yet. Create your first one.</p>
      <div class="actions">
        <button id="new">New signature</button>
        <button id="open" class="primary">Open a PDF to sign</button>
      </div>
    </div>
    <script type="module" src="src/popup.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Rewrite `src/popup.js`**

```js
import { listSignatures, deleteSignature, renameSignature } from './storage.js';

const grid = document.getElementById('grid');
const emptyEl = document.getElementById('empty');

function openPage(path) {
  chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  window.close();
}

async function render() {
  const sigs = await listSignatures();
  grid.innerHTML = '';
  emptyEl.hidden = sigs.length > 0;
  for (const sig of sigs) {
    const card = document.createElement('div');
    card.className = 'card';
    const img = document.createElement('img');
    img.src = sig.dataUrl; img.alt = sig.name;
    const nm = document.createElement('div');
    nm.className = 'nm'; nm.textContent = sig.name;
    const row = document.createElement('div');
    row.className = 'row';
    const ren = document.createElement('button');
    ren.textContent = 'Rename';
    ren.addEventListener('click', async () => {
      const name = prompt('New name', sig.name);
      if (name && name.trim()) { await renameSignature(sig.id, name.trim()); render(); }
    });
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (confirm(`Delete "${sig.name}"?`)) { await deleteSignature(sig.id); render(); }
    });
    row.append(ren, del);
    card.append(img, nm, row);
    grid.append(card);
  }
}

document.getElementById('new').addEventListener('click', () => openPage('pad.html'));
document.getElementById('open').addEventListener('click', () => openPage('viewer.html'));
render();
```

- [ ] **Step 4: Manual verification**

1. Reload the unpacked extension.
2. Open the popup → if you saved signatures in Task 4 they appear as cards (checkerboard behind them confirms transparency). If none, the "No signatures yet" hint shows.
3. Click **New signature** → `pad.html` opens in a tab; draw + save; reopen popup → the new card appears.
4. **Rename** a card → enter a new name → grid updates.
5. **Delete** a card → confirm → it disappears.
6. Click **Open a PDF to sign** → a tab opens at `viewer.html` (currently blank/placeholder until Task 6). No errors in the popup.
Expected: all steps behave as described.

- [ ] **Step 5: Commit**

```powershell
git add popup.html src/popup.js src/ui.css
git commit -m "feat: popup signature library with rename, delete, and page launchers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: PDF viewer — open and render pages

**Files:**
- Create: `viewer.html`, `src/viewer.js`
- Modify: `src/ui.css` (append viewer styles)

**Interfaces:**
- Consumes: pdf.js from `lib/pdf.min.mjs` + worker `lib/pdf.worker.min.mjs`.
- Produces: `viewer.html` renders an opened PDF's pages into a stack of `<canvas>` elements, each wrapped in a positioned `.page` container (needed for overlays in Task 7). Exposes on `window` for later tasks: `SignEdgeViewer = { pdfBytes: ArrayBuffer|null, pages: Array<{ pageDiv, canvas, viewport, pageIndex }> }`.

- [ ] **Step 1: Append viewer styles to `src/ui.css`**

```css
.viewer { display: grid; grid-template-columns: 220px 1fr; height: 100vh; }
.sidebar { border-right: 1px solid #ddd; padding: 12px; overflow: auto; }
.stage { overflow: auto; background: #525659; padding: 20px; }
.toolbar { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-bottom: 1px solid #ddd; }
.page { position: relative; margin: 0 auto 16px; box-shadow: 0 2px 10px rgba(0,0,0,.4); background: #fff; }
.page canvas { display: block; }
.viewer-err { color: #c00; padding: 12px; }
.sig-item { display: flex; align-items: center; gap: 8px; padding: 6px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 6px; cursor: pointer; background: #fff; }
.sig-item.active { outline: 2px solid #0a6cff; }
.sig-item img { height: 28px; max-width: 120px; object-fit: contain; }
.placement { position: absolute; border: 1px dashed #0a6cff; box-sizing: border-box; cursor: move; touch-action: none; }
.placement img { width: 100%; height: 100%; pointer-events: none; display: block; }
.placement .rs { position: absolute; right: -7px; bottom: -7px; width: 14px; height: 14px; background: #0a6cff; border-radius: 50%; cursor: nwse-resize; }
.placement .del { position: absolute; right: -8px; top: -8px; width: 16px; height: 16px; line-height: 14px; text-align: center; background: #c00; color: #fff; border-radius: 50%; font-size: 12px; cursor: pointer; }
```

- [ ] **Step 2: Write `viewer.html`**

```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><link rel="stylesheet" href="src/ui.css"></head>
  <body>
    <div class="viewer">
      <div class="sidebar">
        <h1>Signatures</h1>
        <p class="pad-hint">Click one, then click on the page to place it.</p>
        <div id="sigList"></div>
      </div>
      <div style="display:flex; flex-direction:column; min-width:0;">
        <div class="toolbar">
          <input id="file" type="file" accept="application/pdf" />
          <button id="download" class="primary" disabled>Download signed PDF</button>
          <span id="err" class="viewer-err" style="padding:0"></span>
        </div>
        <div id="stage" class="stage"></div>
      </div>
    </div>
    <!-- pdf-lib as UMD global (window.PDFLib) for the export step -->
    <script src="lib/pdf-lib.min.js"></script>
    <script type="module" src="src/viewer.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Write the render portion of `src/viewer.js`**

```js
import * as pdfjsLib from '../lib/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL('../lib/pdf.worker.min.mjs', import.meta.url).toString();

const stage = document.getElementById('stage');
const errEl = document.getElementById('err');
const downloadBtn = document.getElementById('download');

const state = { pdfBytes: null, pages: [], placements: [], selectedSigId: null };
window.SignEdgeViewer = state;

const FIT_WIDTH = 820; // target on-screen page width in CSS px

function showError(msg) { errEl.textContent = msg; }

async function openPdf(file) {
  showError('');
  stage.innerHTML = '';
  state.pages = [];
  state.placements = [];
  downloadBtn.disabled = true;
  try {
    const buf = await file.arrayBuffer();
    state.pdfBytes = buf.slice(0); // keep a copy for pdf-lib (pdf.js detaches the one it gets)
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const dpr = window.devicePixelRatio || 1;
    for (let i = 0; i < doc.numPages; i++) {
      const page = await doc.getPage(i + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = FIT_WIDTH / base.width;
      const viewport = page.getViewport({ scale });

      const pageDiv = document.createElement('div');
      pageDiv.className = 'page';
      pageDiv.style.width = viewport.width + 'px';
      pageDiv.style.height = viewport.height + 'px';

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = viewport.width + 'px';
      canvas.style.height = viewport.height + 'px';
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      pageDiv.appendChild(canvas);
      stage.appendChild(pageDiv);
      await page.render({ canvasContext: ctx, viewport }).promise;

      state.pages.push({ pageIndex: i, pageDiv, canvas, viewport });
    }
    downloadBtn.disabled = state.pages.length === 0;
  } catch (e) {
    if (e && e.name === 'PasswordException') {
      showError('Password-protected PDFs are not supported in this version.');
    } else if (e && e.name === 'InvalidPDFException') {
      showError('That file does not look like a valid PDF.');
    } else {
      showError('Could not open the PDF: ' + (e && e.message ? e.message : 'unknown error'));
    }
  }
}

document.getElementById('file').addEventListener('change', (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (file) openPdf(file);
});

// placement + export wired up in Tasks 7 and 9
export { state };
```

- [ ] **Step 4: Manual verification**

1. `npm run vendor`; reload the unpacked extension.
2. Open the popup → **Open a PDF to sign** → `viewer.html` opens.
3. Choose a normal multi-page PDF via the file picker → all pages render top-to-bottom on the gray stage, crisp text.
4. Choose a `.txt` or image renamed to `.pdf` → "That file does not look like a valid PDF." (or a load error) shows; the viewer does not crash.
5. If you have a password-protected PDF, choose it → the password message shows.
Expected: rendering works; bad input is handled gracefully.

- [ ] **Step 5: Commit**

```powershell
git add viewer.html src/viewer.js src/ui.css
git commit -m "feat: PDF viewer that renders pages with pdf.js and handles bad input

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Placement overlays (select, place, move, resize, delete)

**Files:**
- Modify: `src/viewer.js` (add sidebar rendering + placement interactions)

**Interfaces:**
- Consumes: `listSignatures` from `src/storage.js`; `state` from Task 6.
- Produces: interactive placements stored in `state.placements` as `{ id, sigId, pageIndex, xFrac, yFrac, wFrac, hFrac, el }`. Fractions are of the displayed page (top-left origin). Also `state.sigById: Map<string, Signature>` for the export step.

- [ ] **Step 1: Add imports and sidebar rendering to `src/viewer.js`**

Add near the top (after the existing imports):
```js
import { listSignatures } from './storage.js';
```
Add before the final `export { state }`:
```js
state.sigById = new Map();
const sigListEl = document.getElementById('sigList');

async function renderSidebar() {
  const sigs = await listSignatures();
  state.sigById = new Map(sigs.map((s) => [s.id, s]));
  sigListEl.innerHTML = '';
  if (sigs.length === 0) {
    sigListEl.innerHTML = '<p class="pad-hint">No signatures yet. Create one from the toolbar popup.</p>';
    return;
  }
  for (const sig of sigs) {
    const item = document.createElement('div');
    item.className = 'sig-item';
    item.dataset.id = sig.id;
    const img = document.createElement('img');
    img.src = sig.dataUrl; img.alt = sig.name;
    const label = document.createElement('span');
    label.textContent = sig.name;
    item.append(img, label);
    item.addEventListener('click', () => selectSig(sig.id));
    sigListEl.appendChild(item);
  }
}

function selectSig(id) {
  state.selectedSigId = id;
  for (const el of sigListEl.querySelectorAll('.sig-item')) {
    el.classList.toggle('active', el.dataset.id === id);
  }
}
renderSidebar();
```

- [ ] **Step 2: Add click-to-place, drag, resize, and delete to `src/viewer.js`**

Add before the final `export { state }`:
```js
// natural pixel size of a signature image, for aspect-correct default placement
function sigAspect(sigId) {
  return new Promise((resolve) => {
    const sig = state.sigById.get(sigId);
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 3);
    img.onerror = () => resolve(3);
    img.src = sig.dataUrl;
  });
}

function updateFractions(p) {
  const { pageDiv } = state.pages[p.pageIndex];
  const W = pageDiv.clientWidth, H = pageDiv.clientHeight;
  p.xFrac = p.el.offsetLeft / W;
  p.yFrac = p.el.offsetTop / H;
  p.wFrac = p.el.offsetWidth / W;
  p.hFrac = p.el.offsetHeight / H;
}

function makePlacement(sigId, pageIndex, leftPx, topPx, wPx, hPx) {
  const { pageDiv } = state.pages[pageIndex];
  const el = document.createElement('div');
  el.className = 'placement';
  el.style.left = leftPx + 'px';
  el.style.top = topPx + 'px';
  el.style.width = wPx + 'px';
  el.style.height = hPx + 'px';
  const img = document.createElement('img');
  img.src = state.sigById.get(sigId).dataUrl;
  const rs = document.createElement('div'); rs.className = 'rs';
  const del = document.createElement('div'); del.className = 'del'; del.textContent = '×';
  el.append(img, rs, del);
  pageDiv.appendChild(el);

  const p = { id: crypto.randomUUID(), sigId, pageIndex, el, xFrac: 0, yFrac: 0, wFrac: 0, hFrac: 0 };
  state.placements.push(p);
  updateFractions(p);

  // drag to move (pointer events)
  el.addEventListener('pointerdown', (e) => {
    if (e.target === rs || e.target === del) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const ol = el.offsetLeft, ot = el.offsetTop;
    const W = pageDiv.clientWidth, H = pageDiv.clientHeight;
    function move(ev) {
      let nl = ol + (ev.clientX - startX);
      let nt = ot + (ev.clientY - startY);
      nl = Math.max(0, Math.min(nl, W - el.offsetWidth));
      nt = Math.max(0, Math.min(nt, H - el.offsetHeight));
      el.style.left = nl + 'px'; el.style.top = nt + 'px';
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      updateFractions(p);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // resize (keeps aspect ratio)
  rs.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const ow = el.offsetWidth, oh = el.offsetHeight;
    const aspect = ow / oh;
    const W = pageDiv.clientWidth;
    function move(ev) {
      let nw = Math.max(24, ow + (ev.clientX - startX));
      nw = Math.min(nw, W - el.offsetLeft);
      el.style.width = nw + 'px';
      el.style.height = (nw / aspect) + 'px';
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      updateFractions(p);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  del.addEventListener('click', (e) => {
    e.stopPropagation();
    el.remove();
    state.placements = state.placements.filter((x) => x.id !== p.id);
  });

  return p;
}

// click a page to drop the selected signature there
function attachPagePlacement() {
  for (const pg of state.pages) {
    pg.pageDiv.addEventListener('click', async (e) => {
      if (e.target.closest('.placement')) return; // don't place on top of an existing one
      if (!state.selectedSigId) { showError('Pick a signature on the left first.'); return; }
      showError('');
      const rect = pg.pageDiv.getBoundingClientRect();
      const aspect = await sigAspect(state.selectedSigId);
      const wPx = pg.pageDiv.clientWidth * 0.25;
      const hPx = wPx / aspect;
      let left = e.clientX - rect.left - wPx / 2;
      let top = e.clientY - rect.top - hPx / 2;
      left = Math.max(0, Math.min(left, pg.pageDiv.clientWidth - wPx));
      top = Math.max(0, Math.min(top, pg.pageDiv.clientHeight - hPx));
      makePlacement(state.selectedSigId, pg.pageIndex, left, top, wPx, hPx);
    });
  }
}
```
Then call `attachPagePlacement()` at the end of `openPdf` (right after the render loop, before `downloadBtn.disabled = ...`):
```js
    attachPagePlacement();
```

- [ ] **Step 3: Manual verification**

1. Reload the extension; open `viewer.html`; open a multi-page PDF (make sure you have ≥1 saved signature).
2. Click a signature in the left list → it highlights.
3. Click on page 1 → the signature appears where you clicked, ~25% page width, correct aspect.
4. Drag it around → it stays within the page bounds.
5. Drag the blue corner handle → it resizes keeping aspect.
6. Click the red × → it disappears.
7. Place one signature on page 1 and another on a later page.
8. Click a page without selecting a signature first → "Pick a signature on the left first."
Expected: all placement interactions behave correctly.

- [ ] **Step 4: Commit**

```powershell
git add src/viewer.js
git commit -m "feat: place, move, resize, and delete signatures on PDF pages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Coordinate helper functions (pure, unit-tested)

**Files:**
- Create: `src/coords.js`
- Test: `test/coords.test.js`

**Interfaces:**
- Produces:
  - `fractionsToViewportRect(p, vpWidth, vpHeight): {x, y, w, h}` — converts placement fractions to viewport-pixel rect (top-left origin).
  - `pdfRectFromCorners(topLeft, bottomRight): {x, y, width, height}` — from two `[x,y]` PDF points returns an axis-aligned rect with `x/y` = the minimum corner.
  - `preRotateDegreesCW(pageRotation): number` — clockwise degrees to pre-rotate the signature bitmap so it displays upright given the page's `/Rotate`. Equals `(360 - (pageRotation % 360)) % 360`.

**Design note (rotation strategy):** The spec called for unit-testing fraction→point mapping across all four rotations. We instead delegate the rotation-aware position transform to pdf.js's battle-tested `viewport.convertToPdfPoint` (used in Task 9) and keep these three *pure* helpers unit-tested. The rotated-page path (uncommon) is verified end-to-end manually in Task 9; the rotation=0 path (common) is fully exercised by both unit tests and manual verification. This reuses correct existing code instead of re-deriving rotation math.

- [ ] **Step 1: Write the failing tests**

Create `test/coords.test.js`:
```js
import { describe, expect, it } from 'vitest';
import { fractionsToViewportRect, pdfRectFromCorners, preRotateDegreesCW } from '../src/coords.js';

describe('fractionsToViewportRect', () => {
  it('scales fractions to viewport pixels', () => {
    const r = fractionsToViewportRect({ xFrac: 0.1, yFrac: 0.2, wFrac: 0.5, hFrac: 0.25 }, 800, 1000);
    expect(r).toEqual({ x: 80, y: 200, w: 400, h: 250 });
  });
});

describe('pdfRectFromCorners', () => {
  it('builds a rect from top-left and bottom-right points', () => {
    expect(pdfRectFromCorners([100, 700], [300, 500]))
      .toEqual({ x: 100, y: 500, width: 200, height: 200 });
  });
  it('is order-independent (uses min corner)', () => {
    expect(pdfRectFromCorners([300, 500], [100, 700]))
      .toEqual({ x: 100, y: 500, width: 200, height: 200 });
  });
});

describe('preRotateDegreesCW', () => {
  it('maps page rotation to the upright pre-rotation', () => {
    expect(preRotateDegreesCW(0)).toBe(0);
    expect(preRotateDegreesCW(90)).toBe(270);
    expect(preRotateDegreesCW(180)).toBe(180);
    expect(preRotateDegreesCW(270)).toBe(90);
    expect(preRotateDegreesCW(360)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/coords.test.js`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement `src/coords.js`**

```js
// Pure geometry helpers for stamping. The rotation-aware display->PDF point
// transform itself is done by pdf.js viewport.convertToPdfPoint in viewer.js;
// these helpers cover the pure arithmetic around it.

export function fractionsToViewportRect(p, vpWidth, vpHeight) {
  return {
    x: p.xFrac * vpWidth,
    y: p.yFrac * vpHeight,
    w: p.wFrac * vpWidth,
    h: p.hFrac * vpHeight,
  };
}

export function pdfRectFromCorners(topLeft, bottomRight) {
  const x = Math.min(topLeft[0], bottomRight[0]);
  const y = Math.min(topLeft[1], bottomRight[1]);
  const width = Math.abs(bottomRight[0] - topLeft[0]);
  const height = Math.abs(bottomRight[1] - topLeft[1]);
  return { x, y, width, height };
}

export function preRotateDegreesCW(pageRotation) {
  return (360 - (((pageRotation % 360) + 360) % 360)) % 360;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/coords.test.js`
Expected: PASS — all cases green.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — storage, trim, and coords suites all green.

- [ ] **Step 6: Commit**

```powershell
git add src/coords.js test/coords.test.js
git commit -m "feat: add pure coordinate helpers with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Export the signed PDF (pdf-lib integration)

**Files:**
- Modify: `src/viewer.js` (add the download handler)

**Interfaces:**
- Consumes: `state` (`pdfBytes`, `pages`, `placements`, `sigById`); pdf-lib global `window.PDFLib`; `fractionsToViewportRect`, `pdfRectFromCorners`, `preRotateDegreesCW` from `src/coords.js`; each page's `viewport.convertToPdfPoint`.
- Produces: a downloaded `*-signed.pdf` with every placement stamped at the correct location/size, original page content preserved.

- [ ] **Step 1: Add coords import to `src/viewer.js`**

Add to the imports at the top:
```js
import { fractionsToViewportRect, pdfRectFromCorners, preRotateDegreesCW } from './coords.js';
```

- [ ] **Step 2: Add an image pre-rotation helper and the download handler to `src/viewer.js`**

Add before the final `export { state }`:
```js
// Rotate a PNG data URL clockwise by 0/90/180/270 degrees on a canvas.
function rotateDataUrl(dataUrl, deg) {
  return new Promise((resolve) => {
    if (deg % 360 === 0) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const swap = deg % 180 !== 0;
      c.width = swap ? img.naturalHeight : img.naturalWidth;
      c.height = swap ? img.naturalWidth : img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      resolve(c.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}

function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function downloadSigned() {
  showError('');
  if (!state.pdfBytes) return;
  try {
    const { PDFDocument } = window.PDFLib;
    const pdfDoc = await PDFDocument.load(state.pdfBytes);

    for (const p of state.placements) {
      const pageView = state.pages[p.pageIndex];
      const viewport = pageView.viewport;
      const pdfPage = pdfDoc.getPage(p.pageIndex);
      const rotation = pdfPage.getRotation().angle;

      // display-space rect (viewport px) -> two PDF-space corners
      const r = fractionsToViewportRect(p, viewport.width, viewport.height);
      const topLeftPdf = viewport.convertToPdfPoint(r.x, r.y);
      const bottomRightPdf = viewport.convertToPdfPoint(r.x + r.w, r.y + r.h);
      const rect = pdfRectFromCorners(topLeftPdf, bottomRightPdf);

      // make the stamp upright given the page's display rotation
      const sig = state.sigById.get(p.sigId);
      const rotated = await rotateDataUrl(sig.dataUrl, preRotateDegreesCW(rotation));
      const png = await pdfDoc.embedPng(dataUrlToBytes(rotated));

      pdfPage.drawImage(png, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }

    const out = await pdfDoc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'signed.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    showError('Could not create the signed PDF: ' + (e && e.message ? e.message : 'unknown error'));
  }
}

downloadBtn.addEventListener('click', downloadSigned);
```

- [ ] **Step 3: Manual verification — the core success path**

1. Reload the extension; open `viewer.html`; open a normal (rotation-0) multi-page PDF.
2. Place your signature on page 1 (bottom-right, typical signing spot) and another on page 3.
3. Click **Download signed PDF** → a `signed.pdf` downloads.
4. Open `signed.pdf` in Edge → confirm each signature is at the position and size you set, on the correct page.
5. Select text in the signed PDF → original text is still selectable (proves we stamped an image, didn't rasterize).
Expected: signatures land correctly; document text preserved.

- [ ] **Step 4: Manual verification — rotated pages**

1. Obtain a PDF with a rotated page (e.g., scan rotated 90°, or rotate one in any PDF tool).
2. Open it; the page renders in its displayed orientation.
3. Place a signature; download; open the result.
4. Confirm the signature is **upright** and in the spot you placed it.
   - If the signature appears sideways/upside-down, the pre-rotation sign is inverted: in `preRotateDegreesCW`, change the return to `(((pageRotation % 360) + 360) % 360)` (i.e. rotate the same direction as the page) and re-verify. Update the `coords.test.js` expectations to match the corrected mapping and re-run `npm test`.
Expected: signature is upright and correctly positioned on rotated pages.

- [ ] **Step 5: Commit**

```powershell
git add src/viewer.js
git commit -m "feat: export signed PDF by stamping placements with pdf-lib

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Real icons, store package, and docs

**Files:**
- Create: `icons/make-icons.html`
- Replace: `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, `icons/icon128.png`
- Create: `store/listing.md`, `store/privacy-policy.md`, `store/SUBMISSION.md`, `store/TEST-CHECKLIST.md`
- Create: `README.md`
- Create: `scripts/package.ps1`

**Interfaces:**
- Produces: real branded icons; a store listing + privacy policy + submission guide; a one-command zip build; project README.

- [ ] **Step 1: Create the icon generator page**

Create `icons/make-icons.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>SignEdge icons</title></head>
  <body style="font-family:system-ui;padding:20px">
    <h1>SignEdge icon generator</h1>
    <p>This page downloads icon16/32/48/128.png. Save them into the <code>/icons</code> folder, replacing the placeholders.</p>
    <button id="go" style="font-size:16px;padding:8px 14px">Generate &amp; download</button>
    <div id="preview" style="margin-top:16px"></div>
    <script>
      function draw(size) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const x = c.getContext('2d');
        // rounded blue tile
        const r = size * 0.22;
        x.fillStyle = '#0a6cff';
        x.beginPath();
        x.moveTo(r, 0); x.arcTo(size, 0, size, size, r); x.arcTo(size, size, 0, size, r);
        x.arcTo(0, size, 0, 0, r); x.arcTo(0, 0, size, 0, r); x.closePath(); x.fill();
        // white signature stroke
        x.strokeStyle = '#fff';
        x.lineWidth = Math.max(2, size * 0.09);
        x.lineCap = 'round'; x.lineJoin = 'round';
        x.beginPath();
        x.moveTo(size * 0.20, size * 0.66);
        x.bezierCurveTo(size * 0.36, size * 0.30, size * 0.46, size * 0.86, size * 0.60, size * 0.50);
        x.bezierCurveTo(size * 0.68, size * 0.30, size * 0.74, size * 0.62, size * 0.82, size * 0.52);
        x.stroke();
        return c;
      }
      function download(canvas, name) {
        canvas.toBlob((b) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(b);
          a.download = name; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1500);
        }, 'image/png');
      }
      document.getElementById('go').addEventListener('click', () => {
        const preview = document.getElementById('preview');
        preview.innerHTML = '';
        for (const s of [16, 32, 48, 128]) {
          const c = draw(s);
          preview.appendChild(c);
          download(c, `icon${s}.png`);
        }
      });
    </script>
  </body>
</html>
```

- [ ] **Step 2: Generate the icons**

1. Open `icons/make-icons.html` in Edge (double-click the file, or drag it into a tab).
2. Click **Generate & download** → four PNGs download.
3. Move `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` into the project `/icons` folder, replacing the placeholders.
4. Reload the unpacked extension → confirm the new icon shows on the toolbar and extension card.
Expected: real blue signature icon appears everywhere.

- [ ] **Step 3: Write the store listing text**

Create `store/listing.md`:
```markdown
# Edge Add-ons listing

**Name:** SignEdge — Save & Reuse Signatures

**Summary (max ~132 chars):**
Draw a signature once, save it, and stamp it onto any PDF. 100% on your device — nothing is uploaded.

**Category:** Productivity

**Description:**
SignEdge lets you save your handwritten signatures and reuse them on PDF documents — no more redrawing your signature every time.

Features
- Draw and save multiple signatures (full signature, initials, etc.).
- Open any PDF right in your browser and drop a saved signature onto any page.
- Move and resize the signature, then download the signed PDF.
- Your original PDF text stays intact and selectable.
- Everything stays on your device. No accounts, no cloud, no uploads.

How it works
1. Click the SignEdge icon and choose "New signature" to draw and save one.
2. Click "Open a PDF to sign", pick your PDF, then click a saved signature and click where you want it.
3. Adjust the size, then download your signed PDF.

Privacy
SignEdge stores your signatures only in your browser's local storage and never sends any data anywhere.

**Search terms:** signature, sign pdf, esign, pdf sign, signatures
```

- [ ] **Step 4: Write the privacy policy**

Create `store/privacy-policy.md`:
```markdown
# SignEdge Privacy Policy

_Last updated: 2026-07-02_

SignEdge does not collect, transmit, or share any personal data.

- **Signatures** you draw are stored only on your device using the browser's
  local extension storage (`chrome.storage.local`). They never leave your computer.
- **PDF files** you open are processed entirely within your browser. They are never
  uploaded to any server.
- SignEdge makes **no network requests** and uses **no analytics or tracking**.
- The extension requests only the `storage` permission, used solely to save your
  signatures locally.

Because no data is collected or transmitted, there is nothing to request, export,
or delete on our side. Removing the extension (or clearing its data in
`edge://extensions`) permanently deletes your stored signatures from your device.

Contact: janooh37@gmail.com
```

- [ ] **Step 5: Write the submission guide**

Create `store/SUBMISSION.md`:
```markdown
# Submitting SignEdge to the Microsoft Edge Add-ons store

## 0. One-time prerequisites
- A Microsoft account.
- Register as an Edge extension developer (free) at the Microsoft Partner Center:
  https://partner.microsoft.com/dashboard/microsoftedge/  → "Register".
- Host the privacy policy somewhere public and copy its URL. Easiest options:
  - Create a public GitHub Gist with the contents of `store/privacy-policy.md`, or
  - Enable GitHub Pages on your repo and link the rendered file.

## 1. Build the upload package
From the project root, run:

    pwsh scripts/package.ps1

This creates `dist/signedge-<version>.zip` containing only the files the store needs.

## 2. Create the submission in Partner Center
1. Go to the Edge developer dashboard → **Create new extension**.
2. **Package:** upload `dist/signedge-<version>.zip`.
3. **Store listing:** copy the fields from `store/listing.md` (name, summary,
   description, category, search terms). Upload at least one screenshot
   (1280×800 recommended) — see `store/TEST-CHECKLIST.md` step for capturing one.
4. **Privacy:**
   - Privacy policy URL: paste the public URL from step 0.
   - Data collection: declare **no data collected**.
   - Permission justification for `storage`: "Stores the user's signatures locally on
     their device. No data is transmitted."
5. **Availability:** choose markets (all) and visibility (public).
6. Submit for certification. Review typically takes a few days.

## 3. After approval
- Note your published extension ID.
- To publish updates: bump `version` in `manifest.json`, re-run the package script,
  and upload the new zip in the dashboard.
```

- [ ] **Step 6: Write the packaging script**

Create `scripts/package.ps1`:
```powershell
# Builds dist/signedge-<version>.zip with only the files the store needs.
$ErrorActionPreference = "Stop"
$manifest = Get-Content -Raw manifest.json | ConvertFrom-Json
$version = $manifest.version
New-Item -ItemType Directory -Force dist | Out-Null
$zip = "dist/signedge-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
$items = @("manifest.json", "popup.html", "pad.html", "viewer.html", "src", "lib", "icons")
Compress-Archive -Path $items -DestinationPath $zip
Write-Output "Built $zip"
```
Note: `icons/make-icons.html` is inside `/icons` and will be included — harmless, but you may delete it before packaging if you prefer a leaner zip.

- [ ] **Step 7: Write the manual test checklist**

Create `store/TEST-CHECKLIST.md`:
```markdown
# SignEdge manual test checklist

Run before every store submission.

## Signatures
- [ ] Create a signature by drawing; it appears in the popup grid with transparent bg.
- [ ] Save with an empty name → defaults to "Signature".
- [ ] Try to save a blank pad → blocked with a message.
- [ ] Rename a signature → grid updates.
- [ ] Delete a signature → removed.
- [ ] Reload the browser → signatures persist.

## Signing
- [ ] Open a normal multi-page PDF → all pages render.
- [ ] Place a signature on page 1 and another on a later page.
- [ ] Drag and resize placements; they stay within page bounds.
- [ ] Delete a placement with the × button.
- [ ] Download signed PDF → signatures at correct spots/sizes; original text selectable.
- [ ] Rotated-page PDF → signature is upright and correctly placed.

## Errors
- [ ] Non-PDF file → graceful error, no crash.
- [ ] Password-protected PDF → clear "not supported" message.

## Screenshot for the store
- [ ] With a PDF open and a signature placed, capture the viewer tab at ~1280×800
      and save it as `store/screenshots/viewer.png`.
```
Also create the folder: run `New-Item -ItemType Directory -Force store/screenshots | Out-Null`.

- [ ] **Step 8: Write the README**

Create `README.md`:
```markdown
# SignEdge

Save your handwritten signatures and stamp them onto PDFs — a Microsoft Edge (Manifest V3) extension. Everything stays on your device.

## Develop / run locally
```
npm install
npm run vendor      # copy libraries into /lib
npm test            # run unit tests
```
Then load it in Edge:
1. `edge://extensions` → enable Developer mode.
2. **Load unpacked** → select this folder.

## Build the store package
```
pwsh scripts/package.ps1   # -> dist/signedge-<version>.zip
```

## How it works
- Draw & save signatures (stored in `chrome.storage.local`).
- Open a PDF in the extension viewer, place a saved signature, download the signed PDF.
- Rendering uses pdf.js; stamping uses pdf-lib (original text is preserved).

## Layout
- `src/` — UI + logic (`storage`, `trim`, `coords` are unit-tested).
- `lib/` — vendored libraries (no remote code).
- `store/` — Edge Add-ons listing, privacy policy, submission guide.
- `docs/superpowers/` — design spec and implementation plan.

See `store/SUBMISSION.md` to publish, and `store/TEST-CHECKLIST.md` before each release.
```

- [ ] **Step 9: Full verification pass and commit**

1. Run `npm test` → all suites pass.
2. Run `pwsh scripts/package.ps1` → `dist/signedge-<version>.zip` is created.
3. Walk `store/TEST-CHECKLIST.md` end-to-end in Edge → all boxes pass.
4. Commit:
```powershell
git add -A
git commit -m "feat: real icons, store package, submission guide, and docs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Spec Coverage Map

| Spec requirement | Task(s) |
|---|---|
| Draw & save multiple named signatures | 3 (trim), 4 (pad), 2 (storage) |
| Local-only storage | 2 |
| Rename / delete / persist signatures | 2, 5 |
| Open a PDF in own viewer | 6 |
| Place multiple signatures across pages | 7 |
| Move & resize placements | 7 |
| Download signed PDF, text preserved | 9 |
| Coordinate mapping incl. rotation | 8 (pure helpers) + 9 (pdf.js transform, manual verify) |
| Error handling (non-PDF, encrypted, blank, download) | 4, 6, 9 |
| MV3, `storage` only, no remote code, no eval | 1 (manifest/vendor), 6 (isEvalSupported) |
| Icons 16/32/48/128 | 1 (placeholder), 10 (real) |
| Store listing, privacy policy, submission guide, package | 10 |
| Unit tests for pure logic | 2, 3, 8 |
| Manual verification checklists | 4, 5, 6, 7, 9, 10 |

**Deviation from spec (conscious):** rotation is handled via pdf.js `convertToPdfPoint` + a pure `preRotateDegreesCW` helper rather than a fully hand-derived 4-rotation mapping. This reuses correct existing code; the rotated path is verified manually (Task 9, Step 4) with an explicit fix note if the rotation sign needs flipping.

