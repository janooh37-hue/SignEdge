import * as pdfjsLib from '../lib/pdf.min.mjs';
import { listSignatures, deleteSignature } from './storage.js';
import { fractionsToViewportRect, pdfRectFromCorners, preRotateDegreesCW } from './coords.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL('../lib/pdf.worker.min.mjs', import.meta.url).toString();

const stage = document.getElementById('stage');
const errEl = document.getElementById('err');
const downloadBtn = document.getElementById('download');

const state = { pdfBytes: null, pages: [], placements: [], selectedSigId: null, sigById: new Map() };
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
    attachPagePlacement();
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

const sigListEl = document.getElementById('sigList');
const sidebarTimers = new Set(); // pending two-step-delete timers, cleared on re-render

async function renderSidebar() {
  for (const t of sidebarTimers) clearTimeout(t);
  sidebarTimers.clear();
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
    label.className = 'sig-label';
    label.textContent = sig.name;
    item.append(img, label);
    item.addEventListener('click', () => selectSig(sig.id));

    // two-step delete (native confirm() is unreliable in extension pages)
    const del = document.createElement('button');
    del.className = 'sig-del';
    del.type = 'button';
    del.title = 'Delete this signature';
    del.textContent = '×';
    let armed = false, timer;
    del.addEventListener('click', async (e) => {
      e.stopPropagation(); // clicking delete must not select the signature
      if (!armed) {
        armed = true; del.textContent = '?'; del.classList.add('armed');
        timer = setTimeout(() => {
          armed = false; del.textContent = '×'; del.classList.remove('armed');
          sidebarTimers.delete(timer);
        }, 2500);
        sidebarTimers.add(timer);
        return;
      }
      clearTimeout(timer); sidebarTimers.delete(timer);
      await deleteSignature(sig.id);
      if (state.selectedSigId === sig.id) state.selectedSigId = null;
      renderSidebar();
    });
    item.append(del);
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

// natural pixel size of a signature image, for aspect-correct default placement
function sigAspect(sigId) {
  return new Promise((resolve) => {
    const sig = state.sigById.get(sigId);
    if (!sig) { resolve(3); return; }
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
      let nw = ow + (ev.clientX - startX);
      nw = Math.max(24, Math.min(nw, W - el.offsetLeft, (pageDiv.clientHeight - el.offsetTop) * aspect));
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

// Rotate a PNG data URL clockwise by 0/90/180/270 degrees on a canvas.
function rotateDataUrl(dataUrl, deg) {
  return new Promise((resolve, reject) => {
    if (deg % 360 === 0) { resolve(dataUrl); return; }
    const img = new Image();
    img.onerror = () => reject(new Error('Could not process the signature image for rotation.'));
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

export { state };
