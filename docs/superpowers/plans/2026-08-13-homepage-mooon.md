# 首页改版 + 标注假名 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Yuki Reader 首页改为 Mooon 风格应用工作台（固定侧栏 + 滚动主区），并实现标注假名（平假名注音）功能。

**Architecture:** 新增 `HomeView` 组件替换欢迎页；侧栏展示内置书 + 已上传书并直接打开；标注假名在 `Sentence` 渲染层用 `<ruby>` 实现，阅读设置新增开关；读音统一经 `lib/kana.js` 转平假名。

**Tech Stack:** React 18 + Vite 5 + Vitest；沿用现有 CSS 主题 token。

---

> 提交说明：本仓库尚无基线提交（所有文件 untracked），本计划各任务跳过 `git commit`，只保留测试与构建验证。

## Task 1: 平假名转换工具

**Files:**
- Create: `frontend/src/lib/kana.js`
- Test: `frontend/src/lib/__tests__/kana.test.js`

- [ ] Step 1: 写失败测试

```js
import { describe, expect, it } from 'vitest';
import { toHiragana, hasKanji } from '../kana.js';

describe('toHiragana', () => {
  it('converts katakana to hiragana', () => {
    expect(toHiragana('ワタシ')).toBe('わたし');
    expect(toHiragana('ヨン')).toBe('よん');
  });
  it('keeps prolonged sound mark and mixed text', () => {
    expect(toHiragana('コーヒー')).toBe('こーひー');
    expect(toHiragana('学生はガクセイ')).toBe('学生はがくせい');
  });
  it('leaves non-katakana unchanged', () => {
    expect(toHiragana('abc。')).toBe('abc。');
  });
});

describe('hasKanji', () => {
  it('detects CJK ideographs', () => {
    expect(hasKanji('学生')).toBe(true);
    expect(hasKanji('わたし')).toBe(false);
  });
});
```

- [ ] Step 2: 运行确认失败：`npm --prefix frontend test -- kana`
- [ ] Step 3: 实现 `frontend/src/lib/kana.js`

```js
/** 片假名（U+30A1–U+30F6）转平假名；长音符号等其余字符不变。 */
export function toHiragana(text) {
  if (!text) return text;
  return text.replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/** 是否包含汉字（CJK 统一表意文字）。 */
export function hasKanji(text) {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);
}
```

- [ ] Step 4: 运行确认通过：`npm --prefix frontend test -- kana`

## Task 2: 设置增加 showFurigana

**Files:**
- Modify: `frontend/src/lib/storage.js`

- [ ] Step 1: 在 `DEFAULT_SETTINGS` 增加 `showFurigana: true`
- [ ] Step 2: 在 `normalizeSettings` 中 `s.showFurigana = typeof raw.showFurigana === 'boolean' ? raw.showFurigana : s.showFurigana;`
- [ ] Step 3: 运行 `npm --prefix frontend test`（storage 无独立用例，跑全量回归）

## Task 3: Sentence 标注假名渲染

**Files:**
- Modify: `frontend/src/components/Sentence.jsx`
- Test: `frontend/src/components/__tests__/Sentence.test.jsx`

- [ ] Step 1: 新增测试（追加到现有 describe）

```jsx
it('renders ruby furigana for kanji tokens when enabled', () => {
  const tokens = [
    { surface: '学生', reading: 'ガクセイ', basic: '学生', pos: '名詞', clickable: true },
    { surface: 'は', reading: 'は', basic: 'は', pos: '助詞', clickable: true },
    { surface: '。', reading: '。', basic: '。', pos: '記号', clickable: false }
  ];
  const { container } = render(
    <Sentence sentence="学生は。" tokens={tokens} showFurigana onWord={vi.fn()} onSentence={vi.fn()} onSelection={vi.fn()} />
  );
  expect(container.querySelector('ruby rt').textContent).toBe('がくせい');
  expect(container.querySelector('.word-span').textContent).toBe('学生');
});

it('skips furigana for kana-only tokens', () => {
  const tokens = [
    { surface: 'わたし', reading: 'わたし', basic: 'わたし', pos: '名詞', clickable: true }
  ];
  const { container } = render(
    <Sentence sentence="わたし" tokens={tokens} showFurigana onWord={vi.fn()} onSentence={vi.fn()} onSelection={vi.fn()} />
  );
  expect(container.querySelector('rt')).toBeNull();
});
```

- [ ] Step 2: 运行确认失败
- [ ] Step 3: 修改 `Sentence.jsx`

```jsx
import { useRef } from 'react';
import { toHiragana, hasKanji } from '../lib/kana.js';

export default function Sentence({ sentence, tokens, onWord, onSentence, onSelection, showFurigana = false }) {
  // ... 现有逻辑不变，仅 word span 内容改为：
  // {showFurigana && hasKanji(t.surface) && t.reading && t.reading !== t.surface ? (
  //   <ruby>{t.surface}<rt>{toHiragana(t.reading)}</rt></ruby>
  // ) : (
  //   t.surface
  // )}
```

- [ ] Step 4: 运行 `npm --prefix frontend test -- Sentence` 确认通过

## Task 4: Sidebar 读音转平假名

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] Step 1: import `toHiragana`；`dict-miss` 与 `dict` 两处 `state.token.reading` 显示改为 `toHiragana(state.token.reading)`
- [ ] Step 2: `npm --prefix frontend test` 回归

## Task 5: SettingsModal 标注假名开关

**Files:**
- Modify: `frontend/src/components/SettingsModal.jsx`

- [ ] Step 1: 在"正文字体"行之后加一行

```jsx
<div className="setting-row">
  <span className="setting-label">标注假名</span>
  <div className="segmented">
    <button
      className={draftSettings.showFurigana ? 'seg active' : 'seg'}
      onClick={() => setDraftSettings({ ...draftSettings, showFurigana: true })}
    >
      开
    </button>
    <button
      className={!draftSettings.showFurigana ? 'seg active' : 'seg'}
      onClick={() => setDraftSettings({ ...draftSettings, showFurigana: false })}
    >
      关
    </button>
  </div>
</div>
```

- [ ] Step 2: `npm --prefix frontend test` 回归

## Task 6: HomeView 组件

**Files:**
- Create: `frontend/src/components/HomeView.jsx`

- [ ] Step 1: 实现完整组件（见下方代码，含侧栏/主卡/拖拽上传/使用说明弹窗/文件列表）

```jsx
import { useRef, useState } from 'react';

export default function HomeView({
  busy,
  books,
  onOpenBuiltIn,
  onUploadFile,
  onOpenBook,
  onOpenSettings
}) {
  const [usageOpen, setUsageOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const pickFile = () => fileInputRef.current?.click();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!/\.txt$/i.test(file.name) && file.type !== 'text/plain') {
      alert('请上传 TXT 文件');
      return;
    }
    onUploadFile(file);
  };

  return (
    <div className="home">
      <aside className="home-sidebar">
        <div className="home-logo">Yuki Reader</div>
        <nav className="home-nav">
          <button className="home-nav-item" onClick={pickFile} disabled={busy}>
            <span className="home-nav-icon" aria-hidden="true">↑</span>
            上传文件
          </button>
          <button className="home-nav-item" onClick={() => setUsageOpen(true)}>
            <span className="home-nav-icon" aria-hidden="true">?</span>
            使用说明
          </button>
        </nav>
        <div className="home-files">
          <div className="home-files-title">文件列表</div>
          <button className="home-file-item" onClick={onOpenBuiltIn} disabled={busy}>
            <span className="home-file-icon" aria-hidden="true">📖</span>
            内置书《こころ》
          </button>
          {books.length === 0 ? (
            <p className="home-files-empty">还没有上传的书</p>
          ) : (
            books.map((b) => (
              <button key={b.id} className="home-file-item" onClick={() => onOpenBook(b)}>
                <span className="home-file-icon" aria-hidden="true">📄</span>
                <span className="home-file-name">{b.name}</span>
              </button>
            ))
          )}
        </div>
        <div className="home-sidebar-bottom">
          <button className="home-nav-item" onClick={onOpenSettings}>
            <span className="home-nav-icon" aria-hidden="true">⚙</span>
            设置
          </button>
        </div>
      </aside>

      <main className="home-main">
        <section className="home-card">
          <h1 className="home-title">用一份「日语文档」解决 阅读、查词、翻译</h1>
          <p className="home-subtitle">
            上传 TXT 即可阅读：点词查 JMDict 词典，拖选或点击句子空白处调用 LLM 翻译，汉字上方自动标注平假名。
          </p>
          <div
            className={`home-dropzone${dragOver ? ' dragover' : ''}`}
            onClick={pickFile}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pickFile(); }}
          >
            <span className="home-drop-icon" aria-hidden="true">↑</span>
            <p>点击或拖拽上传 TXT 文件</p>
            <small>支持格式：TXT · 自动识别 UTF-8 / Shift-JIS / UTF-16</small>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain,text/*"
            hidden
            onChange={(e) => {
              onUploadFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </section>

        <section className="home-features">
          <h2 className="home-features-title">无痛阅读「小说 &amp; 论文」</h2>
          <div className="home-feature-grid">
            <div className="home-feature-card">
              <h3>点词查词典</h3>
              <p>点击任意单词，即时查询 JMDict 词典</p>
            </div>
            <div className="home-feature-card">
              <h3>智能翻译</h3>
              <p>拖选或点击句子空白处，调用 LLM 翻译</p>
            </div>
            <div className="home-feature-card">
              <h3>标注假名</h3>
              <p>含汉字的单词上方自动显示平假名</p>
            </div>
            <div className="home-feature-card">
              <h3>舒适阅读</h3>
              <p>六种主题、字号/字体/行距自由调整</p>
            </div>
          </div>
          <div className="home-image-placeholder">示例图片（待提供）</div>
        </section>
      </main>

      {usageOpen && (
        <div className="modal-backdrop" onClick={() => setUsageOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="使用说明" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>使用说明</h2>
              <button className="icon-btn" onClick={() => setUsageOpen(false)} aria-label="关闭">×</button>
            </header>
            <div className="modal-body">
              <p className="usage-text">
                Yuki Reader 支持三种核心操作：点击正文中的任意单词，右侧会显示 JMDict 词典查询结果（含读音、词性和英文释义，可一键翻译成中文）；拖选一段文字，会调用 LLM 翻译所选内容；点击句子的空白处（非文字区域），则翻译整句。翻译功能需要先在「设置」中配置 API Key；开启「标注假名」后，含汉字的单词上方会自动显示平假名读音。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] Step 2: `npm --prefix frontend test` 确认现有 welcome 相关测试会失败（预期，下一步更新 App）

## Task 7: App 集成

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] Step 1: 移除 `LibraryModal` import/使用、`fileInputRef` 与隐藏 input
- [ ] Step 2: 引入 `HomeView`，`route === 'welcome'` 渲染 HomeView；加载书库列表（挂载时 + 上传成功后 + 返回首页时）
- [ ] Step 3: 顶栏按钮移除"内置书 / 上传 TXT / 我的书"，保留品牌（回首页）、书名、阅读设置、翻译设置、日夜间
- [ ] Step 4: `npm --prefix frontend test`（此时 app.test 需同步更新，见 Task 9）

## Task 8: 首页样式

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] Step 1: 追加 Mooon 风格样式块（侧栏、主卡、上传区、特性区、占位框、导航项）
- [ ] Step 2: 视觉核对（dev 或构建后）

## Task 9: 测试更新

**Files:**
- Modify: `frontend/src/__tests__/app.test.jsx`

- [ ] Step 1: `openBuiltInBook` 改为点击 `{ name: /内置书/ }`
- [ ] Step 2: 返回主界面断言改为 `{ name: '上传文件' }` 存在
- [ ] Step 3: 新增用例：使用说明弹窗、标注假名开关保存
- [ ] Step 4: `npm --prefix frontend test` 全绿

## Task 10: 构建与文档

- [ ] Step 1: `npm --prefix frontend run build`
- [ ] Step 2: 更新 README（首页/标注假名/测试数）与交接文档（§2/§5/§10 及测试数）
