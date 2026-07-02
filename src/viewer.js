import * as pdfjsLib from '../lib/pdf.min.mjs';
import { listSignatures } from './storage.js';

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

// placement + export wired up in Tasks 7 and 9

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

export { state };
