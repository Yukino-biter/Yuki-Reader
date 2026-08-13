import { useRef } from 'react';
import { toHiragana, hasKanji } from '../lib/kana.js';

export function tokenFromSpan(span) {
  return {
    surface: span.dataset.surface || span.textContent,
    basic: span.dataset.basic || span.textContent,
    reading: span.dataset.reading || span.textContent,
    pos: span.dataset.pos || ''
  };
}

/** Returns the single word span if the selection exactly equals its content. */
export function selectionHitsSingleWord(selection) {
  if (!selection || selection.isCollapsed) return null;
  const text = selection.toString();
  if (!text.trim()) return null;
  const range = selection.getRangeAt(0);
  const nodeType = Node.ELEMENT_NODE;
  const startNode = range.startContainer.nodeType === nodeType
    ? range.startContainer
    : range.startContainer.parentElement;
  const endNode = range.endContainer.nodeType === nodeType
    ? range.endContainer
    : range.endContainer.parentElement;
  const startSpan = startNode?.closest?.('.word-span');
  if (!startSpan) return null;
  const endSpan = endNode?.closest?.('.word-span');
  if (endSpan && endSpan !== startSpan) return null;
  const spanText = startSpan.dataset.surface || startSpan.textContent;
  return spanText === text.trim() ? startSpan : null;
}

/**
 * 句子容器 > 词 span（规格 §5、§6）。
 * 单击词 span：查词典（阻止冒泡）；单击非词区域：整句翻译；
 * 鼠标松开检查选区：恰好等于单个词 span → 词典，否则走 LLM 翻译。
 */
export default function Sentence({ sentence, tokens, onWord, onSentence, onSelection, showFurigana = false }) {
  const suppressClick = useRef(false);

  const handleMouseDown = () => {
    suppressClick.current = false;
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString();
    if (!text.trim()) return;
    suppressClick.current = true;
    const wordSpan = selectionHitsSingleWord(selection);
    if (wordSpan) onWord(tokenFromSpan(wordSpan));
    else onSelection(text);
    selection.removeAllRanges();
  };

  const handleClick = (e) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (e.target === e.currentTarget) onSentence(sentence);
  };

  const handleWordClick = (e, token) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    e.stopPropagation();
    onWord(token);
  };

  return (
    <div
      className="sentence"
      data-testid="sentence"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {tokens.map((t, i) =>
        t.clickable ? (
          <span
            key={i}
            className="word-span"
            data-testid="word-span"
            data-surface={t.surface}
            data-basic={t.basic}
            data-reading={t.reading}
            data-pos={t.pos}
            onClick={(e) => handleWordClick(e, t)}
          >
            {showFurigana && hasKanji(t.surface) && t.reading && t.reading !== t.surface ? (
              <ruby>
                {t.surface}
                <rt>{toHiragana(t.reading)}</rt>
              </ruby>
            ) : (
              t.surface
            )}
          </span>
        ) : (
          t.surface
        )
      )}
    </div>
  );
}
