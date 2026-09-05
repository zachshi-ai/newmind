/**
 * 名册块 —— 实册公示（接缝供给，逐字节确定）。
 *
 * 同一实册与同一统计两次渲染必得同一文本（shasum 可证）；
 * 空籍输出确定性空籍文本。注入与否由宿主决定。
 */

import { registryCount } from './shi.js'

export function renderMingce(registry, stats = null) {
  const s = stats ?? {
    ghostPackages: 0, ghostRelatives: 0, strayInstalls: 0, trialInstalls: 0, exemptImports: 0,
  }
  const lines = []
  lines.push('【名实 · 名册】')
  if (!registry || registryCount(registry) === 0) {
    lines.push('空册——名无所保，审计不行（先 register 再 block）。')
    lines.push('本块由确定性规则生成；重放同一实册必得同一文本。')
    return lines.join('\n')
  }
  if (registry.roots.length) {
    lines.push(`树界 ${registry.roots.length} 条：`)
    for (const r of registry.roots) lines.push(`  · ${r}`)
  } else {
    lines.push('树界 0 条：')
  }
  if (registry.packages.length) {
    lines.push(`包册 ${registry.packages.length} 个：`)
    for (const p of registry.packages) lines.push(`  · ${p}`)
  } else {
    lines.push('包册 0 个：')
  }
  lines.push(`执法态：${registry.strictDeps ? '严（册外装成记犯装）' : '宽（册外装成记新装）'}`)
  lines.push(
    `名账：幻包 ${s.ghostPackages} · 幻径 ${s.ghostRelatives} · 新装/犯装 ${s.strayInstalls} · 试装 ${s.trialInstalls} · 实名 ${s.exemptImports}`
  )
  lines.push('夫名，实谓也——名实')
  lines.push('本块由确定性规则生成；重放同一实册必得同一文本。')
  return lines.join('\n')
}
