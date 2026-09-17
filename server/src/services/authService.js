import { config } from '../config.js'
import * as users from '../repositories/userRepository.js'
import * as tokens from '../repositories/tokenRepository.js'
import { insertLoginLog, insertAuditLog } from '../repositories/logRepository.js'
import { hashPassword, verifyPassword, randomToken } from './passwordService.js'
import { issueRefreshToken, revokeAllUserTokens, signAccessToken } from './tokenService.js'
import { badRequest, conflict, forbidden, unauthorized } from '../utils/httpError.js'

/** 对外的用户视图：绝不包含 password_hash 或锁定细节以外的内部字段。 */
export function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    mustChangePassword: user.must_change_password,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  }
}

function meta(ctx) {
  return { ip: ctx?.ip ?? null, userAgent: ctx?.userAgent ?? null }
}

export async function register(input, ctx) {
  const role = input.role ?? 'student'

  // 自助注册永远不能产生管理员；老师账号默认需要管理员开通。
  if (role === 'admin') {
    throw forbidden('管理员账号不能自助注册，请联系系统管理员', 'admin_register_forbidden')
  }
  if (role === 'teacher' && !config.auth.allowTeacherSelfRegister) {
    throw forbidden('教师账号需要管理员开通，请先用学生身份注册或联系管理员', 'teacher_register_forbidden')
  }

  if (await users.usernameExists(input.username)) {
    throw conflict('该用户名已被占用', 'username_taken')
  }
  if (input.email && (await users.emailExists(input.email))) {
    throw conflict('该邮箱已被注册', 'email_taken')
  }
  if (input.phone && (await users.phoneExists(input.phone))) {
    throw conflict('该手机号已被注册', 'phone_taken')
  }

  const user = await users.insertUser({
    username: input.username.trim(),
    displayName: input.displayName?.trim() || input.username.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    passwordHash: await hashPassword(input.password),
    role,
    status: 'active',
  })

  await insertAuditLog({
    userId: user.id,
    username: user.username,
    action: 'user.register',
    targetType: 'user',
    targetId: user.id,
    detail: { role },
    ip: ctx?.ip,
  })

  return toPublicUser(user)
}

export async function login({ username, password }, ctx) {
  const { ip, userAgent } = meta(ctx)
  const user = await users.findByUsernameWithSecret(username)

  // 用户不存在也记一条日志，方便发现撞库行为。
  if (!user) {
    await insertLoginLog({
      userId: null,
      usernameInput: username,
      success: false,
      failureReason: 'no_such_user',
      ip,
      userAgent,
    })
    throw unauthorized('用户名或密码错误', 'bad_credentials')
  }

  if (user.status === 'disabled') {
    await insertLoginLog({
      userId: user.id,
      usernameInput: username,
      success: false,
      failureReason: 'disabled',
      ip,
      userAgent,
    })
    throw forbidden('账号已被禁用，请联系管理员', 'account_disabled')
  }

  // 锁定期内直接拒绝，不再消耗 bcrypt 计算。
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await insertLoginLog({
      userId: user.id,
      usernameInput: username,
      success: false,
      failureReason: 'locked',
      ip,
      userAgent,
    })
    const remainMinutes = Math.max(1, Math.ceil((new Date(user.locked_until) - Date.now()) / 60000))
    throw forbidden(`账号已锁定，请在 ${remainMinutes} 分钟后重试或联系管理员解锁`, 'account_locked')
  }

  const passwordOk = await verifyPassword(password, user.password_hash)
  if (!passwordOk) {
    const state = await users.recordLoginFailure(user.id, config.auth.maxFailedLogins, config.auth.lockMinutes)
    await insertLoginLog({
      userId: user.id,
      usernameInput: username,
      success: false,
      failureReason: 'bad_password',
      ip,
      userAgent,
    })

    // 刚好触发锁定的一次要明确告知，否则用户不明白为什么突然登录不了。
    if (state.failedLoginCount >= config.auth.maxFailedLogins) {
      await insertAuditLog({
        userId: user.id,
        username: user.username,
        action: 'user.locked',
        targetType: 'user',
        targetId: user.id,
        detail: { failedLoginCount: state.failedLoginCount },
        ip,
      })
      throw forbidden(
        `密码错误次数过多，账号已锁定 ${config.auth.lockMinutes} 分钟`,
        'account_locked'
      )
    }

    const remaining = Math.max(0, config.auth.maxFailedLogins - state.failedLoginCount)
    throw unauthorized(`用户名或密码错误，还可尝试 ${remaining} 次`, 'bad_credentials')
  }

  await users.recordLoginSuccess(user.id, ip)
  await insertLoginLog({
    userId: user.id,
    usernameInput: username,
    success: true,
    ip,
    userAgent,
  })

  const refresh = await issueRefreshToken(user.id, { ip, userAgent })

  return {
    user: toPublicUser({ ...user, last_login_at: new Date() }),
    accessToken: signAccessToken(user),
    refreshToken: refresh.raw,
    expiresIn: config.auth.accessTtlSeconds,
  }
}

/** 刷新令牌换发时按 userId 重新加载用户，保证角色/状态变更即时生效。 */
export async function loadUserForToken(userId) {
  const user = await users.findById(userId)
  if (!user || user.deleted_at) throw unauthorized('账号不存在或已注销', 'account_missing')
  if (user.status === 'disabled') throw forbidden('账号已被禁用，请联系管理员', 'account_disabled')
  if (user.status === 'locked') throw forbidden('账号已锁定，请联系管理员解锁', 'account_locked')
  return user
}

/** 预检重置令牌，供前端在渲染表单前判断链接是否还能用。 */
export async function peekResetToken(token) {
  const row = await tokens.findResetToken(token)
  if (!row) throw badRequest('重置链接无效', 'invalid_reset_token')
  if (row.used_at) throw badRequest('重置链接已被使用，请重新申请', 'reset_token_used')
  if (new Date(row.expires_at) <= new Date()) {
    throw badRequest('重置链接已过期，请重新申请', 'reset_token_expired')
  }
  return { valid: true, username: row.username, expiresAt: row.expires_at }
}

export async function logout({ refreshToken, all }, ctx) {
  if (all) {
    if (ctx?.userId) await revokeAllUserTokens(ctx.userId)
    return { revoked: 'all' }
  }
  if (refreshToken) {
    const { revokeRefreshToken } = await import('./tokenService.js')
    await revokeRefreshToken(refreshToken)
  }
  return { revoked: 'one' }
}

export async function changePassword(userId, { currentPassword, newPassword }, ctx) {
  const user = await users.findById(userId)
  if (!user) throw unauthorized('账号不存在', 'account_missing')

  const withSecret = await users.findByUsernameWithSecret(user.username)
  const ok = await verifyPassword(currentPassword, withSecret?.password_hash)
  if (!ok) throw badRequest('当前密码不正确', 'bad_password')

  if (currentPassword === newPassword) {
    throw badRequest('新密码不能与当前密码相同', 'same_password')
  }

  await users.updateUser(userId, {
    passwordHash: await hashPassword(newPassword),
    mustChangePassword: false,
  })

  // 改密后强制所有设备重新登录，否则被盗号后改密码也踢不掉攻击者。
  await revokeAllUserTokens(userId)
  await tokens.invalidateUserResetTokens(userId)
  await insertAuditLog({
    userId,
    username: user.username,
    action: 'user.change_password',
    targetType: 'user',
    targetId: userId,
    ip: ctx?.ip,
  })

  return { ok: true }
}

/**
 * 忘记密码第一步：生成一次性重置令牌。
 * 本机没有 SMTP / 短信网关，所以默认不直接投递，而是交给管理员在后台转交。
 * 无论账号是否存在都返回同样的结果，避免暴露哪些账号已注册。
 */
export async function createPasswordReset({ account }, ctx) {
  const user = await users.findByAccountWithSecret(account)
  const genericReply = {
    ok: true,
    message: '如果该账号存在，重置请求已提交，请联系管理员获取重置链接。',
  }

  if (!user || user.deleted_at) return genericReply

  await tokens.invalidateUserResetTokens(user.id)

  const rawToken = randomToken(32)
  const expiresAt = new Date(Date.now() + config.auth.resetTtlSeconds * 1000)
  await tokens.insertResetToken({
    userId: user.id,
    rawToken,
    expiresAt,
    channel: 'manual',
    issuedBy: ctx?.userId ?? null,
    ip: ctx?.ip,
  })

  await insertAuditLog({
    userId: user.id,
    username: user.username,
    action: 'password_reset.requested',
    targetType: 'user',
    targetId: user.id,
    ip: ctx?.ip,
  })

  return {
    ...genericReply,
    // 仅在显式打开 EXPOSE_RESET_TOKEN 的开发环境下回显，生产默认关闭。
    ...(config.auth.exposeResetToken ? { token: rawToken, expiresAt } : {}),
  }
}

/** 管理员在后台为某个用户直接生成重置链接。 */
export async function issueResetLink(userId, ctx) {
  const user = await users.findById(userId)
  if (!user || user.deleted_at) throw badRequest('用户不存在', 'user_not_found')

  await tokens.invalidateUserResetTokens(userId)
  const rawToken = randomToken(32)
  const expiresAt = new Date(Date.now() + config.auth.resetTtlSeconds * 1000)

  await tokens.insertResetToken({
    userId,
    rawToken,
    expiresAt,
    channel: 'admin',
    issuedBy: ctx?.userId ?? null,
    ip: ctx?.ip,
  })

  await insertAuditLog({
    userId: ctx?.userId,
    username: ctx?.username,
    action: 'admin.issue_reset_link',
    targetType: 'user',
    targetId: userId,
    ip: ctx?.ip,
  })

  return { token: rawToken, expiresAt, userId, username: user.username }
}

export async function resetPassword({ token, newPassword }, ctx) {
  const row = await tokens.findResetToken(token)
  if (!row) throw badRequest('重置链接无效', 'invalid_reset_token')
  if (row.used_at) throw badRequest('重置链接已被使用，请重新申请', 'reset_token_used')
  if (new Date(row.expires_at) <= new Date()) {
    throw badRequest('重置链接已过期，请重新申请', 'reset_token_expired')
  }
  if (row.deleted_at) throw badRequest('账号不存在或已注销', 'account_missing')

  await users.updateUser(row.user_id, {
    passwordHash: await hashPassword(newPassword),
    status: row.status === 'locked' ? 'active' : undefined,
    mustChangePassword: false,
  })

  await tokens.consumeResetToken(row.id, row.user_id)
  await revokeAllUserTokens(row.user_id)

  await insertAuditLog({
    userId: row.user_id,
    username: row.username,
    action: 'password_reset.completed',
    targetType: 'user',
    targetId: row.user_id,
    ip: ctx?.ip,
  })

  return { ok: true, username: row.username }
}
