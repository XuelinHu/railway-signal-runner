/**
 * 创建或提升管理员账号。
 *
 * 用法：
 *   npm run seed:admin -- --username admin --password 'YourPass123'
 *   npm run seed:admin -- --username admin            # 自动生成密码并打印
 *   npm run seed:admin -- --username zhangsan --promote   # 把已有用户提升为管理员
 */
import { config } from '../server/src/config.js'
import { closePool, queryOne } from '../server/src/db/pool.js'
import * as users from '../server/src/repositories/userRepository.js'
import { generatePassword, hashPassword } from '../server/src/services/passwordService.js'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
    } else {
      args[key] = next
      i += 1
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const username = String(args.username || 'admin').trim()

if (!config.db.password) {
  console.error('缺少 PGPASSWORD，无法连接数据库。')
  process.exit(1)
}

const existing = await queryOne(
  `SELECT id, username, role, status, deleted_at FROM users WHERE lower(username) = lower($1)`,
  [username]
)

if (existing && !existing.deleted_at) {
  if (args.promote || existing.role !== 'admin') {
    const updated = await users.updateUser(existing.id, { role: 'admin', status: 'active' })
    console.log(`已将账号 ${updated.username} 提升为管理员。`)
  } else {
    console.log(`账号 ${existing.username} 已经是管理员，无需变更。`)
  }

  // 显式给了密码就顺手重置，方便忘记密码时自救。
  if (typeof args.password === 'string') {
    await users.updateUser(existing.id, {
      passwordHash: await hashPassword(args.password),
      mustChangePassword: false,
    })
    console.log('密码已按参数重置。')
  }
} else {
  const password = typeof args.password === 'string' ? args.password : generatePassword(14)

  const created = await users.insertUser({
    username,
    displayName: args.displayName || '系统管理员',
    passwordHash: await hashPassword(password),
    role: 'admin',
    status: 'active',
    remark: '由 seed-admin 脚本创建',
  })

  console.log('管理员账号已创建：')
  console.log(`  用户名：${created.username}`)
  console.log(`  密码：  ${password}`)
  if (typeof args.password !== 'string') {
    console.log('  （密码由脚本随机生成，请立即保存，此密码不会再次显示）')
  }
}

await closePool()
