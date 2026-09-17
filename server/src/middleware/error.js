import { HttpError } from '../utils/httpError.js'
import { logger } from '../utils/logger.js'

export function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    code: 'not_found',
    message: `接口不存在：${req.method} ${req.originalUrl}`,
  })
}

// eslint-disable-next-line no-unused-vars -- Express 靠四参数签名识别错误处理中间件
export function errorHandler(error, req, res, next) {
  const isHttpError = error instanceof HttpError
  const status = isHttpError ? error.status : 500

  // 流式响应已经开始就无法再改状态码，只能把错误塞成一帧控制帧。
  if (res.headersSent) {
    if (!res.writableEnded && !res.destroyed) {
      res.write(
        `${JSON.stringify({
          __railway: 'error',
          code: isHttpError ? error.code : 'internal_error',
          message: isHttpError ? error.message : '服务内部错误',
        })}\n`
      )
      res.end()
    }
    if (!isHttpError) logger.error('流式响应中的未捕获错误', { message: error.message, stack: error.stack })
    return
  }

  if (!isHttpError) {
    logger.error('未捕获的服务端错误', {
      message: error.message,
      stack: error.stack,
      path: req.originalUrl,
      method: req.method,
    })
  }

  res.status(status).json({
    ok: false,
    code: isHttpError ? error.code : 'internal_error',
    message: isHttpError ? error.message : '服务内部错误',
    ...(isHttpError && error.details ? { details: error.details } : {}),
  })
}
