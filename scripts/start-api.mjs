import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const env = { ...process.env }
if (env.NODE_EXTRA_CA_CERTS) env.NODE_EXTRA_CA_CERTS = resolve(env.NODE_EXTRA_CA_CERTS)

const args = ['--env-file-if-exists=server/.env']
if (process.argv.includes('--watch')) args.push('--watch')
args.push('server/src/server.js')

const child = spawn(process.execPath, args, { env, stdio: 'inherit' })
child.on('error', (error) => {
  console.error(`Could not start API process: ${error.message}`)
  process.exitCode = 1
})
child.on('exit', (code) => { process.exitCode = code ?? 1 })
