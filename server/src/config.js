import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')

// 两个位置都读：server/.env 放后端专属配置，根 .env 与前端共用（vite.config.js 也读它）。
// dotenv 默认不覆盖已存在的变量，因此先加载的优先，进程环境变量永远最高。
for (const file of [resolve(projectRoot, 'server/.env'), resolve(projectRoot, '.env')]) {
  if (existsSync(file)) dotenv.config({ path: file, quiet: true })
}

function str(key, fallback = '') {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}

function num(key, fallback) {
  const value = Number(process.env[key])
  return Number.isFinite(value) ? value : fallback
}

function bool(key, fallback = false) {
  const value = str(key)
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function list(key) {
  return str(key)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const config = {
  env: str('NODE_ENV', 'development'),
  projectRoot,

  api: {
    host: str('API_HOST', '0.0.0.0'),
    // 8038 取自本工作区后端端口段的预留位（8038-8040）。
    // 注意不要用 8037：该端口已被相邻项目 railway_sign 的 API 占用，
    // 占用会导致 Vite 的 /api 代理打到错误的服务上。
    // 该端口会被 frpc.toml 的范围模板自动映射到公网 18038。
    port: num('API_PORT', 8038),
  },

  db: {
    host: str('PGHOST', '127.0.0.1'),
    port: num('PGPORT', 5432),
    user: str('PGUSER', 'deipss'),
    password: str('PGPASSWORD', ''),
    database: str('PGDATABASE', 'railway_signal_runner'),
    max: num('PG_POOL_MAX', 10),
    idleTimeoutMillis: num('PG_IDLE_TIMEOUT_MS', 30_000),
    connectionTimeoutMillis: num('PG_CONNECT_TIMEOUT_MS', 5_000),
    statementTimeout: num('PG_STATEMENT_TIMEOUT_MS', 30_000),
  },

  auth: {
    jwtSecret: str('JWT_SECRET', ''),
    jwtIssuer: str('JWT_ISSUER', 'railway-signal-runner'),
    accessTtlSeconds: num('JWT_ACCESS_TTL', 2 * 60 * 60), // 2 小时
    refreshTtlSeconds: num('JWT_REFRESH_TTL', 30 * 24 * 60 * 60), // 30 天
    resetTtlSeconds: num('PASSWORD_RESET_TTL', 30 * 60), // 30 分钟
    bcryptRounds: num('BCRYPT_ROUNDS', 10),
    maxFailedLogins: num('MAX_FAILED_LOGINS', 5),
    lockMinutes: num('LOCK_MINUTES', 15),
    // 自助注册能否直接注册为老师。默认关闭：老师需要管理员审批后启用。
    allowTeacherSelfRegister: bool('ALLOW_TEACHER_SELF_REGISTER', false),
    // 开发便利开关：忘记密码接口直接把重置链接回显在响应里。
    // 生产必须保持关闭，否则任何人都能重置任意账号。
    exposeResetToken: bool('EXPOSE_RESET_TOKEN', false),
  },

  cors: {
    // 同源部署下浏览器只访问前端端口，由 Vite 代理转发，理论上不需要 CORS。
    // 这里保留白名单是为了支持局域网内其它设备直连 API。
    origins: list('CORS_ORIGINS'),
  },

  ollama: {
    baseUrl: str('OLLAMA_BASE_URL', 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    requestTimeoutMs: num('OLLAMA_TIMEOUT_MS', 120_000),
    keepAlive: str('OLLAMA_KEEP_ALIVE', '5m'),
    modelCacheTtlMs: num('OLLAMA_MODEL_CACHE_TTL_MS', 30_000),
    defaultModel: str('AI_DEFAULT_MODEL', ''),
    allowlist: list('AI_MODEL_ALLOWLIST'),
    denylist: list('AI_MODEL_DENYLIST'),
    systemPrompt: str(
      'AI_SYSTEM_PROMPT',
      '你是铁道信号巡检仿真实训平台的智能助手，服务于铁路信号专业的学生和教师。' +
        '请用简体中文回答，语言简洁准确、条理清晰。涉及铁路信号设备、行车规章、巡检作业流程的问题要严谨，' +
        '不确定的内容要明确说明，不要编造规章条款或设备参数。'
    ),
  },

  rateLimit: {
    // max 是单账号额度，ipMax 是同一出口 IP 的总额度。
    // 后者放宽是有意的：学校机房/单位 NAT 下成百上千人共用一个公网 IP。
    login: {
      windowMs: 15 * 60 * 1000,
      max: num('RATE_LIMIT_LOGIN', 10),
      ipMax: num('RATE_LIMIT_LOGIN_IP', 100),
    },
    register: { windowMs: 60 * 60 * 1000, max: num('RATE_LIMIT_REGISTER', 5) },
    forgotPassword: { windowMs: 60 * 60 * 1000, max: num('RATE_LIMIT_FORGOT', 3) },
    chat: { windowMs: 60 * 1000, max: num('RATE_LIMIT_CHAT', 30) },
  },
}

// JWT 密钥缺失时不能让服务带病启动：那会签发任何人都能伪造的令牌。
// 开发环境自动生成一个临时密钥并告警，生产环境直接拒绝启动。
if (!config.auth.jwtSecret) {
  if (config.env === 'production') {
    throw new Error('缺少 JWT_SECRET 环境变量，生产环境拒绝启动')
  }
  const { randomBytes } = await import('node:crypto')
  config.auth.jwtSecret = randomBytes(32).toString('hex')
  console.warn('[config] 未设置 JWT_SECRET，已生成临时密钥；重启后所有登录态失效。')
}

if (!config.db.password) {
  console.warn('[config] 未设置 PGPASSWORD，数据库连接可能失败。')
}
