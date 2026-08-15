import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Sentence from './Sentence.jsx';
import { splitSentences } from '../lib/sentence.js';
import { tokenizeChapter, prefetchChapter } from '../lib/tokenize.js';
import { loadProgress, saveProgress } from '../lib/storage.js';

export default function ReaderView({ book, settings, onWord, onTranslate, onTranslateSelection }) {
  const saved = useMemo(() => loadProgress(book.id), [book.id]);
  const initialChapter = saved && saved.chapter >= 0 && saved.chapter < book.chapters.length
    ? saved.chapter
    : 0;
  const [chapterIndex, setChapterIndex] = useState(initialChapter);
  const [tokenRows, setTokenRows] = useState([]);
  const [tokenizing, setTokenizing] = useState(true);
  const [error, setError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const saveTimer = useRef(null);
  const requestId = useRef(0);
  const restoredRef = useRef(false);
  const lastProgrammaticScroll = useRef(0);

  // 阅读页为“整页滚动”：滚动容器是 window/document，而不是 .reader-scroll
  const getScroller = useCallback(() => document.scrollingElement || document.documentElement, []);

  const chapter = book.chapters[chapterIndex] || book.chapters[0];
  const structure = useMemo(
    () => chapter.paragraphs.map((p) => ({ paragraph: p, sentences: splitSentences(p) })),
    [chapter]
  );
  const flatSentences = useMemo(() => structure.flatMap((g) => g.sentences), [structure]);

  useEffect(() => {
    let cancelled = false;
    const id = ++requestId.current;
    restoredRef.current = false;
    setTokenRows([]);
    setTokenizing(true);
    setError(null);
    tokenizeChapter(book.id, chapterIndex, flatSentences, (rows) => {
      if (!cancelled && id === requestId.current) setTokenRows([...rows]);
    })
      .then((rows) => {
        if (!cancelled && id === requestId.current) {
          setTokenRows(rows);
          setTokenizing(false);
          // 后台预取下一章，翻页时无需等待
          if (chapterIndex + 1 < book.chapters.length) {
            const next = book.chapters[chapterIndex + 1];
            const nextSentences = next.paragraphs.flatMap((p) => splitSentences(p));
            prefetchChapter(book.id, chapterIndex + 1, nextSentences);
          }
        }
      })
      .catch((err) => {
        if (!cancelled && id === requestId.current) {
          setTokenizing(false);
          setError(err.message || '分词失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [book.id, book.chapters, chapterIndex, flatSentences, retryTick]);

  const persistProgress = useCallback(() => {
    const el = getScroller();
    if (!el) return;
    const max = el.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? el.scrollTop / max : 0;
    saveProgress(book.id, chapterIndex, ratio);
  }, [book.id, chapterIndex, getScroller]);

  const goToChapter = useCallback(
    (index) => {
      const next = Math.max(0, Math.min(index, book.chapters.length - 1));
      persistProgress();
      // 手动切章后短时间内抑制自动翻页，避免滚动事件把章节再往后带
      lastProgrammaticScroll.current = Date.now();
      setChapterIndex(next);
    },
    [book.chapters.length, persistProgress]
  );

  useEffect(() => {
    const onScroll = () => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(persistProgress, 250);
      // 滚动翻页模式：滚到本章底部附近自动进入下一章
      if (settings.pageMode !== 'scrolled') return;
      if (Date.now() - lastProgrammaticScroll.current < 600) return;
      if (chapterIndex >= book.chapters.length - 1) return;
      const el = getScroller();
      if (el && el.scrollTop + window.innerHeight >= el.scrollHeight - 120) {
        goToChapter(chapterIndex + 1);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [settings.pageMode, chapterIndex, book.chapters.length, goToChapter, persistProgress, getScroller]);

  useLayoutEffect(() => {
    if (restoredRef.current) return;
    const currentSaved = loadProgress(book.id);
    const ratio = currentSaved && currentSaved.chapter === chapterIndex ? currentSaved.ratio : 0;
    const raf = requestAnimationFrame(() => {
      restoredRef.current = true;
      const el = getScroller();
      if (!el) return;
      const max = el.scrollHeight - window.innerHeight;
      if (max > 0) {
        lastProgrammaticScroll.current = Date.now();
        el.scrollTop = ratio * max;
      } else {
        el.scrollTop = 0;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [book.id, chapterIndex, tokenRows, getScroller]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        window.getSelection()?.removeAllRanges();
        setCatalogOpen(false);
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const target = e.target;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (catalogOpen) return;
      if (e.key === 'ArrowLeft') goToChapter(chapterIndex - 1);
      else goToChapter(chapterIndex + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [catalogOpen, chapterIndex, goToChapter]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const handlePlainSentenceClick = (text) => {
    onTranslate(text);
  };

  const handlePlainMouseUp = (e) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString();
    if (!text.trim()) return;
    onTranslateSelection(text);
    selection.removeAllRanges();
  };

  let sentenceIndex = 0;

  return (
    <div
      className={`reader-pane font-${settings.fontFamily} ${settings.lineHeight} page-${settings.pageMode}`}
      style={{
        '--reader-font-size': `${settings.fontSize}px`,
        '--reader-width': settings.pageWidth === 'auto' ? undefined : `${settings.pageWidth}px`
      }}
    >
      <nav className="chapter-toolbar" aria-label="顶部章节导航">
        <button
          className="btn ghost"
          disabled={chapterIndex === 0}
          onClick={() => goToChapter(chapterIndex - 1)}
        >
          ← 上一章
        </button>
        <button className="btn ghost" onClick={() => setCatalogOpen(true)}>
          目录
        </button>
        <button
          className="btn ghost"
          disabled={chapterIndex >= book.chapters.length - 1}
          onClick={() => goToChapter(chapterIndex + 1)}
        >
          下一章 →
        </button>
      </nav>

      <div className="reader-scroll">
        <article className="chapter">
          <h2 className="chapter-title">{chapter.title || '本文'}</h2>
          {error ? (
            <div className="error-box">
              <p>分词失败：{error}</p>
              <button className="btn" onClick={() => setRetryTick((t) => t + 1)}>重试</button>
            </div>
          ) : (
            <>
              {tokenizing && (
                <div className="tokenize-progress" role="status">
                  正在分词…（{tokenRows.length}/{flatSentences.length}）
                </div>
              )}
              {structure.map((group, gi) => (
                <div className="para" key={gi}>
                  {group.sentences.map((s) => {
                    const tokens = tokenRows[sentenceIndex];
                    sentenceIndex += 1;
                    return tokens ? (
                      <Sentence
                        key={sentenceIndex - 1}
                        sentence={s}
                        tokens={tokens}
                        onWord={onWord}
                        onSentence={onTranslate}
                        onSelection={onTranslateSelection}
                        showFurigana={settings.showFurigana}
                      />
                    ) : (
                      <div
                        key={sentenceIndex - 1}
                        className="sentence sentence-plain"
                        data-testid="sentence"
                        onClick={() => handlePlainSentenceClick(s)}
                        onMouseUp={handlePlainMouseUp}
                      >
                        {s}
                      </div>
                    );
                  })}
                </div>
              ))}
              {!tokenizing && <div className="chapter-end">— 本章完 —</div>}
            </>
          )}
        </article>
      </div>

      <nav className="chapter-nav" aria-label="章节导航">
        <button
          className="btn ghost"
          disabled={chapterIndex === 0}
          onClick={() => goToChapter(chapterIndex - 1)}
        >
          ← 上一章
        </button>
        <button className="btn ghost" onClick={() => setCatalogOpen(true)}>
          目录
        </button>
        <button
          className="btn ghost"
          disabled={chapterIndex >= book.chapters.length - 1}
          onClick={() => goToChapter(chapterIndex + 1)}
        >
          下一章 →
        </button>
      </nav>

      {catalogOpen && (
        <div className="modal-backdrop" onClick={() => setCatalogOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="目录"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>目录</h2>
              <button className="icon-btn" onClick={() => setCatalogOpen(false)} aria-label="关闭">×</button>
            </header>
            <div className="modal-body">
              <ul className="book-list">
                {book.chapters.map((c, i) => (
                  <li key={i}>
                    <button
                      className={`book-row${i === chapterIndex ? ' current' : ''}`}
                      onClick={() => {
                        goToChapter(i);
                        setCatalogOpen(false);
                      }}
                    >
                      <span className="book-name">{c.title || `第 ${i + 1} 章`}</span>
                      {i === chapterIndex && <span className="book-meta">当前</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
