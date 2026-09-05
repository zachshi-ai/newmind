/**
 * 三问裁决 —— 效账的纯函数（docs/03 §1、§3、§6、§7）。
 *
 * 判定序（每个成报至多一项发现，前者命中即止）：
 *   失败/成败未知 → 不入账；非效类 → 合法沉默；
 *   效类成报：免验 → 空言（虚+25）→ 回令（回+20）→ 离效（点名）→ 陈效（点名）→ 干净。
 *
 * 评分：虚 = min(50, 25×空言)，回 = min(30, 20×回令)，效值 = min(100, 虚+回)。
 * 分带：明 0–14 ／ 疏 15–29 ／ 虚 ≥30。门默认 30。
 */

import { DEFAULT_MIANYAN_WORDS, DEFAULT_XIAO_WORDS, collapse, matchWords, normalizeWords } from './words.js'

export const GATE_DEFAULT = 30
const VACUOUS_SCORE = 25
const VACUOUS_CAP = 50
const ECHO_SCORE = 20
const ECHO_CAP = 30

const TOKEN_RE = /[a-z0-9]{3,}|[\u4e00-\u9fff]{2,}/g

/** 掩码自洁（承直笔同一卫生标准）：四形命中即整体替换。 */
export function mask(text) {
  return String(text)
    .replace(/sk-[A-Za-z0-9]{8,}/g, '⟪掩⟫')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/g, '⟪掩⟫')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, '⟪掩⟫')
    .replace(/AKIA[0-9A-Z]{16}/g, '⟪掩⟫')
}

/** 摘录：取前 48 字符，换行替换为 ⏎，再过掩码自洁。逐字节确定。 */
export function excerpt48(s) {
  return mask(String(s).slice(0, 48).replace(/\r/g, '⏎').replace(/\n/g, '⏎'))
}

/** 词元：argsText 小写化后按词元正则提取、去重（JSON 脚手架的键名一并计入——宁纵）。 */
export function extractTokens(argsText) {
  return [...new Set(String(argsText).toLowerCase().match(TOKEN_RE) ?? [])]
}

function argsTextOf(call) {
  return JSON.stringify(call.args ?? {})
}

/** ref 展示：null → `-`。 */
function refLabel(ref) {
  return ref ?? '-'
}

/** 分带：明 0–14 ／ 疏 15–29 ／ 虚 ≥30（独立导出，边界逐点可测）。 */
export function bandOf(total) {
  return total >= 30 ? '虚' : total >= 15 ? '疏' : '明'
}

/**
 * 效账裁决：对原始账（{ principalBlocks, calls }）逐件过三问。
 * words / exempt 为追加词表（与默认表取并集由本函数构造保证）。
 */
export function computeAccount(raw, options = {}) {
  const words = [...new Set([...DEFAULT_XIAO_WORDS, ...normalizeWords(options.words)])]
  const exempt = [...new Set([...DEFAULT_MIANYAN_WORDS, ...normalizeWords(options.exempt)])]
  const gate = Number.isFinite(options.gate) ? options.gate : GATE_DEFAULT

  const counts = { successes: 0, verified: 0, exempted: 0, vacuous: 0, echo: 0, stray: 0, stale: 0 }
  const events = []
  const issues = []
  // 同参先例：identity → { seq, content }（最近一次先例；空言/回令/免验件不建档）
  const prior = new Map()

  for (const call of raw.calls) {
    if (call.isError !== false) continue // 失败与成败未知不入账
    counts.successes++

    const argsText = argsTextOf(call)
    const searched = `${String(call.name ?? '').toLowerCase()} ${argsText.toLowerCase()}`
    const hits = matchWords(searched, words)
    if (hits.length === 0) continue // 非效类：合法沉默，连计数都不入
    counts.verified++
    const displayWords = collapse(hits)

    if (exempt.length > 0 && matchWords(argsText.toLowerCase(), exempt).length > 0) {
      counts.exempted++
      continue
    }

    const content = call.content
    const hasSubstance = typeof content === 'string' && content.trim() !== ''

    if (!hasSubstance) {
      counts.vacuous++
      const excerpt = excerpt48(argsText)
      events.push({ kind: '空言', call: call.seq, ref: call.ref, tool: call.name, words: displayWords, excerpt })
      issues.push(`空言：调用${call.seq} ${call.name} ${refLabel(call.ref)} 验证成功而内容为空（账上无据）`)
      continue
    }

    const cl = content.trim().toLowerCase()
    if (argsText.toLowerCase().includes(cl)) {
      counts.echo++
      const excerpt = excerpt48(content)
      events.push({ kind: '回令', call: call.seq, ref: call.ref, tool: call.name, words: displayWords, excerpt })
      issues.push(`回令：调用${call.seq} ${call.name} ${refLabel(call.ref)} 以令为证——“${excerpt}”`)
      continue
    }

    // 先例账：有实质内容且非回令的效类成报一律登记（离效件也可是被陈的旧果）；
    // 陈效发现仍按判定序只落在通过离效检查的成报上。
    const tokens = extractTokens(argsText)
    const identity = `${String(call.name ?? '')}\u0000${JSON.stringify(call.args ?? null)}`
    const prev = prior.get(identity)
    prior.set(identity, { seq: call.seq, content: String(content) })

    if (!tokens.some((t) => cl.includes(t))) {
      counts.stray++
      const excerpt = excerpt48(content)
      events.push({ kind: '离效', call: call.seq, ref: call.ref, tool: call.name, words: displayWords, excerpt })
      issues.push(`离效：调用${call.seq} ${call.name} ${refLabel(call.ref)} 答非所问（内容与所验对象无词相干，只点名不计分）`)
      continue
    }

    // 先例乎：同参复验而内容已变 → 陈效（点名不计分）
    if (prev && prev.content !== String(content)) {
      counts.stale++
      const excerpt = excerpt48(content)
      events.push({ kind: '陈效', call: call.seq, prevCall: prev.seq, ref: call.ref, tool: call.name, words: displayWords, excerpt })
      issues.push(`陈效：调用${call.seq} ${call.name} ${refLabel(call.ref)} 与调用${prev.seq} 同参异果——旧果勿复引`)
    }
  }

  const vacuity = Math.min(VACUOUS_CAP, VACUOUS_SCORE * counts.vacuous)
  const echoScore = Math.min(ECHO_CAP, ECHO_SCORE * counts.echo)
  const total = Math.min(100, vacuity + echoScore)
  const band = bandOf(total)

  return {
    principalBlocks: raw.principalBlocks,
    calls: raw.calls.length,
    counts,
    score: { total, vacuity, echo: echoScore },
    band,
    gate,
    verdict: total >= gate ? 'fail' : 'pass',
    ok: total < gate,
    events,
    issues,
  }
}
