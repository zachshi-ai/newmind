/**
 * 帚牌块 —— 接缝供给（docs/03 §8 锁死），逐字节确定。
 *
 * 留册公示 + 案账清点 + 逐处点名；无册出确定性文本「留册：未立（凡迹皆记）」。
 * 块中永不出现任何行原文（只载径、行号与形名——掩码是结构性保证）；
 * 案行序：遗针 → 遗屑 → 已扫 → 帚账不前，族内按规整径字典序、径内按行号升序；
 * 无任何案与注记时出全洁行。同输入两次渲染逐字节相同（shasum 可证）。
 */

export function renderZhoupai(book, judged) {
  const lines = []
  lines.push('【扫屋 · 帚牌】')
  const retain = book?.retain ?? []
  if (retain.length > 0) lines.push(`留册：许留 ${retain.length} 处（${retain.join('，')}）`)
  else lines.push('留册：未立（凡迹皆记）')

  const c = judged.cases
  lines.push(`案账：遗针 ${c.zhen} 处 · 遗屑 ${c.xie} 处 · 已扫 ${c.sao} · 帚账不前 ${c.qian}`)

  for (const f of judged.findings) {
    if (f.kind === 'zhen') lines.push(`遗针：${f.path}:${f.line}（${f.name}）`)
    else if (f.kind === 'xie') lines.push(`遗屑：${f.path}:${f.line}（${f.name}）`)
  }
  for (const n of judged.notes) {
    if (n.sao) lines.push(`已扫：${n.path}（曾撒 ${n.sao.count} 处，末卷已净）`)
  }
  for (const n of judged.notes) {
    if (n.qian) lines.push(`帚账不前：${n.path}（末卷后无文之写 ${n.qian.gap} 笔，判定止于末卷）`)
  }
  if (judged.issues.length > 0 && judged.issues[0].startsWith('帚过皆洁')) {
    lines.push(judged.issues[0])
  }
  return lines.join('\n')
}
