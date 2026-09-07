export class ApiError extends Error {
  constructor(message, status = 0, code = 'unknown') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function lookupDict(word) {
  const res = await fetch(`/api/dict?word=${encodeURIComponent(word)}`);
  if (!res.ok) {
    throw new ApiError('词典服务暂不可用，请稍后重试。', res.status);
  }
  return res.json();
}

function friendlyMessage(err, fallback) {
  if (err.code === 'invalid_key') return 'API Key 无效，请检查设置。';
  if (err.code === 'rate_limited') return '额度不足或限流，请稍后重试。';
  if (err.code === 'timeout') return '请求超时，请重试。';
  return err.message || fallback;
}

async function throwIfApiError(res) {
  if (res.ok) return;
  let data = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON body
  }
  const code = data?.error?.code || 'upstream_error';
  const msg = data?.error?.message || `请求失败（HTTP ${res.status}）`;
  throw new ApiError(friendlyMessage({ code, message: msg }), res.status, code);
}

export async function chat({ baseUrl, model, apiKey, messages }) {
  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, model, apiKey, messages })
    });
  } catch {
    throw new ApiError('网络请求失败，请检查网络连接。', 0, 'network');
  }

  await throwIfApiError(res);

  let data = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON body
  }
  if (typeof data.content !== 'string') {
    throw new ApiError('返回内容格式异常。', res.status, 'bad_response');
  }
  return data.content;
}

/**
 * 流式翻译（规格 §5）：POST /api/chat/stream，后端原样中继上游 SSE。
 * 每个 delta 触发 onDelta(piece)，最终返回完整译文。
 * 上游不支持流式时后端返回 JSON 或纯文本，解析不到任何 delta 则按 JSON 兜底。
 */
export async function chatStream({ baseUrl, model, apiKey, messages, onDelta }) {
  let res;
  try {
    res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, model, apiKey, messages })
    });
  } catch {
    throw new ApiError('网络请求失败，请检查网络连接。', 0, 'network');
  }

  await throwIfApiError(res);

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    let data = {};
    try {
      data = await res.json();
    } catch {
      // non-JSON body
    }
    const content = typeof data.content === 'string' ? data.content : '';
    if (!content) {
      throw new ApiError('返回内容格式异常。', res.status, 'bad_response');
    }
    if (onDelta) onDelta(content);
    return content;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
    raw += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          if (onDelta) onDelta(delta);
        }
      } catch {
        // 非 JSON 的 data 行：忽略
      }
    }
  }
  if (!full) {
    // 后端原样中继上游 JSON（无 data: 前缀）时的兜底：兼容 content 与 choices[].message.content 两种形状
    let fallback = null;
    try {
      const parsed = JSON.parse(raw.trim());
      fallback = typeof parsed?.content === 'string' && parsed.content
        ? parsed.content
        : parsed?.choices?.[0]?.message?.content ?? null;
    } catch {
      // fall through
    }
    if (fallback) {
      if (onDelta) onDelta(fallback);
      return fallback;
    }
    // 整个流没有任何内容：按格式异常处理，错误卡可重试
    throw new ApiError('返回内容格式异常。', res.status, 'bad_response');
  }
  return full;
}

/** Tokenize a batch of sentences on the backend; returns rows (one per sentence). */
export async function tokenizeSentences(sentences) {
  let res;
  try {
    res = await fetch('/api/tokenize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentences })
    });
  } catch {
    throw new ApiError('网络请求失败，请检查网络连接。', 0, 'network');
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON body
  }

  if (!res.ok) {
    const code = data?.error?.code || 'upstream_error';
    const msg = data?.error?.message || `请求失败（HTTP ${res.status}）`;
    throw new ApiError(friendlyMessage({ code, message: msg }), res.status, code);
  }
  if (!Array.isArray(data?.rows)) {
    throw new ApiError('返回内容格式异常。', res.status, 'bad_response');
  }
  return data.rows;
}
