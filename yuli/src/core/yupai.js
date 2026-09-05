/**
 * 豫牌块渲染 —— 接缝处的确定性供给件。
 *
 * 同一账本状态两次渲染逐字节相同（#k 随渲染递增且仅此一处不同）；
 * 无时间戳；案序 = 流序。牌是镜子，不是法官：只公示备在不在，不仲裁该不该删。
 */

/**
 * @param {{ events: Array, execObserved: number, risksObserved: number, register: {exempt?: string[]} }} state 险账状态
 * @param {number} k 渲染序号（随渲染递增）
 * @param {number} gate 门
 */
export function renderYupai(state, k, gate) {
  const events = state.events
  const naked = events.filter((e) => e.kind === '裸险' && e.scored > 0)
  const declareItems = events.reduce((n, e) => n + (e.kind === '裸险' ? e.declareItems ?? 0 : 0), 0)
  const netted = events.filter((e) => e.kind === '有备')
  const ganpao = events.filter((e) => e.kind === '干跑')
  const feints = events.filter((e) => e.kind === '虚险')
  const luokuan = events.filter((e) => e.kind === '落款')
  const total = Math.min(
    100,
    Math.min(60, 30 * naked.length) + Math.min(30, 10 * declareItems),
  )
  const band = total >= 30 ? '废' : total >= 15 ? '跲' : '豫'
  const exempt = state.register.exempt ?? []

  const out = []
  out.push(`【豫立 · 豫牌块 #${k}】`)
  out.push(`险值 ${total}（${band}），门 ${gate}，判 ${total < gate ? 'pass' : 'fail'}`)
  out.push(
    `险账：受审 exec ${state.execObserved} 次，险形命中 ${state.risksObserved} 次` +
      `（裸险 ${naked.length} 案 + 显式 ${declareItems} 件），有备 ${netted.length}，` +
      `干跑 ${ganpao.length}，虚险 ${feints.length}，落款 ${luokuan.length}`,
  )

  out.push('裸险点名（按案序）：')
  if (naked.length === 0) out.push('  （无）')
  for (const kase of naked) {
    out.push(`  #${kase.seq} ${kase.tool}｜族:${kase.familyLabel}｜${kase.unnetted.join('/')}`)
    out.push(`    - ${kase.excerpt}`)
  }

  out.push(`款词公示：${exempt.length > 0 ? exempt.join('、') : '（无）'}`)
  out.push('—— 本块由确定性规则生成；重放同一流必得同一文本。')
  return out.join('\n')
}
