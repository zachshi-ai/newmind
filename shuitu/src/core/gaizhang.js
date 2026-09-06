/**
 * 改账引擎 —— 常驻境变登记与复位判定（docs/03 §4/§6 锁死），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流审计把所有会话的调用记进同一引擎（案 key 全局去重、凭据全局时序）；
 * 插件只记本会话——单会话视图（跨会话之归并归离线合并审计）。
 *
 * 入口滤（先于一切）：isError === true 一律不入账——没装成的包、没起成的服务、没改成的配置
 * 都不是事实；isError 未知（null，老流）按已发生入账（未知不是失败）。
 *
 * 改动通道唯二：
 *   write 族 p: 径命中改径形 → 改案（kind: path）；
 *   exec 族 parseSegment 三族词法（装形 17 ∪ 改词形 4 ∪ 驻形 9）∪ 词面提取目标命中改径形 → 案。
 * 每案至多一案：首改立案，后续同 key 改动只刷新末改基点（lastSeq）与笔数。
 * 豁免在立案前判（土册三列子串命中案 key → 完全出账，注记每案一记）。
 * 复位在收尾判定（judge 现算，幂等），判定序锁死：豁（立案前已出账）> 复（基点后配对凭据）> 遗。
 *
 * 分值锁死（docs/03 §6）：reside=min(60,30×驻遗)、inst=min(30,15×装遗)、conf=min(30,15×改遗)、
 *   total=min(100,和)；分带 淮 0–14 / 移 15–29 / 枳 ≥30；门默认 30——单驻案即红、两装案或两改案即红。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import { segments, parseSegment, rcFormHit, wildcardMatch, SINK_FORMS } from './lexicon.js'

export const GATE_DEFAULT = 30

const PER_RESIDE = 30
const CAP_RESIDE = 60
const PER_INST = 15
const CAP_INST = 30
const PER_CONF = 15
const CAP_CONF = 30

export function bandOf(total) {
  if (total < 15) return '淮'
  if (total < 30) return '移'
  return '枳'
}

/** 引擎装配：土册 ∪ CLI 旗标覆盖 → 豁免词三列。无册（null）用空册——默认形表开箱在岗（无册照判）。 */
export function assembleOpts({ book = null, overrides = {} } = {}) {
  const base = book ?? { install: [], config: [], reside: [] }
  const union = (field) => [...new Set([...(base[field] ?? []), ...(overrides[field] ?? [])])]
  return { install: union('install'), config: union('config'), reside: union('reside') }
}

export function createEngine(opts = {}) {
  const cfg = assembleOpts(opts)
  return {
    cfg,
    calls: [],
    seq: 0,
    cases: new Map(), // key → 案 {key, family('装'|'改'|'驻'), kind, manager, target, scope, firstSession, firstSeq, lastSeq, hits}
    order: [], // 案 key 按首改序
    creds: [], // 凭据 {seq, kind, ...}
    exemptSeen: new Set(),
    exemptNotes: [], // {key, session, ref}
    counts: { mutated: 0, exempted: 0 },
  }
}

/** 案 key（docs/03 §4.6 锁死）。 */
function caseKey(family, manager, target) {
  if (family === '驻' && manager === 'crontab') return '驻:crontab'
  return `${family}:${manager}:${target}`
}

/** 豁免词列：按族取册列。 */
function exemptField(family) {
  if (family === '装') return 'install'
  if (family === '改') return 'config'
  return 'reside'
}

/** 立案/刷新共同入口（write 径形与 exec 词法共用）。 */
function admit(engine, { family, kind, manager, target, scope = null }, session, ref, seq) {
  const key = caseKey(family, manager, target)
  const words = engine.cfg[exemptField(family)] ?? []
  if (words.some((w) => key.includes(w))) {
    // 豁免在册（任务方签字）→ 完全出账，注记每案一记
    if (!engine.exemptSeen.has(key)) {
      engine.exemptSeen.add(key)
      engine.exemptNotes.push({ key, session, ref })
      engine.counts.exempted += 1
    }
    return
  }
  let c = engine.cases.get(key)
  if (!c) {
    c = { key, family, kind, manager, target, scope, firstSession: session, firstRef: ref, firstSeq: seq, lastSeq: seq, hits: 1 }
    engine.cases.set(key, c)
    engine.order.push(key)
  } else {
    c.lastSeq = seq // 末改定基点：旧凭据不再销案（先卸后装不销案）
    c.hits += 1
  }
  engine.counts.mutated += 1
}

/** exec 词面：逐段提取改动案 + 登记复位凭据。 */
function ingestCommand(engine, command, session, ref, seq) {
  for (const seg of segments(command)) {
    const parsed = parseSegment(seg)
    for (const ins of parsed.installs) {
      admit(engine, { family: '装', kind: 'inst', manager: ins.manager, target: ins.pkg }, session, ref, seq)
    }
    for (const cfg of parsed.configs) {
      const kind = cfg.kind
      const manager = kind === 'gitconfig' || kind === 'npmrc' || kind === 'defaults' ? kind : 'ln'
      admit(engine, { family: '改', kind, manager, target: cfg.key, scope: cfg.scope ?? null }, session, ref, seq)
    }
    for (const res of parsed.resides) {
      admit(engine, { family: '驻', kind: res.kind, manager: res.manager, target: res.target }, session, ref, seq)
    }
    for (const target of parsed.targets) {
      const t = normalizePath(target)
      if (!t || SINK_FORMS.some((w) => t.includes(w))) continue
      const form = rcFormHit(t)
      if (form) admit(engine, { family: '改', kind: 'path', manager: 'path', target: t }, session, ref, seq)
    }
    for (const cred of parsed.restores) engine.creds.push({ seq, ...cred })
  }
}

/**
 * 记一笔调用（唯一写入口）。
 * observe 不立案不凭据；write 族看 p: 径改径形；exec 族进词法；其他/n: 黑盒。
 */
export function recordCall(engine, { session, ref = null, name, args, isError = null }) {
  const rec = { session, ref, name, args, isError }
  engine.calls.push(rec)
  if (isError === true) return engine // 入口滤：失败不入账
  const seq = ++engine.seq
  const fam = familyOf(name)
  const key = objectKey(args, name)

  if (fam === 'write') {
    if (key.startsWith('p:')) {
      const path = normalizePath(key.slice(2))
      const form = path ? rcFormHit(path) : null
      if (form) admit(engine, { family: '改', kind: 'path', manager: 'path', target: path }, session, ref, seq)
    }
    return engine
  }
  if (fam === 'exec') {
    if (key.startsWith('c:')) ingestCommand(engine, key.slice(2), session, ref, seq)
    return engine
  }
  return engine // observe / other：不立案、不凭据
}

/** 凭据与案是否配对（docs/03 §4.5 匹配规则锁死）。 */
function credMatches(cred, c) {
  const eq = (a, b) => a === b || wildcardMatch(a, b)
  if (c.family === '装') {
    return cred.kind === 'uninst' && cred.manager === c.manager && eq(cred.pkg, c.target)
  }
  if (c.family === '改') {
    if (c.kind === 'gitconfig') {
      return cred.kind === 'cfg' && cred.sub === 'gitconfig' && cred.scope === c.scope && eq(cred.key, c.target)
    }
    if (c.kind === 'npmrc') return cred.kind === 'cfg' && cred.sub === 'npmrc' && eq(cred.key, c.target)
    if (c.kind === 'defaults') return cred.kind === 'cfg' && cred.sub === 'defaults' && eq(cred.key, c.target)
    if (c.kind === 'ln') {
      return cred.kind === 'rm' && (cred.paths ?? []).some((p) => eq(normalizePath(p), c.target))
    }
    return false // 改径形写案无可凭复（docs/03 §12）——唯册豁免一路
  }
  // 驻
  if (cred.kind === 'stop') return cred.manager === c.kind && (cred.targets ?? []).some((t) => eq(t, c.target))
  if (cred.kind === 'stop-global') {
    if (c.kind === 'docker') return cred.manager === 'docker'
    if (c.kind === 'crontab') return cred.manager === 'crontab'
    if (c.kind === 'pm2') return cred.manager === 'pm2'
    if (c.kind === 'brew-services') return cred.manager === 'brew-services'
  }
  if (cred.kind === 'kill') return c.kind === 'nohup' || c.kind === 'setsid'
  return false
}

/** 案的归宿（判定序锁死：复 > 遗；豁免在立案前已出账）。 */
export function settleCase(engine, c) {
  const after = engine.creds.filter((k) => k.seq > c.lastSeq)
  return after.some((k) => credMatches(k, c)) ? '复' : '遗'
}

/** 逐案清点（唯一判定点）：judge 与土牌块共用；按首改案序。 */
export function settleLines(engine) {
  return engine.order.map((key) => {
    const c = engine.cases.get(key)
    return { key: c.key, family: c.family, kind: c.kind, state: settleCase(engine, c), hits: c.hits, session: c.firstSession }
  })
}

function spot(s) {
  return s.key
}

/** issues 行序锁死（docs/03 §7）：驻遗 → 装遗 → 改遗 → 复 → 豁 → 净境。 */
export function issuesOf(engine, settled) {
  const issues = []
  const leftReside = settled.filter((s) => s.state === '遗' && s.family === '驻')
  const leftInst = settled.filter((s) => s.state === '遗' && s.family === '装')
  const leftConf = settled.filter((s) => s.state === '遗' && s.family === '改')
  const restored = settled.filter((s) => s.state === '复')
  if (leftReside.length) {
    issues.push(`驻遗 ×${leftReside.length}（+${PER_RESIDE}/案 cap ${CAP_RESIDE}）：${leftReside.map(spot).join('、')} —— 叶徒相似，其实味不同`)
  }
  if (leftInst.length) {
    issues.push(`装遗 ×${leftInst.length}（+${PER_INST}/案 cap ${CAP_INST}）：${leftInst.map(spot).join('、')} —— 所以然者何？水土异也`)
  }
  if (leftConf.length) {
    issues.push(`改遗 ×${leftConf.length}（+${PER_CONF}/案 cap ${CAP_CONF}）：${leftConf.map(spot).join('、')} —— 得无楚之水土使民善盗耶`)
  }
  if (restored.length) {
    issues.push(`复 ×${restored.length}（不计分）：${restored.map(spot).join('、')} —— 为者常成，行者常至`)
  }
  if (engine.exemptNotes.length) {
    issues.push(`豁 ×${engine.exemptNotes.length}（不计分）：${engine.exemptNotes.map((n) => n.key).join('、')} —— 土册明言`)
  }
  if (!settled.length) {
    issues.push('净境：改账无案——水土如初')
  }
  return issues
}

/** 判定：异值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const settled = settleLines(engine)
  const leftReside = settled.filter((s) => s.state === '遗' && s.family === '驻').length
  const leftInst = settled.filter((s) => s.state === '遗' && s.family === '装').length
  const leftConf = settled.filter((s) => s.state === '遗' && s.family === '改').length
  const restored = settled.filter((s) => s.state === '复').length
  const reside = Math.min(CAP_RESIDE, PER_RESIDE * leftReside)
  const inst = Math.min(CAP_INST, PER_INST * leftInst)
  const conf = Math.min(CAP_CONF, PER_CONF * leftConf)
  const total = Math.min(100, reside + inst + conf)
  const band = bandOf(total)
  const verdict = total >= gate ? 'fail' : 'pass'

  const mutTop = engine.order
    .map((k) => ({ key: k, hits: engine.cases.get(k).hits }))
    .sort((a, b) => b.hits - a.hits || (a.key < b.key ? -1 : 1))
    .slice(0, 3)

  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    muts: engine.order.length,
    events: engine.counts.mutated,
    score: { total, reside, inst, conf },
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    counts: {
      mutated: engine.counts.mutated,
      restored,
      exempted: engine.counts.exempted,
      leftReside,
      leftInst,
      leftConf,
    },
    gauge: { mutTop },
    issues: issuesOf(engine, settled),
  }
}
