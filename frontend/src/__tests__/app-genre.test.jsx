import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { chat } from '../lib/api.js';
import { tokenizeChapter } from '../lib/tokenize.js';
import { getUploadedBook, listUploadedBooks, saveUploadedBook } from '../lib/storage.js';
import { loadBuiltInBook, bookFromUploadedText } from '../lib/books.js';

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
  saveUploadedBook: vi.fn()
}));

const TOKEN_ROWS = [
  [{ surface: '私', reading: 'わたし', basic: '私', pos: '名詞', clickable: true }]
];

function uploadedBook(overrides = {}) {
  return {
    id: 'tmp',
    name: 'テスト本',
    author: '',
    genre: null,
    genreManual: false,
    chapters: [
      {
        title: '第 1 章',
        paragraphs: ['「やあ」と彼は言った。', '彼は笑った。']
      }
    ],
    ...overrides
  };
}

async function openUploadedBook(book) {
  listUploadedBooks.mockResolvedValue([{ id: 'u1', name: 'テスト本', uploadedAt: 1 }]);
  // 存储记录是 genre 的持久化来源，handleOpenUploaded 会以它覆盖书对象
  getUploadedBook.mockResolvedValue({
    id: 'u1',
    name: 'テスト本',
    text: 'x',
    uploadedAt: 1,
    genre: book.genre ?? null,
    genreManual: !!book.genreManual
  });
  bookFromUploadedText.mockReturnValue(book);
  render(<App />);
  // 书列表是 mount 后异步加载的，先等列表项出现再点
  await userEvent.click(await screen.findByRole('button', { name: 'テスト本' }));
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
});

describe('书籍类别判定与提示词路由', () => {
  it('classifies an untagged uploaded book once and persists the genre', async () => {
    configByok();
    chat.mockResolvedValue('「lightnovel」。');
    await openUploadedBook(uploadedBook());

    const select = await screen.findByLabelText('书籍类别');
    await waitFor(() => expect(select).toHaveValue('lightnovel'));
    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat.mock.calls[0][0].messages[0].content).toContain('分类器');
    expect(chat.mock.calls[0][0].messages[1].content).toContain('书名：テスト本');
    expect(saveUploadedBook).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', genre: 'lightnovel' }));
  });

  it('does not classify when the book already has a genre', async () => {
    configByok();
    chat.mockResolvedValue('generic');
    await openUploadedBook(uploadedBook({ genre: 'literature', genreManual: true }));

    await screen.findAllByTestId('sentence');
    await new Promise((r) => setTimeout(r, 20));
    expect(chat).not.toHaveBeenCalled();
    expect(screen.getByLabelText('书籍类别')).toHaveValue('literature');
  });

  it('does not classify without an API key', async () => {
    chat.mockResolvedValue('generic');
    await openUploadedBook(uploadedBook());

    await screen.findAllByTestId('sentence');
    await new Promise((r) => setTimeout(r, 20));
    expect(chat).not.toHaveBeenCalled();
  });

  it('manual selection wins over a pending auto classification and persists genreManual', async () => {
    configByok();
    chat.mockResolvedValue('lightnovel');
    await openUploadedBook(uploadedBook());

    fireEvent.change(screen.getByLabelText('书籍类别'), { target: { value: 'literature' } });

    await waitFor(() =>
      expect(saveUploadedBook).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', genre: 'literature', genreManual: true })
      )
    );
    // 分类请求返回 lightnovel，但不得覆盖手动设置
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText('书籍类别')).toHaveValue('literature');
  });

  it('routes the translation system prompt by genre', async () => {
    configByok();
    chat.mockResolvedValue('轻小说腔译文');
    await openUploadedBook(uploadedBook({ genre: 'lightnovel' }));

    await userEvent.click(screen.getAllByTestId('word-span')[0].closest('[data-testid="sentence"]'));
    await screen.findByText('轻小说腔译文');

    const call = chat.mock.calls.find((c) => c[0].messages[1].content.includes('「やあ」と彼は言った。'));
    expect(call).toBeTruthy();
    expect(call[0].messages[0].content).toContain('轻小说');
  });

  it('injects the two preceding sentences as context for sentence clicks', async () => {
    configByok();
    await openUploadedBook(uploadedBook());

    // 点击第二句：首次请求失败，错误卡出现「重试」
    chat.mockRejectedValueOnce(new Error('boom'));
    await userEvent.click(screen.getAllByTestId('sentence')[1]);
    await screen.findByText('boom');

    // 重试成功，且重试请求保留上下文
    chat.mockResolvedValue('译文');
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    await screen.findByText('译文');

    const call = chat.mock.calls.at(-1);
    expect(call[0].messages[1].content).toContain('【上文参考');
    expect(call[0].messages[1].content).toContain('「やあ」と彼は言った。');
    expect(call[0].messages[1].content).toContain('【待翻译】\n彼は笑った。');
  });
});
