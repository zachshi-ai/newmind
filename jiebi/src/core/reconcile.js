/**
 * 账实对账 —— 判断可证伪的最后一块。
 *
 * 账本宣称的证据，必须在会话流里真实发生过：
 *   dangling     引用指向流中不存在的 id
 *   contradicted expect 声明的成败方向与真实结果相反
 *   verified     expect 声明与真实结果一致
 *   linked       有引用、无声明（在案，但不核对方向）
 *
 * 对账器不装懂：一条引用都没有 → match=true 但 confidence:'none'，
 * 绝不把"没核对"报成"已核对"。
 */

import { buildCalls } from './stream.js'

function ledgerRefs(ledger) {
  const entries = []
  for (const alt of ledger.alternatives ?? []) {
    for (const ev of alt?.evidence ?? []) {
      entries.push({ ref: ev.ref, expect: ev.expect, from: `alternatives[${alt.name}].evidence` })
    }
  }
  for (const d of ledger.disconfirming ?? []) {
    entries.push({ ref: d.ref, expect: undefined, from: 'disconfirming' })
  }
  return entries
}

/**
 * reconcile(ledger, events) → {
 *   ledger, match, refsChecked, confidence,
 *   refs: [{ ref, expect, isError, status }],
 *   verdict: { choice, resolved },
 *   ambiguities: [ref]
 * }
 */
export function reconcile(ledger, events) {
  const { calls, duplicatedRefs } = buildCalls(events)
  const byRef = new Map(calls.map((c) => [c.ref, c]))

  const refs = ledgerRefs(ledger).map(({ ref, expect, from }) => {
    const call = byRef.get(ref)
    if (!call) return { ref, expect, from, isError: null, status: 'dangling' }
    if (expect === undefined) return { ref, expect, from, isError: call.isError, status: 'linked' }
    const wantFail = expect === 'fail'
    const ok = call.isError !== null && call.isError === wantFail
    return { ref, expect, from, isError: call.isError, status: ok ? 'verified' : 'contradicted' }
  })

  const dangling = refs.some((r) => r.status === 'dangling')
  const contradicted = refs.some((r) => r.status === 'contradicted')
  const alternatives = Array.isArray(ledger.alternatives) ? ledger.alternatives : []
  const choice = ledger.verdict?.choice
  const resolved =
    typeof choice === 'string' && alternatives.some((a) => a?.name === choice)
  const match = !dangling && !contradicted && resolved

  return {
    ledger: ledger.id ?? null,
    match,
    refsChecked: refs.length,
    confidence: refs.length === 0 ? 'none' : 'refs',
    refs,
    verdict: { choice: choice ?? null, resolved },
    ambiguities: [...duplicatedRefs],
  }
}
