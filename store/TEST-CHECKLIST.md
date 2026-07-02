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
