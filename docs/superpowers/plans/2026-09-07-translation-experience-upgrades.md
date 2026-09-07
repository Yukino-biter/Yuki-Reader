# 翻译体验升级 实现计划（精简版，本会话内执行）

> 行为规格以 `docs/superpowers/specs/2026-09-07-translation-experience-upgrades-design.md` 为准；本计划记录任务切分、关键代码形状与 TDD 顺序，由控制器在本会话内逐任务执行（每任务：红灯 → 实现 → 绿灯 → 提交）。

## 任务与提交

### Task 1 翻译结果缓存（feat: 翻译结果持久缓存）
1. `lib/hash.js`（新建）：`djb2(text)` 32 位哈希；`tokenCache.hashChapterText` 改为内部调用它（对外签名不变，既有测试不动）。
2. `storage.js`：`DB_VERSION = 3`，`openDb` 幂等新建 `translation-cache`（keyPath `id`）与 `glossaries`（keyPath `bookId`）。
3. `genres.js`：`export const PROMPT_VERSION = 1;`
4. `lib/translationCache.js`（新建，自吞异常）：
   - `translationCacheKey(model, genre, glossaryHash, text, context)` = `${djb2(JSON.stringify([model,genre,glossaryHash||'',PROMPT_VERSION]))}:${djb2(text+'\u0000'+(context?.join('\n')??''))}`
   - `getTranslation(key)` → `string | null`；`putTranslation(key, result)` → void。
5. `App.handleTranslate`：先 `getTranslation` 命中直接 done；未命中走原网络路径，成功后 `putTranslation`。glossaryHash 先传 `''`。
6. 测试：`translationCache.test.js`（fake-indexeddb：key 对 model/genre/glossaryHash/text/context 敏感、读写往返、未命中 null）；`app-cache.test.jsx`（mock translationCache/api/tokenize/books/storage：命中不出网络请求、未命中调用 putTranslation）。

### Task 2 侧栏翻译历史（feat: 侧栏翻译历史）
1. App：`history`/`historyView` 状态；`pushHistory`（去重同原文、cap 20、头部插入）；翻译 done（含缓存命中）时 push；查词/翻译/释义开始时 `setHistoryView(false)`；`onSelectHistory(entry)` 回放 done 卡片。
2. `Sidebar.jsx`：props 增加 `history/historyView/onToggleHistory/onSelectHistory`；重构为 `renderCard()` + 外层包「历史（n）」bar；`historyView` 时渲染列表（原文/译文各截 60 字，空态文案）。
3. `styles.css`：`.sidebar-history-bar`、`.history-list`、`.history-item`、`.history-original/.history-result`。
4. 测试：`app-history.test.jsx`（两次翻译 → 历史两条 → 回放第一条；mock api/tokenize/tokenCache/translationCache/books/storage）。

### Task 3 每书术语表（feat: 每书术语表）
1. `lib/glossary.js`（新建）：`GLOSSARY_MAX_ENTRIES=50`、`GLOSSARY_MAX_CHARS=1500`、`normalizeGlossary`（trim/去空/按 from 去重）、`glossaryHash`（空表 → `''`）、`serializeGlossary`（双上限截断，输出 `from → to` 行）、`getGlossary/saveGlossary/clearGlossary`（自吞异常；save 返回 normalize 后的 entries）。
2. `genres.js`：`appendGlossary(systemPrompt, entries)`——序列化非空时追加「译名对照表（原文出现下列词时必须按右侧译法）」段。
3. `lib/kana.js`：`katakanaTerms(text)`——`[ァ-ヴー・]{2,}` 匹配、去重、前 8 个。
4. `components/GlossaryModal.jsx`（新建）：复用 modal 系列类；列表（from → to + ×）、from/to 输入 + 添加、prefill 片假名候选 chips（点击填入原文栏）、超上限拒绝并提示；保存 → `onSave(entries)`。
5. App 接线：`glossary` 状态随书加载（`getGlossary(book.id)`）；modal 增加 `'glossary'`；顶栏「术语」按钮；Sidebar `onAddTerm(original)` → `katakanaTerms` 预填 + 开弹窗；`handleTranslate` 缓存 key 换 `glossaryHash(glossary)`、system 经 `appendGlossary`；`handleDeleteBook` 增 `clearGlossary`。
6. Sidebar 翻译卡 done 态 actions 加「+ 术语」按钮（`onAddTerm(state.original)`）。
7. `styles.css`：`.glossary-list`、`.glossary-row`、`.glossary-chip` 等。
8. 测试：`glossary.test.js`、`kana.test.js` 追加、`genres.test.js` 追加 appendGlossary、`app-glossary.test.jsx`（glossary 走真模块 + fake-indexeddb/auto；断言注入与预填）。

### Task 4 流式翻译输出（feat: 流式翻译输出）
1. `ChatRequest`：加 `boolean stream`（canonical 5 参）+ 保留 4 参构造重载（既有测试零改动）。
2. `ChatService`：抽 `buildRequest(request, stream)` / `mapUpstreamError(status, body)`；新增 `openStream(request)`（ofInputStream；非 2xx 读完错误体按现有映射抛错）。
3. `ChatController`：`stream=true` → `ResponseEntity.ok().contentType(TEXT_EVENT_STREAM).body(StreamingResponseBody)`，`relay()` 逐行原样中继 + flush；非流式返回 `ResponseEntity.ok(Map.of("content", …))`（既有断言兼容）。
4. 后端测试：`ChatServiceTest` 增 openStream 成功（SSE 字节流往返）与 401 映射两例；`ChatControllerTest` 增流式端点（MockMvc `asyncDispatch`，断言 content-type 与中继内容）。
5. 前端 `api.js`：抽 `throwIfApiError(res)`（chat/chatStream 共用错误映射）；新增 `chatStream({..., onDelta})`——非 2xx 抛错；`application/json` → 取 content 一次性 onDelta；`text/event-stream` → 逐行 `data:` 解析 delta（`[DONE]` 结束），**全程无 delta 时按 JSON 兜底解析原始文本**。
6. `App.handleTranslate`：网络路径换 `chatStream`，状态机 loading → streaming（result 增量）→ done（写缓存 + push 历史）。
7. `Sidebar.jsx`：`streaming` 态渲染译文（无按钮）；复制按钮仍仅 done。
8. 既有测试适配：`app.test.jsx`/`app-genre.test.jsx`/`app-cache.test.jsx`/`app-delete.test.jsx` 的 api mock 增加 `chatStream`，翻译断言从 `chat` 迁到 `chatStream`。
9. 新测试：api `chatStream.test.js`（SSE 增量/JSON 兜底/错误映射）；`app-stream.test.jsx`（渐进上屏 + 失败重试）。
10. 端到端：`scripts/data/fake-upstream-sse.cjs`（SSE 假上游）+ 无头 Edge 冒烟（点句 → 译文出现）；JSON 假上游顺带验证兜底。

### 收尾（docs: 同步四功能文档）
README FAQ 三条 + 交接文档 §5.7/§5.10/§2 状态。
