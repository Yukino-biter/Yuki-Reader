import { describe, expect, it } from 'vitest';
import { splitChapters, isHeadingParagraph } from '../chapters.js';

describe('isHeadingParagraph', () => {
  it('recognises Japanese numeral headings', () => {
    expect(isHeadingParagraph('一')).toBe(true);
    expect(isHeadingParagraph('二十三')).toBe(true);
    expect(isHeadingParagraph('上')).toBe(true);
    expect(isHeadingParagraph('第3章')).toBe(true);
  });

  it('rejects ordinary lines', () => {
    expect(isHeadingParagraph('こんにちは。')).toBe(false);
    expect(isHeadingParagraph('私は学生である。')).toBe(false);
  });
});

describe('splitChapters', () => {
  it('splits on heading lines', () => {
    const text = '一\nこれは一節。\n\n二\nこれは二節。';
    const chapters = splitChapters(text);
    expect(chapters.map((c) => c.title)).toEqual(['一', '二']);
    expect(chapters[0].paragraphs).toEqual(['これは一節。']);
  });

  it('falls back to a single chapter without headings', () => {
    const text = 'あいうえお。\n\nかきくけこ。';
    const chapters = splitChapters(text);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe('第 1 章');
    expect(chapters[0].paragraphs).toHaveLength(2);
  });

  it('splits long unheaded text into ~5000-char chapters', () => {
    const paragraph = 'あ'.repeat(1200);
    const paragraphs = Array.from({ length: 10 }, (_, i) => `${i + 1}番目。${paragraph}`);
    const text = paragraphs.join('\n\n');
    const chapters = splitChapters(text);
    expect(chapters.length).toBeGreaterThan(1);
    expect(chapters[0].title).toBe('第 1 章');
    expect(chapters[1].title).toBe('第 2 章');
    for (const chapter of chapters) {
      const total = chapter.paragraphs.join('').length;
      expect(total).toBeLessThanOrEqual(5000 + 1200); // a single paragraph may exceed the limit
      expect(chapter.paragraphs.length).toBeGreaterThan(0);
    }
    expect(chapters.flatMap((c) => c.paragraphs).join('')).toBe(paragraphs.join(''));
  });

  it('never splits inside a paragraph', () => {
    const longParagraph = 'あ'.repeat(7000);
    const chapters = splitChapters(`${longParagraph}\n\n短い段落。`);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].paragraphs).toEqual([longParagraph]);
    expect(chapters[1].paragraphs).toEqual(['短い段落。']);
  });

  it('normalises CRLF line endings', () => {
    const text = '一\r\n本文。\r\n\r\n二\r\n続き。';
    const chapters = splitChapters(text);
    expect(chapters.map((c) => c.title)).toEqual(['一', '二']);
  });
});
