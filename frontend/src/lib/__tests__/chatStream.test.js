import { describe, expect, it, vi, afterEach } from 'vitest';
import { chatStream, ApiError } from '../api.js';

function sseResponse(body) {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chatStream', () => {
  it('relays SSE deltas to onDelta and returns the full text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n' +
      'data: [DONE]\n\n'
    )));
    const pieces = [];
    const full = await chatStream({ messages: [], onDelta: (p) => pieces.push(p) });

    expect(full).toBe('你好');
    expect(pieces).toEqual(['你', '好']);
  });

  it('falls back to parsing a relayed JSON body without data lines', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(
      '{"choices":[{"message":{"content":"整段译文"}}]}'
    )));
    const pieces = [];
    const full = await chatStream({ messages: [], onDelta: (p) => pieces.push(p) });

    expect(full).toBe('整段译文');
    expect(pieces).toEqual(['整段译文']);
  });

  it('falls back to a direct JSON response from the backend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ content: '后端整段' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )));
    const full = await chatStream({ messages: [], onDelta: null });

    expect(full).toBe('后端整段');
  });

  it('maps upstream errors like chat()', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'invalid_key', message: 'API Key 无效' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )));

    await expect(chatStream({ messages: [] })).rejects.toMatchObject({ code: 'invalid_key' });
  });

  it('throws bad_response for empty relayed text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse('data: [DONE]\n\n')));

    await expect(chatStream({ messages: [] })).rejects.toBeInstanceOf(ApiError);
  });
});
