import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { translationCacheKey, getTranslation, putTranslation } from '../translationCache.js';
import { openDb } from '../storage.js';

async function freshStores() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['translation-cache', 'glossaries'], 'readwrite');
    tx.objectStore('translation-cache').clear();
    tx.objectStore('glossaries').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

beforeEach(freshStores);

describe('translationCacheKey', () => {
  const base = ['deepseek-v4-flash', 'lightnovel', '', '私は学生である。', null];

  it('is stable for identical inputs', () => {
    expect(translationCacheKey(...base)).toBe(translationCacheKey(...base));
  });

  it('changes when any component changes', () => {
    const [model, genre, glossaryHash, text, context] = base;
    expect(translationCacheKey('other-model', genre, glossaryHash, text, context))
      .not.toBe(translationCacheKey(...base));
    expect(translationCacheKey(model, 'literature', glossaryHash, text, context))
      .not.toBe(translationCacheKey(...base));
    expect(translationCacheKey(model, genre, 'abc123', text, context))
      .not.toBe(translationCacheKey(...base));
    expect(translationCacheKey(model, genre, glossaryHash, '別の文。', context))
      .not.toBe(translationCacheKey(...base));
    expect(translationCacheKey(model, genre, glossaryHash, text, ['前文。']))
      .not.toBe(translationCacheKey(...base));
  });
});

describe('getTranslation / putTranslation', () => {
  it('round-trips results and returns null for misses', async () => {
    const key = translationCacheKey(...['m', 'generic', '', '文。', null]);
    expect(await getTranslation(key)).toBeNull();

    await putTranslation(key, '译文。');
    expect(await getTranslation(key)).toBe('译文。');
  });

  it('overwrites on the same key', async () => {
    const key = translationCacheKey(...['m', 'generic', '', '文。', null]);
    await putTranslation(key, '旧译文');
    await putTranslation(key, '新译文');
    expect(await getTranslation(key)).toBe('新译文');
  });
});
