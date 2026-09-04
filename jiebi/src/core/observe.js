/**
 * 观察式引擎 —— 插件的大脑，纯函数式、不依赖 Cordis。
 *
 * 设计约束：
 *   - 零拦截：引擎没有任何"否决"概念。插件层不挂 pre-execute，
 *     结构上不可能拦动作（这是 jiebi 与 zhizhi 的方向边界，不是纪律承诺）。
 *   - 观察永不反噬：observe/beginTurn/checkLedger 里的任何异常都不允许
 *     冒泡到管道（插件层再包一层 try）。
 *   - 回合边界可选：运行时本身没有回合接缝，宿主可用 beginTurn/endTurn
 *     显式声明；未声明时全部调用归会话级。
 */

import { signatureOf } from './signature.js'
import { validateLedger, scoreLedger } from './ledger.js'

export function normalizeObserveOptions(options = {}) {
  const o = options ?? {}
  return {
    enabled: o.enabled !== false,
    streakThreshold:
      Number.isInteger(o.streakThreshold) && o.streakThreshold >= 1 ? o.streakThreshold : 4,
    locale: o.locale === 'en' ? 'en' : 'zh',
  }
}

export function createObserver(options = {}) {
  const opts = normalizeObserveOptions(options)
  let counter = 0
  let currentTurn = null
  const turnIds = new Set()
  const calls = [] // { ref, name, args, signature, isError, turnId, at }
  const ledgers = [] // { id, valid, score, band, at }

  const flagsOf = () => {
    if (!opts.enabled) return []
    const flags = []
    let runSignature = null
    let run = 0
    const flush = () => {
      if (runSignature !== null && run >= opts.streakThreshold) {
        flags.push({ type: 'monoculture', scope: 'session', signature: runSignature, run })
      }
    }
    for (const call of calls) {
      if (call.signature === runSignature) {
        run += 1
      } else {
        flush()
        runSignature = call.signature
        run = 1
      }
    }
    flush()
    return flags
  }

  return {
    options: opts,

    beginTurn(id, at = null) {
      if (!opts.enabled) return
      currentTurn = String(id)
      turnIds.add(currentTurn)
      void at
    },

    endTurn() {
      currentTurn = null
    },

    /** 记一次真实执行的工具调用（观察口，唯一写入口）。 */
    observe({ name, args, isError, at = null }) {
      if (!opts.enabled) return
      counter += 1
      let signature
      try {
        signature = signatureOf(name, args)
      } catch {
        signature = String(name ?? '') // 循环引用等病态 args：降级到工具名，观察永不反噬
      }
      const ref = `${currentTurn ?? 's'}-c${counter}`
      calls.push({
        ref,
        name: String(name ?? ''),
        args: args ?? null,
        signature,
        isError: isError === true,
        turnId: currentTurn,
        at,
      })
      return ref
    },

    /** 账本注册与即时蔽值（供宿主 / 其他插件门禁用）。 */
    checkLedger(ledger, at = null) {
      const validation = validateLedger(ledger)
      const scored = validation.valid ? scoreLedger(ledger) : null
      const result = {
        valid: validation.valid,
        issues: validation.valid ? scored.issues : validation.issues,
        score: scored ? scored.score : null,
        band: scored ? scored.band : null,
        ledgerId: validation.valid ? ledger.id : null,
      }
      if (opts.enabled) {
        ledgers.push({
          id: result.ledgerId,
          valid: result.valid,
          score: result.score,
          band: result.band,
          at,
        })
      }
      return result
    },

    /** 会话判断账本快照。 */
    report() {
      return {
        enabled: opts.enabled,
        streakThreshold: opts.streakThreshold,
        totals: {
          callsObserved: calls.length,
          turnsObserved: turnIds.size,
          ledgersChecked: ledgers.length,
          flags: flagsOf().length,
        },
        flags: flagsOf(),
        ledgers: [...ledgers],
        lastCalls: calls.slice(-8).map(({ ref, name, signature, isError }) => ({
          ref,
          name,
          signature,
          isError,
        })),
      }
    },

    /** 导出 jiebi stream（兼容 zhizhi stream），供离线 reconcile / audit。 */
    exportStream() {
      const events = []
      let lastTurn = undefined
      for (const call of calls) {
        const turnId = call.turnId ?? null
        if (turnId !== lastTurn) {
          if (lastTurn != null) events.push({ type: 'turn_end', id: lastTurn, at: null })
          if (turnId != null) events.push({ type: 'turn_start', id: turnId, at: null })
          lastTurn = turnId
        }
        events.push({ type: 'tool_call', id: call.ref, name: call.name, args: call.args, at: call.at })
        events.push({
          type: 'tool_result',
          id: call.ref,
          name: call.name,
          args: call.args,
          isError: call.isError,
          at: call.at,
        })
      }
      if (lastTurn != null) events.push({ type: 'turn_end', id: lastTurn, at: null })
      return events
    },
  }
}
