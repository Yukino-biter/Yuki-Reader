import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  GLOSSARY_MAX_ENTRIES,
  normalizeGlossary,
  glossaryHash,
  serializeGlossary,
  getGlossary,
  saveGlossary,
  clearGlossary
} from '../glossary.js';
import { openDb } from '../storage.js';

async function freshStores() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('glossaries', 'readwrite');
    tx.objectStore('glossaries').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

beforeEach(freshStores);

describe('normalizeGlossary', () => {
  it('trims, drops blanks and dedupes by from (last wins)', () => {
    expect(
      normalizeGlossary([
        { from: ' ルルーシュ ', to: ' 鲁路修 ' },
        { from: '', to: '空' },
        { from: 'ルルーシュ', to: '  ' },
        { from: 'ルルーシュ', to: '路路修' }
      ])
    ).toEqual([{ from: 'ルルーシュ', to: '路路修' }]);
  });
});

describe('serializeGlossary（双上限）', () => {
  it('caps entries at GLOSSARY_MAX_ENTRIES', () => {
    const entries = Array.from({ length: GLOSSARY_MAX_ENTRIES + 10 }, (_, i) => ({
      from: `ナノ${i}`,
      to: `纳米${i}`
    }));
    const lines = serializeGlossary(entries).split('\n');
    expect(lines).toHaveLength(GLOSSARY_MAX_ENTRIES);
  });

  it('caps serialized characters at GLOSSARY_MAX_CHARS', () => {
    const entries = [{ from: 'あ'.repeat(2000), to: '长' }];
    expect(serializeGlossary(entries)).toBe('');
  });

  it('renders from → to lines', () => {
    expect(serializeGlossary([{ from: 'ルルーシュ', to: '鲁路修' }])).toBe('ルルーシュ → 鲁路修');
  });
});

describe('glossaryHash', () => {
  it('is stable, sensitive, and empty for empty glossaries', () => {
    const a = [{ from: 'A', to: '甲' }];
    expect(glossaryHash(a)).toBe(glossaryHash([{ from: 'A', to: '甲' }]));
    expect(glossaryHash(a)).not.toBe(glossaryHash([{ from: 'A', to: '乙' }]));
    expect(glossaryHash([])).toBe('');
  });
});

describe('getGlossary / saveGlossary / clearGlossary', () => {
  it('round-trips per book and clears one book only', async () => {
    expect(await getGlossary('b1')).toEqual([]);

    const saved = await saveGlossary('b1', [{ from: ' ナイトメア ', to: ' 噩梦 ' }]);
    expect(saved).toEqual([{ from: 'ナイトメア', to: '噩梦' }]);
    await saveGlossary('b2', [{ from: 'X', to: '叉' }]);

    expect(await getGlossary('b1')).toEqual([{ from: 'ナイトメア', to: '噩梦' }]);
    await clearGlossary('b1');
    expect(await getGlossary('b1')).toEqual([]);
    expect(await getGlossary('b2')).toEqual([{ from: 'X', to: '叉' }]);
  });
});
