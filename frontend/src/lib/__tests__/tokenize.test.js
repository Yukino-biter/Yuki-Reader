import { describe, expect, it, vi, beforeEach } from 'vitest';
import { tokenizeChapter } from '../tokenize.js';
import { tokenizeSentences } from '../api.js';
import { getTokenRows, putTokenRows } from '../tokenCache.js';

vi.mock('../api.js', () => ({
  tokenizeSentences: vi.fn()
}));

vi.mock('../tokenCache.js', () => ({
  chapterCacheKey: vi.fn((bookId, chapterIndex, text) => `${bookId}:${chapterIndex}:${text}`),
  getTokenRows: vi.fn(),
  putTokenRows: vi.fn(),
  clearForBook: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  getTokenRows.mockResolvedValue(null);
  putTokenRows.mockResolvedValue(undefined);
  tokenizeSentences.mockImplementation(async (batch) =>
    batch.map((s) => [{ surface: s, reading: s, basic: s, pos: '名詞', clickable: true }])
  );
});

describe('tokenizeChapter（后端分批分词）', () => {
  it('sends 24-sentence batches and reports partial rows', async () => {
    const sentences = Array.from({ length: 25 }, (_, i) => `文${i}。`);
    const progress = [];

    const rows = await tokenizeChapter('book-1', 0, sentences, (r) => progress.push(r.length));

    expect(rows).toHaveLength(25);
    expect(rows[0]).toEqual([
      { surface: '文0。', reading: '文0。', basic: '文0。', pos: '名詞', clickable: true }
    ]);
    expect(tokenizeSentences).toHaveBeenCalledTimes(2);
    expect(tokenizeSentences.mock.calls[0][0]).toHaveLength(24);
    expect(tokenizeSentences.mock.calls[1][0]).toHaveLength(1);
    expect(progress.length).toBeGreaterThan(1);
    expect(progress[progress.length - 1]).toBe(25);
  });

  it('hits the session cache on subsequent calls without calling the API', async () => {
    const sentences = ['私は学生である。'];
    await tokenizeChapter('book-2', 3, sentences);

    const progress = [];
    await tokenizeChapter('book-2', 3, sentences, (r) => progress.push(r.length));

    expect(tokenizeSentences).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([1]);
  });

  it('keeps separate cache entries per book+chapter', async () => {
    await tokenizeChapter('book-3', 0, ['文。']);
    await tokenizeChapter('book-3', 1, ['文。']);
    expect(tokenizeSentences).toHaveBeenCalledTimes(2);
  });

  it('propagates API errors', async () => {
    tokenizeSentences.mockRejectedValueOnce(new Error('词典服务暂不可用，请稍后重试。'));
    await expect(tokenizeChapter('book-4', 0, ['文。'])).rejects.toThrow(
      '词典服务暂不可用，请稍后重试。'
    );
  });
});

describe('持久缓存（IndexedDB）', () => {
  it('skips the API when the persistent cache hits', async () => {
    const cached = [[{ surface: '私', reading: 'わたし', basic: '私', pos: '名詞', clickable: true }]];
    getTokenRows.mockResolvedValue(cached);
    const progress = [];

    const rows = await tokenizeChapter('pc-book-1', 0, ['私は学生である。'], (r) => progress.push(r));

    expect(rows).toBe(cached);
    expect(progress).toEqual([cached]);
    expect(tokenizeSentences).not.toHaveBeenCalled();
    expect(putTokenRows).not.toHaveBeenCalled();
  });

  it('writes back to the persistent cache after tokenizing', async () => {
    const rows = await tokenizeChapter('pc-book-2', 0, ['文。']);
    expect(putTokenRows).toHaveBeenCalledTimes(1);
    expect(putTokenRows.mock.calls[0][0]).toBe('pc-book-2:0:文。'); // chapterCacheKey mock 透传
    expect(putTokenRows.mock.calls[0][1]).toBe('pc-book-2');
    expect(putTokenRows.mock.calls[0][2]).toEqual(rows);
  });

  it('does not write back when tokenization fails', async () => {
    tokenizeSentences.mockRejectedValueOnce(new Error('词典服务暂不可用，请稍后重试。'));
    await expect(tokenizeChapter('pc-book-3', 0, ['文。'])).rejects.toThrow(
      '词典服务暂不可用，请稍后重试。'
    );
    expect(putTokenRows).not.toHaveBeenCalled();
  });
});
