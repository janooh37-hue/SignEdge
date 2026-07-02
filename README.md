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
