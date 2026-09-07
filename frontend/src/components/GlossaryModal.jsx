import { useEffect, useState } from 'react';
import {
  GLOSSARY_MAX_CHARS,
  GLOSSARY_MAX_ENTRIES,
  normalizeGlossary
} from '../lib/glossary.js';

/**
 * 术语表编辑弹窗（规格 §4）：列表增删、from/to 录入、片假名候选预填；
 * 上限 50 条 / 1500 字符，添加时超出即拒绝。改译法 = 用同 from 重新添加（后录覆盖）。
 */
export default function GlossaryModal({ open, initialEntries = [], prefill = [], onClose, onSave }) {
  const [entries, setEntries] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (open) {
      setEntries(normalizeGlossary(initialEntries));
      setFrom('');
      setTo('');
      setNotice('');
    }
  }, [open, initialEntries]);

  if (!open) return null;

  const candidates = prefill.filter((p) => !entries.some((e) => e.from === p));

  const add = () => {
    const f = from.trim();
    const t = to.trim();
    if (!f || !t) {
      setNotice('原文和译法都要填写。');
      return;
    }
    const candidate = normalizeGlossary([...entries, { from: f, to: t }]);
    const chars = candidate.reduce((n, e) => n + e.from.length + e.to.length + 3, 0);
    if (candidate.length > GLOSSARY_MAX_ENTRIES || chars > GLOSSARY_MAX_CHARS) {
      setNotice(`超出上限（最多 ${GLOSSARY_MAX_ENTRIES} 条 / ${GLOSSARY_MAX_CHARS} 字符）。`);
      return;
    }
    setEntries(candidate);
    setFrom('');
    setTo('');
    setNotice('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="术语表"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>术语表</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="modal-body">
          <p className="modal-note">
            译名对照表会注入翻译提示词，保证全书译法一致（最多 {GLOSSARY_MAX_ENTRIES} 条）。
          </p>
          {candidates.length > 0 && (
            <div className="glossary-chips" aria-label="原文候选">
              {candidates.map((c) => (
                <button key={c} className="glossary-chip" onClick={() => setFrom(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          {entries.length > 0 ? (
            <ul className="glossary-list">
              {entries.map((e) => (
                <li key={e.from} className="glossary-row">
                  <span className="glossary-from">{e.from}</span>
                  <span className="glossary-arrow">→</span>
                  <span className="glossary-to">{e.to}</span>
                  <button
                    className="icon-btn"
                    aria-label={`删除 ${e.from}`}
                    onClick={() => setEntries((prev) => prev.filter((x) => x.from !== e.from))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">还没有词条。</p>
          )}
          <div className="glossary-add">
            <input
              className="glossary-input"
              placeholder="原文（如 ルルーシュ）"
              value={from}
              aria-label="术语原文"
              onChange={(e) => {
                setFrom(e.target.value);
                setNotice('');
              }}
            />
            <span className="glossary-arrow">→</span>
            <input
              className="glossary-input"
              placeholder="固定译法"
              value={to}
              aria-label="固定译法"
              onChange={(e) => {
                setTo(e.target.value);
                setNotice('');
              }}
            />
            <button className="btn small" onClick={add}>
              添加
            </button>
          </div>
          {notice && <p className="error-text">{notice}</p>}
        </div>
        <footer className="modal-footer">
          <button className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn" onClick={() => onSave(entries)}>
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}
