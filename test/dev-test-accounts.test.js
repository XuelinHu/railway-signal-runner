import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { config } from '../server/src/config.js'
import { DEV_TEST_ACCOUNTS, isDevTestAccount, isLocalDevRequest } from '../server/src/services/devTestAccounts.js'

test('only reserved account IDs are classified as development test identities', () => {
  assert.equal(isDevTestAccount({ id: 'devtest-admin' }), true)
  assert.equal(isDevTestAccount({ id: 'devtest-student-01' }), true)
  assert.equal(isDevTestAccount({ id: 'u_real_admin' }), false)
})

test('development selector exposes two admins and ten students', () => {
  assert.equal(DEV_TEST_ACCOUNTS.filter((account) => account.role === 'admin').length, 2)
  assert.equal(DEV_TEST_ACCOUNTS.filter((account) => account.role === 'student').length, 10)
  assert.equal(new Set(DEV_TEST_ACCOUNTS.map((account) => account.username)).size, 12)
})

test('test login rejects forwarded non-local clients even behind a local proxy', () => {
  const original = config.auth.devTestLogin
  config.auth.devTestLogin = true
  try {
    const headers = { 'x-rsr-dev-local': '1' }
    assert.equal(isLocalDevRequest({ ip: '::ffff:127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, headers }), true)
    assert.equal(isLocalDevRequest({ ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, headers: {} }), false)
    assert.equal(isLocalDevRequest({ ip: '203.0.113.8', socket: { remoteAddress: '127.0.0.1' }, headers }), false)
    assert.equal(isLocalDevRequest({ ip: '127.0.0.1', socket: { remoteAddress: '203.0.113.8' }, headers }), false)
  } finally {
    config.auth.devTestLogin = original
  }
})

test('production ignores the development login switch', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e',
    'import { config } from "./server/src/config.js"; console.log(config.auth.devTestLogin)'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production', DEV_TEST_LOGIN: 'true', JWT_SECRET: '0'.repeat(64) },
    encoding: 'utf8',
  })
  assert.equal(output.trim(), 'false')
})
