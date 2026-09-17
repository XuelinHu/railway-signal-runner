import { Router } from 'express'
import { authRouter } from './authRoutes.js'
import { userRouter } from './userRoutes.js'
import { adminRouter } from './adminRoutes.js'
import { aiRouter } from './aiRoutes.js'
import { sceneRouter, recordRouter } from './sceneRoutes.js'
import { healthCheck } from '../db/pool.js'
import { healthCheck as ollamaHealthCheck } from '../services/ollamaService.js'

export const apiRouter = Router()

/** 健康检查：同时反映数据库与模型服务状态，供前端做能力探测。 */
apiRouter.get('/health', async (req, res) => {
  const [db, ollama] = await Promise.all([healthCheck(), ollamaHealthCheck()])
  res.status(db.ok ? 200 : 503).json({
    ok: db.ok,
    service: 'railway-signal-runner-api',
    time: new Date().toISOString(),
    database: db,
    ollama,
  })
})

apiRouter.use('/auth', authRouter)
apiRouter.use('/users', userRouter)
apiRouter.use('/admin', adminRouter)
apiRouter.use('/ai', aiRouter)
apiRouter.use('/scenes', sceneRouter)
apiRouter.use('/records', recordRouter)
