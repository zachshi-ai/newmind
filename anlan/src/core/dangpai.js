/**
 * 荡牌块 —— 接缝供给（docs/03 §11 锁死），逐字节确定。
 *
 * 澜册公示 + 词法公示 + 案账清点 + 逐案点名；无册出确定性文本「澜册：未立（凡荡必审）」。
 * 块中永不出现命令原文、输出原文与搅笔原文（只载 对象词元:案别:指纹——原文不进块，
 * 掩码是结构性保证；案序：荡案在前，风浪注记排其后）。
 * 同输入两次渲染逐字节相同（shasum 可证）。
 */

const FORM_LINE = '词法：诊形 44 · 叠三搅二 · 平漾荡三带（荡=叠≥3∧搅窗≥2，浪=叠≥3∧搅窗<2）'

export function renderDangpai(book, judged) {
  const lines = []
  lines.push('【安澜 · 荡牌】')
  const spare = book?.spare ?? []
  const forms = book?.forms ?? []
  if (spare.length > 0 || forms.length > 0 || book?.noDefaults === true) {
    const parts = []
    parts.push(`豁免 ${spare.length} 对象${spare.length > 0 ? `（${spare.join('，')}）` : ''}`)
    parts.push(`增形 ${forms.length}${forms.length > 0 ? `（${forms.join('，')}）` : ''}`)
    if (book?.noDefaults === true) parts.push('默认诊形关')
    lines.push(`澜册：${parts.join(' · ')}`)
  } else {
    lines.push('澜册：未立（凡荡必审）')
  }
  lines.push(FORM_LINE)

  const c = judged.counts
  lines.push(`案账：荡案 ${c.dang} · 风浪 ${c.feng}（顺 ${c.zhen} · 逆 ${c.ni} · 搅 ${c.jiao}）`)

  for (const x of judged.issues) lines.push(x)
  return lines.join('\n')
}
