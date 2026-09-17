import { verifyAccessToken } from '../services/tokenService.js'
import { queryOne } from '../db/pool.js'
import { forbidden, unauthorized } from '../utils/httpError.js'

function extractBearer(req) {
  const header = req.headers.authorization
  if (typeof header !== 'string') return null
  const [scheme, token] = header.split(' ')
  if (!token || scheme.toLowerCase() !== 'bearer') return null
  return token.trim()
}

/**
 * 解析令牌并加载用户。每个请求都回库取一次用户，保证封禁/改角色能即时生效，
 * 不必等 access token 自然过期。
 */
async function loadUser(req) {
  const token = extractBearer(req)
  if (!token) return null

  const payload = verifyAccessToken(token)
  const user = await queryOne(
    `SELECT id, username, display_name, email, phone, role, status, must_change_password, deleted_at
     FROM users WHERE id = $1`,
    [payload.sub]
  )

  if (!user || user.deleted_at) throw unauthorized('账号不存在或已注销', 'account_missing')
  if (user.status === 'disabled') throw forbidden('账号已被禁用，请联系管理员', 'account_disabled')
  if (user.status === 'locked') throw forbidden('账号已被锁定，请联系管理员解锁', 'account_locked')

  return user
}

/** 必须登录。 */
export async function requireAuth(req, res, next) {
  try {
    const user = await loadUser(req)
    if (!user) throw unauthorized('请先登录', 'login_required')
    req.user = user
    next()
  } catch (error) {
    next(error)
  }
}

/** 可选登录：带了合法令牌就挂 req.user，没带或无效也放行。 */
export async function optionalAuth(req, res, next) {
  try {
    req.user = await loadUser(req)
  } catch {
    req.user = null
  }
  next()
}

/** 角色白名单。必须配合 requireAuth 使用（依赖 req.user）。 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized('请先登录', 'login_required'))
    if (!roles.includes(req.user.role)) {
      return next(forbidden('没有操作权限，该功能仅对管理员开放', 'role_forbidden'))
    }
    next()
  }
}
