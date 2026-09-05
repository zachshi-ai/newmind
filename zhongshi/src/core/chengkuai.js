/**
 * 程账块渲染 —— 接缝处的确定性供给件（中断续跑的交接班记录）。
 *
 * 同一账本状态两次渲染逐字节相同（#k 随渲染递增且仅此一处不同）；
 * 无时间戳；逐事序 = 册序，案序 = 流序。牌是镜子，不是法官：
 * 只公示每事到哪，不仲裁该不该这样做。
 */

import { computeStates, computeOrderViolations, scoreOf } from './chengzhang.js'

/**
 * @param {{ register: {items: Array}, events: Array }} state 引擎状态
 * @param {number} k 渲染序号（随渲染递增）
 * @param {number} gate 门
 */
export function renderChengkuai(state, k, gate) {
  const { states, kongList } = computeStates(state)
  const violations = computeOrderViolations(state, states)
  const you = states.filter((s) => s.status === '幽项').length
  const ban = states.filter((s) => s.status === '半途').length
  const score = scoreOf(you, ban, kongList.length, violations.length)
  const band = score.total >= 30 ? '无终' : score.total >= 15 ? '鲜终' : '近道'

  const out = []
  out.push(`【终始 · 程账块 #${k}】`)
  out.push(`程值 ${score.total}（${band}），门 ${gate}，判 ${score.total < gate ? 'pass' : 'fail'}`)
  out.push(
    `事账：立事 ${states.length} 件；有终 ${count(states, '有终')}，有弃 ${count(states, '有弃')}，` +
      `半途 ${ban}，幽项 ${you}；空终 ${kongList.length}，失序 ${violations.length}`,
  )

  out.push('逐事（按册序）：')
  if (states.length === 0) out.push('  （册上无立事）')
  for (const s of states) {
    let trail
    if (s.status === '幽项') trail = '全流无作工'
    else if (s.status === '有终') trail = `始#${s.startSeq} 终#${s.terminalSeq}`
    else if (s.status === '半途') trail = `始#${s.startSeq} 末作#${s.lastWorkSeq}`
    else trail = `弃#${s.abandonSeq}`
    const note = s.status === '半途' && s.noTerminalDeclared ? '（未宣终形）' : ''
    out.push(`  ${s.id} ${s.name}｜${s.status}｜${trail}${note}`)
  }

  out.push('空终点名（按案序）：')
  if (kongList.length === 0) out.push('  （无）')
  for (const c of kongList) {
    out.push(`  ${c.itemId} ${c.name}｜终#${c.terminalSeq} 后复作于#${c.workSeq}`)
  }

  out.push('失序点名（按册序）：')
  if (violations.length === 0) out.push('  （无）')
  for (const v of violations) {
    out.push(`  立序 ${v.order[0]}→${v.order[1]}：${v.order[1]} 始#${v.bStartSeq} 早于 ${v.order[0]} 终#${v.aTerminalSeq}`)
  }

  out.push('—— 本块由确定性规则生成；重放同一流必得同一文本。')
  return out.join('\n')
}

function count(states, status) {
  return states.filter((s) => s.status === status).length
}
