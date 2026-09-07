/**
 * 约牌块 —— 接缝供给（docs/03 §7 锁死），逐字节确定。
 *
 * 约册公示 + 案账清点 + 逐案点名；无册出确定性文本「约册：未立（凡削皆记）」。
 * 块中永不出现任何行原文（只载径、名与案别——掩码是结构性保证）；
 * 案行序：哑削 → 明削 → 约改，族内按规整径字典序、案内名按提取序；
 * 无任何案与注记时出全坚行。同输入两次渲染逐字节相同（shasum 可证）。
 */

export function renderYuepai(book, judged) {
  const lines = []
  lines.push('【约法 · 约牌】')
  const allow = book?.allow ?? []
  if (allow.length > 0) lines.push(`约册：许削 ${allow.length} 处（${allow.join('，')}）`)
  else lines.push('约册：未立（凡削皆记）')

  const c = judged.cases
  lines.push(`案账：哑削 ${c.ya} 名 · 明削 ${c.ming} 名 · 约改 ${c.gai}`)

  for (const f of judged.findings) {
    if (f.type === '哑削') lines.push(`哑削：${f.path}（削 ${f.names.join('、')}——公面 ${f.total} 失 ${f.names.length}）`)
    else if (f.type === '明削') lines.push(`明削：${f.path}（削 ${f.names.join('、')}——声在码中）`)
    else if (f.type === '约改') lines.push(`约改：${f.path}（约据后无文之写 ${f.gap} 笔，判定不及）`)
  }
  if (judged.issues.length > 0 && judged.issues[0].startsWith('约皆坚')) {
    lines.push(judged.issues[0])
  }
  return lines.join('\n')
}
