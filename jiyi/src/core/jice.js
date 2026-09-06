/**
 * 稽块 —— 疑册公示与问况（逐字节确定；重放同一疑册必得同一文本）。
 *
 * CLI `block` 只持疑册（问况为零值）；插件 `jice()` 持运行时账。
 * 空籍（无册或归并后无条）出确定性空籍文本。
 */

import { mergeAsks } from './askfile.js'

export function renderJice(askfile, stats = {}) {
  const { fulfilled = 0, emptyAsk = 0, late = 0, blind = 0, unseen = 0, total = 0, band = '谋' } = stats
  const merged = mergeAsks(askfile)
  const lines = []
  lines.push('【稽疑 · 疑册】')
  if (!askfile || merged.length === 0) {
    lines.push('（空籍——无稽疑册：声明权在任务方，先立册再审计）')
    lines.push('本块由确定性规则生成；重放同一疑册必得同一文本。')
    return lines.join('\n')
  }
  const explicitN = merged.filter((a) => a.tier === 'explicit').length
  lines.push(
    `疑条 ${merged.length} 条（显式 ${explicitN} ∪ 默认 ${merged.length - explicitN}，noDefaults ${askfile.noDefaults === true ? '是' : '否'}）：`
  )
  for (const a of merged) {
    lines.push(`  · ${a.path}（${a.on}）[${a.tier === 'explicit' ? '显式' : '默认'}]`)
  }
  lines.push(`问账：谋及 ${fulfilled} · 空疑 ${emptyAsk} · 迟问 ${late} · 独谋 ${blind} · 未见 ${unseen}`)
  lines.push(`谋值：${total}（${band}）`)
  lines.push('汝则有大疑，谋及乃心，谋及卿士，谋及庶人，谋及卜筮——谋及乃心，从不单独定案。')
  lines.push('本块由确定性规则生成；重放同一疑册必得同一文本。')
  return lines.join('\n')
}
