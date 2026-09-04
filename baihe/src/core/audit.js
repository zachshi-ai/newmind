/**
 * 离线审计 —— 会话流文本 → 境账报告（契约无关，任何历史会话可直接验尸）。
 */

import { parseStream, buildCalls } from './stream.js'
import { analyze, liveScore, GATE_DEFAULT } from './jingzhang.js'

/**
 * @param {string} streamText 会话流全文（JSONL，# 注释）
 * @param {{ gate?: number, allow?: string[], declare?: string[] }} opts
 */
export function auditStream(streamText, opts = {}) {
  const gate = Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT
  const { calls } = buildCalls(parseStream(streamText))
  const state = analyze(calls, opts)
  const live = liveScore(state)

  const issues = []
  if (live.counts.leakCases > 0) {
    const hosts = [...new Set(state.exits.filter((e) => e.kind === '泄物').map((e) => e.host))].join('、')
    issues.push(
      `泄物 ×${live.counts.leakCases} 案 ${live.counts.leakItems} 件（+${live.score.total}）：${hosts} 外域出境，物不可追`,
    )
  }
  if (live.counts.shichu > 0) {
    issues.push(
      `试出 ×${live.counts.shichu}（不计分，点名）：失败出境，对端未确认收物——宁漏勿诬`,
    )
  }
  if (live.counts.internal > 0) {
    issues.push(
      `内域档 ×${live.counts.internal}（不计分）：白名单/回环出境，本职行为`,
    )
  }

  const ok = live.score.total < gate
  return {
    calls: calls.length,
    exits: live.counts.exitsObserved,
    score: live.score,
    band: live.band,
    gate,
    verdict: ok ? 'pass' : 'fail',
    ok,
    counts: live.counts,
    issues,
    caseList: state.exits.map((e) => ({
      seq: e.seq,
      ref: e.ref,
      tool: e.tool,
      host: e.host,
      domain: e.domain,
      kind: e.kind,
      scored: e.scored,
      hits: e.hits,
    })),
  }
}
