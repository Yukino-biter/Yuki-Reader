import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Sentence from '../Sentence.jsx';

const TOKENS = [
  { surface: '私', reading: 'わたし', basic: '私', pos: '名詞', clickable: true },
  { surface: 'は', reading: 'は', basic: 'は', pos: '助詞', clickable: true },
  { surface: '学生', reading: 'がくせい', basic: '学生', pos: '名詞', clickable: true },
  { surface: 'である', reading: 'である', basic: 'である', pos: '助動詞', clickable: true },
  { surface: '。', reading: '。', basic: '。', pos: '記号', clickable: false }
];

function setup() {
  const onWord = vi.fn();
  const onSentence = vi.fn();
  const onSelection = vi.fn();
  render(
    <Sentence
      sentence="私は学生である。"
      tokens={TOKENS}
      onWord={onWord}
      onSentence={onSentence}
      onSelection={onSelection}
    />
  );
  return { onWord, onSentence, onSelection, sentence: screen.getByTestId('sentence') };
}

describe('Sentence 交互（规格 §6）', () => {
  it('renders word spans and keeps original text', () => {
    setup();
    expect(screen.getAllByTestId('word-span')).toHaveLength(4);
    expect(screen.getByTestId('sentence').textContent).toBe('私は学生である。');
  });

  it('word click triggers dictionary and stops propagation', () => {
    const { onWord, onSentence } = setup();
    fireEvent.click(screen.getByText('私'));
    expect(onWord).toHaveBeenCalledWith(expect.objectContaining({ basic: '私', reading: 'わたし' }));
    expect(onSentence).not.toHaveBeenCalled();
  });

  it('click on non-word area triggers sentence translation', () => {
    const { onWord, onSentence, sentence } = setup();
    fireEvent.click(sentence);
    expect(onSentence).toHaveBeenCalledWith('私は学生である。');
    expect(onWord).not.toHaveBeenCalled();
  });

  it('selection exactly equal to a single word is treated as a word', () => {
    const { onWord, onSelection } = setup();
    const word = screen.getByText('私');
    const range = document.createRange();
    range.selectNodeContents(word);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.mouseUp(screen.getByTestId('sentence'));
    expect(onWord).toHaveBeenCalled();
    expect(onSelection).not.toHaveBeenCalled();
  });

  it('selection across multiple words goes to LLM translation', () => {
    const { onWord, onSelection } = setup();
    const first = screen.getByText('私');
    const student = screen.getByText('学生');
    const range = document.createRange();
    range.setStart(first.firstChild, 0);
    range.setEnd(student.firstChild, student.firstChild.length);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.mouseUp(screen.getByTestId('sentence'));
    expect(onSelection).toHaveBeenCalledWith(expect.stringContaining('学生'));
    expect(onWord).not.toHaveBeenCalled();
  });
});

describe('Sentence 标注假名', () => {
  it('renders ruby furigana for kanji tokens when enabled', () => {
    const { container } = render(
      <Sentence
        sentence="私は学生である。"
        tokens={TOKENS}
        showFurigana
        onWord={vi.fn()}
        onSentence={vi.fn()}
        onSelection={vi.fn()}
      />
    );
    const rubies = container.querySelectorAll('ruby');
    expect(rubies).toHaveLength(2);
    expect(rubies[0].querySelector('rt').textContent).toBe('わたし');
    expect(rubies[0].textContent).toBe('私わたし');
  });

  it('skips furigana when disabled', () => {
    const { container } = render(
      <Sentence
        sentence="私は学生である。"
        tokens={TOKENS}
        onWord={vi.fn()}
        onSentence={vi.fn()}
        onSelection={vi.fn()}
      />
    );
    expect(container.querySelector('rt')).toBeNull();
  });

  it('single-word selection still works with furigana enabled', () => {
    const onWord = vi.fn();
    const onSelection = vi.fn();
    render(
      <Sentence
        sentence="私は学生である。"
        tokens={TOKENS}
        showFurigana
        onWord={onWord}
        onSentence={vi.fn()}
        onSelection={onSelection}
      />
    );
    const word = screen.getAllByTestId('word-span')[0];
    const range = document.createRange();
    range.selectNodeContents(word.firstChild.firstChild);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.mouseUp(screen.getByTestId('sentence'));
    expect(onWord).toHaveBeenCalledWith(expect.objectContaining({ basic: '私' }));
    expect(onSelection).not.toHaveBeenCalled();
  });
});
