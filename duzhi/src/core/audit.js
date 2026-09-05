/**
 * 离线审计 —— 制册（可追认）× 会话流 → 制值 + 分带 + 门禁。
 *
 * 对任何会话流（兼容全仓流格式）做事后审计：
 *   有线  对账越线几案、每案第几次、经由哪条线；
 *   无线  诚实报无制 40——「此流从未被量纲约束」是治理发现，不是诬告；
 *   追认  补一条线重放即见越线——线是新的，越线是硬数字。
 */

import { parseStream, buildCalls } from './stream.js'
import { validateRegister, validateCaps, resolveCaps } from './register.js'
import { analyze, liveScore } from './ledger.js'

/**
 * 审计。options: { register: object|null, maxCalls, maxMinutes, id, gate }
 * 册形 register 非法抛错（由调用方决定退出码 2）；流解析错误向上抛（带行号）。
 */
export function auditStream(streamText, options = {}) {
  let register = options.register ?? null
  if (register != null) {
    const v = validateRegister(register)
    if (!v.valid) {
      throw new Error(`制册非法:\n${v.issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`)
    }
  }
  const flagCheck = validateCaps({ maxCalls: options.maxCalls, maxMinutes: options.maxMinutes })
  if (!flagCheck.valid) {
    throw new Error(`制册非法:\n${flagCheck.issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`)
  }

  const events = parseStream(streamText)
  const { calls } = buildCalls(events)
  const { caps, id } = resolveCaps({
    register,
    maxCalls: options.maxCalls,
    maxMinutes: options.maxMinutes,
    id: options.id,
  })

  const ledger = analyze(calls, { caps, id, gate: options.gate })
  const live = liveScore(ledger)
  return {
    ...live,
    gate: ledger.gate,
    ok: live.score.total < ledger.gate,
  }
}
