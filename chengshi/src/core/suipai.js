/**
 * 遂牌块 —— 接缝供给（docs/03 §7，逐字节确定）。
 *
 * 块中永不出现命令原文与实参（遂名 = 形词 + djb2 指纹——掩码是结构性保证）；
 * 案行排序：重决 → 已消 → 豁施 → 承施 → 末消，族内按遂名字典序；
 * 同输入两次渲染逐字节相同（shasum 可证）。
 */

import { FORM_COUNTS, FORM_TOTAL } from './suixing.js'

const FORM_NAMES = 'gh 建档、gh 评论、gh 发版、gh 片、gh 标、gh api 显 POST、gh api 默 POST、mail、mailx、sendmail、mutt、msmtp、显 POST、默 POST、httpie'

function registryLine(book) {
  const allow = book?.allow ?? null
  if (!allow || allow.length === 0) return '遂册：未立（允列无据，已遂照账）'
  return `遂册：允 ${allow.length} 键（${allow.join('、')}）`
}

/** 仅公示（CLI block 无流）：遂形 + 遂册。 */
export function renderSuipai(book) {
  return [
    '【成事 · 遂牌】',
    `遂形：${FORM_TOTAL} 形（启 ${FORM_COUNTS.启} · 邮 ${FORM_COUNTS.邮} · 单 ${FORM_COUNTS.单}）：${FORM_NAMES}`,
    registryLine(book),
  ].join('\n')
}

/** 全量（插件 paizi）：遂形 + 遂册 + 遂账清点与案行。 */
export function renderSuipaiWithLedger(book, judged) {
  const out = [renderSuipai(book)]
  const c = judged.cases
  out.push(
    `遂账：初遂 ${c.chu} · 重决 ${c.chong} · 已消 ${c.xiao} · 豁施 ${c.huo} · 承施 ${c.cheng}`,
  )
  const lines = [...judged.lines].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const l of lines) {
    const chongs = l.states.filter((s) => s.state === '重决')
    if (chongs.length) {
      const ords = chongs.map((s) => `seq ${s.ord}`).join('、')
      out.push(`重决：${l.name} ×${chongs.length}（初遂 seq ${l.firstOrd}，再施 ${ords}）`)
    }
  }
  for (const l of lines) {
    const xs = l.states.filter((s) => s.state === '已消')
    if (xs.length) out.push(`已消：${l.name} ×${xs.length}（消于 ${xs.map((s) => `seq ${s.undoOrd}`).join('、')}）`)
  }
  for (const l of lines) {
    const hs = l.states.filter((s) => s.state === '豁施')
    if (hs.length) out.push(`豁施：${l.name} ×${hs.length}`)
  }
  for (const l of lines) {
    const cs = l.states.filter((s) => s.state === '承施')
    if (cs.length) out.push(`承施：${l.name} ×${cs.length}（命于 ${cs.map((s) => `seq ${s.remandOrd}`).join('、')}）`)
  }
  for (const l of lines) {
    if (l.lastUndoOrd !== null) out.push(`末消：${l.name}（消于 seq ${l.lastUndoOrd}——善后留痕）`)
  }
  if (judged.runtimeNote) out.push('注记：线上无主文，承不判——终裁归线下')
  return out.join('\n')
}
