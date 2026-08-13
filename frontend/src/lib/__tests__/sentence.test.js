import { describe, expect, it } from 'vitest';
import { splitSentences } from '../sentence.js';

describe('splitSentences', () => {
  it('splits on 。！？', () => {
    expect(splitSentences('私は学生だ。彼も学生だ。')).toEqual(['私は学生だ。', '彼も学生だ。']);
    expect(splitSentences('本当か？知らない。')).toEqual(['本当か？', '知らない。']);
  });

  it('attaches closing brackets to the sentence', () => {
    expect(splitSentences('「こんにちは。」と彼は言った。')).toEqual([
      '「こんにちは。」',
      'と彼は言った。'
    ]);
    expect(splitSentences('「行こう！」')).toEqual(['「行こう！」']);
  });

  it('treats ellipsis as a sentence ending per spec', () => {
    expect(splitSentences('それは……難しい。')).toEqual(['それは……', '難しい。']);
    expect(splitSentences('待って……。')).toEqual(['待って……。']);
  });

  it('keeps multi-line paragraphs inside one sentence when needed', () => {
    expect(splitSentences('一行目。\n二行目。')).toEqual(['一行目。', '二行目。']);
  });

  it('ignores inline punctuation', () => {
    expect(splitSentences('猫、犬、鳥。')).toEqual(['猫、犬、鳥。']);
  });

  it('drops empty trailing fragments', () => {
    expect(splitSentences('終わり。')).toEqual(['終わり。']);
    expect(splitSentences('  ')).toEqual([]);
  });
});
