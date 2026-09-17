/**
 * 瑕牌块 —— 接缝供给（docs/03 §10 锁死），逐字节确定。
 *
 * 瑕册公示 + 词法公示 + 案账清点 + 逐案点名；无册出确定性文本「瑕册：未立（凡卷皆审）」。
 * 块中永不出现行原文（只载 径:行:案别:数据:指纹——数字与日期是案的断言数据不是文面，
 * 掩码是结构性保证；案行序：乖列 → 乖总 → 倒期 → 阙列 → 已磨 → 全净）。
 * 同输入两次渲染逐字节相同（shasum 可证）。
 */

const FORM_LINE = '词法：数言三形——乖列（言列不敷）/ 乖总（总分不敷）/ 倒期（起止倒置）'

export function renderXiapai(book, judged) {
  const lines = []
  lines.push('【指瑕 · 瑕牌】')
  const excuse = book?.excuse ?? []
  if (excuse.length > 0) lines.push(`瑕册：免审 ${excuse.length} 处（${excuse.join('，')}）`)
  else lines.push('瑕册：未立（凡卷皆审）')
  lines.push(FORM_LINE)

  const c = judged.counts
  lines.push(`案账：乖列 ${c.gl} · 乖总 ${c.gz} · 倒期 ${c.dq} · 阙列 ${c.que} · 已磨 ${c.mo}`)

  for (const x of judged.issues) lines.push(x)
  return lines.join('\n')
}
