import { describe, expect, it } from 'vitest';
import { toHiragana, hasKanji } from '../kana.js';

describe('toHiragana', () => {
  it('converts katakana to hiragana', () => {
    expect(toHiragana('ワタシ')).toBe('わたし');
    expect(toHiragana('ヨン')).toBe('よん');
  });

  it('keeps prolonged sound mark and mixed text', () => {
    expect(toHiragana('コーヒー')).toBe('こーひー');
    expect(toHiragana('学生はガクセイ')).toBe('学生はがくせい');
  });

  it('leaves non-katakana unchanged', () => {
    expect(toHiragana('abc。')).toBe('abc。');
  });
});

describe('hasKanji', () => {
  it('detects CJK ideographs', () => {
    expect(hasKanji('学生')).toBe(true);
    expect(hasKanji('わたし')).toBe(false);
  });
});
