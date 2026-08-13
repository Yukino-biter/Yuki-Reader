const NUMERAL_RE = /^[一二三四五六七八九十百千万]+[.．、]?$/;
const DIGIT_RE = /^\d+[.．、]?$/;
const PART_RE = /^[上中下]$/;
const CHAPTER_RE = /^第[一二三四五六七八九十百千万\d]+[章节話部卷巻編篇]/;
const CHARS_PER_CHAPTER = 5000;

export function isHeadingParagraph(text) {
  const t = String(text).trim();
  if (!t) return false;
  if (t.length > 16) return false;
  if (NUMERAL_RE.test(t)) return true;
  if (DIGIT_RE.test(t)) return true;
  if (PART_RE.test(t)) return true;
  if (CHAPTER_RE.test(t)) return true;
  if (/^《.+》$/.test(t)) return true;
  return false;
}

/**
 * Split raw book text into chapters.
 * Paragraphs are split on blank lines. A short heading-like paragraph starts a
 * new chapter; if none is found the book is split into chapters of roughly
 * CHARS_PER_CHAPTER characters (paragraph boundaries are never broken).
 */
export function splitChapters(text) {
  const rawParagraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (rawParagraphs.length === 0) {
    return [{ title: '本文', paragraphs: [] }];
  }

  const chapters = [];
  let current = null;
  let sawHeading = false;
  for (const paragraph of rawParagraphs) {
    const lines = paragraph.split('\n').map((l) => l.trim()).filter(Boolean);
    const singleLine = lines.length === 1;
    // A heading may be its own paragraph or the first line of a paragraph.
    if (isHeadingParagraph(lines[0])) {
      sawHeading = true;
      if (current) chapters.push(current);
      current = { title: lines[0], paragraphs: [] };
      if (singleLine) continue;
      current.paragraphs.push(lines.slice(1).join('\n'));
      continue;
    }
    if (!current) current = { title: '第一章', paragraphs: [] };
    current.paragraphs.push(lines.join('\n'));
  }
  // No heading anywhere: fall back to length-based chapter splitting.
  if (!sawHeading) return splitByLength(rawParagraphs);
  if (current) chapters.push(current);
  return chapters;
}

/**
 * Split paragraphs into chapters of roughly CHARS_PER_CHAPTER characters.
 * Chapters always break at paragraph boundaries, never mid-paragraph.
 */
function splitByLength(paragraphs) {
  const chapters = [];
  let bucket = [];
  let count = 0;
  for (const paragraph of paragraphs) {
    if (count > 0 && count + paragraph.length > CHARS_PER_CHAPTER) {
      chapters.push({ title: `第 ${chapters.length + 1} 章`, paragraphs: bucket });
      bucket = [];
      count = 0;
    }
    bucket.push(paragraph);
    count += paragraph.length;
  }
  if (bucket.length > 0) {
    chapters.push({ title: `第 ${chapters.length + 1} 章`, paragraphs: bucket });
  }
  return chapters;
}
