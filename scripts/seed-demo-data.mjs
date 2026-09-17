#!/usr/bin/env node
/**
 * 造演示数据，用来验证「每个菜单都能分页查询」。
 *
 * 幂等且可重复执行：所有演示数据的 id 都带 `demo-` 前缀，重跑会先清掉旧的
 * 再重建，不会污染真实数据，也不会因为唯一索引冲突而失败。
 *
 *   node scripts/seed-demo-data.mjs              # 默认造 200 用户 / 60 场景 / 400 成绩 / 8 会话
 *   node scripts/seed-demo-data.mjs --users 500  # 自定义规模
 *   node scripts/seed-demo-data.mjs --clean      # 只清理，不新建
 *
 * 生成的账号统一密码：Demo@12345（生产环境请勿执行）。
 */
// 导入 config 就会加载 server/.env 与根 .env（dotenv 在模块顶层执行），
// 所以这里不需要显式调用 loadEnv。
import '../server/src/config.js'
import { query, closePool } from '../server/src/db/pool.js'
import { hashPassword } from '../server/src/services/passwordService.js'

const args = process.argv.slice(2)
const readFlag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return fallback
  const value = Number(args[index + 1])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const USERS = readFlag('users', 200)
const SCENES = readFlag('scenes', 60)
const RECORDS = readFlag('records', 400)
const CONVERSATIONS = readFlag('conversations', 8)
const CLEAN_ONLY = args.includes('--clean')

const DEMO_PASSWORD = 'Demo@12345'
const ROLES = ['student', 'student', 'student', 'student', 'teacher']
const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴', '徐', '孙', '马', '朱', '胡']
const GIVEN = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '勇', '军', '杰', '娟', '涛', '明']
const DIFFICULTIES = ['easy', 'normal', 'hard']
const SCENE_TOPICS = ['站内道岔区', '区间闭塞分区', '驼峰调车场', '高铁联络线', '编组站咽喉区', '隧道群区段']
const QUESTIONS = [
  '进站信号机显示红灯代表什么含义？',
  '区间占用逻辑检查是怎么判断的？',
  '道岔失去表示时应该怎么处置？',
  '发车进路和接车进路的区别是什么？',
  '调车信号机蓝色灯光表示什么？',
  '什么是引导接车，什么情况下使用？',
]

const pick = (list) => list[Math.floor(Math.random() * list.length)]
const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1))
const daysAgo = (days) => new Date(Date.now() - days * 86400000)

async function clean() {
  // 顺序有讲究：先删引用方，再删被引用方，否则外键会拦。
  const { rowCount: messages } = await query(
    `DELETE FROM ai_messages WHERE conversation_id LIKE 'demo-%'`
  )
  const { rowCount: conversationRows } = await query(`DELETE FROM ai_conversations WHERE id LIKE 'demo-%'`)
  const { rowCount: records } = await query(`DELETE FROM training_records WHERE id LIKE 'demo-%'`)
  const { rowCount: scenes } = await query(`DELETE FROM training_scenes WHERE id LIKE 'demo-%'`)
  const { rowCount: loginLogs } = await query(`DELETE FROM login_logs WHERE username_input LIKE 'demo_%'`)
  const { rowCount: aiLogs } = await query(`DELETE FROM ai_request_logs WHERE model LIKE 'demo-%' OR user_id LIKE 'demo-%'`)
  const { rowCount: users } = await query(`DELETE FROM users WHERE id LIKE 'demo-%'`)

  console.log(
    `已清理演示数据：用户 ${users}、场景 ${scenes}、成绩 ${records}、会话 ${conversationRows}、消息 ${messages}、登录日志 ${loginLogs}、AI 日志 ${aiLogs}`
  )
}

async function seed() {
  // 密码哈希算一次就够——200 个账号用同一个演示密码，没必要跑 200 次 bcrypt
  // （bcrypt 每次要 10 轮，200 次要好几秒）。
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  /* ------------------------------- 用户 ------------------------------- */

  const userIds = []
  for (let i = 0; i < USERS; i += 1) {
    const id = `demo-u-${String(i).padStart(4, '0')}`
    const username = `demo_${String(i).padStart(4, '0')}`
    const displayName = `${pick(SURNAMES)}${pick(GIVEN)}`
    const role = pick(ROLES)
    const status = i % 37 === 0 ? 'disabled' : i % 23 === 0 ? 'locked' : 'active'
    const createdAt = daysAgo(randomInt(1, 180))

    await query(
      `INSERT INTO users
         (id, username, display_name, email, phone, password_hash, role, status,
          failed_login_count, locked_until, last_login_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
      [
        id,
        username,
        displayName,
        `${username}@demo.local`,
        `139${String(10000000 + i).slice(0, 8)}`,
        passwordHash,
        role,
        status,
        status === 'locked' ? 5 : 0,
        status === 'locked' ? new Date(Date.now() + 15 * 60000) : null,
        i % 3 === 0 ? daysAgo(randomInt(0, 30)) : null,
        createdAt,
      ]
    )
    userIds.push({ id, username, displayName, role })
  }

  /* ------------------------------- 登录日志 ------------------------------- */

  // 登录日志是分页压力最大的表，每条用户配 2-6 条，几千条量级才能试出翻页边界。
  for (const user of userIds) {
    const count = randomInt(2, 6)
    for (let i = 0; i < count; i += 1) {
      const success = Math.random() > 0.25
      await query(
        `INSERT INTO login_logs (user_id, username_input, success, failure_reason, ip, user_agent, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          success ? user.id : null,
          user.username,
          success,
          success ? null : pick(['密码错误', '账号已锁定', '账号已禁用']),
          `${randomInt(10, 210)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`,
          pick([
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0',
            'Mozilla/5.0 (Linux; Android 14) Chrome/131.0 Mobile',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1',
          ]),
          daysAgo(Math.random() * 30),
        ]
      )
    }
  }

  /* ------------------------------- 训练场景 ------------------------------- */

  const sceneIds = []
  for (let i = 0; i < SCENES; i += 1) {
    const id = `demo-s-${String(i).padStart(4, '0')}`
    const owner = userIds[i % userIds.length]
    const topic = pick(SCENE_TOPICS)
    const published = i % 3 !== 0

    await query(
      `INSERT INTO training_scenes
         (id, name, description, difficulty, owner_id, payload, published, published_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [
        id,
        `${topic}巡检场景 ${i + 1}`,
        `${topic}的信号机与道岔布置练习，包含 ${randomInt(4, 12)} 个检查点。`,
        pick(DIFFICULTIES),
        owner.id,
        JSON.stringify({
          version: 1,
          signalCount: randomInt(4, 12),
          objects: [],
          note: '演示数据，非真实场景配置',
        }),
        published,
        published ? daysAgo(randomInt(1, 60)) : null,
        daysAgo(randomInt(1, 120)),
      ]
    )
    sceneIds.push({ id, name: `${topic}巡检场景 ${i + 1}` })
  }

  /* ------------------------------- 成绩记录 ------------------------------- */

  for (let i = 0; i < RECORDS; i += 1) {
    const scene = sceneIds[i % sceneIds.length]
    const student = userIds[i % userIds.length]
    const completed = i % 5 !== 0
    const inspected = randomInt(1, 12)

    await query(
      `INSERT INTO training_records
         (id, scene_id, scene_name, student_name, score, elapsed_seconds, payload,
          user_id, completed, inspected_count, mistake_count, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        `demo-r-${String(i).padStart(4, '0')}`,
        scene.id,
        scene.name,
        student.displayName,
        completed ? randomInt(60, 100) : randomInt(0, 59),
        randomInt(60, 1800),
        JSON.stringify({ note: '演示数据' }),
        student.id,
        completed,
        inspected,
        randomInt(0, 4),
        daysAgo(Math.random() * 90),
      ]
    )
  }

  /* ------------------------------- AI 会话 ------------------------------- */

  let messageTotal = 0
  for (let i = 0; i < CONVERSATIONS; i += 1) {
    const id = `demo-c-${String(i).padStart(4, '0')}`
    const owner = userIds[i % userIds.length]
    const model = pick(['qwen3:14b', 'qwen2.5:0.5b'])
    const createdAt = daysAgo(Math.random() * 30)

    await query(
      `INSERT INTO ai_conversations
         (id, user_id, title, model, message_count, last_message_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,0,$5,$5,$5)`,
      [id, owner.id, pick(QUESTIONS).slice(0, 20), model, createdAt]
    )

    const turns = randomInt(2, 6)
    let lastAt = createdAt
    for (let turn = 0; turn < turns; turn += 1) {
      const question = pick(QUESTIONS)
      lastAt = new Date(lastAt.getTime() + randomInt(30, 600) * 1000)
      await query(
        `INSERT INTO ai_messages (conversation_id, user_id, role, content, model, status, created_at)
         VALUES ($1,$2,'user',$3,$4,'ok',$5)`,
        [id, owner.id, question, null, lastAt]
      )
      lastAt = new Date(lastAt.getTime() + randomInt(2, 20) * 1000)
      await query(
        `INSERT INTO ai_messages
           (conversation_id, user_id, role, content, model, prompt_tokens, completion_tokens, latency_ms, status, created_at)
         VALUES ($1,$2,'assistant',$3,$4,$5,$6,$7,'ok',$8)`,
        [
          id,
          owner.id,
          `这是演示回答：${question}涉及地面信号显示与联锁逻辑，需要结合《铁路技术管理规程》相关条款判断。（本条为演示数据）`,
          model,
          randomInt(60, 400),
          randomInt(40, 300),
          randomInt(800, 9000),
          lastAt,
        ]
      )
      messageTotal += 2
    }

    await query(`UPDATE ai_conversations SET message_count = $2, last_message_at = $3 WHERE id = $1`, [
      id,
      turns * 2,
      lastAt,
    ])

    // 调用日志刻意不建外键关联：会话删了日志要留下。
    for (let turn = 0; turn < turns; turn += 1) {
      const status = Math.random() > 0.12 ? 'ok' : pick(['error', 'aborted'])
      await query(
        `INSERT INTO ai_request_logs
           (user_id, conversation_id, model, endpoint, status, http_status,
            latency_ms, first_token_ms, prompt_tokens, completion_tokens, error, created_at)
         VALUES ($1,$2,$3,'/api/ai/chat',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          owner.id,
          id,
          model,
          status,
          status === 'ok' ? 200 : status === 'error' ? 502 : 499,
          randomInt(800, 12000),
          randomInt(200, 3000),
          randomInt(60, 400),
          status === 'ok' ? randomInt(40, 300) : 0,
          status === 'error' ? '模型服务不可用' : null,
          daysAgo(Math.random() * 20),
        ]
      )
    }
  }

  console.log(
    `演示数据已生成：用户 ${USERS}（密码 ${DEMO_PASSWORD}）、登录日志若干、场景 ${SCENES}、成绩 ${RECORDS}、会话 ${CONVERSATIONS}（含 ${messageTotal} 条消息）`
  )
  console.log('提示：这些账号前缀为 demo_，可随时用 --clean 清除。')
}

try {
  await clean()
  if (!CLEAN_ONLY) await seed()
} catch (error) {
  console.error('生成演示数据失败：', error.message)
  process.exitCode = 1
} finally {
  await closePool()
}
