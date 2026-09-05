/**
 * 离线审计 —— 会话流文本 → 程账报告（契约无关，任何历史会话可直接验尸）。
 * 多流审计：texts 按调用方给定顺序拼接（中断续跑：前班流在前，续班流在后）。
 */

import { parseStream, buildCalls } from './stream.js'
import { analyze, liveScore, GATE_DEFAULT } from './chengzhang.js'

/**
 * @param {string | string[]} streamTexts 会话流全文（JSONL，# 注释；多流按序拼接）
 * @param {{ gate?: number, items?: Array, order?: Array }} opts
 */
export function auditStream(streamTexts, opts = {}) {
  const gate = Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT
  const texts = Array.isArray(streamTexts) ? streamTexts : [streamTexts]
  const { calls } = buildCalls(parseStream(texts.join('\n')))
  const engine = analyze(calls, opts)
  const live = liveScore(engine)

  const issues = []
  const you = live.states.filter((s) => s.status === '幽项')
  if (you.length > 0) {
    issues.push(
      `幽项 ×${you.length}（+${live.score.you}）：${you.map((s) => s.id).join('、')} 全流无作工之迹——立了的事静默地不存在`,
    )
  }
  const ban = live.states.filter((s) => s.status === '半途')
  if (ban.length > 0) {
    issues.push(
      `半途 ×${ban.length}（+${live.score.ban}）：${ban.map((s) => `${s.id}(末作#${s.lastWorkSeq})`).join('、')} 开了头没走完，也无弃言`,
    )
  }
  if (live.kongList.length > 0) {
    issues.push(
      `空终 ×${live.kongList.length}（+${live.score.kong}）：${live.kongList
        .map((c) => `${c.itemId}(终#${c.terminalSeq} 后复作#${c.workSeq})`)
        .join('、')} 终言被自己的手推翻`,
    )
  }
  for (const v of live.violations) {
    issues.push(
      `失序（+10）：立序 ${v.order[0]}→${v.order[1]}，${v.order[1]} 始#${v.bStartSeq} 早于 ${v.order[0]} 终#${v.aTerminalSeq}`,
    )
  }
  const qi = live.states.filter((s) => s.status === '有弃')
  if (qi.length > 0) {
    issues.push(`有弃 ×${qi.length}（不计分，点名）：${qi.map((s) => `${s.id}(弃#${s.abandonSeq})`).join('、')} 显式弃，合法`)
  }

  const ok = live.score.total < gate
  return {
    calls: calls.length,
    itemsDeclared: live.counts.itemsDeclared,
    score: live.score,
    band: live.band,
    gate,
    verdict: ok ? 'pass' : 'fail',
    ok,
    counts: live.counts,
    issues,
    items: live.states,
    kongList: live.kongList,
    violations: live.violations,
  }
}
