import { tokenizeSentences } from './api.js';
import { chapterCacheKey, getTokenRows, putTokenRows } from './tokenCache.js';

// Session-memory cache: tokenized sentences are kept per book+chapter so
// revisiting a chapter does not re-tokenize (spec §10).
const sessionTokenCache = new Map();
const TOKEN_BATCH_SIZE = 24;
// 并发批次数：后端分词是纯 CPU 计算（不碰数据库），服务器 4 核可轻松并行；
// 并发取批但结果按批次索引存放，最终按序拼回，保证句子顺序不乱。
const CONCURRENCY = 4;

/**
 * Tokenize a chapter in batches via the backend API and report partial
 * results via onProgress. Sentences are rendered as soon as their batch
 * finishes instead of waiting for the whole chapter.
 *
 * Cache chain: session memory → IndexedDB (token-cache) → backend API.
 * IndexedDB misses/failures degrade silently to the session-only behaviour.
 */
export async function tokenizeChapter(bookId, chapterIndex, sentences, onProgress = null) {
  const key = `${bookId}:${chapterIndex}`;
  if (sessionTokenCache.has(key)) {
    const cached = sessionTokenCache.get(key);
    if (onProgress) onProgress(cached);
    return cached;
  }

  const persistentKey = chapterCacheKey(bookId, chapterIndex, sentences.join('\n'));
  const persisted = await getTokenRows(persistentKey);
  if (persisted) {
    sessionTokenCache.set(key, persisted);
    if (onProgress) onProgress(persisted);
    return persisted;
  }

  const batches = [];
  for (let i = 0; i < sentences.length; i += TOKEN_BATCH_SIZE) {
    batches.push(sentences.slice(i, i + TOKEN_BATCH_SIZE));
  }

  // results[i] 存放第 i 批的分词结果，保证最终顺序与句子顺序一致
  const results = new Array(batches.length);
  let nextBatch = 0;

  const reportProgress = () => {
    if (!onProgress) return;
    const rows = [];
    for (let i = 0; i < results.length; i++) {
      if (!results[i]) break; // 只报告从头部连续的批次，避免渲染错位
      rows.push(...results[i]);
    }
    if (rows.length > 0) onProgress(rows);
  };

  const worker = async () => {
    while (nextBatch < batches.length) {
      const idx = nextBatch++;
      const batch = await tokenizeSentences(batches[idx]);
      results[idx] = batch;
      reportProgress();
      // 让出事件循环，使已分词句子能先渲染出来
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker)
  );

  const rows = results.flat();
  sessionTokenCache.set(key, rows);
  if (rows.length > 0) putTokenRows(persistentKey, bookId, rows); // 异步写回，内部自吞异常
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
