/**
 * 导牌块 —— 接缝供给（docs/03 §7）：湮形公示 + 川册公示 + 案账清点 + 逐案点名。
 * 同输入两次渲染必得同一文本（shasum 可证）；块中永不出现命中行原文
 * （只载径、行号、形名与判语——掩码是结构性保证）。
 */

import { GUIDE_WORDS } from './yanxing.js'

const FORM_NAMES = ['空捕', '空还', '空接', '单行空捕', '多行空捕', '空救']

/**
 * 渲染导牌：book 川册公示恒在；judged（judge 结果）在场时追加案账与案行。
 * 无册出确定性文本 `川册：未立（纵列无据，湮形全护）`。
 */
export function renderDaopai(book = null, judged = null) {
  const indulge = book?.indulge ?? []
  const out = ['【防川 · 导牌】']
  out.push(`湮形：${FORM_NAMES.join('、')}（${FORM_NAMES.length} 形；导词 ${GUIDE_WORDS.length} 词）`)
  if (!indulge.length) {
    out.push('川册：未立（纵列无据，湮形全护）')
  } else {
    out.push(`川册：纵列 ${indulge.length} 径（${indulge.join('、')}）`)
  }
  if (judged) {
    const c = judged.cases ?? {}
    out.push(`案账：湮 ${c.yan ?? 0} · 已浚 ${c.jun ?? 0} · 沙川 ${c.sha ?? 0} · 无文 ${c.wu ?? 0}`)
    for (const line of judged.issues ?? []) out.push(line)
  }
  return out.join('\n')
}
