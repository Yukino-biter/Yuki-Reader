const SETTINGS_KEY = 'yuki:settings:v1';
const BYOK_KEY = 'yuki:byok:v1';
const progressKey = (bookId) => `yuki:progress:v1:${bookId}`;

const THEMES = ['default', 'blue', 'yellow', 'beige', 'green', 'dark'];
const LIGHT_THEMES = ['default', 'blue', 'yellow', 'beige', 'green'];
const FONT_FAMILIES = ['black', 'song', 'kai'];
const LINE_HEIGHTS = ['compact', 'normal', 'loose'];
const PAGE_MODES = ['scrolled', 'single'];
const PAGE_WIDTHS = ['auto', '640', '800', '900', '1000', '1280'];

const THEME_MAP = { light: 'default', dark: 'dark', paper: 'beige' };
const FONT_SIZE_MAP = { small: 16, medium: 18, large: 21 };
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 32;

export const DEFAULT_SETTINGS = {
  theme: 'default',
  lastLightTheme: 'default',
  fontSize: 18,
  lineHeight: 'normal',
  fontFamily: 'song',
  pageMode: 'scrolled',
  pageWidth: 'auto',
  showFurigana: true
};

/**
 * Migrate legacy settings (small/medium/large font sizes, light/dark/paper
 * themes) to the Qidian-inspired schema and clamp out-of-range values.
 */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;

  const theme = THEME_MAP[raw.theme] || (THEMES.includes(raw.theme) ? raw.theme : s.theme);
  s.theme = theme;
  s.lastLightTheme = LIGHT_THEMES.includes(raw.lastLightTheme)
    ? raw.lastLightTheme
    : theme === 'dark'
      ? s.lastLightTheme
      : theme;

  const fontSize = raw.fontSize;
  if (typeof fontSize === 'number' && Number.isFinite(fontSize)) {
    s.fontSize = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(fontSize)));
  } else if (FONT_SIZE_MAP[fontSize]) {
    s.fontSize = FONT_SIZE_MAP[fontSize];
  }

  s.lineHeight = LINE_HEIGHTS.includes(raw.lineHeight) ? raw.lineHeight : s.lineHeight;
  s.fontFamily = FONT_FAMILIES.includes(raw.fontFamily) ? raw.fontFamily : s.fontFamily;
  s.pageMode = PAGE_MODES.includes(raw.pageMode) ? raw.pageMode : s.pageMode;
  s.pageWidth = PAGE_WIDTHS.includes(String(raw.pageWidth)) ? String(raw.pageWidth) : s.pageWidth;
  s.showFurigana = typeof raw.showFurigana === 'boolean' ? raw.showFurigana : s.showFurigana;
  return s;
}

export function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export const DEFAULT_BYOK = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  apiKey: ''
};

export function loadByok() {
  try {
    return { ...DEFAULT_BYOK, ...JSON.parse(localStorage.getItem(BYOK_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_BYOK };
  }
}

export function saveByok(config) {
  localStorage.setItem(BYOK_KEY, JSON.stringify(config));
}

export function loadProgress(bookId) {
  try {
    const raw = localStorage.getItem(progressKey(bookId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!Number.isInteger(p.chapter) || typeof p.ratio !== 'number') return null;
    return p;
  } catch {
    return null;
  }
}

export function saveProgress(bookId, chapter, ratio) {
  try {
    localStorage.setItem(progressKey(bookId), JSON.stringify({ chapter, ratio, updatedAt: Date.now() }));
  } catch {
    // storage full / private mode: ignore
  }
}

// --- IndexedDB for uploaded books + token cache ---
const DB_NAME = 'yuki-books';
const STORE = 'books';
const TOKEN_CACHE_STORE = 'token-cache';
const DB_VERSION = 2;

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(TOKEN_CACHE_STORE)) {
        const cacheStore = db.createObjectStore(TOKEN_CACHE_STORE, { keyPath: 'id' });
        cacheStore.createIndex('byBook', 'bookId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveUploadedBook(book) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(book);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function listUploadedBooks() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    let result = [];
    req.onsuccess = () => {
      result = req.result
        .map((b) => ({ id: b.id, name: b.name, size: b.size, encoding: b.encoding, uploadedAt: b.uploadedAt }))
        .sort((a, b) => b.uploadedAt - a.uploadedAt);
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getUploadedBook(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    let result = null;
    req.onsuccess = () => {
      result = req.result || null;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeUploadedBook(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
  try {
    localStorage.removeItem(progressKey(id));
  } catch {
    // localStorage 不可用（隐私模式）：忽略
  }
}
