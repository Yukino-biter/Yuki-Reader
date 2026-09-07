# 翻译体验升级（缓存 / 历史 / 术语表 / 流式）设计文档

日期：2026-09-07
状态：待用户审阅

## 1. 目标

四个已确认的体验升级，按序交付：翻译结果缓存、侧栏翻译历史、每书术语/人名表、流式翻译输出。除流式外全部纯前端；流式是第一个后端契约改动。

## 2. 翻译结果缓存

- IndexedDB `yuki-books` 升级 **v3**：一次迁移新增 `translation-cache`（keyPath `id`）与 `glossaries`（keyPath `bookId`）两个 store（术语表 store 在 §4 使用）。
- 新模块 `lib/translationCache.js`（自吞异常降级，同 tokenCache 模式）；djb2 哈希抽到 `lib/hash.js` 共用。
- 缓存 key = `djb2(JSON.stringify([model, genre, glossaryHash, PROMPT_VERSION])) + ':' + djb2(text + context)`。`PROMPT_VERSION` 常量放 `genres.js`（提示词文案变更时 +1 即全量失效）；`glossaryHash` 术语表为空时为空串——先占位，§4 接入。
- 流程：`handleTranslate` 先查缓存，命中直接上屏（done 态，带复制/重试）；未命中走请求，成功后异步写回。失败路径不写缓存。分类请求与词级释义不缓存。
- 覆盖语义：同 key 新译文覆盖旧值（`put` upsert）。

## 3. 侧栏翻译历史

- App 内存态：最近 20 条 `{id, original, result, at}`，新翻译（含缓存命中）push 到头部，同原文去重，刷新清空。
- 侧栏顶部常驻「历史（n）」小按钮（词典卡与翻译卡均可见）；点开显示列表（原文/译文各截 60 字），点条目回看该次结果（done 态卡片，可复制，可重试重译）。
- 任何新操作（查词/翻译/释义）自动退出历史视图；主线"新操作替换当前结果"不变。

## 4. 每书术语 / 人名表

- `glossaries` store：`{bookId, entries: [{from, to}]}`，`normalizeGlossary` 做 trim、去空、按 from 去重。删书时 `clearGlossary(bookId)` 与 token-cache 同步清理。
- **录入交互（用户已选定）**：顶栏「术语」按钮 → 弹窗编辑器（增删改）；翻译卡（done 态）新增「+ 术语」按钮 → 打开编辑器并预填原文中的片假名候选（`katakanaTerms`，正则 `[ァ-ヴー・]{2,}` 去重取前 8 个），点击候选填入原文栏。
- **上限**：50 条 / 序列化 1500 字符，添加时超出即拒绝并提示。
- **注入**：术语表非空时，翻译 system prompt 尾部追加：
  `译名对照表（原文出现下列词时必须按右侧译法）：\nルルーシュ → 鲁路修\n…`
  仅整句/选区翻译注入；分类与词级释义不注入。
- **与缓存联动**：缓存 key 含 `glossaryHash(entries)`，术语表变更旧译文自动失效。
- 作用域：每书独立（bookId 为键，内置书同样可用）；不做跨书全局表、不做自动学习收录（v2）。

## 5. 流式翻译输出

**后端（唯一契约改动）**：

- 新增独立端点 `POST /api/chat/stream`：接受与 `/api/chat` 相同的请求体（**不新增 stream 字段**，路径即语义），向上游转发 `stream: true`，用 `BodyHandlers.ofInputStream()` 接收 SSE 并**逐行原样中继**（content-type `text/event-stream`），仍然零日志。`/api/chat` 非流式路径返回结构不变。
  > 实现修订：初稿计划在 `/api/chat` 请求体加 `stream: true` 标志；实现时发现 Spring 的流式处理器要求返回类型显式声明为 `ResponseEntity<StreamingResponseBody>`，单端点双形态无法同时满足（`ResponseEntity<?>` 通配符会退化进 JSON 消息转换），故改为独立端点。
- `ChatService` 重构出 `buildRequest(request, stream)` 与 `mapUpstreamError(status, body)`，新增 `openStream(request)`：以 `stream: true` 调上游，非 2xx 读取错误体并按现有映射抛 `ChatServiceException`。
- 异常：`openStream` 在连接/状态码阶段抛错 → 走现有 `GlobalExceptionHandler`（401/429/504 等不变）；流中途上游断开 → 中继循环自然结束，前端以已收内容兜底。

**前端**：

- `api.js` 新增 `chatStream({..., onDelta})`：POST `/api/chat/stream`；非 2xx 复用现有错误映射抛 `ApiError`；响应为 `application/json`（上游不支持流式的整段兜底）→ 直接取 `content` 并一次性 `onDelta`；`text/event-stream` → 逐行解析 `data:` 负载取 `choices[0].delta.content`，`data: [DONE]` 结束；**全程无任何 delta 时把原始文本按 JSON 兜底解析**（覆盖后端原样中继上游 JSON 的情况）。
- `handleTranslate` 网络路径改走 `chatStream`：状态机 loading → streaming（`result` 增量累积）→ done（写缓存、push 历史）；错误卡与重试不变。
- Sidebar：`streaming` 态与 done 同样渲染译文文本；复制按钮仅 done 态出现。
- 分类与中文释义保持非流式 `chat()`。

## 6. 错误处理

| 场景 | 处理 |
| --- | --- |
| IndexedDB 不可用 | 缓存/历史存储静默降级：视为未命中、不写回 |
| 上游不支持 stream（返回整段 JSON） | 前端 JSON 兜底解析，一次性上屏 |
| 流中途上游断开 | 已收内容按 done 上屏；整流无任何内容 → bad_response 错误卡可重试 |
| 非流式错误（401/429/超时…） | 现有错误映射不变 |
| 术语表超上限 | 添加时拒绝并提示具体上限 |

## 7. 测试与验收

- 单测：hash / translationCache（key 敏感性 + 读写）/ glossary（normalize + 上限 + 读写）/ kana.katakanaTerms / genres.appendGlossary / chatStream 解析（SSE 增量、JSON 兜底、错误映射）/ 后端 openStream 与流式 controller（MockMvc asyncDispatch）。
- 集成：app-cache（命中不出请求、未命中写缓存）、app-history、app-glossary（注入断言 + 预填）。
- 端到端：无头 Edge + SSE 假上游，走"上传 → 点句 → 译文逐段上屏"；既有 genre-e2e 的 JSON 假上游顺带验证兜底路径。
- 文档：README FAQ 补缓存/术语/流式说明；交接文档同步。

## 8. 不做

跨书全局术语表、自动学习收录、历史持久化（跨刷新）、历史记录词典查询、分类/释义流式、翻译缓存按 baseUrl 区分。
