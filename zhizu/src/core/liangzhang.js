/**
 * 量账引擎 —— 变更规模逐案记账与溢值判定（巨写 / 蔓延 / 屡改 / 创笔 / 豁免），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流审计把所有会话的调用记进同一引擎（径去重与屡改计数全流全局）；
 * 插件只记本会话——单会话视图（跨会话之归并归离线合并审计）。
 *
 * 入口滤（先于一切，docs/03 §4）：isError === true 一律不入账——失败之写未落盘，
 * 试错之地归九变；isError 未知（null，老流）按已发生入账（未知不是失败）。
 *
 * 判定序锁死（docs/03 §4）：
 *   write + p: 径：豁免（径含子串，全免出账）→ 创笔/改笔判定（此前成功读写与否）
 *     → 巨写（改笔 ∧ 行数>hugeLines 立案；创笔 ∧ 行数>hugeLines 注记不计分）
 *     → 屡改（超出免额每满 2 笔一案，增量记账：新案才记分，与离线重放前缀一致）；
 *   observe + p: 径：成功读 → 先见登记（后续同径之写为改笔）；
 *   exec / n:：黑盒不判（写入体在流里不可见，宁漏勿诬）。
 * 蔓延在收尾判定（judge 时现算，幂等）：父目录去重 > fanDirs 或文件数 ≥ fanFiles → 单案 +20。
 *
 * 分值锁死（docs/03 §6）：huge=min(60,30×巨写)、fan=min(20,20×蔓延)、churn=min(20,10×屡改)、
 *   total=min(100,三和)；分带 俭 0–14 / 盈 15–29 / 溢 ≥30；门默认 30——单巨写即红。
 */

import { objectKey, familyOf, normalizePath, parentDir, contentOf, countLines } from './object.js'

export const GATE_DEFAULT = 30

const PER_HUGE = 30
const CAP_HUGE = 60
const PER_FAN = 20
const CAP_FAN = 20
const PER_CHURN = 10
const CAP_CHURN = 20

export function bandOf(total) {
  if (total < 15) return '俭'
  if (total < 30) return '盈'
  return '溢'
}

/** 引擎装配：足册 ∪ CLI 旗标覆盖 → 阈值与豁免。无册（null）用全默认。 */
export function assembleOpts({ book = null, overrides = {} } = {}) {
  const base = book ?? {
    version: 1,
    exempt: [],
    hugeLines: 400,
    fanDirs: 6,
    fanFiles: 20,
    churnFree: 3,
  }
  return {
    exempt: [...new Set([...(base.exempt ?? []), ...(overrides.exempt ?? [])])],
    hugeLines: overrides.hugeLines ?? base.hugeLines,
    fanDirs: overrides.fanDirs ?? base.fanDirs,
    fanFiles: overrides.fanFiles ?? base.fanFiles,
    churnFree: overrides.churnFree ?? base.churnFree,
  }
}

export function createEngine(opts = {}) {
  const cfg = assembleOpts(opts)
  return {
    cfg,
    calls: [],
    writes: [], // write 族成功调用全记（与 xiangxiao 口径一致）
    cases: [], // { kind: 'huge'|'churn', path, ... }（蔓延收尾现算，不入此账）
    notes: [], // { kind: 'fresh'|'exempt', path, ... }
    touched: new Set(), // 规整径 —— 成功读或成功写过（改笔判定与豁免出账之后仍需先判后记）
    writeCount: new Map(), // 规整径 → 成功写笔数（豁免径不计入）
    churnCases: new Map(), // 规整径 → 已记屡改案数（增量记账）
    exemptSeen: new Set(), // 豁免注记每径一记
    counts: { hugeWrites: 0, fanouts: 0, churns: 0, freshNotes: 0, exempted: 0 },
    maxLines: 0,
  }
}

/**
 * 记一笔调用（唯一写入口）。
 * observe 成功之读 → 先见；write 成功之写 → 豁免 → 创笔/巨写 → 屡改；exec/其他 → 黑盒。
 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, content = null }) {
  const rec = { session, ref, name, args, isError, content }
  engine.calls.push(rec)
  if (isError === true) return engine // 入口滤：失败不入账
  const fam = familyOf(name)
  const key = objectKey(args, name)

  if (fam === 'observe') {
    if (key.startsWith('p:')) engine.touched.add(normalizePath(key.slice(2)))
    return engine
  }
  if (fam !== 'write' || !key.startsWith('p:')) return engine // exec/n: 黑盒；exec 族写入体不可见

  engine.writes.push(rec)
  const rawPath = key.slice(2)
  const path = normalizePath(rawPath)

  if (engine.cfg.exempt.some((w) => path.includes(w))) {
    if (!engine.exemptSeen.has(path)) {
      engine.exemptSeen.add(path)
      engine.notes.push({ kind: 'exempt', path, session, ref })
      engine.counts.exempted += 1
    }
    return engine // 豁免径三宗全免、完全出账
  }

  const text = contentOf(args)
  const lines = text ? countLines(text) : null
  if (lines != null && lines > engine.maxLines) engine.maxLines = lines

  const isFresh = !engine.touched.has(path) // 先判后记：本次写不算自己的先见

  if (lines != null && lines > engine.cfg.hugeLines) {
    if (isFresh) {
      const nk = engine.notes.find((n) => n.kind === 'fresh' && n.path === path)
      if (!nk) {
        engine.notes.push({ kind: 'fresh', path, lines, session, ref })
        engine.counts.freshNotes += 1
      } // 新址起屋，脚手架天经地义——注记不计分
    } else {
      engine.cases.push({ kind: 'huge', path, lines, session, ref })
      engine.counts.hugeWrites += 1
    }
  }

  engine.touched.add(path)

  const n = (engine.writeCount.get(path) ?? 0) + 1
  engine.writeCount.set(path, n)
  const free = engine.cfg.churnFree
  const target = n > free ? Math.floor((n - free) / 2) : 0
  const prev = engine.churnCases.get(path) ?? 0
  for (let i = prev; i < target; i++) {
    engine.cases.push({ kind: 'churn', path, writes: n, session, ref })
    engine.counts.churns += 1
  }
  engine.churnCases.set(path, target)
  return engine
}

/** 蔓延收尾判定（幂等，不落账）：父目录去重 > fanDirs 或文件数 ≥ fanFiles。 */
export function fanoutOf(engine) {
  const paths = [...engine.writeCount.keys()]
  const dirs = new Set(paths.map(parentDir))
  const over = dirs.size > engine.cfg.fanDirs || paths.length >= engine.cfg.fanFiles
  return { over, dirs: dirs.size, files: paths.length }
}

function spot(c) {
  return `${c.path} 行数=${c.lines}`
}

/** issues 行序锁死（docs/03 §7）：巨写 → 蔓延 → 屡改 → 创笔 → 豁免 → 净量。 */
export function issuesOf(engine) {
  const issues = []
  const hugeCases = engine.cases.filter((c) => c.kind === 'huge')
  const fan = fanoutOf(engine)
  const churnByPath = new Map()
  for (const c of engine.cases) {
    if (c.kind !== 'churn') continue
    const cur = churnByPath.get(c.path) ?? { path: c.path, cases: 0, writes: 0 }
    cur.cases += 1
    cur.writes = Math.max(cur.writes, c.writes ?? 0)
    churnByPath.set(c.path, cur)
  }
  const freshNotes = engine.notes.filter((n) => n.kind === 'fresh')
  const exemptNotes = engine.notes.filter((n) => n.kind === 'exempt')

  if (hugeCases.length) {
    issues.push(`巨写 ×${hugeCases.length}（+30/案）：${hugeCases.map(spot).join('、')} —— 筹量牛力，不令过分`)
  }
  if (fan.over) {
    issues.push(`蔓延 ×1（+${PER_FAN}）：目录 ${fan.dirs} · 文件 ${fan.files} —— 众鸟集之，树有枯折之患`)
  }
  if (churnByPath.size) {
    const spots = [...churnByPath.values()]
      .map((v) => `${v.path} 写 ${v.writes} 次免 ${engine.cfg.churnFree}`)
      .join('、')
    issues.push(`屡改 ×${engine.counts.churns}（+${PER_CHURN}/案）：${spots} —— 动转轻躁，改而不休`)
  }
  if (freshNotes.length) {
    issues.push(`创笔 ×${freshNotes.length}（不计分）：${freshNotes.map((n) => n.path).join('、')} —— 新址起屋，脚手架天经地义`)
  }
  if (exemptNotes.length) {
    issues.push(`豁免 ×${exemptNotes.length}（不计分）：${exemptNotes.map((n) => n.path).join('、')} —— 足册明言`)
  }
  if (!engine.cases.length && !fan.over) {
    issues.push('净量：量账无案——行少欲者，触事有余')
  }
  return issues
}

/** 判定：溢值与门禁（蔓延收尾现算；registry 已在 assembleOpts 消化，此处不再问册）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const hugeCases = engine.cases.filter((c) => c.kind === 'huge')
  const huge = Math.min(CAP_HUGE, PER_HUGE * hugeCases.length)
  const fan = fanoutOf(engine)
  const fanScore = fan.over ? Math.min(CAP_FAN, PER_FAN) : 0
  const churn = Math.min(CAP_CHURN, PER_CHURN * engine.counts.churns)
  const total = Math.min(100, huge + fanScore + churn)
  const band = bandOf(total)
  const verdict = total >= gate ? 'fail' : 'pass'

  const churnTop = [...engine.writeCount.entries()]
    .map(([path, writes]) => ({ path, writes }))
    .sort((a, b) => b.writes - a.writes || (a.path < b.path ? -1 : 1))
    .slice(0, 3)

  const paths = [...engine.writeCount.keys()]
  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    writes: engine.writes.length,
    cases: hugeCases.length + (fan.over ? 1 : 0) + engine.counts.churns,
    score: { total, huge, fan: fanScore, churn },
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    counts: { ...engine.counts, fanouts: fan.over ? 1 : 0 },
    gauge: {
      writePaths: paths.length,
      writeDirs: new Set(paths.map(parentDir)).size,
      maxLines: engine.maxLines,
      churnTop,
    },
    issues: issuesOf(engine),
  }
}
