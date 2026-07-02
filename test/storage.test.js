import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addSignature, listSignatures, renameSignature, deleteSignature } from '../src/storage.js';

function mockChrome() {
  let store = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key) => ({ [key]: store[key] })),
        set: vi.fn(async (obj) => { Object.assign(store, obj); }),
      },
    },
  };
  globalThis.crypto ??= {};
  let n = 0;
  globalThis.crypto.randomUUID = () => `id-${++n}`;
  // deterministic time
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  return () => store;
}

describe('storage', () => {
  beforeEach(() => { mockChrome(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('starts empty', async () => {
    expect(await listSignatures()).toEqual([]);
  });

  it('adds and lists a signature', async () => {
    const sig = await addSignature('Full', 'data:image/png;base64,AAA');
    expect(sig).toStrictEqual({ id: 'id-1', name: 'Full', dataUrl: 'data:image/png;base64,AAA', createdAt: 1000 });
    const all = await listSignatures();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Full');
  });

  it('renames a signature', async () => {
    const sig = await addSignature('Old', 'data:image/png;base64,AAA');
    await renameSignature(sig.id, 'New');
    const all = await listSignatures();
    expect(all[0].name).toBe('New');
  });

  it('deletes a signature', async () => {
    const sig = await addSignature('X', 'data:image/png;base64,AAA');
    await deleteSignature(sig.id);
    expect(await listSignatures()).toEqual([]);
  });

  it('listSignatures returns records in ascending createdAt order', async () => {
    // First record at t=1000 (set by beforeEach via mockChrome)
    await addSignature('Alpha', 'data:image/png;base64,AAA');
    // Second record at a larger timestamp
    vi.mocked(Date.now).mockReturnValue(3000);
    await addSignature('Gamma', 'data:image/png;base64,CCC');
    // Third record at a smaller timestamp (between first and second)
    vi.mocked(Date.now).mockReturnValue(2000);
    await addSignature('Beta', 'data:image/png;base64,BBB');

    const all = await listSignatures();
    expect(all).toHaveLength(3);
    expect(all.map((s) => s.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(all.map((s) => s.createdAt)).toEqual([1000, 2000, 3000]);
  });

  it('deleteSignature with unknown id leaves list unchanged', async () => {
    await addSignature('Keep', 'data:image/png;base64,AAA');
    await deleteSignature('does-not-exist');
    const all = await listSignatures();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Keep');
  });

  it('renameSignature with unknown id is a silent no-op', async () => {
    await addSignature('Unchanged', 'data:image/png;base64,AAA');
    await renameSignature('does-not-exist', 'X');
    const all = await listSignatures();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Unchanged');
  });
});
