// 分词结果持久缓存（IndexedDB yuki-books/token-cache，规格 §3.2）。
// 记录形如 { id, bookId, rows }；id = bookId:chapterIndex:hash(本章全文)。
// 所有入口吞掉 IndexedDB 异常（隐私模式降级为仅会话缓存），调用方无需 try/catch。
import { openDb } from './storage.js';
import { djb2 } from './hash.js';

const STORE = 'token-cache';

/** 章节内容指纹：用途仅为“章节内容变化 → key 变化”，正文相同则分词结果必然相同。 */
export function hashChapterText(text) {
  return djb2(text);
}

export function chapterCacheKey(bookId, chapterIndex, chapterText) {
  return `${bookId}:${chapterIndex}:${hashChapterText(chapterText)}`;
}

export async function getTokenRows(key) {
  let db;
  try {
    db = await openDb();
  } catch {
    return null; // 降级：视为未命中
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    let result = null;
    req.onsuccess = () => {
      result = req.result?.rows ?? null;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      resolve(null); // 降级：视为未命中
    };
  });
}

export async function putTokenRows(key, bookId, rows) {
  let db;
  try {
    db = await openDb();
  } catch {
    return; // 降级：写缓存失败不影响阅读
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id: key, bookId, rows });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve(); // 降级：静默失败
    };
  });
}

/** 删书时按 bookId 索引清理该书全部分词缓存。 */
export async function clearForBook(bookId) {
  let db;
  try {
    db = await openDb();
  } catch {
    return; // 降级：清理失败不阻断删书
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).index('byBook').openCursor(IDBKeyRange.only(bookId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve(); // 降级：静默失败
    };
  });
}
