import { customAlphabet } from 'nanoid'

// 去掉 - 和 _，避免 ID 出现在 URL 或日志里时被误解为分隔符。
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
const generate = customAlphabet(alphabet, 20)

export function newId(prefix) {
  return prefix ? `${prefix}_${generate()}` : generate()
}
