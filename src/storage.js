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
