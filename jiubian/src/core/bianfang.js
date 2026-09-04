/**
 * 变方 —— 接缝处的应变清单（docs/03-design.md §6，格式逐字锁死）。
 *
 * 同一份流（或插件同一账本状态）渲染出的文本逐字节相同；#k 随渲染次数递增。
 * 变方只列**确凿入账**的悬账，绝不虚构威胁。
 */

import { openDebts, liveScore } from './shi.js'

/**
 * @param {object} state 势账引擎状态（离线=已 finalize；插件=实时）
 * @param {number} k 渲染序号（CLI 恒 1；插件内递增）
 */
export function renderBianfang(state, k = 1) {
  const debts = state.verdictsSettled
    ? state.events.filter((ev) => ev.verdict === '悬')
    : openDebts(state)
  const { score, band, counts } = liveScore(state)
  const lines = []
  lines.push(`【九变 · 变方】势账 #${k}`)
  lines.push('兵无常势，水无常形——下列势变悬而未决，下一动作必须二选一：')
  lines.push('  · 回到对象，先行再察（read/grep 原对象）')
  lines.push('  · 明改其途：换工具族且换对象，并在动作里留下对势变的可寻址痕迹')
  if (debts.length === 0) {
    lines.push('悬账：无——势途相合，续行。')
  } else {
    lines.push('悬账（文件势变未归还）：')
    debts.forEach((ev, i) => {
      lines.push(`  ${i + 1}. [第${ev.idx + 1}次动作] ${ev.tool} ${ev.object}`)
    })
  }
  lines.push(
    `盲捶前科：${counts.blind} 记 ｜ 游骑前科：${counts.graze} 轮 ｜ 失机值：${score.total}（${band}）`,
  )
  lines.push('—— 本块由确定性规则生成；重放同一流必得同一文本。')
  return lines.join('\n')
}
