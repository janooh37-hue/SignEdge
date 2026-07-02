import { listSignatures, deleteSignature, renameSignature } from './storage.js';

const grid = document.getElementById('grid');
const emptyEl = document.getElementById('empty');
const pendingTimers = new Set();

function openPage(path) {
  chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  window.close();
}

function makeCard(sig) {
  const card = document.createElement('div');
  card.className = 'card';

  const img = document.createElement('img');
  img.src = sig.dataUrl; img.alt = sig.name;

  const nm = document.createElement('div');
  nm.className = 'nm'; nm.textContent = sig.name;

  const row = document.createElement('div');
  row.className = 'row';
  const ren = document.createElement('button'); ren.textContent = 'Rename';
  const del = document.createElement('button'); del.textContent = 'Delete';
  row.append(ren, del);

  // Inline rename (native prompt() is unreliable in popups).
  ren.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'text'; input.value = sig.name; input.className = 'rename-input';
    const ok = document.createElement('button'); ok.textContent = 'Save'; ok.className = 'primary';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel';
    nm.replaceWith(input);
    row.replaceChildren(ok, cancel);
    input.focus(); input.select();
    const commit = async () => {
      const v = input.value.trim();
      if (v) await renameSignature(sig.id, v);
      render();
    };
    ok.addEventListener('click', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
    cancel.addEventListener('click', render);
  });

  // Two-step delete (native confirm() is unreliable in popups).
  let armed = false, timer;
  del.addEventListener('click', async () => {
    if (!armed) {
      armed = true; del.textContent = 'Confirm?';
      timer = setTimeout(() => { armed = false; del.textContent = 'Delete'; pendingTimers.delete(timer); }, 2500);
      pendingTimers.add(timer);
      return;
    }
    clearTimeout(timer);
    pendingTimers.delete(timer);
    await deleteSignature(sig.id);
    render();
  });

  card.append(img, nm, row);
  return card;
}

async function render() {
  for (const t of pendingTimers) clearTimeout(t);
  pendingTimers.clear();
  const sigs = await listSignatures();
  grid.innerHTML = '';
  emptyEl.hidden = sigs.length > 0;
  for (const sig of sigs) grid.append(makeCard(sig));
}

document.getElementById('new').addEventListener('click', () => openPage('pad.html'));
document.getElementById('open').addEventListener('click', () => openPage('viewer.html'));
render();
