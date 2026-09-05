/**
 * 柄牌块渲染 —— 接缝处的确定性供给件（docs/03 §10）。
 *
 * 同一账本状态两次渲染逐字节相同（#k 随渲染递增且仅此一处不同）；
 * 无时间戳；案序 = 流序。牌是镜子，不是法官：只公示柄在不在，不仲裁该不该发。
 */

import { liveScore } from './bingzhang.js'

/**
 * @param {object} state 柄账引擎状态
 * @param {number} k 渲染序号（随渲染递增）
 * @param {number} gate 门
 */
export function renderBingpai(state, k, gate) {
  const events = state.events
  const live = liveScore(state)
  const qin = events.filter((e) => e.kind === '侵柄')
  const du = events.filter((e) => e.kind === '渍请')
  const total = live.score.total
  const band = live.band
  const grants = state.register.grant ?? []
  const handles = state.register.handle ?? []

  const out = []
  out.push(`【二柄 · 柄牌块 #${k}】`)
  out.push(`柄值 ${total}（${band}），门 ${gate}，判 ${total < gate ? 'pass' : 'fail'}`)
  out.push(
    `柄账：受审 exec ${live.counts.execObserved} 次，决形命中 ${live.counts.hitsObserved} 次` +
      `（侵柄 ${live.counts.qinCases} 案 + 显式 ${live.counts.declareItems} 件），` +
      `渍请 ${live.counts.duCases}，有命 ${live.counts.warranted}，未遂 ${live.counts.feints}，` +
      `未判 ${live.counts.undetermined}（主文 ${live.counts.principals}，请言 ${live.counts.appeals}）`,
  )

  out.push('侵柄点名（按案序）：')
  if (qin.length === 0) out.push('  （无）')
  for (const kase of qin) {
    out.push(`  #${kase.seq} ${kase.tool ?? ''}｜族:${kase.familyLabel}${kase.asked ? '｜请而未待命' : ''}`)
    out.push(`    - ${kase.excerpt}`)
  }

  out.push('渍请点名（按案序）：')
  if (du.length === 0) out.push('  （无）')
  for (const kase of du) {
    out.push(`  #${kase.seq}｜${kase.excerpt}`)
  }

  out.push(`授词公示：${grants.length > 0 ? grants.join('、') : '（无）'}`)
  if (handles.length > 0) out.push(`显式柄事：${handles.join('、')}`)
  out.push('—— 本块由确定性规则生成；重放同一流必得同一文本。')
  return out.join('\n')
}
