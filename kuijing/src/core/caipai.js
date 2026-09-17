/**
 * 刺牌块 —— 接缝供给（docs/03 §12 锁死），逐字节确定。
 *
 * 赏册公示 + 词法公示 + 案账清点 + 逐案点名；无册出确定性文本「赏册：未立（凡翻必据）」。
 * 块中永不出现行原文与对象词元原文（只载 判径:行:案别:指纹——对象词元是行内内容切片，
 * 连词元也不进块，掩码是结构性保证；案序：翻案/谀断在前，鉴更/泛判注记排其后）。
 * 同输入两次渲染逐字节相同（shasum 可证）。
 */

const FORM_LINE =
  '词法：判面形 10 · 可形 6∪7 · 否形 7∪11 · 虞形 6∪7 · 靖形 7∪8 · 褒形 6∪6 · 否定卫 · 据件三通道（exec 成败皆算/observe 成功/write 径）'

export function renderCaipai(book, judged) {
  const lines = []
  lines.push('【窥镜 · 刺牌】')
  const allow = book?.allow ?? []
  if (allow.length > 0) {
    lines.push(`赏册：免审 ${allow.length} 处（${allow.join('，')}）`)
  } else {
    lines.push('赏册：未立（凡翻必据）')
  }
  lines.push(FORM_LINE)

  const c = judged.counts
  lines.push(`案账：翻案 ${c.fa} · 谀断 ${c.yd} · 泛判 ${c.pj} · 鉴更 ${c.gy}`)

  for (const x of judged.issues) lines.push(x)
  return lines.join('\n')
}
