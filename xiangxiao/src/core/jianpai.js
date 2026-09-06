/**
 * 谏牌块 —— 声册公示（接缝供给，逐字节确定）。
 *
 * 同一声册与同一声账计数两次渲染必得同一文本（shasum 可证）；
 * 空册输出确定性空册文本。注入与否由宿主决定。
 */

import { registryCount } from './shengce.js'

export function renderJianpai(registry, stats = null) {
  const s = stats ?? {
    mutedDirectives: 0, bypassFlags: 0, skippedTests: 0, keptDirectives: 0, justified: 0, exempted: 0,
  }
  const lines = []
  lines.push('【乡校 · 谏牌】')
  if (!registry || (registryCount(registry) === 0 && !registry.noDefaults)) {
    lines.push('空册——声无所豁，形无所增；默认形照常在岗。')
    lines.push('本块由确定性规则生成；重放同一声册必得同一文本。')
    return lines.join('\n')
  }
  lines.push(`豁免词 ${registry.mute.length} 条：`)
  for (const w of registry.mute) lines.push(`  · ${w}`)
  lines.push(`显式形 ${registry.forms.length} 条：`)
  for (const f of registry.forms) lines.push(`  · ${f}`)
  lines.push(`默认形：${registry.noDefaults ? '关（只剩显式形）' : '开（16 形在岗）'}`)
  lines.push(`后缀增词 ${registry.extraExts.length} 条`)
  lines.push(
    `声账：缄笔 ${s.mutedDirectives} · 避检 ${s.bypassFlags} · 略测 ${s.skippedTests} · 保留 ${s.keptDirectives} · 有凭之默 ${s.justified} · 豁免 ${s.exempted}`
  )
  lines.push('是吾师也，若之何毁之——乡校')
  lines.push('本块由确定性规则生成；重放同一声册必得同一文本。')
  return lines.join('\n')
}
