import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { removeUploadedBook, listUploadedBooks } from '../lib/storage.js';
import { clearForBook } from '../lib/tokenCache.js';

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

vi.mock('../lib/books.js', () => ({
  loadBuiltInBook: vi.fn(),
  bookFromUploadedText: vi.fn()
}));

vi.mock('../lib/storage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listUploadedBooks: vi.fn(),
  getUploadedBook: vi.fn(),
  saveUploadedBook: vi.fn(),
  removeUploadedBook: vi.fn()
}));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('yuki:settings:v1', JSON.stringify({ showFurigana: false }));
  vi.clearAllMocks();
  // 首次加载返回书列表，之后（删除后的 refreshLibrary）返回空
  listUploadedBooks.mockResolvedValue([]);
  listUploadedBooks.mockResolvedValueOnce([{ id: 'u1', name: '删除测试', encoding: 'UTF-8', uploadedAt: 1 }]);
  removeUploadedBook.mockResolvedValue(undefined);
});

describe('首页删书接线', () => {
  it('deletes the record and its token cache after confirmation', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '删除 删除测试' }));
    await userEvent.click(await screen.findByRole('button', { name: '删除', exact: true }));

    expect(removeUploadedBook).toHaveBeenCalledWith('u1');
    expect(clearForBook).toHaveBeenCalledWith('u1');
    // 删除后列表刷新，该书从文件列表消失
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '删除 删除测试' })).not.toBeInTheDocument()
    );
  });
});
