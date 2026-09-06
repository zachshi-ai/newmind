/**
 * 材牌块 —— 材册公示（逐字节确定；同一册两次渲染必得同一文本，shasum 可证）。
 *
 * 残记/窗字段计数取**生效表**大小（默认 ∪ 显式，noDefaults 时仅显式）。
 * counts 缺省时省略材账行（CLI block 只公示册）；插件侧传入引擎 counts 供给带账版。
 */

import { assembleOpts } from './caice.js'

export function renderCaipai(book, counts = null) {
  const cfg = assembleOpts({ book })
  const lines = []
  lines.push('【审曲 · 材牌】')
  lines.push(`材册：残记 ${cfg.tailMarkers.length + cfg.anyMarkers.length} 形 · 窗字段 ${cfg.capFields.length + cfg.offFields.length} 名 · 碎览阈 ${cfg.fragWindows} 窗`)
  if (cfg.exempt.length > 0) {
    lines.push(`豁免径 ${cfg.exempt.length} 条`)
    for (const w of cfg.exempt) lines.push(`  · ${w}`)
  }
  if (counts) {
    lines.push(`材账：盲动 ${counts.blindActs} · 碎览 ${counts.crawls} · 残见 ${counts.partialViews} · 全览 ${counts.fullViews}`)
  }
  lines.push('审曲面势，以饬五材——合此四者，然后可以为良')
  lines.push('本块由确定性规则生成；重放同一材册必得同一文本。')
  return `${lines.join('\n')}\n`
}
