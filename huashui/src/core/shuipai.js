/**
 * 水牌块 —— 接缝供给（docs/03 §6 锁死），逐字节确定。
 *
 * 水册公示 + 案账清点 + 逐案点名；无册出确定性文本「水册：未立（凡覆皆记）」。
 * 块中永不出现任何行原文（只载径、seq、行数与案别——掩码是结构性保证）；
 * 案行序：覆世 → 覆己 → 失鲜 → 陈改，族内按规整径字典序、seq 升序；
 * 无任何案与注记时出全活行。同输入两次渲染逐字节相同（shasum 可证）。
 */

export function renderShuipai(book, judged) {
  const lines = []
  lines.push('【画水 · 水牌】')
  const excuse = book?.excuse ?? []
  if (excuse.length > 0) lines.push(`水册：许复 ${excuse.length} 处（${excuse.join('，')}）`)
  else lines.push('水册：未立（凡覆皆记）')

  const c = judged.cases
  lines.push(`案账：覆世 ${c.shi} · 覆己 ${c.ji} · 失鲜 ${c.xian} · 陈改 ${c.gai}`)

  for (const f of judged.findings) {
    if (f.type === '覆世' || f.type === '覆己') {
      const reread = f.reread ? ' · 案前曾重读' : ''
      lines.push(`${f.type}：${f.path}（seq ${f.seq} 覆 seq ${f.mSeq}——陈线 ${f.chen} · 新线 ${f.xin}${reread}）`)
    } else if (f.type === '失鲜') {
      lines.push(`失鲜：${f.path}（seq ${f.seq}——陈线 ${f.chen} · 新线 ${f.xin}）`)
    } else if (f.type === '陈改') {
      lines.push(`陈改：${f.path}（最近文据后无文之写 ${f.gap} 笔，判定不及）`)
    }
  }
  if (judged.issues.length > 0 && judged.issues[0].startsWith('水皆活')) {
    lines.push(judged.issues[0])
  }
  return lines.join('\n')
}
