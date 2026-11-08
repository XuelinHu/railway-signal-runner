import { config } from '../config.js'
import * as users from '../repositories/userRepository.js'
import { hashPassword } from './passwordService.js'
import { issueRefreshToken, signAccessToken } from './tokenService.js'
import { toPublicUser } from './authService.js'
import { forbidden } from '../utils/httpError.js'

const REMARK = 'development-only-account'
export const DEV_TEST_ACCOUNTS = [
  { id: 'devtest-admin', username: 'test_admin', password: 'AdminTest@123', displayName: '测试管理员', role: 'admin' },
  { id: 'devtest-admin-02', username: 'test_admin_02', password: 'AdminTest02@123', displayName: '测试管理员二号', role: 'admin' },
  ...Array.from({ length: 10 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    return { id: `devtest-student-${number}`, username: `test_student_${number}`, password: `StudentTest${number}@123`, displayName: `测试学生${index + 1}`, role: 'student' }
  }),
]
const ACCOUNT_BY_ID = new Map(DEV_TEST_ACCOUNTS.map((account) => [account.id, account]))
export function isDevTestAccount(user) { return ACCOUNT_BY_ID.has(user?.id) }
export function isLocalDevRequest(req) {
  const local = (address) => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  return config.auth.devTestLogin && req.headers?.['x-rsr-dev-local'] === '1' && local(req.ip) && local(req.socket?.remoteAddress)
}
let preparing
export function ensureDevTestAccounts() {
  if (!config.auth.devTestLogin) return Promise.resolve()
  if (!preparing) {
    preparing = Promise.all(DEV_TEST_ACCOUNTS.map(async (account) => {
      const existing = await users.findById(account.id)
      if (existing) {
        if (existing.username !== account.username || existing.role !== account.role || existing.remark !== REMARK || existing.status !== 'active' || existing.deleted_at) throw new Error(`保留测试账号 ${account.username} 已被修改；不会覆盖已有账号`)
        return
      }
      if (await users.usernameExists(account.username)) throw new Error(`测试用户名 ${account.username} 已被占用；不会覆盖已有账号`)
      await users.insertUser({ id: account.id, username: account.username, displayName: account.displayName, role: account.role, passwordHash: await hashPassword(account.password), remark: REMARK })
    })).catch((error) => { preparing = null; throw error })
  }
  return preparing
}
export function listDevTestAccounts() { return DEV_TEST_ACCOUNTS.map(({ id, username, password, displayName, role }) => ({ id, username, password, displayName, role })) }
export async function loginAsDevTestAccount(id, { ip, userAgent } = {}) {
  const account = ACCOUNT_BY_ID.get(id)
  if (!config.auth.devTestLogin || !account) throw forbidden('测试登录未开放', 'dev_login_disabled')
  await ensureDevTestAccounts()
  const user = await users.findById(account.id)
  if (!user || user.username !== account.username || user.role !== account.role || user.remark !== REMARK || user.status !== 'active') throw forbidden('测试账号不可用', 'dev_account_unavailable')
  const refresh = await issueRefreshToken(user.id, { ip, userAgent })
  return { user: toPublicUser(user), accessToken: signAccessToken(user), refreshToken: refresh.raw, expiresIn: config.auth.accessTtlSeconds }
}
