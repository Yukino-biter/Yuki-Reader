import { useRef, useState } from 'react';

function Icon({ d, extra }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="home-icon"
      aria-hidden="true"
    >
      {extra}
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  upload: <Icon d="M12 19V5M5 12l7-7 7 7" />,
  usage: (
    <Icon
      extra={<circle cx="12" cy="12" r="10" />}
      d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"
    />
  ),
  book: <Icon d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />,
  file: <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />,
  settings: (
    <Icon
      extra={<circle cx="12" cy="12" r="3" />}
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
    />
  )
};

function FeatureIcon({ d, extra }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="home-feature-svg"
      aria-hidden="true"
    >
      {extra}
      <path d={d} />
    </svg>
  );
}

const FEATURE_ICONS = {
  dict: (
    <FeatureIcon
      extra={<circle cx="11" cy="11" r="8" />}
      d="m21 21-4.3-4.3M11 8v6M8 11h6"
    />
  ),
  translate: (
    <FeatureIcon d="M5 8l6 6m-7 0 6-6 2-3M2 5h12M7 2h1m14 20-5-10-5 10m4-4h6" />
  ),
  furigana: (
    <FeatureIcon d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2zM10 7h6M10 11h6M10 15h4" />
  ),
  read: (
    <FeatureIcon d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  )
};

export default function HomeView({
  busy,
  books,
  theme,
  onOpenBuiltIn,
  onUploadFile,
  onOpenBook,
  onOpenSettings,
  onOpenByokSettings,
  onToggleTheme
}) {
  const [usageOpen, setUsageOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const fileInputRef = useRef(null);

  const pickFile = () => fileInputRef.current?.click();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) onUploadFile(file);
  };

  return (
    <div className="home">
      <div className="home-decoration circle-1" aria-hidden="true" />
      <div className="home-decoration circle-2" aria-hidden="true" />

      <aside className={`home-sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="home-sidebar-head">
          <div className="home-brand">
            <span className="home-brand-seal">
              <img src="/yuki-icon.svg" alt="" />
            </span>
            <span className="home-brand-text">
              <span className="home-brand-name">Yuki Reader</span>
              <span className="home-brand-sub">雪 · 読書</span>
            </span>
          </div>
          <button
            className="home-collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            title={collapsed ? '展开侧栏' : '收起侧栏'}
          >
            {collapsed ? <Icon d="M9 18l6-6-6-6" /> : <Icon d="M15 18l-6-6 6-6" />}
          </button>
        </div>

        <nav className="home-nav" aria-label="功能入口">
          <button className="home-nav-item active" onClick={pickFile} disabled={busy}>
            {ICONS.upload}
            <span>上传文件</span>
          </button>
          <button className="home-nav-item" onClick={() => setUsageOpen(true)}>
            {ICONS.usage}
            <span>使用说明</span>
          </button>
        </nav>

        <div className="home-divider" aria-hidden="true" />
        <div className="home-files-title">文件列表</div>

        <div className="home-files">
          <button className="home-file-item" onClick={onOpenBuiltIn} disabled={busy}>
            <span className="home-file-icon">{ICONS.book}</span>
            <span className="home-file-info">
              <span className="home-file-name">内置书《こころ》</span>
              <span className="home-file-meta">夏目漱石</span>
            </span>
          </button>
          {books.length === 0 ? (
            <p className="home-files-empty">
              <span className="home-sakura" aria-hidden="true">❀</span>
              还没有上传的书<br />点击上方上传开始阅读
            </p>
          ) : (
            books.map((b) => (
              <button key={b.id} className="home-file-item" onClick={() => onOpenBook(b)}>
                <span className="home-file-icon">{ICONS.file}</span>
                <span className="home-file-info">
                  <span className="home-file-name">{b.name}</span>
                  {b.encoding ? <span className="home-file-meta">{b.encoding.toUpperCase()}</span> : null}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="home-sidebar-bottom">
          <button className="home-nav-item" onClick={onOpenSettings}>
            {ICONS.settings}
            <span>设置</span>
          </button>
          <p className="home-footer-credit">
            词典数据来自{' '}
            <a href="https://www.edrdg.org/jmdict/" target="_blank" rel="noreferrer">JMdict / EDICT</a>
            （CC BY-SA 4.0）<br />
            内置《こころ》文本来自{' '}
            <a href="https://www.aozora.gr.jp/cards/000148/files/773_14560.html" target="_blank" rel="noreferrer">
              青空文庫
            </a>
          </p>
        </div>
      </aside>

      <div className="home-right">
        <header className="topbar home-topbar">
          <div className="topbar-actions">
            <button className="btn ghost small" onClick={onOpenSettings}>
              阅读设置
            </button>
            <button className="btn ghost small" onClick={onOpenByokSettings}>
              翻译设置
            </button>
            <button className="btn ghost small primary" onClick={onToggleTheme}>
              {theme === 'dark' ? '日间' : '夜间'}
            </button>
          </div>
        </header>

        <main className="home-main">
          <section className="home-hero">
          <div className="home-hero-badge">
            <span className="home-hero-dot" aria-hidden="true" />
            日语阅读 · 全新体验
          </div>
          <h1 className="home-title">
            用一份<span className="jp">日语文档</span>
            <br />
            解决 阅读、查词、翻译
          </h1>
          <p className="home-subtitle">
            上传 TXT 即可阅读：点词查 JMDict 词典，拖选或点击句子空白处调用 LLM 翻译，汉字上方自动标注平假名。
          </p>

          <div
            className={`home-dropzone${dragOver ? ' dragover' : ''}`}
            onClick={pickFile}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') pickFile();
            }}
          >
            <p>点击或拖拽上传 TXT 文件</p>
            <small>支持格式：TXT · 自动识别编码</small>
            <span className="home-formats">
              <span className="home-format-tag">UTF-8</span>
              <span className="home-format-tag">Shift-JIS</span>
              <span className="home-format-tag">UTF-16</span>
            </span>
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
          <div className="home-section-header">
            <h2 className="home-section-title">特点简介</h2>
            <div className="home-section-subtitle">FEATURES</div>
          </div>

          <div className="home-feature-grid">
            <div className="home-feature-card">
              <span className="home-feature-icon red">{FEATURE_ICONS.dict}</span>
              <h3 className="home-feature-name">点词查词典</h3>
              <p className="home-feature-desc">
                点击正文中的任意单词，右侧即时显示读音、词性与中文释义。词典已内置，无需配置。
              </p>
            </div>
            <div className="home-feature-card">
              <span className="home-feature-icon blue">{FEATURE_ICONS.translate}</span>
              <h3 className="home-feature-name">智能翻译</h3>
              <p className="home-feature-desc">
                拖选一段文字，或点击句子空白处，即时调用 LLM 翻译所选内容，支持自定义 API。
              </p>
            </div>
            <div className="home-feature-card">
              <span className="home-feature-icon gold">{FEATURE_ICONS.furigana}</span>
              <h3 className="home-feature-name">标注假名</h3>
              <p className="home-feature-desc">含汉字的单词上方自动显示平假名标注，边读边学，轻松掌握日语读音。</p>
            </div>
            <div className="home-feature-card">
              <span className="home-feature-icon green">{FEATURE_ICONS.read}</span>
              <h3 className="home-feature-name">舒适阅读</h3>
              <p className="home-feature-desc">六种主题配色、字号字体行距自由调整，打造属于你的沉浸式阅读空间。</p>
            </div>
          </div>
        </section>

        <section className="home-guide">
          <div className="home-section-header">
            <h2 className="home-section-title">操作说明</h2>
            <div className="home-section-subtitle">HOW TO USE</div>
          </div>

          <div className="home-guide-steps">
            <div className="home-guide-step">
              <span className="home-step-number">1</span>
              <h3 className="home-step-title">点词查词典</h3>
              <p className="home-step-desc">点击正文中的任意单词，右侧显示读音、词性与中文释义。</p>
              <p className="home-step-tip">词典已内置，无需配置</p>
            </div>
            <div className="home-guide-step">
              <span className="home-step-number">2</span>
              <h3 className="home-step-title">拖选翻译</h3>
              <p className="home-step-desc">拖选一段文字，调用 LLM 翻译所选内容。</p>
              <p className="home-step-tip">在底部「设置」中配置 API</p>
            </div>
            <div className="home-guide-step">
              <span className="home-step-number">3</span>
              <h3 className="home-step-title">点句翻译</h3>
              <p className="home-step-desc">点击句子的空白处，翻译整句。</p>
              <p className="home-step-tip">在底部「设置」中配置 API</p>
            </div>
          </div>
          </section>

          <div className="home-bottom-note">
            API 需要自己配置 · 分词无需配置，打开书即自动完成<br />
            <strong>❤</strong> 愿每一次阅读，都是一场旅途
          </div>
        </main>
      </div>

      {usageOpen && (
        <div className="modal-backdrop" onClick={() => setUsageOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="使用说明"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>使用说明</h2>
              <button className="icon-btn" onClick={() => setUsageOpen(false)} aria-label="关闭">×</button>
            </header>
            <div className="modal-body">
              <p className="usage-text">
                Yuki Reader 支持三种核心操作：点击正文中的任意单词，右侧会显示 JMDict 词典查询结果（含读音、词性和中文释义）；拖选一段文字，会调用 LLM 翻译所选内容；点击句子的空白处（非文字区域），则翻译整句。翻译功能需要先在「设置」中配置 API Key；开启「标注假名」后，含汉字的单词上方会自动显示平假名读音。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
