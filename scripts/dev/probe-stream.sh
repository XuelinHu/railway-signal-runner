#!/usr/bin/env bash
# 流式探针：注册临时账号 → 发起一次对话 → 把原始 NDJSON 帧落盘并打印控制帧。
# 用法：./scripts/dev/probe-stream.sh <BASE> [MODEL]
set -uo pipefail

BASE="${1:-http://127.0.0.1:8038}"
MODEL="${2:-qwen3:14b}"
U="probe$(date +%s)"
OUT="${OUT:-/tmp/rsr-probe-stream.txt}"

curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U\",\"password\":\"Passw0rd123\"}" >/dev/null

TK="$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U\",\"password\":\"Passw0rd123\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken",""))')"

if [ -z "$TK" ]; then echo "登录失败，无法继续"; exit 1; fi

curl -sN -X POST "$BASE/api/ai/chat" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TK" \
  -d "{\"model\":\"$MODEL\",\"message\":\"你好\"}" \
  --max-time 180 > "$OUT" 2>&1

echo "base=$BASE  帧数=$(wc -l < "$OUT")  文件=$OUT"
echo "--- 前 2 帧 ---"
head -2 "$OUT"
echo "--- 控制帧（__railway）---"
grep '__railway' "$OUT" || echo "（无控制帧）"
echo "--- 最后一帧 ---"
tail -1 "$OUT"
