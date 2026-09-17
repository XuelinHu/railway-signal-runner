import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { apiRouter } from './routes/index.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { requestLog } from './middleware/requestLog.js'

/**
 * CORS 策略。
 *
 * 正常部署下前端与 API 同源（浏览器只访问前端端口，由 Vite 代理 /api），
 * 所以生产环境默认不开放跨域。这里保留白名单是为了支持局域网内其它设备直连。
 * 无 Origin 的请求（curl、服务端调用）一律放行。
 */
function corsOptions() {
  const allowed = new Set(config.cors.origins)

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true)
      if (allowed.has(origin)) return callback(null, true)
      // 开发环境放宽到本机各端口，方便 vite dev/preview 与调试页面直连。
      if (config.env !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true)
      }
      return callback(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // 流式响应需要前端能读到这几个头。
    exposedHeaders: ['Content-Length', 'X-Accel-Buffering'],
  }
}

export function createApp() {
  const app = express()

  // FRP / nginx 会加 X-Forwarded-For，信任代理后才能拿到真实客户端 IP 用于限流与日志。
  app.set('trust proxy', true)
  app.disable('x-powered-by')

  app.use(cors(corsOptions()))
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: false, limit: '2mb' }))
  app.use(requestLog)

  app.use('/api', apiRouter)

  // 根路径给一个简短说明，方便直接访问端口时确认服务活着。
  app.get('/', (req, res) => {
    res.json({
      ok: true,
      service: 'railway-signal-runner-api',
      hint: 'API 前缀为 /api，健康检查为 /api/health',
    })
  })

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
