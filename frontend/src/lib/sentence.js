const SENTENCE_END = new Set(['。', '！', '？', '…', '．', '｡']);
const CLOSING = new Set([
  '」', '』', '）', '〉', '》', '］', '】', '｣', '"', "'", '"', '”'
]);

/**
 * Split a paragraph into sentences.
 * A sentence ends at 。！？… and any immediately following closing brackets are
 * appended to that sentence. A closing bracket alone does not start a new sentence.
 */
export function splitSentences(text) {
  const sentences = [];
  let buf = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    buf += ch;
    if (SENTENCE_END.has(ch)) {
      // consume consecutive end punctuation (e.g. …。、！？) and closing brackets
      // as part of the same sentence ending
      while (
        i + 1 < text.length &&
        (SENTENCE_END.has(text[i + 1]) || CLOSING.has(text[i + 1]))
      ) {
        buf += text[i + 1];
        i += 1;
      }
      const trimmed = buf.trim();
      if (trimmed) sentences.push(trimmed);
      buf = '';
    }
  }
  const trimmed = buf.trim();
  if (trimmed) sentences.push(trimmed);
  return sentences;
}
