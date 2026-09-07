/**
 * 籍账引擎 —— 写面登记与准值判定（docs/03 §2/§5/§6 锁死），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流审计把所有会话的调用记进同一引擎（纳籍全局、时序按参序拼接的流序）；
 * 插件只记本会话——单会话视图（跨会话之归并归离线合并审计）。
 *
 * 入口滤（先于一切，docs/03 §2）：isError === true 一律不入账——失败的写不是写；
 * isError 未知（null，老流）按已发生入账（未知不是失败）。
 *
 * 籍账（写面唯一）：write 族 p: 径命中籍面（纳籍在立案前）→ 该径记一笔写
 * （content 取 args.content，可为 null——无文之写）；带 content 之写以「记录时刻的
 * 旧本池」判四案，随后末文入池。旧本池：同规整径更早的带 content 之写 ∪ observe 族
 * 成功读取之结果正文（读取永不判案，只供旧本）。暗籍：exec 生产词法落点命中籍面。
 * 观察不是写：observe 族永不入籍账。破坏段（rm 词族）内不计生产。
 *
 * 判定序锁死（docs/03 §5，逐径恰好一态）：
 *   暗籍（仅命令落点，文面不可见 0）> 素籍（全流无一笔带 content 0）>
 *   案（四案并存累加，见 docs/03 §3 分值）> 净籍 0（注记随递案记）。
 *   末文 = 末笔带 content 之写；无文之改（edit 族）不改末文，gauge 注记。
 *
 * 准值锁死（docs/03 §6）：yue=min(60,30×越源)+gou=min(60,30×钩入)+zeng=min(60,15×增附)
 *   +suo=min(60,10×去锁)，total=min(100)；分带 平 0–14 / 偏 15–29 / 倾 ≥30；
 *   门默认 30——单越源/单钩入即红、两增附即红、单增附黄牌不咬门、单去锁仅点名。
 */

import { objectKey, familyOf, normalizePath, baseName } from './object.js'
import { RM_WORDS, COPY_VERBS, TOUCH_VERBS, segments, tokenize, argTokens, redirectTargets, globMatch } from './lexicon.js'
import { isManifestForm } from './jixing.js'
import { analyzeManifest } from './sian.js'

export const GATE_DEFAULT = 30

export function bandOf(total) {
  if (total < 15) return '平'
  if (total < 30) return '偏'
  return '倾'
}

/** 纳籍命中：admit（glob ∪ 逐字）任一命中即免账。 */
export function admitHit(admit, p) {
  return admit.some((g) => globMatch(p, g))
}

/** 引擎装配：命籍（纳籍 ∪ 增形）→ 籍账。无册（null）→ 纳籍为空——无册 = 全账。 */
export function createEngine({ book = null } = {}) {
  const admit = (book?.admit ?? []).map((g) => String(g))
  const extra = (book?.extra ?? []).map((g) => String(g))
  return {
    cfg: { admit, extra },
    calls: [],
    seq: 0,
    writes: new Map(), // 规整径 → [{seq, session, ref, content|null, analysis|null}]（seq 递增序）
    baselines: new Map(), // 规整径 → 最新流内旧本（先前之写 ∪ 成功读取之正文）
    sands: new Map(), // 规整径 → {seq, session, ref, how}
  }
}

/**
 * 记一笔调用（唯一写入口）。段内先判破坏（rm 族）后判生产（cp/mv/tee/touch/重定向）；
 * 破坏段不计生产（rm 不生产）。content 是结果侧正文（observe 之旧本来源）。
 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, content = null }) {
  const rec = { session, ref, name, args, isError, content }
  engine.calls.push(rec)
  if (isError === true) return engine // 入口滤：失败的写不是写
  const seq = ++engine.seq
  const fam = familyOf(name)
  const key = objectKey(args, name)

  if (fam === 'observe') {
    if (key.startsWith('p:') && typeof content === 'string' && content.length > 0) {
      const path = normalizePath(key.slice(2))
      if (isManifestForm(baseName(path), engine.cfg.extra) && !admitHit(engine.cfg.admit, path)) {
        engine.baselines.set(path, content) // 观察不是写：只供旧本，永不判案
      }
    }
    return engine
  }

  if (fam === 'write' && key.startsWith('p:')) {
    const path = normalizePath(key.slice(2))
    if (isManifestForm(baseName(path), engine.cfg.extra) && !admitHit(engine.cfg.admit, path)) {
      const text = typeof args?.content === 'string' ? args.content : null
      const analysis = text !== null ? analyzeManifest(baseName(path), engine.baselines.get(path) ?? null, text) : null
      const list = engine.writes.get(path) ?? []
      list.push({ seq, session, ref, content: text, analysis })
      engine.writes.set(path, list)
      if (text !== null) engine.baselines.set(path, text)
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
        if (isManifestForm(baseName(p), engine.cfg.extra) && !admitHit(engine.cfg.admit, p)) {
          engine.sands.set(p, { seq, session, ref, how: seg.includes('>') ? '重定向' : `${head} 落点` }) // 每径末笔落点定基点
        }
      }
    }
    return engine
  }

  return engine // write 但非 p: / other 族：n: 黑盒
}

/** 逐径判定（唯一判定点）：judge 与准牌块共用；按规整径字典序。 */
export function settleLines(engine) {
  const paths = new Set([...engine.writes.keys(), ...engine.sands.keys()])
  const sorted = [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return sorted.map((path) => {
    const ws = engine.writes.get(path)
    if (!ws) {
      const sand = engine.sands.get(path)
      return { path, state: '暗籍', score: 0, cases: [], notes: [], sand }
    }
    const idxKnown = (() => {
      for (let i = ws.length - 1; i >= 0; i--) {
        if (ws[i].content !== null) return i
      }
      return -1
    })()
    if (idxKnown === -1) {
      return { path, state: '素籍', score: 0, cases: [], notes: [], last: ws[ws.length - 1] }
    }
    const last = ws[idxKnown]
    const gauge = ws.length - idxKnown - 1 // 末文后无文之写的笔数
    const a = last.analysis ?? { zeng: [], suo: [], yue: [], gou: [], notes: [] }
    const cases = [
      ...a.zeng.map((c) => ({ type: '增附', path, name: c.name, line: c.line })),
      ...a.suo.map((c) => ({ type: '去锁', path, name: c.name, line: c.line })),
      ...a.yue.map((c) => ({ type: '越源', path, name: c.name, line: c.line })),
      ...a.gou.map((c) => ({ type: '钩入', path, name: c.name, line: c.line })),
    ]
    const notes = [...a.notes]
    if (gauge > 0) notes.push(`末文后无文之改 ${gauge} 笔`)
    const state = cases.length > 0 ? '案' : '净籍'
    return { path, state, score: 0, cases, notes, last, gauge }
  })
}

/** issues 行（锁死，docs/03 §8）：增附 → 去锁 → 越源 → 钩入 → 暗籍 → 素籍 → 注记 → 全平。 */
export function issuesOf(settled) {
  const issues = []
  const byType = (t) => {
    for (const l of settled) {
      for (const c of l.cases ?? []) {
        if (c.type !== t) continue
        const at = c.line ? `:${c.line}` : ''
        issues.push(`${t}：${c.path}${at} ${c.name}`)
      }
    }
  }
  for (const t of ['增附', '去锁', '越源', '钩入']) byType(t)
  for (const l of settled) {
    if (l.state === '暗籍') issues.push(`暗籍：${l.path}（seq ${l.sand.seq} ${l.sand.how}）`)
  }
  for (const l of settled) {
    if (l.state === '素籍') issues.push(`素籍：${l.path}（seq ${l.last.seq} 无文之写）`)
  }
  for (const l of settled) {
    if ((l.notes ?? []).length > 0) issues.push(`注记：${l.path} ${l.notes.join('；')}`)
  }
  const noisy = settled.some((l) => l.state !== '净籍' || (l.notes ?? []).length > 0)
  if (!noisy) issues.push(`籍皆平 ×${settled.length} —— 平万物而便百姓`)
  return issues
}

/** 判定：准值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const settled = settleLines(engine)
  const cases = { zeng: 0, suo: 0, yue: 0, gou: 0, an: 0, su: 0 }
  for (const l of settled) {
    for (const c of l.cases ?? []) {
      if (c.type === '增附') cases.zeng++
      else if (c.type === '去锁') cases.suo++
      else if (c.type === '越源') cases.yue++
      else if (c.type === '钩入') cases.gou++
    }
    if (l.state === '暗籍') cases.an++
    if (l.state === '素籍') cases.su++
  }

  const score = {
    yue: Math.min(60, 30 * cases.yue),
    gou: Math.min(60, 30 * cases.gou),
    zeng: Math.min(60, 15 * cases.zeng),
    suo: Math.min(60, 10 * cases.suo),
  }
  score.total = Math.min(100, score.yue + score.gou + score.zeng + score.suo)

  const band = bandOf(score.total)
  const verdict = score.total >= gate ? 'fail' : 'pass'

  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    paths: settled.length,
    cases,
    score,
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    issues: issuesOf(settled),
    lines: settled,
  }
}
