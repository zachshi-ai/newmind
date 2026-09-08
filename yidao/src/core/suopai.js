/**
 * 锁牌块 —— 接缝供给（docs/03 §8 锁死），逐字节确定。
 *
 * 锁册公示 + 形表公示 + 案账清点 + 逐案点名；无册出确定性文本「锁册：未立（凡拆皆记）」。
 * 块中永不出现尾文行原文与窗内败笔正文（只载径:行:形名、阻词与笔序——掩码是结构性
 * 保证；案行序：遇阻 → 素拆，族内按规整径字典序、行号升序；无任何案与注记时出全扃行）。
 * 同输入两次渲染逐字节相同（shasum 可证）。
 */

const FORM_TABLE_LINE = '形表：验锁 10 ∪ 网锁 2（默认 12 形）'

export function renderSuopai(book, judged) {
  const lines = []
  lines.push('【揖盗 · 锁牌】')
  const excuse = book?.excuse ?? []
  if (excuse.length > 0) lines.push(`锁册：免拆 ${excuse.length} 处（${excuse.join('，')}）`)
  else lines.push('锁册：未立（凡拆皆记）')
  lines.push(FORM_TABLE_LINE)

  const c = judged.counts
  lines.push(`案账：遇阻 ${c.yu} · 素拆 ${c.su} · 复锁 ${c.fu} · 无文之改 ${c.wu}`)

  for (const x of judged.issues) {
    if (x.startsWith('遇阻') || x.startsWith('素拆') || x.startsWith('复锁') || x.startsWith('注记')) {
      lines.push(x)
    }
  }
  if (judged.issues.length > 0 && judged.issues[0].startsWith('锁皆扃')) {
    lines.push(judged.issues[0])
  }
  return lines.join('\n')
}
