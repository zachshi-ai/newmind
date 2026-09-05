/**
 * 用账 —— 总量对账的确定性引擎（度支的唯一账本）。
 *
 * 出·调用 = 流内每一次工具调用，含失败（失败也花了钱）；非工具事件不数。
 * 出·时程 = 末个带 at 调用的 at − 首个带 at 调用的 at（毫秒）。
 * 逾案（每调用至多一案）：
 *   调用过线  seq > maxCalls（第 maxCalls 次合法，第 maxCalls+1 次起逾）
 *   时程过线  at − firstAt > maxMinutes × 60000（严格大于——恰在线上合法）
 *   两线同越  via 'both'，一案计一次，不双罚
 * 三宗：无制（一条线都没有）40 一次性；逾制 +6/案 cap 60；守界 0。
 * 制值 = (无制?40:0) + min(60, 6×逾案)；分带 足(0–14)/急(15–29)/非(≥30)。
 * 逐案结算互不依赖——运行中即时制值与离线重放同流前缀一致。
 */

import { GATE_DEFAULT } from './register.js'

export { GATE_DEFAULT }

const WUZHI_SCORE = 40
const PER_YU = 6
const CAP_YU = 60

/** 分带：足(0–14 蓄厚) / 急(15–29 蓄薄) / 非(≥30 越界或从未有界)。 */
export function bandName(total) {
  if (total >= 30) return '非'
  if (total >= 15) return '急'
  return '足'
}

/**
 * 在线引擎（插件侧）：唯一写入口 step()，从结算事件步进。
 * @param {{ caps?: {maxCalls?: number, maxMinutes?: number}, id?: string|null, gate?: number }} opts
 */
export function createLedger(opts = {}) {
  return {
    caps: { maxCalls: opts.caps?.maxCalls ?? null, maxMinutes: opts.caps?.maxMinutes ?? null },
    id: opts.id ?? null,
    gate: Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT,
    calls: [], // 全部观察调用（exportStream 之源）
    overCases: [], // { seq, ref, at, via }，via: 'calls' | 'time' | 'both'
    callsObserved: 0,
    firstAt: null,
    lastAt: null,
    renderCount: 0,
  }
}

/** 有没有立线——一条都没有即无制。 */
export function hasLedgerCaps(ledger) {
  return ledger.caps.maxCalls != null || ledger.caps.maxMinutes != null
}

/** 唯一写入口：结算后步进一格。call: { ref, name, args, isError, at }。 */
export function step(ledger, call) {
  ledger.callsObserved++
  ledger.calls.push(call)
  if (call.at != null) {
    if (ledger.firstAt == null) ledger.firstAt = call.at
    ledger.lastAt = call.at
  }

  const via = []
  if (ledger.caps.maxCalls != null && ledger.callsObserved > ledger.caps.maxCalls) via.push('calls')
  if (
    ledger.caps.maxMinutes != null &&
    call.at != null &&
    ledger.firstAt != null &&
    call.at - ledger.firstAt > ledger.caps.maxMinutes * 60000
  ) via.push('time')

  if (via.length > 0) {
    ledger.overCases.push({
      seq: ledger.callsObserved,
      ref: call.ref ?? null,
      at: call.at ?? null,
      via: via.length === 2 ? 'both' : via[0],
    })
  }
}

/** 即时汇总（与离线重放前缀一致）。 */
export function liveScore(ledger) {
  const wuzhi = !hasLedgerCaps(ledger)
  const wuScore = wuzhi ? WUZHI_SCORE : 0
  const yuScore = Math.min(CAP_YU, PER_YU * ledger.overCases.length)
  const total = wuScore + yuScore
  const spanMs = ledger.firstAt != null && ledger.lastAt != null ? ledger.lastAt - ledger.firstAt : null
  return {
    score: { total, wuzhi: wuScore, yuzhi: yuScore },
    band: bandName(total),
    counts: {
      callsObserved: ledger.callsObserved,
      overCalls: ledger.overCases.length,
      spanMs,
      wuzhi,
    },
    caps: { ...ledger.caps },
    id: ledger.id,
    overCases: ledger.overCases.map((c) => ({ ...c })),
  }
}

/**
 * 离线分析（CLI 侧）：一次性对完整调用序列落账。
 * @param {Array} calls buildCalls 归并后的调用序列
 * @param {{ caps?: {maxCalls?: number, maxMinutes?: number}, id?: string|null, gate?: number }} opts
 */
export function analyze(calls, opts = {}) {
  const ledger = createLedger(opts)
  for (const call of calls) step(ledger, call)
  return ledger
}
