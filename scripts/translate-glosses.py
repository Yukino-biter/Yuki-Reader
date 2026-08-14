"""Batch-translate JMDict English glosses into Chinese and store them in yuki.db.

Reads the individual English glosses stored in ``dict_entries.glosses``
(one U+001F-separated sense group per row), deduplicates them, translates each
via an OpenAI-compatible /chat/completions endpoint, checkpoints progress to a
JSON file, then writes ``dict_entries.glosses_zh`` for rows where every gloss
in the group was translated (Chinese parts joined with U+001F, 1:1 aligned).

Environment variables (API key is NEVER written to disk or logs):
    YUKI_ZH_API_KEY    required
    YUKI_ZH_BASE_URL   default https://api.xiaomimimo.com/v1
    YUKI_ZH_MODEL      default mimo-v2.5

Usage:
    python scripts/translate-glosses.py --limit 3 --skip-db   # smoke test
    python scripts/translate-glosses.py                       # full run
"""

import argparse
import concurrent.futures as futures
import json
import os
import random
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

SEP = "\u001F"
DEFAULT_DB = os.path.join("backend", "data", "yuki.db")
DEFAULT_CHECKPOINT = os.path.join("scripts", "data", "zh-checkpoint.json")
MAX_RETRIES = 5
REQUEST_TIMEOUT = 90

SYSTEM_PROMPT = (
    "你是日语词典释义翻译助手。用户会给出若干条日语词典的英文释义，每行一条，"
    "格式为「序号. 英文释义」。请把每条翻译成简洁准确的中文，按同样的格式输出"
    "「序号. 中文释义」，保持序号与输入一一对应，不要增删条目，不要输出任何其他内容。"
)


def configure_streams():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", default=DEFAULT_DB)
    p.add_argument("--limit", type=int, default=0,
                   help="翻译条数上限（0=全量；用于冒烟/子集）")
    p.add_argument("--batch-size", type=int, default=40)
    p.add_argument("--concurrency", type=int, default=8)
    p.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT)
    p.add_argument("--skip-db", action="store_true",
                   help="只翻译并写检查点，不回写数据库（冒烟用）")
    return p.parse_args()


def load_checkpoint(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_checkpoint(path, data):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def build_request(base_url, model, glosses):
    lines = "\n".join(f"{i + 1}. {g.replace(chr(10), ' ').strip()}"
                      for i, g in enumerate(glosses))
    endpoint = base_url.rstrip("/")
    if not endpoint.endswith("/chat/completions"):
        endpoint += "/chat/completions"
    body = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": lines},
        ],
    }
    return endpoint, json.dumps(body, ensure_ascii=False).encode("utf-8")


def parse_response(content, glosses):
    """Return list of Chinese glosses matching ``glosses`` length."""
    text = content.strip()
    if text.startswith("```"):
        text = "\n".join(text.splitlines()[1:])
        if text.endswith("```"):
            text = text[:-3]
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    numbered = {}
    for ln in lines:
        parts = ln.split(" ", 1)
        if len(parts) == 2 and parts[0].rstrip(".").lstrip("．、:：").isdigit():
            idx = int(parts[0].strip(".").strip("．、:：")) - 1
            numbered[idx] = parts[1].strip()
    if all(i in numbered for i in range(len(glosses))):
        return [numbered[i] for i in range(len(glosses))]
    if len(lines) == len(glosses):
        return lines
    raise ValueError(f"响应行数 {len(lines)} != 期望 {len(glosses)}")


def call_api(endpoint, body, api_key):
    req = urllib.request.Request(
        endpoint, data=body, method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        })
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    content = data["choices"][0]["message"]["content"]
    usage = data.get("usage") or {}
    return content, usage


def translate_batch(glosses, endpoint, body, api_key):
    """One batch with retries; returns (glosses, zh_list, usage)."""
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            content, usage = call_api(endpoint, body, api_key)
            return glosses, parse_response(content, glosses), usage
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise RuntimeError("API Key 无效（401），请检查 YUKI_ZH_API_KEY") from e
            last_err = f"HTTP {e.code}"
            if e.code == 429 or e.code >= 500:
                time.sleep(min(30, 2 ** attempt) + random.uniform(0, 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as e:
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(min(30, 2 ** attempt) + random.uniform(0, 1))
    raise RuntimeError(f"批次重试 {MAX_RETRIES} 次仍失败: {last_err}")


def write_back(db_path, translation_map, skip):
    if skip:
        return None, None
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        rows = conn.execute(
            "SELECT id, glosses FROM dict_entries WHERE glosses != ''").fetchall()
        covered = 0
        total = len(rows)
        batch = []
        for rid, glosses in rows:
            parts = glosses.split(SEP)
            zh = [translation_map.get(pt) for pt in parts]
            if all(zh):
                batch.append((SEP.join(zh), rid))
                covered += 1
            else:
                batch.append(("", rid))
            if len(batch) >= 2000:
                conn.executemany(
                    "UPDATE dict_entries SET glosses_zh = ? WHERE id = ?", batch)
                batch.clear()
        if batch:
            conn.executemany(
                "UPDATE dict_entries SET glosses_zh = ? WHERE id = ?", batch)
        conn.commit()
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO jmdict_meta (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            ("zh_translated_at", now))
        for k, v in (("zh_rows", str(total)), ("zh_covered_rows", str(covered))):
            conn.execute(
                "INSERT INTO jmdict_meta (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (k, v))
        conn.commit()
        return total, covered
    finally:
        conn.close()


def main():
    configure_streams()
    args = parse_args()
    api_key = os.environ.get("YUKI_ZH_API_KEY", "").strip()
    if not api_key:
        sys.exit("缺少环境变量 YUKI_ZH_API_KEY")
    base_url = os.environ.get("YUKI_ZH_BASE_URL", "https://api.xiaomimimo.com/v1").strip()
    model = os.environ.get("YUKI_ZH_MODEL", "mimo-v2.5").strip()

    conn = sqlite3.connect(args.db)
    try:
        rows = conn.execute(
            "SELECT glosses FROM dict_entries WHERE glosses != ''").fetchall()
        glosses = sorted({g for row in rows for g in row[0].split(SEP) if g})
    finally:
        conn.close()
    if args.limit > 0:
        glosses = glosses[: args.limit]

    checkpoint = load_checkpoint(args.checkpoint)
    todo = [g for g in glosses if g not in checkpoint]
    print(f"模型: {model}  端点: {base_url}/chat/completions")
    print(f"唯一英文释义: {len(glosses)}  已完成: {len(glosses) - len(todo)}  待翻译: {len(todo)}")
    if not todo:
        print("检查点已覆盖全部目标，跳过翻译，直接回写。")
        total, covered = write_back(args.db, checkpoint, args.skip_db)
        if total is not None:
            print(f"回写完成: 共 {total} 行，覆盖中文 {covered} 行")
        return

    batches = [todo[i:i + args.batch_size] for i in range(0, len(todo), args.batch_size)]
    done = 0
    failed = 0
    start = time.time()
    last_save = time.time()
    usage_total = {"prompt_tokens": 0, "completion_tokens": 0}

    with futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        pending = {pool.submit(translate_batch, b,
                               *build_request(base_url, model, b), api_key): b
                   for b in batches}
        for fut in futures.as_completed(pending):
            try:
                gloss_batch, zh_batch, usage = fut.result()
                for g, z in zip(gloss_batch, zh_batch):
                    checkpoint[g] = z
                done += len(gloss_batch)
                usage_total["prompt_tokens"] += usage.get("prompt_tokens", 0)
                usage_total["completion_tokens"] += usage.get("completion_tokens", 0)
            except Exception as e:  # noqa: BLE001 - keep the run going
                failed += len(pending[fut])
                print(f"[失败] {e}", file=sys.stderr)
            if time.time() - last_save > 30:
                save_checkpoint(args.checkpoint, checkpoint)
                last_save = time.time()
            elapsed = time.time() - start
            rate = done / elapsed if elapsed > 0 else 0
            eta = (len(todo) - done) / rate / 60 if rate > 0 else 0
            print(f"进度: {done}/{len(todo)}  失败: {failed}  "
                  f"速率: {rate:.1f} 条/秒  预计剩余: {eta:.0f} 分钟")

    save_checkpoint(args.checkpoint, checkpoint)
    elapsed = time.time() - start
    print(f"\n翻译完成: 成功 {done}，失败 {failed}，耗时 {elapsed / 60:.1f} 分钟")
    if usage_total["prompt_tokens"]:
        print(f"token 用量: 输入 {usage_total['prompt_tokens']:,}，"
              f"输出 {usage_total['completion_tokens']:,}")

    total, covered = write_back(args.db, checkpoint, args.skip_db)
    if total is not None:
        print(f"回写完成: 共 {total} 行，覆盖中文 {covered} 行")
    else:
        print("已跳过数据库回写（--skip-db）。")
    if failed:
        sys.exit(f"有 {failed} 条翻译失败（未写入检查点，重跑会自动重试）")


if __name__ == "__main__":
    main()
