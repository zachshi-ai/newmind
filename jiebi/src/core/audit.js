/**
 * 对比审计（what-if for cognition）—— 对一份会话流做认知对比统计。
 *
 * 与 zhizhi 审计的分工：
 *   zhizhi 拦的是"逐字相同指纹"的运行时重试；
 *   jiebi 查的是"归一化同目标"的离线连击 ——
 *   每次换个参数磨同一扇门，在 zhizhi 眼里合法，在 jiebi 眼里现形。
 *
 * 语义：
 *   - 按回合聚合调用签名序列（turn_start 之前的调用归 "(no turn)"）；
 *   - 单候选连击 monoculture：同一签名连续出现 ≥ threshold 次且其间无其他探针 → flag；
 *   - 每回合报告：调用数、不同探针数（distinctProbes）、失败探针数（failures，
 *     反证尝试的行为学痕迹）；
 *   - verdict: pass | flagged；单遍重放，无任何事后语义重建。
 */

import { parseStream, buildCalls } from './stream.js'
import { signatureOf } from './signature.js'

export function contrastAudit(text, options = {}) {
  const threshold = Number.isInteger(options.streakThreshold) && options.streakThreshold >= 1
    ? options.streakThreshold
    : 4

  const events = parseStream(text)
  const { calls, turns: turnList } = buildCalls(events)

  const turns = turnList.map((turn) => {
    const turnCalls = calls.filter((c) => c.turnId === turn.id)
    const signatures = turnCalls.map((c) => signatureOf(c.name, c.args))

    let maxStreak = 0
    let runSignature = null
    let run = 0
    for (const sig of signatures) {
      if (sig === runSignature) {
        run += 1
      } else {
        runSignature = sig
        run = 1
      }
      if (run > maxStreak) maxStreak = run
    }

    return {
      id: turn.id,
      calls: turnCalls.length,
      distinctProbes: new Set(signatures).size,
      failures: turnCalls.filter((c) => c.isError === true).length,
      maxStreak,
    }
  })

  const flags = turns
    .filter((t) => t.maxStreak >= threshold)
    .map((t) => {
      // 在现场原样捕获连击的签名（与运行时报告逐字一致的承诺）
      const turnCalls = calls.filter((c) => c.turnId === t.id)
      const signatures = turnCalls.map((c) => signatureOf(c.name, c.args))
      let best = { signature: null, run: 0 }
      let runSignature = null
      let run = 0
      for (const sig of signatures) {
        if (sig === runSignature) run += 1
        else {
          runSignature = sig
          run = 1
        }
        if (run > best.run) best = { signature: sig, run }
      }
      return { type: 'monoculture', turn: t.id, signature: best.signature, run: best.run }
    })

  const totals = {
    turns: turns.length,
    calls: calls.length,
    flags: flags.length,
  }
  const verdict = flags.length > 0 ? 'flagged' : 'pass'

  return { mode: 'contrast', threshold, totals, turns, flags, verdict }
}
