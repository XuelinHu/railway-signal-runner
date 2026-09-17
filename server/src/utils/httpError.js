/**
 * 业务错误。code 是给前端做分支判断的稳定标识（中文 message 只用于展示）。
 */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message, code = 'bad_request', details) =>
  new HttpError(400, code, message, details)

export const unauthorized = (message = '登录已过期，请重新登录', code = 'unauthorized') =>
  new HttpError(401, code, message)

export const forbidden = (message = '没有操作权限', code = 'forbidden') =>
  new HttpError(403, code, message)

export const notFound = (message = '资源不存在', code = 'not_found') =>
  new HttpError(404, code, message)

export const conflict = (message, code = 'conflict') => new HttpError(409, code, message)

export const tooManyRequests = (message = '操作过于频繁，请稍后再试', code = 'rate_limited', details) =>
  new HttpError(429, code, message, details)

export const badGateway = (message = '上游服务异常', code = 'bad_gateway') =>
  new HttpError(502, code, message)

export const serviceUnavailable = (message = '服务暂不可用', code = 'unavailable') =>
  new HttpError(503, code, message)
