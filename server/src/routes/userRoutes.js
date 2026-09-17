import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { getClientIp } from '../middleware/rateLimit.js'
import * as users from '../repositories/userRepository.js'
import * as conversations from '../repositories/conversationRepository.js'
import { changePassword, toPublicUser } from '../services/authService.js'
import { buildPageParams, pageEnvelope } from '../services/pagination.js'
import { conflict, notFound } from '../utils/httpError.js'
import { passwordSchema } from './authRoutes.js'

export const userRouter = Router()

userRouter.use(requireAuth)

const ctx = (req) => ({ ip: getClientIp(req), userId: req.user.id, username: req.user.username })

/** 更新自己的资料。邮箱/手机号需要查重，否则会和唯一索引冲突报 500。 */
userRouter.put(
  '/me',
  validate({
    body: z.object({
      displayName: z.string().trim().min(1, '昵称不能为空').max(32).optional(),
      email: z.string().trim().email('邮箱格式不正确').max(128).optional().nullable(),
      phone: z
        .string()
        .trim()
        .regex(/^\d{6,20}$/, '手机号格式不正确')
        .optional()
        .nullable(),
    }),
  }),
  async (req, res, next) => {
    try {
      const patch = req.validated.body

      if (patch.email && (await users.emailExists(patch.email, req.user.id))) {
        throw conflict('该邮箱已被其它账号使用', 'email_taken')
      }
      if (patch.phone && (await users.phoneExists(patch.phone, req.user.id))) {
        throw conflict('该手机号已被其它账号使用', 'phone_taken')
      }

      const updated = await users.updateUser(req.user.id, {
        displayName: patch.displayName,
        email: patch.email === undefined ? undefined : patch.email || null,
        phone: patch.phone === undefined ? undefined : patch.phone || null,
      })
      if (!updated) throw notFound('账号不存在', 'account_missing')

      res.json({ ok: true, user: toPublicUser(updated) })
    } catch (error) {
      next(error)
    }
  }
)

userRouter.post(
  '/me/password',
  validate({
    body: z.object({
      currentPassword: z.string().min(1, '请输入当前密码'),
      newPassword: passwordSchema,
    }),
  }),
  async (req, res, next) => {
    try {
      await changePassword(req.user.id, req.validated.body, ctx(req))
      res.json({
        ok: true,
        message: '密码修改成功，请使用新密码重新登录',
      })
    } catch (error) {
      next(error)
    }
  }
)

/** 我的会话列表（分页）。 */
userRouter.get(
  '/me/conversations',
  validate({
    query: z.object({
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().optional(),
      q: z.string().max(100).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const params = buildPageParams(req.validated.query)
      const rows = await conversations.listUserConversations(req.user.id, {
        ...params,
        q: req.validated.query.q,
      })
      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)
