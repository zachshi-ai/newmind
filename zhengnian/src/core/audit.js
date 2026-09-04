/**
 * 离线审计 —— 契约 × 会话流 → 尘值 + 终验门。
 *
 * 对任何正念流（兼容 zhizhi / jiebi stream）做事后审计；
 * 终验门回答"证据是不是对着本愿的"——口念心行，则心口相应。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { validateContract, WINDOW_DEFAULT, MAX_STALE_DEFAULT } from './contract.js'
import { dustScore, THRESHOLD_DEFAULT } from './dust.js'
import { parseStream, buildCalls } from './stream.js'

function argsText(args) {
  return typeof args === 'string' ? args : JSON.stringify(args ?? {})
}

/** 单条终验的核对。 */
export function checkAcceptanceRef(ref, calls, cwd = null) {
  if (ref.artifact) {
    if (cwd && existsSync(join(cwd, ref.artifact))) {
      return { ref: ref.ref, kind: 'artifact', status: 'verified', via: 'filesystem' }
    }
    const hit = calls.find((c) => argsText(c.args).toLowerCase().includes(ref.artifact.toLowerCase()))
    if (hit) return { ref: ref.ref, kind: 'artifact', status: 'verified', via: 'stream' }
    return { ref: ref.ref, kind: 'artifact', status: 'unverified', via: cwd ? 'filesystem+stream' : 'stream' }
  }
  const hit = calls.find((c) =>
    c.name === ref.name &&
    argsText(c.args).toLowerCase().includes(String(ref.argsContains).toLowerCase()))
  return hit
    ? { ref: ref.ref, kind: 'probe', status: 'verified', via: 'stream' }
    : { ref: ref.ref, kind: 'probe', status: 'unverified', via: 'stream' }
}

/**
 * 审计。options: { gate, maxStale, window, acceptance:boolean, cwd }
 * 契约非法抛错（由调用方决定退出码 2）；流解析错误向上抛（带行号）。
 */
export function auditStream(contract, streamText, options = {}) {
  const validation = validateContract(contract)
  if (!validation.valid) {
    throw new Error(`契约非法:\n${validation.issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`)
  }

  const events = parseStream(streamText)
  const { calls, marks } = buildCalls(events)

  const gate = Number.isInteger(options.gate) ? options.gate : THRESHOLD_DEFAULT
  const dust = dustScore(contract, calls, marks, {
    maxStale: options.maxStale,
    window: options.window,
  })

  let acceptance = null
  if (options.acceptance) {
    const refs = contract.acceptance.map((ref) => checkAcceptanceRef(ref, calls, options.cwd ?? null))
    const unfulfilled = refs.filter((r) => r.status !== 'verified')
    acceptance = {
      verdict: unfulfilled.length === 0 ? 'fulfilled' : 'unfulfilled',
      refs,
      unfulfilled: unfulfilled.map((r) => r.ref),
    }
  }

  const dustPass = dust.score < gate
  const acceptancePass = !acceptance || acceptance.verdict === 'fulfilled'

  return {
    mode: 'dust',
    contract: contract.id,
    window: Number.isInteger(options.window) && options.window >= 1
      ? options.window
      : (Number.isInteger(contract.window) ? contract.window : WINDOW_DEFAULT),
    maxStale: Number.isInteger(options.maxStale) && options.maxStale >= 1
      ? options.maxStale
      : MAX_STALE_DEFAULT,
    calls: calls.length,
    score: dust.score,
    band: dust.band,
    verdict: dustPass ? 'pass' : 'fail',
    gate,
    breakdown: dust.breakdown,
    details: dust.details,
    issues: dust.issues.map((i) => `${i.message} (+${i.points})`),
    acceptance,
    ok: dustPass && acceptancePass,
  }
}
