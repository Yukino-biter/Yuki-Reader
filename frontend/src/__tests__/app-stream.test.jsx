import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { chatStream } from '../lib/api.js';
import { tokenizeChapter } from '../lib/tokenize.js';
import { getTranslation } from '../lib/translationCache.js';
import { loadBuiltInBook, bookFromUploadedText } from '../lib/books.js';
import { getUploadedBook, listUploadedBooks } from '../lib/storage.js';

vi.mock('../lib/api.js', () => ({
  lookupDict: vi.fn(),
  chat: vi.fn(),
  chatStream: vi.fn(),
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
  translationCacheKey: vi.fn((m, g, h, t) => `k:${t}`),
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
  name: '流式书',
  author: '',
  genre: 'generic',
  genreManual: true,
  chapters: [{ title: '第 1 章', paragraphs: ['私は学生である。'] }]
};

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
  listUploadedBooks.mockResolvedValue([{ id: 'u1', name: '流式书', uploadedAt: 1 }]);
  getUploadedBook.mockResolvedValue({
    id: 'u1', name: '流式书', text: 'x', uploadedAt: 1, genre: 'generic', genreManual: true
  });
  bookFromUploadedText.mockReturnValue(BOOK);
});

describe('流式翻译', () => {
  it('renders deltas progressively and finishes with copy button', async () => {
    configByok();
    let release;
    chatStream.mockImplementation(
      ({ onDelta }) =>
        new Promise((resolve) => {
          onDelta('第一段');
          release = () => {
            onDelta('第二段');
            resolve('第一段第二段');
          };
        })
    );
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '流式书' }));
    await screen.findAllByTestId('sentence');

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await screen.findByText('第一段');
    const pane = screen.getByRole('complementary');
    expect(within(pane).queryByRole('button', { name: '复制' })).not.toBeInTheDocument(); // 流中不可复制

    release();
    await screen.findByText('第一段第二段');
    expect(within(pane).getByRole('button', { name: '复制' })).toBeInTheDocument();
  });

  it('shows the error card with retry when the stream fails', async () => {
    configByok();
    chatStream.mockRejectedValueOnce(new Error('流断了'));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '流式书' }));
    await screen.findAllByTestId('sentence');

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await screen.findByText('流断了');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
