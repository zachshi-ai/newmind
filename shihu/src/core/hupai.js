/**
 * 状牌块 —— 接缝供给（docs/03 §8 锁死），逐字节确定。
 *
 * 状册公示 + 案账清点 + 逐条点名；无册出确定性文本「状册：未立（凡状皆对）」。
 * 块中永不出现任何行原文（只载径、行号与状键——掩码是结构性保证）；
 * 案行序：虚功 → 掠据 → 无键，族内按规整径字典序、行号升序；
 * 无任何案与注记时出全实行。同输入两次渲染逐字节相同（shasum 可证）。
 */

export function renderHupai(book, judged) {
  const lines = []
  lines.push('【市虎 · 状牌】')
  const exempt = book?.exempt ?? []
  if (exempt.length > 0) lines.push(`状册：豁免 ${exempt.length} 处（${exempt.join('，')}）`)
  else lines.push('状册：未立（凡状皆对）')

  const c = judged.cases
  lines.push(`案账：虚功 ${c.xu} · 掠据 ${c.lue} · 无键 ${c.wu}`)

  for (const f of judged.findings) {
    if (f.type === '虚功') lines.push(`虚功：${f.path}:${f.line}（状键 ${f.keys.join('、')}——本会话作工面查无）`)
    else if (f.type === '掠据') lines.push(`掠据：${f.path}:${f.line}（引用署名——转述上游之功）`)
    else if (f.type === '无键') lines.push(`无键：${f.path}:${f.line}（剥状词后无对象词元，无从对账）`)
  }
  if (judged.issues.length > 0 && judged.issues[0].startsWith('状皆实')) {
    lines.push(judged.issues[0])
  }
  return lines.join('\n')
}
