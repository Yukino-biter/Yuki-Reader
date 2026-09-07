import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { lookupDict, chat, chatStream } from '../lib/api.js';
import { tokenizeChapter } from '../lib/tokenize.js';
import { loadBuiltInBook } from '../lib/books.js';

vi.mock('../lib/api.js', () => ({
  lookupDict: vi.fn(),
  chat: vi.fn(),
  chatStream: vi.fn(),
  ApiError: class ApiError extends Error {}
}));

vi.mock('../lib/tokenize.js', () => ({
  loadTokenizer: vi.fn(),
  tokenizeSentence: vi.fn(),
  tokenizeChapter: vi.fn(),
  prefetchChapter: vi.fn(),
  clearTokenCache: vi.fn()
}));

vi.mock('../lib/books.js', () => ({
  loadBuiltInBook: vi.fn(),
  bookFromUploadedText: vi.fn()
}));

const BOOK = {
  id: 'kokoro',
  name: 'こころ',
  author: '夏目漱石',
  sourceLabel: '青空文庫',
  genre: 'literature',
  chapters: [{ title: '上', paragraphs: ['私は学生である。'] }]
};

const BOOK_MULTI = {
  id: 'multi',
  name: '多章节书',
  genre: 'literature',
  chapters: [
    { title: '上', paragraphs: ['私は学生である。'] },
    { title: '中', paragraphs: ['私は教師である。'] },
    { title: '下', paragraphs: ['私は医者である。'] }
  ]
};

const TOKEN_ROWS = [
  [
    { surface: '私', reading: 'わたし', basic: '私', pos: '名詞', clickable: true },
    { surface: 'は', reading: 'は', basic: 'は', pos: '助詞', clickable: true },
    { surface: '学生', reading: 'がくせい', basic: '学生', pos: '名詞', clickable: true },
    { surface: 'である', reading: 'である', basic: 'である', pos: '助動詞', clickable: true },
    { surface: '。', reading: '。', basic: '。', pos: '記号', clickable: false }
  ]
];

async function openBuiltInBook() {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: /内置书/ }));
  await screen.findAllByTestId('sentence');
  await screen.findAllByTestId('word-span');
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('yuki:settings:v1', JSON.stringify({ showFurigana: false }));
  vi.clearAllMocks();
  loadBuiltInBook.mockResolvedValue(BOOK);
  tokenizeChapter.mockResolvedValue(TOKEN_ROWS);
  lookupDict.mockResolvedValue([{ surface: '私', reading: 'わたし', pos: '名詞', glosses: ['I; myself'], glossesZh: ['我；我自己'] }]);
  chat.mockResolvedValue('你好。');
  chatStream.mockImplementation(async (args) => {
    const result = await chat(args);
    args.onDelta?.(result);
    return result;
  });

});

describe('App 冒烟测试', () => {
  it('renders the built-in book as sentences', async () => {
    await openBuiltInBook();
    const sentences = screen.getAllByTestId('sentence');
    expect(sentences[0].textContent).toBe('私は学生である。');
  });

  it('word click shows a dictionary card', async () => {
    await openBuiltInBook();
    await userEvent.click(screen.getAllByTestId('word-span')[0]);
    expect(lookupDict).toHaveBeenCalledWith('私');
    expect(await screen.findByText('我；我自己')).toBeInTheDocument();
  });

  it('shows precomputed Chinese glosses and hides the translate button', async () => {
    lookupDict.mockResolvedValue([{
      surface: '私', reading: 'わたし', pos: '名詞',
      glosses: ['I; myself'], glossesZh: ['我；我自己']
    }]);
    await openBuiltInBook();
    await userEvent.click(screen.getAllByTestId('word-span')[0]);
    expect(await screen.findByText('我；我自己')).toBeInTheDocument();
    expect(screen.queryByText('I; myself')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '中文释义' })).not.toBeInTheDocument();
  });

  it('keeps the translate button but shows no English when Chinese glosses are missing', async () => {
    lookupDict.mockResolvedValue([{
      surface: '私', reading: 'わたし', pos: '名詞',
      glosses: ['I; myself'], glossesZh: []
    }]);
    await openBuiltInBook();
    await userEvent.click(screen.getAllByTestId('word-span')[0]);
    expect(screen.queryByText('I; myself')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '中文释义' })).toBeInTheDocument();
  });

  it('dictionary miss shows the LLM fallback button', async () => {
    lookupDict.mockResolvedValue([]);
    await openBuiltInBook();
    await userEvent.click(screen.getAllByTestId('word-span')[0]);
    expect(await screen.findByText('未找到释义')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '用 LLM 解释这个词' })).toBeInTheDocument();
  });

  it('sentence click replaces the sidebar with a translation card', async () => {
    localStorage.setItem(
      'yuki:byok:v1',
      JSON.stringify({
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKey: 'sk-test'
      })
    );
    await openBuiltInBook();
    await userEvent.click(screen.getAllByTestId('word-span')[0]);
    await screen.findByText('我；我自己');

    const sentence = screen.getAllByTestId('sentence')[0];
    fireEvent.click(sentence);

    // 缓存查找是异步的，chat 在微任务后才发出
    await waitFor(() => expect(chat).toHaveBeenCalled());
    expect(await screen.findByText('你好。')).toBeInTheDocument();
    expect(screen.queryByText('我；我自己')).not.toBeInTheDocument();

    // clicking a word again replaces the translation card (新操作替换旧结果)
    await userEvent.click(screen.getAllByTestId('word-span')[0]);
    expect(await screen.findByText('我；我自己')).toBeInTheDocument();
    expect(screen.queryByText('你好。')).not.toBeInTheDocument();
  });

  it('without an API key, translation shows a settings prompt', async () => {
    await openBuiltInBook();
    fireEvent.click(screen.getAllByTestId('sentence')[0]);
    expect(chat).not.toHaveBeenCalled();
    expect(await screen.findByText(/需要配置 API Key/)).toBeInTheDocument();
  });

  it('bottom navigation switches chapters', async () => {
    loadBuiltInBook.mockResolvedValue(BOOK_MULTI);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /内置书/ }));
    await screen.findAllByTestId('sentence');
    expect(screen.getByRole('heading', { name: '上' })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /下一章/ })[0]);
    expect(screen.getByRole('heading', { name: '中' })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /上一章/ })[0]);
    expect(screen.getByRole('heading', { name: '上' })).toBeInTheDocument();
  });

  it('arrow keys switch chapters', async () => {
    loadBuiltInBook.mockResolvedValue(BOOK_MULTI);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /内置书/ }));
    await screen.findAllByTestId('sentence');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByRole('heading', { name: '中' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(await screen.findByRole('heading', { name: '上' })).toBeInTheDocument();
  });

  it('catalog lists chapters and jumps to the selected one', async () => {
    loadBuiltInBook.mockResolvedValue(BOOK_MULTI);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /内置书/ }));
    await screen.findAllByTestId('sentence');
    await userEvent.click(screen.getAllByRole('button', { name: '目录' })[0]);
    const dialog = await screen.findByRole('dialog', { name: '目录' });
    await userEvent.click(within(dialog).getByRole('button', { name: '下' }));
    expect(screen.getByRole('heading', { name: '下' })).toBeInTheDocument();
  });

  it('brand click returns to the welcome screen', async () => {
    await openBuiltInBook();
    await userEvent.click(screen.getByRole('button', { name: '返回主界面' }));
    expect(screen.getByRole('button', { name: '上传文件' })).toBeInTheDocument();
  });

  it('homepage hides the right sidebar and collapses the left nav', async () => {
    render(<App />);
    expect(document.querySelector('.sidebar-pane')).toBeNull();
    expect(document.querySelector('.home-sidebar')).not.toHaveClass('collapsed');
    await userEvent.click(screen.getByRole('button', { name: '收起侧栏' }));
    expect(document.querySelector('.home-sidebar')).toHaveClass('collapsed');
    await userEvent.click(screen.getByRole('button', { name: '展开侧栏' }));
    expect(document.querySelector('.home-sidebar')).not.toHaveClass('collapsed');
  });

  it('homepage shows feature intro and operation guide', async () => {
    render(<App />);
    await screen.findByText(/还没有上传的书/);
    expect(screen.getByRole('heading', { name: '特点简介' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '操作说明' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: '点词查词典' })).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '拖选翻译' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '点句翻译' })).toBeInTheDocument();
    expect(screen.queryByText(/无痛阅读/)).not.toBeInTheDocument();
    expect(screen.queryByText(/示例图片/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/在底部「设置」中配置 API/)).toHaveLength(2);
    expect(screen.getByText(/分词无需配置/)).toBeInTheDocument();
  });

  it('homepage shows the favicon in the sidebar brand seal', async () => {
    render(<App />);
    await screen.findByText(/还没有上传的书/);
    const img = document.querySelector('.home-brand-seal img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toContain('yuki-icon.svg');
  });

  it('homepage keeps its own style when the global theme toggles', async () => {
    render(<App />);
    await screen.findByText(/还没有上传的书/);
    expect(document.querySelector('.app')).toHaveClass('app-home');
    expect(document.querySelector('.app')).toHaveAttribute('data-theme', 'default');
    await userEvent.click(screen.getByRole('button', { name: '夜间' }));
    expect(document.querySelector('.app')).toHaveAttribute('data-theme', 'dark');
    expect(document.querySelector('.app')).toHaveClass('app-home');
  });

  it('usage modal explains the three operations', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '使用说明' }));
    const dialog = await screen.findByRole('dialog', { name: '使用说明' });
    expect(within(dialog).getByText(/点击正文中的任意单词/)).toBeInTheDocument();
    expect(within(dialog).getByText(/拖选一段文字/)).toBeInTheDocument();
    expect(within(dialog).getByText(/句子的空白处/)).toBeInTheDocument();
  });

  it('saves the furigana toggle from reading settings', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '阅读设置' }));
    await userEvent.click(screen.getByRole('button', { name: '关' }));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(JSON.parse(localStorage.getItem('yuki:settings:v1')).showFurigana).toBe(false);
  });

  it('saves theme and font size from the reading settings', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '阅读设置' }));
    await userEvent.click(screen.getByRole('radio', { name: '护眼绿' }));
    await userEvent.click(screen.getByRole('button', { name: '增大字号' }));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(document.querySelector('.app')).toHaveAttribute('data-theme', 'green');
    expect(JSON.parse(localStorage.getItem('yuki:settings:v1')).fontSize).toBe(20);
  });

  it('toggles dark theme from the top bar', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '夜间' }));
    expect(document.querySelector('.app')).toHaveAttribute('data-theme', 'dark');
    await userEvent.click(screen.getByRole('button', { name: '日间' }));
    expect(document.querySelector('.app')).toHaveAttribute('data-theme', 'default');
  });
});
