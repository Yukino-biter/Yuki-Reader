# 翻译标签路由 + 分词提速 设计文档

日期：2026-09-03
状态：待用户审阅

## 1. 背景与目标

Yuki Reader 当前翻译链路存在两个质量问题：system prompt 全站唯一且通用（`App.jsx` 的 `TRANSLATE_SYSTEM`），对文学文本与轻小说一视同仁；点句翻译为单句独立请求，日语大量省略主语，指代与人称容易漂移。分词链路方面：结果仅存会话内存，刷新即重分；前端每批仅 12 句（后端上限 50 句），往返开销偏大；未分章文本按 5000 字符/章切分，章节偏大。

目标：

1. 按书籍类别（文学 / 轻小说 / 其他）路由翻译与词典解释提示词，类别由「LLM 静默判定 + 用户手动覆盖」确定。
2. 点句翻译注入前文语境，缓解主语省略导致的误译。
3. 未分章文本切章粒度 5000 → 1500 字符/章。
4. 分词结果持久化，重开同一本书接近零耗时；分词批大小 12 → 24 降低往返开销。

## 2. 范围

### 包含

- 书元数据 `genre` / `genreManual` 字段与 LLM 判定流程
- `lib/genres.js`：三套翻译 system prompt、词典解释 prompt 路由、判定 prompt
- 点句翻译上下文注入
- `chapters.js` 切章常量调整与测试更新
- `tokenize.js` 批大小调整 + IndexedDB 分词持久缓存（含降级）
- 首页文件列表删书入口（仅上传书）：删书记录、阅读进度与对应分词缓存
- 阅读页顶栏标签下拉

### 不包含

后端任何改动：`/api/chat`、`/api/tokenize` 契约保持不变。翻译结果缓存、流式输出（SSE）、每书术语表见 §10。

## 3. 数据模型与存储

### 3.1 书元数据

book 对象新增两个字段：

- `genre`：`'literature' | 'lightnovel' | 'generic' | null`；`null` 表示未判定，翻译时按 `generic` 处理
- `genreManual`：boolean，默认 `false`；用户手动设置后为 `true`，此后自动判定不再覆盖

落点：

- 内置书《こころ》：`books.js` 的 `loadBuiltInBook()` 硬编码 `genre: 'literature'`，不参与判定
- 上传书：IndexedDB `books` 记录新增两字段；`bookFromUploadedText()` 初始化 `genre: null, genreManual: false`；`openBook` 从存储记录重建书对象时带入；判定结果与手动修改经 `saveUploadedBook()` 写回

### 3.2 分词持久缓存

- 复用 IndexedDB 库 `yuki-books`，版本号 +1 新增 objectStore `token-cache`，记录形如 `{ id, bookId, rows }`；`id = bookId + ':' + chapterIndex + ':' + hash(本章全文)`；为 `bookId` 建索引，删书时按该索引游标清理该书全部缓存记录
- `hash`：djb2 32 位字符串哈希（同步、无依赖），用途仅为「章节内容变化 → key 变化」；正文相同则分词结果必然相同，碰撞无实际影响

### 3.3 删书（storage 层）

- 新增 `removeUploadedBook(bookId)`：删除 IndexedDB `books` 记录，并删除 localStorage 进度键 `yuki:progress:v1:<bookId>`
- `lib/tokenCache.js` 提供 `clearForBook(bookId)`：按 `bookId` 索引游标删除 `token-cache` 中该书全部记录
- 删除动作用户确认后串行调用上述两者；内置书《こころ》不提供删除入口

### 3.4 已知影响（接受，不做迁移）

- 切章粒度变化使「已打开过的未分章书」的旧进度（`yuki:progress:v1:<bookId>` 的 `{chapter, ratio}`）章节序号一次性偏移，重开后定位到新布局的相近位置；新导入的书不受影响
- 分词缓存与上传书正文同库存储，体积同步增长（全书 token rows 约为原文的数倍，在浏览器 IndexedDB 配额内无压力）

## 4. 标签判定流程

- 触发：进入阅读页后后台执行一次。条件：`genre == null` 且 `genreManual == false` 且已配置 API Key；任一不满足则跳过
- 调用：走现有 `POST /api/chat`（用户自己配置的厂商与模型，不新增后端接口）。messages 两段：
  - system：判定词，要求只输出 `literature` / `lightnovel` / `generic` 三者之一
  - user：书名 + 开头约 600 字正文
- 解析：返回内容 trim 并剥离引号 / 标点后，按枚举包含匹配；未匹配 → `genre` 保持 `null`，不重试、不打扰
- 写回：`saveUploadedBook()` 更新该书 `genre`；写回前复查 `genreManual`，判定期间用户手动改过则以手动为准（竞态保护）
- 失败（超时 / 限流 / 网络错误）：静默，`genre` 保持 `null`

## 5. 提示词路由

### 5.1 翻译（handleTranslate）

system prompt 按 `genre` 从 `lib/genres.js` 选择（`null` → generic）。三套要点：

- literature：书面、克制、重神韵；允许适度意译；文语（なり / けり等）与老派敬语按文学惯例处理；避免网络化、轻小说化口吻
- lightnovel：保留口癖 / 语气词与拟声词节奏；自称（ボク / ワシ等）与敬称（～酱 / 前辈等）映射保持一致；「……」与短句节奏保留
- generic：沿用现行 `TRANSLATE_SYSTEM` 文案

三套共享公共规则（只输出译文、不做解释）。

上下文注入：仅「点单句翻译」生效。user 消息改为两段式：【上文参考（仅用于理解，不要翻译）】前两句（不足两句有多少带多少，无前文则省略该段）+【待翻译】当前句，要求只输出待译句译文；拖选翻译自带上下文，不注入。

### 5.2 词典卡（handleChinese / dict-miss）

同一 genre 路由：在现行 `CHINESE_SYSTEM` 基础上按类别追加语气与侧重要求（轻小说保留原词的口语与习语感，文学侧重书面释义）。

## 6. UI

阅读页顶栏新增轻量标签下拉（文学 / 轻小说 / 其他）：

- 显示当前生效值（`genre` 为 `null` 时显示「其他」）
- 修改即生效并写回：`genre = 所选值`、`genreManual = true`
- 判定过程静默无加载态；判定完成后顶栏值自动更新
- 样式沿用顶栏现有控件形态，六套主题与夜间模式均可用

首页侧栏文件列表新增删书入口：上传书行悬浮显示「×」按钮；点击弹出确认弹窗（注明删除不可恢复，连同本地阅读进度与分词缓存一并清除），确认后执行删除并从列表移除；内置书无删除按钮。

## 7. 分词提速

1. 基准先行：改造前对《こころ》单章与一本大上传书记录分词耗时（临时计时放 `test-output/`，不入库）
2. `tokenize.js` 的 `TOKEN_BATCH_SIZE` 12 → 24（后端 `MAX_SENTENCES = 50` 上限内，往返次数减半；保持渐进渲染平滑度）
3. 持久缓存读取链：会话缓存 → IndexedDB `token-cache` → 后端 API；未命中走现有分批流程，完成后异步写回
4. 降级：IndexedDB 打开失败（隐私模式等）→ 仅会话缓存，行为与现状一致
5. 改造后复测同一基准，报告前后对比

`chapters.js` 的 `CHARS_PER_CHAPTER` 5000 → 1500；`splitByLength` 逻辑不变（段落边界切分、单段超长自成一章）。

## 8. 错误处理

| 场景 | 处理 |
| --- | --- |
| 判定超时 / 限流 / 网络错误 | 静默，`genre` 保持 `null`，按「其他」翻译 |
| 判定输出无法解析为枚举 | 同上 |
| 判定期间用户手动改标签 | 写回前复查 `genreManual`，手动优先 |
| IndexedDB 不可用 | 分词仅会话缓存（现状行为） |
| 未配 API Key | 不判定，标签下拉仍可手动选 |
| 删除书失败（IndexedDB 不可用） | toast 提示失败，书列表与数据保持不变 |

## 9. 测试与验收

- 前端 vitest 新增 / 更新：
  - `chapters.test.js`：切章粒度 1500 断言更新
  - `genres` 路由选择（三类别 + `null` 兜底）、上下文注入拼接、拖选不注入
  - 判定解析（引号 / 句号宽容匹配、非法输出兜底）、竞态（`genreManual` 优先）
  - 分词持久缓存读写与降级路径（mock IndexedDB）
  - 删书链路：`removeUploadedBook` 删记录与进度键、`clearForBook` 按 `bookId` 清缓存（mock IndexedDB）、确认弹窗交互
- 后端零改动，38 用例保持不动
- 浏览器端到端：上传轻小说文本走完「判定 → 顶栏显示 → 译文风格 → 手动改标签 → 不再被覆盖」；《こころ》不触发判定；重开同一本书分词秒开；隐私模式降级正常；删书后记录、进度、分词缓存均消失，重传同名书视为全新书本（新 id）
- 文档：README 功能表补标签路由说明；`docs/handover` §5.3 / §5.4 / §5.10 同步（本地内部文档）

## 10. 后续可扩展（不在本期）

- 翻译结果缓存（IndexedDB，key 含原文 hash + 模型 + 提示词版本）
- 流式输出（后端 SSE 流式转发，改善长选段感知延迟）
- 每书术语 / 人名表注入翻译 prompt
