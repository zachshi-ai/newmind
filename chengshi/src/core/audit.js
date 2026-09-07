/**
 * 多流离线审计 —— 合并重放（docs/03 §9）。可验尸任何历史会话。
 *
 * 流按参序拼接为同一 ord 轴；每流自带 session 名（文件名）——消跨会话有效、
 * 再命限同会话。原始流含 principal 事件：承施照判（终裁在此）。
 */

import { parseStream, buildItems } from './stream.js'
import { createEngine, recordCall, recordPrincipal, judge } from './suizhang.js'

export function auditStreams(entries, { book = null, gate } = {}) {
  const engine = createEngine({ book })
  const sessions = []
  for (const entry of entries) {
    const name = entry.name ?? `stream-${sessions.length + 1}`
    sessions.push(name)
    const { items } = buildItems(parseStream(entry.text), name)
    for (const item of items) {
      if (item.kind === 'principal') {
        recordPrincipal(engine, { session: item.session, text: item.text })
      } else {
        recordCall(engine, {
          session: item.session,
          ref: item.ref,
          name: item.name,
          args: item.args,
          isError: item.isError,
          content: item.content,
        })
      }
    }
  }
  const report = judge(engine, { gate })
  return { ...report, streams: sessions }
}
