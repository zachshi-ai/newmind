/**
 * 法牌块 —— 接缝供给（docs/03 §6）：典形公示 + 典册公示 + 案账清点 + 案行点名。
 * 同输入两次渲染必得同一文本（shasum 可证）；块中永不出现写入内容原文
 * （只载径、族、基点与判语——掩码是结构性保证）。
 */

import {
  XIAN_SINGLE, XIAN_DIR_PREFIX, JIN_DIR_PREFIX, JIN_TAILS, JIN_SINGLE,
  ZHANG_PREFIX, ZHANG_SINGLE,
} from './dianxing.js'

function dianxingLines() {
  return [
    `典形：宪 ${XIAN_SINGLE.length + 1} 形（${XIAN_SINGLE.join('、')}、${XIAN_DIR_PREFIX} 前缀）`,
    `     禁 ${JIN_SINGLE.length + 1} 形（${JIN_DIR_PREFIX} 前缀∧${JIN_TAILS.join('|')}、${JIN_SINGLE.join('、')}）`,
    `     章 ${ZHANG_PREFIX.length + ZHANG_SINGLE.length} 形（${ZHANG_PREFIX.map((p) => `${p} 前缀`).join('、')}、${ZHANG_SINGLE.join('、')}）`,
  ]
}

/**
 * 渲染法牌：book 典册公示恒在；judged（judge 结果）在场时追加案账与案行。
 * 无册出确定性文本 `典册：未立（开门无据，典形全护）`。
 */
export function renderFabai(book = null, judged = null) {
  const open = book?.open ?? []
  const out = ['【恒法 · 法牌】', ...dianxingLines()]
  if (!open.length) {
    out.push('典册：未立（开门无据，典形全护）')
  } else {
    out.push(`典册：开门 ${open.length} 径（${open.join('、')}）`)
  }
  if (judged) {
    const c = judged.cases ?? {}
    out.push(`案账：宪 ${c.xian ?? 0} · 禁 ${c.jin ?? 0} · 章 ${c.zhang ?? 0} · 已复 ${c.restored ?? 0}`)
    for (const line of judged.issues ?? []) out.push(line)
  }
  return out.join('\n')
}
