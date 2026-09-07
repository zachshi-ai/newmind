/**
 * 文账引擎 —— 写面登记与塞值判定（docs/03 §2/§5/§6 锁死），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流审计把所有会话的调用记进同一引擎（纵列全局、时序按参序拼接的流序）；
 * 插件只记本会话——单会话视图（跨会话之归并归离线合并审计）。
 *
 * 入口滤（先于一切，docs/03 §2）：isError === true 一律不入账——失败的写不是写；
 * isError 未知（null，老流）按已发生入账（未知不是失败）。
 *
 * 文账（写面唯一）：write 族 p: 径命中码面（豁免形与纵列在立案前）→ 该径记一笔写
 * （content 取 args.content，可为 null）。沙川：exec 生产词法落点命中码面。
 * 观察不是写：observe 族永不入账。破坏段（rm 词族）内不计生产。
 *
 * 判定序锁死（docs/03 §5，逐径恰好一态）：
 *   沙川（仅命令落点，文面不可见 0）> 无文（全流无一笔带 content 0）>
 *   湮案（末文命中湮形 N 处，+15/处）> 已浚（末文净而先前有形 0——考其末文）> 净川 0。
 *   末文 = 末笔带 content 之写；无文之改（edit 族）不改末文，gauge 注记。
 *
 * 塞值锁死（docs/03 §6）：sai = min(60, 15 × 湮案总数)，total = min(100, sai)；
 *   分带 宣 0–14 / 淤 15–29 / 塞 ≥30；门默认 30——单湮案黄牌不咬门、两案即红。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import { RM_WORDS, COPY_VERBS, TOUCH_VERBS, segments, tokenize, argTokens, redirectTargets } from './lexicon.js'
import { isCodePath } from './mamian.js'
import { scanContent } from './yanxing.js'
import { globMatch } from './lexicon.js'

export const GATE_DEFAULT = 30

const PER_YAN = 15
const CAP_YAN = 60

export function bandOf(total) {
  if (total < 15) return '宣'
  if (total < 30) return '淤'
  return '塞'
}

/** 纵列命中：indulge（glob ∪ 逐字）任一命中即免扫。 */
export function indulgeHit(indulge, p) {
  return indulge.some((g) => globMatch(p, g))
}

/** 引擎装配：川册（纵列）→ 文账。无册（null）→ indulge 为空——无册 = 全扫。 */
export function createEngine({ book = null } = {}) {
  const indulge = (book?.indulge ?? []).map((g) => String(g))
  return {
    cfg: { indulge },
    calls: [],
    seq: 0,
    writes: new Map(), // 规整径 → [{seq, session, ref, content|null}]（seq 递增序）
    sands: new Map(),  // 规整径 → {seq, session, ref, how}
  }
}

/**
 * 记一笔调用（唯一写入口）。段内先判破坏（rm 族）后判生产（cp/mv/tee/touch/重定向）；
 * 破坏段不计生产（rm 不生产）。
 */
export function recordCall(engine, { session, ref = null, name, args, isError = null }) {
  const rec = { session, ref, name, args, isError }
  engine.calls.push(rec)
  if (isError === true) return engine // 入口滤：失败的写不是写
  const seq = ++engine.seq
  const fam = familyOf(name)
  const key = objectKey(args, name)

  if (fam === 'observe') return engine // 观察不是写

  if (fam === 'write' && key.startsWith('p:')) {
    const path = normalizePath(key.slice(2))
    if (isCodePath(path) && !indulgeHit(engine.cfg.indulge, path)) {
      const content = typeof args?.content === 'string' ? args.content : null
      const list = engine.writes.get(path) ?? []
      list.push({ seq, session, ref, content })
      engine.writes.set(path, list)
    }
    return engine
  }

  if (fam === 'exec' && key.startsWith('c:')) {
    const command = key.slice(2)
    for (const seg of segments(command)) {
      const tokens = tokenize(seg)
      if (!tokens.length) continue
      if (tokens.some((t) => RM_WORDS.includes(t.toLowerCase()))) continue // rm 不生产
      const head = tokens[0].split(/[/\\]/).pop().toLowerCase()
      const words = argTokens(tokens)
      const targets = []
      if (COPY_VERBS.includes(head) && words.length >= 2) targets.push(words[words.length - 1])
      else if (TOUCH_VERBS.includes(head)) targets.push(...words.slice(1))
      for (const target of redirectTargets(seg)) targets.push(target)
      for (const t of targets) {
        const p = normalizePath(t)
        if (isCodePath(p) && !indulgeHit(engine.cfg.indulge, p)) {
          engine.sands.set(p, { seq, session, ref, how: seg.includes('>') ? '重定向' : `${head} 落点` }) // 每径末笔落点定基点
        }
      }
    }
    return engine
  }

  return engine // write 但非 p: / other 族：n: 黑盒
}

/** 逐径判定（唯一判定点）：judge 与导牌块共用；按规整径字典序。 */
export function settleLines(engine) {
  const paths = new Set([...engine.writes.keys(), ...engine.sands.keys()])
  const sorted = [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return sorted.map((path) => {
    const ws = engine.writes.get(path)
    if (!ws) {
      const sand = engine.sands.get(path)
      return { path, state: '沙川', score: 0, cases: [], sand, gauge: 0 }
    }
    const last = ws[ws.length - 1]
    const idxKnown = (() => {
      for (let i = ws.length - 1; i >= 0; i--) {
        if (ws[i].content !== null) return i
      }
      return -1
    })()
    const lastKnown = idxKnown === -1 ? null : ws[idxKnown]
    if (!lastKnown) {
      return { path, state: '无文', score: 0, cases: [], last: last, gauge: 0 }
    }
    const gauge = ws.length - idxKnown - 1 // 末文后无文之写的笔数
    const hits = scanContent(lastKnown.content)
    if (hits.length > 0) {
      return {
        path, state: '湮案', score: PER_YAN * hits.length,
        cases: hits.map((h) => ({ path, line: h.line, form: h.form })),
        last: lastKnown, gauge,
      }
    }
    const priorHadShape = ws.slice(0, idxKnown).some(
      (w) => w.content !== null && scanContent(w.content).length > 0,
    )
    if (priorHadShape) {
      return { path, state: '已浚', score: 0, cases: [], last: lastKnown, cleanedAt: lastKnown.seq, gauge }
    }
    return { path, state: '净川', score: 0, cases: [], last: lastKnown, gauge }
  })
}

/** issues 行（锁死，docs/03 §7/§8）：逐案一行；全宣单行。 */
export function issuesOf(settled) {
  const issues = []
  for (const l of settled) {
    for (const c of l.cases ?? []) issues.push(`湮案：${c.path}:${c.line} ${c.form}`)
  }
  for (const l of settled) {
    if (l.state === '已浚') issues.push(`已浚：${l.path}（改净于 seq ${l.cleanedAt}）`)
  }
  for (const l of settled) {
    if (l.state === '沙川') issues.push(`沙川：${l.path}（seq ${l.sand.seq} ${l.sand.how}）`)
  }
  for (const l of settled) {
    if (l.state === '无文') issues.push(`无文：${l.path}（seq ${l.last.seq} 无文之写）`)
  }
  for (const l of settled) {
    if (l.state === '湮案' && l.gauge > 0) {
      issues.push(`注记：${l.path} 末文后无文之改 ${l.gauge} 笔`)
    }
  }
  const noisy = settled.some((l) => l.state !== '净川' || (l.gauge ?? 0) > 0)
  if (!noisy) issues.push('川皆宣 ×0 —— 为民者，宣之使言')
  return issues
}

/** 判定：塞值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const settled = settleLines(engine)
  const yanCases = []
  for (const l of settled) {
    if (l.state === '湮案') yanCases.push(...l.cases)
  }
  const jun = settled.filter((l) => l.state === '已浚').length
  const sha = settled.filter((l) => l.state === '沙川').length
  const wu = settled.filter((l) => l.state === '无文').length

  const score = { yan: Math.min(CAP_YAN, PER_YAN * yanCases.length) }
  score.total = Math.min(100, score.yan)

  const band = bandOf(score.total)
  const verdict = score.total >= gate ? 'fail' : 'pass'

  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    paths: settled.length,
    cases: { yan: yanCases.length, jun, sha, wu },
    score,
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    issues: issuesOf(settled),
    lines: settled,
  }
}
