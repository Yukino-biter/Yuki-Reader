import { tokenizeSentences } from './api.js';

// Session-memory cache: tokenized sentences are kept per book+chapter so
// revisiting a chapter does not re-tokenize (spec §10).
const sessionTokenCache = new Map();
const TOKEN_BATCH_SIZE = 12;

/**
 * Tokenize a chapter in small batches via the backend API and report partial
 * results via onProgress. Sentences are rendered as soon as their batch
 * finishes instead of waiting for the whole chapter (large uploaded books
 * without chapter headings would otherwise block the reader).
 */
export async function tokenizeChapter(bookId, chapterIndex, sentences, onProgress = null) {
  const key = `${bookId}:${chapterIndex}`;
  if (sessionTokenCache.has(key)) {
    const cached = sessionTokenCache.get(key);
    if (onProgress) onProgress(cached);
    return cached;
  }
  const rows = [];
  for (let i = 0; i < sentences.length; i += TOKEN_BATCH_SIZE) {
    const chunk = sentences.slice(i, i + TOKEN_BATCH_SIZE);
    const batch = await tokenizeSentences(chunk);
    rows.push(...batch);
    if (onProgress) onProgress(rows);
    if (i + TOKEN_BATCH_SIZE < sentences.length) {
      // 让出事件循环，使已分词句子能先渲染出来
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  sessionTokenCache.set(key, rows);
  return rows;
}

/** Prefetch a chapter into the session cache without blocking the reader. */
export function prefetchChapter(bookId, chapterIndex, sentences) {
  const key = `${bookId}:${chapterIndex}`;
  if (sessionTokenCache.has(key)) return;
  tokenizeChapter(bookId, chapterIndex, sentences).catch(() => {
    // 预取失败不打扰阅读
  });
}

export function clearTokenCache() {
  sessionTokenCache.clear();
}
