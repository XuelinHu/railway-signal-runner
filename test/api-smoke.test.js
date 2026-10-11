import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp } from '../server/src/app.js'

let server
let baseUrl

before(async () => {
  server = createApp().listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (!server) return
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('root route reports the service without exposing Express headers', async () => {
  const response = await fetch(baseUrl)
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.service, 'railway-signal-runner-api')
  assert.equal(response.headers.has('x-powered-by'), false)
})

test('registration rejects a weak password before any database access', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'smoketest', password: '123' }),
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.code, 'validation_failed')
  assert.equal(body.ok, false)
})

test('malformed JSON receives a client error without parser details', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"username":',
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.code, 'invalid_json')
  assert.doesNotMatch(body.message, /Unexpected|JSON.parse|stack/i)
})

test('request bodies over the configured limit receive HTTP 413', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(2 * 1024 * 1024) }),
  })
  const body = await response.json()

  assert.equal(response.status, 413)
  assert.equal(body.code, 'payload_too_large')
})

test('unknown API routes use the standard 404 envelope', async () => {
  const response = await fetch(`${baseUrl}/api/does-not-exist`)
  const body = await response.json()

  assert.equal(response.status, 404)
  assert.equal(body.code, 'not_found')
})
