/**
 * 土牌块 —— 土册公示与终局清点（接缝供给，逐字节确定，docs/03 §9）。
 *
 * 同一土册与同一清点两次渲染必得同一文本（shasum 可证）；全缺省输出确定性文本。注入与否由宿主决定。
 */

export function renderTupai(book, stats = null, settledLines = null) {
  const s = { mutated: 0, restored: 0, exempted: 0, leftReside: 0, leftInst: 0, leftConf: 0, muts: 0, ...(stats ?? {}) }
  const b = book ?? {}
  const install = [...(b.install ?? [])]
  const config = [...(b.config ?? [])]
  const reside = [...(b.reside ?? [])]
  const lines = []
  lines.push('【水土 · 土牌】')
  lines.push(`土册：install ${install.length} 条 · config ${config.length} 条 · reside ${reside.length} 条`)
  for (const w of install) lines.push(`  · install ${w}`)
  for (const w of config) lines.push(`  · config ${w}`)
  for (const w of reside) lines.push(`  · reside ${w}`)
  lines.push(
    `清点：改动 ${s.mutated} 笔 · 案 ${s.muts} · 复 ${s.restored} · 豁 ${s.exempted} · 驻遗 ${s.leftReside} · 装遗 ${s.leftInst} · 改遗 ${s.leftConf}`,
  )
  if (settledLines != null) {
    const groups = [
      ['驻遗点名：', (l) => l.state === '遗' && l.family === '驻'],
      ['装遗点名：', (l) => l.state === '遗' && l.family === '装'],
      ['改遗点名：', (l) => l.state === '遗' && l.family === '改'],
    ]
    for (const [title, pick] of groups) {
      const picked = settledLines
        .filter(pick)
        .sort((a, b2) => (a.key < b2.key ? -1 : a.key > b2.key ? 1 : 0))
      lines.push(title)
      if (picked.length) for (const l of picked) lines.push(`  · ${l.key}（会话 ${l.session}）`)
      else lines.push('  · 无——水土如初')
    }
  }
  lines.push('橘生淮南则为橘，生于淮北则为枳——水土')
  lines.push('本块由确定性规则生成；重放同一土册必得同一文本。')
  return lines.join('\n')
}
