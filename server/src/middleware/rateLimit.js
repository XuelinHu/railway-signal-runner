import { tooManyRequests } from '../utils/httpError.js'

/**
 * 进程内滑动窗口限流。单实例部署足够用；
 * 若日后要多实例，把 store 换成 Redis 即可，接口不用动。
 */
const buckets = new Map()

// 定期清理过期桶，避免长期运行内存无界增长。
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, hits] of buckets) {
    const alive = hits.filter((time) => now - time < 60 * 60 * 1000)
    if (alive.length === 0) buckets.delete(key)
    else buckets.set(key, alive)
  }
}, CLEANUP_INTERVAL_MS)
cleanupTimer.unref?.()

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.ip || req.socket?.remoteAddress || ''
}

/**
 * 单桶限流。max 与 identity 都可以传函数，按请求动态求值。
 * 未超限时记账并返回剩余额度，超限时返回重试秒数。
 */
function hitBucket({ bucketKey, windowMs, max: maxLimit, now }) {
  const hits = (buckets.get(bucketKey) ?? []).filter((time) => now - time < windowMs)
  if (hits.length >= maxLimit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000)) }
  }
  hits.push(now)
  buckets.set(bucketKey, hits)
  return { ok: true }
}

/**
 * 进程内滑动窗口限流。单实例部署足够用；
 * 若日后要多实例，把 store 换成 Redis 即可，接口不用动。
 *
 * `tiers` 用来叠加多个维度，任一超限即拒绝，用来避免"一刀切按 IP"：
 * 登录接口若只按 IP 计，同一出口 IP（学校机房、单位 NAT）下一个人输错密码
 * 就会把整个网段的人锁在门外。改成「按账号 10 次 + 按 IP 60 次兜底」后，
 * 暴力破解仍被按账号拦住，正常用户互不影响。
 */
export function rateLimit({ windowMs, max, keyPrefix = 'rl', byUser = false, identity, tiers = [] }) {
  const allTiers = [{ windowMs, max, keyPrefix, byUser, identity }, ...tiers]

  return (req, res, next) => {
    const now = Date.now()

    for (const tier of allTiers) {
      // 已登录时按用户限流更公平（同一出口 IP 的多个用户不会互相拖累）。
      const identity = tier.byUser && req.user
        ? `u:${req.user.id}`
        : tier.identity
          ? tier.identity(req)
          : `ip:${getClientIp(req)}`
      if (!identity) continue

      const maxLimit = typeof tier.max === 'function' ? tier.max(req) : tier.max
      const result = hitBucket({
        bucketKey: `${tier.keyPrefix}:${identity}`,
        windowMs: tier.windowMs,
        max: maxLimit,
        now,
      })

      if (!result.ok) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds))
        // details 里带上桶的维度与上限，便于排查"为什么我被限流了"。
        // 不含任何凭据，只是限流器自身的状态。
        return next(
          tooManyRequests(`操作过于频繁，请在 ${result.retryAfterSeconds} 秒后重试`, 'rate_limited', {
            bucket: tier.keyPrefix,
            identity,
            max: maxLimit,
            windowMs: tier.windowMs,
          })
        )
      }
    }

    next()
  }
}
