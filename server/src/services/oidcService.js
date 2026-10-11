import crypto from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { config } from '../config.js'

const issuer = config.auth.oidcIssuer.replace(/\/$/, '')
const clientId = config.auth.oidcClientId
const transactions = new Map()
let metadataPromise
let jwks

export const oidcEnabled = () => Boolean(issuer && clientId)

async function metadata() {
  if (!oidcEnabled()) throw new Error('统一登录尚未配置')
  if (config.env === 'production' && !issuer.startsWith('https://')) throw new Error('生产环境统一身份服务必须使用 HTTPS')
  metadataPromise ||= fetch(`${issuer}/.well-known/openid-configuration`).then(async (response) => {
    if (!response.ok) throw new Error('无法读取统一身份服务配置')
    const value = await response.json()
    if (value.issuer !== issuer || !value.authorization_endpoint || !value.token_endpoint || !value.jwks_uri) {
      throw new Error('统一身份服务配置不完整或 issuer 不匹配')
    }
    jwks = createRemoteJWKSet(new URL(value.jwks_uri))
    return value
  }).catch((error) => { metadataPromise = undefined; throw error })
  return metadataPromise
}

const random = (size = 32) => crypto.randomBytes(size).toString('base64url')
const challenge = (value) => crypto.createHash('sha256').update(value).digest('base64url')

export async function startOidc({ mode, userId, redirectUri }) {
  const provider = await metadata()
  const allowed = new Set(config.auth.oidcRedirectOrigins)
  const redirect = new URL(redirectUri)
  if (!allowed.has(redirect.origin) || redirect.pathname !== '/' || redirect.search || redirect.hash) {
    throw new Error('统一登录回调地址未登记')
  }
  const state = random(24)
  const verifier = random(48)
  const nonce = random(24)
  const cookieKey = random(24)
  const now = Date.now()
  for (const [key, value] of transactions) if (value.expiresAt <= now) transactions.delete(key)
  if (transactions.size >= 1000) throw new Error('统一登录暂不可用，请稍后重试')
  transactions.set(cookieKey, { state, verifier, nonce, mode, userId: userId ?? null, redirectUri, expiresAt: now + 600_000 })
  const url = new URL(provider.authorization_endpoint)
  url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'openid profile email', redirect_uri: redirectUri, state, nonce, code_challenge: challenge(verifier), code_challenge_method: 'S256' }).toString()
  return { authorizationUrl: url.toString(), cookieKey }
}

export function takeOidcTransaction(cookieKey, state) {
  const value = transactions.get(cookieKey)
  transactions.delete(cookieKey)
  return value && value.expiresAt > Date.now() && value.state === state ? value : null
}

export async function exchangeOidcCode(transaction, code) {
  const provider = await metadata()
  const response = await fetch(provider.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: transaction.redirectUri, code_verifier: transaction.verifier }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('统一身份服务拒绝了授权码')
  const tokens = await response.json()
  if (!tokens.id_token) throw new Error('统一身份服务未返回 ID token')
  const verified = await jwtVerify(tokens.id_token, jwks, { issuer, audience: clientId, algorithms: ['RS256'] })
  if (verified.protectedHeader.alg !== 'RS256' || !verified.payload.sub || verified.payload.nonce !== transaction.nonce) {
    throw new Error('统一身份凭证无效')
  }
  if (verified.payload.azp && verified.payload.azp !== clientId) throw new Error('统一身份凭证客户端不匹配')
  return verified.payload.sub
}
