import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { chat } from '../lib/api.js';
import { tokenizeChapter } from '../lib/tokenize.js';
import { getTranslation, putTranslation } from '../lib/translationCache.js';
import { getGlossary, glossaryHash } from '../lib/glossary.js';
import { loadBuiltInBook, bookFromUploadedText } from '../lib/books.js';
import { getUploadedBook, listUploadedBooks, openDb } from '../lib/storage.js';

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

// glossary 走真模块（fake-indexeddb），storage 仅替换书库相关入口、openDb 保留真实现
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
  name: '术语书',
  author: '',
  genre: 'lightnovel',
  genreManual: true,
  chapters: [{ title: '第 1 章', paragraphs: ['ルルーシュは言った。', '彼は笑った。'] }]
};

function configByok() {
  localStorage.setItem(
    'yuki:byok:v1',
    JSON.stringify({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'm', apiKey: 'sk-test' })
  );
}

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('yuki:settings:v1', JSON.stringify({ showFurigana: false }));
  vi.clearAllMocks();
  tokenizeChapter.mockResolvedValue(TOKEN_ROWS);
  getTranslation.mockResolvedValue(null);
  putTranslation.mockResolvedValue(undefined);
  chat.mockResolvedValue('鲁路修说了。');
  listUploadedBooks.mockResolvedValue([{ id: 'u1', name: '术语书', uploadedAt: 1 }]);
  getUploadedBook.mockResolvedValue({
    id: 'u1', name: '术语书', text: 'x', uploadedAt: 1, genre: 'lightnovel', genreManual: true
  });
  bookFromUploadedText.mockReturnValue(BOOK);
  // fake-indexeddb 跨用例留存，清空术语表避免用例间串扰
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('glossaries', 'readwrite');
    tx.objectStore('glossaries').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
});

describe('每书术语表', () => {
  it('adds a term via the topbar modal and injects it into the translation prompt', async () => {
    configByok();
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '术语书' }));
    await screen.findAllByTestId('sentence');

    await userEvent.click(screen.getByRole('button', { name: '术语' }));
    const dialog = await screen.findByRole('dialog', { name: '术语表' });
    await userEvent.type(within(dialog).getByLabelText('术语原文'), 'ルルーシュ');
    await userEvent.type(within(dialog).getByLabelText('固定译法'), '鲁路修');
    await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await screen.findByText('鲁路修说了。');

    const call = chat.mock.calls.at(-1)[0];
    expect(call.messages[0].content).toContain('ルルーシュ → 鲁路修');
    // 缓存 key 含术语表 hash
    expect(putTranslation.mock.calls[0][0]).toBe(
      `k:m:lightnovel:${glossaryHash([{ from: 'ルルーシュ', to: '鲁路修' }])}:ルルーシュは言った。`
    );
    // 术语表已持久化
    await waitFor(async () => {
      expect(await getGlossary('u1')).toEqual([{ from: 'ルルーシュ', to: '鲁路修' }]);
    });
  });

  it('prefills katakana candidates from the translated sentence', async () => {
    configByok();
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '术语书' }));
    await screen.findAllByTestId('sentence');

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await screen.findByText('鲁路修说了。');
    await userEvent.click(screen.getByRole('button', { name: '+ 术语' }));

    const dialog = await screen.findByRole('dialog', { name: '术语表' });
    const chip = within(dialog).getByRole('button', { name: 'ルルーシュ' });
    await userEvent.click(chip);
    expect(within(dialog).getByLabelText('术语原文')).toHaveValue('ルルーシュ');
  });
});
