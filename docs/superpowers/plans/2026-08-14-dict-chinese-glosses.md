# 词典中文释义（预计算）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把点词后词典卡的英文释义默认改成中文：离线批量翻译 JMDict 释义并存入 SQLite，`/api/dict` 与前端按中文优先展示。

**Architecture:** 新增 Python 批量翻译脚本（标准库，读 yuki.db、调 OpenAI 兼容接口、断点续跑、回写 `glosses_zh` 列）；后端 `dict_entries` 加列并让 `/api/dict` 返回 `glossesZh`；前端词典卡中文优先、英文兜底，全部有中文时隐藏「中文释义」按钮。

**Tech Stack:** Python 3.14（脚本，stdlib only）、Java 17 / Spring Boot / SQLite（后端）、React 18（前端）、LLM：dsv4flash（BYOK，DeepSeek 兼容接口）。

---

## 任务与文件总览

| 任务 | 文件 |
| --- | --- |
| 1 后端 schema/API | `backend/src/main/java/com/yukireader/dict/DictEntry.java`、`JmdictRepository.java`；测试 `DictControllerTest.java`、`JmdictRepositoryTest.java` |
| 2 翻译脚本 | `scripts/translate-glosses.py` |
| 3 前端展示 | `frontend/src/components/Sidebar.jsx`、`HomeView.jsx`；测试 `frontend/src/__tests__/app.test.jsx` |
| 4 数据批处理 | 跑脚本（冒烟 + 全量，后台） |
| 5 文档/交付 | `README.md`、交接文档（本地）、本文档状态 |

---

### Task 1: 后端 `dict_entries` 增加 `glosses_zh` 并返回 `glossesZh`

**Files:**
- Modify: `backend/src/main/java/com/yukireader/dict/DictEntry.java`
- Modify: `backend/src/main/java/com/yukireader/dict/JmdictRepository.java`
- Modify: `backend/src/test/java/com/yukireader/dict/DictControllerTest.java`
- Modify: `backend/src/test/java/com/yukireader/dict/JmdictRepositoryTest.java`

- [ ] **Step 1: 写失败测试**（仓库 zh 往返 + 控制器返回 `glossesZh`）

`JmdictRepositoryTest` 新增：

```java
@Test
void findByWordReturnsChineseGlossesWhenPresent() {
    repository.batchInsert(List.<Object[]>of(new Object[]{
            "1000010", "私", "わたし", "名詞", "I; myself"}));
    jdbc.update("UPDATE dict_entries SET glosses_zh = ? WHERE surface = ?",
            "我；我自己", "私");

    DictEntry entry = repository.findByWord("私").get(0);
    assertThat(entry.glossesZh()).containsExactly("我；我自己");
}
```

（`jdbc` 为 `@BeforeEach` 中创建的 `JdbcTemplate`，需提升为字段。）

`DictControllerTest.wordHitReturnsEntries` 增加断言：

```java
.andExpect(jsonPath("$[0].glossesZh").isArray())
.andExpect(jsonPath("$[0].glossesZh").isEmpty());
```

- [ ] **Step 2: 跑测试确认失败**（`glossesZh` 字段不存在 / 断言空数组失败）
- [ ] **Step 3: 实现**

`DictEntry.java`：

```java
public record DictEntry(String surface, String reading, String pos,
                        List<String> glosses, List<String> glossesZh) {
}
```

`JmdictRepository.java`：
- `initSchema` 的 `CREATE TABLE` 增加 `glosses_zh TEXT NOT NULL DEFAULT ''`，并在其后调用 `ensureGlossesZhColumn()`：

```java
private void ensureGlossesZhColumn() {
    List<String> cols = jdbc.query("PRAGMA table_info(dict_entries)",
            (rs, n) -> rs.getString("name"));
    if (!cols.contains("glosses_zh")) {
        jdbc.execute("ALTER TABLE dict_entries ADD COLUMN glosses_zh TEXT NOT NULL DEFAULT ''");
    }
}
```

- mapper 改为 `new DictEntry(..., splitGlosses(rs.getString("glosses_zh")))`；
- `findByWord` 的 SELECT 改为 `SELECT surface, reading, pos, glosses, glosses_zh FROM dict_entries ...`。

- [ ] **Step 4: 跑测试确认通过**：`mvn -f backend\pom.xml test`（预期全绿）
- [ ] **Step 5: 提交** `feat: 词典返回中文释义（glossesZh）`

---

### Task 2: 批量翻译脚本

**Files:**
- Create: `scripts/translate-glosses.py`

- [ ] **Step 1: 实现脚本**（关键逻辑见下；完整代码在脚本文件内）

```python
# 环境变量：YUKI_ZH_API_KEY（必填）、YUKI_ZH_BASE_URL（默认 https://api.deepseek.com）、
# YUKI_ZH_MODEL（默认 dsv4flash）
# 参数：--db（默认 backend/data/yuki.db）、--limit N（0=全量）、--batch-size（默认 40）、
#       --concurrency（默认 8）、--checkpoint（默认 scripts/data/zh-checkpoint.json）、
#       --skip-db（只翻译不写库，用于冒烟）
```

流程：
1. 读出全部行 `glosses`，按 `\u001F` 拆成单条释义后去重（约 27.9 万条），应用 `--limit`。
2. 载入 checkpoint JSON（`{英文释义: 中文释义}`），跳过已翻译。
3. `ThreadPoolExecutor` 并发 POST `{baseUrl}/chat/completions`，body 含 `model/messages/temperature=0`；429/5xx/超时指数退避重试 5 次；401 立即失败。
4. 解析响应：优先按 `^\s*(\d+)\s*[.．、:：]\s*(.+)$` 序号映射；行数相等则按序 zip；否则整批重试。
5. 每完成一批写入 checkpoint；完成后回写 DB：
   - 每行按 `\u001F` 拆分 glosses，逐条查翻译；**全部命中**才拼接 `glosses_zh`（`\u001F` 连接），否则空串；
   - `executemany` 分批 `UPDATE dict_entries SET glosses_zh=? WHERE id=?`；
   - `jmdict_meta` 写入 `zh_model/zh_translated_at/zh_rows/zh_covered_rows`。
6. 进度日志：完成数/总数、速率、ETA。API Key 不打印、不落盘。

- [ ] **Step 2: 冒烟**：`python scripts/translate-glosses.py --limit 3 --skip-db`（提权联网），预期打印 3 条中文。
- [ ] **Step 3: 提交** `feat: 新增 JMDict 释义批量汉化脚本`

---

### Task 3: 前端词典卡中文优先

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/components/HomeView.jsx`
- Modify: `frontend/src/__tests__/app.test.jsx`

- [ ] **Step 1: 写失败测试**（`app.test.jsx` 新增用例）

```js
it('shows precomputed Chinese glosses and hides the translate button', async () => {
  lookupDict.mockResolvedValue([{ surface: '私', reading: 'わたし', pos: '名詞',
    glosses: ['I; myself'], glossesZh: ['我；我自己'] }]);
  await openBuiltInBook();
  await userEvent.click(screen.getAllByTestId('word-span')[0]);
  expect(await screen.findByText('我；我自己')).toBeInTheDocument();
  expect(screen.queryByText('I; myself')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '中文释义' })).not.toBeInTheDocument();
});

it('falls back to English glosses when no Chinese exists', async () => {
  lookupDict.mockResolvedValue([{ surface: '私', reading: 'わたし', pos: '名詞',
    glosses: ['I; myself'], glossesZh: [] }]);
  await openBuiltInBook();
  await userEvent.click(screen.getAllByTestId('word-span')[0]);
  expect(await screen.findByText('I; myself')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '中文释义' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试确认失败**（旧实现没有 `glossesZh` 字段）
- [ ] **Step 3: 实现**

`Sidebar.jsx` 词典卡正文改为：

```jsx
{entry.glosses.map((g, j) => {
  const zh = entry.glossesZh?.[j];
  return <span key={j} className={zh ? 'dict-gloss zh' : 'dict-gloss'}>{zh || g}</span>;
})}
```

词典卡末尾按钮改为：

```jsx
{!state.entries.every((e) => e.glossesZh && e.glossesZh.length === e.glosses.length) && (
  <ChineseBlock state={state.chinese} onRun={onChinese} runLabel="中文释义" />
)}
```

`HomeView.jsx` 说明文案：`（含读音、词性和英文释义，可一键翻译成中文）` → `（含读音、词性和中文释义）`。

- [ ] **Step 4: 跑测试确认通过**：`npm --prefix frontend test`
- [ ] **Step 5: 提交** `feat: 词典卡中文释义优先展示`

---

### Task 4: 数据批处理（全量）

- [ ] **Step 1:** 后台启动全量翻译（`Start-Process -WindowStyle Hidden`，env 传 Key，日志到 `scripts/data/zh-translate.log(.err)`）。
- [ ] **Step 2:** 轮询日志直至完成；抽查《こころ》常见词（私/学生/呼ぶ/心…）中文释义合理。
- [ ] **Step 3:** 核对 `jmdict_meta` 统计与覆盖行数。

---

### Task 5: 文档与交付

- [ ] **Step 1:** `README.md` 数据流/API/部署补充 `glossesZh` 与汉化脚本说明。
- [ ] **Step 2:** 更新本地交接文档（§2/§5.6/§6.1/§10/§11 状态）。
- [ ] **Step 3:** 全量回归：`npm --prefix frontend test` + `mvn -f backend\pom.xml test`；如交付产物则 `npm run build` + `mvn clean package`（先停 java）。
- [ ] **Step 4:** 提交代码与文档（不含密钥/数据/检查点）。
