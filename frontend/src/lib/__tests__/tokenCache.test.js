import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { chapterCacheKey, getTokenRows, putTokenRows, clearForBook } from '../tokenCache.js';
import { openDb } from '../storage.js';

// 用 clear 清空数据而非 deleteDatabase：删库会被遗留的未关闭连接 block。
async function freshDb() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('token-cache', 'readwrite');
    tx.objectStore('token-cache').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

beforeEach(freshDb);

describe('chapterCacheKey', () => {
  it('changes when the chapter text changes', () => {
    const a = chapterCacheKey('b1', 0, '本文一。');
    const b = chapterCacheKey('b1', 0, '本文二。');
    const c = chapterCacheKey('b1', 1, '本文一。');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe(chapterCacheKey('b1', 0, '本文一。')); // 同内容稳定
  });
});

describe('getTokenRows / putTokenRows', () => {
  it('round-trips rows and returns null for misses', async () => {
    const key = chapterCacheKey('b1', 0, '本文。');
    expect(await getTokenRows(key)).toBeNull();

    const rows = [[{ surface: '私', reading: 'わたし', basic: '私', pos: '名詞', clickable: true }]];
    await putTokenRows(key, 'b1', rows);
    expect(await getTokenRows(key)).toEqual(rows);
  });
});

describe('clearForBook', () => {
  it('removes only the target book’s entries', async () => {
    const rows = [[]];
    await putTokenRows(chapterCacheKey('b1', 0, 'a'), 'b1', rows);
    await putTokenRows(chapterCacheKey('b1', 1, 'b'), 'b1', rows);
    await putTokenRows(chapterCacheKey('b2', 0, 'a'), 'b2', rows);

    await clearForBook('b1');

    expect(await getTokenRows(chapterCacheKey('b1', 0, 'a'))).toBeNull();
    expect(await getTokenRows(chapterCacheKey('b1', 1, 'b'))).toBeNull();
    expect(await getTokenRows(chapterCacheKey('b2', 0, 'a'))).toEqual(rows);
  });
});
