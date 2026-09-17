import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { config } from '../config.js'
import { badRequest } from '../utils/httpError.js'

// bcrypt 只取前 72 字节，超长密码会被静默截断。显式拒绝而不是让用户以为更长的密码更安全。
const MAX_PASSWORD_BYTES = 72
const MIN_PASSWORD_LENGTH = 8

export function hashPassword(plain) {
  assertPasswordPolicy(plain)
  return bcrypt.hash(plain, config.auth.bcryptRounds)
}

export async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}

/** 密码策略：8 位以上、至少含字母与数字、不超过 72 字节。 */
export function assertPasswordPolicy(plain) {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`密码长度不能少于 ${MIN_PASSWORD_LENGTH} 位`, 'weak_password')
  }
  if (Buffer.byteLength(plain, 'utf8') > MAX_PASSWORD_BYTES) {
    throw badRequest(`密码过长（最多 ${MAX_PASSWORD_BYTES} 字节）`, 'weak_password')
  }
  if (!/[A-Za-z]/.test(plain) || !/[0-9]/.test(plain)) {
    throw badRequest('密码必须同时包含字母和数字', 'weak_password')
  }
}

/** 生成 URL 安全的随机令牌明文（只返回给用户一次，库里存哈希）。 */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

/** 定长哈希比较，避免计时侧信道。 */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** 生成一个满足密码策略的随机初始密码，用于管理员建号。 */
export function generatePassword(length = 12) {
  const letters = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const all = letters + digits
  const pick = (set) => set[randomBytes(1)[0] % set.length]
  const chars = [pick(letters), pick(letters), pick(digits), pick(digits)]
  while (chars.length < length) chars.push(pick(all))
  // Fisher-Yates 洗牌，保证字母数字位置不固定。
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
