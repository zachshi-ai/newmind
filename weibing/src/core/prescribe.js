/**
 * 医嘱块渲染 —— 体检报告的纯文本供给物（给人看处方笺，给宿主注入上下文）。
 *
 * 逐字节确定：同一 charter + 同一探针状态 → 同一字节（无时间戳、无随机数、
 * 键序由代码固定）。全清时以「未病。可以开工。」收尾——给从未生病的运行记账。
 */

import { omenPrescription } from './lexicon.js'

const FOOTER = '——《素问·四气调神大论》：圣人不治已病治未病，不治已乱治未乱。'

export function renderPrescribe(charter, exam) {
  if (!exam || exam.valid === false) {
    return `【治未病 · pre-flight】#${charter?.id ?? '?'}\n体检未行：任务书契约不合法。\n`
  }
  const lines = []
  lines.push(`【治未病 · pre-flight】#${exam.charter}`)
  lines.push(`任务：${String(charter.brief ?? '').trim().split('\n')[0]}`)
  lines.push(`体检根：${exam.cwd ?? '未设'}`)
  lines.push(`病值：${exam.score}（${exam.band}）· 门 ${exam.gate}`)

  if (exam.lesions.length === 0 && exam.omens.length === 0) {
    lines.push('病灶：0 · 险兆：0')
    lines.push('未病。可以开工。')
    lines.push(FOOTER)
    return lines.join('\n') + '\n'
  }

  if (exam.lesions.length > 0) {
    lines.push(`病灶 ${exam.lesions.length}：`)
    for (const l of exam.lesions) {
      lines.push(`  - ${l.code} ${l.name} +${l.weight} —— 医嘱：${l.prescription}`)
    }
  } else {
    lines.push('病灶：0')
  }
  if (exam.omens.length > 0) {
    lines.push(`险兆 ${exam.omens.length}：`)
    for (const o of exam.omens) {
      lines.push(`  - 「${o.token}」${o.label} +${o.weight} —— 医嘱：${omenPrescription(o.kind)}`)
    }
  } else {
    lines.push('险兆：0')
  }
  if (exam.transmissions.length > 0) {
    lines.push(`传变 ${exam.transmissions.length}：`)
    for (const t of exam.transmissions) lines.push(`  - ${t}`)
  }
  lines.push(FOOTER)
  return lines.join('\n') + '\n'
}
