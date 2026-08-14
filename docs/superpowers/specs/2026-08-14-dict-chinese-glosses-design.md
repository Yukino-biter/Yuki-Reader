# Yuki Reader 词典中文释义（预计算）设计

- 日期：2026-08-14
- 状态：已批准（方案 A，用户 2026-08-14 选定）
- 关联：`docs/superpowers/specs/2026-08-11-yuki-reader-design.md`（规格 §7 词典）、交接文档 §10/§11

## 1. 目标

点词后词典卡**默认显示中文释义**，替代当前"默认显示 JMDict 英文释义 + 手动点『中文释义』按钮用 LLM 翻译一次"的体验。仓库首个提交标题"词典汉化版"即立项目标；规格与交接文档将"预计算中文释义"列为后续方向（需用户拍板），本设计即该决策的实施。

## 2. 决策

1. **数据来源**：以现有 JMDict 英文释义为原文，用 LLM 批量离线翻译，结果存回 SQLite。JMDict 为 CC BY-SA 4.0，页脚署名已覆盖派生翻译内容。
2. **翻译模型**：初选 DeepSeek `dsv4flash`（实测官方名为 `deepseek-v4-flash`），2026-08-14 因 token 消耗改用小米 MiMo `mimo-v2.5`（`https://api.xiaomimimo.com/v1`）；走 OpenAI 兼容 `/chat/completions`；API Key 只经环境变量传入脚本，不落盘、不进 git、不打日志。
3. **翻译单元**：`dict_entries.glosses` 中**逐条英文释义**（`\u001F` 分隔后去重，27.9 万条），保证中文与英文义项 1:1 对齐（`glosses_zh` 同样用 `\u001F` 连接）。
4. **存储**：`dict_entries` 新增 `glosses_zh TEXT NOT NULL DEFAULT ''`（`\u001F` 分隔中文释义）。**整组义项全部翻译成功才写入**，否则留空（前端英文兜底）。老库通过 `PRAGMA table_info` 检查后 `ALTER TABLE` 迁移，幂等。
5. **API**：`GET /api/dict` 每项新增 `glossesZh: [string]`（可为空数组）；`glosses`（英文）保留用于兜底。向后兼容。
6. **前端**：词典卡中文优先；某义项组无中文时整组显示英文兜底；该词所有义项组都有中文时隐藏「中文释义」按钮；`dict-miss` 保留「用 LLM 解释这个词」。
7. **脚本**：`scripts/translate-glosses.py`（Python 3 标准库：`sqlite3` + `urllib` + `concurrent.futures`；本机 Node 20 无 `node:sqlite`，避免引入原生依赖）：抽唯一英文释义 → 分批翻译 → 断点续跑（`scripts/data/zh-checkpoint.json`，gitignored）→ 回写 DB。
8. **部署**：翻译结果在 `backend/data/yuki.db`（gitignored、不打进 jar）；服务器可拷贝 DB 或在服务器上运行脚本；jar 只含代码。

## 3. 数据流

```
点词 → GET /api/dict → 词条含 glossesZh → 词典卡显示中文（缺失回退英文）
```

翻译流水线（一次性离线）：

```
yuki.db 抽唯一英文释义（逐条）
  → 分批 POST /chat/completions（dsv4flash，并发 8，429/5xx 退避重试）
  → 断点文件 zh-checkpoint.json（每批落盘）
  → 回写 dict_entries.glosses_zh（整组义项齐全才写）+ jmdict_meta 统计
```

## 4. 验收标准

- 后端：schema 迁移幂等（新库/老库均可）；`/api/dict` 返回 `glossesZh`；`mvn test` 全绿。
- 前端：有中文时显示中文、无中文时英文兜底；按钮隐藏/保留规则正确；`npm test` 全绿。
- 数据：全量翻译跑完后抽查《こころ》常见词；`jmdict_meta` 记录模型、时间、覆盖行数。
- 文档：README、交接文档同步（数据流、API 契约、部署说明）。

## 5. 明确不做

- 运行时逐词自动翻译 + IndexedDB 缓存（方案 C，仅留现有手动按钮兜底）。
- 英文释义显隐开关（英文仅作兜底展示）。
- 替换词典数据源（方案 B，无可用的干净许可开源中日词典）。
- 翻译句子/段落（属 `/api/chat` 职责）。
