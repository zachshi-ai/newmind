/**
 * 要籍 —— 接缝处的账内工作集地图（docs/03-design.md §7，格式逐字锁死）。
 *
 * 同一份账本状态渲染出的文本逐字节相同；#k 随渲染次数递增。要籍只列**确凿入账**的
 * 见闻与陈账，绝不虚构威胁。缘督以为经：以一线要籍为常。
 */

import { liveScore, chenAccounts } from './jianwen.js'

/**
 * @param {object} state 见闻账引擎状态（离线=已 finalize；插件=实时）
 * @param {number} k 渲染序号（CLI 恒 1；插件内递增）
 * @param {number} gate 门（默认 30）
 */
export function renderYaoji(state, k = 1, gate = 30) {
  const { score, band, counts } = liveScore(state)
  const chen = chenAccounts(state)
  const lines = []
  lines.push(`【有涯 · 要籍】见闻账 #${k}`)
  lines.push('吾生也有涯，而知也无涯。已见未变之物，官知止而神欲行——不必复见。')
  if (chen.length === 0) {
    lines.push('（无陈账：见闻皆鲜，游刃有余。）')
  } else {
    lines.push('陈账（隔久未顾——复见之诱，动手前先想是否真需要再装载）：')
    chen.forEach((row, i) => {
      const mark = row.kind === 'write' ? '写后未再顾' : '其间无写'
      lines.push(
        `  ${i + 1}. ${row.object} ｜ 末见闻第${row.at}调用 ｜ 已隔${row.gap}调 ｜ ${mark}`,
      )
    })
  }
  lines.push(
    `工作集：路径 ${counts.paths} ｜ 命令 ${counts.commands} ｜ 复见 ${counts.fujianCases} 案 ｜ 复命 ${counts.fumingCases} 案`,
  )
  lines.push(`殆值：${score.total}（${band}）｜ 门 ${gate}`)
  lines.push('—— 本块由确定性规则生成；重放同一流必得同一文本。')
  return lines.join('\n')
}
