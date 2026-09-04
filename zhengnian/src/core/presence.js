/**
 * 正念引擎 —— 插件的大脑，纯状态机，不依赖 Cordis。
 *
 * 设计约束：
 *   - 零拦截：引擎没有任何"否决"概念。插件层不挂 pre-execute，
 *     结构上不可能拦动作（这是正念与 zhizhi 的方向边界，不是纪律承诺）；
 *   - 无契约不度量：契约没立或不合法时尘值保持沉默并明说，绝不假装量了；
 *   - 换愿＝新账：setContract 重置账本——度量的是"这一愿"的在场；
 *   - 观察永不反噬：任何异常不允许冒泡到管道（插件层再包一层 try）。
 */

import { validateContract, WINDOW_DEFAULT, MAX_STALE_DEFAULT } from './contract.js'
import { dustScore } from './dust.js'
import { renderReanchor } from './reanchor.js'
import { checkAcceptanceRef } from './audit.js'

export function normalizePresenceOptions(options = {}) {
  const o = options ?? {}
  return {
    enabled: o.enabled !== false,
    window: Number.isInteger(o.window) && o.window >= 1 ? o.window : undefined,
    maxStale: Number.isInteger(o.maxStale) && o.maxStale >= 1 ? o.maxStale : undefined,
    contract: o.contract ?? null,
  }
}

export function createPresence(options = {}) {
  const opts = normalizePresenceOptions(options)
  let contract = null
  let contractIssues = []
  let counter = 0
  let reanchors = 0
  let currentTurn = null
  const turnIds = new Set()
  const calls = [] // { ref, name, args, turn, at }
  const marks = [] // 拂拭发生在第几次调用之后
  const events = [] // 导出流（tool_call/tool_result/turn_start/turn_end/reanchor）

  function install(next) {
    const validation = validateContract(next)
    if (!validation.valid) {
      contractIssues = validation.issues
      return { valid: false, issues: validation.issues }
    }
    contract = next
    contractIssues = []
    calls.length = 0
    marks.length = 0
    events.length = 0
    counter = 0
    reanchors = 0
    return { valid: true, issues: [] }
  }

  function liveDust() {
    if (!contract) return null
    return dustScore(contract, calls, marks, { window: opts.window, maxStale: opts.maxStale })
  }

  if (opts.contract) install(opts.contract)

  return {
    options: opts,

    setContract(next) {
      return install(next)
    },

    get contractInstalled() {
      return contract !== null
    },

    beginTurn(id) {
      if (!opts.enabled) return
      currentTurn = String(id)
      turnIds.add(currentTurn)
      events.push({ type: 'turn_start', id: currentTurn, at: Date.now() })
    },

    endTurn() {
      if (!opts.enabled) return
      events.push({ type: 'turn_end', id: currentTurn, at: Date.now() })
      currentTurn = null
    },

    /** 记一次真实执行的工具调用（观察口，唯一写入口）。 */
    observe({ name, args, isError, at = null }) {
      if (!opts.enabled) return
      counter += 1
      const ref = `n-c${counter}`
      const rec = { ref, name, args, turn: currentTurn, at }
      calls.push(rec)
      events.push({ type: 'tool_call', id: ref, name, args, turn: currentTurn, at })
      events.push({ type: 'tool_result', id: ref, name, args, isError: isError === true, turn: currentTurn, at })
    },

    /** 尘值：无契约时诚实沉默。 */
    dust() {
      if (!contract) return { contractInstalled: false, note: contractIssues }
      return { contractInstalled: true, ...liveDust() }
    },

    /** 拂拭：渲染逐字节确定的供给块，并把拂拭事件记入流。 */
    reanchor(at = null) {
      if (!contract) return { valid: false, error: 'no-contract' }
      const dust = liveDust()
      reanchors += 1
      const state = {
        k: reanchors,
        score: dust.score,
        forget: dust.breakdown.forget,
        grasp: dust.breakdown.grasp,
        cadence: dust.breakdown.cadence,
      }
      marks.push(calls.length)
      events.push({ type: 'reanchor', id: `n-r${reanchors}`, turn: currentTurn, at: at ?? Date.now() })
      return { valid: true, k: reanchors, text: renderReanchor(contract, state), dust }
    },

    /** 终验核对：口念心行，则心口相应。 */
    acceptance(cwd = null) {
      if (!contract) return { contractInstalled: false, note: contractIssues }
      const refs = contract.acceptance.map((ref) => checkAcceptanceRef(ref, calls, cwd))
      const unfulfilled = refs.filter((r) => r.status !== 'verified')
      return {
        contractInstalled: true,
        verdict: unfulfilled.length === 0 ? 'fulfilled' : 'unfulfilled',
        refs,
        unfulfilled: unfulfilled.map((r) => r.ref),
      }
    },

    /** 正念账本总览。 */
    report() {
      const dust = liveDust()
      return {
        totals: {
          callsObserved: calls.length,
          turnsObserved: turnIds.size,
          reanchors,
          contractInstalled: contract !== null,
        },
        contract: contract ? { id: contract.id, wish: contract.wish } : null,
        dust: dust
          ? { score: dust.score, band: dust.band, breakdown: dust.breakdown, details: dust.details }
          : null,
      }
    },

    /** 导出事件流（正念流），供离线 audit 重放。 */
    exportStream() {
      return [...events]
    },
  }
}

export { WINDOW_DEFAULT, MAX_STALE_DEFAULT }
