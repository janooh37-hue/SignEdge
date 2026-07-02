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
