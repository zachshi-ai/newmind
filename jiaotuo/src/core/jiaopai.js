/**
 * 矫牌块 —— 接缝供给（docs/03 §9 锁死），逐字节确定。
 *
 * 诏册公示 + 引形表公示 + 案账清点 + 逐案点名；无册出确定性文本「诏册：未立（凡托皆记）」。
 * 块中永不出现引语原文与诏本正文（只载 径:行:案别:指纹、托径与词元命中数——掩码是
 * 结构性保证；案行序：矫引 → 佚据 → 征引 → 征据 → 托主 → 阙据 → 泛引 → 全信）。
 * 同输入两次渲染逐字节相同（shasum 可证）。
 */

const FORM_TABLE_LINE = '引形：文书型 16 ∪ 泛型 9（默认 25 形）'

export function renderJiaopai(book, judged) {
  const lines = []
  lines.push('【矫托 · 矫牌】')
  const excuse = book?.excuse ?? []
  if (excuse.length > 0) lines.push(`诏册：免案 ${excuse.length} 处（${excuse.join('，')}）`)
  else lines.push('诏册：未立（凡托皆记）')
  lines.push(FORM_TABLE_LINE)

  const c = judged.counts
  lines.push(`案账：矫引 ${c.zj} · 佚据 ${c.yj} · 征引 ${c.zy} · 托主 ${c.zhu} · 阙据 ${c.que} · 泛引 ${c.fan}`)

  for (const x of judged.issues) lines.push(x)
  return lines.join('\n')
}
