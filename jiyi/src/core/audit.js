/**
 * 离线审计 —— 多流合并重放（可验尸任何历史会话，与 mingshi 的 auditStreams 同规）。
 *
 * 各流逐个解析、记入同一引擎（session 取流名）：问凭据全流皆采——跨会话之问互认，
 * 与「合并审计跨会话」的生实/问凭据口径一致。
 */

import { parseStream, buildCalls } from './stream.js'
import { createEngine, recordCall, judge } from './ji.js'

export function auditStreams(entries, { askfile = null, gate } = {}) {
  const engine = createEngine()
  for (const entry of entries) {
    const events = parseStream(entry.text)
    const { calls } = buildCalls(events)
    for (const call of calls) {
      recordCall(engine, { session: entry.name, ref: call.ref, name: call.name, args: call.args, isError: call.isError, at: call.at })
    }
  }
  return judge(engine, { askfile, gate })
}
