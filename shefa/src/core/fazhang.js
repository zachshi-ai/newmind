/**
 * 筏账引擎 —— 落物登记与归宿判定（docs/03 §4/§6 锁死），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流审计把所有会话的调用记进同一引擎（案径全局去重、凭据全局时序）；
 * 插件只记本会话——单会话视图（跨会话之归并归离线合并审计）。
 *
 * 入口滤（先于一切，docs/03 §4.1）：isError === true 一律不入账——失败之写未落盘、失败之删没删成；
 * isError 未知（null，老流）按已发生入账（未知不是失败）。
 *
 * 落物通道唯二：
 *   write 族 p: 径命中筏形 → 落物；
 *   exec 族词面 dropTargets 提取（cp/mv 末词元、tee/touch 全部词元、重定向正则）命中筏形 → 落物。
 * 每径至多一案：首落立案，后续落物只刷新末落基点（lastSeq）与笔数。
 * 凭据（rm/clean/add/commit）登记流序 seq；归宿在收尾判定（judge 现算，幂等），判定序锁死：
 *   舍（rm 词元逐字/宽 glob ∪ git clean 全域）> 归（add 见证 + 更后 commit）> 外逸 > 遗。
 *
 * 分值锁死（docs/03 §6）：infield=min(30,15×遗)、exfield=min(60,30×外逸)、total=min(100,和)；
 *   分带 净 0–14 / 滞 15–29 / 积 ≥30；门默认 30——单外逸即红、两案域内遗即红。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import { DEFAULT_RAFT_FORMS, DEFAULT_KEEP_FORMS } from './zuce.js'
import { segments, tokenize, dropTargets, globMatch, wildcardMatch, inSystemArea } from './lexicon.js'

export const GATE_DEFAULT = 30

const PER_LEFT = 15
const CAP_LEFT = 30
const PER_STRAY = 30
const CAP_STRAY = 60

const RM_WORDS = new Set(['rm', 'rmdir', 'unlink'])

export function bandOf(total) {
  if (total < 15) return '净'
  if (total < 30) return '滞'
  return '积'
}

/** 引擎装配：筏册 ∪ CLI 旗标覆盖 → 形表与域界。无册（null）用全默认——默认形表开箱在岗（无册照判）。 */
export function assembleOpts({ book = null, overrides = {} } = {}) {
  const base = book ?? { keep: [], raft: [], roots: [], noDefaults: false }
  const keepExplicit = [...new Set([...(base.keep ?? []), ...(overrides.keep ?? [])])]
  const raftExplicit = [...new Set([...(base.raft ?? []), ...(overrides.raft ?? [])])]
  const noDefaults = base.noDefaults === true || overrides.noDefaults === true
  return {
    keep: keepExplicit,
    keepAll: [...new Set([...DEFAULT_KEEP_FORMS, ...keepExplicit])],
    raft: noDefaults ? raftExplicit : [...new Set([...DEFAULT_RAFT_FORMS, ...raftExplicit])],
    roots: [...new Set([...(base.roots ?? []), ...(overrides.roots ?? [])])],
    noDefaults,
  }
}

export function createEngine(opts = {}) {
  const cfg = assembleOpts(opts)
  return {
    cfg,
    calls: [],
    seq: 0,
    cases: new Map(), // 规整径 → 案 {path, form, firstSession, firstRef, firstSeq, lastSeq, hits}
    order: [], // 案径按首落序
    creds: [], // 凭据 {kind:'rm'|'clean'|'add'|'commit', paths?, seq}
    exemptSeen: new Set(),
    exemptNotes: [], // {path, session, ref}
    counts: { dropped: 0, exempted: 0 },
  }
}

function formHit(forms, path) {
  return forms.find((w) => path.includes(w)) ?? null
}

/** 落物/豁免共同入口（write 族与 exec 提取共用）。 */
function admit(engine, rawPath, session, ref, seq) {
  const path = normalizePath(rawPath)
  if (!path) return
  if (engine.cfg.keepAll.some((w) => path.includes(w))) {
    // 弃物址（默认 keep 形）天然白、静默出账；显式 keep 才注记（豁免在册是任务方的签字）
    if (engine.cfg.keep.some((w) => path.includes(w)) && !engine.exemptSeen.has(path)) {
      engine.exemptSeen.add(path)
      engine.exemptNotes.push({ path, session, ref })
      engine.counts.exempted += 1
    }
    return
  }
  const form = formHit(engine.cfg.raft, path)
  if (!form) return // 非筏形：永不入账（交付径天然沉默）

  let c = engine.cases.get(path)
  if (!c) {
    c = { path, form, firstSession: session, firstRef: ref, firstSeq: seq, lastSeq: seq, hits: 1 }
    engine.cases.set(path, c)
    engine.order.push(path)
  } else {
    c.lastSeq = seq // 末落定基点：旧凭据不再销案（先删后写不销案）
    c.hits += 1
  }
  engine.counts.dropped += 1
}

/** exec 词面：逐段提取落物目标 + 登记销案凭据。 */
function ingestCommand(engine, command, session, ref, seq) {
  for (const seg of segments(command)) {
    const tokens = tokenize(seg)
    if (!tokens.length) continue
    const words = new Set(tokens.map((t) => t.split(/[/\\]/).pop().toLowerCase()))

    for (const target of dropTargets(seg)) admit(engine, target, session, ref, seq)

    if ([...words].some((w) => RM_WORDS.has(w))) {
      engine.creds.push({ kind: 'rm', paths: tokens.filter((t) => !t.startsWith('-')), seq })
    }
    if (words.has('git') && words.has('clean')) {
      engine.creds.push({ kind: 'clean', seq })
    }
    if (words.has('git') && words.has('add')) {
      engine.creds.push({ kind: 'add', paths: tokens.filter((t) => !t.startsWith('-')), seq })
    }
    if (words.has('git') && words.has('commit')) {
      engine.creds.push({ kind: 'commit', seq })
    }
  }
}

/**
 * 记一笔调用（唯一写入口）。
 * observe 不落物不销案；write 族看 p: 径；exec 族进词法；其他/n: 黑盒。
 */
export function recordCall(engine, { session, ref = null, name, args, isError = null }) {
  const rec = { session, ref, name, args, isError }
  engine.calls.push(rec)
  if (isError === true) return engine // 入口滤：失败不入账（写未落盘、删没删成）
  const seq = ++engine.seq
  const fam = familyOf(name)
  const key = objectKey(args, name)

  if (fam === 'write') {
    if (key.startsWith('p:')) admit(engine, key.slice(2), session, ref, seq)
    return engine
  }
  if (fam === 'exec') {
    if (key.startsWith('c:')) ingestCommand(engine, key.slice(2), session, ref, seq)
    return engine
  }
  return engine // observe / other：不落物、不凭据
}

/** 域外判定（docs/03 §3）：roots 优先，空则系统区前缀回退。 */
function outsideOf(cfg, path) {
  if (cfg.roots.length) return !cfg.roots.some((g) => globMatch(g, path))
  return inSystemArea(path)
}

function credMatches(tokens, path) {
  return tokens.some((t) => wildcardMatch(t, path) || normalizePath(t) === path)
}

/** 案的归宿（判定序锁死：舍 > 归 > 外逸 > 遗）。 */
export function settleCase(engine, c) {
  const after = engine.creds.filter((k) => k.seq > c.lastSeq)
  const rmHit = after.some((k) => k.kind === 'rm' && credMatches(k.paths ?? [], c.path))
  const cleanHit = after.some((k) => k.kind === 'clean')
  if (rmHit || cleanHit) return '舍'
  const addHit = after.find((k) => k.kind === 'add' && credMatches(k.paths ?? [], c.path))
  if (addHit && after.some((k) => k.kind === 'commit' && k.seq > addHit.seq)) return '归'
  return outsideOf(engine.cfg, c.path) ? '外逸' : '遗'
}

/** 逐案清点（唯一判定点）：judge 与舍牌块共用；按首落案序。 */
export function settleLines(engine) {
  return engine.order.map((path) => {
    const c = engine.cases.get(path)
    return { path: c.path, form: c.form, state: settleCase(engine, c), hits: c.hits, session: c.firstSession }
  })
}

function spot(c) {
  return c.path
}

/** issues 行序锁死（docs/03 §7）：外逸 → 遗筏 → 舍 → 归 → 豁免 → 净筏。 */
export function issuesOf(engine, settled) {
  const issues = []
  const strays = settled.filter((s) => s.state === '外逸')
  const lefts = settled.filter((s) => s.state === '遗')
  const removed = settled.filter((s) => s.state === '舍')
  const adopted = settled.filter((s) => s.state === '归')
  if (strays.length) {
    issues.push(`外逸 ×${strays.length}（+${PER_STRAY}/案）：${strays.map(spot).join('、')} —— 法尚应舍，何况非法`)
  }
  if (lefts.length) {
    issues.push(`遗筏 ×${lefts.length}（+${PER_LEFT}/案）：${lefts.map(spot).join('、')} —— 凡所有相，皆是虚妄`)
  }
  if (removed.length) {
    issues.push(`舍 ×${removed.length}（不计分）：${removed.map(spot).join('、')} —— 渡即舍筏，心无所住`)
  }
  if (adopted.length) {
    issues.push(`归 ×${adopted.length}（不计分）：${adopted.map(spot).join('、')} —— 登岸之筏，亦是器用`)
  }
  if (engine.exemptNotes.length) {
    issues.push(`豁免 ×${engine.exemptNotes.length}（不计分）：${engine.exemptNotes.map((n) => n.path).join('、')} —— 筏册明言`)
  }
  if (!settled.length) {
    issues.push('净筏：筏账无案——渡尽舍筏，无有所住')
  }
  return issues
}

/** 判定：筏值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const settled = settleLines(engine)
  const left = settled.filter((s) => s.state === '遗').length
  const stray = settled.filter((s) => s.state === '外逸').length
  const removed = settled.filter((s) => s.state === '舍').length
  const adopted = settled.filter((s) => s.state === '归').length
  const infield = Math.min(CAP_LEFT, PER_LEFT * left)
  const exfield = Math.min(CAP_STRAY, PER_STRAY * stray)
  const total = Math.min(100, infield + exfield)
  const band = bandOf(total)
  const verdict = total >= gate ? 'fail' : 'pass'

  const raftTop = engine.order
    .map((p) => ({ path: p, hits: engine.cases.get(p).hits }))
    .sort((a, b) => b.hits - a.hits || (a.path < b.path ? -1 : 1))
    .slice(0, 3)

  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    rafts: engine.counts.dropped,
    paths: engine.order.length,
    cases: left + stray,
    score: { total, infield, exfield },
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    counts: {
      dropped: engine.counts.dropped,
      removed,
      adopted,
      exempted: engine.counts.exempted,
      left,
      stray,
    },
    gauge: { raftTop },
    issues: issuesOf(engine, settled),
  }
}
