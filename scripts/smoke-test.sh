#!/usr/bin/env bash
# 接口冒烟测试：覆盖账号全流程、分页、流式对话。
#
# 用法：./scripts/smoke-test.sh [API_BASE]
# 默认 API_BASE=http://127.0.0.1:8038

set -uo pipefail

BASE="${1:-http://127.0.0.1:8038}"
PASS=0
FAIL=0
STAMP="$(date +%s)"
STUDENT="stu${STAMP}"
# 每轮用独立的管理员账号。登录接口按账号限流（10 次 / 15 分钟），
# 若反复用内置 admin 账号跑测试，几轮之后桶就满了，之后全是 429。
ADMIN_USER="smokeadm${STAMP}"
ADMIN_PASS='SmokeAdmin12345'

# 每次运行伪装成一个不同的客户端 IP，以免上一轮跑出的限流计数把下一轮挡掉。
# 这不是作弊：服务端 getClientIp() 本就优先读 x-forwarded-for，线上由 FRP 注入真实来源 IP。
# 用 $RANDOM 而不是时间戳：秒级时间戳在连续两次运行时可能撞车，那样两轮会共用同一个限流桶。
FAKE_IP="10.$(( RANDOM % 256 )).$(( RANDOM % 256 )).$(( (RANDOM % 200) + 1 ))"

say()  { printf '\n\033[36m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }

# 断言响应里包含某个字段值
expect() { # expect <描述> <json> <jq表达式> <期望值>
  local desc="$1" json="$2" expr="$3" want="$4"
  local got
  got="$(printf '%s' "$json" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    v = d
    for part in '''$expr'''.split('.'):
        if part == '': continue
        v = v[int(part)] if isinstance(v, list) else v.get(part)
        if v is None: break
    print('' if v is None else v)
except Exception:
    print('')
" 2>/dev/null)"
  if [ "$got" = "$want" ]; then ok "$desc"; else bad "$desc（期望 $want，实际 '$got'）"; fi
}

post() { curl -s -X POST "$BASE$1" -H 'Content-Type: application/json' -H "X-Forwarded-For: $FAKE_IP" -d "$2" ${3:+-H "Authorization: Bearer $3"}; }
get()  { curl -s "$BASE$1" -H "X-Forwarded-For: $FAKE_IP" ${2:+-H "Authorization: Bearer $2"}; }

say "1. 健康检查"
HEALTH="$(get /api/health)"
expect "服务健康" "$HEALTH" "ok" "True"
expect "数据库连通" "$HEALTH" "database.ok" "True"
expect "Ollama 连通" "$HEALTH" "ollama.ok" "True"

say "2. 准备测试管理员"
SEED_OUT="$(node scripts/seed-admin.mjs --username "$ADMIN_USER" --password "$ADMIN_PASS" 2>&1)"
if printf '%s' "$SEED_OUT" | grep -q "已创建"; then ok "管理员 $ADMIN_USER 已创建"; else bad "管理员创建失败：$SEED_OUT"; fi

say "3. 注册"
REG="$(post /api/auth/register "{\"username\":\"$STUDENT\",\"password\":\"Passw0rd123\",\"displayName\":\"测试学生\"}")"
expect "注册成功" "$REG" "ok" "True"
expect "默认角色为学生" "$REG" "user.role" "student"

DUP="$(post /api/auth/register "{\"username\":\"$STUDENT\",\"password\":\"Passw0rd123\"}")"
expect "重复用户名被拒" "$DUP" "code" "username_taken"

WEAK="$(post /api/auth/register "{\"username\":\"weak${STAMP}\",\"password\":\"123\"}")"
expect "弱密码被拒" "$WEAK" "ok" "False"

say "4. 登录"
LOGIN="$(post /api/auth/login "{\"username\":\"$STUDENT\",\"password\":\"Passw0rd123\"}")"
expect "登录成功" "$LOGIN" "ok" "True"
TOKEN="$(printf '%s' "$LOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)"
REFRESH="$(printf '%s' "$LOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin).get('refreshToken',''))" 2>/dev/null)"
[ -n "$TOKEN" ] && ok "拿到访问令牌" || bad "未拿到访问令牌"
[ -n "$REFRESH" ] && ok "拿到刷新令牌" || bad "未拿到刷新令牌"

BADPW="$(post /api/auth/login "{\"username\":\"$STUDENT\",\"password\":\"WrongPass123\"}")"
expect "错误密码被拒" "$BADPW" "code" "bad_credentials"

say "5. 当前用户"
ME="$(get /api/auth/me "$TOKEN")"
expect "凭令牌取用户" "$ME" "user.username" "$STUDENT"

NOAUTH="$(get /api/auth/me)"
expect "无令牌被拒" "$NOAUTH" "code" "login_required"

say "6. 令牌刷新与轮换"
REF="$(post /api/auth/refresh "{\"refreshToken\":\"$REFRESH\"}")"
expect "刷新成功" "$REF" "ok" "True"
NEW_TOKEN="$(printf '%s' "$REF" | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)"
NEW_REFRESH="$(printf '%s' "$REF" | python3 -c "import sys,json;print(json.load(sys.stdin).get('refreshToken',''))" 2>/dev/null)"

REUSE="$(post /api/auth/refresh "{\"refreshToken\":\"$REFRESH\"}")"
expect "旧刷新令牌重放被检出" "$REUSE" "code" "refresh_token_reused"
# 重放会吊销整个令牌家族，所以新令牌也应失效
AFTER="$(post /api/auth/refresh "{\"refreshToken\":\"$NEW_REFRESH\"}")"
expect "令牌家族已整体吊销" "$AFTER" "ok" "False"

say "7. 修改密码"
CHGPW="$(post /api/users/me/password "{\"currentPassword\":\"Passw0rd123\",\"newPassword\":\"NewPass456\"}" "$NEW_TOKEN")"
expect "改密成功" "$CHGPW" "ok" "True"

OLDLOGIN="$(post /api/auth/login "{\"username\":\"$STUDENT\",\"password\":\"Passw0rd123\"}")"
expect "旧密码失效" "$OLDLOGIN" "code" "bad_credentials"

NEWLOGIN="$(post /api/auth/login "{\"username\":\"$STUDENT\",\"password\":\"NewPass456\"}")"
expect "新密码可登录" "$NEWLOGIN" "ok" "True"

say "8. 失败锁定"
LOCKUSER="lock${STAMP}"
post /api/auth/register "{\"username\":\"$LOCKUSER\",\"password\":\"Passw0rd123\"}" > /dev/null
for _ in 1 2 3 4 5; do
  post /api/auth/login "{\"username\":\"$LOCKUSER\",\"password\":\"BadPass999\"}" > /dev/null
done
LOCKED="$(post /api/auth/login "{\"username\":\"$LOCKUSER\",\"password\":\"Passw0rd123\"}")"
expect "连续失败后锁定" "$LOCKED" "code" "account_locked"

say "9. 管理员登录与分页"
ALOGIN="$(post /api/auth/login "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")"
if [ "$(printf '%s' "$ALOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin).get('ok'))" 2>/dev/null)" != "True" ]; then
  printf '  \033[33m·\033[0m 登录响应：%s\n' "$(printf '%s' "$ALOGIN" | head -c 300)"
fi
expect "管理员登录" "$ALOGIN" "ok" "True"
ATOKEN="$(printf '%s' "$ALOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)"

FORBIDDEN="$(get /api/admin/users "$TOKEN")"
expect "普通学生被拒绝访问管理台" "$FORBIDDEN" "code" "role_forbidden"

for ep in "users" "login-logs" "audit-logs" "scenes" "records" "conversations" "ai-logs" "reset-tokens"; do
  R="$(get "/api/admin/$ep?page=1&pageSize=5" "$ATOKEN")"
  expect "分页接口 /api/admin/$ep" "$R" "ok" "True"
  expect "  含每页条数" "$R" "pageSize" "5"
done

P2="$(get "/api/admin/users?page=2&pageSize=2" "$ATOKEN")"
expect "第 2 页页码正确" "$P2" "page" "2"
expect "第 2 页条数正确" "$P2" "pageSize" "2"

SORTED="$(get "/api/admin/users?page=1&pageSize=5&sort=username&order=asc" "$ATOKEN")"
expect "排序参数生效" "$SORTED" "ok" "True"

INJECT="$(get "/api/admin/users?sort=id;DROP%20TABLE%20users--" "$ATOKEN")"
expect "排序注入被白名单拦截" "$INJECT" "ok" "True"

say "10. 解锁与重置链接"
UNLOCK="$(post "/api/admin/users/$(get "/api/admin/users?q=$LOCKUSER" "$ATOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['items'][0]['id'] if d.get('items') else '')" 2>/dev/null)/unlock" '{}' "$ATOKEN")"
expect "管理员解锁成功" "$UNLOCK" "ok" "True"

# 注意变量名不能叫 UID：那是 bash 的只读变量。
TARGET_ID="$(get "/api/admin/users?q=$STUDENT" "$ATOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['items'][0]['id'] if d.get('items') else '')" 2>/dev/null)"
RESETLINK="$(post "/api/admin/users/$TARGET_ID/reset-password" '{}' "$ATOKEN")"
expect "生成重置链接" "$RESETLINK" "ok" "True"
RTOKEN="$(printf '%s' "$RESETLINK" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null)"

RESET="$(post /api/auth/reset-password "{\"token\":\"$RTOKEN\",\"newPassword\":\"Reset7890\"}")"
expect "用重置令牌改密" "$RESET" "ok" "True"

RESETLOGIN="$(post /api/auth/login "{\"username\":\"$STUDENT\",\"password\":\"Reset7890\"}")"
expect "重置后的密码可登录" "$RESETLOGIN" "ok" "True"
RTOKEN2="$(printf '%s' "$RESETLOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)"

REUSE_RESET="$(post /api/auth/reset-password "{\"token\":\"$RTOKEN\",\"newPassword\":\"Another123\"}")"
expect "重置令牌不可重复使用" "$REUSE_RESET" "code" "reset_token_used"

say "11. 模型下拉列表"
MODELS="$(get /api/ai/models "$RTOKEN2")"
expect "模型接口可用" "$MODELS" "ok" "True"
expect "Ollama 可达" "$MODELS" "ollama.reachable" "True"
python3 - "$MODELS" <<'PY'
import sys, json
try:
    d = json.loads(sys.argv[1])
except Exception:
    # 模型接口没返回合法 JSON（多半是上面 already 断言失败），别再丢一堆栈出来刷屏。
    raise SystemExit(0)
models = d.get('models', [])
print(f"  · 发现 {len(models)} 个本地模型，默认：{d.get('defaultModel','(无)')}")
for m in models:
    print(f"    - {m['name']} | {m.get('sizeText','')} | 参数 {m.get('parameterSize','?')} | 量化 {m.get('quantization','?')} | 来源 {m.get('source')} | 可用 {m.get('available')}")
src = d.get('sources', {})
print(f"  · 来源：API {src.get('api')} 条，磁盘 {src.get('disk')} 条，扫描根目录 {[r['modelsDir'] for r in src.get('roots', [])]}")
PY

say "12. 流式对话（经 API 端口）"
CHATOUT="$(curl -sN -X POST "$BASE/api/ai/chat" -H 'Content-Type: application/json' \
  -H "X-Forwarded-For: $FAKE_IP" \
  -H "Authorization: Bearer $RTOKEN2" \
  -d "{\"model\":\"$(printf '%s' "$MODELS" | python3 -c "import sys,json;print(json.load(sys.stdin).get('defaultModel',''))" 2>/dev/null)\",\"message\":\"用一句话说明铁路信号机的作用\"}" \
  --max-time 120 2>/dev/null)"

FRAMES="$(printf '%s' "$CHATOUT" | grep -c '"__railway"' || true)"

# 分开统计思考与正文：qwen3 是思考模型，前几秒只吐 thinking、content 为空。
# 若只统计 content，"思考阶段"会被误判成"没有输出"。
read -r CHARS THINKCHARS FRAMECOUNT <<<"$(printf '%s' "$CHATOUT" | python3 -c "
import sys, json
content = thinking = frames = 0
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try: d = json.loads(line)
    except Exception: continue
    frames += 1
    msg = d.get('message') or {}
    content += len(msg.get('content') or '')
    thinking += len(msg.get('thinking') or '')
print(content, thinking, frames)
" 2>/dev/null)"

if printf '%s' "$CHATOUT" | grep -q '"__railway":"done"'; then
  ok "收到流式结束帧"
else
  bad "未收到流式结束帧"
fi

if [ "${CHARS:-0}" -gt 0 ]; then
  ok "模型生成正文 ${CHARS} 字（共 ${FRAMECOUNT:-0} 帧，思考 ${THINKCHARS:-0} 字）"
else
  bad "模型未生成正文内容"
fi

if [ "${THINKCHARS:-0}" -gt 0 ] && printf '%s' "$CHATOUT" | grep -q '"__railway":"thinking"'; then
  ok "思考阶段有控制帧通知前端"
elif [ "${THINKCHARS:-0}" -eq 0 ]; then
  ok "该模型无思考阶段，跳过思考帧检查"
else
  bad "有思考内容但未发出思考控制帧"
fi

if printf '%s' "$CHATOUT" | grep -q '"__railway":"meta"'; then
  ok "收到会话元信息帧"
else
  bad "未收到会话元信息帧"
fi

# 增量性验证：若所有正文帧的首字都在同一毫秒，说明中间层做了缓冲，流式就退化成了一次性返回。
if printf '%s' "$CHATOUT" | python3 -c "
import sys, json
from datetime import datetime
stamps = []
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try: d = json.loads(line)
    except Exception: continue
    if (d.get('message') or {}).get('content') and d.get('created_at'):
        stamps.append(d['created_at'])
if len(stamps) < 5:
    print('skip'); raise SystemExit
def parse(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))
span = (parse(stamps[-1]) - parse(stamps[0])).total_seconds()
print('ok' if span > 0.2 else 'buffered')
" 2>/dev/null | grep -q '^ok$'; then
  ok "正文帧在时间上分散，确认是增量流式"
else
  bad "正文帧时间戳过于集中，疑似被中间层缓冲成一次性返回"
fi

say "13. 会话落库"
CONVS="$(get "/api/users/me/conversations?page=1&pageSize=5" "$RTOKEN2")"
expect "会话列表可查" "$CONVS" "ok" "True"

AICONV="$(get "/api/admin/conversations?page=1&pageSize=5" "$ATOKEN")"
expect "管理台可见会话" "$AICONV" "ok" "True"

AILOG="$(get "/api/admin/ai-logs?page=1&pageSize=5" "$ATOKEN")"
expect "管理台可见调用日志" "$AILOG" "ok" "True"

say "14. 登出"
LOGOUT="$(post /api/auth/logout "{\"refreshToken\":\"$NEW_REFRESH\",\"all\":true}" "$RTOKEN2")"
expect "登出成功" "$LOGOUT" "ok" "True"

printf '\n\033[1m通过 %d 项，失败 %d 项\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
