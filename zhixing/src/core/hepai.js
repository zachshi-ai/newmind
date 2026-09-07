/**
 * 合牌块 —— 接缝供给（docs/03 §7）：凭册公示 + 知面清单 + 案账清点。
 * 同输入两次渲染必得同一文本（shasum 可证）；块中永不出现装载正文
 * （result.content 原文不入块——戒形短语与戒词原文是册面形，公示即供给本意）。
 */

export function renderPaizi(book = null, result = null) {
  const b = book ?? { rules: [], bans: [], musts: [], exempts: [], noDefaults: false }
  const out = []
  out.push('【知行 · 合牌】')
  const qinming = (b.bans?.length ?? 0) + (b.musts?.length ?? 0) + (b.exempts?.length ?? 0)
  if (!qinming && !(b.rules?.length ?? 0)) {
    out.push('凭册：亲命未立（知形在岗）')
  } else {
    const parts = []
    if (b.rules?.length) parts.push(`凭据 ${b.rules.length} 径`)
    if (b.bans?.length) parts.push(`戒词 ${b.bans.map((w) => `「${w}」`).join('')}`)
    if (b.musts?.length) parts.push(`必行 ${b.musts.map((w) => `「${w}」`).join('')}`)
    if (b.exempts?.length) parts.push(`宥词 ${b.exempts.map((w) => `「${w}」`).join('')}`)
    parts.push(b.noDefaults ? '知形关' : '知形在岗')
    out.push(`凭册：${parts.join(' · ')}`)
  }
  if (result) {
    const c = result.counts ?? {}
    out.push(
      `知账：装载 ${c.zhi ?? 0} · 戒形 ${c.jie ?? 0} · 降级 ${c.jiang ?? 0}` +
        ` · 违知 ${c.wei ?? 0} · 缺行 ${c.que ?? 0} · 宥 ${c.mian ?? 0} · 试违 ${c.shi ?? 0} · 先悖 ${c.xian ?? 0}`,
    )
    for (const z of result.zhiByPath ?? []) {
      out.push(`知面 · ${z.path} · 装载 ${z.count} 笔 · 戒形 ${z.forms.length} 条`)
    }
    for (const line of result.lines ?? []) out.push(line)
    out.push(`行值 ${result.score?.total ?? 0} 带「${result.band ?? '合'}」· 门 ${result.gate ?? 30}`)
  }
  return out.join('\n')
}
