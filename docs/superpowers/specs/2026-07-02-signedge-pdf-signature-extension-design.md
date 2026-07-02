# SignEdge — Save & Reuse Signatures for PDFs (Edge Extension)

**Date:** 2026-07-02
**Status:** Approved design
**Author:** brainstormed with user (janooh37@gmail.com)

## Problem

Edge's built-in PDF viewer lets you draw on a PDF (pen, color, size), but there is
no way to **save a drawn signature and reuse it** on other documents. Re-drawing a
signature by hand every time is slow and inconsistent.

Browser extensions **cannot** inject UI into Edge's native PDF viewer (it runs in a
sandboxed internal engine). Therefore the solution is a **self-contained extension**
that provides its own signature library and its own PDF signing surface.

## Goal

A Manifest V3 Edge extension that lets a user:

1. **Draw and save** multiple named signatures, stored locally on the device only.
2. **Open a PDF**, drop a saved signature onto any page, move/resize it, and
   **download the signed PDF** with original text/quality preserved.

Target deployment: **Microsoft Edge Add-ons store** (submission-ready package +
guide; the user performs the actual Partner Center submission).

## Non-Goals (deferred, not in v1)

- Uploading a photo/scan of a signature
- Typed / handwriting-font signatures
- Automatic background removal
- Cross-device sync (local-only by design)
- Dark mode, auto date-stamps, batch signing
- Fine nudge / pixel-exact placement controls (drag & resize only in v1)

## Users & Success Criteria

Single primary user (the author), personal document signing.

A build is successful when:

- The user can draw a signature, name it, and see it persist across browser restarts.
- The user can save several signatures and delete/rename them.
- The user can open a local PDF, place a saved signature on a chosen page at a chosen
  position and size, and download a new PDF where the signature appears in the correct
  spot at good quality, with the PDF's original text still selectable.
- No signature data or PDF content ever leaves the device.
- The extension loads cleanly in Edge (Developer Mode) and passes a self-check against
  Edge Add-ons store submission requirements.

## Architecture

Manifest V3 extension, vanilla JS + HTML/CSS (no framework), with three vendored
libraries bundled locally (no remote code — required for MV3 / store):

| Library | License | Role |
|---|---|---|
| `signature_pad` | MIT | Smooth pen drawing on a canvas |
| `pdfjs-dist` (pdf.js) | Apache-2.0 | **Render** PDF pages for display & positioning |
| `pdf-lib` | MIT | **Write** the signature image into the PDF, output new bytes |

Key separation of concerns: **pdf.js renders (read-only display), pdf-lib writes
(produces the signed output).** The original PDF bytes are loaded once and reused for
the pdf-lib write step so the source document is never rasterized — text and vector
content are preserved; only an image is added on top.

### Components

1. **`manifest.json`** (MV3)
   - `manifest_version: 3`, name, version, description, icons (16/32/48/128).
   - `permissions: ["storage"]` — nothing else. No host permissions.
   - `action` → toolbar popup (`popup.html`).
   - Extension pages: `popup.html`, `viewer.html` (opened in a full tab).
   - CSP: default MV3 (no remote scripts; all libs local).

2. **Storage module (`src/storage.js`)**
   - Wrapper over `chrome.storage.local`.
   - Signature record: `{ id, name, dataUrl, createdAt }` where `dataUrl` is a
     trimmed transparent PNG.
   - API: `listSignatures()`, `addSignature(name, dataUrl)`, `renameSignature(id, name)`,
     `deleteSignature(id)`.

3. **Signature pad (`src/pad.js` + `pad.html` or modal in popup)**
   - `signature_pad` on a `<canvas>`; transparent background.
   - "Clear" and "Save" (prompts for a name).
   - On save: trim whitespace to the drawn bounding box, export a transparent PNG at
     a fixed high resolution (render at device-pixel-ratio × an upscale factor, e.g.
     effective ~3× the on-screen pad) so stamped output stays crisp.

4. **Popup UI (`popup.html` + `src/popup.js`)**
   - Grid of saved signatures (thumbnail + name).
   - Actions: **New signature** (opens pad), **rename**, **delete**,
     **Open a PDF to sign** (opens `viewer.html` in a new tab).

5. **PDF viewer / signer (`viewer.html` + `src/viewer.js`)**
   - Open a PDF via drag-drop or `<input type="file">` (File API → `ArrayBuffer`).
   - Render pages to canvases with pdf.js (worker vendored locally).
   - Sidebar lists saved signatures. Click or drag one onto a page to create a
     **placement overlay** (absolutely-positioned `<img>` over the page canvas).
   - Each placement: draggable (move) and corner-resizable; a small delete handle.
     Multiple placements across multiple pages are supported.
   - **Download signed PDF:** for each placement, map its on-screen rect to PDF
     coordinates, then use pdf-lib `page.drawImage()` on the original bytes; save and
     trigger a blob download (`<original-name>-signed.pdf`).

### Data Flow

```
Draw:  signature_pad canvas → trim → transparent PNG dataURL → chrome.storage.local
Sign:  PDF file → ArrayBuffer ─┬─→ pdf.js render (display + positioning)
                               └─→ pdf-lib load (same bytes) → drawImage(placements) → new PDF blob → download
```

Nothing is uploaded. All processing is in the browser.

### Coordinate Mapping (primary technical risk)

Screen/DOM coordinates (origin top-left, y-down) must be converted to PDF user-space
points (origin bottom-left, y-up), accounting for:

- The render scale used by pdf.js for display vs. the PDF page's native point size.
- Page dimensions from `page.getSize()` in pdf-lib.
- Page rotation (`/Rotate` — 0/90/180/270).

Approach: store each placement as **normalized fractions** of the *unrotated* page box
(`xFrac`, `yFrac` for top-left, `wFrac`, `hFrac`), independent of zoom. At export,
convert fractions → PDF points using the target page's width/height and rotation. This
makes the math independent of the on-screen zoom level. This mapping will get focused
tests (see Testing).

## Error Handling

- **Non-PDF or corrupt file:** catch pdf.js/pdf-lib load errors; show an inline error
  message; do not crash the viewer.
- **Encrypted/password PDF:** detect and show a clear "password-protected PDFs aren't
  supported in v1" message.
- **Empty signature save:** if the pad is blank, disable Save (or warn).
- **Storage quota:** `chrome.storage.local` is ~5MB+; high-res PNGs are small (tens of
  KB). If a write fails, surface the error and keep the in-memory drawing so nothing is
  lost.
- **Download failure:** wrap blob/download in try/catch with a user-visible message.

## Testing

Because most logic is DOM/canvas-heavy, tests focus on the pure, high-risk logic and a
manual verification checklist for UI:

- **Unit tests (pure functions):**
  - Coordinate mapping: fraction → PDF points across page sizes and all four rotations
    (0/90/180/270); round-trip a known rect and assert expected points.
  - Storage module: add/list/rename/delete against a mocked `chrome.storage.local`.
  - PNG trim: given a canvas with a known drawn box, the trimmed bounds are correct.
- **Manual verification checklist (documented in repo):**
  - Draw → save → reload extension → signature still present.
  - Place signature on page 1 and page 3 of a multi-page PDF; download; open result and
    confirm positions/size and that text is still selectable.
  - Try a rotated-page PDF; confirm the signature lands upright and correctly placed.
  - Try a non-PDF file and a password-protected PDF; confirm graceful errors.

Test runner: a lightweight Node-based runner (e.g. `vitest` or plain `node --test`) for
the pure functions; libraries stubbed where they touch the DOM.

## Deployment — Edge Add-ons Store

The build produces a submission-ready package plus a guide. Deliverables:

1. **Extension folder** (loadable unpacked for immediate local use).
2. **Icons** at 16/32/48/128 px.
3. **Store listing assets & text:** name, short + long description, category, at least
   one screenshot, and a promotional tile spec.
4. **Privacy policy text** (data is local-only, no collection) — the user hosts it
   (e.g. GitHub Pages / Gist) and pastes the URL into Partner Center.
5. **Permission justification** (`storage` only; no data collection) for review.
6. **Packaging step**: produce the `.zip` of the extension folder for upload.
7. **`SUBMISSION.md`**: step-by-step Partner Center instructions.

Constraint the user has accepted: the actual account creation and "submit" click in
Microsoft Partner Center are manual steps the user performs; everything up to that is
prepared for them.

## Repository Layout (planned)

```
/manifest.json
/popup.html
/viewer.html
/pad.html
/src/
  storage.js
  popup.js
  pad.js
  viewer.js
  coords.js        # pure coordinate-mapping logic (unit-tested)
/lib/              # vendored: signature_pad, pdf.js (+ worker), pdf-lib
/icons/            # 16/32/48/128
/test/             # unit tests for coords, storage, trim
/store/            # listing text, screenshots, privacy policy, SUBMISSION.md
/docs/superpowers/specs/2026-07-02-...-design.md   # this file
```

## Open Questions

None blocking. Library exact versions to be pinned during implementation.
