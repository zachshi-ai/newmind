/**
 * 舍牌块 —— 筏册公示与终局清点（接缝供给，逐字节确定，docs/03 §9）。
 *
 * 同一筏册与同一清点两次渲染必得同一文本（shasum 可证）；全缺省输出确定性文本。注入与否由宿主决定。
 */

import { DEFAULT_RAFT_FORMS, DEFAULT_KEEP_FORMS } from './zuce.js'

const ZERO_STATS = { dropped: 0, removed: 0, adopted: 0, exempted: 0, left: 0, stray: 0 }

export function renderShepai(book, stats = null, settledLines = null) {
  const s = { ...ZERO_STATS, ...(stats ?? {}) }
  const b = book ?? {}
  const noDefaults = b.noDefaults === true
  const keep = [...(b.keep ?? [])]
  const raft = noDefaults ? [...(b.raft ?? [])] : [...new Set([...DEFAULT_RAFT_FORMS, ...(b.raft ?? [])])]
  const keepAll = [...new Set([...DEFAULT_KEEP_FORMS, ...keep])]
  const roots = [...(b.roots ?? [])]
  const lines = []
  lines.push('【舍筏 · 舍牌】')
  lines.push(
    `筏册：keep ${keepAll.length} 条 · 筏形 ${raft.length} 条 · 域界 ${roots.length} 条 · 默认形表 ${noDefaults ? '关' : '开'}`,
  )
  for (const w of keep) lines.push(`  · keep ${w}`)
  for (const w of b.raft ?? []) lines.push(`  · 筏形 ${w}`)
  for (const g of roots) lines.push(`  · 域界 ${g}`)
  lines.push(`清点：落物 ${s.dropped} 笔 · 筏径 ${s.paths ?? 0} · 舍 ${s.removed} · 归 ${s.adopted} · 外逸 ${s.stray} · 遗 ${s.left}`)
  if (settledLines != null) {
    const strays = settledLines.filter((l) => l.state === '外逸')
    const lefts = settledLines.filter((l) => l.state === '遗')
    lines.push('外逸点名：')
    if (strays.length) for (const l of strays) lines.push(`  · ${l.path}（形 ${l.form} · 会话 ${l.session}）`)
    else lines.push('  · 无——渡尽舍筏')
    lines.push('遗筏点名：')
    if (lefts.length) for (const l of lefts) lines.push(`  · ${l.path}（形 ${l.form} · 会话 ${l.session}）`)
    else lines.push('  · 无——渡尽舍筏')
  }
  lines.push('法尚应舍，何况非法——舍筏')
  lines.push('本块由确定性规则生成；重放同一筏册必得同一文本。')
  return lines.join('\n')
}
