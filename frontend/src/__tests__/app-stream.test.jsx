import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { chatStream } from '../lib/api.js';
import { tokenizeChapter } from '../lib/tokenize.js';
import { getTranslation, putTranslation } from '../lib/translationCache.js';
import { saveHistory } from '../lib/translationHistory.js';
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

vi.mock('../lib/translationHistory.js', () => ({
  loadHistory: vi.fn(async () => []),
  saveHistory: vi.fn()
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
  chapters: [{ title: '第 1 章', paragraphs: ['私は学生である。', '彼は笑った。'] }]
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

  it('aborts the previous stream when a new translation starts', async () => {
    configByok();
    const signals = [];
    chatStream
      .mockImplementationOnce(({ onDelta, signal }) => {
        signals.push(signal);
        return new Promise(() => {
          onDelta('旧流');
        });
      })
      .mockImplementationOnce(({ onDelta }) => new Promise((resolve) => {
        onDelta('新流');
        resolve('新流');
      }));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '流式书' }));
    await screen.findAllByTestId('sentence');

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await screen.findByText('旧流');
    await userEvent.click(screen.getAllByTestId('sentence')[1]);
    await screen.findByText('新流');

    expect(signals[0].aborted).toBe(true);
    const pane = screen.getByRole('complementary');
    expect(within(pane).queryByText('旧流')).not.toBeInTheDocument();
  });

  it('re-translating the same text does not interleave old deltas', async () => {
    configByok();
    const deltas = [];
    const signals = [];
    let pendingResolve;
    chatStream.mockImplementation(({ onDelta, signal }) => {
      deltas.push(onDelta);
      signals.push(signal);
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('已中止', 'AbortError')));
        pendingResolve = resolve;
      });
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '流式书' }));
    await screen.findAllByTestId('sentence');

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await userEvent.click(screen.getAllByTestId('sentence')[0]); // 同一句再点

    expect(signals[0].aborted).toBe(true);
    await act(async () => {
      deltas[0]('甲'); // 旧流迟到 delta，必须被丢弃
    });
    await act(async () => {
      deltas[1]('乙');
      deltas[1]('乙');
      pendingResolve('乙乙');
    });

    await screen.findByText('乙乙');
    expect(screen.queryByText('甲乙乙')).not.toBeInTheDocument();
    expect(screen.queryByText('甲')).not.toBeInTheDocument();
  });

  it('stop keeps the partial result without writing cache or history', async () => {    configByok();
    let streamDelta;
    chatStream.mockImplementation(({ onDelta, signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('已中止', 'AbortError')));
      streamDelta = onDelta;
    }));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '流式书' }));
    await screen.findAllByTestId('sentence');

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await act(async () => {
      streamDelta('部分译');
    });
    await screen.findByText('部分译');

    await userEvent.click(screen.getByRole('button', { name: '停止' }));
    await screen.findByText('已停止，译文可能不完整。');
    const pane = screen.getByRole('complementary');
    expect(within(pane).getByRole('button', { name: '复制' })).toBeInTheDocument();
    expect(within(pane).queryByRole('button', { name: '+ 术语' })).not.toBeInTheDocument();
    expect(putTranslation).not.toHaveBeenCalled();
    expect(saveHistory).not.toHaveBeenCalled();
  });

  it('stop during loading aborts before the first delta', async () => {
    configByok();
    chatStream.mockImplementation(({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('已中止', 'AbortError')));
    }));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '流式书' }));
    await screen.findAllByTestId('sentence');

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await screen.findByText(/正在翻译/);
    await userEvent.click(screen.getByRole('button', { name: '停止' }));

    await screen.findByText('已停止，译文可能不完整。');
    const pane = screen.getByRole('complementary');
    expect(within(pane).queryByRole('button', { name: '复制' })).not.toBeInTheDocument();
    expect(putTranslation).not.toHaveBeenCalled();
    expect(saveHistory).not.toHaveBeenCalled();
  });
});
