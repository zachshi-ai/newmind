/**
 * 尘值 —— 本愿在场的确定性度量（0–100）。
 *
 * 三项条款全部来自原典（docs/03-design.md 评分表），无一凭感觉设定：
 *   失念  念者，于曾习境，令心明记不忘（《成唯识论》）
 *   攀缘  心攀缘外境——手伸出了愿界
 *   息尘  时时勤拂拭，勿使惹尘埃（神秀偈）——"时时"是频率条款
 *
 * 诚实边界：尘值不度量对错，只度量"此刻的动作流离本愿有多远"。
 */

import { isWriteCall, primaryPathOf, inScope, isRelevant } from './sense.js'
import { WINDOW_DEFAULT, MAX_STALE_DEFAULT, allowRootsOf } from './contract.js'

export const THRESHOLD_DEFAULT = 30

/** 分带：0–14 净，15–29 浮，≥30 蒙。 */
export function bandOf(score) {
  if (score <= 14) return '净'
  if (score <= 29) return '浮'
  return '蒙'
}

/**
 * 尘值评分。
 * calls:    [{ ref?, name, args }] 按时间序；
 * reanchorMarks: 拂拭发生位置的下标数组（第 i 个标记在第 marks[i] 次调用之后）。
 */
export function dustScore(contract, calls, reanchorMarks = [], options = {}) {
  const window = Number.isInteger(options.window) && options.window >= 1
    ? options.window
    : (Number.isInteger(contract?.window) ? contract.window : WINDOW_DEFAULT)
  const maxStale = Number.isInteger(options.maxStale) && options.maxStale >= 1
    ? options.maxStale
    : MAX_STALE_DEFAULT
  const roots = allowRootsOf(contract)

  const issues = []
  const add = (code, points, message) => {
    if (points > 0) issues.push({ code, points, message })
    return points
  }

  // ---- 失念：从最新往回的锚点零交集连击（不怕念起，只怕觉迟——量的是此刻） ----
  const windowed = calls.slice(-window)
  let streak = 0
  for (let i = windowed.length - 1; i >= 0; i--) {
    if (isRelevant(windowed[i], contract)) break
    streak += 1
  }
  const forget = add('forget', Math.min(40, streak * 8),
    streak ? `最近 ${streak} 次动作与本愿锚点零交集（失念）` : '')

  // ---- 攀缘：写类动作落在愿界之外（无界之愿：结构性沉默） ----
  let grasp = 0
  let unparsed = 0
  const outside = []
  if (roots !== null) {
    for (const call of calls) {
      if (!isWriteCall(call)) continue
      const p = primaryPathOf(call)
      if (!p) {
        unparsed += 1
        continue
      }
      if (!inScope(p, roots)) {
        outside.push({ ref: call.ref ?? null, path: p })
        grasp += 12
      }
    }
    grasp = add('grasp', Math.min(40, grasp),
      outside.length ? `${outside.length} 次写入落在愿界之外（攀缘：${outside.map((o) => o.path).join('、')}）` : '')
  }

  // ---- 息尘：拂拭断顿（段长 > maxStale，每段 +10；全流无拂拭只算一段） ----
  const bounds = [0, ...[...reanchorMarks].sort((a, b) => a - b), calls.length]
  let cadencePoints = 0
  const staleSegments = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const segLen = bounds[i + 1] - bounds[i]
    if (segLen > maxStale) {
      staleSegments.push(segLen)
      cadencePoints += 10
    }
  }
  const cadence = add('cadence', Math.min(20, cadencePoints),
    staleSegments.length ? `${staleSegments.length} 段超过 ${maxStale} 次调用没有拂拭（息尘：最长 ${Math.max(...staleSegments)} 次）` : '')

  const score = Math.min(100, forget + grasp + cadence)
  return {
    score,
    band: bandOf(score),
    breakdown: { forget, grasp, cadence },
    details: {
      calls: calls.length,
      windowedCalls: windowed.length,
      anchorMissStreak: streak,
      outOfScopeWrites: outside,
      unparsedWrites: unparsed,
      unbounded: roots === null,
      reanchors: reanchorMarks.length,
      maxGap: staleSegments.length ? Math.max(...staleSegments) : 0,
    },
    issues,
  }
}
