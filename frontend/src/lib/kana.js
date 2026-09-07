/** 片假名（U+30A1–U+30F6）转平假名；长音符号等其余字符不变。 */
export function toHiragana(text) {
  if (!text) return text;
  return text.replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/** 是否包含汉字（CJK 统一表意文字）。 */
export function hasKanji(text) {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);
}

/** 提取原文中的片假名专名候选（去重、最多 8 个），供术语表预填。 */
export function katakanaTerms(text) {
  const matches = String(text).match(/[ァ-ヴー・]{2,}/g) || [];
  return [...new Set(matches)].slice(0, 8);
}
