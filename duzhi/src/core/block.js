/**
 * 余量块 —— 接缝处逐字节确定的蓄支图（供给件）。
 *
 * 同一账本状态两次渲染逐字节相同（无时间戳；#k 随渲染递增且仅首行不同；
 * shasum 可证）。行模板锁死于 docs/03-design.md §6，渲染不得即兴。
 * 分钟一律 (ms/60000).toFixed(1)；透支蓄为负，以全角负号书写并标（已透支）。
 */

import { liveScore } from './ledger.js'

const MINUS = '−' // 全角负号：透支蓄的书写形（与模板锁死一致）

const VIA_LABEL = {
  calls: '调用过线',
  time: '时程过线',
  both: '调用·时程过线',
}

function signedCalls(rem) {
  return rem < 0 ? `${MINUS}${Math.abs(rem)} 调用（已透支）` : `调用 ${rem}`
}

function signedMinutes(m) {
  return m < 0 ? `时程 ${MINUS}${Math.abs(m).toFixed(1)} 分钟（已透支）` : `时程 ${m.toFixed(1)} 分钟`
}

/**
 * 渲染余量块。
 * @param {object} ledger 度支引擎账本
 * @param {number} k 渲染序号（#k，随渲染递增）
 * @returns {string}
 */
export function renderYuliang(ledger, k) {
  const live = liveScore(ledger)
  const caps = ledger.caps
  const wuzhi = live.counts.wuzhi
  const spanMs = live.counts.spanMs

  const ren = ledger.id ?? '（未立制册）'

  const ru = wuzhi
    ? '未制——量入无从谈起，出已无界'
    : [
        caps.maxCalls != null ? `调用 ≤${caps.maxCalls}` : '调用 ——（未设）',
        caps.maxMinutes != null ? `时长 ≤${caps.maxMinutes} 分钟` : '时长 ——（未设）',
      ].join(' · ')

  const chu = [
    `调用 ${live.counts.callsObserved}`,
    spanMs != null ? `时程 ${minutes(spanMs)} 分钟` : '时程 ——（无时不判）',
  ].join(' · ')

  const xuParts = []
  if (wuzhi) {
    // 无制：蓄行整体让位
  } else {
    if (caps.maxCalls != null) xuParts.push(signedCalls(caps.maxCalls - live.counts.callsObserved))
    else xuParts.push('调用 ——（未设）')
    if (caps.maxMinutes != null) {
      xuParts.push(spanMs != null ? signedMinutes(caps.maxMinutes - spanMs / 60000) : '时程 ——（无时不判）')
    } else {
      xuParts.push('时程 ——（未设）')
    }
  }
  const xu = wuzhi ? '——' : xuParts.join(' · ')

  const yu = wuzhi
    ? '未制，逾无从判'
    : live.overCases.length === 0
      ? '无'
      : live.overCases.map((c) => `第 ${c.seq} 次调用（${VIA_LABEL[c.via] ?? c.via}）`).join('、')

  return [
    `【度支 · 余量块 #${k}】`,
    `任：${ren}`,
    `入：${ru}`,
    `出：${chu}`,
    `蓄：${xu}`,
    `带：${live.band}`,
    `逾：${yu}`,
    '—— 本块由确定性规则生成；重放同一流必得同一文本。',
    '',
  ].join('\n')
}

function minutes(ms) {
  return (ms / 60000).toFixed(1)
}
