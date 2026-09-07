import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { chat } from '../lib/api.js';
import { tokenizeChapter } from '../lib/tokenize.js';
import { getTranslation, putTranslation } from '../lib/translationCache.js';
import { loadBuiltInBook, bookFromUploadedText } from '../lib/books.js';
import { getUploadedBook, listUploadedBooks } from '../lib/storage.js';

vi.mock('../lib/api.js', () => ({
  lookupDict: vi.fn(),
  chat: vi.fn(),
  ApiError: class ApiError extends Error {}
}));

vi.mock('../lib/tokenize.js', () => ({
  tokenizeChapter: vi.fn(),
  prefetchChapter: vi.fn(),
  clearTokenCache: vi.fn()
}));

vi.mock('../lib/tokenCache.js', () => ({
  chapterCacheKey: vi.fn(),
  getTokenRows: vi.fn(),
  putTokenRows: vi.fn(),
  clearForBook: vi.fn()
}));

vi.mock('../lib/translationCache.js', () => ({
  translationCacheKey: vi.fn((m, g, h, t) => `k:${m}:${g}:${h}:${t}`),
  getTranslation: vi.fn(),
  putTranslation: vi.fn()
}));

vi.mock('../lib/books.js', () => ({
  loadBuiltInBook: vi.fn(),
  bookFromUploadedText: vi.fn()
}));

vi.mock('../lib/storage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listUploadedBooks: vi.fn(),
  getUploadedBook: vi.fn(),
  saveUploadedBook: vi.fn()
}));

const TOKEN_ROWS = [
  [{ surface: '私', reading: 'わたし', basic: '私', pos: '名詞', clickable: true }]
];

const BOOK = {
  id: 'u1',
  name: '缓存书',
  author: '',
  genre: 'generic',
  genreManual: true,
  chapters: [{ title: '第 1 章', paragraphs: ['私は学生である。', '彼は笑った。'] }]
};

async function openBook() {
  listUploadedBooks.mockResolvedValue([{ id: 'u1', name: '缓存书', uploadedAt: 1 }]);
  getUploadedBook.mockResolvedValue({
    id: 'u1', name: '缓存书', text: 'x', uploadedAt: 1, genre: 'generic', genreManual: true
  });
  bookFromUploadedText.mockReturnValue(BOOK);
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: '缓存书' }));
  await screen.findAllByTestId('sentence');
}

function configByok() {
  localStorage.setItem(
    'yuki:byok:v1',
    JSON.stringify({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'm', apiKey: 'sk-test' })
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('yuki:settings:v1', JSON.stringify({ showFurigana: false }));
  vi.clearAllMocks();
  tokenizeChapter.mockResolvedValue(TOKEN_ROWS);
  getTranslation.mockResolvedValue(null);
  putTranslation.mockResolvedValue(undefined);
});

describe('翻译结果缓存', () => {
  it('cache hit shows the result without a network request', async () => {
    configByok();
    getTranslation.mockResolvedValue('缓存译文');
    await openBook();

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    expect(await screen.findByText('缓存译文')).toBeInTheDocument();
    expect(chat).not.toHaveBeenCalled();
    expect(putTranslation).not.toHaveBeenCalled();
  });

  it('cache miss requests the network and writes the result back', async () => {
    configByok();
    chat.mockResolvedValue('网络译文');
    await openBook();

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await screen.findByText('网络译文');
    expect(chat).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(putTranslation).toHaveBeenCalledTimes(1));
    expect(putTranslation.mock.calls[0][0]).toContain('k:m:generic:');
    expect(putTranslation.mock.calls[0][1]).toBe('网络译文');
  });

  it('network failure does not write the cache', async () => {
    configByok();
    chat.mockRejectedValueOnce(new Error('boom'));
    await openBook();

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await screen.findByText('boom');
    expect(putTranslation).not.toHaveBeenCalled();
  });
});
