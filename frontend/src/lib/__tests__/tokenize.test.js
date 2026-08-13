import { describe, expect, it, vi, beforeEach } from 'vitest';
import { tokenizeChapter } from '../tokenize.js';
import { tokenizeSentences } from '../api.js';

vi.mock('../api.js', () => ({
  tokenizeSentences: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  tokenizeSentences.mockImplementation(async (batch) =>
    batch.map((s) => [{ surface: s, reading: s, basic: s, pos: '名詞', clickable: true }])
  );
});

describe('tokenizeChapter（后端分批分词）', () => {
  it('sends 12-sentence batches and reports partial rows', async () => {
    const sentences = Array.from({ length: 25 }, (_, i) => `文${i}。`);
    const progress = [];

    const rows = await tokenizeChapter('book-1', 0, sentences, (r) => progress.push(r.length));

    expect(rows).toHaveLength(25);
    expect(rows[0]).toEqual([
      { surface: '文0。', reading: '文0。', basic: '文0。', pos: '名詞', clickable: true }
    ]);
    expect(tokenizeSentences).toHaveBeenCalledTimes(3);
    expect(tokenizeSentences.mock.calls[0][0]).toHaveLength(12);
    expect(tokenizeSentences.mock.calls[1][0]).toHaveLength(12);
    expect(tokenizeSentences.mock.calls[2][0]).toHaveLength(1);
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
