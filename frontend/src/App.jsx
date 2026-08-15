import { useCallback, useEffect, useRef, useState } from 'react';
import ReaderView from './components/ReaderView.jsx';
import Sidebar from './components/Sidebar.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import HomeView from './components/HomeView.jsx';
import { loadBuiltInBook, bookFromUploadedText } from './lib/books.js';
import { decodeFile } from './lib/encoding.js';
import { lookupDict, chat } from './lib/api.js';
import {
  loadSettings,
  normalizeSettings,
  saveSettings,
  loadByok,
  saveByok,
  saveUploadedBook,
  listUploadedBooks,
  getUploadedBook
} from './lib/storage.js';
import { clearTokenCache } from './lib/tokenize.js';

const TRANSLATE_SYSTEM = '你是专业的日译中翻译。请把用户提供的日语翻译成自然流畅的中文，只输出译文，不要解释。';
const CHINESE_SYSTEM = '你是日语词典释义助手。请把用户提供的日语词条释义翻译成简洁准确的中文，或按用户要求解释该词，只输出释义本身。';

function sameToken(a, b) {
  return a && b && a.surface === b.surface && a.basic === b.basic && a.reading === b.reading;
}

export default function App() {
  const [route, setRoute] = useState('welcome');
  const [book, setBook] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState({ kind: 'empty' });
  const [settings, setSettings] = useState(() => loadSettings());
  const [byok, setByok] = useState(() => loadByok());
  const [modal, setModal] = useState(null); // 'settings' | 'library'
  const [settingsTab, setSettingsTab] = useState('reading');
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [globalError, setGlobalError] = useState('');
  const [copied, setCopied] = useState(false);
  const sidebarRef = useRef(sidebar);
  const copyTimer = useRef(null);

  useEffect(() => {
    sidebarRef.current = sidebar;
  }, [sidebar]);

  // 新操作产生新结果时，让右侧栏回到顶部，保证结果在当前视口右上角可见
  useEffect(() => {
    const pane = document.querySelector('.sidebar-pane');
    if (pane) pane.scrollTop = 0;
  }, [sidebar]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const refreshLibrary = useCallback(async () => {
    try {
      setLibraryBooks(await listUploadedBooks());
    } catch {
      setLibraryBooks([]);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const openBook = useCallback((nextBook) => {
    clearTokenCache();
    setBook(nextBook);
    setSidebar({ kind: 'empty' });
    setRoute('reading');
  }, []);

  const handleOpenBuiltIn = useCallback(async () => {
    setBusy(true);
    try {
      const b = await loadBuiltInBook();
      openBook(b);
    } catch (err) {
      setGlobalError(err.message || '内置书加载失败');
    } finally {
      setBusy(false);
    }
  }, [openBook]);

  const handleUpload = useCallback(
    async (file) => {
      if (!file) return;
      if (!/\.txt$/i.test(file.name) && file.type !== 'text/plain') {
        setGlobalError('请上传 TXT 文件');
        return;
      }
      setBusy(true);
      try {
        const { text, encoding } = await decodeFile(file);
        const nextBook = bookFromUploadedText(file.name, text, encoding);
        await saveUploadedBook({
          id: nextBook.id,
          name: nextBook.name,
          size: file.size,
          encoding,
          uploadedAt: Date.now(),
          text
        });
        refreshLibrary();
        openBook(nextBook);
      } catch (err) {
        setGlobalError(err.name === 'EncodingError' ? err.message : `文件读取失败：${err.message}`);
      } finally {
        setBusy(false);
      }
    },
    [openBook, refreshLibrary]
  );

  const handleOpenUploaded = useCallback(
    async (meta) => {
      try {
        const stored = await getUploadedBook(meta.id);
        if (!stored) {
          setGlobalError('本地书库中找不到这本书。');
          return;
        }
        const nextBook = bookFromUploadedText(stored.name + '.txt', stored.text, stored.encoding);
        nextBook.id = stored.id;
        openBook(nextBook);
        setModal(null);
      } catch (err) {
        setGlobalError(`打开失败：${err.message}`);
      }
    },
    [openBook]
  );

  const handleWord = useCallback((token) => {
    setSidebar({ kind: 'dict-loading', token, lastAction: { type: 'dict', token } });
    lookupDict(token.basic)
      .then((entries) => {
        setSidebar((prev) => {
          if (prev.kind !== 'dict-loading' || !sameToken(prev.token, token)) return prev;
          if (entries.length > 0) {
            return { kind: 'dict', token, entries, chinese: { status: 'idle' }, lastAction: { type: 'dict', token } };
          }
          return { kind: 'dict-miss', token, chinese: { status: 'idle' }, lastAction: { type: 'dict', token } };
        });
      })
      .catch((err) => {
        setSidebar((prev) => {
          if (prev.kind !== 'dict-loading' || !sameToken(prev.token, token)) return prev;
          return { kind: 'dict-error', token, message: err.message, lastAction: { type: 'dict', token } };
        });
      });
  }, []);

  const handleTranslate = useCallback(
    (text) => {
      if (!byok.apiKey?.trim()) {
        setSidebar({ kind: 'prompt', message: '翻译功能需要 API Key，请先前往设置配置。' });
        return;
      }
      setSidebar({ kind: 'translation', original: text, status: 'loading', lastAction: { type: 'translate', text } });
      chat({
        baseUrl: byok.baseUrl,
        model: byok.model,
        apiKey: byok.apiKey,
        messages: [
          { role: 'system', content: TRANSLATE_SYSTEM },
          { role: 'user', content: text }
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
    [byok]
  );

  const handleChinese = useCallback(() => {
    const cur = sidebarRef.current;
    if (cur.kind !== 'dict' && cur.kind !== 'dict-miss') return;
    if (!byok.apiKey?.trim()) {
      setSidebar({ kind: 'prompt', message: '中文释义需要 API Key，请先前往设置配置。' });
      return;
    }
    const token = cur.token;
    const userContent =
      cur.kind === 'dict'
        ? `日语词「${token.surface}」（读音：${token.reading}）的英文释义如下：\n${cur.entries
            .flatMap((e) => e.glosses)
            .join('\n')}\n\n请翻译成简洁准确的中文释义。`
        : `请用中文解释日语词「${token.surface}」（读音：${token.reading || '未知'}），给出简洁释义。`;
    setSidebar({ ...cur, chinese: { status: 'loading' }, lastAction: { type: 'chinese' } });
    chat({
      baseUrl: byok.baseUrl,
      model: byok.model,
      apiKey: byok.apiKey,
      messages: [
        { role: 'system', content: CHINESE_SYSTEM },
        { role: 'user', content: userContent }
      ]
    })
      .then((content) => {
        setSidebar((prev) =>
          prev.kind === 'dict' || prev.kind === 'dict-miss'
            ? { ...prev, chinese: { status: 'done', text: content } }
            : prev
        );
      })
      .catch((err) => {
        setSidebar((prev) =>
          prev.kind === 'dict' || prev.kind === 'dict-miss'
            ? { ...prev, chinese: { status: 'error', message: err.message } }
            : prev
        );
      });
  }, [byok]);

  const handleRetry = useCallback(() => {
    const cur = sidebarRef.current;
    const action = cur?.lastAction;
    if (!action) return;
    if (action.type === 'dict') handleWord(action.token);
    else if (action.type === 'translate') handleTranslate(action.text);
    else if (action.type === 'chinese') handleChinese();
  }, [handleWord, handleTranslate, handleChinese]);

  const handleCopy = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  }, []);

  const handleSaveSettings = useCallback((next) => {
    const normalized = normalizeSettings(next);
    setSettings(normalized);
    saveSettings(normalized);
  }, []);

  const handleSaveByok = useCallback((next) => {
    setByok(next);
    saveByok(next);
  }, []);

  const handleHome = useCallback(() => {
    setModal(null);
    setRoute('welcome');
    refreshLibrary();
  }, [refreshLibrary]);

  const toggleTheme = useCallback(() => {
    const next = { ...settings };
    if (next.theme === 'dark') {
      next.theme = next.lastLightTheme || 'default';
    } else {
      next.lastLightTheme = next.theme;
      next.theme = 'dark';
    }
    setSettings(next);
    saveSettings(next);
  }, [settings]);

  return (
    <div className={`app${route === 'welcome' ? ' app-home' : ''}`} data-theme={settings.theme}>
      {route === 'reading' && (
        <header className="topbar">
          <button className="brand" onClick={handleHome} aria-label="返回主界面">
            Yuki Reader
          </button>
          {book && (
            <span className="current-book">
              {book.name}
              {book.author ? ` · ${book.author}` : ''}
            </span>
          )}
          <div className="topbar-actions">
            <button className="btn ghost small" onClick={() => { setSettingsTab('reading'); setModal('settings'); }}>
              阅读设置
            </button>
            <button className="btn ghost small" onClick={() => { setSettingsTab('byok'); setModal('settings'); }}>
              翻译设置
            </button>
            <button className="btn ghost small primary" onClick={toggleTheme}>
              {settings.theme === 'dark' ? '日间' : '夜间'}
            </button>
          </div>
        </header>
      )}

      <main className="main">
        <div className="content">
          {route === 'reading' && book ? (
            <ReaderView
              book={book}
              settings={settings}
              onWord={handleWord}
              onTranslate={handleTranslate}
              onTranslateSelection={handleTranslate}
            />
          ) : (
            <HomeView
              busy={busy}
              books={libraryBooks}
              theme={settings.theme}
              onOpenBuiltIn={handleOpenBuiltIn}
              onUploadFile={handleUpload}
              onOpenBook={handleOpenUploaded}
              onOpenSettings={() => { setSettingsTab('reading'); setModal('settings'); }}
              onOpenByokSettings={() => { setSettingsTab('byok'); setModal('settings'); }}
              onToggleTheme={toggleTheme}
            />
          )}
        </div>
        {route === 'reading' && (
          <aside className="sidebar-pane">
            <Sidebar
              state={sidebar}
              copied={copied}
              onRetry={handleRetry}
              onCopy={handleCopy}
              onChinese={handleChinese}
              onOpenSettings={() => { setSettingsTab('byok'); setModal('settings'); }}
            />
          </aside>
        )}
      </main>

      <footer className="app-footer">
        词典数据来自{' '}
        <a href="https://www.edrdg.org/jmdict/" target="_blank" rel="noreferrer">JMdict / EDICT</a>{' '}
        （CC BY-SA 4.0）· 内置《こころ》文本来自{' '}
        <a href="https://www.aozora.gr.jp/cards/000148/files/773_14560.html" target="_blank" rel="noreferrer">
          青空文庫
        </a>{' '}
        （夏目漱石，公有领域）
      </footer>

      {globalError && (
        <div className="toast" role="alert">
          <span>{globalError}</span>
          <button className="icon-btn" onClick={() => setGlobalError('')} aria-label="关闭">×</button>
        </div>
      )}

      <SettingsModal
        open={modal === 'settings'}
        initialTab={settingsTab}
        settings={settings}
        byok={byok}
        onClose={() => setModal(null)}
        onSaveSettings={handleSaveSettings}
        onSaveByok={handleSaveByok}
      />
    </div>
  );
}
