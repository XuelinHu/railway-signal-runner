import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { getModelRegistry, invalidateModelCache } from '../services/modelRegistry.js'
import * as ollama from '../services/ollamaService.js'
import * as conversations from '../repositories/conversationRepository.js'
import { insertAiRequestLog } from '../repositories/logRepository.js'
import { buildPageParams, pageEnvelope } from '../services/pagination.js'
import { badRequest, forbidden, notFound } from '../utils/httpError.js'
import { beginStream, createLineDecoder, endStream, writeControl, writeFrame } from '../utils/ndjson.js'
import { logger } from '../utils/logger.js'

export const aiRouter = Router()

aiRouter.use(requireAuth)

const MODEL_NAME = z.string().min(1).max(200)

/* ------------------------------- 模型清单 ------------------------------- */

aiRouter.get('/models', async (req, res, next) => {
  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true'
    const registry = await getModelRegistry({ refresh })
    res.json({ ok: true, ...registry })
  } catch (error) {
    next(error)
  }
})

aiRouter.get('/running', async (req, res, next) => {
  try {
    res.json({ ok: true, models: await ollama.listRunning() })
  } catch (error) {
    next(error)
  }
})

/** 预加载模型到显存。加载大模型很慢，前端需要「模型加载中」状态。 */
aiRouter.post(
  '/models/:name/load',
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const name = decodeURIComponent(req.params.name)
      await ollama.loadModel(name)
      invalidateModelCache()
      res.json({ ok: true, model: name, message: `模型 ${name} 已加载` })
    } catch (error) {
      next(error)
    }
  }
)

aiRouter.post(
  '/models/:name/unload',
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const name = decodeURIComponent(req.params.name)
      await ollama.unloadModel(name)
      invalidateModelCache()
      res.json({ ok: true, model: name, message: `模型 ${name} 已卸载` })
    } catch (error) {
      next(error)
    }
  }
)

aiRouter.delete(
  '/models/:name',
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const name = decodeURIComponent(req.params.name)
      await ollama.deleteModel(name)
      invalidateModelCache()
      res.json({ ok: true, model: name, message: `模型 ${name} 已删除` })
    } catch (error) {
      next(error)
    }
  }
)

/** 拉取新模型，把 Ollama 的进度流原样转发。
 *  本机 registry.ollama.ai 实测不可达，失败时给出可读提示。 */
aiRouter.post(
  '/pull',
  requireRole('admin'),
  validate({ body: z.object({ name: MODEL_NAME }) }),
  async (req, res, next) => {
    const { name } = req.validated.body
    let upstream
    try {
      upstream = await ollama.pullModelStream(name)
    } catch (error) {
      return next(error)
    }

    beginStream(res)
    const reader = upstream.body.getReader()

    const push = createLineDecoder((frame) => {
      writeFrame(res, { __railway: 'progress', model: name, ...frame })
    })

    req.on('close', () => {
      reader.cancel().catch(() => {})
    })

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        push(value)
      }
      invalidateModelCache()
      writeControl(res, 'done', { model: name })
    } catch (error) {
      logger.error('模型拉取中断', { model: name, message: error.message })
      writeControl(res, 'error', {
        code: 'pull_failed',
        message: `模型拉取失败：无法连接模型仓库，请检查网络或代理（${error.message}）`,
      })
    } finally {
      endStream(res)
    }
  }
)

/* ------------------------------- 流式对话 ------------------------------- */

const chatSchema = z.object({
  conversationId: z.string().max(64).optional().nullable(),
  model: MODEL_NAME.optional(),
  message: z.string().min(1, '请输入内容').max(8000, '内容过长'),
  // 游戏内场景上下文，用于让模型知道学生当前在做什么
  sceneContext: z.string().max(2000).optional().nullable(),
  options: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      top_p: z.number().min(0).max(1).optional(),
      num_predict: z.number().int().min(1).max(8192).optional(),
    })
    .optional(),
})

aiRouter.post(
  '/chat',
  rateLimit({ ...config.rateLimit.chat, keyPrefix: 'ai-chat', byUser: true }),
  validate({ body: chatSchema }),
  async (req, res, next) => {
    const { conversationId, message, sceneContext, options } = req.validated.body

    let registry
    try {
      registry = await getModelRegistry()
    } catch (error) {
      return next(error)
    }

    const model = req.validated.body.model || registry.defaultModel
    if (!model) {
      return next(badRequest('当前没有可用的对话模型，请先在模型管理中加载模型', 'no_model_available'))
    }

    const known = registry.models.find((item) => item.name === model)
    if (!known) {
      return next(badRequest(`模型 ${model} 不在可用列表中`, 'unknown_model'))
    }
    if (!known.available) {
      return next(badRequest(known.hint || `模型 ${model} 当前不可用`, 'model_unavailable'))
    }
    if (known.isEmbedding) {
      return next(badRequest(`模型 ${model} 是向量模型，不能用于对话`, 'not_a_chat_model'))
    }

    // 会话归属校验：只能在自己的会话里继续对话。
    let conversation = null
    if (conversationId) {
      conversation = await conversations.getConversation(conversationId)
      if (!conversation) return next(notFound('会话不存在', 'conversation_not_found'))
      if (conversation.user_id !== req.user.id && req.user.role !== 'admin') {
        return next(forbidden('无权访问该会话', 'conversation_forbidden'))
      }
    } else {
      conversation = await conversations.createConversation({
        userId: req.user.id,
        title: message.slice(0, 30),
        model,
        systemPrompt: config.ollama.systemPrompt,
      })
    }

    const userMessage = await conversations.appendMessage({
      conversationId: conversation.id,
      userId: req.user.id,
      role: 'user',
      content: message,
      model,
    })

    const history = await conversations.recentMessages(conversation.id, 20)
    const systemPrompt = [conversation.system_prompt || config.ollama.systemPrompt, sceneContext]
      .filter(Boolean)
      .join('\n\n')

    const messages = [{ role: 'system', content: systemPrompt }, ...history]

    const startedAt = Date.now()
    beginStream(res)

    writeControl(res, 'meta', {
      conversationId: conversation.id,
      model,
      userMessageId: userMessage.id,
      title: conversation.title,
    })

    let upstream
    try {
      upstream = await ollama.chatStream({ model, messages, options })
    } catch (error) {
      await conversations.appendMessage({
        conversationId: conversation.id,
        userId: req.user.id,
        role: 'assistant',
        content: '',
        model,
        status: 'error',
        error: error.message,
      })
      writeControl(res, 'error', { code: error.code || 'ollama_error', message: error.message })
      endStream(res)
      await insertAiRequestLog({
        userId: req.user.id,
        conversationId: conversation.id,
        model,
        status: 'error',
        latencyMs: Date.now() - startedAt,
        error: error.message,
      })
      return
    }

    const reader = upstream.body.getReader()
    let answer = ''
    let firstTokenMs = null
    let usage = { promptTokens: null, completionTokens: null }
    let finished = false
    // qwen3 这类思考模型会先吐几秒到几十秒的 thinking，期间 content 一直为空。
    // 前端若只按 content 渲染就会长时间白屏，所以单发一帧告诉它"正在思考"。
    let thinkingAnnounced = false

    // 客户端主动断开时及时释放上游连接，避免显存和连接被长时间占住。
    const onClose = () => {
      if (!finished) reader.cancel().catch(() => {})
    }
    req.on('close', onClose)

    const handleFrame = (frame) => {
      // Ollama 原始帧原样转发，前端按 message.content 增量拼接。
      if (frame?.message?.content) {
        if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt
        answer += frame.message.content
      } else if (frame?.message?.thinking && !thinkingAnnounced) {
        // 只发一次：每帧都带控制帧会把流撑大，前端也只需要知道"开始了"。
        thinkingAnnounced = true
        writeControl(res, 'thinking', { model })
      }
      if (frame?.done) {
        usage = {
          promptTokens: frame.prompt_eval_count ?? null,
          completionTokens: frame.eval_count ?? null,
        }
      }
      writeFrame(res, frame)
    }

    const push = createLineDecoder(handleFrame)

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        push(value)
      }
      finished = true
      const latencyMs = Date.now() - startedAt

      // 一次性把完整回复与用量写库（appendMessage 已含内容，无需再补一次）。
      const assistantMessage = await conversations.appendMessage({
        conversationId: conversation.id,
        userId: req.user.id,
        role: 'assistant',
        content: answer,
        model,
        status: 'ok',
      })

      await conversations.completeAssistantMessage(assistantMessage.id, {
        content: answer,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        latencyMs,
        status: 'ok',
      })

      writeControl(res, 'done', {
        conversationId: conversation.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        firstTokenMs,
        latencyMs,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      })

      await insertAiRequestLog({
        userId: req.user.id,
        conversationId: conversation.id,
        model,
        status: 'ok',
        latencyMs,
        firstTokenMs,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      })
    } catch (error) {
      finished = true
      const aborted = req.destroyed || res.destroyed
      logger.warn('对话流中断', { model, aborted, message: error.message })

      // 已生成的部分内容仍然落库，用户下次打开会话能看到它。
      const assistantMessage = await conversations.appendMessage({
        conversationId: conversation.id,
        userId: req.user.id,
        role: 'assistant',
        content: answer,
        model,
        status: aborted ? 'aborted' : 'error',
        error: aborted ? null : error.message,
      })
      await conversations.completeAssistantMessage(assistantMessage.id, {
        content: answer,
        status: aborted ? 'aborted' : 'error',
        error: aborted ? null : error.message,
      })

      if (!aborted) {
        writeControl(res, 'error', {
          code: 'stream_failed',
          message: `生成中断：${error.message}`,
        })
      }

      await insertAiRequestLog({
        userId: req.user.id,
        conversationId: conversation.id,
        model,
        status: aborted ? 'aborted' : 'error',
        latencyMs: Date.now() - startedAt,
        firstTokenMs,
        error: aborted ? '客户端断开' : error.message,
      })
    } finally {
      req.off('close', onClose)
      endStream(res)
    }
  }
)

/* ------------------------------- 会话管理 ------------------------------- */

const pageQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  q: z.string().max(100).optional(),
})

aiRouter.get(
  '/conversations',
  validate({ query: pageQuery }),
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

aiRouter.post('/conversations', async (req, res, next) => {
  try {
    const conversation = await conversations.createConversation({
      userId: req.user.id,
      title: '新对话',
      model: '',
      systemPrompt: config.ollama.systemPrompt,
    })
    res.status(201).json({ ok: true, conversation })
  } catch (error) {
    next(error)
  }
})

aiRouter.get(
  '/conversations/:id/messages',
  validate({ query: pageQuery }),
  async (req, res, next) => {
    try {
      const conversation = await conversations.getConversation(req.params.id)
      if (!conversation) return next(notFound('会话不存在', 'conversation_not_found'))
      if (conversation.user_id !== req.user.id && req.user.role !== 'admin') {
        return next(forbidden('无权访问该会话', 'conversation_forbidden'))
      }

      const params = buildPageParams(req.validated.query, { defaultPageSize: 50 })
      const rows = await conversations.listMessages(conversation.id, params)
      res.json({
        ok: true,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          model: conversation.model,
        },
        ...pageEnvelope(rows, params),
      })
    } catch (error) {
      next(error)
    }
  }
)

aiRouter.patch(
  '/conversations/:id',
  validate({ body: z.object({ title: z.string().min(1).max(100) }) }),
  async (req, res, next) => {
    try {
      const conversation = await conversations.getConversation(req.params.id)
      if (!conversation) return next(notFound('会话不存在', 'conversation_not_found'))
      if (conversation.user_id !== req.user.id && req.user.role !== 'admin') {
        return next(forbidden('无权修改该会话', 'conversation_forbidden'))
      }
      const updated = await conversations.renameConversation(conversation.id, req.validated.body.title)
      res.json({ ok: true, conversation: updated })
    } catch (error) {
      next(error)
    }
  }
)

aiRouter.delete('/conversations/:id', async (req, res, next) => {
  try {
    const conversation = await conversations.getConversation(req.params.id)
    if (!conversation) return next(notFound('会话不存在', 'conversation_not_found'))
    if (conversation.user_id !== req.user.id && req.user.role !== 'admin') {
      return next(forbidden('无权删除该会话', 'conversation_forbidden'))
    }
    await conversations.deleteConversation(conversation.id)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})
