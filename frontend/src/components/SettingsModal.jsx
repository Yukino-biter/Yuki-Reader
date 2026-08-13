import { useEffect, useState } from 'react';
import { PROVIDERS } from '../lib/providers.js';
import { chat } from '../lib/api.js';

const LINE_OPTIONS = [
  { id: 'compact', label: '紧凑' },
  { id: 'normal', label: '标准' },
  { id: 'loose', label: '宽松' }
];
const FONT_FAMILY_OPTIONS = [
  { id: 'black', label: '黑体' },
  { id: 'song', label: '宋体' },
  { id: 'kai', label: '楷体' }
];
const THEME_OPTIONS = [
  { id: 'default', label: '默认', color: '#f5f5f5' },
  { id: 'blue', label: '淡蓝', color: '#dcebef' },
  { id: 'yellow', label: '米黄', color: '#efe2c0' },
  { id: 'beige', label: '羊皮纸', color: '#f5f1e8' },
  { id: 'green', label: '护眼绿', color: '#e0eee1' },
  { id: 'dark', label: '夜间', color: '#191919' }
];
const PAGE_MODE_OPTIONS = [
  { id: 'scrolled', label: '滚动翻页' },
  { id: 'single', label: '章节翻页' }
];
const PAGE_WIDTH_OPTIONS = [
  { id: 'auto', label: '自动' },
  { id: '640', label: '640' },
  { id: '800', label: '800' },
  { id: '900', label: '900' },
  { id: '1000', label: '1000' },
  { id: '1280', label: '1280' }
];

export default function SettingsModal({ open, initialTab, settings, byok, onClose, onSaveSettings, onSaveByok }) {
  const [tab, setTab] = useState(initialTab || 'reading');
  const [draftSettings, setDraftSettings] = useState(settings);
  const [draftByok, setDraftByok] = useState(byok);
  const [testState, setTestState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    if (open) {
      setTab(initialTab || 'reading');
      setDraftSettings(settings);
      setDraftByok(byok);
      setTestState({ status: 'idle', message: '' });
    }
  }, [open, initialTab, settings, byok]);

  if (!open) return null;

  const pickProvider = (id) => {
    const p = PROVIDERS.find((x) => x.id === id);
    setDraftByok((prev) => ({
      ...prev,
      provider: id,
      baseUrl: p.baseUrl,
      model: p.model
    }));
  };

  const saveReading = () => {
    onSaveSettings(draftSettings);
    onClose();
  };

  const saveByokSettings = () => {
    onSaveByok(draftByok);
    onClose();
  };

  const testConnection = async () => {
    const cfg = draftByok;
    if (!cfg.baseUrl.trim() || !cfg.model.trim() || !cfg.apiKey.trim()) {
      setTestState({ status: 'error', message: '请先填写 Base URL、模型名和 API Key。' });
      return;
    }
    setTestState({ status: 'loading', message: '' });
    try {
      await chat({
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        apiKey: cfg.apiKey,
        messages: [{ role: 'user', content: 'ping' }]
      });
      setTestState({ status: 'ok', message: '连接成功（将发送一条测试消息）。' });
    } catch (err) {
      setTestState({ status: 'error', message: err.message });
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>设置</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <nav className="modal-tabs">
          <button className={tab === 'reading' ? 'tab active' : 'tab'} onClick={() => setTab('reading')}>
            阅读设置
          </button>
          <button className={tab === 'byok' ? 'tab active' : 'tab'} onClick={() => setTab('byok')}>
            翻译设置 (BYOK)
          </button>
        </nav>

        {tab === 'reading' && (
          <div className="modal-body">
            <div className="setting-row">
              <span className="setting-label">字号</span>
              <div className="segmented font-stepper">
                <button
                  className="seg"
                  disabled={draftSettings.fontSize <= 12}
                  onClick={() => setDraftSettings({ ...draftSettings, fontSize: Math.max(12, draftSettings.fontSize - 2) })}
                  aria-label="减小字号"
                >
                  A−
                </button>
                <span className="font-size-value">{draftSettings.fontSize}</span>
                <button
                  className="seg"
                  disabled={draftSettings.fontSize >= 32}
                  onClick={() => setDraftSettings({ ...draftSettings, fontSize: Math.min(32, draftSettings.fontSize + 2) })}
                  aria-label="增大字号"
                >
                  A+
                </button>
              </div>
            </div>
            <div className="setting-row">
              <span className="setting-label">行距</span>
              <div className="segmented">
                {LINE_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    className={draftSettings.lineHeight === o.id ? 'seg active' : 'seg'}
                    onClick={() => setDraftSettings({ ...draftSettings, lineHeight: o.id })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <span className="setting-label">正文字体</span>
              <div className="segmented">
                {FONT_FAMILY_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    className={draftSettings.fontFamily === o.id ? 'seg active' : 'seg'}
                    onClick={() => setDraftSettings({ ...draftSettings, fontFamily: o.id })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
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
            <div className="setting-row">
              <span className="setting-label">主题</span>
              <div className="theme-swatches" role="radiogroup" aria-label="阅读主题">
                {THEME_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    className={draftSettings.theme === o.id ? 'theme-swatch active' : 'theme-swatch'}
                    style={{ backgroundColor: o.color, color: o.id === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.9)' }}
                    role="radio"
                    aria-checked={draftSettings.theme === o.id}
                    aria-label={o.label}
                    title={o.label}
                    onClick={() => setDraftSettings({ ...draftSettings, theme: o.id })}
                  >
                    {draftSettings.theme === o.id ? '✓' : ''}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <span className="setting-label">翻页模式</span>
              <div className="segmented">
                {PAGE_MODE_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    className={draftSettings.pageMode === o.id ? 'seg active' : 'seg'}
                    onClick={() => setDraftSettings({ ...draftSettings, pageMode: o.id })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <span className="setting-label">页面宽度</span>
              <div className="segmented">
                {PAGE_WIDTH_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    className={`seg compact${draftSettings.pageWidth === o.id ? ' active' : ''}`}
                    onClick={() => setDraftSettings({ ...draftSettings, pageWidth: o.id })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={saveReading}>保存</button>
            </div>
          </div>
        )}

        {tab === 'byok' && (
          <div className="modal-body">
            <p className="hint">
              API Key 仅保存在浏览器 localStorage，请求经后端 /api/chat 转发，后端不存储、不打日志。
            </p>
            <label className="field">
              <span>提供商</span>
              <select value={draftByok.provider} onChange={(e) => pickProvider(e.target.value)}>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Base URL</span>
              <input
                type="text"
                value={draftByok.baseUrl}
                placeholder="https://api.example.com/v1"
                onChange={(e) => setDraftByok({ ...draftByok, baseUrl: e.target.value })}
              />
            </label>
            <label className="field">
              <span>模型名</span>
              <input
                type="text"
                value={draftByok.model}
                placeholder="model-name"
                onChange={(e) => setDraftByok({ ...draftByok, model: e.target.value })}
              />
            </label>
            <label className="field">
              <span>API Key</span>
              <input
                type="password"
                value={draftByok.apiKey}
                placeholder="sk-..."
                autoComplete="off"
                onChange={(e) => setDraftByok({ ...draftByok, apiKey: e.target.value })}
              />
            </label>
            {testState.status === 'loading' && <p className="hint">正在测试连接…</p>}
            {testState.status === 'ok' && <p className="ok-text">{testState.message}</p>}
            {testState.status === 'error' && <p className="error-text">{testState.message}</p>}
            <div className="modal-footer">
              <button className="btn ghost" onClick={testConnection}>测试连接</button>
              <button className="btn" onClick={saveByokSettings}>保存</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
