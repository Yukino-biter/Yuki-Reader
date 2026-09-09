# 翻译体验打磨批（流式中止 / 历史持久化 / 拖选上下文 / 清理）设计文档

日期：2026-09-09
状态：已批准（用户选定"只做翻译打磨批"方向，并确认各节设计）

## 1. 目标

四个体验打磨项，全部纯前端（后端零代码改动，`mvn test` 仅回归）：

1. 流式翻译可中止：新操作自动取消旧流 + 流式卡「停止」按钮。
2. 翻译历史持久化到 IndexedDB（跨刷新，上限 20 → 50）。
3. 拖选翻译带上文（与点句路径同规则：前两句）。
4. 清理：删除死代码 `LibraryModal.jsx`；更正交接文档 §9.11（404 早已修复，文档过时）。

## 2. 决策记录

- **方向**：交接文档 §10 候选（生词本/移动端/竖排/术语表 v2/云同步）中，用户选定先做打磨批；生词本留待下一阶段。
- **历史持久化**：2026-09-07 规格 §8 曾列为"不做"，本批经用户批准实施（翻转）。
- **停止按钮**：用户在"仅自动中止"与"自动中止 + 停止按钮"之间选定后者。
- **中止机制**：请求序号守卫 + AbortController。否决"仅靠现有 `prev.original === text` 守卫"：同文本重复请求时两个流的 delta 都匹配守卫、交错拼接。
- **历史存储**：React state 为唯一事实源、IndexedDB 镜像整表（单事务 clear + 全量重写）。否决逐条 put + 库内裁剪（逻辑分散）与 localStorage（与既有 IndexedDB 缓存模式不一致）。
- **历史上限**：20 → 50。内存时代 20 条≈一次阅读会话；持久化后 50 条才让"跨会话找回翻译"有意义。
- **拖选上下文来源**：mouseup 所在句的 idx，复用 `previousSentences`。否决 anchorNode 反查起始句（跨组件查 DOM，测试重，收益小）。
- **撤销一项**：原清单中"后端 NoResourceFoundException 500→404 修复"经代码核实**已经完成**（`common/GlobalExceptionHandler.java` 已有 404/405 处理器），是交接文档 §9.11 过时；本项改为更正文档。

## 3. 流式中止 + 停止按钮

**api.js**

- `chatStream({..., onDelta, signal})`：`signal` 透传给 fetch；读流循环中 `reader.read()` 的 AbortError 天然向上抛。
- **修复既有坑**：fetch 阶段的 `catch` 会把 AbortError 吞成"网络请求失败"——改为 `err.name === 'AbortError'` 时原样 rethrow，其余照旧映射 `network`。

**App.jsx**

- 新增 `streamSeqRef`（单调递增序号）与 `streamAbortRef`（当前 AbortController）。封装 `beginStream()`：`abort()` 旧控制器 → 序号 +1 → 新建控制器，返回 `{ seq, signal }`。
- 触发中止的动作（发起新请求前统一调用）：`handleWord`、`handleTranslate`（重试路径复用）、`handleChinese`、`handleSelectHistory`；App 卸载时 abort（useEffect cleanup）。切章不清侧栏，**不**触发中止（流结果与章节无关）。
- 回调守卫：onDelta / then / catch 闭包捕获本次 seq，执行前比对 `seq === streamSeqRef.current`，过期一律 no-op——不写状态、不弹错误卡、不写缓存、不写历史。现有 `prev.original === text` 守卫保留作双保险。

**Sidebar.jsx**

- 翻译卡 `status === 'streaming'` 时渲染「停止」按钮，新 prop `onStopStream`；App 实现 = `streamAbortRef.current?.abort()`（**不**递增序号）。
- 新状态 `status: 'stopped'`：catch 收到 AbortError 且序号仍当前时置入。渲染同 done 的译文文本与复制按钮，另加提示行「已停止，译文可能不完整」；**不含「+术语」按钮**（部分译文收术语易断章取义）；**不写翻译缓存、不写历史**。

## 4. 翻译历史持久化

- 新模块 `lib/translationHistory.js`（对齐 `translationCache.js` 风格，全部入口自吞异常降级）：
  - `loadHistory()`：读全表按 `at` 降序返回，失败/为空返回 `[]`。
  - `saveHistory(list)`：单事务 `clear()` + 逐条 `put`（≤50 条，开销可忽略），失败静默。
  - 条目形状不变：`{id, original, result, at}`；去重规则不变（同原文去旧留新）。
- `storage.js`：`DB_VERSION 3 → 4`；`onupgradeneeded` 新建 `translation-history` store（keyPath `id`）。老库打开即自动升级，无迁移脚本。
- `App.jsx`：挂载时 `loadHistory().then(setHistory)`；`pushHistory` 计算 next 列表（置顶 + 去重 + 截断 50）后同步 `saveHistory(next)`。
- IndexedDB 不可用：降级为纯内存 50 条，行为同现状。
- 删书**不**清历史：历史是跨书阅读日志，内容自持（与翻译缓存不随删书清理同理）。

## 5. 拖选翻译带上文

- `ReaderView.jsx` 两处调用点补上下文，与点句路径（`onSentence={(text) => onTranslate(text, context)}`）完全对称：
  - 分词路径（现 `onSelection={onTranslateSelection}`）：改为 `onSelection={(text) => onTranslateSelection(text, previousSentences(flatSentences, idx))}`。
  - 纯文本路径：`handlePlainMouseUp` 改为接收 idx，内部 `onTranslateSelection(text, previousSentences(flatSentences, idx))`。
- `Sentence.jsx` 零改动——不触碰规格 §6 的三条 DOM 判定规则（词 span 阻止冒泡 / 选区等于单 span / 非词区点整句）。
- `onTranslateSelection` 即 `handleTranslate`，签名 `(text, context)` 已兼容，App 无需改签名。
- 已知取舍：上下文取 mouseup 所在句的前两句；选区起始于更早句子时上下文可能与选区重叠，对 LLM 无害。缓存 key 已含 context，新旧缓存自动隔离。

## 6. 清理与文档

- 删除 `frontend/src/components/LibraryModal.jsx`（已核实仓库内零引用）。
- 交接文档：更正 §9.11（404/405 已修复）；§2/§5.6/§5.10/§10 同步本批改动；§11 变更记录补历史持久化翻转。
- README：历史持久化、停止按钮说明与测试数同步。
- 后端零改动；如需交付 jar 再 `mvn package`（先停 8080，Windows 文件锁）。

## 7. 错误处理

| 场景 | 处理 |
| --- | --- |
| IndexedDB 不可用 | 历史降级为内存 50 条；缓存路径行为不变 |
| 新操作中止旧流 | 旧流回调按序号守卫静默丢弃，无残留写入 |
| 用户点「停止」 | stopped 卡：部分译文可复制；不写缓存/历史 |
| fetch 阶段 AbortError | api.js 原样 rethrow（本批修复，不再误报网络错误） |
| 流中途上游断开 | 现状不变（已收内容兜底 / bad_response 错误卡） |
| 同文本重复请求 | 序号守卫隔离，旧流全部回调失效，无交错 |

## 8. 测试与验收

- **单测新增**：chatStream 透传 signal 且不吞 AbortError；新动作中止旧流（旧回调不写状态）；同文本重复请求不交错；停止 → stopped 态且缓存/历史零写入；translationHistory 读写与降级；storage v4 新 store；ReaderView 分词/纯文本两条拖选路径均带 context。
- **命令验证**：`npm --prefix frontend test` 全绿；`npm --prefix frontend run build`；`mvn -f backend\pom.xml test` 回归全绿（42 例，无改动）。
- **端到端**（无头 Edge + CDP + 假上游 8123，本地 gitignored 脚本）：点句流式逐字上屏 → 点另一句后经 CDP Network 事件确认旧请求 canceled → 停止按钮保留部分译文 → 刷新后历史仍在 → 拖选请求 messages 含上文。
- **完成定义**：验收标准全过 + README/交接文档同步 + 提交。

## 9. 不做

- 分类与中文释义的非流式 `chat()` 不加 signal、不流式化。
- 删书不清理历史；历史不记录书名/bookId；历史不含词典查询。
- stopped 态不加重试按钮（可后续小改）。
- 生词本、移动端、竖排、术语表 v2、云同步：见交接文档 §10，另行立项。
- 后端任何代码改动。
