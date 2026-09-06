/**
 * 考牌块 —— 接缝供给（docs/03 §6）：契册公示 + 物账清点 + 案行点名。
 * 同输入两次渲染必得同一文本（shasum 可证）；块中永不出现末据正文（只载契名/径/条款/判语——掩码是结构性保证）。
 */

export function renderPaizi(book = null, result = null) {
  const items = book?.items ?? []
  const out = []
  out.push('【考诚 · 考牌】')
  if (!items.length) {
    out.push('契册：未立（无契而工，考诚失据）')
  } else {
    const forms = items.map((it) => `${it.name}<${it.path}·${it.form}>`).join('、')
    out.push(`契册：${forms}（物 ${items.length} 件）`)
  }
  if (result) {
    const c = result.counts ?? {}
    out.push(
      `物账：诚 ${c.cheng ?? 0} · 疵 ${c.ci ?? 0} · 壳 ${c.ke ?? 0} · 畸 ${c.qi ?? 0} · 灭 ${c.mie ?? 0}` +
        ` · 幽 ${c.you ?? 0} · 工见未考 ${c.unseen ?? 0} · 无末态 ${c.noend ?? 0}`,
    )
    for (const line of result.issues ?? []) out.push(line)
  }
  return out.join('\n')
}
