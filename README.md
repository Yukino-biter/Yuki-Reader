# Yuki Reader（MVP）

类似 MojiRead 的个人日语阅读 Web 应用：上传/打开 TXT、按句阅读、点词查词典（JMDict）、点句或拖选调用 LLM 翻译（BYOK）。实现范围严格按
[`docs/superpowers/specs/2026-08-11-yuki-reader-design.md`](docs/superpowers/specs/2026-08-11-yuki-reader-design.md) 第 2 节（MVP），规格中列出的“MVP 明确不做”事项均未实现。

首页为 Mooon 风格应用工作台（固定侧栏 + 滚动主区）：侧栏含上传文件、使用说明、文件列表（内置书 + 已上传书）与设置；正文支持可选的“标注假名”（含汉字词上方显示平假名，所有读音显示统一为平假名）。

> 2026-08-12 经用户批准，形态素分词已从浏览器端移到后端（kuromoji-java），实施细节见交接文档 §13；前端仍负责编码检测、段落切分与分句。

## 技术栈

- 前端：React 18 + Vite 5（编码检测、段落/分句、渲染与点词/点句/拖选交互；不执行分词）
- 后端：Spring Boot 3.5（Java 17）+ SQLite（xerial JDBC）+ kuromoji-java（`com.atilika.kuromoji:kuromoji-ipadic:0.9.0`，IPADIC 词典随 jar 打包）
- 打包：Maven 单 fat jar，VPS 单进程部署
- 外部 LLM：任意 OpenAI 兼容接口（DeepSeek / Kimi / GLM / OpenAI / OpenRouter / 自定义），Key 由用户自带

## 数据流

```
上传 txt / 打开内置书
  → 前端编码检测 → 分段落、分句
  → 按 12 句一批 POST /api/tokenize（后端 kuromoji-java 分词）
  → 返回 token 数组 → 按“句子容器 + 词 span”渲染
点词      → GET  /api/dict → 侧栏词典卡（中文释义优先，英文兜底）
点句/拖选 → POST /api/chat → 侧栏翻译卡
```

## 目录结构

```
frontend/                  React + Vite 前端
  src/lib/                 编码检测、分句、章节、后端分词调用、localStorage/IndexedDB 存储
  src/components/          阅读器、句子、侧栏、设置、书库
  public/books/kokoro.json 内置书《こころ》（青空文庫公有领域，由脚本生成）
  scripts/                 构建辅助（产物复制）
backend/                   Spring Boot 后端
  src/main/java/.../tokenize  /api/tokenize（kuromoji-java 分词服务 + 控制器）
  src/main/java/.../dict     /api/dict + SQLite 仓储 + JMDict 导入器
  src/main/java/.../chat     /api/chat 转发（不落库、不打日志）
  src/main/resources/static  前端构建产物（由 npm run build 复制，不入库）
scripts/
  fetch-kokoro.mjs         从青空文庫抓取并转换《こころ》
  download-jmdict.ps1      从 EDRDG 官方源下载 JMDict（约 50MB，不入库）
  translate-glosses.py     批量把 JMDict 英文释义翻译成中文并写回 yuki.db（BYOK，见下文）
```

## 构建与运行

### 前置要求

- Node.js 20+，npm 10+
- JDK 17，Maven 3.9+

### 1. 构建前端（产物自动复制到 `backend/src/main/resources/static`）

所有命令从仓库根目录运行：

```powershell
npm --prefix frontend install
npm --prefix frontend test          # 前端测试（41 用例）
npm --prefix frontend run build     # vite build + 复制产物到后端 static
```

> 在本 Codex 沙箱内 `npm --prefix frontend install` 会去当前目录找 package.json 而报
> `Could not read package.json`（沙箱限制，与 npm 版本无关；你的终端/提权下正常，
> 全局 npm 已升级到 11）。如遇报错，先 `cd frontend` 再执行 `npm install` 即可；
> `run/test/build` 等命令不受影响。

### 2. 下载 JMDict（一次性，可选但推荐）

词典数据来自官方源（CC BY-SA 4.0）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/download-jmdict.ps1
```

脚本下载 `JMdict_e.gz`（约 10MB 压缩 / 63MB XML）并解压到 `backend/data/jmdict/JMdict_e`。不执行本步时应用仍可启动，但词典查询返回空。

### 3. 打包后端 fat jar

```powershell
mvn -f backend\pom.xml clean package
```

产物：`backend/target/yuki-reader.jar`（约 50MB，含前端页面、kuromoji IPADIC 词典、内置书；不含浏览器端词典目录）。

> Windows 下服务运行时会锁住 jar 文件，`mvn package` 前先停掉占用进程。

### 4. 运行

本地验收可一键启停（会同时启动假 LLM 上游用于翻译验证）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1
powershell -ExecutionPolicy Bypass -File scripts\stop-local.ps1
```

脚本负责带引号启动、PID 记录与健康检查；Codex 沙箱内运行 `start-local.ps1` 需提权
（沙箱内启动长驻子进程会使命令挂起）。

```powershell
$env:YUKI_DB_PATH = 'D:\Personal Portfolio\Yuki Reader\backend\data\yuki.db'
$env:YUKI_JMDICT_XML = 'D:\Personal Portfolio\Yuki Reader\backend\data\jmdict\JMdict_e'
java -jar backend\target\yuki-reader.jar   # http://localhost:8080
```

首次启动（数据库为空且存在 `data/jmdict/JMdict_e`）会自动导入 JMDict 并校验内置书资源。之后访问 http://localhost:8080 。

也可在部署时先只做导入再退出：

```powershell
java -jar backend\target\yuki-reader.jar --yuki.jmdict.import-only=true
```

常用环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `YUKI_DB_PATH` | `./data/yuki.db` | SQLite 文件位置 |
| `YUKI_JMDICT_XML` | `./data/jmdict/JMdict_e` | JMDict XML 位置 |
| `YUKI_JMDICT_AUTO_IMPORT` | `true` | 首次启动自动导入 |
| `YUKI_CHAT_TIMEOUT_SECONDS` | `60` | 上游 LLM 请求超时 |

### 开发模式（热更新）

```powershell
# 终端 1（后端，必须先启动，分词 API 依赖它）
mvn -f backend\pom.xml spring-boot:run
# 终端 2（前端）
npm --prefix frontend run dev   # http://localhost:5173，/api 代理到 8080
```

> 分词由后端 `/api/tokenize` 完成，开发模式不再需要生成/复制任何词典目录。

## 测试（规格 §14）

- 前端：`npm --prefix frontend test` — 53 个用例
  - 编码检测（BOM/UTF-8 严格/SJIS/UTF-16/无法识别）
  - 分句规则（。！？…与闭括号、省略号连用）
  - 分词批处理/会话缓存/进度用例（mock 后端 API，不再加载真实 kuromoji 词典）
  - 阅读页渲染、点词/点句/拖选判定、侧栏状态切换冒烟
  - 词典卡中文释义优先 / 英文兜底 / 「中文释义」按钮隐藏规则
- 后端：`mvn -f backend\pom.xml test` — 38 个用例（单元 23 + 集成 15，集成测试类以 `*Test` 命名以便 surefire 执行）
  - `/api/dict` 集成测试（命中/读音命中/未命中/空词）
  - `/api/chat` 集成测试（成功/401/429/504/坏请求）
  - `/api/tokenize` 集成测试（成功/空数组/超批量/超长/畸形 JSON）
  - ChatService 错误映射、JMDict 导入器、仓储、TokenizerService（真实词典）单元测试

## 词典中文释义（预计算，2026-08-14）

点词后的词典卡默认显示中文释义：`dict_entries` 新增 `glosses_zh` 列（`\u001F` 分隔，与 `glosses` 义项一一对应），`GET /api/dict` 返回 `glossesZh` 数组；前端中文优先、缺失时英文兜底；某词所有义项都有中文时隐藏「中文释义」按钮（`dict-miss` 仍保留「用 LLM 解释这个词」）。

生成方式为一次性离线批处理：

```powershell
$env:YUKI_ZH_API_KEY = '<你的 Key>'
$env:YUKI_ZH_BASE_URL = 'https://api.xiaomimimo.com/v1'   # 默认即此值（小米 MiMo）
$env:YUKI_ZH_MODEL   = 'mimo-v2.5'   # 默认即此值；也可用其它 OpenAI 兼容模型
python scripts/translate-glosses.py
```

脚本从 `yuki.db` 抽取全部唯一英文释义（按 `\u001F` 拆条后去重，约 28 万条），并发调用 `/chat/completions` 翻译，进度断点存 `scripts/data/zh-checkpoint.json`（gitignored，可断点续跑），完成后回写 `dict_entries.glosses_zh`（与英文义项 1:1 对齐）并记录统计到 `jmdict_meta`（`zh_translated_at/zh_rows/zh_covered_rows`）。API Key 只经环境变量传入，不落盘、不进 git、不打日志。数据存于 `backend/data/yuki.db`（gitignored），部署时拷贝该 DB 或在服务器上运行脚本即可，jar 不含翻译数据。

> 2026-08-14 已全量跑完：27.85 万条唯一释义全部翻译成功，`dict_entries` 32.9 万行 100% 覆盖中文（默认模型 `mimo-v2.5`）。

## 部署（VPS 单进程）

1. 把 `backend/target/yuki-reader.jar` 与 `backend/data/`（含 `jmdict/JMdict_e`，或让服务器首次启动时自动导入）拷到服务器。
2. `java -jar yuki-reader.jar`（建议 1–2GB 内存，1 个进程，无需 Nginx 也可直接对外；如需域名可反代 8080）。
3. 首次启动自动导入 JMDict 到 SQLite，之后常驻运行。

## 安全约束（规格 §9、§4）

- API Key 只保存在浏览器 `localStorage`，请求经后端 `/api/chat` 转发。
- 后端不持久化 Key，不打日志（已通过日志检查验证：日志中无 apiKey/Authorization）。
- JMDict 解析时禁用外部实体（XML 实体仅来自文件内部 DTD）。

## 版权与署名

- JMDict / EDICT：CC BY-SA 4.0（[官方页](https://www.edrdg.org/jmdict/)），页面页脚署名。
- 《こころ》（夏目漱石）：青空文庫收录的公有领域文本（[原文页](https://www.aozora.gr.jp/cards/000148/files/773_14560.html)），页面页脚署名。
- 未打包任何商业出版物全文；个人版权书籍仅通过本地上传（IndexedDB）使用。

## 实现假设（规格未明确处）

- 章节：按“空行分隔 + 短标题行（一/二/上/中/下/第X章/纯数字/《》）”检测，检测不到则整书为一章；《こころ》用脚本按 上/中/下 + 编号节 显式生成 110 章。
- 句末标点：`。！？…` 后紧跟闭括号（`」』）〉》］】`）时并入本句；连续句末标点（如 `……。`）并入同一句；省略号按规格视为句末标点（句中 `……` 会切句）。
- 一次展示一章，进度 = 章节索引 + 章节内滚动百分比，存 localStorage。
- JMDict 导入为每（表记 × 义项）一行，英文释义按义项分组展示；中文释义为预计算列 `glosses_zh`，整组义项全部翻译成功才写入，否则前端英文兜底。
- `/api/chat` 透传 `{model, messages}`；`baseUrl` 自动补 `/chat/completions`（已以该后缀结尾则不重复追加）。
- `/api/tokenize`：请求 `{"sentences":[...]}`，批量 1–50 句、单句 ≤2000 字符；响应 `{"rows":[[TokenRow,...],...]}` 与输入一一对应；`TokenRow` 字段 `surface/reading/basic/pos/clickable`，`reading`/`basic` 缺失时回退 `surface`，`clickable=false` 仅当词性以“記号”开头或表面词全为标点/空白。
