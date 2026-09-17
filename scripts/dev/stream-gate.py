#!/usr/bin/env python3
"""流式门禁：测量 NDJSON 帧的【到达时刻】分布，判断是否真的逐字增量。

帧内自带的 created_at 是服务端写入时间，中间层缓冲不会改变它——
所以必须用客户端收到每一行的时刻来判断。若所有行几乎同时到达，
说明某层（Vite 代理 / FRP）把流缓冲成了一坨，流式就名存实亡。

用法：python3 scripts/dev/stream-gate.py <BASE> [MODEL]
"""
import json
import sys
import time
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8038"
MODEL = sys.argv[2] if len(sys.argv) > 2 else "qwen3:14b"
STAMP = str(int(time.time()))
USER = f"gate{STAMP}"
PWD = "Passw0rd123"


def call(path, payload, token=None):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


call("/api/auth/register", {"username": USER, "password": PWD})
token = call("/api/auth/login", {"username": USER, "password": PWD})["accessToken"]

body = json.dumps({"model": MODEL, "message": "用一句话说明铁路信号机的作用"}).encode()
req = urllib.request.Request(f"{BASE}/api/ai/chat", data=body, method="POST")
req.add_header("Content-Type", "application/json")
req.add_header("Authorization", f"Bearer {token}")

content_times: list[float] = []
thinking_times: list[float] = []
all_times: list[float] = []
control = []
start = time.monotonic()

with urllib.request.urlopen(req, timeout=300) as resp:
    buf = b""
    while True:
        chunk = resp.read(1)
        if not chunk:
            break
        buf += chunk
        if not buf.endswith(b"\n"):
            continue
        line, buf = buf.strip(), b""
        if not line:
            continue
        now = time.monotonic() - start
        try:
            frame = json.loads(line)
        except Exception:
            continue
        tag = frame.get("__railway")
        if tag:
            control.append((round(now, 3), tag))
            continue
        msg = frame.get("message") or {}
        if msg.get("content"):
            content_times.append(now)
            all_times.append(now)
        elif msg.get("thinking"):
            thinking_times.append(now)
            all_times.append(now)

print(f"base={BASE}  model={MODEL}")
print(f"控制帧: {control}")
print(f"思考帧 {len(thinking_times)} 个，正文帧 {len(content_times)} 个")

if not content_times:
    print("✗ 没有正文帧")
    sys.exit(1)

# 判断增量性的依据必须是【整条流的到达分布】，而不是只看正文帧。
# 理由：模型可能先思考几秒、再一口气吐完正文。此时正文帧间隔很小，
# 但那是模型的吐字速度，不是中间层缓冲——只盯正文会误报。
if len(all_times) >= 2:
    span = all_times[-1] - all_times[0]
    gaps = [b - a for a, b in zip(all_times, all_times[1:])]
    biggest = max(gaps)
    print(f"数据帧共 {len(all_times)} 个：首帧 {all_times[0]:.3f}s，末帧 {all_times[-1]:.3f}s，"
          f"跨度 {span:.3f}s，最大间隔 {biggest * 1000:.1f}ms")
    print(f"正文帧跨度 {(content_times[-1] - content_times[0]):.3f}s（{len(content_times)} 帧）")
    # 缓冲的特征：全部帧挤在极短窗口里到达，且总跨度远小于服务端生成耗时。
    if span < 1.0:
        print("✗ 整条流几乎同时到达 —— 被中间层缓冲，流式失效")
        sys.exit(1)
    print("✓ 数据帧在时间上展开，确认是逐帧增量传输")
else:
    print("· 数据帧过少，无法判断增量性")
