/**
 * 量牌块 —— 足册公示（接缝供给，逐字节确定）。
 *
 * 同一足册与同一量账计数两次渲染必得同一文本（shasum 可证）；
 * 全缺省输出确定性文本。注入与否由宿主决定。
 */

import { DEFAULT_THRESHOLDS } from './zuce.js'

const ZERO_STATS = { hugeWrites: 0, fanouts: 0, churns: 0, freshNotes: 0, exempted: 0 }

export function renderLiangpai(book, stats = null) {
  const s = stats ?? ZERO_STATS
  const th = { ...DEFAULT_THRESHOLDS, ...(book ?? {}) }
  const exempt = book?.exempt ?? []
  const lines = []
  lines.push('【知足 · 量牌】')
  lines.push(`足册：巨写阈 ${th.hugeLines} 行 · 蔓延阈 ${th.fanDirs} 目录/${th.fanFiles} 文件 · 屡改免 ${th.churnFree} 笔`)
  lines.push(`豁免径 ${exempt.length} 条`)
  for (const w of exempt) lines.push(`  · ${w}`)
  lines.push(
    `量账：巨写 ${s.hugeWrites} · 蔓延 ${s.fanouts} · 屡改 ${s.churns} · 创笔 ${s.freshNotes} · 豁免 ${s.exempted}`,
  )
  lines.push('行少欲者，心则坦然，无所忧畏——知足')
  lines.push('本块由确定性规则生成；重放同一足册必得同一文本。')
  return lines.join('\n')
}
