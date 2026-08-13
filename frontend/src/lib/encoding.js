export class EncodingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EncodingError';
  }
}

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

function hasPrefix(bytes, prefix) {
  return prefix.every((b, i) => bytes[i] === b);
}

function decodeShiftJis(bytes) {
  try {
    const text = new TextDecoder('shift_jis').decode(bytes);
    return text.includes('\uFFFD') ? null : text;
  } catch {
    return null;
  }
}

function utf16Candidates(bytes) {
  const le = new TextDecoder('utf-16le').decode(bytes);
  const be = new TextDecoder('utf-16be').decode(bytes);
  const score = (text) => (text.match(/\uFFFD/g) || []).length;
  const leScore = score(le);
  const beScore = score(be);
  if (leScore === 0 && beScore === 0) {
    return preferByNullLayout(bytes, le, be);
  }
  if (leScore === 0) return le;
  if (beScore === 0) return be;
  throw new EncodingError('无法识别文件编码，请另存为 UTF-8 后重试。');
}

function preferByNullLayout(bytes, le, be) {
  // Tie-break by ASCII null-byte layout: UTF-16LE ASCII has nulls at odd offsets,
  // UTF-16BE ASCII has nulls at even offsets.
  const nullsAt = (offset) => {
    let n = 0;
    for (let i = offset; i < bytes.length; i += 2) {
      if (bytes[i] === 0) n += 1;
    }
    return n;
  };
  const leNulls = nullsAt(1);
  const beNulls = nullsAt(0);
  if (leNulls !== beNulls) return leNulls > beNulls ? le : be;
  return le;
}

/**
 * Decode a byte array to text with the spec's detection order:
 * BOM -> strict UTF-8 -> Shift-JIS (cp932) -> UTF-16.
 */
export function decodeText(bytes) {
  if (!ArrayBuffer.isView(bytes)) {
    throw new TypeError('decodeText expects a Uint8Array');
  }
  if (bytes.length === 0) return { text: '', encoding: 'utf-8' };

  if (hasPrefix(bytes, UTF8_BOM)) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  }
  if (hasPrefix(bytes, UTF16LE_BOM)) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  }
  if (hasPrefix(bytes, UTF16BE_BOM)) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text, encoding: 'utf-8' };
  } catch {
    // not valid UTF-8, continue
  }

  const sjis = decodeShiftJis(bytes);
  if (sjis !== null) return { text: sjis, encoding: 'shift-jis' };

  return { text: utf16Candidates(bytes), encoding: 'utf-16' };
}

/** Convenience wrapper that turns an ArrayBuffer / File / Blob into text. */
export async function decodeFile(file) {
  const buffer = await file.arrayBuffer();
  try {
    return decodeText(new Uint8Array(buffer));
  } catch (err) {
    throw new EncodingError('无法识别文件编码，请另存为 UTF-8 后重试。');
  }
}
