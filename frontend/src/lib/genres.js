// 书籍类别 → LLM 提示词路由（规格 §5）。
// genre 取值：'literature' | 'lightnovel' | 'generic'，null 按 generic 处理。
export const GENRE_KEYS = ['literature', 'lightnovel', 'generic'];
export const GENRE_LABELS = { literature: '文学', lightnovel: '轻小说', generic: '其他' };

const PUBLIC_RULES = '只输出译文，不要解释，不要输出原文以外的内容。';

export const TRANSLATE_PROMPTS = {
  literature: `你是专业的日译中文学翻译。请把用户提供的日语翻译成中文：语言书面、克制、有文学质感，允许适度意译以传达神韵；文语（なり、けり等）与老派敬语按文学惯例处理；避免网络用语与轻小说腔。${PUBLIC_RULES}`,
  lightnovel: `你是专业的日译中翻译，擅长轻小说。请把用户提供的日语翻译成中文：保留角色口癖、语气词与拟声词的节奏；同一角色的自称（ボク、ワシ、わたし等）与敬称（前辈、～酱、大人等）译法保持一致；「……」与短句节奏原样保留；对话口语自然。${PUBLIC_RULES}`,
  generic: `你是专业的日译中翻译。请把用户提供的日语翻译成自然流畅的中文，只输出译文，不要解释。`
};

const CHINESE_BASE =
  '你是日语词典释义助手。请把用户提供的日语词条释义翻译成简洁准确的中文，或按用户要求解释该词，只输出释义本身。';

export const CHINESE_PROMPTS = {
  literature: `${CHINESE_BASE}释义风格书面、简练。`,
  lightnovel: `${CHINESE_BASE}遇到口语、角色语气词或习语时，释义保留其口语色彩。`,
  generic: CHINESE_BASE
};

export function translateSystemFor(genre) {
  return TRANSLATE_PROMPTS[genre] || TRANSLATE_PROMPTS.generic;
}

export function chineseSystemFor(genre) {
  return CHINESE_PROMPTS[genre] || CHINESE_PROMPTS.generic;
}

/**
 * 点句翻译的 user 消息：带前文语境时用两段式，要求只输出待译句。
 * 拖选翻译自带上下文，context 传 null，原样返回所选文本。
 */
export function translateUserContent(text, context = null) {
  if (Array.isArray(context) && context.length > 0) {
    return `【上文参考（仅用于理解，不要翻译）】\n${context.join('\n')}\n\n【待翻译】\n${text}\n\n只翻译并输出【待翻译】部分的译文。`;
  }
  return text;
}

export const CLASSIFY_SYSTEM =
  '你是书籍分类器。根据书名和正文开头判断这本书的类别，只输出以下三个词之一：literature（纯文学、严肃文学）、lightnovel（轻小说）、generic（其他）。不要输出任何其他内容。';

export function classifyUserContent(name, excerpt) {
  return `书名：${name}\n\n正文开头：\n${excerpt}`;
}

/** 宽容解析：剥离引号/标点后匹配英文枚举或中文标签；失败返回 null（按“其他”处理）。 */
export function parseGenre(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().replace(/[「」『』“”‘’。．.，,、\s]/g, '');
  if (text.includes('lightnovel') || text.includes('轻小说')) return 'lightnovel';
  if (text.includes('literature') || text.includes('文学')) return 'literature';
  if (text.includes('generic') || text.includes('其他')) return 'generic';
  return null;
}
