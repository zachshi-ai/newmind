/**
 * 离线审计 —— 会话流文本 → 势账报告（契约无关，任何历史会话可直接验尸）。
 */

import { parseStream, buildCalls } from './stream.js'
import { analyze, GATE_DEFAULT } from './shi.js'
import { settledDebts } from './shi.js'

/**
 * @param {string} streamText 会话流全文（JSONL，# 注释）
 * @param {{ gate?: number }} opts
 */
export function auditStream(streamText, opts = {}) {
  const gate = Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT
  const { calls } = buildCalls(parseStream(streamText))
  const state = analyze(calls)
  state.verdictsSettled = true

  const issues = []
  if (state.counts.blind > 0) {
    const objects = [...new Set(state.blindOrder.map((e) => e.object))].join('、')
    issues.push(
      `盲捶 ×${state.counts.blind}（同对象连链免 1，计 ${state.counts.blindCharged}，+${state.score.stale}）：${objects} 失败后无再察逐字重试`,
    )
  }
  if (state.counts.graze > 0) {
    issues.push(
      `游骑 ×${state.counts.graze}（+${state.score.rash}）：悬账未清时连开无凭新战线`,
    )
  }
  const debts = settledDebts(state)
  if (debts.length > 0) {
    issues.push(
      `悬账 ×${debts.length}（不计分，点名）：${debts.map((e) => e.object).join('、')} 文件势变后全程未归还`,
    )
  }

  const ok = state.score.total < gate
  return {
    calls: calls.length,
    shiEvents: state.events.length,
    score: state.score,
    band: state.band,
    gate,
    verdict: ok ? 'pass' : 'fail',
    ok,
    counts: state.counts,
    events: state.events.map((ev) => ({
      seq: ev.seq,
      ref: ev.ref,
      tool: ev.tool,
      object: ev.object,
      verdict: ev.verdict,
    })),
    issues,
  }
}
