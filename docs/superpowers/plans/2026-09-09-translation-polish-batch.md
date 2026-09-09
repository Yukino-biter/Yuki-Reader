# 翻译体验打磨批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 流式翻译可中止（自动中止 + 停止按钮）、翻译历史持久化（IndexedDB，上限 50）、拖选翻译带前两句上下文、删除死代码并同步文档。

**Architecture:** 全部纯前端。中止 = 请求序号守卫 + AbortController（App 持 refs，api.js 透传 signal 并放行 AbortError）；历史 = App state 单一事实源 + IndexedDB `translation-history` store 整表镜像（DB v4）；拖选上下文复用点句路径的 `previousSentences(flatSentences, idx)`。

**Tech Stack:** React 18 + Vite 5 + Vitest/jsdom + @testing-library/react + fake-indexeddb；后端零改动。

**Spec:** `docs/superpowers/specs/2026-09-09-translation-polish-batch-design.md`

**验证命令约定：** 一律从仓库根运行（`npm --prefix frontend ...`、`mvn -f backend\pom.xml ...`）。单文件测试：`npm --prefix frontend test -- <文件名关键词>`。

---

## 文件结构

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `frontend/src/lib/api.js` | 修改 | chatStream 增加 signal 透传 + AbortError 放行 |
| `frontend/src/lib/storage.js` | 修改 | DB_VERSION 3→4，新建 `translation-history` store |
| `frontend/src/lib/translationHistory.js` | 新建 | 历史读写（loadHistory / saveHistory，自吞异常降级） |
| `frontend/src/App.jsx` | 修改 | 历史接线；流式序号守卫 + 中止；onStopStream |
| `frontend/src/components/Sidebar.jsx` | 修改 | 流式卡「停止」按钮 + stopped 态渲染 |
| `frontend/src/components/ReaderView.jsx` | 修改 | 两条拖选路径补 context |
| `frontend/src/components/LibraryModal.jsx` | 删除 | 死代码（零引用） |
| `frontend/src/lib/__tests__/chatStream.test.js` | 修改 | signal 用例 |
| `frontend/src/lib/__tests__/translationHistory.test.js` | 新建 | 模块用例 |
| `frontend/src/lib/__tests__/storage.test.js` | 不改 | 未钉 DB_VERSION，无需动 |
| `frontend/src/__tests__/app-history.test.jsx` | 修改 | 挂载加载 / 持久化 / 上限 50 |
| `frontend/src/__tests__/app-stream.test.jsx` | 修改 | 中止 / 同文本不交错 / 停止 |
| `frontend/src/__tests__/app-selection-context.test.jsx` | 新建 | 两条拖选路径带 context |
| `README.md`、`docs/handover/2026-08-11-yuki-reader.md` | 修改 | 文档同步（交接文档仅本地） |

---

### Task 1: chatStream 支持 AbortSignal 并放行 AbortError

**Files:**
- Modify: `frontend/src/lib/api.js:69-79`（chatStream 签名与 fetch catch）
- Test: `frontend/src/lib/__tests__/chatStream.test.js`

- [ ] **Step 1: 写失败测试**（追加到 `describe('chatStream', ...)` 内）

```js
it('passes signal through to fetch', async () => {
  const controller = new AbortController();
  const fetchMock = vi.fn(async () => sseResponse(
    'data: {"choices":[{"delta":{"content":"好"}}]}\n\n'
  ));
  vi.stubGlobal('fetch', fetchMock);
  await chatStream({ messages: [], signal: controller.signal, onDelta: () => {} });

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/chat/stream',
    expect.objectContaining({ signal: controller.signal })
  );
});

it('rethrows AbortError instead of mapping it to a network error', async () => {
  const abortError = new DOMException('The operation was aborted.', 'AbortError');
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw abortError;
  }));

  await expect(chatStream({ messages: [], signal: new AbortController().signal }))
    .rejects.toBe(abortError);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend test -- chatStream`
Expected: 新增 2 例 FAIL（signal 未透传；AbortError 被映射成 ApiError network）

- [ ] **Step 3: 最小实现**（`api.js` chatStream 开头）

```js
export async function chatStream({ baseUrl, model, apiKey, messages, onDelta, signal }) {
  let res;
  try {
    res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, model, apiKey, messages }),
      signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('网络请求失败，请检查网络连接。', 0, 'network');
  }
```

（读流循环 `reader.read()` 的 AbortError 本就向上抛，不改。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix frontend test -- chatStream`
Expected: 全部 PASS（原 5 例 + 新 2 例）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.js frontend/src/lib/__tests__/chatStream.test.js
git commit -m "feat: chatStream 支持 AbortSignal 并放行 AbortError"
```

---

### Task 2: storage v4 + translationHistory 模块

**Files:**
- Modify: `frontend/src/lib/storage.js:110-140`（store 常量、DB_VERSION、onupgradeneeded）
- Create: `frontend/src/lib/translationHistory.js`
- Test: `frontend/src/lib/__tests__/translationHistory.test.js`

- [ ] **Step 1: 写失败测试**（新建 `translationHistory.test.js`）

```js
import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadHistory, saveHistory } from '../translationHistory.js';
import { openDb } from '../storage.js';

let actualOpenDb;
vi.mock('../storage.js', async (importOriginal) => {
  const mod = await importOriginal();
  actualOpenDb = mod.openDb;
  return { ...mod, openDb: vi.fn() };
});

async function freshStore() {
  const db = await actualOpenDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('translation-history', 'readwrite');
    tx.objectStore('translation-history').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

beforeEach(async () => {
  openDb.mockImplementation((...args) => actualOpenDb(...args));
  await freshStore();
});

describe('loadHistory / saveHistory', () => {
  it('round-trips entries sorted by at descending', async () => {
    await saveHistory([
      { id: 'a', original: '一。', result: '1', at: 1 },
      { id: 'b', original: '二。', result: '2', at: 2 }
    ]);
    expect(await loadHistory()).toEqual([
      { id: 'b', original: '二。', result: '2', at: 2 },
      { id: 'a', original: '一。', result: '1', at: 1 }
    ]);
  });

  it('mirrors the whole list (clear + rewrite)', async () => {
    await saveHistory([{ id: 'a', original: '一。', result: '1', at: 1 }]);
    await saveHistory([{ id: 'b', original: '二。', result: '2', at: 2 }]);
    expect(await loadHistory()).toEqual([{ id: 'b', original: '二。', result: '2', at: 2 }]);
  });

  it('degrades silently when IndexedDB is unavailable', async () => {
    openDb.mockRejectedValue(new Error('idb unavailable'));
    await expect(saveHistory([{ id: 'a', original: '一。', result: '1', at: 1 }])).resolves.toBeUndefined();
    await expect(loadHistory()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend test -- translationHistory`
Expected: FAIL（模块不存在 / store 不存在，fake-indexeddb 抛 NotFoundError）

- [ ] **Step 3: 实现 storage.js v4**

```js
const GLOSSARY_STORE = 'glossaries';
const TRANSLATION_HISTORY_STORE = 'translation-history';
const DB_VERSION = 4;
```

`onupgradeneeded` 内 glossaries 之后追加：

```js
if (!db.objectStoreNames.contains(TRANSLATION_HISTORY_STORE)) {
  db.createObjectStore(TRANSLATION_HISTORY_STORE, { keyPath: 'id' });
}
```

- [ ] **Step 4: 新建 `lib/translationHistory.js`**

```js
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
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm --prefix frontend test -- translationHistory`
Expected: 3 例 PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/storage.js frontend/src/lib/translationHistory.js frontend/src/lib/__tests__/translationHistory.test.js
git commit -m "feat: 翻译历史 IndexedDB 持久化模块（DB v4 新增 translation-history store）"
```

---

### Task 3: App 接入历史持久化（上限 20 → 50）

**Files:**
- Modify: `frontend/src/App.jsx`（import、HISTORY_LIMIT、挂载加载、pushHistory）
- Test: `frontend/src/__tests__/app-history.test.jsx`

- [ ] **Step 1: 写失败测试**

`app-history.test.jsx` 顶部 mock 区追加（紧挨 translationCache 的 mock）：

```js
vi.mock('../lib/translationHistory.js', () => ({
  loadHistory: vi.fn(),
  saveHistory: vi.fn()
}));
```

import 区追加：

```js
import { loadHistory, saveHistory } from '../lib/translationHistory.js';
```

`beforeEach` 追加：

```js
  loadHistory.mockResolvedValue([]);
```

`describe('侧栏翻译历史', ...)` 内追加：

```js
  it('loads persisted history on mount', async () => {
    configByok();
    loadHistory.mockResolvedValue([
      { id: 'a', original: '昨日の文。', result: '昨天的译文', at: 1 }
    ]);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '历史书' }));
    await screen.findAllByTestId('sentence');

    const pane = screen.getByRole('complementary');
    await userEvent.click(within(pane).getByRole('button', { name: '历史（1）' }));
    expect(within(pane).getByText('昨日の文。')).toBeInTheDocument();
  });

  it('persists new entries and caps the list at 50', async () => {
    configByok();
    loadHistory.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({ id: `o${i}`, original: `旧句${i}。`, result: `旧译${i}`, at: i }))
    );
    chat.mockResolvedValue('新译文');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '历史书' }));
    await screen.findAllByTestId('sentence');

    await userEvent.click(screen.getAllByTestId('sentence')[0]);
    await screen.findByText('新译文');

    expect(saveHistory).toHaveBeenCalled();
    const saved = saveHistory.mock.calls.at(-1)[0];
    expect(saved).toHaveLength(50);
    expect(saved[0].original).toBe('私は学生である。');
    expect(saved.some((h) => h.original === '旧句0。')).toBe(true);
    expect(saved.some((h) => h.original === '旧句49。')).toBe(false);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend test -- app-history`
Expected: 新增 2 例 FAIL（历史条数不对 / saveHistory 未被调用）

- [ ] **Step 3: 实现 App.jsx**

`sameToken` 函数后加常量：

```js
const HISTORY_LIMIT = 50;
```

import 区追加：

```js
import { loadHistory, saveHistory } from './lib/translationHistory.js';
```

`const [historyView, setHistoryView] = useState(false);`（55 行）之后追加挂载加载：

```js
useEffect(() => {
  let alive = true;
  loadHistory().then((rows) => {
    if (alive) setHistory(rows);
  });
  return () => {
    alive = false;
  };
}, []);
```

`pushHistory`（251-259 行）替换为：

```js
const pushHistory = useCallback((original, result) => {
  setHistory((prev) => {
    const rest = prev.filter((h) => h.original !== original);
    const next = [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, original, result, at: Date.now() },
      ...rest
    ].slice(0, HISTORY_LIMIT);
    saveHistory(next);
    return next;
  });
}, []);
```

> 注：main.jsx 用了 StrictMode，开发模式 updater 可能双调用；saveHistory 是整表镜像（幂等，后写覆盖），状态与库最终一致。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix frontend test -- app-history`
Expected: 全部 PASS（原 1 例 + 新 2 例）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/__tests__/app-history.test.jsx
git commit -m "feat: App 接入翻译历史持久化，历史上限 20 调整为 50"
```

---

### Task 4: 流式中止（序号守卫 + AbortController）+ 停止按钮 + stopped 态

**Files:**
- Modify: `frontend/src/App.jsx`（refs、cancelStream/beginStream/stopStream、handleWord/handleChinese/handleSelectHistory/handleTranslate、Sidebar props）
- Modify: `frontend/src/components/Sidebar.jsx`（onStopStream prop、停止按钮、stopped 渲染）
- Test: `frontend/src/__tests__/app-stream.test.jsx`

- [ ] **Step 1: 写失败测试**

`app-stream.test.jsx` 改动：

1）顶部 mock 区追加（translationCache mock 之后）：

```js
vi.mock('../lib/translationHistory.js', () => ({
  loadHistory: vi.fn(async () => []),
  saveHistory: vi.fn()
}));
```

import 区追加：

```js
import { putTranslation } from '../lib/translationCache.js';
import { saveHistory } from '../lib/translationHistory.js';
import { act } from '@testing-library/react';
```

（`putTranslation` 已在 translationCache mock 内。）

2）`BOOK` 的 paragraphs 改为两句（后续用例需要第二句）：

```js
const BOOK = {
  id: 'u1',
  name: '流式书',
  author: '',
  genre: 'generic',
  genreManual: true,
  chapters: [{ title: '第 1 章', paragraphs: ['私は学生である。', '彼は笑った。'] }]
};
```

3）`describe('流式翻译', ...)` 内追加三个用例：

```js
it('aborts the previous stream when a new translation starts', async () => {
  configByok();
  const signals = [];
  chatStream
    .mockImplementationOnce(({ onDelta, signal }) => {
      signals.push(signal);
      return new Promise(() => {
        onDelta('旧流');
      });
    })
    .mockImplementationOnce(({ onDelta }) => new Promise((resolve) => {
      onDelta('新流');
      resolve('新流');
    }));
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: '流式书' }));
  await screen.findAllByTestId('sentence');

  await userEvent.click(screen.getAllByTestId('sentence')[0]);
  await screen.findByText('旧流');
  await userEvent.click(screen.getAllByTestId('sentence')[1]);
  await screen.findByText('新流');

  expect(signals[0].aborted).toBe(true);
  const pane = screen.getByRole('complementary');
  expect(within(pane).queryByText('旧流')).not.toBeInTheDocument();
});

it('re-translating the same text does not interleave old deltas', async () => {
  configByok();
  const deltas = [];
  const signals = [];
  let pendingResolve;
  chatStream.mockImplementation(({ onDelta, signal }) => {
    deltas.push(onDelta);
    signals.push(signal);
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('已中止', 'AbortError')));
      pendingResolve = resolve;
    });
  });
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: '流式书' }));
  await screen.findAllByTestId('sentence');

  await userEvent.click(screen.getAllByTestId('sentence')[0]);
  await userEvent.click(screen.getAllByTestId('sentence')[0]); // 同一句再点

  expect(signals[0].aborted).toBe(true);
  await act(async () => {
    deltas[0]('甲'); // 旧流迟到 delta，必须被丢弃
  });
  await act(async () => {
    deltas[1]('乙');
    deltas[1]('乙');
    pendingResolve('乙乙');
  });

  await screen.findByText('乙乙');
  expect(screen.queryByText('甲乙乙')).not.toBeInTheDocument();
  expect(screen.queryByText('甲')).not.toBeInTheDocument();
});

it('stop keeps the partial result without writing cache or history', async () => {
  configByok();
  let streamDelta;
  chatStream.mockImplementation(({ onDelta, signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('已中止', 'AbortError')));
    streamDelta = onDelta;
  }));
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: '流式书' }));
  await screen.findAllByTestId('sentence');

  await userEvent.click(screen.getAllByTestId('sentence')[0]);
  await act(async () => {
    streamDelta('部分译');
  });
  await screen.findByText('部分译');

  await userEvent.click(screen.getByRole('button', { name: '停止' }));
  await screen.findByText('已停止，译文可能不完整。');
  const pane = screen.getByRole('complementary');
  expect(within(pane).getByRole('button', { name: '复制' })).toBeInTheDocument();
  expect(within(pane).queryByRole('button', { name: '+ 术语' })).not.toBeInTheDocument();
  expect(putTranslation).not.toHaveBeenCalled();
  expect(saveHistory).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend test -- app-stream`
Expected: 新增 3 例 FAIL（无停止按钮 / 旧流未中止 / stopped 态不存在）

- [ ] **Step 3: 实现 App.jsx 中止机制**

`copyTimer` ref 之后追加：

```js
const streamSeqRef = useRef(0);
const streamAbortRef = useRef(null);
```

`pushHistory` 之后追加（cancelStream/beginStream/stopStream + 卸载清理）：

```js
const cancelStream = useCallback(() => {
  streamAbortRef.current?.abort();
  streamAbortRef.current = null;
  streamSeqRef.current += 1;
}, []);

const beginStream = useCallback(() => {
  const controller = new AbortController();
  streamAbortRef.current = controller;
  return { seq: streamSeqRef.current, signal: controller.signal };
}, []);

const stopStream = useCallback(() => {
  streamAbortRef.current?.abort();
}, []);

useEffect(() => () => streamAbortRef.current?.abort(), []);
```

三个非流式动作入口第一行加 `cancelStream();`：
- `handleWord`（232 行附近，`setHistoryView(false);` 之前）
- `handleChinese`（358 行附近，`setHistoryView(false);` 之后、`setSidebar(...)` 之前）
- `handleSelectHistory`（263 行，`setHistoryView(false);` 之前）

`handleTranslate` 改造：`setSidebar({ kind: 'translation', ... })` 之前加一行 `cancelStream();`（缓存命中路径同样作废旧流）；`runNetwork` 内：

```js
const runNetwork = () => {
  const { seq, signal } = beginStream();
  chatStream({
    baseUrl: byok.baseUrl,
    model: byok.model,
    apiKey: byok.apiKey,
    signal,
    messages: [
      { role: 'system', content: appendGlossary(translateSystemFor(genre), glossary) },
      { role: 'user', content: translateUserContent(text, context) }
    ],
    onDelta: (piece) => {
      if (seq !== streamSeqRef.current) return;
      setSidebar((prev) =>
        prev.kind === 'translation' && prev.original === text
          ? { ...prev, status: 'streaming', result: (prev.result || '') + piece }
          : prev
      );
    }
  })
    .then((content) => {
      if (seq !== streamSeqRef.current) return;
      setSidebar((prev) =>
        prev.kind === 'translation' && prev.original === text
          ? { ...prev, status: 'done', result: content }
          : prev
      );
      pushHistory(text, content);
      putTranslation(cacheKey, content);
    })
    .catch((err) => {
      if (seq !== streamSeqRef.current) return;
      if (err?.name === 'AbortError') {
        setSidebar((prev) =>
          prev.kind === 'translation' && prev.original === text
            ? { ...prev, status: 'stopped' }
            : prev
        );
        return;
      }
      setSidebar((prev) =>
        prev.kind === 'translation' && prev.original === text
          ? { ...prev, status: 'error', error: err.message }
          : prev
      );
    });
};
```

（原 `runNetwork` 的 fetch 参数区去掉并按上式替换；`getTranslation` 缓存命中分支不动。）

Sidebar 渲染处（505-531 行附近）追加 prop：`onStopStream={stopStream}`。

- [ ] **Step 4: 实现 Sidebar.jsx**

props 解构追加 `onStopStream,`（`onRetry,` 之前）。

translation 卡分支（203-238 行）替换为：

```jsx
if (state.kind === 'translation') {
  const actions = [];
  if (state.status === 'streaming') {
    actions.push(
      <button key="stop" className="btn small ghost" onClick={onStopStream}>
        停止
      </button>
    );
  }
  if (state.status === 'done' || state.status === 'stopped') {
    actions.push(
      <button key="copy" className="btn small ghost" onClick={() => onCopy(state.result)}>
        {copied ? '已复制' : '复制'}
      </button>
    );
  }
  if (state.status === 'done') {
    actions.push(
      <button key="term" className="btn small ghost" onClick={() => onAddTerm(state.original)}>
        + 术语
      </button>
    );
  }
  if (state.status === 'error') {
    actions.push(
      <button key="retry" className="btn small" onClick={onRetry}>
        重试
      </button>
    );
  }
  return (
    <Card title="翻译" actions={actions}>
      <div className="translation-original">{state.original}</div>
      {state.status === 'loading' && (
        <div className="inline-state">
          <span className="spinner small-spinner" />
          <span>正在翻译…</span>
        </div>
      )}
      {(state.status === 'streaming' || state.status === 'done' || state.status === 'stopped') && (
        <div className="translation-result">{state.result}</div>
      )}
      {state.status === 'stopped' && <p className="muted">已停止，译文可能不完整。</p>}
      {state.status === 'error' && <p className="error-text">{state.error}</p>}
    </Card>
  );
}
```

（`muted` 类已存在，无需改 styles.css。）

- [ ] **Step 5: 跑测试确认通过**

Run: `npm --prefix frontend test -- app-stream`
Expected: 全部 PASS（原 2 例 + 新 3 例）

- [ ] **Step 6: 回归跑全量前端测试**

Run: `npm --prefix frontend test`
Expected: 全绿（app.test.jsx 等不受影响；translationHistory 未 mock 的文件走真实模块静默降级）

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Sidebar.jsx frontend/src/__tests__/app-stream.test.jsx
git commit -m "feat: 流式翻译可中止（新操作自动取消 + 停止按钮 + stopped 态）"
```

---

### Task 5: 拖选翻译带前两句上下文

**Files:**
- Modify: `frontend/src/components/ReaderView.jsx:149-160, 213-231`
- Test: `frontend/src/__tests__/app-selection-context.test.jsx`（新建）

- [ ] **Step 1: 写失败测试**（新建文件）

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { chatStream } from '../lib/api.js';
import { tokenizeChapter } from '../lib/tokenize.js';
import { loadBuiltInBook, bookFromUploadedText } from '../lib/books.js';
import { getUploadedBook, listUploadedBooks } from '../lib/storage.js';

vi.mock('../lib/api.js', () => ({
  lookupDict: vi.fn(),
  chat: vi.fn(),
  chatStream: vi.fn(),
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

vi.mock('../lib/translationCache.js', () => ({
  translationCacheKey: vi.fn((m, g, h, t) => `k:${t}`),
  getTranslation: vi.fn(),
  putTranslation: vi.fn()
}));

vi.mock('../lib/books.js', () => ({
  loadBuiltInBook: vi.fn(),
  bookFromUploadedText: vi.fn()
}));

vi.mock('../lib/storage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listUploadedBooks: vi.fn(),
  getUploadedBook: vi.fn(),
  saveUploadedBook: vi.fn()
}));

const WORD = { surface: '私', reading: 'わたし', basic: '私', pos: '名詞', clickable: true };
const TOKEN_ROWS = [[WORD, WORD]];

const BOOK = {
  id: 'u1',
  name: '上下文书',
  author: '',
  genre: 'generic',
  genreManual: true,
  chapters: [{ title: '第 1 章', paragraphs: ['私は学生である。', '彼は笑った。', '今日は晴れ。'] }]
};

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
  chatStream.mockResolvedValue('译文');
  listUploadedBooks.mockResolvedValue([{ id: 'u1', name: '上下文书', uploadedAt: 1 }]);
  getUploadedBook.mockResolvedValue({
    id: 'u1', name: '上下文书', text: 'x', uploadedAt: 1, genre: 'generic', genreManual: true
  });
  bookFromUploadedText.mockReturnValue(BOOK);
});

async function openBook() {
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: '上下文书' }));
  await screen.findAllByTestId('sentence');
}

function selectAll(container) {
  const range = document.createRange();
  range.selectNodeContents(container);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.mouseUp(container);
}

it('tokenized-path selection carries the two previous sentences', async () => {
  configByok();
  tokenizeChapter.mockResolvedValue([TOKEN_ROWS, TOKEN_ROWS, TOKEN_ROWS]);
  await openBook();

  const sentences = screen.getAllByTestId('sentence');
  selectAll(sentences[2]);
  await screen.findByText('译文');

  const userContent = chatStream.mock.calls.at(-1)[0].messages[1].content;
  expect(userContent).toContain('【上文参考');
  expect(userContent).toContain('私は学生である。');
  expect(userContent).toContain('彼は笑った。');
  expect(userContent).toContain('今日は晴れ。');
});

it('plain-path selection carries the two previous sentences', async () => {
  configByok();
  tokenizeChapter.mockResolvedValue([TOKEN_ROWS, null, null]);
  await openBook();

  const sentences = screen.getAllByTestId('sentence');
  selectAll(sentences[2]);
  await screen.findByText('译文');

  const userContent = chatStream.mock.calls.at(-1)[0].messages[1].content;
  expect(userContent).toContain('【上文参考');
  expect(userContent).toContain('私は学生である。');
  expect(userContent).toContain('彼は笑った。');
});
```

> 说明：`selectAll` 的 Range+mouseUp 手法沿用 `Sentence.test.jsx` 既有模式；tokenized 路径整句选区横跨多个词 span，`selectionHitsSingleWord` 返回 null → 走 onSelection。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend test -- app-selection-context`
Expected: 2 例 FAIL（messages[1].content 不含「【上文参考」，为纯原文）

- [ ] **Step 3: 实现 ReaderView.jsx**

`handlePlainMouseUp`（153-160 行）替换为：

```js
const handlePlainMouseUp = (index) => (e) => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  const text = selection.toString();
  if (!text.trim()) return;
  onTranslateSelection(text, previousSentences(flatSentences, index));
  selection.removeAllRanges();
};
```

纯文本分支 `onMouseUp={handlePlainMouseUp}`（230 行）改为：

```jsx
onMouseUp={handlePlainMouseUp(idx)}
```

分词分支 `onSelection={onTranslateSelection}`（221 行）改为：

```jsx
onSelection={(text) => onTranslateSelection(text, previousSentences(flatSentences, idx))}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix frontend test -- app-selection-context`
Expected: 2 例 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ReaderView.jsx frontend/src/__tests__/app-selection-context.test.jsx
git commit -m "feat: 拖选翻译带前两句上下文（与点句路径同规则）"
```

---

### Task 6: 清理死代码 + 文档同步

**Files:**
- Delete: `frontend/src/components/LibraryModal.jsx`
- Modify: `README.md`（FAQ 第 108 行附近）
- Modify: `docs/handover/2026-08-11-yuki-reader.md`（仅本地，不入库）

- [ ] **Step 1: 删除 LibraryModal.jsx 并确认零引用**

```bash
git rm frontend/src/components/LibraryModal.jsx
grep -rn "LibraryModal" frontend/src || echo "no references"
```

Expected: 无引用输出 "no references"。

- [ ] **Step 2: 更新 README**

FAQ 中（108 行附近）：

```markdown
- **译文会重复请求吗？** 翻译结果按（模型 + 类别 + 术语表 + 提示词版本 + 原文）缓存在本地，同样的句子重复翻译零延迟零消耗；侧栏「历史」保留最近 50 条并持久化到本地（刷新不丢），流式翻译进行中可点「停止」保留已生成的部分。
```

（若 README 特性清单有历史/流式描述，同步一句"可中止/历史持久化"。）

- [ ] **Step 3: 更新交接文档**（`docs/handover/2026-08-11-yuki-reader.md`，gitignored 仅本地）

1. 第 4 行"最近更新"追加 `；2026-09-09 翻译打磨批`。
2. §2 顶部追加一条完成项：翻译打磨批（流式中止+停止按钮、历史持久化 50 条、拖选上下文、LibraryModal 清理；规格 2026-09-09-translation-polish-batch-design.md）。
3. §5.6：`state.kind` 翻译卡 status 增加 `stopped`；历史改为 IndexedDB 持久化 50 条（`lib/translationHistory.js`，DB v4）。
4. §5.7：handleTranslate 走 `beginStream/cancelStream` 序号守卫 + AbortController；`onStopStream` 停止不写缓存/历史。
5. §5.10：chatStream 增加 `signal` 参数，AbortError 原样抛出。
6. §9.11 整条替换为：404/405 已由 `common/GlobalExceptionHandler` 处理器覆盖（NoResourceFoundException→404、方法不支持→405），原"500"描述作废。
7. §10 追加：翻译打磨批已完成（2026-09-09）。
8. §11 变更记录追加："翻译历史持久化"由 2026-09-07 规格 §8 的"不做"经用户批准于 2026-09-09 实施。

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "chore: 删除 LibraryModal 死代码；README 同步历史持久化与停止按钮"
```

（交接文档已 gitignore，不进 commit。）

---

### Task 7: 全量验证

- [ ] **Step 1: 前端全量测试**

Run: `npm --prefix frontend test`
Expected: 全绿（原 120 + 新增约 10 例，以实际为准）

- [ ] **Step 2: 前端构建**

Run: `npm --prefix frontend run build`
Expected: vite build 成功，dist 复制到 backend static

- [ ] **Step 3: 后端回归（零改动验证）**

Run: `mvn -f backend\pom.xml test`
Expected: 42 例全绿

- [ ] **Step 4: 浏览器端到端（本地，gitignored 脚本）**

前置：`pwsh -File scripts\start-local.ps1`（jar + 假上游 8123，支持流式）；如 jar 需重打包先停 8080 再 `mvn -f backend\pom.xml clean package`。扩展 `scripts/data/stream-e2e.cjs`（无头 Edge + CDP）覆盖：

1. 点句 → 译文逐字上屏（原有断言不回归）。
2. 流式中点另一句 → CDP Network 事件确认旧请求 canceled、新卡正常。
3. 流式中点「停止」→ 部分译文保留 + 提示行可见。
4. 刷新页面 → 侧栏「历史（n）」仍有记录（持久化生效）。
5. 拖选 → 假上游收到的 messages 含「【上文参考」。

Run: `node scripts/data/stream-e2e.cjs`
Expected: 全部断言通过；结束后 `pwsh -File scripts\stop-local.ps1`。

- [ ] **Step 5: 交付说明**

报告"本地已验证"清单与残留风险；不推送（用户未要求）。
