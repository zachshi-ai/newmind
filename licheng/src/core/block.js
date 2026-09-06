/**
 * 结账块渲染 —— 供给物，逐字节确定。
 * 无时间戳、无随机数；悬结按账序（引擎返回序即账序）；引文按分带二选一：
 * 无咎 → 乾·文言（庸言之信）；吝/咎 → 系辞上（无咎者善补过）。
 */

export function renderBlock(report) {
  const t = report.totals
  const lines = []
  lines.push('【立诚 · 结绳】')
  lines.push(
    `诺言：立 ${t.promised} · 兑现 ${t.discharged} · 改诺 ${t.revised} · 弃约 ${t.abandoned} · 失诺 ${t.breached}`
  )
  lines.push(`咎值：${report.score}（${report.band}）· 门 ${report.gate}`)
  for (const k of report.knots) {
    if (k.leniency > 0) {
      lines.push(`悬结：${k.id}「${k.what}」咎+30，轻诺+10（整条链无凭据）`)
    } else {
      lines.push(`悬结：${k.id}「${k.what}」咎+30（凭据无匹配）`)
    }
  }
  for (const k of report.lenientAbandoned) {
    lines.push(`轻诺：${k.id}「${k.what}」吝+10（无凭弃约）`)
  }
  if (t.breached === 0 && report.lenientAbandoned.length === 0) {
    lines.push('绳上无悬结。')
  }
  lines.push(
    report.band === '无咎'
      ? '——《周易·乾·文言》：庸言之信，庸行之谨。'
      : '——《周易·系辞上》：无咎者，善补过也。'
  )
  return lines.join('\n') + '\n'
}
