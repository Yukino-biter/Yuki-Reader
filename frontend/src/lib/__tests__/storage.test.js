import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  saveUploadedBook,
  getUploadedBook,
  removeUploadedBook,
  listUploadedBooks,
  openDb
} from '../storage.js';

// 用 clear 清空数据而非 deleteDatabase：删库会被遗留的未关闭连接 block，
// clear 走普通事务不会被阻塞。
async function freshDb() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('books', 'readwrite');
    tx.objectStore('books').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

beforeEach(freshDb);

describe('removeUploadedBook', () => {
  it('deletes the record and the progress key', async () => {
    await saveUploadedBook({ id: 'u1', name: '书', text: 'x' });
    localStorage.setItem('yuki:progress:v1:u1', JSON.stringify({ chapter: 0, ratio: 0.5 }));
    expect(await getUploadedBook('u1')).not.toBeNull();

    await removeUploadedBook('u1');

    expect(await getUploadedBook('u1')).toBeNull();
    expect(localStorage.getItem('yuki:progress:v1:u1')).toBeNull();
  });

  it('is idempotent for unknown ids', async () => {
    await expect(removeUploadedBook('nope')).resolves.toBeUndefined();
  });

  it('keeps other books', async () => {
    await saveUploadedBook({ id: 'u1', name: 'a', uploadedAt: 1 });
    await saveUploadedBook({ id: 'u2', name: 'b', uploadedAt: 2 });
    await removeUploadedBook('u1');
    expect((await listUploadedBooks()).map((b) => b.id)).toEqual(['u2']);
  });
});
