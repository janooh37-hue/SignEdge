import { trimBounds } from './trim.js';
import { addSignature } from './storage.js';

const canvas = document.getElementById('pad');
const errEl = document.getElementById('err');
// Transparent background so exported PNG has no white box.
const pad = new SignaturePad(canvas, { penColor: '#111', backgroundColor: 'rgba(0,0,0,0)' });

// Match the canvas backing store to its displayed size so signature_pad's
// pointer coordinates (CSS pixels) map exactly to where the ink is drawn.
// SUPERSAMPLE keeps the exported PNG crisp when stamped larger onto a PDF.
const SUPERSAMPLE = 2;
function resizeCanvas() {
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (!cssW || !cssH) return; // not laid out yet
  const scale = Math.max(window.devicePixelRatio || 1, 1) * SUPERSAMPLE;
  const data = pad.toData(); // preserve any existing strokes across a resize
  canvas.width = Math.round(cssW * scale);
  canvas.height = Math.round(cssH * scale);
  // Setting width/height resets the context transform; scale so 1 unit == 1 CSS px.
  canvas.getContext('2d').scale(scale, scale);
  pad.clear();
  if (data && data.length) pad.fromData(data);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

document.getElementById('clear').addEventListener('click', () => {
  pad.clear();
  errEl.textContent = '';
});

document.getElementById('save').addEventListener('click', async () => {
  errEl.textContent = ''; errEl.style.color = '#c00';
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
    // Do NOT window.close(): closing a chrome.tabs.create tab from script is
    // unreliable. Show a success state and reset for another signature.
    pad.clear();
    document.getElementById('name').value = '';
    errEl.style.color = '#0a7a0a';
    errEl.textContent = 'Saved! Draw another, or just close this tab.';
  } catch (e) {
    errEl.style.color = '#c00';
    errEl.textContent = 'Could not save: ' + (e && e.message ? e.message : 'unknown error');
  }
});
