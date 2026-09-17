/**
 * NDJSON 流式响应工具。
 *
 * 选 NDJSON over fetch 而不是 SSE：EventSource 既不能带 Authorization 头也不能发 POST body，
 * 用 JWT 就只剩把令牌塞进 query string 这一条路，会泄漏进 FRP 与代理日志。
 */

/** 写好流式响应头。X-Accel-Buffering 用于阻止 FRP/nginx 类中间层缓冲。 */
export function beginStream(res) {
  res.status(200)
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
}

/** 写一帧。返回 false 表示对端已断开，调用方应停止上游读取。 */
export function writeFrame(res, payload) {
  if (res.writableEnded || res.destroyed) return false
  return res.write(`${JSON.stringify(payload)}\n`)
}

/** 用 __railway 命名空间写控制帧，与 Ollama 原始帧不会冲突。 */
export function writeControl(res, type, data = {}) {
  return writeFrame(res, { __railway: type, ...data })
}

export function endStream(res) {
  if (!res.writableEnded && !res.destroyed) res.end()
}

/**
 * 按行切分 NDJSON 字节流。上游分片不保证落在行边界上，所以要自己缓冲。
 * @param {(obj: any) => void} onObject
 * @returns {(chunk: Uint8Array) => void}
 */
export function createLineDecoder(onObject) {
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  return function push(chunk) {
    buffer += decoder.decode(chunk, { stream: true })
    let index = buffer.indexOf('\n')
    while (index !== -1) {
      const raw = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (raw) {
        try {
          onObject(JSON.parse(raw))
        } catch {
          // 上游偶发半行或非 JSON 内容，跳过而不是中断整条流。
        }
      }
      index = buffer.indexOf('\n')
    }
  }
}

/** 冲刷解码器尾部残留（上游结束时最后一行可能没有换行符）。 */
export function flushDecoder(onObject, tail) {
  const raw = String(tail ?? '').trim()
  if (!raw) return
  try {
    onObject(JSON.parse(raw))
  } catch {
    // 忽略无法解析的尾部内容。
  }
}
