// 翻译结果持久缓存（IndexedDB yuki-books/translation-cache，规格 §2）。
// key = djb2(模型+类别+术语表+提示词版本) : djb2(原文+上文)——任一变更旧译文自动失效。
// 所有入口吞掉 IndexedDB 异常（隐私模式降级为无缓存），调用方无需 try/catch。
import { openDb } from './storage.js';
import { djb2 } from './hash.js';
import { PROMPT_VERSION } from './genres.js';

const STORE = 'translation-cache';

export function translationCacheKey(model, genre, glossaryHash, text, context = null) {
  const meta = djb2(JSON.stringify([model, genre, glossaryHash || '', PROMPT_VERSION]));
  const body = djb2(text + '\u0000' + (Array.isArray(context) ? context.join('\n') : ''));
  return `${meta}:${body}`;
}

export async function getTranslation(key) {
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
      result = req.result?.result ?? null;
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

export async function putTranslation(key, result) {
  let db;
  try {
    db = await openDb();
  } catch {
    return; // 降级：写缓存失败不影响翻译
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id: key, result });
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
