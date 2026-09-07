import { describe, expect, it, vi } from 'vitest';
import { bookFromUploadedText, loadBuiltInBook } from '../books.js';

describe('bookFromUploadedText', () => {
  it('initialises genre fields for classification (spec §3.1)', () => {
    const book = bookFromUploadedText('書名.txt', '本文。', 'UTF-8');
    expect(book.name).toBe('書名');
    expect(book.genre).toBeNull();
    expect(book.genreManual).toBe(false);
  });
});

describe('loadBuiltInBook', () => {
  it('pins the built-in book to literature', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ name: 'こころ', chapters: [] }) }))
    );
    const book = await loadBuiltInBook();
    expect(book.genre).toBe('literature');
  });
});
