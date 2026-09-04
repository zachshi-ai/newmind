/**
 * 拂拭块渲染 —— 供给物的唯一产出点。
 *
 * 全部意义在于逐字节确定：同一契约 + 同一尘值状态 → 同一串字节。
 * 字段顺序由这里固定，与契约对象自身的键序无关。
 */

import { allowRootsOf } from './contract.js'

/**
 * 渲染拂拭块。
 * state: null（无状态，离线纯愿块）| { k, score, forget, grasp, cadence }
 */
export function renderReanchor(contract, state = null) {
  const lines = []
  lines.push(`【拂拭 · re-anchor】#${state ? state.k : 1}`)
  lines.push(`本愿：${contract.wish}`)
  lines.push(`锚点：${contract.anchors.keywords.join(' / ')}`)
  if (Array.isArray(contract.anchors.paths) && contract.anchors.paths.length > 0) {
    lines.push(`锚径：${contract.anchors.paths.join(' / ')}`)
  }
  const roots = allowRootsOf(contract)
  lines.push(roots === null
    ? '愿界：全域（allowAll——攀缘之门对无界之愿保持沉默）'
    : `愿界：${roots.join(' / ')}`)
  lines.push(`终验：${contract.acceptance.map((a) => {
    if (a.artifact) return `${a.ref}=artifact=${a.artifact}`
    return `${a.ref}=${a.name}~${a.argsContains}`
  }).join('；')}`)
  if (state) {
    lines.push(`尘值：${state.score}（失念 ${state.forget} · 攀缘 ${state.grasp} · 息尘 ${state.cadence}）`)
  }
  lines.push('——《坛经》：时时勤拂拭，勿使惹尘埃。')
  return lines.join('\n') + '\n'
}
