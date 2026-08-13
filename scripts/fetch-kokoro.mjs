// 从青空文库获取夏目漱石《こころ》（公有领域），转换为带章节结构的 JSON。
// 用法：node scripts/fetch-kokoro.mjs [--cached]
// 输出：frontend/public/books/kokoro.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_URL = 'https://www.aozora.gr.jp/cards/000148/files/773_14560.html';
const CACHE = path.join(root, 'scripts', 'data', 'kokoro.html');
const OUT = path.join(root, 'frontend', 'public', 'books', 'kokoro.json');

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function decodeHtml(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // Aozora 页面通常是 Shift_JIS
    return new TextDecoder('shift_jis').decode(buffer);
  }
}

function htmlToBlocks(mainText) {
  // Walk the main_text HTML: collect heading text and paragraph lines.
  const blocks = []; // { type: 'heading' | 'text', text }
  const re = /<h([34]) class="[^"]*">\s*<a class="midashi_anchor"[^>]*>([^<]*)<\/a>\s*<\/h\1>|<br\s*\/?>|<ruby>.*?<\/ruby>|<rt>.*?<\/rt>|<rp>.*?<\/rp>|<\/?(?:div|p)[^>]*>|<!--.*?-->|<\/?[a-zA-Z][^>]*>|[\s\S]/g;
  let current = '';
  let m;
  while ((m = re.exec(mainText)) !== null) {
    const [full, , headingText] = m;
    if (full.startsWith('<h')) {
      if (current.trim()) blocks.push({ type: 'text', text: current.trim() });
      current = '';
      blocks.push({ type: 'heading', text: decodeEntities(headingText).trim() });
      continue;
    }
    if (full.startsWith('<br')) {
      current += '\n';
      continue;
    }
    if (full.startsWith('<ruby>')) {
      const rb = full.match(/<rb>([^<]*)<\/rb>/);
      current += rb ? rb[1] : '';
      continue;
    }
    if (full.startsWith('<rt') || full.startsWith('<rp') || full.startsWith('<!--')
        || full.startsWith('</') || full.startsWith('<div') || full.startsWith('<span')) {
      continue; // furigana/annotation/punctuation/tag boundaries are dropped or handled by newline rules
    }
    current += full;
  }
  if (current.trim()) blocks.push({ type: 'text', text: current.trim() });
  return blocks;
}

function blocksToChapters(blocks) {
  const chapters = [];
  let current = null;
  let part = '';
  for (const block of blocks) {
    if (block.type === 'heading') {
      if (current) chapters.push(current);
      const title = block.text;
      if (/^(上|中|下)\s/.test(title)) part = title[0];
      const displayTitle = /^[一二三四五六七八九十百千万]+$/.test(title) ? `${part}・${title}` : title;
      current = { title: displayTitle, paragraphs: [] };
      continue;
    }
    if (!current) {
      current = { title: '冒頭', paragraphs: [] };
    }
    // 青空文庫惯例：每段以全角空格（U+3000）缩进开头。
    // 缩进行开启新段落，其余行（折行）并入当前段落。
    const lines = block.text.split('\n');
    let paragraph = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^\u3000/.test(line)) {
        if (paragraph.length) current.paragraphs.push(paragraph.join('\n'));
        paragraph = [trimmed];
      } else {
        paragraph.push(trimmed);
      }
    }
    if (paragraph.length) current.paragraphs.push(paragraph.join('\n'));
  }
  if (current) chapters.push(current);
  return chapters.filter((c) => c.paragraphs.length > 0);
}

async function main() {
  const useCached = process.argv.includes('--cached');
  let html;
  if (useCached) {
    html = decodeHtml(await readFile(CACHE));
  } else {
    const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'Mozilla/5.0 YukiReader/1.0' } });
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    html = decodeHtml(buffer);
    await mkdir(path.dirname(CACHE), { recursive: true });
    await writeFile(CACHE, html, 'utf8');
  }

  const mainStart = html.indexOf('<div class="main_text">');
  const mainEnd = html.indexOf('<div class="bibliographical_information">', mainStart);
  if (mainStart === -1) throw new Error('未找到 main_text');
  const mainText = mainEnd === -1 ? html.slice(mainStart) : html.slice(mainStart, mainEnd);

  const blocks = htmlToBlocks(mainText);
  const chapters = blocksToChapters(blocks);
  const totalChars = chapters.reduce((n, c) => n + c.paragraphs.join('').length, 0);

  const book = {
    name: 'こころ',
    author: '夏目漱石',
    sourceLabel: '青空文庫',
    sourceUrl: SOURCE_URL,
    licenseNote: '青空文庫収録の公有領域テキスト（底本：岩波文庫）',
    chapters
  };
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(book), 'utf8');
  console.log(`ok: ${chapters.length} 章, ${totalChars} 字 -> ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
