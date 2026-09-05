/**
 * 离线审计入口 —— 解析 → 裁决，与插件共用同一 computeAccount 纯函数。
 */

import { parseStream, buildRaw } from './stream.js'
import { computeAccount } from './xiao.js'

/** 审计一段会话流文本，返回可序列化的审计对象（CLI --json 与测试共用；信封形状锁死于 docs/03 §10）。 */
export function auditStream(text, options = {}) {
  const raw = buildRaw(parseStream(text))
  const account = computeAccount(raw, options)
  const { principalBlocks, ...rest } = account
  return { ...rest, principal: { blocks: principalBlocks } }
}
