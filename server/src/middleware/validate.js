import { badRequest } from '../utils/httpError.js'

/**
 * 用 zod 校验并归一化请求参数，校验通过后把结果写回 req.validated。
 * 校验失败统一返回 400 并把首条错误做成可读的中文提示。
 */
export function validate(schemas) {
  return (req, res, next) => {
    const validated = {}
    for (const [source, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(req[source] ?? {})
      if (!result.success) {
        const issue = result.error.issues[0]
        const path = issue.path.join('.')
        return next(
          badRequest(
            path ? `参数 ${path} 不合法：${issue.message}` : `参数不合法：${issue.message}`,
            'validation_failed',
            result.error.issues.map((item) => ({ path: item.path.join('.'), message: item.message }))
          )
        )
      }
      validated[source] = result.data
    }
    req.validated = validated
    next()
  }
}
