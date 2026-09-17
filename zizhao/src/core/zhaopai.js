/**
 * 照牌块 —— 接缝供给（docs/03 §11 锁死），逐字节确定。
 *
 * 照册公示 + 词法公示 + 案账清点 + 逐案点名；无册出确定性文本「照册：未立（凡弃必凭）」。
 * 块中永不出现行原文与对象词元原文（只载 责径:行:案别:指纹——对象词元是行内内容切片，
 * 连词元也不进块，掩码是结构性保证；案序：护短 → 镜凭 → 思短 → 泛弃 → 虚弃）。
 * 同输入两次渲染逐字节相同（shasum 可证）。
 */

const FORM_LINE = '词法：责面形 10 · 弃责形 10 ∪ 15 · 否定卫 · 镜形 · 三通道（红账/镜凭/思短）'

export function renderZhaopai(book, judged) {
  const lines = []
  lines.push('【自照 · 照牌】')
  const allow = book?.allow ?? []
  if (allow.length > 0) {
    lines.push(`照册：免审 ${allow.length} 处（${allow.join('，')}）`)
  } else {
    lines.push('照册：未立（凡弃必凭）')
  }
  lines.push(FORM_LINE)

  const c = judged.counts
  lines.push(`案账：护短 ${c.hd} · 思短 ${c.sg} · 泛弃 ${c.fq} · 虚弃 ${c.xq} · 镜凭 ${c.mp}`)

  for (const x of judged.issues) lines.push(x)
  return lines.join('\n')
}
