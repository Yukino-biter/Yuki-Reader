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
      <aside className={`home-sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="home-sidebar-head">
          <div className="home-logo">Yuki Reader</div>
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
          <button className="home-nav-item" onClick={pickFile} disabled={busy}>
            {ICONS.upload}
            <span>上传文件</span>
          </button>
          <button className="home-nav-item" onClick={() => setUsageOpen(true)}>
            {ICONS.usage}
            <span>使用说明</span>
          </button>
        </nav>

        <div className="home-files">
          <div className="home-files-title">文件列表</div>
          <button className="home-file-item" onClick={onOpenBuiltIn} disabled={busy}>
            {ICONS.book}
            <span className="home-file-name">内置书《こころ》</span>
          </button>
          {books.length === 0 ? (
            <p className="home-files-empty">还没有上传的书</p>
          ) : (
            books.map((b) => (
              <button key={b.id} className="home-file-item" onClick={() => onOpenBook(b)}>
                {ICONS.file}
                <span className="home-file-name">{b.name}</span>
              </button>
            ))
          )}
        </div>

        <div className="home-sidebar-bottom">
          <button className="home-nav-item" onClick={onOpenSettings}>
            {ICONS.settings}
            <span>设置</span>
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
            <span className="home-drop-icon">{ICONS.upload}</span>
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
                Yuki Reader 支持三种核心操作：点击正文中的任意单词，右侧会显示 JMDict 词典查询结果（含读音、词性和英文释义，可一键翻译成中文）；拖选一段文字，会调用 LLM 翻译所选内容；点击句子的空白处（非文字区域），则翻译整句。翻译功能需要先在「设置」中配置 API Key；开启「标注假名」后，含汉字的单词上方会自动显示平假名读音。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
