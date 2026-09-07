// 每书术语 / 人名表（IndexedDB yuki-books/glossaries，规格 §4）。
// 记录形如 { bookId, entries: [{from, to}] }；翻译时经 serializeGlossary 注入 system prompt。
// 所有入口吞掉 IndexedDB 异常（隐私模式降级为空表 / 静默失败），调用方无需 try/catch。
import { openDb } from './storage.js';
import { djb2 } from './hash.js';

const STORE = 'glossaries';
export const GLOSSARY_MAX_ENTRIES = 50;
export const GLOSSARY_MAX_CHARS = 1500;

/** trim、去空行、按 from 去重（后录入的覆盖先录入的），保持录入顺序。 */
export function normalizeGlossary(entries) {
  const byFrom = new Map();
  for (const entry of entries || []) {
    const from = (entry?.from || '').trim();
    const to = (entry?.to || '').trim();
    if (!from || !to) continue;
    byFrom.set(from, { from, to });
  }
  return [...byFrom.values()];
}

/** 术语表内容指纹：进入翻译缓存 key，术语表变更旧译文自动失效；空表返回 ''。 */
export function glossaryHash(entries) {
  const normalized = normalizeGlossary(entries);
  return normalized.length ? djb2(JSON.stringify(normalized)) : '';
}

/** 按条数 / 字符双上限序列化为 “from → to” 行，供注入 system prompt。 */
export function serializeGlossary(entries) {
  const lines = [];
  let total = 0;
  for (const entry of normalizeGlossary(entries)) {
    const line = `${entry.from} → ${entry.to}`;
    if (lines.length >= GLOSSARY_MAX_ENTRIES || total + line.length > GLOSSARY_MAX_CHARS) break;
    lines.push(line);
    total += line.length;
  }
  return lines.join('\n');
}

export async function getGlossary(bookId) {
  let db;
  try {
    db = await openDb();
  } catch {
    return []; // 降级：空表
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(bookId);
    let result = [];
    req.onsuccess = () => {
      result = req.result?.entries ?? [];
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      resolve([]); // 降级：空表
    };
  });
}

/** 保存前 normalize，返回 normalize 后的 entries 供调用方直接更新内存态。 */
export async function saveGlossary(bookId, entries) {
  const normalized = normalizeGlossary(entries);
  let db;
  try {
    db = await openDb();
  } catch {
    return normalized; // 降级：仅内存态
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ bookId, entries: normalized });
    tx.oncomplete = () => {
      db.close();
      resolve(normalized);
    };
    tx.onerror = () => {
      db.close();
      resolve(normalized); // 降级：静默失败
    };
  });
}

export async function clearGlossary(bookId) {
  let db;
  try {
    db = await openDb();
  } catch {
    return; // 降级：清理失败不阻断删书
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(bookId);
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
