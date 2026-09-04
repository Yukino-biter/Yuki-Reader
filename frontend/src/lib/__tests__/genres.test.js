import { describe, expect, it } from 'vitest';
import {
  GENRE_KEYS,
  GENRE_LABELS,
  translateSystemFor,
  chineseSystemFor,
  translateUserContent,
  classifyUserContent,
  parseGenre
} from '../genres.js';

describe('提示词路由', () => {
  it('three genres resolve to distinct prompts', () => {
    const prompts = GENRE_KEYS.map((k) => translateSystemFor(k));
    expect(new Set(prompts).size).toBe(3);
    expect(prompts[0]).toContain('文学');
    expect(prompts[1]).toContain('轻小说');
  });

  it('null and unknown genres fall back to the generic prompt', () => {
    expect(translateSystemFor(null)).toBe(translateSystemFor('generic'));
    expect(translateSystemFor('nope')).toBe(translateSystemFor('generic'));
    expect(chineseSystemFor(null)).toBe(chineseSystemFor('generic'));
  });

  it('all prompts demand translation-only output', () => {
    for (const key of GENRE_KEYS) {
      expect(translateSystemFor(key)).toContain('只输出译文');
    }
  });
});

describe('translateUserContent（上下文注入）', () => {
  it('wraps text with context when provided', () => {
    const out = translateUserContent('本文。', ['前文一。', '前文二。']);
    expect(out).toContain('【上文参考');
    expect(out).toContain('前文一。\n前文二。');
    expect(out).toContain('【待翻译】\n本文。');
    expect(out).toContain('只翻译并输出');
  });

  it('returns plain text without context', () => {
    expect(translateUserContent('本文。', null)).toBe('本文。');
    expect(translateUserContent('本文。', [])).toBe('本文。');
  });
});

describe('classifyUserContent', () => {
  it('includes name and excerpt', () => {
    const out = classifyUserContent('我的书', '今日は晴れ。');
    expect(out).toContain('书名：我的书');
    expect(out).toContain('今日は晴れ。');
  });
});

describe('parseGenre（宽容解析）', () => {
  it('parses clean enum outputs', () => {
    expect(parseGenre('lightnovel')).toBe('lightnovel');
    expect(parseGenre('literature')).toBe('literature');
    expect(parseGenre('generic')).toBe('generic');
  });

  it('strips quotes and punctuation the model may add', () => {
    expect(parseGenre('「lightnovel」。')).toBe('lightnovel');
    expect(parseGenre(' 输出：generic. ')).toBe('generic');
  });

  it('accepts Chinese labels', () => {
    expect(parseGenre('轻小说')).toBe('lightnovel');
    expect(parseGenre('这是纯文学作品')).toBe('literature');
    expect(parseGenre('其他')).toBe('generic');
  });

  it('returns null for anything unrecognisable', () => {
    expect(parseGenre('无法判断')).toBeNull();
    expect(parseGenre('')).toBeNull();
    expect(parseGenre(null)).toBeNull();
  });
});

describe('GENRE_LABELS', () => {
  it('covers every key', () => {
    for (const key of GENRE_KEYS) expect(GENRE_LABELS[key]).toBeTruthy();
  });
});
