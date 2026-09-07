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
        genre: 'literature', // 内置文学书，固定标签不参与 LLM 判定（规格 §3.1）
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
    genre: null, // 打开后由 LLM 静默判定或用户手动设置（规格 §3.1）
    genreManual: false,
    chapters: splitChapters(text)
  };
}
