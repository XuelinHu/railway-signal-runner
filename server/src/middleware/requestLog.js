import { logger } from '../utils/logger.js'

/** 请求日志。流式响应会在很短时间内返回，耗时字段仍需保留。 */
export function requestLog(req, res, next) {
  const startedAt = Date.now()
  res.on('finish', () => {
    const elapsed = Date.now() - startedAt
    const entry = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: elapsed,
    }
    if (req.user?.id) entry.userId = req.user.id

    // 静态健康检查和成功请求不刷屏，只记非 2xx 与慢请求。
    if (res.statusCode >= 400) logger.warn('请求异常', entry)
    else if (elapsed > 3000) logger.warn('慢请求', entry)
  })
  next()
}
