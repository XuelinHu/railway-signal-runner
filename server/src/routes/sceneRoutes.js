import { Router } from 'express'
import { z } from 'zod'
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { getClientIp } from '../middleware/rateLimit.js'
import * as scenes from '../repositories/sceneRepository.js'
import { insertAuditLog } from '../repositories/logRepository.js'
import { buildPageParams, pageEnvelope } from '../services/pagination.js'
import { forbidden, notFound } from '../utils/httpError.js'

export const sceneRouter = Router()

const ctx = (req) => ({ ip: getClientIp(req), userId: req.user?.id, username: req.user?.username })

const pageQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(64).optional(),
})

/**
 * 场景列表。
 * 未登录也能读已发布场景（保留原有的免登录练习流程），但只有登录后
 * 才能看到自己未发布的草稿。
 */
sceneRouter.get(
  '/',
  optionalAuth,
  validate({
    query: z.object({
      ...pageQuery.shape,
      published: z
        .enum(['0', '1', 'true', 'false'])
        .optional()
        .transform((value) => (value === undefined ? undefined : value === '1' || value === 'true')),
      mine: z
        .enum(['0', '1', 'true', 'false'])
        .optional()
        .transform((value) => value === '1' || value === 'true'),
    }),
  }),
  async (req, res, next) => {
    try {
      const query = req.validated.query
      const params = buildPageParams(query, { defaultPageSize: 50 })

      if (query.mine) {
        if (!req.user) return next(forbidden('请先登录', 'login_required'))
        const rows = await scenes.listScenes({ ...params, ownerId: req.user.id, q: query.q })
        return res.json({ ok: true, ...pageEnvelope(rows, params) })
      }

      // 默认只给已发布的场景；管理员可显式查看全部。
      const published = query.published ?? true
      const includeDeleted = false
      const rows = await scenes.listScenes({
        ...params,
        q: query.q,
        published,
        includeDeleted,
      })
      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)

/** 学生端进入练习时取完整场景（含 payload）。 */
sceneRouter.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const scene = await scenes.getScene(req.params.id)
    if (!scene || scene.deleted_at) return next(notFound('场景不存在', 'scene_not_found'))

    // 未发布的草稿只有作者本人和管理员能看。
    if (!scene.published) {
      const isOwner = req.user && scene.owner_id === req.user.id
      const isAdmin = req.user?.role === 'admin'
      if (!isOwner && !isAdmin) {
        return next(forbidden('该场景尚未发布', 'scene_not_published'))
      }
    }

    res.json({ ok: true, scene })
  } catch (error) {
    next(error)
  }
})

sceneRouter.post(
  '/',
  requireAuth,
  requireRole('teacher', 'admin'),
  validate({
    body: z.object({
      id: z.string().max(64).optional(),
      name: z.string().trim().min(1, '请填写场景名称').max(100),
      description: z.string().trim().max(500).optional().nullable(),
      difficulty: z.enum(['easy', 'normal', 'hard']).optional().nullable(),
      payload: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const body = req.validated.body

      // 带 id 视为更新，需要校验归属，避免覆盖别人的场景。
      if (body.id) {
        const existing = await scenes.getScene(body.id)
        if (existing && existing.owner_id && existing.owner_id !== req.user.id && req.user.role !== 'admin') {
          return next(forbidden('无权修改他人的场景', 'scene_forbidden'))
        }
      }

      const scene = await scenes.upsertScene({
        id: body.id,
        name: body.name,
        description: body.description,
        difficulty: body.difficulty,
        ownerId: req.user.id,
        payload: body.payload,
      })

      await insertAuditLog({
        ...ctx(req),
        action: 'scene.save',
        targetType: 'scene',
        targetId: scene.id,
        detail: { name: scene.name },
      })

      res.status(201).json({ ok: true, scene })
    } catch (error) {
      next(error)
    }
  }
)

sceneRouter.post('/:id/publish', requireAuth, requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const existing = await scenes.getScene(req.params.id)
    if (!existing || existing.deleted_at) return next(notFound('场景不存在', 'scene_not_found'))
    if (existing.owner_id && existing.owner_id !== req.user.id && req.user.role !== 'admin') {
      return next(forbidden('无权发布他人的场景', 'scene_forbidden'))
    }

    const published = req.body?.published !== false
    const scene = await scenes.setPublished(req.params.id, published)

    await insertAuditLog({
      ...ctx(req),
      action: published ? 'scene.publish' : 'scene.unpublish',
      targetType: 'scene',
      targetId: scene.id,
    })

    res.json({ ok: true, scene })
  } catch (error) {
    next(error)
  }
})

sceneRouter.delete('/:id', requireAuth, requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const existing = await scenes.getScene(req.params.id)
    if (!existing || existing.deleted_at) return next(notFound('场景不存在', 'scene_not_found'))
    if (existing.owner_id && existing.owner_id !== req.user.id && req.user.role !== 'admin') {
      return next(forbidden('无权删除他人的场景', 'scene_forbidden'))
    }

    await scenes.softDeleteScene(req.params.id)
    await insertAuditLog({
      ...ctx(req),
      action: 'scene.delete',
      targetType: 'scene',
      targetId: req.params.id,
    })

    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

/* ------------------------------- 成绩记录 ------------------------------- */

export const recordRouter = Router()

recordRouter.get(
  '/',
  requireAuth,
  validate({
    query: z.object({
      ...pageQuery.shape,
      sceneId: z.string().max(64).optional(),
      mine: z.enum(['0', '1']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const query = req.validated.query
      const params = buildPageParams(query)

      // 非管理员只能看自己的成绩。
      const scopedUserId = req.user.role === 'admin' && query.mine !== '1' ? undefined : req.user.id

      const rows = await scenes.listRecords({
        ...params,
        userId: scopedUserId,
        sceneId: query.sceneId,
        q: query.q,
      })
      res.json({ ok: true, ...pageEnvelope(rows, params) })
    } catch (error) {
      next(error)
    }
  }
)

recordRouter.post(
  '/',
  requireAuth,
  validate({
    body: z.object({
      id: z.string().max(64).optional(),
      sceneId: z.string().max(64).optional().nullable(),
      sceneName: z.string().max(100).optional().nullable(),
      studentName: z.string().max(50).optional().nullable(),
      score: z.number().int().min(0).max(1000).optional().nullable(),
      elapsedSeconds: z.number().int().min(0).max(86_400).optional().nullable(),
      completed: z.boolean().optional(),
      inspectedCount: z.number().int().min(0).optional().nullable(),
      mistakeCount: z.number().int().min(0).optional().nullable(),
      payload: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const record = await scenes.insertRecord({
        ...req.validated.body,
        // 成绩一律记在当前登录用户名下，不接受客户端伪造 userId。
        userId: req.user.id,
        studentName: req.validated.body.studentName || req.user.display_name || req.user.username,
      })
      res.status(201).json({ ok: true, record })
    } catch (error) {
      next(error)
    }
  }
)
