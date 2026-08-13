# Yuki Reader 交接文档

- 日期：2026-08-11
- 最近更新：2026-08-12（§13 后端分词改造已完成，含测试与端到端验证）
- 目的：为新对话（前端部分修改）提供完整上下文，无需重读历史对话即可接手
- 规格：`docs/superpowers/specs/2026-08-11-yuki-reader-design.md`（下文“规格 §x”均指此文档）

## 1. 项目一句话

类似 MojiRead 的日语阅读 Web 应用：上传或打开 TXT、点词查 JMDict 词典、点句/拖选调用 LLM 翻译（BYOK）。React 前端由 Spring Boot 单进程托管，SQLite 存 JMDict。

> 注意：形态素分词已于 2026-08-12 按 §13 完成**后端分词（kuromoji-java）**改造；§3–§5.4 已同步更新为改造后现状。

## 2. 当前完成状态（均已验证）

- 前端：完整 MVP 功能，`npm test` 51 个用例通过（分词用例为 mock 后端 API 的批处理/缓存）。
- 首页（2026-08-13）：Mooon 风格应用工作台（固定侧栏 + 滚动主区）；侧栏 = Logo + 上传文件 + 使用说明 + 文件列表（内置书《こころ》+ 已上传书）+ 底部设置，顶部带 ← 收起按钮（收起为 64px 图标栏）；首页不显示右侧翻译栏（仅阅读页显示）；“我的书”独立入口已移除，阅读页顶栏精简为 品牌/书名/阅读设置/翻译设置/日夜间。
- 标注假名（2026-08-13）：阅读设置新增开关（默认开）；含汉字词上方以 `<ruby>` 显示平假名（`rt` 显式 `font-family: inherit` 跟随正文字体）；所有读音显示（标注 + 词典卡）统一经 `lib/kana.js` 转平假名。
- 后端：`GET /api/dict`、`POST /api/chat`、`POST /api/tokenize`、JMDict 导入器，`mvn test` 36 个用例通过（单元 21 + 集成 15）。
- 数据：《こころ》110 章 / 736 段 / 约 16 万字符（`frontend/public/books/kokoro.json`）；JMDict 已导入 `backend/data/yuki.db`（329,302 行，gitignored）。
- 产物：`backend/target/yuki-reader.jar`（约 50MB，含前端静态资源与 kuromoji IPADIC 词典）。
- 安全：API Key 仅存浏览器 localStorage；后端不落库、不打日志（已通过日志检索验证）。
- 端到端：fat jar 启动后《こころ》分词进度走完、点词查词典、点句翻译（本地假上游）、目录/方向键/主题/字号均验证过（真实无头 Edge + CDP）；浏览器会话无 `/kuromoji-dict` 请求，jar 内无 `static/kuromoji-dict`。

## 3. 架构与数据流

```
上传 txt / 打开内置书
  → 浏览器检测编码 → 分段落、分句
  → 按 12 句一批 POST /api/tokenize（后端 kuromoji-java 分词）
  → 按“句子容器 + 词 span”渲染
点词      → GET  /api/dict?word=词典原形 → 侧栏词典卡
点句/拖选 → POST /api/chat             → 侧栏翻译卡
```

- 前端：React 18 + Vite 5（只做编码检测/分句/渲染与交互，分词调后端 API，见 §13）
- 后端：Spring Boot 3.5.3（Java 17）+ SQLite（xerial JDBC，Hikari 池大小 1）+ kuromoji-java（kuromoji-ipadic 0.9.0）
- 部署：`mvn package` 单 fat jar，VPS 单进程，建议 1–2GB 内存

## 4. 目录结构与关键文件

| 路径 | 职责 | 备注 |
| --- | --- | --- |
| `frontend/src/App.jsx` | 顶层状态机：welcome/reading、侧栏动作、弹窗、上传 | 前端改交互的主要入口 |
| `frontend/src/lib/encoding.js` | 编码检测 | 见 §5.1 |
| `frontend/src/lib/sentence.js` | 分句 | 见 §5.2 |
| `frontend/src/lib/chapters.js` | 章节检测 | 见 §5.3 |
| `frontend/src/lib/tokenize.js` | 后端分词调用层：会话缓存 + 12 句渐进分批 + 预取 | 见 §5.4 |
| `frontend/src/components/Sentence.jsx` | 词/句/拖选判定 | 见 §5.5 |
| `frontend/src/components/ReaderView.jsx` | 阅读页：章节导航、渐进渲染、进度 | 见 §5.5/§5.8 |
| `frontend/src/components/Sidebar.jsx` | 侧栏卡片 | 见 §5.6 |
| `frontend/src/components/SettingsModal.jsx` | 阅读设置 + BYOK | — |
| `frontend/src/components/HomeView.jsx` | 首页工作台：侧栏、主卡上传区、特性区、使用说明弹窗 | 2026-08-13 新增 |
| `frontend/src/lib/kana.js` | 片假名→平假名、汉字检测 | 2026-08-13 新增 |
| `frontend/src/components/LibraryModal.jsx` | 旧“我的书”弹窗 | 已不再引用，可留作参考 |
| `frontend/src/lib/storage.js` | localStorage + IndexedDB | 见 §5.8 |
| `frontend/src/lib/api.js` | /api/dict、/api/chat、/api/tokenize 封装 + 错误文案 | 见 §5.10 |
| `frontend/src/lib/providers.js` | LLM 提供商预设 | — |
| `frontend/src/lib/books.js` | 内置书加载、上传书构造 | — |
| `frontend/src/styles.css` | 全部样式，主题变量 | 见 §5.9 |
| `frontend/vite.config.js` | Vite + Vitest 配置 | — |
| `frontend/scripts/copy-build.mjs` | dist → `backend/src/main/resources/static` | 构建后自动执行 |
| `backend/src/main/java/com/yukireader/dict/*` | /api/dict、SQLite 仓储、JMDict 导入 | 见 §6 |
| `backend/src/main/java/com/yukireader/chat/*` | /api/chat 转发与错误映射 | 见 §6 |
| `backend/src/main/java/com/yukireader/tokenize/*` | /api/tokenize 后端分词（kuromoji-java） | 见 §13 |
| `backend/src/main/resources/application.yml` | 端口、DB、JMDict、超时配置 | 见 §6.4 |
| `scripts/fetch-kokoro.mjs` | 青空文库 → kokoro.json | 见 §7 |
| `scripts/download-jmdict.ps1` | EDRDG 下载 JMdict_e | 见 §7 |
| `README.md` | 构建/运行/测试/部署说明 | 与本文档互补 |

## 5. 前端核心实现细节

### 5.1 编码检测（encoding.js）

顺序（规格 §5）：BOM（UTF-8/UTF-16LE/BE）→ 严格 UTF-8（fatal）→ Shift-JIS（cp932，出现 U+FFFD 即拒绝）→ UTF-16（无 BOM 时按候选评分 + ASCII 空字节布局判断）。全部失败抛 `EncodingError`，上传页提示“另存为 UTF-8”。`decodeFile(file)` 供上传用。

### 5.2 分句（sentence.js）

- 句末标点：`。！？…．｡`；闭括号 `」』）〉》］】｣"'"”`。
- 句末标点后紧跟的闭括号并入本句；连续句末标点（`……。`、`！？`）并入同一句。
- `…` 按规格视为句末标点，句中省略号会切句（这是规格字面行为，不是 bug）。
- 段落由空行切分；段内换行保留在句内（渲染 `white-space: pre-wrap`）。

### 5.3 章节（chapters.js + kokoro.json）

- `isHeadingParagraph`：单行、长度 ≤16，匹配 日文数字（一二三…）、纯数字、`上/中/下`、`第X章…`、`《…》`。
- `splitChapters`：空行分段落；段落首行是标题则开新章（标题行可能和正文同段）；**无任何标题时按约 5000 字符/章切分**（只在段落边界断章，自动命名“第 N 章”；单段超长时该段自成一章）。
- 内置书 JSON 形状：`{ name, author, sourceLabel, sourceUrl, chapters: [{ title, paragraphs: [string] }] }`。

### 5.4 分词（tokenize.js）——已改为后端 API

- `tokenizeChapter(bookId, chapterIndex, sentences, onProgress?)`：**12 句一批**调用 `api.tokenizeSentences(sentences)`（POST /api/tokenize），每批 `onProgress(rows)` 后 `await setTimeout(0)` 让 UI 先渲染；结果写入 `sessionTokenCache`（会话内存，规格 §10），缓存命中直接回调并返回。
- `prefetchChapter()`：当前章分完后后台预取下一章（ReaderView 调用）。
- `tokenizeSentences` 失败抛 `ApiError`（api.js 封装，错误文案沿用现有映射）。
- 已删除：`loadTokenizer`、`wrapTokens`、`tokenizeSentence`、kuromoji npm 依赖、`src/shims/path.js`、`scripts/prepare-assets.mjs`、vite 的 path 别名、`public/kuromoji-dict` 生成逻辑。

### 5.5 交互判定（Sentence.jsx / ReaderView.jsx，规格 §6）

- 单击词 span：`stopPropagation` → `onWord(token)`（token 从 span 的 data-* 属性还原）。
- 单击句子容器非词区（间隙/行尾）：`onSentence(整句)`。
- mouseup 检查选区：无选区忽略；选区恰好等于单个词 span 内容 → 按词查词典（`selectionHitsSingleWord`）；跨多词 → `onSelection(选区文本)` 走 LLM。
- 拖选后通过 `suppressClick` ref 抑制紧随的 click，避免误触整句翻译（mousedown 时重置）。
- Esc 清除选区，侧栏内容保留（ReaderView 的 window keydown）。
- **渐进渲染降级**：未分到词的句子以 `.sentence-plain` 纯文本渲染（可整句点击/拖选翻译，无点词），批次到达后自动替换为词 span；顶部显示“正在分词…（x/y）”。
- 阅读进度：一次展示一章，滚动防抖 250ms 保存 `{chapter, ratio}`；进入章节时按保存比例恢复（restoredRef 保证只恢复一次）。
- 章节导航：正文**顶部与底部各一组**“← 上一章 / 目录 / 下一章”（目录为章节列表弹层）；主键盘与数字小键盘方向键 ←/→ 切章（输入框/下拉/目录打开时不触发）。
- 翻页模式：`scrolled`（滚动翻页，滚到章底自动进入下一章，带 600ms 程序化滚动保护）/ `single`（章节翻页，仅底部导航与方向键切章，本阶段不做强制分页，避免破坏点词/拖选 DOM 规则）。

### 5.6 侧栏状态机（Sidebar.jsx）

`state.kind`：`empty | prompt | dict-loading | dict | dict-miss | dict-error | translation`；词典卡的“中文释义”用 `chinese.status = idle|loading|done|error` 子状态。新操作直接整体替换旧结果（无历史，规格 §7）。`lastAction` 记录上次操作供“重试”重放。

### 5.7 App 回调

`handleWord`（查词典→dict/dict-miss/dict-error）、`handleTranslate`（未配 Key 时切到 `prompt` 卡并引导设置）、`handleChinese`（dict 卡翻译英文释义 / dict-miss 卡“用 LLM 解释这个词”，同一机制）、`handleRetry`、`handleCopy`（带“已复制”反馈）。

### 5.8 存储（storage.js）

- localStorage：`yuki:settings:v1`（theme/lastLightTheme/fontSize 数字/lineHeight/fontFamily/pageMode/pageWidth）、`yuki:byok:v1`（provider/baseUrl/model/apiKey）、`yuki:progress:v1:<bookId>`。旧值自动迁移：small/medium/large → 16/18/21，light/paper/dark → default/beige/dark。
- IndexedDB：库 `yuki-books`、表 `books`（keyPath `id`），存上传书全文。
- 默认 BYOK 在 `providers.js`：DeepSeek / Kimi / GLM / OpenAI / OpenRouter / 自定义。

### 5.9 主题与样式（styles.css）

- 主题经根节点 `data-theme="default|blue|yellow|beige|green|dark"` 切换 CSS 变量。背景三层：`--bg-page`（页底）/ `--bg-read`（阅读区纸面）/ `--bg-card`（顶栏、侧栏、卡片）；文字三级：`--text-primary`（90% 黑或 60% 白）/ `--text-secondary`（48%/40%）/ `--text-muted`（36%/32%）。浅色系正文对比度约 14–16:1，夜间约 7.2:1（对照起点阅读器实测色值）。
- `--on-accent` 是“强调色背景上的文字色”（按钮、分段选中项），按主题区分白/近黑，避免深色主题浅色强调色配白字看不清。
- 字号由 `.reader-pane` 的 `--reader-font-size` 控制（A−/A+ 步进 2，范围 12–32，默认 18）；行距类 `compact/normal/loose` 挂在 `reader-pane` 上；正文字体类 `font-black/font-song/font-kai`（黑体/宋体/楷体）；页面宽度经 `--reader-width` 控制（auto/640/800/900/1000/1280）。

### 5.10 API 封装（api.js）

- `lookupDict(word)`、`chat({baseUrl, model, apiKey, messages})`；`ApiError` 带 `status/code`。
- 错误文案映射：`invalid_key`→“API Key 无效，请检查设置。”、`rate_limited`→“额度不足或限流…”、`timeout`→“请求超时…”。

### 5.11 首页与标注假名（2026-08-13）

- `HomeView.jsx`：`route === 'welcome'` 时渲染，替换旧 WelcomeView。侧栏（固定 240px）：Yuki Reader 文字 Logo、上传文件（↑，触发隐藏 file input）、使用说明（纯文字弹窗，讲点词/拖选/点句子空白处三种操作）、文件列表（内置书《こころ》+ `listUploadedBooks()` 已上传书，点击直接打开）、底部设置。
- 侧栏内部布局：Logo/导航/底部“设置”固定不滚动（`flex-shrink: 0`），只有文件列表区域 `overflow-y: auto`；侧栏可收起为 64px 图标栏（←/→ 按钮）。
- 滚动约束（仅首页）：`.app` 保持 `min-height: 100vh`（阅读页旧行为），首页额外加 `.app-home { height: 100vh; overflow: hidden }` + `.app-home .content { min-height: 0; overflow: hidden }`，`body` 去默认 margin；首页侧栏锚定不动、只有 `.home-main` 内部滚动。
- 阅读页布局：维持旧版（正文自然高度、整页滚动），右侧翻译栏 `position: sticky; top: var(--topbar-h)` 跟随视窗钉在右上方（已用无头 Edge + CDP 验证：`scrollY=3000` 时侧栏 top 仍为 54）；新结果出现时 App 会把侧栏 `scrollTop` 归零。
- 阅读页右侧栏：`position: sticky; top: var(--topbar-h)` 钉在视口右上方，新操作（点词/点句/拖选）时 App 自动把侧栏 `scrollTop` 归零，保证结果紧跟当前阅读视口可见。
- 主区（纵向滚动）：大圆角主卡（Hero 标题 + 副标题 + 点击/拖拽上传区，仅 TXT）+ 下方「无痛阅读「小说 & 论文」」四张功能卡 + 示例图占位框（图片待用户提供）。
- 上传校验：`App.handleUpload` 先校验扩展名/类型，非 TXT 弹 toast“请上传 TXT 文件”；上传成功后刷新书库列表。
- 顶栏精简：移除“内置书 / 上传 TXT / 我的书”按钮；品牌按钮点击回首页并刷新列表。
- 标注假名：`settings.showFurigana`（默认 true）；`Sentence.jsx` 对 `clickable && hasKanji(surface) && reading && reading !== surface` 的词渲染 `<ruby>`；`selectionHitsSingleWord` 改为优先比对 `data-surface`，兼容 ruby 后 textContent 含注音的情况。
- `lib/kana.js`：`toHiragana`（片假名 U+30A1–30F6 减 0x60，`ー` 不变）、`hasKanji`；`Sidebar.jsx` 词典卡读音显示前转平假名。

## 6. 后端

### 6.1 API 契约

`GET /api/dict?word=<词典原形>` → 200 `[{ surface, reading, pos, glosses: [string] }]`；未命中返回 `[]`；空/超长 word 返回 `[]`。

`POST /api/chat` 请求 `{ baseUrl, model, apiKey, messages:[{role,content}] }` → 200 `{ content }`；错误统一 `{ error: { code, message } }`：

| 场景 | HTTP | code |
| --- | --- | --- |
| 参数缺失/非法 | 400 | `bad_request` |
| Key 无效（上游 401/403） | 401 | `invalid_key` |
| 限流/额度（上游 429） | 429 | `rate_limited` |
| 上游超时 | 504 | `timeout` |
| 上游 5xx / 无法连接 | 502 | `network` / `upstream_error` |

畸形 JSON 由 `HttpMessageNotReadableException` 处理器返回 400（已修）。

`POST /api/tokenize` 请求 `{ sentences: [string] }`（1–50 句、单句 ≤2000 字符）→ 200 `{ rows: [[TokenRow,...],...] }`，与输入一一对应；参数非法/畸形 JSON → 400 `bad_request`。契约细节见 §13.3。

### 6.2 SQLite

- `dict_entries(id, seq, surface, reading, pos, glosses)`：每（表记 × 义项）一行；glosses 用 `\u001F` 分隔（不会与原文冲突）；查询 `surface = ? OR reading = ?`，surface 命中优先，LIMIT 60。
- `jmdict_meta(key, value)`：license/source/rows/imported_at。
- 索引在导入完成后创建（导入期不建索引更快）。

### 6.3 JMDict 导入器（JmdictImportService）

- StAX 流式解析；`SUPPORT_DTD=true`（JMdict_e 内部 DTD 声明实体）、外部实体关闭、`jdk.xml.entityExpansionLimit=5_000_000`（文件含约 21 万次实体引用，默认 64000 会炸）。
- 批量 2000 行插入；实测 63MB XML → 329,302 行约 36 秒。
- 首次启动自动导入：`JmdictInitRunner` 在库为空且 `yuki.jmdict.auto-import=true` 且 XML 存在时执行；测试环境用 `auto-import=false` 跳过。

### 6.4 配置（application.yml）

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `YUKI_DB_PATH` | `./data/yuki.db` | SQLite 路径 |
| `YUKI_JMDICT_XML` | `./data/jmdict/JMdict_e` | 词典 XML |
| `YUKI_JMDICT_AUTO_IMPORT` | `true` | 首次启动自动导入 |
| `YUKI_CHAT_TIMEOUT_SECONDS` | `60` | 上游超时 |

命令行：`--yuki.jmdict.import-only=true` 只导入后退出。端口 `server.port=8080`。CORS 仅放行开发用 localhost:5173。

## 7. 数据资产与脚本

- `scripts/fetch-kokoro.mjs`：抓取青空文库 773_14560.html（Shift_JIS）→ 去 ruby/标签 → 按“上/中/下 + 编号节”生成 110 章 → `frontend/public/books/kokoro.json`。支持 `--cached` 复用 `scripts/data/kokoro.html`。
- `scripts/download-jmdict.ps1`：从 `http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz` 下载解压到 `backend/data/jmdict/JMdict_e`（约 10MB 压缩 / 63MB XML）。脚本与 XML 均不入库（`backend/data`、`scripts/data` gitignored）。
- 署名：页脚 JMDict CC BY-SA 4.0 + 青空文庫（公有领域）。

## 8. 构建 / 运行 / 测试

```powershell
# 前端
npm --prefix frontend install
npm --prefix frontend test          # 51 用例
npm --prefix frontend run build     # 自动复制到 backend static

# 后端
mvn -f backend\pom.xml test         # 36 用例
mvn -f backend\pom.xml clean package  # fat jar

# 运行
$env:YUKI_DB_PATH = 'backend\data\yuki.db'; $env:YUKI_JMDICT_XML = 'backend\data\jmdict\JMdict_e'
java -jar backend\target\yuki-reader.jar   # http://localhost:8080

# 本地验收一键启停（jar + 假 LLM 上游 + PID 记录 + 健康检查）
powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1
powershell -ExecutionPolicy Bypass -File scripts\stop-local.ps1

# 开发模式
mvn -f backend\pom.xml spring-boot:run     # 8080
npm --prefix frontend run dev              # 5173，/api 代理到 8080
```

## 9. 已知问题 / 注意事项（新对话必读）

1. **Windows jar 文件锁**：服务运行中执行 `mvn package` 会因无法重命名 `yuki-reader.jar` 失败，先停服务。
2. **本 Codex 环境沙箱**：shell 命令以子目录为 workdir 时写入会被拒（报 EPERM），一律从仓库根运行（`npm --prefix`、`mvn -f`）；网络类命令需提权。
3. **控制台中文乱码**：仅显示层问题（UTF-8 字节被 GBK 解码），文件内容正常；需要可读日志时先 `chcp 65001`。
4. **jsdom 不支持 ES module**：无法直接加载生产 bundle，端到端用真实浏览器验证。仓库内验证脚本在 `scripts/data/`（gitignored）：`e2e-check.cjs`（jsdom 冒烟）、`cdp-e2e.cjs`（Edge headless + CDP，覆盖 §13.6 交互与 Network 断言）、`fake-upstream.js`（本地假 LLM 上游，端口 8123）。kuromoji 浏览器加载脚本已删除。
5. **集成测试命名**：`*Test`（而非 `*IT`），保证 surefire 在 `mvn test` 执行；`yuki.jmdict.auto-import=false` 已注入测试属性，避免测试触发真实大导入。
6. `backend/src/main/resources/static`、`backend/data`、`scripts/data` 均为生成/运行产物，gitignored；提交前端改动时不要误提交它们。`frontend/public/kuromoji-dict` 已不再生成。
7. 规格 §6 的判定规则以 DOM 结构为准：新 UI 改动不要破坏“词 span 阻止冒泡 / 选区恰好等于单 span / 非词区点整句”这三条。
8. **dev 模式分词（已解决）**：旧版浏览器端 kuromoji 在词典缺失时会导致“正在分词…”卡死；后端分词后该问题随 kuromoji 移除而消失，dev 模式只需先启动 8080 后端。
9. **沙箱内 `npm --prefix install` 不生效**：`npm --prefix frontend install` 会去当前目录找 package.json 而报 ENOENT（本 Codex 沙箱限制，与 npm 版本无关；用户终端/提权下正常，全局 npm 已升级到 11）。`run/test/build` 等命令正常；沙箱内安装依赖先 `cd frontend` 再 `npm install`。
10. **Maven `package` 不清理 target 残留**：resources 插件只复制不删除；若删除过 `src/main/resources` 下的目录（如 static/kuromoji-dict），需用 `clean package`，否则旧资源仍会被打进 jar。
11. **缺失静态资源返回 500（既有行为）**：`GlobalExceptionHandler` 的通用 Exception 处理器会把 `NoResourceFoundException`（Spring 默认 404）转成 500；改造后手动请求 `/kuromoji-dict/*` 会得到 500，前端已不再请求，无功能影响（§13 要求不改该处理器）。

## 10. 后续方向（按优先级）

1. **IndexedDB 持久化分词缓存**（规格内，§10 目前仅会话内存）：首次分词落库，重开书直接读，体感提升最大；后端仍为无状态 API，未做服务端缓存。
2. **Web Worker 分词**：已随 §13 后端分词取消，不再做。
3. **只分可见区域**：滚动视口优先分词，其余排队（渐进渲染的延伸）。
4. **超规格、需用户拍板**：Sudachi 后端分词（已否决，用户选 kuromoji-java，见 §13）、WASM 引擎替换 kuromoji（后端化后无意义）、预计算中文释义。

## 11. MVP 明确不做（规格 §2，勿擅自实现）

手机端适配与触摸；翻译缓存（本地/服务端）；竖排排版；账号体系/多人/云同步；预计算中文释义词库；生词本/收藏/标注。

> 变更记录：原清单中的“服务端分词（MeCab/Sudachi）”已于 2026-08-12 经用户批准改为后端分词（kuromoji-java，见 §13），并于当日实施完成。

## 12. 给新对话的开工建议

- 先跑通基线：`npm --prefix frontend test`（51 过）+ 起后端后 `npm --prefix frontend run dev` 手动看一遍。
- 只改前端时不必重打 jar；改完跑测试 + `npm run build`，需要交付再 `mvn package`。
- 规格冲突的需求先与用户确认，别擅自扩范围。
- **当前主线任务**：§13 后端分词改造已完成（2026-08-12）；后续可做 §10 的 IndexedDB 分词缓存。

---

## 13. 后端分词改造方案（2026-08-12 已批准，已完成）

> 本方案已于 2026-08-12 实施完成并验证；§1/§2/§3/§4/§5.4/§6.1/§8/§9/§10/§11/README/规格文档均已同步。实施偏差与验证结果见 §13.9。

### 13.1 决策记录

- 动机：分词不再放用户浏览器，改由服务器计算。
- 引擎：**kuromoji-java**（`com.atilika.kuromoji:kuromoji`）。用户已确认，不用 Sudachi。
- 范围：只移“形态素分词”；**编码检测、段落切分、分句仍在前端**（分句是纯字符串处理，句子边界需立即用于渐进渲染，见 §5.2）。
- 形态：无状态 API，不做服务端缓存；前端会话缓存与渐进分批保留。
- 规格变更：原 spec §1/§2/§3 明确“浏览器端分词、不做服务端分词”，本次为用户批准的变更；实施完成后在规格文档补一条变更说明（建议）。

### 13.2 改造后数据流

```
上传 txt / 打开内置书
  → 前端编码检测 → 分段落、分句（不变）
  → 按 12 句一批 POST /api/tokenize
  → 返回 token 数组 → 按“句子容器 + 词 span”渲染（不变）
点词      → GET  /api/dict（不变）
点句/拖选 → POST /api/chat（不变）
```

### 13.3 API 契约（最终）

`POST /api/tokenize`

- 请求：`{ "sentences": ["私は学生である。", ...] }`；批量 1–50 句，单句 ≤ 2000 字符。
- 成功 200：`{ "rows": [[ {surface, reading, basic, pos, clickable}, ...], ...] }`，`rows` 与 `sentences` 一一对应。
- 错误沿用现有风格：400 `{error:{code:"bad_request", message}}`；畸形 JSON 由现有 `HttpMessageNotReadableException` 处理器返回 400；内部错误 500。

`TokenRow` 字段与现前端一致：`surface`（原文表记）、`reading`（假名读音，无则回退 surface）、`basic`（词典原形，无则回退 surface）、`pos`（“词性・细类1・细类2”拼接，空段省略）、`clickable`（`false` 当且仅当 pos 以“記号”开头，或 surface 全为标点/空白，正则同现 `PUNCT_RE`）。

### 13.4 后端实现（新建 `backend/src/main/java/com/yukireader/tokenize/`）

- `pom.xml` 增加 `com.atilika.kuromoji:kuromoji-ipadic:0.9.0`（最新 0.9.x；注意 Central 上的 `com.atilika.kuromoji:kuromoji` 是 pom 聚合构件、不含类，实际依赖必须用 `kuromoji-ipadic`；词典随 jar 打包，jar 约 50MB，4C4G 无压力）。
- `TokenizerService`（`@Service`）：
  - 单例 `Tokenizer`（Atilika Tokenizer 构造后线程安全；**严禁每次请求 new**）。
  - 启动预热：`ApplicationRunner` 里 tokenize 一次“テスト”之类短句，避免首个请求冷启动慢。
  - `List<List<TokenRow>> tokenize(List<String> sentences)`：逐句 `tokenizer.tokenize`，映射
    `surface=getSurface()`、`reading=getReading()`（空则回退 surface）、`basic=getBaseForm()`（空则回退 surface）、
    `pos=拼接 getPartOfSpeechLevel1/2/3()`、`clickable` 按 13.3 规则。
- `TokenizeController`（`@RestController`，`POST /api/tokenize`）+ 校验（空 sentences、>50 句、单句 >2000 字符 → `bad_request`）。
- `TokenRequest` / `TokenRow` record；`GlobalExceptionHandler` 不需要改（`bad_request` 已有映射）。
- 单元测试 `TokenizerServiceTest`（真实词典）：`呼んで` → `basic=呼ぶ`、`reading=ヨン`；`私` → `reading=わたし`；标点/空白 token `clickable=false`；rows 与输入一一对应。
- 集成测试 `TokenizeControllerTest`（`@SpringBootTest` + MockMvc，沿用 `*Test` 命名、`@DynamicPropertySource` 设临时 DB + `yuki.jmdict.auto-import=false`）：200 形状；空数组/超批量/超长 400；畸形 JSON 400。

### 13.5 前端实现

- `api.js` 新增 `tokenizeSentences(sentences)` → `POST /api/tokenize`，返回 `rows`；失败抛 `ApiError`（沿用现有封装风格）。
- `tokenize.js` 重写（**对外签名保持不变**，ReaderView 不动）：
  - 删除 `loadTokenizer`、`wrapTokens`、`tokenizeSentence`、path 相关逻辑；
  - 保留 `sessionTokenCache`（会话内存缓存）、`prefetchChapter`；
  - `tokenizeChapter(bookId, chapterIndex, sentences, onProgress?)`：12 句一批调用 `tokenizeSentences`，每批 `onProgress(rows)` 后 `await setTimeout(0)` 让步；缓存命中直接回调。
- 删除项（全部）：`kuromoji` npm 依赖、`frontend/scripts/prepare-assets.mjs` 及其在 `package.json` dev/build 脚本里的引用、`frontend/src/shims/path.js`、`vite.config.js` 的 `path` 别名（含 VITEST 分支）、`frontend/public/kuromoji-dict/`（gitignored，删不删都行，但构建不再生成）、`scripts/data/kuromoji-browser-check.cjs` 与 e2e 相关脚本。
- 测试更新：`tokenize.test.js` 删除真实 kuromoji 用例与 `wrapTokens` 用例，改为 mock `api.tokenizeSentences` 的批处理/缓存/进度用例；`app.test.jsx` 的 tokenize 模块 mock 不变（已隔离）。
- 阅读器/句子/侧栏/设置/主题代码**不改**；`sentence-plain` 渐进降级逻辑保留（未返回批次的句子仍可整句翻译）。

### 13.6 验证与交付（完成标准）

1. `npm --prefix frontend test` 全绿（数量会变化，以实际为准）；`mvn -f backend\pom.xml test` 全绿（含新增 tokenize 用例）。
2. `npm --prefix frontend run build` + `mvn -f backend\pom.xml package` 成功；先停 8080 服务再打包（Windows 文件锁）。
3. 启动 jar：打开《こころ》→ 分词进度快速走完 → 点词查词典 → 点句翻译（可用本地假上游）→ 目录/方向键/主题/字号回归。
4. 浏览器 Network 确认**不再请求 `/kuromoji-dict/*`**；打包产物里不再含 `static/kuromoji-dict`。
5. 更新 README：技术栈、架构图、测试数、dev 说明（去掉词典生成步骤）、jar 体积说明。
6. 更新交接文档：§1/§3/§4/§5.4/§8/§9/§10/§11 与本节状态；规格文档补变更说明。

### 13.7 实施注意事项

- 本环境命令一律从仓库根运行（`npm --prefix`、`mvn -f backend\pom.xml`），子目录 workdir 写入会被沙箱拒绝；网络/提权命令需 `require_escalated`。
- `mvn package` 前先停占用 jar 的 java 进程。
- Atilika kuromoji 最新版本在 Maven Central 可查；优先用最新 0.9.x，若拉取失败换相邻版本。
- 后端测试继承现有约定：集成测试类名 `*Test`（surefire 执行）、临时 DB + `auto-import=false`，避免触发真实 JMDict 大导入。
- 控制台中文乱码仅显示层问题，不影响文件内容。

### 13.8 明确不做

服务端缓存/持久化分词结果；Web Worker（后端化后无意义）；Sudachi/WASM；预计算中文释义。

### 13.9 实施记录（2026-08-12）

- 依赖：`com.atilika.kuromoji:kuromoji-ipadic:0.9.0`（原因见 §13.4）。
- 读音：kuromoji-java 的 `getReading()` 返回片假名（私→ワタシ、呼ん→ヨン），与旧浏览器端 kuromoji.js 行为一致，未做平假名转换；§13.4 测试示例中的 `わたし` 为笔误，实际断言为 `ワタシ`。
- 校验错误复用 `ChatServiceException("bad_request", ...)`：现有 GlobalExceptionHandler 已有 `bad_request → 400` 映射，按 §13.4 要求未改处理器。
- 缺失静态资源（如手动请求 `/kuromoji-dict/*`）返回 500 而非 404，属 GlobalExceptionHandler 既有行为；前端已不请求，无功能影响，未改动。
- 验证结果：前端 41 用例、后端 36 用例（单元 21 + 集成 15）全绿；`npm run build` + `mvn clean package` 成功；jar 约 49.7MB，不含 `static/kuromoji-dict`；无头 Edge + CDP 端到端通过（分词/词典/翻译/主题/字号/目录/方向键），会话 0 个 `/kuromoji-dict` 请求。
- 环境备注：npm 10.8 的 `install --prefix` 不生效（改用 `cd frontend` 后 `npm install`）；Maven 需 `clean package` 清除 target 残留（见 §9.9–§9.10）。
