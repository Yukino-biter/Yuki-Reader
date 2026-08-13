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
  if (typeof data.content !== 'string') {
    throw new ApiError('返回内容格式异常。', res.status, 'bad_response');
  }
  return data.content;
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
