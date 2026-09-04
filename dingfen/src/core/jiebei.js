/**
 * 界碑块 —— 接缝处的分册公示（卖兔满市，行者不顾）。
 *
 * 逐字节确定：同一分册状态，两次渲染逐字节相同（无 #k 计数——块只反映册态）。
 * 模板锁死在 docs/03 §8；每处争界附见证径，见证径真实命中双方 glob。
 */

import { isOpen, findOverlaps } from './fence.js'
import { emptyRegistry } from './fence.js'

export function renderJiebei(reg) {
  const r = reg ?? emptyRegistry()
  const open = r.claims.filter(isOpen)
  const lines = ['【定分 · 界碑】']
  if (open.length === 0) {
    lines.push('分册无开放之分——无分之地，写入先领分。')
  } else {
    lines.push(`在册开放之分 ${open.length} 条：`)
    for (const c of open) lines.push(`  · ${c.id} ── ${c.fences.join(' ')}`)
  }
  // 册内两两争界（只看开放之分；见证自证在 fence.findOverlaps 里做）
  const pairwise = []
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      for (const g1 of open[i].fences) {
        for (const g2 of open[j].fences) {
          const ov = findOverlaps({ version: 1, claims: [open[j]] }, { id: open[i].id, fences: [g1] })
          for (const o of ov) pairwise.push(o)
        }
      }
    }
  }
  if (pairwise.length === 0) {
    lines.push('争界：无——分已定，行者不顾。')
  } else {
    lines.push(`争界 ${pairwise.length} 处：`)
    for (const o of pairwise) lines.push(`  · ${o.a} × ${o.b} ── 见证径 ${o.witness}（${o.globA} × ${o.globB}）`)
  }
  lines.push('本块由确定性规则生成；重放同一分册必得同一文本。')
  return lines.join('\n') + '\n'
}
