/**
 * 准牌块 —— 接缝供给（docs/03 §7）：籍形公示 + 命籍公示 + 案账清点 + 逐案点名。
 * 同输入两次渲染必得同一文本（shasum 可证）；块中永不出现命中行原文与 spec 值原文
 * （只载径、附名/键名/宿主/行号与案别——掩码是结构性保证）。
 */

import { DEFAULT_FORMS, PREFIX_FORMS } from './jixing.js'

/**
 * 渲染准牌：book 命籍公示恒在；judged（judge 结果）在场时追加案账与案行。
 * 无册出确定性文本 `命籍：未立（籍面全账）`。
 */
export function renderZhunpai(book = null, judged = null) {
  const admit = book?.admit ?? []
  const extra = book?.extra ?? []
  const formCount = DEFAULT_FORMS.length + PREFIX_FORMS.length
  const out = ['【平准 · 准牌】']
  const extraPart = extra.length > 0 ? `＋ ${extra.length} 形（命籍增形：${extra.join('、')}）` : ''
  out.push(`籍面：${formCount} 形（默认）${extraPart}`)
  if (!admit.length) {
    out.push('命籍：未立（籍面全账）')
  } else {
    out.push(`命籍：纳籍 ${admit.length} 径（${admit.join('、')}）`)
  }
  if (judged) {
    const c = judged.cases ?? {}
    out.push(`案账：增附 ${c.zeng ?? 0} · 去锁 ${c.suo ?? 0} · 越源 ${c.yue ?? 0} · 钩入 ${c.gou ?? 0} · 暗籍 ${c.an ?? 0} · 素籍 ${c.su ?? 0}`)
    for (const line of judged.issues ?? []) out.push(line)
  }
  return out.join('\n')
}
