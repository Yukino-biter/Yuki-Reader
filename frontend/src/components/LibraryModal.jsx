export default function LibraryModal({ open, books, loading, onOpen, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>我的书</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="modal-body">
          {loading ? (
            <p className="hint">加载中…</p>
          ) : books.length === 0 ? (
            <p className="hint">还没有上传的书。上传的 TXT 会保存在浏览器本地（IndexedDB）。</p>
          ) : (
            <ul className="book-list">
              {books.map((b) => (
                <li key={b.id}>
                  <button className="book-row" onClick={() => onOpen(b)}>
                    <span className="book-name">{b.name}</span>
                    <span className="book-meta">
                      {(b.size / 1024).toFixed(0)} KB · {b.encoding || 'utf-8'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
