import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test, { after, before } from 'node:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'

const { privateKey, publicKey } = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'runner-test-key', alg: 'RS256', use: 'sig' }
let issuer
let nonce
let service
let server

before(async () => {
  server = createServer(async (request, response) => {
    if (request.url === '/realms/front/.well-known/openid-configuration') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` }))
      return
    }
    if (request.url === '/realms/front/jwks') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ keys: [jwk] }))
      return
    }
    if (request.url === '/realms/front/token') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = new URLSearchParams(Buffer.concat(chunks).toString())
      const idToken = await new SignJWT({ nonce, azp: 'railway-signal-runner-web' })
        .setProtectedHeader({ alg: 'RS256', kid: 'runner-test-key' })
        .setIssuer(issuer).setAudience('railway-signal-runner-web').setSubject('runner-test-subject')
        .setIssuedAt().setExpirationTime('2m').sign(privateKey)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ id_token: idToken, verifier: body.get('code_verifier') }))
      return
    }
    response.writeHead(404).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  issuer = `http://127.0.0.1:${server.address().port}/realms/front`
  process.env.OIDC_ISSUER = issuer
  process.env.OIDC_CLIENT_ID = 'railway-signal-runner-web'
  process.env.OIDC_REDIRECT_ORIGINS = 'http://localhost:4029'
  process.env.NODE_ENV = 'test'
  service = await import('../server/src/services/oidcService.js')
})

after(async () => new Promise((resolve) => server.close(resolve)))

test('OIDC start rejects unregistered origins and uses PKCE S256', async () => {
  await assert.rejects(service.startOidc({ mode: 'login', redirectUri: 'https://attacker.example/' }), /未登记/)
  const result = await service.startOidc({ mode: 'login', redirectUri: 'http://localhost:4029/' })
  const url = new URL(result.authorizationUrl)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(service.takeOidcTransaction(result.cookieKey, 'wrong-state'), null)
})

test('OIDC callback verifies a signed ID token and rejects a mismatched nonce', async () => {
  const result = await service.startOidc({ mode: 'login', redirectUri: 'http://localhost:4029/' })
  const url = new URL(result.authorizationUrl)
  const transaction = service.takeOidcTransaction(result.cookieKey, url.searchParams.get('state'))
  nonce = url.searchParams.get('nonce')
  assert.equal(await service.exchangeOidcCode(transaction, 'test-code'), 'runner-test-subject')

  const bad = await service.startOidc({ mode: 'login', redirectUri: 'http://localhost:4029/' })
  const badUrl = new URL(bad.authorizationUrl)
  const badTransaction = service.takeOidcTransaction(bad.cookieKey, badUrl.searchParams.get('state'))
  nonce = 'wrong-nonce'
  await assert.rejects(service.exchangeOidcCode(badTransaction, 'test-code'), /无效/)
})
