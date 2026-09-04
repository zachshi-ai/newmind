/**
 * 论世离线审计 —— 契约无关，可验尸任何历史会话流（docs/03 §10 JSON 形状锁死）。
 */

import { parseStream, buildRaw } from './stream.js'
import { computeAccount, GATE_DEFAULT } from './qudao.js'
import { normalizeWords } from './words.js'

/**
 * 审计一份会话流文本。
 * @param {string} text 流文本
 * @param {{ gate?: number, words?: string[] }} opts gate 默认 30；words 追加词表
 */
export function auditStream(text, opts = {}) {
  const parsed = parseStream(text)
  const raw = buildRaw(parsed)
  const words = normalizeWords(opts.words)
  const acc = computeAccount(raw, words)
  const gate = Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT
  const ok = acc.score.total < gate

  // events：涉命块在前（块序），僭行在后（调用序）——逐字节确定的输出序
  const events = []
  for (const b of acc.tainted) {
    events.push({
      kind: '涉命',
      block: b.blockNo,
      ref: b.ref,
      tool: b.tool,
      words: b.hits,
      offset: b.offset,
      excerpt: b.excerpt,
    })
  }
  for (const u of acc.usurpRows) {
    events.push({
      kind: '僭行',
      call: u.call,
      ref: u.ref,
      tool: u.tool,
      word: u.word,
      fromBlock: u.fromBlock,
    })
  }

  const issues = []
  for (const b of acc.tainted) {
    issues.push(
      `涉命块：第${b.blockNo}块 ${b.tool} ${b.ref} 越词「${b.taintWords.join('／')}」`
    )
  }
  for (const u of acc.usurpRows) {
    issues.push(
      `僭行：调用${u.call} ${u.tool} ${u.ref} 参数引用了第${u.fromBlock}块越词「${u.word}」`
    )
  }

  return {
    calls: raw.calls.length,
    principal: { blocks: raw.principalBlocks, chars: raw.principalText.length },
    blocks: {
      dataObserved: raw.dataBlocks.length,
      tainted: acc.counts.tainted,
      authorized: acc.authorized,
    },
    score: acc.score,
    band: acc.band,
    gate,
    verdict: ok ? 'pass' : 'fail',
    ok,
    events,
    issues,
  }
}
