# Runtime verification harness

A browser harness that exercises the **real** signing pipeline (`src/coords.js` +
vendored pdf.js + pdf-lib) end to end, so the coordinate mapping and rotation handling
are proven by running, not just by reading the code.

## What it checks

For a normal page and for 90°- and 270°-rotated pages, it:
1. renders a fixture PDF page with pdf.js (same viewport the viewer builds),
2. stamps an asymmetric marker (red top / blue bottom) at a known display-space
   fraction using the exact `downloadSigned` coordinate logic,
3. re-renders the output and pixel-checks that the stamp landed in the expected
   spot and is **upright**.

A pass confirms: no y-axis flip, no scale error, pdf.js renders with the vendored
worker, pdf-lib stamps correctly, and `preRotateDegreesCW` has the correct sign.

## How to run

```
node verify/make-fixtures.mjs      # generates verify/fixtures.js (git-ignored)
node verify/server.mjs             # serves the project on http://localhost:8123
```
Open `http://localhost:8123/verify/verify.html`. The page prints a JSON result and
renders output previews. Every entry should have `"found": true` and `"upright": true`,
with `bboxCenterFrac` in the top-left (~0.25, ~0.16).

`fixtures.js`, `icons.json`, and screenshots are generated artifacts and are git-ignored.
