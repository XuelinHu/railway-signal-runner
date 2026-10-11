import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { getClientIp, rateLimit } from '../middleware/rateLimit.js'
import * as authService from '../services/authService.js'
import { rotateRefreshToken, signAccessToken } from '../services/tokenService.js'
import { toPublicUser } from '../services/authService.js'
import { pool } from '../db/pool.js'
import { HttpError } from '../utils/httpError.js'
import { insertAuditLog } from '../repositories/logRepository.js'
import * as users from '../repositories/userRepository.js'
import { exchangeOidcCode, oidcEnabled, startOidc, takeOidcTransaction } from '../services/oidcService.js'

export const authRouter = Router()

authRouter.get('/oidc/config', (_req, res) => res.json({ enabled: oidcEnabled() }))

authRouter.post('/oidc/start', (req, res, next) => {
  const mode = req.body?.mode === 'link' ? 'link' : 'login'
  const start = async () => {
    try {
      const result = await startOidc({ mode, userId: mode === 'link' ? req.user.id : null, redirectUri: String(req.body?.redirectUri || '') })
      res.cookie('rsr_oidc', result.cookieKey, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/api/auth/oidc', maxAge: 600_000 })
      res.json({ authorizationUrl: result.authorizationUrl })
    } catch (error) { next(error) }
  }
  if (mode === 'link') return requireAuth(req, res, start)
  return start()
})

authRouter.post('/oidc/callback', async (req, res, next) => {
  const transaction = takeOidcTransaction(req.cookies?.rsr_oidc, String(req.body?.state || ''))
  res.clearCookie('rsr_oidc', { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/api/auth/oidc' })
  if (!transaction) return next(new HttpError(401, 'oidc_state_invalid', '统一登录状态已过期，请重新开始'))
  const complete = async () => {
    try {
      if (transaction.mode === 'link' && String(req.user?.id) !== String(transaction.userId)) {
        return next(new HttpError(401, 'oidc_link_session_mismatch', '绑定账号的登录状态已失效，请重新登录后重试'))
      }
      const subject = await exchangeOidcCode(transaction, String(req.body?.code || ''))
      if (transaction.mode === 'link') {
        const linked = await users.bindOidcSubject(transaction.userId, subject)
        if (!linked) return next(new HttpError(409, 'oidc_link_conflict', '本地账号不存在、已停用或已关联其他统一身份'))
        await insertAuditLog({ userId: linked.id, username: linked.username, action: 'auth.oidc.link', targetType: 'user', targetId: linked.id, ip: getClientIp(req) })
        return res.json({ mode: 'link', linked: true })
      }
      const session = await authService.loginWithOidcSubject(subject, ctx(req))
      return res.json({ mode: 'login', ...session })
    } catch (error) {
      if (error?.code === '23505') error.status = 409
      next(error)
    }
  }
  if (transaction.mode === 'link') return requireAuth(req, res, complete)
  return complete()
})

authRouter.get('/oidc/status', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT oidc_subject IS NOT NULL AS linked FROM users WHERE id = $1', [req.user.id])
    res.json({ enabled: oidcEnabled(), linked: Boolean(result.rows[0]?.linked) })
  } catch (error) { next(error) }
})

const ctx = (req) => ({
  ip: getClientIp(req),
  userAgent: req.headers['user-agent'],
  userId: req.user?.id,
  username: req.user?.username,
})

const usernameSchema = z
  .string()
  .min(3, '用户名至少 3 位')
  .max(32, '用户名最多 32 位')
  .regex(/^[A-Za-z0-9_.-]+$/, '用户名只能包含字母、数字、下划线、点和横线')

const passwordSchema = z
  .string()
  .min(8, '密码至少 8 位')
  .max(72, '密码最多 72 位')
  .regex(/[A-Za-z]/, '密码必须包含字母')
  .regex(/[0-9]/, '密码必须包含数字')

authRouter.post(
  '/register',
  rateLimit({ ...config.rateLimit.register, keyPrefix: 'auth-register' }),
  validate({
    body: z.object({
      username: usernameSchema,
      password: passwordSchema,
      displayName: z.string().trim().max(32).optional(),
      email: z.string().trim().email('邮箱格式不正确').max(128).optional().nullable(),
      phone: z.string().trim().regex(/^\d{6,20}$/, '手机号格式不正确').optional().nullable(),
      role: z.enum(['student', 'teacher', 'admin']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const user = await authService.register(req.validated.body, ctx(req))
      res.status(201).json({ ok: true, user })
    } catch (error) {
      next(error)
    }
  }
)

authRouter.post(
  '/login',
  // 两级限流：按账号 10 次/15 分钟拦住针对单个账号的爆破；
  // 按 IP 60 次/15 分钟兜底，防止有人换着用户名扫库。
  // 只按 IP 计会误伤同一出口 IP 下的整片用户（机房、NAT）。
  rateLimit({
    ...config.rateLimit.login,
    keyPrefix: 'auth-login-user',
    identity: (req) => {
      const username = req.body?.username
      return typeof username === 'string' && username.trim() ? `n:${username.trim().toLowerCase()}` : null
    },
    tiers: [
      {
        ...config.rateLimit.login,
        max: config.rateLimit.login.ipMax,
        keyPrefix: 'auth-login-ip',
      },
    ],
  }),
  validate({
    body: z.object({
      username: z.string().trim().min(1, '请输入用户名'),
      password: z.string().min(1, '请输入密码'),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await authService.login(req.validated.body, ctx(req))
      res.json({ ok: true, ...result })
    } catch (error) {
      next(error)
    }
  }
)

authRouter.post(
  '/refresh',
  validate({ body: z.object({ refreshToken: z.string().min(1) }) }),
  async (req, res, next) => {
    try {
      const { userId, token } = await rotateRefreshToken(req.validated.body.refreshToken, ctx(req))
      const user = await authService.loadUserForToken(userId)
      res.json({
        ok: true,
        user: toPublicUser(user),
        accessToken: signAccessToken(user),
        refreshToken: token.raw,
        expiresIn: config.auth.accessTtlSeconds,
      })
    } catch (error) {
      next(error)
    }
  }
)

authRouter.post(
  '/logout',
  validate({
    body: z.object({
      refreshToken: z.string().optional(),
      all: z.boolean().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await authService.logout(req.validated.body, ctx(req))
      res.json({ ok: true, ...result })
    } catch (error) {
      next(error)
    }
  }
)

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json({ ok: true, user: toPublicUser(req.user) })
  } catch (error) {
    next(error)
  }
})

authRouter.post(
  '/forgot-password',
  rateLimit({ ...config.rateLimit.forgotPassword, keyPrefix: 'auth-forgot' }),
  validate({ body: z.object({ account: z.string().trim().min(1, '请输入用户名、邮箱或手机号') }) }),
  async (req, res, next) => {
    try {
      const result = await authService.createPasswordReset(req.validated.body, ctx(req))
      res.json({ ok: true, ...result })
    } catch (error) {
      next(error)
    }
  }
)

/** 校验重置令牌是否仍然有效，供前端在渲染重置表单前预检。 */
authRouter.get('/reset-password/:token', async (req, res, next) => {
  try {
    const result = await authService.peekResetToken(req.params.token)
    res.json({ ok: true, ...result })
  } catch (error) {
    next(error)
  }
})

authRouter.post(
  '/reset-password',
  rateLimit({ ...config.rateLimit.forgotPassword, keyPrefix: 'auth-reset' }),
  validate({
    body: z.object({
      token: z.string().min(1, '重置链接无效'),
      newPassword: passwordSchema,
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await authService.resetPassword(req.validated.body, ctx(req))
      res.json({ ok: true, ...result })
    } catch (error) {
      next(error)
    }
  }
)

export { passwordSchema, usernameSchema }
