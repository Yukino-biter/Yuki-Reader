import { toHiragana } from '../lib/kana.js';
import { translatePos } from '../lib/pos.js';

function Card({ title, children, actions }) {
  return (
    <section className="sidebar-card">
      <header className="sidebar-card-title">{title}</header>
      <div className="sidebar-card-body">{children}</div>
      {actions && <footer className="sidebar-card-actions">{actions}</footer>}
    </section>
  );
}

function ChineseBlock({ state, onRun, runLabel }) {
  if (state.status === 'idle') {
    return (
      <button className="btn small" onClick={onRun}>
        {runLabel}
      </button>
    );
  }
  if (state.status === 'loading') {
    return (
      <div className="inline-state">
        <span className="spinner small-spinner" />
        <span>正在翻译释义…</span>
      </div>
    );
  }
  if (state.status === 'done') {
    return (
      <div className="chinese-result">
        <div className="chinese-label">中文释义</div>
        <p className="chinese-text">{state.text}</p>
        <button className="btn small ghost" onClick={onRun}>
          重新翻译
        </button>
      </div>
    );
  }
  return (
    <div className="error-inline">
      <p>{state.message}</p>
      <button className="btn small" onClick={onRun}>
        重试
      </button>
    </div>
  );
}

function clip(text, max = 60) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export default function Sidebar({
  state,
  copied,
  history = [],
  historyView = false,
  onToggleHistory,
  onSelectHistory,
  onAddTerm,
  onRetry,
  onCopy,
  onChinese,
  onOpenSettings
}) {
  if (state.kind === 'empty') {
    return (
      <div className="sidebar-empty">
        <p>点击正文中的词语查词典，点击句子间隙或拖选文本进行翻译。</p>
      </div>
    );
  }

  const bar = (
    <div className="sidebar-history-bar">
      <button className="btn small ghost" onClick={onToggleHistory}>
        {historyView ? '返回结果' : `历史（${history.length}）`}
      </button>
    </div>
  );

  if (historyView) {
    return (
      <>
        {bar}
        {history.length === 0 ? (
          <div className="sidebar-empty">
            <p>还没有翻译记录。</p>
          </div>
        ) : (
          <ul className="history-list">
            {history.map((h) => (
              <li key={h.id}>
                <button className="history-item" onClick={() => onSelectHistory(h)}>
                  <span className="history-original">{clip(h.original)}</span>
                  <span className="history-result">{clip(h.result)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <>
      {bar}
      {renderCard()}
    </>
  );

  function renderCard() {
    if (state.kind === 'prompt') {
      return (
        <Card title="需要配置 API Key">
          <p>{state.message}</p>
          <button className="btn" onClick={onOpenSettings}>
            前往设置
          </button>
        </Card>
      );
    }

    if (state.kind === 'dict-loading') {
      return (
        <Card title="词典">
          <div className="inline-state">
            <span className="spinner small-spinner" />
            <span>正在查询「{state.token.surface}」…</span>
          </div>
        </Card>
      );
    }

    if (state.kind === 'dict-error') {
      return (
        <Card title="词典" actions={<button className="btn small" onClick={onRetry}>重试</button>}>
          <p className="error-text">{state.message}</p>
        </Card>
      );
    }

    if (state.kind === 'dict-miss') {
      return (
        <Card title="词典">
          <div className="dict-header">
            <span className="dict-word">{state.token.surface}</span>
            <span className="dict-reading">{state.token.reading ? toHiragana(state.token.reading) : ''}</span>
          </div>
          <p className="muted">未找到释义</p>
          <ChineseBlock
            state={state.chinese}
            onRun={onChinese}
            runLabel="用 LLM 解释这个词"
          />
        </Card>
      );
    }

    if (state.kind === 'dict') {
      const allChinese = state.entries.every(
        (e) => e.glossesZh && e.glossesZh.length > 0
      );
      return (
        <Card title="词典">
          <div className="dict-header">
            <span className="dict-word">{state.token.surface}</span>
            <span className="dict-reading">{state.token.reading ? toHiragana(state.token.reading) : ''}</span>
          </div>
          {state.entries.length === 0 ? (
            <p className="muted">未找到释义</p>
          ) : (
            <ul className="dict-entries">
              {state.entries.map((entry, i) => {
                const posZh = translatePos(entry.pos);
                return (
                  <li key={i} className="dict-entry">
                    {posZh && <span className="dict-pos">{posZh}</span>}
                    {entry.glossesZh?.map((z, j) => (
                      <span key={j} className="dict-gloss zh">
                        {z}
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
          {!allChinese && (
            <ChineseBlock
              state={state.chinese}
              onRun={onChinese}
              runLabel="中文释义"
            />
          )}
        </Card>
      );
    }

    if (state.kind === 'translation') {
      const actions = [];
      if (state.status === 'done') {
        actions.push(
          <button key="copy" className="btn small ghost" onClick={() => onCopy(state.result)}>
            {copied ? '已复制' : '复制'}
          </button>
        );
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
          {(state.status === 'streaming' || state.status === 'done') && (
            <div className="translation-result">{state.result}</div>
          )}
          {state.status === 'error' && <p className="error-text">{state.error}</p>}
        </Card>
      );
    }

    return null;
  }
}
