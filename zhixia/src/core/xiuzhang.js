/**
 * 瑕账引擎 —— 稿面受审、末稿立撤与瑕值判定（docs/03 §2/§7/§8 锁死），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流合审把所有会话的调用记进同一引擎（归并序见 audit.js）；
 * 插件只记本会话——单会话视图（跨会话之归并归离线合并审计）。
 *
 * 通道（docs/03 §2）：瑕账只收写——write 族 p: ∧ isError !== true ∧ content 非空；
 * isError === true 之写不入账（失败的写没落盘）、null 按已发生；observe 族永不受审
 * （读取不是落卷）；exec 族不受审（命令行无稿面结构）；other 族不入。
 *
 * 末稿：同径新稿落地即审（审的正是本笔 content），旧稿之案与注记全数撤换；
 * 先瑕之稿改净 → 已磨注记 0 分（櫽括一朝）；两稿皆有案 → 新案换旧案不叠加。
 *
 * 豁免（立案前）：瑕册 excuse glob ∪ 试场名段 → 整径不审不记。
 *
 * 判定序（docs/03 §7）：三形并行扫描、案案独立——乖总（逐有效表块逐列）、
 * 乖列/阙列（逐数言）、倒期（逐行逐处）、已磨（先瑕今净）。
 *
 * 瑕值（docs/03 §8）：xia=min(60,30×乖列)+min(60,30×乖总)+min(40,15×倒期)，
 * total=min(100)；分带 净 0–14 / 瑕 15–29 / 疵 ≥30；门默认 30——单乖列即红、
 * 单乖总即红、双倒期即红、单倒期黄牌不咬门。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import { globMatch } from './xiance.js'
import {
  claimsOf, isListLine, isTableLine, scanBlock, collectList, collectTableLines,
  parseTable, claimTableRows, parseIntCell, calOk, DATE_RE, djb2,
} from './shuyan.js'

export const GATE_DEFAULT = 30

export function bandOf(total) {
  if (total < 15) return '净'
  if (total < 30) return '瑕'
  return '疵'
}

/** 试场名段（docs/03 §2，径含名段即豁免，立案前）：正则形 10（目录段在串首亦算段）。 */
const GROUND_FORMS = [
  /(?:^|\/)tests?\//,
  /(?:^|\/)specs?\//,
  /(?:^|\/)__tests__\//,
  /(?:^|\/)__mocks__\//,
  /(?:^|\/)fixtures\//,
  /(?:^|\/)debug\//,
  /\.test\./,
  /\.spec\./,
  /\.mock\./,
  /\.debug\./,
]

function grounded(path) {
  return GROUND_FORMS.some((re) => re.test(path))
}

/** 连绵块顶端：自 start 向上把同一条空行透明连绵块走完（向上扫描命中的是块底，收集前先到顶）。 */
function runTop(lines, start) {
  let top = start
  let j = start - 1
  while (j >= 0) {
    if (!lines[j].trim()) {
      j -= 1
      continue
    }
    if (isListLine(lines[j]) || isTableLine(lines[j])) {
      top = j
      j -= 1
      continue
    }
    break
  }
  return top
}

/** 引擎装配：瑕册（免审）→ 末稿台。无册（null）→ excuse 为空——无册照判（凡卷皆审）。 */
export function createEngine({ book = null } = {}) {
  return {
    cfg: { excuse: (book?.excuse ?? []).map((g) => String(g)) },
    calls: [],
    drafts: new Map(), // 规整径 → { rows, cases, notes }（末稿：同径最近带文之写的判词）
    audited: { paths: new Set() },
  }
}

/** 单稿三形判定（docs/03 §5/§4/§6）。返回 { cases, notes, rows }。 */
export function auditContent(text) {
  const lines = String(text).split(/\r?\n/)
  const cases = []
  const notes = []

  // 乖总：逐有效表块逐列（表账不依赖数言，无声也判）
  let i = 0
  while (i < lines.length) {
    if (isTableLine(lines[i])) {
      const tlines = collectTableLines(lines, i)
      const t = parseTable(tlines)
      if (t.valid && !t.skip) {
        for (let c = 0; c < t.cols; c++) {
          const tv = parseIntCell(t.total.cells[c])
          if (tv === null) continue
          let ok = true
          let sum = 0
          for (const dr of t.dataRows) {
            const v = parseIntCell(dr.cells[c])
            if (v === null) {
              ok = false
              break
            }
            sum += v
          }
          if (ok && sum !== tv) {
            cases.push({ type: '乖总', line: t.total.line, col: c + 1, said: tv, sum, fp: djb2(t.total.text) })
          }
        }
      }
      i += tlines.length
    } else {
      i += 1
    }
  }

  // 乖列 / 阙列：逐数言（非列非表行才生言）
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (!line.trim() || isListLine(line) || isTableLine(line)) continue
    for (const claim of claimsOf(line)) {
      let blk = scanBlock(lines, li, claim.dir === 'up' ? -1 : 1)
      if (!blk && claim.dir === 'any') blk = scanBlock(lines, li, -1) // 无向先下后上
      let m = null
      if (blk && blk.kind === 'list') m = collectList(lines, runTop(lines, blk.start))
      else if (blk) {
        m = claimTableRows(collectTableLines(lines, runTop(lines, blk.start)))
      }
      if (m === null) {
        notes.push({ type: '阙列', line: li + 1, said: claim.n })
        continue
      }
      if (m !== claim.n) {
        cases.push({ type: '乖列', line: li + 1, said: claim.n, act: m, fp: djb2(line) })
      }
    }
  }

  // 倒期：逐行逐处（全部行受审——排期常落在列行上）
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (!line.trim()) continue
    for (const m of line.matchAll(DATE_RE)) {
      const a = m[1]
      const b = m[2]
      if (!calOk(a) || !calOk(b)) continue
      if (a > b) cases.push({ type: '倒期', line: li + 1, from: a, to: b, fp: djb2(line) })
    }
  }

  return { cases, notes, rows: lines.filter((s) => s.trim()).length }
}

/** 记一笔调用（唯一写入口）。 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, content = null }) {
  engine.calls.push({ session, ref, name, args, isError, content })
  if (familyOf(name) !== 'write') return engine
  const key = objectKey(args, name)
  if (!key.startsWith('p:')) return engine
  if (isError === true) return engine // 失败的写没落盘
  const path = normalizePath(key.slice(2))
  const text = typeof args?.content === 'string' ? args.content : null
  if (text === null || text.length === 0) return engine // 无稿可审
  if (engine.cfg.excuse.some((g) => globMatch(path, g))) return engine // 瑕册免审（立案前）
  if (grounded(path)) return engine // 试场豁免（立案前）
  const res = auditContent(text)
  const prev = engine.drafts.get(path)
  const hadCases = prev ? prev.cases.length > 0 : false
  const notes = res.notes.slice()
  if (hadCases && res.cases.length === 0) notes.push({ type: '已磨' })
  engine.drafts.set(path, { rows: res.rows, cases: res.cases, notes }) // 末稿立撤：旧案全数换下
  engine.audited.paths.add(path)
  return engine
}

/** issues 行（锁死，docs/03 §10）：乖列 → 乖总 → 倒期 → 阙列 → 已磨 → 全净行。 */
export function issuesOf(engine) {
  const all = []
  for (const [path, d] of engine.drafts) {
    for (const c of d.cases) all.push({ path, ...c })
    for (const n of d.notes) all.push({ path, ...n })
  }
  const issues = []
  const emit = (type, fmt) => {
    for (const x of all) if (x.type === type) issues.push(fmt(x))
  }
  emit('乖列', (x) => `乖列：${x.path}:${x.line} 言 ${x.said} 实 ${x.act}（指纹 ${x.fp}）`)
  emit('乖总', (x) => `乖总：${x.path}:${x.line} 表第 ${x.col} 列 言 ${x.said} 和 ${x.sum}（指纹 ${x.fp}）`)
  emit('倒期', (x) => `倒期：${x.path}:${x.line} 起 ${x.from} 止 ${x.to}（指纹 ${x.fp}）`)
  emit('阙列', (x) => `注记：${x.path}:${x.line} 阙列（言 ${x.said} 无近列）`)
  emit('已磨', (x) => `注记：${x.path} 已磨（先瑕今净）`)
  if (issues.length === 0) {
    const rows = [...engine.drafts.values()].reduce((s, d) => s + d.rows, 0)
    issues.push(`卷皆净 ×${engine.drafts.size} 径 ${rows} 行 —— 言必有列，总必可加，期必不倒`)
  }
  return issues
}

/** 判定：瑕值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const counts = { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 }
  let rows = 0
  for (const d of engine.drafts.values()) {
    rows += d.rows
    for (const c of d.cases) {
      if (c.type === '乖列') counts.gl++
      else if (c.type === '乖总') counts.gz++
      else if (c.type === '倒期') counts.dq++
    }
    for (const n of d.notes) {
      if (n.type === '阙列') counts.que++
      else if (n.type === '已磨') counts.mo++
    }
  }
  const cases = []
  const notes = []
  for (const [path, d] of engine.drafts) {
    for (const c of d.cases) cases.push({ path, ...c })
    for (const n of d.notes) notes.push({ path, ...n })
  }

  const score = {
    lie: Math.min(60, 30 * counts.gl),
    zong: Math.min(60, 30 * counts.gz),
    dao: Math.min(40, 15 * counts.dq),
  }
  score.total = Math.min(100, score.lie + score.zong + score.dao)

  const band = bandOf(score.total)
  const verdict = score.total >= gate ? 'fail' : 'pass'

  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    paths: engine.drafts.size,
    rows,
    counts,
    score,
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    issues: issuesOf(engine),
    cases,
    notes,
  }
}
