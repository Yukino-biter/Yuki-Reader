import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const WORD = { surface: '私', reading: 'わたし', basic: '私', pos: '名詞', clickable: true };
// 一句的 token 行（两个词）
const SENTENCE_TOKENS = [WORD, WORD];

const BOOK = {
  id: 'u1',
  name: '上下文书',
  author: '',
  genre: 'generic',
  genreManual: true,
  chapters: [{ title: '第 1 章', paragraphs: ['私は学生である。', '彼は笑った。', '今日は晴れ。'] }]
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
  chatStream.mockResolvedValue('译文');
  getTranslation.mockResolvedValue(null);
  listUploadedBooks.mockResolvedValue([{ id: 'u1', name: '上下文书', uploadedAt: 1 }]);
  getUploadedBook.mockResolvedValue({
    id: 'u1', name: '上下文书', text: 'x', uploadedAt: 1, genre: 'generic', genreManual: true
  });
  bookFromUploadedText.mockReturnValue(BOOK);
});

async function openBook() {
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: '上下文书' }));
  await screen.findAllByTestId('sentence');
}

// Range + mouseUp 模拟拖选（沿用 Sentence.test.jsx 的手法）
function selectAll(container) {
  const range = document.createRange();
  range.selectNodeContents(container);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.mouseUp(container);
}

it('tokenized-path selection carries the two previous sentences', async () => {
  configByok();
  tokenizeChapter.mockResolvedValue([SENTENCE_TOKENS, SENTENCE_TOKENS, SENTENCE_TOKENS]);
  await openBook();

  const sentences = screen.getAllByTestId('sentence');
  selectAll(sentences[2]);
  await screen.findByText('译文');

  const userContent = chatStream.mock.calls.at(-1)[0].messages[1].content;
  expect(userContent).toContain('【上文参考');
  expect(userContent).toContain('私は学生である。');
  expect(userContent).toContain('彼は笑った。');
  expect(userContent).toContain('【待翻译】');
});

it('plain-path selection carries the two previous sentences', async () => {
  configByok();
  tokenizeChapter.mockResolvedValue([SENTENCE_TOKENS, null, null]);
  await openBook();

  const sentences = screen.getAllByTestId('sentence');
  selectAll(sentences[2]);
  await screen.findByText('译文');

  const userContent = chatStream.mock.calls.at(-1)[0].messages[1].content;
  expect(userContent).toContain('【上文参考');
  expect(userContent).toContain('私は学生である。');
  expect(userContent).toContain('彼は笑った。');
});
