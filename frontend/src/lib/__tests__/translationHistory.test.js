import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadHistory, saveHistory } from '../translationHistory.js';
import { openDb } from '../storage.js';

const actual = vi.hoisted(() => ({ openDb: null }));
vi.mock('../storage.js', async (importOriginal) => {
  const mod = await importOriginal();
  actual.openDb = mod.openDb;
  return { ...mod, openDb: vi.fn() };
});

async function freshStore() {
  const db = await actual.openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('translation-history', 'readwrite');
    tx.objectStore('translation-history').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

beforeEach(async () => {
  openDb.mockImplementation((...args) => actual.openDb(...args));
  await freshStore();
});

describe('loadHistory / saveHistory', () => {
  it('round-trips entries sorted by at descending', async () => {
    await saveHistory([
      { id: 'a', original: '一。', result: '1', at: 1 },
      { id: 'b', original: '二。', result: '2', at: 2 }
    ]);
    expect(await loadHistory()).toEqual([
      { id: 'b', original: '二。', result: '2', at: 2 },
      { id: 'a', original: '一。', result: '1', at: 1 }
    ]);
  });

  it('mirrors the whole list (clear + rewrite)', async () => {
    await saveHistory([{ id: 'a', original: '一。', result: '1', at: 1 }]);
    await saveHistory([{ id: 'b', original: '二。', result: '2', at: 2 }]);
    expect(await loadHistory()).toEqual([{ id: 'b', original: '二。', result: '2', at: 2 }]);
  });

  it('degrades silently when IndexedDB is unavailable', async () => {
    openDb.mockRejectedValue(new Error("idb unavailable"));
    await expect(saveHistory([{ id: 'a', original: '一。', result: '1', at: 1 }])).resolves.toBeUndefined();
    await expect(loadHistory()).resolves.toEqual([]);
  });
});
