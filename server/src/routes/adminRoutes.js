import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { getClientIp } from '../middleware/rateLimit.js'
import * as users from '../repositories/userRepository.js'
import * as logs from '../repositories/logRepository.js'
import * as tokens from '../repositories/tokenRepository.js'
import * as scenes from '../repositories/sceneRepository.js'
import * as conversations from '../repositories/conversationRepository.js'
import { hashPassword, generatePassword } from '../services/passwordService.js'
import { revokeAllUserTokens } from '../services/tokenService.js'
import { issueResetLink, toPublicUser } from '../services/authService.js'
import { buildPageParams, pageEnvelope, resolveSort } from '../services/pagination.js'
import { getModelRegistry, invalidateModelCache } from '../services/modelRegistry.js'
import * as ollama from '../services/ollamaService.js'
import { healthCheck } from '../db/pool.js'
import { config } from '../config.js'
import { badRequest, conflict, notFound } from '../utils/httpError.js'
import { passwordSchema, usernameSchema } from './authRoutes.js'

export const adminRouter = Router()

adminRouter.use(requireAuth, requireRole('admin'))

const ctx = (req) => ({ ip: getClientIp(req), userId: req.user.id, username: req.user.username })

/** 分页查询参数。管理台每个列表都用它。 */
const pageQuery = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  from: z.string().trim().optional().nullable(),
  to: z.string().trim().optional().nullable(),
}

const boolParam = z
  .enum(['0', '1', 'true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === '1' || value === 'true'))

const trimToNull = (value) => (value ? value : null)

/* ------------------------------- 概览 ------------------------------- */

adminRouter.get('/stats', async (req, res, next) => {
  try {
    const [userStats, roleStats, loginStats, sceneStats, recordStats, convStats, msgStats, aiStats] =
      await Promise.all([
        users.countAll(),
        users.countByRole(),
        logs.loginSummary(),
        scenes.sceneStats(),
        scenes.recordStats(),
        conversations.countConversations(),
        conversations.countMessages(),
        logs.aiLogSummary(),
      ])

    const registry = await getModelRegistry().catch(() => null)

    res.json({
      ok: true,
      users: { ...userStats, byRole: roleStats },
      logins: loginStats,
      scenes: sceneStats,
      records: recordStats,
      conversations: convStats,
      messages: msgStats,
      ai: {
        ...aiStats,
        models: registry?.models?.length ?? 0,
        loaded: registry?.models?.filter((model) => model.running).length ?? 0,
        ollamaReachable: registry?.ollama?.reachable ?? false,
        defaultModel: registry?.defaultModel ?? '',
      },
    })
  } catch (error) {
    next(error)
  }
})

/** 概览页的最近登录（同样走分页）。 */
adminRouter.get(
  '/stats/recent-logins',
  validate({ query: z.object(pageQuery) }),
  async (req, res, next) => {
    try {
      const params = buildPageParams(req.validated.query, { defaultPageSize: 10 })
      const rows = await logs.recentLogins(params)
      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)

/* ------------------------------- 用户管理 ------------------------------- */

const userSortAllowlist = {
  createdAt: 'u.created_at',
  updatedAt: 'u.updated_at',
  username: 'u.username',
  lastLoginAt: 'u.last_login_at',
  role: 'u.role',
  status: 'u.status',
}

adminRouter.get(
  '/users',
  validate({
    query: z.object({
      ...pageQuery,
      q: z.string().trim().max(64).optional(),
      role: z.enum(['student', 'teacher', 'admin']).optional(),
      status: z.enum(['active', 'disabled', 'locked']).optional(),
      sort: z.string().max(32).optional(),
      order: z.enum(['asc', 'desc']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const query = req.validated.query
      const params = buildPageParams(query)
      const sort = resolveSort(query, userSortAllowlist, {
        column: 'u.created_at',
        direction: 'DESC',
      })

      const rows = await users.listUsers({
        ...params,
        q: query.q,
        role: query.role,
        status: query.status,
        sortColumn: sort.column,
        sortDirection: sort.direction,
      })

      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)

const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema.optional(),
  displayName: z.string().trim().max(32).optional(),
  email: z.string().trim().email('邮箱格式不正确').max(128).optional().nullable(),
  phone: z.string().trim().regex(/^\d{6,20}$/, '手机号格式不正确').optional().nullable(),
  role: z.enum(['student', 'teacher', 'admin']),
  status: z.enum(['active', 'disabled', 'locked']).optional(),
  remark: z.string().trim().max(200).optional().nullable(),
})

adminRouter.post(
  '/users',
  validate({ body: createUserSchema }),
  async (req, res, next) => {
    try {
      const input = req.validated.body

      if (await users.usernameExists(input.username)) {
        throw conflict('该用户名已被占用', 'username_taken')
      }
      if (input.email && (await users.emailExists(input.email))) {
        throw conflict('该邮箱已被注册', 'email_taken')
      }
      if (input.phone && (await users.phoneExists(input.phone))) {
        throw conflict('该手机号已被注册', 'phone_taken')
      }

      // 管理员不填密码时自动生成一个，并强制首次登录修改。
      const initialPassword = input.password || generatePassword(12)

      const user = await users.insertUser({
        username: input.username.trim(),
        displayName: input.displayName?.trim() || input.username.trim(),
        email: trimToNull(input.email),
        phone: trimToNull(input.phone),
        passwordHash: await hashPassword(initialPassword),
        role: input.role,
        status: input.status ?? 'active',
        remark: trimToNull(input.remark),
        mustChangePassword: !input.password,
      })

      await logs.insertAuditLog({
        ...ctx(req),
        action: 'admin.create_user',
        targetType: 'user',
        targetId: user.id,
        detail: { role: input.role, username: user.username },
        ip: ctx(req).ip,
      })

      res.status(201).json({
        ok: true,
        user: toPublicUser(user),
        // 仅当系统生成密码时才回显，方便管理员转交。
        ...(input.password ? {} : { initialPassword }),
      })
    } catch (error) {
      next(error)
    }
  }
)

adminRouter.put(
  '/users/:id',
  validate({
    body: z.object({
      displayName: z.string().trim().min(1).max(32).optional(),
      email: z.string().trim().email('邮箱格式不正确').max(128).optional().nullable(),
      phone: z.string().trim().regex(/^\d{6,20}$/, '手机号格式不正确').optional().nullable(),
      role: z.enum(['student', 'teacher', 'admin']).optional(),
      status: z.enum(['active', 'disabled', 'locked']).optional(),
      remark: z.string().trim().max(200).optional().nullable(),
    }),
  }),
  async (req, res, next) => {
    try {
      const target = await users.findById(req.params.id)
      if (!target || target.deleted_at) throw notFound('用户不存在', 'user_not_found')

      const patch = req.validated.body

      // 不允许管理员把自己降级或禁用，否则容易把自己锁在系统外。
      if (target.id === req.user.id && patch.role && patch.role !== 'admin') {
        throw badRequest('不能修改自己的角色', 'self_role_change')
      }
      if (target.id === req.user.id && patch.status && patch.status !== 'active') {
        throw badRequest('不能禁用自己的账号', 'self_disable')
      }

      if (patch.email && (await users.emailExists(patch.email, target.id))) {
        throw conflict('该邮箱已被其它账号使用', 'email_taken')
      }
      if (patch.phone && (await users.phoneExists(patch.phone, target.id))) {
        throw conflict('该手机号已被其它账号使用', 'phone_taken')
      }

      const updated = await users.updateUser(target.id, {
        displayName: patch.displayName,
        email: patch.email === undefined ? undefined : trimToNull(patch.email),
        phone: patch.phone === undefined ? undefined : trimToNull(patch.phone),
        role: patch.role,
        status: patch.status,
        remark: patch.remark === undefined ? undefined : trimToNull(patch.remark),
      })

      // 禁用账号时立刻吊销其刷新令牌，避免继续续期。
      if (patch.status === 'disabled') await revokeAllUserTokens(target.id)

      await logs.insertAuditLog({
        ...ctx(req),
        action: 'admin.update_user',
        targetType: 'user',
        targetId: target.id,
        detail: patch,
        ip: ctx(req).ip,
      })

      res.json({ ok: true, user: toPublicUser(updated) })
    } catch (error) {
      next(error)
    }
  }
)

adminRouter.delete('/users/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      throw badRequest('不能删除自己的账号', 'self_delete')
    }
    const target = await users.findById(req.params.id)
    if (!target || target.deleted_at) throw notFound('用户不存在', 'user_not_found')

    await users.softDeleteUser(target.id)
    await revokeAllUserTokens(target.id)

    await logs.insertAuditLog({
      ...ctx(req),
      action: 'admin.delete_user',
      targetType: 'user',
      targetId: target.id,
      detail: { username: target.username },
      ip: ctx(req).ip,
    })

    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

/** 管理员为指定用户生成一次性重置链接（本机无邮件服务，由管理员转交）。 */
adminRouter.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const result = await issueResetLink(req.params.id, ctx(req))
    res.json({ ok: true, ...result })
  } catch (error) {
    next(error)
  }
})

adminRouter.post('/users/:id/unlock', async (req, res, next) => {
  try {
    const updated = await users.unlockUser(req.params.id)
    if (!updated) throw badRequest('该账号当前不处于锁定状态', 'not_locked')

    await logs.insertAuditLog({
      ...ctx(req),
      action: 'admin.unlock_user',
      targetType: 'user',
      targetId: req.params.id,
      ip: ctx(req).ip,
    })

    res.json({ ok: true, user: toPublicUser(updated) })
  } catch (error) {
    next(error)
  }
})

/* ------------------------------- 登录日志 / 审计日志 ------------------------------- */

adminRouter.get(
  '/login-logs',
  validate({
    query: z.object({
      ...pageQuery,
      userId: z.string().max(64).optional(),
      username: z.string().trim().max(64).optional(),
      success: boolParam,
    }),
  }),
  async (req, res, next) => {
    try {
      const query = req.validated.query
      const params = buildPageParams(query)
      const rows = await logs.listLoginLogs({
        ...params,
        userId: query.userId,
        username: query.username,
        success: query.success,
        from: query.from,
        to: query.to,
      })
      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)

adminRouter.get(
  '/audit-logs',
  validate({
    query: z.object({
      ...pageQuery,
      userId: z.string().max(64).optional(),
      action: z.string().trim().max(64).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const query = req.validated.query
      const params = buildPageParams(query)
      const rows = await logs.listAuditLogs({
        ...params,
        userId: query.userId,
        action: query.action,
        from: query.from,
        to: query.to,
      })
      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)

adminRouter.get(
  '/reset-tokens',
  validate({ query: z.object({ ...pageQuery, userId: z.string().max(64).optional() }) }),
  async (req, res, next) => {
    try {
      const params = buildPageParams(req.validated.query)
      const rows = await tokens.listResetTokens({ ...params, userId: req.validated.query.userId })
      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)

/* ------------------------------- 训练场景 / 成绩记录 ------------------------------- */

adminRouter.get(
  '/scenes',
  validate({
    query: z.object({
      ...pageQuery,
      q: z.string().trim().max(64).optional(),
      ownerId: z.string().max(64).optional(),
      published: boolParam,
      includeDeleted: boolParam,
    }),
  }),
  async (req, res, next) => {
    try {
      const query = req.validated.query
      const params = buildPageParams(query)
      const rows = await scenes.listScenes({
        ...params,
        q: query.q,
        ownerId: query.ownerId,
        published: query.published,
        includeDeleted: query.includeDeleted === true,
      })
      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * 场景详情：单独一个接口按需返回 payload。
 * 不并进列表是有意的——payload 是整份场景 JSON，几十条一起传会把列表拖垮。
 */
adminRouter.get('/scenes/:id', async (req, res, next) => {
  try {
    const scene = await scenes.getScene(req.params.id)
    if (!scene) throw notFound('场景不存在', 'scene_not_found')
    res.json({ ok: true, scene })
  } catch (error) {
    next(error)
  }
})

adminRouter.post('/scenes/:id/publish', async (req, res, next) => {
  try {
    const published = req.body?.published !== false
    const scene = await scenes.setPublished(req.params.id, published)
    if (!scene) throw notFound('场景不存在', 'scene_not_found')

    await logs.insertAuditLog({
      ...ctx(req),
      action: published ? 'admin.publish_scene' : 'admin.unpublish_scene',
      targetType: 'scene',
      targetId: scene.id,
      ip: ctx(req).ip,
    })

    res.json({ ok: true, scene })
  } catch (error) {
    next(error)
  }
})

adminRouter.delete('/scenes/:id', async (req, res, next) => {
  try {
    const ok = await scenes.softDeleteScene(req.params.id)
    if (!ok) throw notFound('场景不存在', 'scene_not_found')

    await logs.insertAuditLog({
      ...ctx(req),
      action: 'admin.delete_scene',
      targetType: 'scene',
      targetId: req.params.id,
      ip: ctx(req).ip,
    })

    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

adminRouter.get(
  '/records',
  validate({
    query: z.object({
      ...pageQuery,
      userId: z.string().max(64).optional(),
      sceneId: z.string().max(64).optional(),
      q: z.string().trim().max(64).optional(),
      completed: boolParam,
    }),
  }),
  async (req, res, next) => {
    try {
      const query = req.validated.query
      const params = buildPageParams(query)
      const rows = await scenes.listRecords({
        ...params,
        userId: query.userId,
        sceneId: query.sceneId,
        q: query.q,
        completed: query.completed,
      })
      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)

/* ------------------------------- AI 会话 / 调用日志 ------------------------------- */

adminRouter.get(
  '/conversations',
  validate({
    query: z.object({
      ...pageQuery,
      userId: z.string().max(64).optional(),
      model: z.string().max(200).optional(),
      q: z.string().trim().max(64).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const query = req.validated.query
      const params = buildPageParams(query)
      const rows = await conversations.adminListConversations({
        ...params,
        userId: query.userId,
        q: query.q,
        model: query.model,
      })
      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)

adminRouter.get(
  '/conversations/:id/messages',
  validate({ query: z.object(pageQuery) }),
  async (req, res, next) => {
    try {
      const conversation = await conversations.getConversation(req.params.id)
      if (!conversation) throw notFound('会话不存在', 'conversation_not_found')

      const params = buildPageParams(req.validated.query, { defaultPageSize: 50 })
      const rows = await conversations.listMessages(conversation.id, params)
      res.json({
        ok: true,
        conversation: { id: conversation.id, title: conversation.title, model: conversation.model },
        ...pageEnvelope(rows, params),
      })
    } catch (error) {
      next(error)
    }
  }
)

adminRouter.delete('/conversations/:id', async (req, res, next) => {
  try {
    const ok = await conversations.deleteConversation(req.params.id)
    if (!ok) throw notFound('会话不存在', 'conversation_not_found')

    await logs.insertAuditLog({
      ...ctx(req),
      action: 'admin.delete_conversation',
      targetType: 'conversation',
      targetId: req.params.id,
      ip: ctx(req).ip,
    })

    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

adminRouter.get(
  '/ai-logs',
  validate({
    query: z.object({
      ...pageQuery,
      userId: z.string().max(64).optional(),
      model: z.string().max(200).optional(),
      status: z.enum(['ok', 'error', 'aborted']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const query = req.validated.query
      const params = buildPageParams(query)
      const rows = await logs.listAiRequestLogs({
        ...params,
        userId: query.userId,
        model: query.model,
        status: query.status,
        from: query.from,
        to: query.to,
      })
      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)

/* ------------------------------- 系统信息 ------------------------------- */

adminRouter.get('/system', async (req, res, next) => {
  try {
    const [db, ollamaHealth, registry] = await Promise.all([
      healthCheck(),
      ollama.healthCheck(),
      getModelRegistry().catch(() => null),
    ])

    res.json({
      ok: true,
      server: {
        nodeVersion: process.version,
        platform: `${process.platform} ${process.arch}`,
        env: config.env,
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        apiPort: config.api.port,
      },
      database: { ...db, name: config.db.database, host: config.db.host, port: config.db.port },
      ollama: ollamaHealth,
      models: {
        total: registry?.models?.length ?? 0,
        loaded: registry?.models?.filter((model) => model.running).length ?? 0,
        defaultModel: registry?.defaultModel ?? '',
        sources: registry?.sources ?? null,
        list: (registry?.models ?? []).map((model) => ({
          name: model.name,
          sizeText: model.sizeText,
          parameterSize: model.parameterSize,
          quantization: model.quantization,
          source: model.source,
          available: model.available,
          running: model.running,
          vramText: model.vramText,
          hint: model.hint,
        })),
      },
      config: {
        bcryptRounds: config.auth.bcryptRounds,
        accessTtlSeconds: config.auth.accessTtlSeconds,
        refreshTtlSeconds: config.auth.refreshTtlSeconds,
        resetTtlSeconds: config.auth.resetTtlSeconds,
        maxFailedLogins: config.auth.maxFailedLogins,
        lockMinutes: config.auth.lockMinutes,
        allowTeacherSelfRegister: config.auth.allowTeacherSelfRegister,
        exposeResetToken: config.auth.exposeResetToken,
        keepAlive: config.ollama.keepAlive,
        systemPrompt: config.ollama.systemPrompt,
      },
    })
  } catch (error) {
    next(error)
  }
})

/** 手动刷新模型缓存，供模型管理页的「刷新」按钮调用。 */
adminRouter.post('/system/refresh-models', async (req, res, next) => {
  try {
    invalidateModelCache()
    const registry = await getModelRegistry({ refresh: true })
    res.json({ ok: true, count: registry.models.length, defaultModel: registry.defaultModel })
  } catch (error) {
    next(error)
  }
})

/** 服务端常量：每页条数候选，供前端分页器渲染。 */
adminRouter.get('/system/page-sizes', (req, res) => {
  res.json({ ok: true, pageSizes: [10, 20, 50, 100] })
})
