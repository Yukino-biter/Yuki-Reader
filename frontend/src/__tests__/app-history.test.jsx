import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { chat } from '../lib/api.js';
import { tokenizeChapter } from '../lib/tokenize.js';
import { getTranslation } from '../lib/translationCache.js';
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
  name: '历史书',
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
  tokenizeChapter.mockResolvedValue(TOKEN_ROWS);
  getTranslation.mockResolvedValue(null);
  listUploadedBooks.mockResolvedValue([{ id: 'u1', name: '历史书', uploadedAt: 1 }]);
  getUploadedBook.mockResolvedValue({
    id: 'u1', name: '历史书', text: 'x', uploadedAt: 1, genre: 'generic', genreManual: true
  });
  bookFromUploadedText.mockReturnValue(BOOK);
});

describe('侧栏翻译历史', () => {
  it('records translations, replays an entry and exits on new actions', async () => {
    configByok();
    chat.mockResolvedValueOnce('译文一').mockResolvedValueOnce('译文二').mockResolvedValueOnce('译文三');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '历史书' }));
    await screen.findAllByTestId('sentence');

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await screen.findByText('译文一');
    await userEvent.click(screen.getAllByTestId('sentence')[1]);
    await screen.findByText('译文二');

    // 当前结果是第二条，历史里两条都有（断言收窄到侧栏，避开正文同名句子）
    const pane = screen.getByRole('complementary');
    await userEvent.click(within(pane).getByRole('button', { name: '历史（2）' }));
    expect(within(pane).getByText('私は学生である。')).toBeInTheDocument();
    expect(within(pane).getByText('彼は笑った。')).toBeInTheDocument();

    // 回放第一条
    await userEvent.click(within(pane).getByText('译文一'));
    expect(within(pane).getByRole('button', { name: '复制' })).toBeInTheDocument();

    // 新操作退出历史视图并替换卡片
    await userEvent.click(screen.getAllByTestId('sentence')[2]);
    await screen.findByText('译文三');
    const paneAfter = screen.getByRole('complementary');
    expect(within(paneAfter).getByRole('button', { name: '历史（3）' })).toBeInTheDocument();
  });
});
