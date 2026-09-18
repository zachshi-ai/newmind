/**
 * 疾牌块 —— 接缝供给（docs/03 §10 锁死），逐字节确定。
 *
 * 痊册公示 + 词法公示 + 案账清点 + 逐案点名；无册出确定性文本「痊册：未立（凡愈必痊）」。
 * 块中永不出现行原文与对象词元原文（只载 稿径:行:案别:指纹——对象词元是行内内容切片，
 * 连词元也不进块，掩码是结构性保证；案序：讳案在前，已痊/泛愈/迟痊注记排其后）。
 * 同输入两次渲染逐字节相同（shasum 可证）。
 */

const FORM_LINE =
  '词法：愈形 13∪14 · 检形 44 · 否定卫 · 疾痊两通道（疾=exec 红旗×检形×词元 ∪ 痊=点痊×词元 ∪ 扫痊×全量）'

export function renderJipai(book, judged) {
  const lines = []
  lines.push('【讳疾 · 疾牌】')
  const allow = book?.allow ?? []
  if (allow.length > 0) {
    lines.push(`痊册：免审 ${allow.length} 处（${allow.join('，')}）`)
  } else {
    lines.push('痊册：未立（凡愈必痊）')
  }
  lines.push(FORM_LINE)

  const c = judged.counts
  lines.push(`案账：讳案 ${c.hui} · 已痊 ${c.yu} · 泛愈 ${c.fy} · 迟痊 ${c.zhi}`)

  for (const x of judged.issues) lines.push(x)
  return lines.join('\n')
}
