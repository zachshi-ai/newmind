/**
 * 离线审计 —— 会话流文本 → 见闻账报告（契约无关，任何历史会话可直接验尸）。
 */

import { parseStream, buildCalls } from './stream.js'
import { analyze, liveScore, chenAccounts, GATE_DEFAULT } from './jianwen.js'

/**
 * @param {string} streamText 会话流全文（JSONL，# 注释）
 * @param {{ gate?: number, chenGap?: number }} opts
 */
export function auditStream(streamText, opts = {}) {
  const gate = Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT
  const { calls } = buildCalls(parseStream(streamText))
  const state = analyze(calls, opts.chenGap)
  const live = liveScore(state)
  const chen = chenAccounts(state)

  const issues = []
  if (live.counts.fujianCases > 0) {
    const objects = [...new Set(state.sins.filter((s) => s.kind === '复见').map((s) => s.object))].join('、')
    issues.push(
      `复见 ×${live.counts.fujianCases} 案 ${live.counts.fujianRecords} 记（+${live.score.fujian}）：${objects} 世未变而原样重装载`,
    )
  }
  if (live.counts.fumingCases > 0) {
    const objects = [...new Set(state.sins.filter((s) => s.kind === '复命').map((s) => s.object))].join('、')
    issues.push(
      `复命 ×${live.counts.fumingCases} 案 ${live.counts.fumingRecords} 记（+${live.score.fuming}）：${objects} 世未变而原样重执行`,
    )
  }
  if (chen.length > 0) {
    issues.push(
      `陈账 ×${chen.length}（不计分，点名）：${chen.map((r) => r.object).join('、')} 隔久未顾——复见之诱`,
    )
  }

  const ok = live.score.total < gate
  return {
    calls: calls.length,
    sins: state.sins.length,
    score: live.score,
    band: live.band,
    gate,
    verdict: ok ? 'pass' : 'fail',
    ok,
    counts: { ...live.counts, chen: chen.length },
    sinsList: state.sins.map((s) => ({
      seq: s.seq,
      ref: s.ref,
      at: s.idx + 1,
      object: s.object,
      kind: s.kind,
    })),
    chen: chen.map((r) => ({ object: r.object, at: r.at, gap: r.gap, kind: r.kind })),
    issues,
  }
}
