/**
 * 离线审计入口 —— 多流合并审计（CLI 用）。据证链按会话分账，判定以 (会话, 径) 为键。
 */

import { basename } from 'node:path'
import { parseStream, buildCalls } from './stream.js'
import { createEngine, recordCall, judge } from './caizhang.js'

/** 逐流解析入账，收尾判定。entries: [{ name, text }]。 */
export function auditStreams(entries, { book = null, overrides = {}, gate } = {}) {
  const engine = createEngine({ book, overrides })
  for (const entry of entries) {
    const session = basename(entry.name)
    const calls = buildCalls(parseStream(entry.text)).calls
    for (const call of calls) {
      recordCall(engine, { session, ref: call.ref, name: call.name, args: call.args, isError: call.isError, content: call.content })
    }
  }
  return judge(engine, gate != null ? { gate } : {})
}
