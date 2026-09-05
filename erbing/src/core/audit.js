/**
 * 离线审计 —— CLI 侧入口：一次性对完整事件流落案（契约无关，可验尸任何历史会话流）。
 */

import { parseStream, buildRaw } from './stream.js'
import { createBingzhangEngine, applyEvent, liveScore } from './bingzhang.js'

/**
 * @param {string} text 会话流全文
 * @param {{ gate?: number, handle?: string[], grant?: string[], noDefaults?: boolean }} opts
 */
export function auditStream(text, opts = {}) {
  const events = parseStream(text)
  const { items } = buildRaw(events)
  const engine = createBingzhangEngine(opts)
  for (const item of items) {
    applyEvent(engine, item)
  }
  const live = liveScore(engine)
  return {
    score: live.score,
    band: live.band,
    gate: engine.gate,
    ok: live.score.total < engine.gate,
    counts: live.counts,
    caseList: engine.events.map((e) => ({
      seq: e.seq,
      pos: e.pos,
      ref: e.ref,
      at: e.at,
      tool: e.tool,
      kind: e.kind,
      familyLabel: e.familyLabel ?? null,
      formId: e.formId ?? null,
      scored: e.scored,
      declareItems: e.declareItems ?? 0,
      asked: e.asked ?? false,
      warrantPos: e.warrantPos ?? null,
      excerpt: e.excerpt,
    })),
    register: engine.register,
  }
}
