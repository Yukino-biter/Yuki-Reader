import { splitChapters } from './chapters.js';

let builtInPromise = null;

export function loadBuiltInBook() {
  if (!builtInPromise) {
    builtInPromise = fetch('/books/kokoro.json')
      .then((res) => {
        if (!res.ok) throw new Error(`内置书加载失败（HTTP ${res.status}）`);
        return res.json();
      })
      .then((data) => ({
        id: 'kokoro',
        name: data.name || 'こころ',
        author: data.author || '夏目漱石',
        sourceLabel: data.sourceLabel || '青空文庫',
        chapters: data.chapters
      }));
  }
  return builtInPromise;
}

export function bookFromUploadedText(fileName, text, encoding) {
  return {
    id: `upload-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
    name: fileName.replace(/\.txt$/i, ''),
    author: '',
    sourceLabel: '本地上传',
    encoding,
    chapters: splitChapters(text)
  };
}
