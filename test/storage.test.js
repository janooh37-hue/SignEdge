import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('starts empty', async () => {
    expect(await listSignatures()).toEqual([]);
  });

  it('adds and lists a signature', async () => {
    const sig = await addSignature('Full', 'data:image/png;base64,AAA');
    expect(sig).toMatchObject({ id: 'id-1', name: 'Full', dataUrl: 'data:image/png;base64,AAA', createdAt: 1000 });
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
});
