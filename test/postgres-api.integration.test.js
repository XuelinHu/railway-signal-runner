import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { after, test } from 'node:test'

const integrationEnabled = process.env.RUN_POSTGRES_INTEGRATION === '1'
let apiProcess
let ollamaServer

after(async () => {
  if (apiProcess && apiProcess.exitCode === null) {
    apiProcess.kill('SIGTERM')
    await Promise.race([once(apiProcess, 'exit'), delay(3000)])
  }
  if (ollamaServer?.listening) {
    ollamaServer.close()
    await once(ollamaServer, 'close')
  }
})

test('PostgreSQL API authentication, paging, and AI persistence', {
  skip: !integrationEnabled,
  timeout: 60_000,
}, async () => {
  assert.match(process.env.PGDATABASE || '', /_test$/, 'refusing to run outside a _test database')
  assert.ok(process.env.PGPASSWORD, 'PGPASSWORD must be configured')

  ollamaServer = createServer((req, res) => {
    if (req.url === '/api/tags' && req.method === 'GET') {
      return json(res, {
        models: [{ name: 'integration-chat:latest', size: 1, details: { family: 'qwen3' } }],
      })
    }
    if (req.url === '/api/ps' && req.method === 'GET') return json(res, { models: [] })
    if (req.url === '/api/chat' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' })
      res.end([
        JSON.stringify({ model: 'integration-chat:latest', message: { role: 'assistant', content: '隔离测试回复' }, done: false }),
        JSON.stringify({ model: 'integration-chat:latest', message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 2, eval_count: 2 }),
        '',
      ].join('\n'))
      return
    }
    res.writeHead(404).end()
  })
  ollamaServer.listen(0, '127.0.0.1')
  await once(ollamaServer, 'listening')

  const apiPort = await freePort()
  const ollamaPort = ollamaServer.address().port
  apiProcess = spawn(process.execPath, ['server/src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_HOST: '127.0.0.1',
      API_PORT: String(apiPort),
      JWT_SECRET: 'postgres-integration-test-secret-only',
      OLLAMA_BASE_URL: `http://127.0.0.1:${ollamaPort}`,
    },
    stdio: 'ignore',
  })

  const baseUrl = `http://127.0.0.1:${apiPort}`
  await waitForApi(baseUrl)

  const health = await getJson(`${baseUrl}/api/health`)
  assert.equal(health.body.database.ok, true)
  assert.equal(health.body.ollama.ok, true)

  const adminPassword = `Admin${Date.now()}_TestA9`
  const adminSeed = spawnSync(process.execPath, [
    '--env-file-if-exists=server/.env',
    'scripts/seed-admin.mjs',
    '--username', `adminit${Date.now()}`,
    '--password-stdin',
  ], {
    cwd: process.cwd(),
    env: process.env,
    input: `${adminPassword}\n`,
    encoding: 'utf8',
  })
  assert.equal(adminSeed.status, 0, adminSeed.stderr)
  assert.doesNotMatch(adminSeed.stdout, new RegExp(adminPassword))
  const adminUsername = adminSeed.stdout.match(/用户名：(.+)/)?.[1]
  assert.ok(adminUsername)
  const adminLogin = await postJson(`${baseUrl}/api/auth/login`, {
    username: adminUsername,
    password: adminPassword,
  })
  assert.equal(adminLogin.status, 200)
  assert.equal(adminLogin.body.user.role, 'admin')

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const username = `it${suffix}`
  const registered = await postJson(`${baseUrl}/api/auth/register`, {
    username,
    password: 'TestPass123',
    displayName: 'API Integration',
  })
  assert.equal(registered.status, 201)
  assert.equal(registered.body.user.role, 'student')

  const login = await postJson(`${baseUrl}/api/auth/login`, {
    username,
    password: 'TestPass123',
  })
  assert.equal(login.status, 200)
  const token = login.body.accessToken
  assert.ok(token)
  assert.equal((await getJson(`${baseUrl}/api/auth/me`, token)).body.user.username, username)
  assert.equal((await getJson(`${baseUrl}/api/auth/me`)).body.code, 'login_required')

  const headers = { authorization: `Bearer ${token}` }
  for (let index = 0; index < 3; index += 1) {
    const record = await postJson(`${baseUrl}/api/records`, {
      sceneName: `集成场景 ${index + 1}`,
      score: 80 + index,
      completed: true,
    }, headers)
    assert.equal(record.status, 201)
  }

  const pageOne = await getJson(`${baseUrl}/api/records?page=1&pageSize=2`, token)
  const pageTwo = await getJson(`${baseUrl}/api/records?page=2&pageSize=2`, token)
  assert.equal(pageOne.body.total, 3)
  assert.equal(pageOne.body.items.length, 2)
  assert.equal(pageTwo.body.items.length, 1)
  assert.equal(pageTwo.body.page, 2)

  const sceneList = await getJson(`${baseUrl}/api/scenes?page=1&pageSize=10`)
  assert.equal(sceneList.body.ok, true)
  assert.equal(sceneList.body.pageSize, 10)

  const modelList = await getJson(`${baseUrl}/api/ai/models`, token)
  assert.equal(modelList.body.defaultModel, 'integration-chat:latest')
  const chat = await postStream(`${baseUrl}/api/ai/chat`, {
    model: 'integration-chat:latest',
    message: '验证流式会话持久化',
  }, headers)
  const frames = chat.split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const meta = frames.find((frame) => frame.__railway === 'meta')
  assert.ok(meta?.conversationId)
  assert.ok(frames.some((frame) => frame.message?.content === '隔离测试回复'))
  assert.ok(frames.some((frame) => frame.__railway === 'done'))

  const messages = await getJson(
    `${baseUrl}/api/ai/conversations/${meta.conversationId}/messages?page=1&pageSize=10`,
    token
  )
  assert.equal(messages.body.total, 2)
  assert.deepEqual(messages.body.items.map((item) => item.role), ['user', 'assistant'])
  const conversations = await getJson(`${baseUrl}/api/users/me/conversations?page=1&pageSize=10`, token)
  assert.equal(conversations.body.total, 1)
})

async function freePort() {
  const server = createNetServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

async function waitForApi(baseUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (apiProcess.exitCode !== null) throw new Error(`API exited with code ${apiProcess.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {
      await delay(100)
    }
  }
  throw new Error('API did not become ready within 10 seconds')
}

async function getJson(url, token) {
  const response = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  })
  return { status: response.status, body: await response.json() }
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

async function postStream(url, body, headers) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  assert.equal(response.status, 200)
  return response.text()
}

function json(res, body) {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
