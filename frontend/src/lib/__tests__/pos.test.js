import { describe, expect, it } from 'vitest';
import { translatePos } from '../pos.js';

describe('translatePos', () => {
  it('translates single tags', () => {
    expect(translatePos('Godan verb with \'su\' ending')).toBe('五段动词（su 结尾）');
    expect(translatePos('transitive verb')).toBe('他动词');
    expect(translatePos('noun (common) (futsuumeishi)')).toBe('名词（普通名词）');
  });

  it('translates each tag in a combined string', () => {
    expect(translatePos('Godan verb with \'su\' ending、transitive verb'))
      .toBe('五段动词（su 结尾）、他动词');
  });

  it('keeps unknown tags as-is', () => {
    expect(translatePos('mystery tag')).toBe('mystery tag');
    expect(translatePos('')).toBe('');
  });
});
