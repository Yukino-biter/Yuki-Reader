import { describe, expect, it } from 'vitest';
import { decodeText, EncodingError } from '../encoding.js';

const u8 = (arr) => new Uint8Array(arr);

function utf16leBytes(text, bom = true) {
  const out = bom ? [0xff, 0xfe] : [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out.push(code & 0xff, code >> 8);
  }
  return u8(out);
}

function utf16beBytes(text, bom = true) {
  const out = bom ? [0xfe, 0xff] : [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out.push(code >> 8, code & 0xff);
  }
  return u8(out);
}

describe('decodeText', () => {
  it('detects UTF-8 with BOM', () => {
    const body = new TextEncoder().encode('こんにちは');
    const data = u8([0xef, 0xbb, 0xbf, ...body]);
    expect(decodeText(data)).toEqual({ text: 'こんにちは', encoding: 'utf-8' });
  });

  it('detects valid UTF-8 without BOM', () => {
    const data = new TextEncoder().encode('私は学生である。');
    expect(decodeText(data)).toEqual({ text: '私は学生である。', encoding: 'utf-8' });
  });

  it('detects UTF-16LE with BOM', () => {
    expect(decodeText(utf16leBytes('こんにちは'))).toEqual({
      text: 'こんにちは',
      encoding: 'utf-16le'
    });
  });

  it('detects UTF-16BE with BOM', () => {
    expect(decodeText(utf16beBytes('こんにちは'))).toEqual({
      text: 'こんにちは',
      encoding: 'utf-16be'
    });
  });

  it('detects Shift-JIS (cp932)', () => {
    // こ ん に ち は in CP932
    const data = u8([0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd]);
    expect(decodeText(data)).toEqual({ text: 'こんにちは', encoding: 'shift-jis' });
  });

  it('detects UTF-16 without BOM via null-byte layout', () => {
    const data = utf16leBytes('こんにちは', false);
    const result = decodeText(data);
    expect(result.encoding).toBe('utf-16');
    expect(result.text).toBe('こんにちは');
  });

  it('rejects undecodable bytes', () => {
    expect(() => decodeText(u8([0x80, 0x80, 0x80]))).toThrow(EncodingError);
    expect(() => decodeText(u8([0x80]))).toThrow(EncodingError);
  });

  it('returns empty text for empty input', () => {
    expect(decodeText(u8([]))).toEqual({ text: '', encoding: 'utf-8' });
  });
});
