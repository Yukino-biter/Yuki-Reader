# 翻译标签路由 + 分词提速 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按书籍类别（文学/轻小说/其他）路由翻译与词典解释提示词（LLM 静默判定 + 手动覆盖）、点句翻译注入上文语境、未分章文本按 1500 字符/章切分、分词结果持久化且批大小 12→24、首页提供删书入口（连带清理进度与分词缓存）。

**Architecture:** 全部为前端改动，后端 `/api/chat`、`/api/tokenize` 契约不变。新增 `lib/genres.js`（提示词与分类解析）、`lib/tokenCache.js`（IndexedDB 分词持久缓存）；`storage.js` 升级 DB v2 并新增删书函数；`App.jsx` 承接判定、路由与顶栏下拉；`HomeView.jsx` 新增删书确认弹窗。规格见 `docs/superpowers/specs/2026-09-03-genre-prompt-routing-and-tokenize-speed-design.md`。

**Tech Stack:** React 18 + Vite 5 + Vitest（jsdom），fake-indexeddb（新 devDependency，用于 IndexedDB 单测）。执行 shell 为 Git Bash（Windows）。

**约定：**
- 所有命令在仓库根 `D:\Personal Portfolio\Yuki Reader` 下执行（`cd "D:\Personal Portfolio\Yuki Reader"`）。
- 前端命令用 `npm --prefix frontend ...`；后端用 `mvn -f backend/pom.xml ...`。
- 临时产物放 `scripts/data/`（已在 .gitignore，仓库既有惯例）。
- 当前分支 `master`，直接提交，不新建分支。

---

## 文件结构总览

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `scripts/data/tokenize-bench.mjs` | 新建（gitignored） | 分词基准计时脚本 |
| `frontend/src/lib/chapters.js` | 改 | 切章常量 5000→1500 |
| `frontend/src/lib/__tests__/chapters.test.js` | 改 | 粒度断言更新 |
| `frontend/src/lib/genres.js` | 新建 | 三套翻译/词典提示词、分类 prompt、parseGenre、上下文 user 消息 |
| `frontend/src/lib/__tests__/genres.test.js` | 新建 | 上述单测 |
| `frontend/src/lib/storage.js` | 改 | DB v2 + token-cache store + `removeUploadedBook` |
| `frontend/src/lib/__tests__/storage.test.js` | 新建 | 删书链路单测（fake-indexeddb） |
| `frontend/src/lib/tokenCache.js` | 新建 | 持久缓存读写 + `clearForBook` + djb2 hash |
| `frontend/src/lib/__tests__/tokenCache.test.js` | 新建 | 持久缓存单测（fake-indexeddb） |
| `frontend/src/lib/tokenize.js` | 改 | 批 24 + 持久缓存接入 |
| `frontend/src/lib/__tests__/tokenize.test.js` | 改 | 批大小断言 + 持久缓存用例 |
| `frontend/src/lib/sentence.js` | 改 | 新增 `previousSentences` |
| `frontend/src/lib/__tests__/sentence.test.js` | 改 | 其单测 |
| `frontend/src/App.jsx` | 改 | 分类判定、翻译/词典路由、上下文、顶栏下拉、删书接线 |
| `frontend/src/components/ReaderView.jsx` | 改 | 点句回调附带前文 |
| `frontend/src/__tests__/app.test.jsx` | 改 | BOOK 增加 genre 字段 |
| `frontend/src/__tests__/app-genre.test.jsx` | 新建 | 分类/路由/上下文集成测试 |
| `frontend/src/components/HomeView.jsx` | 改 | 文件行删除按钮 + 确认弹窗 |
| `frontend/src/components/__tests__/HomeView.test.jsx`（目录不存在则新建） | 新建 | 删书 UI 测试 |
| `frontend/src/__tests__/app-delete.test.jsx` | 新建 | App 删除接线测试 |
| `frontend/src/styles.css` | 改 | `.genre-select`、`.home-file-row/.home-file-delete`、`.btn.danger`、`.modal-note` |
| `README.md`、`docs/handover/2026-08-11-yuki-reader.md` | 改 | 文档同步 |

---

### Task 1: 分词基准（改造前基线）

**Files:**
- Create: `scripts/data/tokenize-bench.mjs`（目录已 gitignore，不提交）

- [ ] **Step 1: 确认后端 jar 可用**

```bash
ls backend/target/yuki-reader.jar || mvn -f backend/pom.xml -q -DskipTests package
```

Expected: 文件存在（不存在则先打包，约 1-2 分钟）。

- [ ] **Step 2: 写基准脚本**

创建 `scripts/data/tokenize-bench.mjs`，内容如下（复刻前端 `tokenize.js` 的批次/并发逻辑，直接请求 `/api/tokenize`，不经过浏览器）：

```js
// scripts/data/tokenize-bench.mjs — 分词基准计时（gitignored，仅本地使用）
// 用法：先启动后端，再 node scripts/data/tokenize-bench.mjs [baseUrl]
import { readFileSync } from 'node:fs';
import { splitSentences } from '../../frontend/src/lib/sentence.js';

const base = process.argv[2] || 'http://localhost:8080';
const book = JSON.parse(
  readFileSync(new URL('../../frontend/public/books/kokoro.json', import.meta.url), 'utf8')
);

async function tokenizeBatch(sentences) {
  const res = await fetch(`${base}/api/tokenize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentences })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).rows;
}

async function runBatched(sentences, batchSize, concurrency) {
  const batches = [];
  for (let i = 0; i < sentences.length; i += batchSize) {
    batches.push(sentences.slice(i, i + batchSize));
  }
  const results = new Array(batches.length);
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const idx = next++;
      results[idx] = await tokenizeBatch(batches[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
  return results.flat();
}

const chapter = book.chapters[0];
const sentences = chapter.paragraphs.flatMap((p) => splitSentences(p));
console.log(`章节「${chapter.title}」：${sentences.length} 句`);

await tokenizeBatch(sentences.slice(0, 4)); // 预热连接与已预热的分词器
for (const [batch, conc] of [[12, 4], [24, 4], [48, 4]]) {
  const t0 = performance.now();
  const rows = await runBatched(sentences, batch, conc);
  const ms = Math.round(performance.now() - t0);
  const total = rows.reduce((n, r) => n + r.length, 0);
  console.log(`batch=${batch} conc=${conc} → ${ms}ms（${total} tokens）`);
}
```

- [ ] **Step 3: 启动后端并跑基线**

```bash
YUKI_DB_PATH='backend/data/yuki.db' java -jar backend/target/yuki-reader.jar > backend/server.log 2>&1 &
echo $! > scripts/data/server.pid
for i in $(seq 1 30); do curl -sf http://localhost:8080/ >/dev/null && break; sleep 1; done
node scripts/data/tokenize-bench.mjs | tee scripts/data/tokenize-baseline.log
```

Expected: 输出三行计时（batch=12/24/48）。把 `batch=12 conc=4` 的毫秒数记为基线（Task 6/10 对照）。

- [ ] **Step 4: 停止后端**

```bash
kill $(cat scripts/data/server.pid)
```

---

### Task 2: 切章粒度 5000 → 1500

**Files:**
- Modify: `frontend/src/lib/chapters.js:5`
- Modify: `frontend/src/lib/__tests__/chapters.test.js:34-48`

- [ ] **Step 1: 改测试（先失败）**

把 `chapters.test.js` 中 `splits long unheaded text into ~5000-char chapters` 一个用例整体替换为下面两个用例：

```js
  it('splits long unheaded text into ~1500-char chapters', () => {
    const paragraph = 'あ'.repeat(600);
    const paragraphs = Array.from({ length: 6 }, (_, i) => `${i + 1}番目。${paragraph}`);
    const text = paragraphs.join('\n\n');
    const chapters = splitChapters(text);
    expect(chapters).toHaveLength(3); // 每 2 段（1200 字符）一章
    expect(chapters[0].title).toBe('第 1 章');
    for (const chapter of chapters) {
      const total = chapter.paragraphs.join('').length;
      expect(total).toBeLessThanOrEqual(1500);
      expect(chapter.paragraphs.length).toBeGreaterThan(0);
    }
    expect(chapters.flatMap((c) => c.paragraphs).join('')).toBe(paragraphs.join(''));
  });

  it('a single long paragraph becomes its own oversized chapter', () => {
    const paragraph = 'あ'.repeat(1600);
    const chapters = splitChapters(`${paragraph}\n\n短い段落。`);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].paragraphs).toEqual([paragraph]);
  });
```

- [ ] **Step 2: 运行确认失败**

```bash
npm --prefix frontend test -- chapters
```

Expected: FAIL（`expected 3`，当前 5000 常量下切出 1 章）。

- [ ] **Step 3: 改常量**

`chapters.js` 第 5 行：

```js
const CHARS_PER_CHAPTER = 1500;
```

- [ ] **Step 4: 运行确认通过**

```bash
npm --prefix frontend test -- chapters
```

Expected: PASS（该文件全部用例）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/chapters.js frontend/src/lib/__tests__/chapters.test.js
git commit -m "feat: 未分章文本切章粒度 5000→1500 字符"
```

---

### Task 3: lib/genres.js（提示词路由 + 分类解析）

**Files:**
- Create: `frontend/src/lib/genres.js`
- Create: `frontend/src/lib/__tests__/genres.test.js`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/__tests__/genres.test.js`：

```js
import { describe, expect, it } from 'vitest';
import {
  GENRE_KEYS,
  GENRE_LABELS,
  translateSystemFor,
  chineseSystemFor,
  translateUserContent,
  classifyUserContent,
  parseGenre
} from '../genres.js';

describe('提示词路由', () => {
  it('three genres resolve to distinct prompts', () => {
    const prompts = GENRE_KEYS.map((k) => translateSystemFor(k));
    expect(new Set(prompts).size).toBe(3);
    expect(prompts[0]).toContain('文学');
    expect(prompts[1]).toContain('轻小说');
  });

  it('null and unknown genres fall back to the generic prompt', () => {
    expect(translateSystemFor(null)).toBe(translateSystemFor('generic'));
    expect(translateSystemFor('nope')).toBe(translateSystemFor('generic'));
    expect(chineseSystemFor(null)).toBe(chineseSystemFor('generic'));
  });

  it('all prompts demand translation-only output', () => {
    for (const key of GENRE_KEYS) {
      expect(translateSystemFor(key)).toContain('只输出译文');
    }
  });
});

describe('translateUserContent（上下文注入）', () => {
  it('wraps text with context when provided', () => {
    const out = translateUserContent('本文。', ['前文一。', '前文二。']);
    expect(out).toContain('【上文参考');
    expect(out).toContain('前文一。\n前文二。');
    expect(out).toContain('【待翻译】\n本文。');
    expect(out).toContain('只翻译并输出');
  });

  it('returns plain text without context', () => {
    expect(translateUserContent('本文。', null)).toBe('本文。');
    expect(translateUserContent('本文。', [])).toBe('本文。');
  });
});

describe('classifyUserContent', () => {
  it('includes name and excerpt', () => {
    const out = classifyUserContent('我的书', '今日は晴れ。');
    expect(out).toContain('书名：我的书');
    expect(out).toContain('今日は晴れ。');
  });
});

describe('parseGenre（宽容解析）', () => {
  it('parses clean enum outputs', () => {
    expect(parseGenre('lightnovel')).toBe('lightnovel');
    expect(parseGenre('literature')).toBe('literature');
    expect(parseGenre('generic')).toBe('generic');
  });

  it('strips quotes and punctuation the model may add', () => {
    expect(parseGenre('「lightnovel」。')).toBe('lightnovel');
    expect(parseGenre(' 输出：generic. ')).toBe('generic');
  });

  it('accepts Chinese labels', () => {
    expect(parseGenre('轻小说')).toBe('lightnovel');
    expect(parseGenre('这是纯文学作品')).toBe('literature');
    expect(parseGenre('其他')).toBe('generic');
  });

  it('returns null for anything unrecognisable', () => {
    expect(parseGenre('无法判断')).toBeNull();
    expect(parseGenre('')).toBeNull();
    expect(parseGenre(null)).toBeNull();
  });
});

describe('GENRE_LABELS', () => {
  it('covers every key', () => {
    for (const key of GENRE_KEYS) expect(GENRE_LABELS[key]).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm --prefix frontend test -- genres
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 genres.js**

创建 `frontend/src/lib/genres.js`：

```js
// 书籍类别 → LLM 提示词路由（规格 §5）。
// genre 取值：'literature' | 'lightnovel' | 'generic'，null 按 generic 处理。
export const GENRE_KEYS = ['literature', 'lightnovel', 'generic'];
export const GENRE_LABELS = { literature: '文学', lightnovel: '轻小说', generic: '其他' };

const PUBLIC_RULES = '只输出译文，不要解释，不要输出原文以外的内容。';

export const TRANSLATE_PROMPTS = {
  literature: `你是专业的日译中文学翻译。请把用户提供的日语翻译成中文：语言书面、克制、有文学质感，允许适度意译以传达神韵；文语（なり、けり等）与老派敬语按文学惯例处理；避免网络用语与轻小说腔。${PUBLIC_RULES}`,
  lightnovel: `你是专业的日译中翻译，擅长轻小说。请把用户提供的日语翻译成中文：保留角色口癖、语气词与拟声词的节奏；同一角色的自称（ボク、ワシ、わたし等）与敬称（前辈、～酱、大人等）译法保持一致；「……」与短句节奏原样保留；对话口语自然。${PUBLIC_RULES}`,
  generic: `你是专业的日译中翻译。请把用户提供的日语翻译成自然流畅的中文，只输出译文，不要解释。`
};

const CHINESE_BASE =
  '你是日语词典释义助手。请把用户提供的日语词条释义翻译成简洁准确的中文，或按用户要求解释该词，只输出释义本身。';

export const CHINESE_PROMPTS = {
  literature: `${CHINESE_BASE}释义风格书面、简练。`,
  lightnovel: `${CHINESE_BASE}遇到口语、角色语气词或习语时，释义保留其口语色彩。`,
  generic: CHINESE_BASE
};

export function translateSystemFor(genre) {
  return TRANSLATE_PROMPTS[genre] || TRANSLATE_PROMPTS.generic;
}

export function chineseSystemFor(genre) {
  return CHINESE_PROMPTS[genre] || CHINESE_PROMPTS.generic;
}

/**
 * 点句翻译的 user 消息：带前文语境时用两段式，要求只输出待译句。
 * 拖选翻译自带上下文，context 传 null，原样返回所选文本。
 */
export function translateUserContent(text, context = null) {
  if (Array.isArray(context) && context.length > 0) {
    return `【上文参考（仅用于理解，不要翻译）】\n${context.join('\n')}\n\n【待翻译】\n${text}\n\n只翻译并输出【待翻译】部分的译文。`;
  }
  return text;
}

export const CLASSIFY_SYSTEM =
  '你是书籍分类器。根据书名和正文开头判断这本书的类别，只输出以下三个词之一：literature（纯文学、严肃文学）、lightnovel（轻小说）、generic（其他）。不要输出任何其他内容。';

export function classifyUserContent(name, excerpt) {
  return `书名：${name}\n\n正文开头：\n${excerpt}`;
}

/** 宽容解析：剥离引号/标点后匹配英文枚举或中文标签；失败返回 null（按“其他”处理）。 */
export function parseGenre(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().replace(/[「」『』“”‘’。．.，,、\s]/g, '');
  if (text.includes('lightnovel') || text.includes('轻小说')) return 'lightnovel';
  if (text.includes('literature') || text.includes('文学')) return 'literature';
  if (text.includes('generic') || text.includes('其他')) return 'generic';
  return null;
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npm --prefix frontend test -- genres
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/genres.js frontend/src/lib/__tests__/genres.test.js
git commit -m "feat: 新增分类翻译提示词与 LLM 标签解析"
```

---

### Task 4: storage.js DB v2 + removeUploadedBook

**Files:**
- Modify: `frontend/src/lib/storage.js:110-160`
- Create: `frontend/src/lib/__tests__/storage.test.js`
- 依赖：新 devDependency `fake-indexeddb`

- [ ] **Step 1: 安装 fake-indexeddb**

```bash
npm --prefix frontend install -D fake-indexeddb
```

- [ ] **Step 2: 写失败测试**

创建 `frontend/src/lib/__tests__/storage.test.js`：

```js
import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { saveUploadedBook, getUploadedBook, removeUploadedBook, listUploadedBooks } from '../storage.js';

async function freshDb() {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('yuki-books');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
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
```

- [ ] **Step 3: 运行确认失败**

```bash
npm --prefix frontend test -- storage
```

Expected: FAIL（`removeUploadedBook is not a function`）。

- [ ] **Step 4: 实现**

`storage.js` 的 IndexedDB 段（第 110-125 行附近）做如下替换——版本号提为 2、`openDb` 幂等创建两个 store 并导出：

```js
// --- IndexedDB for uploaded books + token cache ---
const DB_NAME = 'yuki-books';
const STORE = 'books';
const TOKEN_CACHE_STORE = 'token-cache';
const DB_VERSION = 2;

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(TOKEN_CACHE_STORE)) {
        const cacheStore = db.createObjectStore(TOKEN_CACHE_STORE, { keyPath: 'id' });
        cacheStore.createIndex('byBook', 'bookId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
```

在文件末尾（`getUploadedBook` 之后）追加：

```js
export async function removeUploadedBook(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  try {
    localStorage.removeItem(progressKey(id));
  } catch {
    // localStorage 不可用（隐私模式）：忽略
  }
}
```

- [ ] **Step 5: 运行确认通过**

```bash
npm --prefix frontend test -- storage
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/storage.js frontend/src/lib/__tests__/storage.test.js frontend/package.json frontend/package-lock.json
git commit -m "feat: IndexedDB 升级 v2，新增删书与 token-cache 存储"
```

---

### Task 5: lib/tokenCache.js（分词持久缓存模块）

**Files:**
- Create: `frontend/src/lib/tokenCache.js`
- Create: `frontend/src/lib/__tests__/tokenCache.test.js`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/__tests__/tokenCache.test.js`：

```js
import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { chapterCacheKey, getTokenRows, putTokenRows, clearForBook } from '../tokenCache.js';

async function freshDb() {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('yuki-books');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

beforeEach(freshDb);

describe('chapterCacheKey', () => {
  it('changes when the chapter text changes', () => {
    const a = chapterCacheKey('b1', 0, '本文一。');
    const b = chapterCacheKey('b1', 0, '本文二。');
    const c = chapterCacheKey('b1', 1, '本文一。');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe(chapterCacheKey('b1', 0, '本文一。')); // 同内容稳定
  });
});

describe('getTokenRows / putTokenRows', () => {
  it('round-trips rows and returns null for misses', async () => {
    const key = chapterCacheKey('b1', 0, '本文。');
    expect(await getTokenRows(key)).toBeNull();

    const rows = [[{ surface: '私', reading: 'わたし', basic: '私', pos: '名詞', clickable: true }]];
    await putTokenRows(key, 'b1', rows);
    expect(await getTokenRows(key)).toEqual(rows);
  });
});

describe('clearForBook', () => {
  it('removes only the target book’s entries', async () => {
    const rows = [[]];
    await putTokenRows(chapterCacheKey('b1', 0, 'a'), 'b1', rows);
    await putTokenRows(chapterCacheKey('b1', 1, 'b'), 'b1', rows);
    await putTokenRows(chapterCacheKey('b2', 0, 'a'), 'b2', rows);

    await clearForBook('b1');

    expect(await getTokenRows(chapterCacheKey('b1', 0, 'a'))).toBeNull();
    expect(await getTokenRows(chapterCacheKey('b1', 1, 'b'))).toBeNull();
    expect(await getTokenRows(chapterCacheKey('b2', 0, 'a'))).toEqual(rows);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm --prefix frontend test -- tokenCache
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

创建 `frontend/src/lib/tokenCache.js`：

```js
// 分词结果持久缓存（IndexedDB yuki-books/token-cache，规格 §3.2）。
// 记录形如 { id, bookId, rows }；id = bookId:chapterIndex:hash(本章全文)。
// 所有入口吞掉 IndexedDB 异常（隐私模式降级为仅会话缓存），调用方无需 try/catch。
import { openDb } from './storage.js';

const STORE = 'token-cache';

/** djb2 32 位哈希：用途仅为“章节内容变化 → key 变化”，正文相同则分词结果必然相同。 */
export function hashChapterText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function chapterCacheKey(bookId, chapterIndex, chapterText) {
  return `${bookId}:${chapterIndex}:${hashChapterText(chapterText)}`;
}

export async function getTokenRows(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result?.rows ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null; // 降级：视为未命中
  }
}

export async function putTokenRows(key, bookId, rows) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ id: key, bookId, rows });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 降级：写缓存失败不影响阅读
  }
}

/** 删书时按 bookId 索引清理该书全部分词缓存。 */
export async function clearForBook(bookId) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).index('byBook').openCursor(IDBKeyRange.only(bookId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 降级：清理失败不阻断删书
  }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npm --prefix frontend test -- tokenCache
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/tokenCache.js frontend/src/lib/__tests__/tokenCache.test.js
git commit -m "feat: 新增分词结果持久缓存模块"
```

---

### Task 6: tokenize.js 批 24 + 接入持久缓存

**Files:**
- Modify: `frontend/src/lib/tokenize.js`（全文替换见下）
- Modify: `frontend/src/lib/__tests__/tokenize.test.js`

- [ ] **Step 1: 更新测试（先失败）**

`tokenize.test.js` 顶部 mock 区改为：

```js
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { tokenizeChapter } from '../tokenize.js';
import { tokenizeSentences } from '../api.js';
import { getTokenRows, putTokenRows } from '../tokenCache.js';

vi.mock('../api.js', () => ({
  tokenizeSentences: vi.fn()
}));

vi.mock('../tokenCache.js', () => ({
  chapterCacheKey: vi.fn((bookId, chapterIndex, text) => `${bookId}:${chapterIndex}:${text}`),
  getTokenRows: vi.fn(),
  putTokenRows: vi.fn(),
  clearForBook: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  getTokenRows.mockResolvedValue(null);
  putTokenRows.mockResolvedValue(undefined);
  tokenizeSentences.mockImplementation(async (batch) =>
    batch.map((s) => [{ surface: s, reading: s, basic: s, pos: '名詞', clickable: true }])
  );
});
```

第一个用例（原 12 句批次断言）替换为：

```js
  it('sends 24-sentence batches and reports partial rows', async () => {
    const sentences = Array.from({ length: 25 }, (_, i) => `文${i}。`);
    const progress = [];

    const rows = await tokenizeChapter('book-1', 0, sentences, (r) => progress.push(r.length));

    expect(rows).toHaveLength(25);
    expect(rows[0]).toEqual([
      { surface: '文0。', reading: '文0。', basic: '文0。', pos: '名詞', clickable: true }
    ]);
    expect(tokenizeSentences).toHaveBeenCalledTimes(2);
    expect(tokenizeSentences.mock.calls[0][0]).toHaveLength(24);
    expect(tokenizeSentences.mock.calls[1][0]).toHaveLength(1);
    expect(progress.length).toBeGreaterThan(1);
    expect(progress[progress.length - 1]).toBe(25);
  });
```

文件末尾追加新 describe：

```js
describe('持久缓存（IndexedDB）', () => {
  it('skips the API when the persistent cache hits', async () => {
    const cached = [[{ surface: '私', reading: 'わたし', basic: '私', pos: '名詞', clickable: true }]];
    getTokenRows.mockResolvedValue(cached);
    const progress = [];

    const rows = await tokenizeChapter('pc-book-1', 0, ['私は学生である。'], (r) => progress.push(r));

    expect(rows).toBe(cached);
    expect(progress).toEqual([cached]);
    expect(tokenizeSentences).not.toHaveBeenCalled();
    expect(putTokenRows).not.toHaveBeenCalled();
  });

  it('writes back to the persistent cache after tokenizing', async () => {
    const rows = await tokenizeChapter('pc-book-2', 0, ['文。']);
    expect(putTokenRows).toHaveBeenCalledTimes(1);
    expect(putTokenRows.mock.calls[0][0]).toBe('pc-book-2:0:文。'); // chapterCacheKey mock 透传
    expect(putTokenRows.mock.calls[0][1]).toBe('pc-book-2');
    expect(putTokenRows.mock.calls[0][2]).toEqual(rows);
  });

  it('does not write back when tokenization fails', async () => {
    tokenizeSentences.mockRejectedValueOnce(new Error('词典服务暂不可用，请稍后重试。'));
    await expect(tokenizeChapter('pc-book-3', 0, ['文。'])).rejects.toThrow(
      '词典服务暂不可用，请稍后重试。'
    );
    expect(putTokenRows).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm --prefix frontend test -- tokenize.test
```

Expected: FAIL（批次断言 2 次调用 vs 实际 3 次；持久缓存用例 getTokenRows 未被调用）。

- [ ] **Step 3: 实现**

`tokenize.js` 全文替换为：

```js
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
```

- [ ] **Step 4: 运行确认通过**

```bash
npm --prefix frontend test -- tokenize.test
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/tokenize.js frontend/src/lib/__tests__/tokenize.test.js
git commit -m "perf: 分词批次 12→24 并接入 IndexedDB 持久缓存"
```

---

### Task 7: sentence.js previousSentences

**Files:**
- Modify: `frontend/src/lib/sentence.js`（文件末尾追加）
- Modify: `frontend/src/lib/__tests__/sentence.test.js`

- [ ] **Step 1: 写失败测试**

在 `sentence.test.js` 顶部 import 行加入 `previousSentences`（与现有导入合并），文件末尾追加：

```js
describe('previousSentences', () => {
  const sentences = ['一。', '二。', '三。', '四。'];

  it('returns up to two preceding sentences', () => {
    expect(previousSentences(sentences, 2)).toEqual(['一。', '二。']);
    expect(previousSentences(sentences, 3)).toEqual(['二。', '三。']);
  });

  it('returns fewer sentences near the chapter start', () => {
    expect(previousSentences(sentences, 0)).toEqual([]);
    expect(previousSentences(sentences, 1)).toEqual(['一。']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm --prefix frontend test -- sentence.test
```

Expected: FAIL（`previousSentences` 未导出）。

- [ ] **Step 3: 实现**

`frontend/src/lib/sentence.js` 文件末尾追加：

```js
/** Returns up to `count` sentences immediately before `index` (LLM 翻译上文语境). */
export function previousSentences(sentences, index, count = 2) {
  return sentences.slice(Math.max(0, index - count), index);
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npm --prefix frontend test -- sentence.test
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/sentence.js frontend/src/lib/__tests__/sentence.test.js
git commit -m "feat: 新增 previousSentences 供翻译上文语境"
```

---

### Task 8: App.jsx 路由/判定/上下文 + 顶栏下拉

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/ReaderView.jsx`
- Modify: `frontend/src/__tests__/app.test.jsx`（BOOK 加 genre）
- Create: `frontend/src/__tests__/app-genre.test.jsx`
- Modify: `frontend/src/styles.css`（末尾追加 `.genre-select`）

- [ ] **Step 1: 写失败集成测试**

创建 `frontend/src/__tests__/app-genre.test.jsx`：

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { chat } from '../lib/api.js';
import { tokenizeChapter } from '../lib/tokenize.js';
import { getUploadedBook, listUploadedBooks, saveUploadedBook } from '../lib/storage.js';
import { loadBuiltInBook, bookFromUploadedText } from '../lib/books.js';

vi.mock('../lib/api.js', () => ({
  lookupDict: vi.fn(),
  chat: vi.fn(),
  ApiError: class ApiError extends Error {}
}));

vi.mock('../lib/tokenize.js', () => ({
  tokenizeChapter: vi.fn(),
  prefetchChapter: vi.fn(),
  clearTokenCache: vi.fn()
}));

vi.mock('../lib/tokenCache.js', () => ({
  chapterCacheKey: vi.fn(),
  getTokenRows: vi.fn(),
  putTokenRows: vi.fn(),
  clearForBook: vi.fn()
}));

vi.mock('../lib/books.js', () => ({
  loadBuiltInBook: vi.fn(),
  bookFromUploadedText: vi.fn()
}));

vi.mock(
  '../lib/storage.js',
  async (importOriginal) => ({
    ...(await importOriginal()),
    listUploadedBooks: vi.fn(async () => []),
    getUploadedBook: vi.fn(async () => null),
    saveUploadedBook: vi.fn(async () => undefined)
  })
);

const TOKEN_ROWS = [
  [{ surface: '私', reading: 'わたし', basic: '私', pos: '名詞', clickable: true }]
];

function uploadedBook(overrides = {}) {
  return {
    id: 'tmp',
    name: 'テスト本',
    author: '',
    genre: null,
    genreManual: false,
    chapters: [
      {
        title: '第 1 章',
        paragraphs: ['「やあ」と彼は言った。', '彼は笑った。']
      }
    ],
    ...overrides
  };
}

async function openUploadedBook(book) {
  listUploadedBooks.mockResolvedValue([{ id: 'u1', name: 'テスト本', uploadedAt: 1 }]);
  getUploadedBook.mockResolvedValue({ id: 'u1', name: 'テスト本', text: 'x', uploadedAt: 1 });
  bookFromUploadedText.mockReturnValue(book);
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'テスト本' }));
  await screen.findAllByTestId('sentence');
}

function configByok() {
  localStorage.setItem(
    'yuki:byok:v1',
    JSON.stringify({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'm', apiKey: 'sk-test' })
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('yuki:settings:v1', JSON.stringify({ showFurigana: false }));
  vi.clearAllMocks();
  tokenizeChapter.mockResolvedValue(TOKEN_ROWS);
});
```

测试用例（同一文件继续追加）：

```jsx
describe('书籍类别判定与提示词路由', () => {
  it('classifies an untagged uploaded book once and persists the genre', async () => {
    configByok();
    chat.mockResolvedValue('「lightnovel」。');
    await openUploadedBook(uploadedBook());

    const select = await screen.findByLabelText('书籍类别');
    await waitFor(() => expect(select).toHaveValue('lightnovel'));
    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat.mock.calls[0][0].messages[0].content).toContain('分类器');
    expect(chat.mock.calls[0][0].messages[1].content).toContain('书名：テスト本');
    expect(saveUploadedBook).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', genre: 'lightnovel' }));
  });

  it('does not classify when the book already has a genre', async () => {
    configByok();
    chat.mockResolvedValue('generic');
    await openUploadedBook(uploadedBook({ genre: 'literature', genreManual: true }));

    await screen.findAllByTestId('sentence');
    await new Promise((r) => setTimeout(r, 20));
    expect(chat).not.toHaveBeenCalled();
    expect(screen.getByLabelText('书籍类别')).toHaveValue('literature');
  });

  it('does not classify without an API key', async () => {
    chat.mockResolvedValue('generic');
    await openUploadedBook(uploadedBook());

    await screen.findAllByTestId('sentence');
    await new Promise((r) => setTimeout(r, 20));
    expect(chat).not.toHaveBeenCalled();
  });

  it('manual selection wins over a pending auto classification and persists genreManual', async () => {
    configByok();
    chat.mockResolvedValue('lightnovel');
    await openUploadedBook(uploadedBook());

    fireEvent.change(screen.getByLabelText('书籍类别'), { target: { value: 'literature' } });

    await waitFor(() =>
      expect(saveUploadedBook).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', genre: 'literature', genreManual: true })
      )
    );
    // 分类请求返回 lightnovel，但不得覆盖手动设置
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText('书籍类别')).toHaveValue('literature');
  });

  it('routes the translation system prompt by genre', async () => {
    configByok();
    chat.mockResolvedValue('轻小说腔译文');
    await openUploadedBook(uploadedBook({ genre: 'lightnovel' }));

    await userEvent.click(screen.getAllByTestId('word-span')[0].closest('[data-testid="sentence"]'));
    await screen.findByText('轻小说腔译文');

    const call = chat.mock.calls.find((c) => c[0].messages[1].content.includes('「やあ」と彼は言った。'));
    expect(call).toBeTruthy();
    expect(call[0].messages[0].content).toContain('轻小说');
  });

  it('injects the two preceding sentences as context for sentence clicks', async () => {
    configByok();
    chat.mockResolvedValue('译文');
    await openUploadedBook(uploadedBook());

    // 点击第二句
    await userEvent.click(screen.getAllByTestId('sentence')[1]);
    await screen.findByText('译文');

    const call = chat.mock.calls.at(-1);
    expect(call[0].messages[1].content).toContain('【上文参考');
    expect(call[0].messages[1].content).toContain('「やあ」と彼は言った。');
    expect(call[0].messages[1].content).toContain('【待翻译】\n彼は笑った。');

    // 失败重试保留上下文
    chat.mockRejectedValueOnce(new Error('boom'));
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    await screen.findByText('boom');
    expect(chat.mock.calls.at(-1)[0].messages[1].content).toContain('【待翻译】');
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm --prefix frontend test -- app-genre
```

Expected: FAIL（找不到 `书籍类别` select 等）。

- [ ] **Step 3: 实现 App.jsx**

3a. 顶部 import 区：删除两行常量定义 `const TRANSLATE_SYSTEM = ...` 与 `const CHINESE_SYSTEM = ...`（第 21-22 行），在 `import { clearTokenCache } ...` 之后加入：

```js
import {
  GENRE_KEYS,
  GENRE_LABELS,
  translateSystemFor,
  chineseSystemFor,
  translateUserContent,
  CLASSIFY_SYSTEM,
  classifyUserContent,
  parseGenre
} from './lib/genres.js';
```

3b. `App` 组件内、`copyTimer` ref 声明之后（`refreshLibrary` 的 `useEffect` 之前）加入以下代码——**注意 `persistGenre` 在判定 effect 之前声明**，`bookRef` 用于分类结果返回时判断用户是否已手动设置：

```js
  const classifiedRef = useRef(new Set());
  const bookRef = useRef(null);

  // bookRef 跟随最新书状态
  useEffect(() => {
    bookRef.current = book;
  }, [book]);

  // 把 genre 字段写回 IndexedDB（内置书无记录则跳过）
  const persistGenre = useCallback(async (bookId, patch) => {
    try {
      const stored = await getUploadedBook(bookId);
      if (!stored) return;
      await saveUploadedBook({ ...stored, ...patch });
    } catch {
      // IndexedDB 不可用：仅保留内存态
    }
  }, []);

  // 书籍类别判定（规格 §4）：打开无标签书后静默判一次，失败/无 Key/手动设置均跳过
  useEffect(() => {
    if (route !== 'reading' || !book) return;
    if (book.genre || book.genreManual) return;
    if (!byok.apiKey?.trim()) return;
    if (classifiedRef.current.has(book.id)) return;
    classifiedRef.current.add(book.id);
    let cancelled = false;
    const excerpt = (book.chapters[0]?.paragraphs || []).join('\n').slice(0, 600);
    chat({
      baseUrl: byok.baseUrl,
      model: byok.model,
      apiKey: byok.apiKey,
      messages: [
        { role: 'system', content: CLASSIFY_SYSTEM },
        { role: 'user', content: classifyUserContent(book.name, excerpt) }
      ]
    })
      .then((content) => {
        if (cancelled) return;
        const genre = parseGenre(content);
        if (!genre) return;
        const cur = bookRef.current;
        if (!cur || cur.id !== book.id || cur.genreManual) return; // 手动设置优先（规格 §4）
        setBook((prev) => (prev && prev.id === book.id && !prev.genreManual ? { ...prev, genre } : prev));
        persistGenre(book.id, { genre });
      })
      .catch(() => {}); // 静默失败，保持“其他”
    return () => {
      cancelled = true;
    };
  }, [route, book, byok, persistGenre]);

  const handleGenreChange = useCallback(
    (value) => {
      setBook((prev) => (prev ? { ...prev, genre: value, genreManual: true } : prev));
      if (book) persistGenre(book.id, { genre: value, genreManual: true });
    },
    [book, persistGenre]
  );
```

3c. `handleTranslate` 整体替换为：

```js
  const handleTranslate = useCallback(
    (text, context = null) => {
      if (!byok.apiKey?.trim()) {
        setSidebar({ kind: 'prompt', message: '翻译功能需要 API Key，请先前往设置配置。' });
        return;
      }
      const genre = book?.genre || 'generic';
      setSidebar({
        kind: 'translation',
        original: text,
        status: 'loading',
        lastAction: { type: 'translate', text, context }
      });
      chat({
        baseUrl: byok.baseUrl,
        model: byok.model,
        apiKey: byok.apiKey,
        messages: [
          { role: 'system', content: translateSystemFor(genre) },
          { role: 'user', content: translateUserContent(text, context) }
        ]
      })
        .then((content) => {
          setSidebar((prev) =>
            prev.kind === 'translation' && prev.original === text
              ? { ...prev, status: 'done', result: content }
              : prev
          );
        })
        .catch((err) => {
          setSidebar((prev) =>
            prev.kind === 'translation' && prev.original === text
              ? { ...prev, status: 'error', error: err.message }
              : prev
          );
        });
    },
    [byok, book]
  );
```

3d. `handleChinese` 中 messages 的 system 行替换（其余不动）：

```js
        messages: [
          { role: 'system', content: chineseSystemFor(book?.genre || 'generic') },
          { role: 'user', content: userContent }
        ]
```

并把该 `useCallback` 依赖数组改为 `[byok, book]`。

3e. `handleRetry` 的 translate 分支替换为：

```js
    else if (action.type === 'translate') handleTranslate(action.text, action.context);
```

3f. 顶栏 JSX：`<div className="topbar-actions">` 内、`阅读设置` 按钮之前插入：

```jsx
            {book && (
              <select
                className="genre-select"
                aria-label="书籍类别"
                value={book.genre || 'generic'}
                onChange={(e) => handleGenreChange(e.target.value)}
              >
                {GENRE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {GENRE_LABELS[key]}
                  </option>
                ))}
              </select>
            )}
```

- [ ] **Step 4: 实现 ReaderView 上下文接线**

`ReaderView.jsx`：

4a. import 行改为：

```js
import { splitSentences, previousSentences } from '../lib/sentence.js';
```

4b. 渲染映射块（`structure.map` 内部）整体替换为：

```jsx
              {structure.map((group, gi) => (
                <div className="para" key={gi}>
                  {group.sentences.map((s) => {
                    const idx = sentenceIndex;
                    const tokens = tokenRows[idx];
                    sentenceIndex += 1;
                    const context = previousSentences(flatSentences, idx);
                    return tokens ? (
                      <Sentence
                        key={idx}
                        sentence={s}
                        tokens={tokens}
                        onWord={onWord}
                        onSentence={(text) => onTranslate(text, context)}
                        onSelection={onTranslateSelection}
                        showFurigana={settings.showFurigana}
                      />
                    ) : (
                      <div
                        key={idx}
                        className="sentence sentence-plain"
                        data-testid="sentence"
                        onClick={() => handlePlainSentenceClick(s, idx)}
                        onMouseUp={handlePlainMouseUp}
                      >
                        {s}
                      </div>
                    );
                  })}
                </div>
              ))}
```

4c. `handlePlainSentenceClick` 替换为：

```js
  const handlePlainSentenceClick = (text, index) => {
    onTranslate(text, previousSentences(flatSentences, index));
  };
```

- [ ] **Step 5: app.test.jsx 兼容调整**

`frontend/src/__tests__/app.test.jsx` 的 `BOOK` 常量加入 `genre`（避免触发分类调用影响既有断言）：

```js
const BOOK = {
  id: 'kokoro',
  name: 'こころ',
  author: '夏目漱石',
  sourceLabel: '青空文庫',
  genre: 'literature',
  chapters: [{ title: '上', paragraphs: ['私は学生である。'] }]
};
```

- [ ] **Step 6: 样式**

`frontend/src/styles.css` 末尾追加：

```css
/* 书籍类别下拉（阅读页顶栏） */
.genre-select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.genre-select:hover,
.genre-select:focus {
  color: var(--text-primary);
  border-color: var(--accent);
  outline: none;
}
```

- [ ] **Step 7: 运行全部前端测试**

```bash
npm --prefix frontend test
```

Expected: 全部 PASS（既有 59 用例 + 本计划新增用例；若 `app.test.jsx` 出现分类副作用导致的失败，检查 Step 5 是否遗漏）。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/ReaderView.jsx frontend/src/styles.css frontend/src/__tests__/app.test.jsx frontend/src/__tests__/app-genre.test.jsx
git commit -m "feat: 按书籍类别路由翻译提示词并注入上文语境"
```

---

### Task 9: 首页删书入口 + App 删除接线

**Files:**
- Modify: `frontend/src/components/HomeView.jsx`
- Modify: `frontend/src/App.jsx`
- Create: `frontend/src/components/__tests__/HomeView.test.jsx`
- Create: `frontend/src/__tests__/app-delete.test.jsx`
- Modify: `frontend/src/styles.css`（末尾追加）

- [ ] **Step 1: 写 HomeView 失败测试**

创建 `frontend/src/components/__tests__/HomeView.test.jsx`（若 `components/__tests__/` 目录不存在则连同目录新建；已有 `Sentence.test.jsx` 在该目录）：

```jsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomeView from '../HomeView.jsx';

const noop = vi.fn();

function renderHome(props = {}) {
  return render(
    <HomeView
      busy={false}
      books={[{ id: 'u1', name: '书A', encoding: 'UTF-8', uploadedAt: 1 }]}
      theme="default"
      onOpenBuiltIn={noop}
      onUploadFile={noop}
      onOpenBook={noop}
      onOpenSettings={noop}
      onOpenByokSettings={noop}
      onToggleTheme={noop}
      onDeleteBook={noop}
      {...props}
    />
  );
}

describe('首页删书入口', () => {
  it('uploaded books get a delete button, the built-in book does not', () => {
    renderHome();
    expect(screen.getByRole('button', { name: '删除 书A' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除 内置书/ })).not.toBeInTheDocument();
  });

  it('confirm dialog deletes the book, cancel keeps it', async () => {
    const onDeleteBook = vi.fn();
    renderHome({ onDeleteBook });

    await userEvent.click(screen.getByRole('button', { name: '删除 书A' }));
    expect(await screen.findByText('删除书籍')).toBeInTheDocument();
    expect(screen.getByText(/删除不可恢复/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onDeleteBook).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '删除 书A' }));
    await userEvent.click(screen.getByRole('button', { name: '删除', exact: true }));
    expect(onDeleteBook).toHaveBeenCalledWith({ id: 'u1', name: '书A', encoding: 'UTF-8', uploadedAt: 1 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm --prefix frontend test -- HomeView
```

Expected: FAIL（找不到删除按钮）。

- [ ] **Step 3: 实现 HomeView**

3a. props 增加 `onDeleteBook`（解构参数列表加一项），组件 state 区（`collapsed` 之后）加：

```js
  const [deleteTarget, setDeleteTarget] = useState(null);
```

3b. 文件列表的上传书 `books.map(...)` 块（`HomeView.jsx` 原 154-162 行）替换为：

```jsx
            books.map((b) => (
              <div className="home-file-row" key={b.id}>
                <button className="home-file-item" onClick={() => onOpenBook(b)}>
                  <span className="home-file-icon">{ICONS.file}</span>
                  <span className="home-file-info">
                    <span className="home-file-name">{b.name}</span>
                    {b.encoding ? <span className="home-file-meta">{b.encoding.toUpperCase()}</span> : null}
                  </span>
                </button>
                <button
                  className="home-file-delete"
                  aria-label={`删除 ${b.name}`}
                  title={`删除 ${b.name}`}
                  onClick={() => setDeleteTarget(b)}
                >
                  ×
                </button>
              </div>
            ))
```

3c. 组件 JSX 末尾（`usage` 使用说明弹窗之后、最外层 `</div>` 之前）加确认弹窗：

```jsx
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="删除书籍"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>删除书籍</h2>
              <button className="icon-btn" onClick={() => setDeleteTarget(null)} aria-label="关闭">×</button>
            </header>
            <div className="modal-body">
              <p>确定删除《{deleteTarget.name}》吗？</p>
              <p className="modal-note">删除不可恢复，将同时清除这本书的本地阅读进度与分词缓存。</p>
            </div>
            <footer className="modal-footer">
              <button className="btn ghost" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn danger" onClick={() => { onDeleteBook(deleteTarget); setDeleteTarget(null); }}>
                删除
              </button>
            </footer>
          </div>
        </div>
      )}
```

- [ ] **Step 4: 实现 App 删除接线**

4a. `App.jsx` storage import 列表加入 `removeUploadedBook`，并新增 import：

```js
import { clearForBook } from './lib/tokenCache.js';
```

4b. `handleSaveByok` 之后加入：

```js
  const handleDeleteBook = useCallback(
    async (meta) => {
      try {
        await removeUploadedBook(meta.id);
        await clearForBook(meta.id);
        await refreshLibrary();
      } catch (err) {
        setGlobalError(`删除失败：${err.message || '本地存储不可用'}`);
      }
    },
    [refreshLibrary]
  );
```

4c. `HomeView` 调用处新增 prop：`onDeleteBook={handleDeleteBook}`。

- [ ] **Step 5: 样式**

`frontend/src/styles.css` 末尾追加：

```css
/* 首页删书入口 */
.home-file-row {
  position: relative;
  display: flex;
  align-items: stretch;
}

.home-file-row .home-file-item {
  flex: 1;
}

.home-file-delete {
  width: 26px;
  margin-left: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.home-file-row:hover .home-file-delete,
.home-file-delete:focus-visible {
  opacity: 1;
}

.home-file-delete:hover {
  color: var(--danger);
  border-color: var(--danger);
}

/* 删除确认弹窗 */
.modal-note {
  color: var(--text-muted);
  font-size: 13px;
}

.btn.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

.btn.danger:hover {
  filter: brightness(0.92);
}
```

- [ ] **Step 6: 写 App 删除接线测试并确认通过**

创建 `frontend/src/__tests__/app-delete.test.jsx`：

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { removeUploadedBook, listUploadedBooks } from '../lib/storage.js';
import { clearForBook } from '../lib/tokenCache.js';

vi.mock('../lib/api.js', () => ({
  lookupDict: vi.fn(),
  chat: vi.fn(),
  ApiError: class ApiError extends Error {}
}));

vi.mock('../lib/tokenize.js', () => ({
  tokenizeChapter: vi.fn(),
  prefetchChapter: vi.fn(),
  clearTokenCache: vi.fn()
}));

vi.mock('../lib/tokenCache.js', () => ({
  chapterCacheKey: vi.fn(),
  getTokenRows: vi.fn(),
  putTokenRows: vi.fn(),
  clearForBook: vi.fn()
}));

vi.mock('../lib/books.js', () => ({
  loadBuiltInBook: vi.fn(),
  bookFromUploadedText: vi.fn()
}));

vi.mock(
  '../lib/storage.js',
  async (importOriginal) => ({
    ...(await importOriginal()),
    listUploadedBooks: vi.fn(),
    getUploadedBook: vi.fn(),
    saveUploadedBook: vi.fn(),
    removeUploadedBook: vi.fn()
  })
);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('yuki:settings:v1', JSON.stringify({ showFurigana: false }));
  vi.clearAllMocks();
  listUploadedBooks.mockResolvedValue([{ id: 'u1', name: '删除测试', encoding: 'UTF-8', uploadedAt: 1 }]);
  getUploadedBook.mockResolvedValue(null);
  saveUploadedBook.mockResolvedValue(undefined);
  removeUploadedBook.mockResolvedValue(undefined);
});

describe('首页删书接线', () => {
  it('deletes the record and its token cache after confirmation', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '删除 删除测试' }));
    await userEvent.click(await screen.findByRole('button', { name: '删除', exact: true }));

    listUploadedBooks.mockResolvedValue([]); // 删除后刷新书库为空
    await screen.findByText(/还没有上传的书/);
    expect(removeUploadedBook).toHaveBeenCalledWith('u1');
    expect(clearForBook).toHaveBeenCalledWith('u1');
  });
});
```

- [ ] **Step 7: 运行全部前端测试**

```bash
npm --prefix frontend test
```

Expected: 全部 PASS。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/HomeView.jsx frontend/src/App.jsx frontend/src/styles.css "frontend/src/components/__tests__/HomeView.test.jsx" frontend/src/__tests__/app-delete.test.jsx
git commit -m "feat: 首页文件列表新增删书入口（含进度与分词缓存清理）"
```

---

### Task 10: 全量验证 + 基准复测 + 文档

**Files:**
- Modify: `README.md`
- Modify: `docs/handover/2026-08-11-yuki-reader.md`（gitignored 本地文档）

- [ ] **Step 1: 全量测试**

```bash
npm --prefix frontend test
mvn -f backend/pom.xml test
```

Expected: 前端全部 PASS；后端 38 用例 PASS（后端零改动，跑一遍确认无回归）。

- [ ] **Step 2: 构建**

```bash
npm --prefix frontend run build
mvn -f backend/pom.xml -q -DskipTests package
```

Expected: 前端构建并复制进 `backend/src/main/resources/static`；fat jar 生成。

- [ ] **Step 3: 启动 jar 做浏览器端到端验证**

```bash
YUKI_DB_PATH='backend/data/yuki.db' java -jar backend/target/yuki-reader.jar > backend/server.log 2>&1 &
echo $! > scripts/data/server.pid
for i in $(seq 1 30); do curl -sf http://localhost:8080/ >/dev/null && break; sleep 1; done
```

浏览器打开 http://localhost:8080（需真实 LLM Key 的步骤在「翻译设置」里填自己的 Key），逐项检查：

1. 上传一本轻小说 TXT（无章节标题）→ 目录按 ~1500 字符/章切分，章数明显多于旧版；
2. 配置 Key 后进入阅读页：顶栏「书籍类别」下拉先显示「其他」，数秒后自动变为「轻小说」；DevTools Network 可见一次 `/api/chat` 分类请求；
3. 点句翻译：请求体 system 为轻小说提示词、user 含【上文参考】两段式；重试后请求体一致；
4. 拖选翻译：请求体 user 为纯选区文本（无【上文参考】段）；
5. 词典卡「中文释义」请求 system 含释义提示词；
6. 手动把下拉改为「文学」→ 后续翻译走文学提示词；刷新重进不再触发自动判定；
7. 打开《こころ》→ 下拉直接显示「文学」，无分类请求；
8. 刷新页面重开同一本书 → 无「正在分词」直接渲染（持久缓存命中；首次打开该书的章节仍会正常分词）；
9. 首页文件列表 hover 上传书出现「×」→ 确认弹窗 → 删除后列表消失、进度清空；重传同名书视为新书；
10. 夜间模式下顶栏下拉、删除按钮、确认弹窗样式正常（无不可读对比度）。

- [ ] **Step 4: 分词基准复测**

```bash
node scripts/data/tokenize-bench.mjs | tee scripts/data/tokenize-after.log
kill $(cat scripts/data/server.pid)
```

Expected: `batch=24 conc=4` 的毫秒数相对基线 `batch=12 conc=4`（`scripts/data/tokenize-baseline.log`）有可观下降（预期接近一半往返开销）；把对比数字写进最终交付说明。

- [ ] **Step 5: 文档更新**

`README.md`：

- 「功能特点」表新增一行：`| 分类翻译 | 自动识别书籍类别（文学/轻小说/其他）切换翻译风格，可在阅读页顶栏手动修改 |`
- 「常见问题」追加两条：
  - `- **翻译风格能换吗？** 阅读页顶栏的「书籍类别」下拉可随时切换文学/轻小说/其他；未配置 API Key 时自动判定不可用，仍可手动选择。`
  - `- **重开书还要等分词吗？** 分词结果会缓存在浏览器本地（IndexedDB），第二次打开同一本书直接渲染；删除书籍时会一并清理。`

`docs/handover/2026-08-11-yuki-reader.md`（本地内部文档）：

- §5.3 追加：切章粒度已改 1500（`CHARS_PER_CHAPTER`）；
- §5.4 更新：批大小 24、缓存链为会话 → IndexedDB `token-cache`（`lib/tokenCache.js`，key = `bookId:chapterIndex:djb2(本章全文)`）→ 后端；
- §5.10 补 `removeUploadedBook`、`clearForBook`、DB v2；
- §2 完成状态追加本次改动摘要与日期。

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: README 同步分类翻译、分词持久缓存与删书说明"
```

---

## 规格覆盖对照（自审）

| 规格条目 | 任务 |
| --- | --- |
| §3.1 genre/genreManual 字段、内置书固定 literature | Task 3（常量）+ Task 8（状态与落库） |
| §3.2 token-cache store、djb2、bookId 索引 | Task 4 + Task 5 |
| §3.3 已知影响（进度偏移） | 无代码，Task 10 e2e 步骤 1/9 观察 |
| §4 判定流程（触发条件/解析/竞态/静默） | Task 8 Step 3b + app-genre 测试 |
| §5.1 三套提示词 + 上下文注入（拖选不注入） | Task 3 + Task 8 Step 3c/4 |
| §5.2 词典卡路由 | Task 8 Step 3d |
| §6 顶栏下拉（显示/写回/静默判定） | Task 8 Step 3f + Task 8 Step 6 样式 |
| §7 批 24、持久缓存、降级、基准 | Task 1 + Task 6 |
| 切章 1500 | Task 2 |
| §8 错误处理表各行 | Task 3/5/8/9 的降级与静默路径 + 测试 |
| 删书入口（记录+进度+缓存清理、确认弹窗、内置书不可删） | Task 9 |
| §9 测试与验收 | 各任务 TDD + Task 10 |
| §10 后续扩展 | 不在本计划 |
