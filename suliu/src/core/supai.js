/**
 * 溯牌块 —— 接缝供给（docs/03 §12 锁死），逐字节确定。
 *
 * 臆册公示 + 词法公示 + 案账清点 + 逐案点名；无册出确定性文本「臆册：未立（凡因必验）」。
 * 块中永不出现行原文与因面原文（只载 诊径:行:案别:指纹——因面词元是行内内容切片，
 * 比径名更贴文，连词元也不进块，掩码是结构性保证；案序：臆断 → 望断 → 显疑 → 迟验 →
 * 泛因 → 因皆有验）。同输入两次渲染逐字节相同（shasum 可证）。
 */

const FORM_LINE = '词法：诊面形 14 · 归因形 12 ∪ 9 · 验因三通道（拔验/重演/勘验）· 推词门'

export function renderSupai(book, judged) {
  const lines = []
  lines.push('【溯流 · 溯牌】')
  const excuse = book?.excuse ?? []
  if (excuse.length > 0) {
    lines.push(`臆册：免审 ${excuse.length} 处（${excuse.join('，')}）`)
  } else {
    lines.push('臆册：未立（凡因必验）')
  }
  lines.push(FORM_LINE)

  const c = judged.counts
  lines.push(`案账：臆断 ${c.yd} · 望断 ${c.wd} · 显疑 ${c.xy} · 迟验 ${c.cy} · 泛因 ${c.fy}`)

  for (const x of judged.issues) lines.push(x)
  return lines.join('\n')
}
