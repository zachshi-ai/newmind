/**
 * 离线审计 —— 会话流文本 → 笔账报告（契约无关，任何历史会话可直接验尸）。
 */

import { parseStream, buildCalls } from './stream.js'
import { analyze, liveScore, GATE_DEFAULT } from './bizhang.js'

/**
 * @param {string} streamText 会话流全文（JSONL，# 注释）
 * @param {{ gate?: number, words?: string[], masks?: string[], excuses?: string[], noDefaults?: boolean }} opts
 */
export function auditStream(streamText, opts = {}) {
  const gate = Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT
  const { calls } = buildCalls(parseStream(streamText))
  const state = analyze(calls, opts)
  const live = liveScore(state)
  const { counts, score } = live

  const issues = []
  if (counts.konglv > 0) {
    const names = live.hollowFamilies.map((f) => f.label).join('、')
    issues.push(`空绿 ×${counts.konglv} 族（+${score.kong}）：${names} 族末为讳笔，交付态立于空绿之上`)
  }
  if (counts.weibi > 0) {
    issues.push(`讳笔 ×${counts.weibi} 案（+${score.wei}）：同族真判已还——已赎，但书已曲过`)
  }
  if (counts.chenghong > 0) {
    issues.push(`诚红 ×${counts.chenghong}（0 分）：族末干净见红——红而不讳，笔直`)
  }
  if (counts.shibi > 0) {
    issues.push(`试笔 ×${counts.shibi}（0 分）：讳而未成，失败已见于记录——信以传信`)
  }
  if (counts.huibi > 0) {
    issues.push(`豁笔 ×${counts.huibi}（0 分）：任务方显式声明，豁免不罪`)
  }

  const ok = score.total < gate
  return {
    calls: calls.length,
    shishi: counts.shishi,
    score,
    band: live.band,
    gate,
    verdict: ok ? 'pass' : 'fail',
    ok,
    counts,
    issues,
    caseList: state.cases.map((k) => ({
      seq: k.seq,
      ref: k.ref,
      tool: k.tool,
      families: k.words.map((w) => w.label),
      masks: k.maskHits.map((m) => m.label),
      excerpt: k.excerpt,
    })),
    noteList: state.notes.map((n) => ({
      kind: n.kind,
      seq: n.seq,
      tool: n.tool,
      families: n.words.map((w) => w.label),
      excuse: n.excuse,
    })),
    familyList: live.familyList,
  }
}
