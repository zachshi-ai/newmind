/**
 * 证牌块 —— 接缝供给（docs/03 §10 锁死），逐字节确定。
 *
 * 证册公示 + 词法公示 + 案账清点 + 逐案点名；无册出确定性文本「证册：未立（凡言必据）」。
 * 块中永不出现行原文（只载 稿径:行:案别:指物:指纹——指物是案的断言数据不是文面，
 * 掩码是结构性保证；案序：幻言 → 疑言 → 迟证 → 虚指 → 言皆有据）。
 * 同输入两次渲染逐字节相同（shasum 可证）。
 */

const FORM_LINE = '词法：得言形 30 ∪ 23 · 指物三档（径指物/自指/目录指物 18）· 见据三通道（目见/书见/验见）'

export function renderZhengpai(book, judged) {
  const lines = []
  lines.push('【察传 · 证牌】')
  const excuse = book?.excuse ?? []
  const grounds = book?.grounds ?? []
  if (excuse.length > 0 || grounds.length > 0) {
    const parts = []
    if (excuse.length > 0) parts.push(`免审 ${excuse.length} 处（${excuse.join('，')}）`)
    if (grounds.length > 0) parts.push(`基径 ${grounds.length} 处（${grounds.join('，')}）`)
    lines.push(`证册：${parts.join(' · ')}`)
  } else {
    lines.push('证册：未立（凡言必据）')
  }
  lines.push(FORM_LINE)

  const c = judged.counts
  lines.push(`案账：幻言 ${c.hy} · 疑言 ${c.yy} · 迟证 ${c.cz} · 虚指 ${c.xz}`)

  for (const x of judged.issues) lines.push(x)
  return lines.join('\n')
}
