/**
 * 管理台展示用的格式化工具。
 * 只做「后端原始值 → 人看的字符串」，不做任何请求，方便在列表列定义里直接引用。
 */

/** 时间戳 → 本地时间串。空值统一显示占位符，避免列里出现 Invalid Date。 */
export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { hour12: false })
}

/** 相对时间：列表里看「3 分钟前」比看绝对时间更快判断新鲜度。 */
export function formatRelative(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diffSeconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (diffSeconds < 60) return '刚刚'
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} 分钟前`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} 小时前`
  if (diffSeconds < 86400 * 30) return `${Math.floor(diffSeconds / 86400)} 天前`
  return formatDateTime(value)
}

/** 字节数 → 人类可读体积。模型列表里显示 8.6 GB 比显示 9227468800 好读。 */
export function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let index = 0
  let size = value
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size >= 100 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`
}

/** 毫秒 → 时长。AI 调用日志里看延迟和训练成绩耗时都用它。 */
export function formatDuration(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value < 1000) return `${Math.round(value)} ms`
  if (value < 60000) return `${(value / 1000).toFixed(1)} s`
  const minutes = Math.floor(value / 60000)
  const seconds = Math.round((value % 60000) / 1000)
  return `${minutes} 分 ${seconds} 秒`
}

/** 秒 → 时长，训练记录里的 elapsed_seconds 用它。 */
export function formatSeconds(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  return formatDuration(value * 1000)
}

/** 空值安全取文本，列表里到处都在做这件事。 */
export function textOr(value, placeholder = '—') {
  if (value === null || value === undefined || value === '') return placeholder
  return String(value)
}

/** 文本截断，用于会话标题、消息内容这类可能很长的字段。 */
export function truncate(value, max = 60) {
  const text = textOr(value, '')
  if (text.length <= max) return text || '—'
  return `${text.slice(0, max)}…`
}

/** 运行时长（秒）→ 「3 天 4 小时」，系统信息页用。 */
export function formatUptime(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  const days = Math.floor(value / 86400)
  const hours = Math.floor((value % 86400) / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  return `${minutes} 分 ${Math.round(value % 60)} 秒`
}
