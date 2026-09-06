/**
 * 材账引擎 —— 读据成色逐案记账与残值判定（残见两通道 / 盲动 / 碎览 / 豁免），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流审计把所有会话的调用记进同一引擎，但**据证链按会话分账**——
 * 残见/全览/自书以 (session, 规整径) 为键，盲动的对象是「一个动刀者的见闻」，
 * 甲会话读全救不了乙会话的盲（与量的归并不同，这是知的归属）。
 *
 * 入口滤（先于一切，docs/03 §4）：isError === true 一律不入账——失败之见非见（什么也没看见），
 * 失败之写未落盘；isError 未知（null，老流）按已发生入账。
 *
 * 判定序锁死（docs/03 §4）：
 *   observe + p: 径：豁免（径含子串，全免出账）→ 偏窗命中=残见（跳卷首）
 *     → 限窗命中：无 content=无据之见；回程行数<窗值=取窗认全（全览）；回程≥窗值=残见
 *     → 无窗：content 在无残记=全览；content 在有残记=显残；content 缺=无据之见；
 *   write + p: 径：豁免 → 先查账后记自书（残见≥1 ∧ 全览=0 ∧ 自书=0 → 盲动立案 +30/案）；
 *   exec / n:：黑盒不判。
 * 碎览收尾判定（judge 时现算，幂等）：残见≥碎览阈 ∧ 全览0 ∧ 自书0 ∧ 无盲动案（不双罚）→ 单径 +10。
 *
 * 分值锁死（docs/03 §6）：blind=min(60,30×盲动)、crawl=min(20,10×碎览)、total=min(100,和)；
 *   分带 全 0–14 / 昧 15–29 / 盲 ≥30；门默认 30——单盲动即红。
 */

import { objectKey, familyOf, normalizePath, countLines } from './object.js'
import { assembleOpts } from './caice.js'

export const GATE_DEFAULT = 30

const PER_BLIND = 30
const CAP_BLIND = 60
const PER_CRAWL = 10
const CAP_CRAWL = 20

export function bandOf(total) {
  if (total < 15) return '全'
  if (total < 30) return '昧'
  return '盲'
}

/** 引擎装配：材册 ∪ CLI 旗标覆盖 → 生效口径。无册（null）用全默认。 */
export function createEngine(opts = {}) {
  const cfg = assembleOpts(opts)
  return {
    cfg,
    calls: [],
    writes: [], // write 族成功调用全记
    cases: [], // { kind: 'blind'|'crawl', path, session, ref, partials }
    notes: [], // { kind: 'exempt', path, session }
    partials: new Map(), // sk(session, path) → { window: n, marker: n, total: n }
    fulls: new Set(), // sk(session, path) —— 全览
    selfWritten: new Map(), // sk(session, path) → 成功写笔数（自书为览）
    blindPaths: new Set(), // sk(session, path) —— 已立盲动案之径（碎览不双罚）
    exemptSeen: new Set(), // 豁免注记每 (session, path) 一记
    counts: { blindActs: 0, crawls: 0, partialViews: 0, fullViews: 0, exempted: 0 },
    windowReads: 0,
    markerHits: 0,
  }
}

function sk(session, path) {
  return `${session}\u0000${path}`
}

/** 显残判定：默认形认尾（内容去尾空白后以其结尾）、显式形认全文（内容任意位置含该词）。 */
function markerHit(content, cfg) {
  const tail = String(content).trimEnd()
  if (cfg.tailMarkers.some((m) => tail.endsWith(m))) return true
  return cfg.anyMarkers.some((m) => String(content).includes(m))
}

/** 窗字段命中：偏形优先（跳卷首之窗），限形按表序取首个数值命中。未命中返回 null。 */
function windowHit(args, cfg) {
  const a = args && typeof args === 'object' ? args : {}
  for (const name of cfg.offFields) {
    const v = a[name]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return { kind: 'off' }
  }
  for (const name of cfg.capFields) {
    const v = a[name]
    if (typeof v === 'number' && Number.isFinite(v)) return { kind: 'cap', value: v }
  }
  return null
}

/**
 * 记一笔调用（唯一写入口）。
 * observe 成功之读 → 豁免/残见/全览/无据；write 成功之写 → 豁免/盲动/自书；exec/其他 → 黑盒。
 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, content = null }) {
  const rec = { session, ref, name, args, isError, content }
  engine.calls.push(rec)
  if (isError === true) return engine // 入口滤：失败之见非见，失败之写未落盘
  const fam = familyOf(name)
  const key = objectKey(args, name)

  if (fam === 'observe') {
    if (!key.startsWith('p:')) return engine // 不可寻径，黑盒
    const path = normalizePath(key.slice(2))
    const k = sk(session, path)

    if (engine.cfg.exempt.some((w) => path.includes(w))) {
      if (!engine.exemptSeen.has(k)) {
        engine.exemptSeen.add(k)
        engine.notes.push({ kind: 'exempt', path, session, ref })
        engine.counts.exempted += 1
      }
      return engine // 豁免径见不入账
    }

    const win = windowHit(args, engine.cfg)
    if (win) {
      engine.windowReads += 1
      if (win.kind === 'off') {
        partialOf(engine, k, path, session, 'window')
      } else if (content == null) {
        // 限窗开而回程不可见——不证其残亦不证其全（无据之见）
      } else if (countLines(content) < win.value) {
        fullOf(engine, k, path, session) // 取窗认全：卷短于窗，见到底了
      } else {
        partialOf(engine, k, path, session, 'window') // 窗满未到底
      }
      return engine
    }
    if (content == null) return engine // 无据之见：老流诚实沉默
    if (markerHit(content, engine.cfg)) {
      partialOf(engine, k, path, session, 'marker')
      engine.markerHits += 1
      return engine
    }
    fullOf(engine, k, path, session) // 卷在眼前而无所缺
    return engine
  }

  if (fam !== 'write' || !key.startsWith('p:')) return engine // exec/n: 黑盒

  const path = normalizePath(key.slice(2))
  const k = sk(session, path)

  if (engine.cfg.exempt.some((w) => path.includes(w))) {
    if (!engine.exemptSeen.has(k)) {
      engine.exemptSeen.add(k)
      engine.notes.push({ kind: 'exempt', path, session, ref })
      engine.counts.exempted += 1
    }
    return engine // 豁免径写不判、不入账（免出账）
  }

  engine.writes.push(rec)

  // 先查账后记自书：本次写不算自己的凭据
  const p = engine.partials.get(k)
  const seenFull = engine.fulls.has(k)
  const written = engine.selfWritten.get(k) ?? 0
  if (p && p.total >= 1 && !seenFull && written === 0) {
    engine.cases.push({ kind: 'blind', path, session, ref, partials: p.total })
    engine.counts.blindActs += 1
    engine.blindPaths.add(k)
    return engine // 盲写不生据：立案之笔不记自书，同径次刀仍可立案（逐笔立案）
  }
  engine.selfWritten.set(k, written + 1) // 自书为览（无案之写：作者知道自己写过什么）
  return engine
}

function partialOf(engine, k, path, session, kind) {
  const cur = engine.partials.get(k) ?? { window: 0, marker: 0, total: 0 }
  cur[kind] += 1
  cur.total += 1
  engine.partials.set(k, cur)
  engine.counts.partialViews += 1
}

function fullOf(engine, k, path, session) {
  // 全览按事件计数（views = 残见 + 全览 才是连贯的见闻事件数）；Set 只供判定去重
  engine.counts.fullViews += 1
  if (!engine.fulls.has(k)) engine.fulls.add(k)
}

/** 碎览收尾判定（幂等）：只窥不作之径——残见 ≥ 阈 ∧ 全览0 ∧ 自书0 ∧ 无盲动案。返回 [sk, entry] 列表。 */
export function crawlOf(engine) {
  const out = []
  for (const [k, entry] of engine.partials) {
    if (entry.total < engine.cfg.fragWindows) continue
    if (engine.fulls.has(k)) continue
    if ((engine.selfWritten.get(k) ?? 0) > 0) continue
    if (engine.blindPaths.has(k)) continue // 有刀之径已由盲动定罪，不双罚
    out.push([k, entry])
  }
  return out
}

function spot(k, entry) {
  const path = k.split('\u0000')[1]
  return `${path} 窗 ${entry.total}`
}

/** issues 行序锁死（docs/03 §7）：盲动 → 碎览 → 豁免 → 净鉴。 */
export function issuesOf(engine) {
  const issues = []
  const blindCases = engine.cases.filter((c) => c.kind === 'blind')
  const crawls = crawlOf(engine)
  const exemptNotes = engine.notes.filter((n) => n.kind === 'exempt')

  if (blindCases.length) {
    // 按径聚合（跨会话同名径合并展示），按首次立案序
    const byPath = new Map()
    for (const c of blindCases) {
      const cur = byPath.get(c.path) ?? { window: 0, marker: 0, total: 0 }
      const entry = engine.partials.get(sk(c.session, c.path))
      cur.total = entry ? entry.total : cur.total
      cur.window = entry ? entry.window : cur.window
      cur.marker = entry ? entry.marker : cur.marker
      if (!byPath.has(c.path)) byPath.set(c.path, cur)
    }
    const spots = [...byPath.entries()].map(([path, v]) => {
      const parts = []
      if (v.window > 0) parts.push(`窗 ${v.window}`)
      if (v.marker > 0) parts.push(`显 ${v.marker}`)
      return `${path} 残见 ${v.total} 笔（${parts.join(' · ')}）`
    })
    issues.push(`盲动 ×${blindCases.length}（+${PER_BLIND}/案）：${spots.join('、')} —— 审曲面势，以饬五材`)
  }
  if (crawls.length) {
    const sorted = crawls
      .sort((a, b) => b[1].total - a[1].total || (a[0].split('\u0000')[1] < b[0].split('\u0000')[1] ? -1 : 1))
    const spots = sorted.map(([k, entry]) => spot(k, entry)).join('、')
    issues.push(`碎览 ×${crawls.length}（+${PER_CRAWL}/径）：${spots} —— 斩毂之道，必矩其阴阳`)
  }
  if (exemptNotes.length) {
    const seen = new Set()
    const paths = exemptNotes.filter((n) => (seen.has(n.path) ? false : (seen.add(n.path), true))).map((n) => n.path)
    issues.push(`豁免 ×${paths.length}（不计分）：${paths.join('、')} —— 材册明言`)
  }
  if (!engine.counts.blindActs && !crawls.length) {
    issues.push('净鉴：材账无案——材美工巧，合之为良')
  }
  return issues
}

/** 判定：残值与门禁（碎览收尾现算；口径已在 assembleOpts 消化，此处不再问册）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const blindCases = engine.cases.filter((c) => c.kind === 'blind')
  const blind = Math.min(CAP_BLIND, PER_BLIND * blindCases.length)
  const crawls = crawlOf(engine)
  const crawl = Math.min(CAP_CRAWL, PER_CRAWL * crawls.length)
  const total = Math.min(100, blind + crawl)
  const band = bandOf(total)
  const verdict = total >= gate ? 'fail' : 'pass'

  const fragAgg = new Map()
  for (const [k, entry] of engine.partials) {
    const path = k.split('\u0000')[1]
    fragAgg.set(path, (fragAgg.get(path) ?? 0) + entry.total)
  }
  const fragTop = [...fragAgg.entries()]
    .map(([path, partials]) => ({ path, partials }))
    .sort((a, b) => b.partials - a.partials || (a.path < b.path ? -1 : 1))
    .slice(0, 3)

  const viewed = new Set()
  for (const k of engine.partials.keys()) viewed.add(k.split('\u0000')[1])
  for (const k of engine.fulls) viewed.add(k.split('\u0000')[1])

  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    views: engine.counts.partialViews + engine.counts.fullViews,
    writes: engine.writes.length,
    cases: blindCases.length + crawls.length,
    score: { total, blind, crawl },
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    counts: { ...engine.counts, crawls: crawls.length },
    gauge: {
      viewedPaths: viewed.size,
      windowReads: engine.windowReads,
      markerHits: engine.markerHits,
      fragTop,
    },
    issues: issuesOf(engine),
  }
}
