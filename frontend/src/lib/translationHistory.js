// 翻译历史持久化（IndexedDB yuki-books/translation-history，规格 §4）。
// App state 为唯一事实源，saveHistory 整表镜像；所有入口吞掉异常降级。
import { openDb } from './storage.js';

const STORE = 'translation-history';

export async function loadHistory() {
  let db;
  try {
    db = await openDb();
  } catch {
    return []; // 降级：视为无历史
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    let rows = [];
    req.onsuccess = () => {
      rows = (req.result || []).sort((a, b) => b.at - a.at);
    };
    tx.oncomplete = () => {
      db.close();
      resolve(rows);
    };
    tx.onerror = () => {
      db.close();
      resolve([]); // 降级：视为无历史
    };
  });
}

export async function saveHistory(list) {
  let db;
  try {
    db = await openDb();
  } catch {
    return; // 降级：写历史失败不影响使用
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();
    for (const entry of list) store.put(entry);
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
