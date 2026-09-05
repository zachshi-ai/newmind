/**
 * 证块渲染 —— 接缝处的成色清单（docs/03 §8），逐字节确定。
 *
 * 发现排序：按调用序（events 已按 seq 升序产出）；空言行在前、回令行在后
 * （同一件的空言与回令不可能并存——判定序互斥）。
 * 空言事件的 excerpt 字段即 argsText 摘录，回令事件的 excerpt 即 content 摘录
 * （均在裁决时定死，见 xiao.js）。
 */

export function renderZheng(account, k = 1) {
  const scorers = account.events.filter((e) => e.kind === '空言' || e.kind === '回令')
  const lines = []
  lines.push(`【效验 · 证块】效账 #${k}`)
  if (scorers.length === 0) {
    lines.push('证验在场——效类成功皆有可观。')
  } else {
    lines.push('事莫明于有效，论莫定于有证——以下成功信号空言虚语，验证不算数：')
    scorers.forEach((e, i) => {
      if (e.kind === '空言') {
        lines.push(`  ${i + 1}. [调用${e.call}] ${e.tool} 空言: “${e.excerpt}”→ 成功而耳目无实`)
      } else {
        lines.push(`  ${i + 1}. [调用${e.call}] ${e.tool} 回令: 以令为证——“${e.excerpt}”`)
      }
    })
  }
  lines.push(
    `离效：${account.counts.stray} 件（点名不计分）｜ 陈效：${account.counts.stale} 件 ｜ ` +
      `免验：${account.counts.exempted} 件 ｜ 效值：${account.score.total}（${account.band}）`
  )
  lines.push('—— 本块由确定性规则生成；重放同一流必得同一文本。')
  return lines.join('\n')
}
