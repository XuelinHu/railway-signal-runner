import { createApp } from './app.js'
import { config } from './config.js'
import { closePool, healthCheck } from './db/pool.js'
import { purgeExpiredTokens } from './services/tokenService.js'
import { purgeExpiredResetTokens } from './repositories/tokenRepository.js'
import { logger } from './utils/logger.js'

const app = createApp()

const server = app.listen(config.api.port, config.api.host, async () => {
  logger.info('API 服务已启动', {
    url: `http://${config.api.host}:${config.api.port}`,
    env: config.env,
    database: `${config.db.host}:${config.db.port}/${config.db.database}`,
    ollama: config.ollama.baseUrl,
  })

  const db = await healthCheck()
  if (db.ok) logger.info('数据库连接正常', { database: db.database })
  else logger.error('数据库连接失败，请检查 PGPASSWORD 与库是否已初始化', { error: db.error })

  // 启动时清理一次过期令牌，之后每小时一次。
  runCleanup()
  setInterval(runCleanup, 60 * 60 * 1000).unref?.()
})

async function runCleanup() {
  try {
    const [tokens, resets] = await Promise.all([purgeExpiredTokens(), purgeExpiredResetTokens()])
    if (tokens > 0 || resets > 0) {
      logger.info('清理过期令牌', { refreshTokens: tokens, resetTokens: resets })
    }
  } catch (error) {
    logger.warn('清理过期令牌失败', { error: error.message })
  }
}

// 优雅退出：先停止接受新连接，再关闭连接池，避免 PM2 重启时丢请求。
let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`收到 ${signal}，正在关闭服务`)

  server.close(async () => {
    await closePool().catch(() => {})
    logger.info('服务已关闭')
    process.exit(0)
  })

  // 兜底：10 秒内没关完就强制退出，避免卡住 PM2 重启流程。
  setTimeout(() => {
    logger.warn('关闭超时，强制退出')
    process.exit(1)
  }, 10_000).unref?.()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise 拒绝', { reason: String(reason) })
})
