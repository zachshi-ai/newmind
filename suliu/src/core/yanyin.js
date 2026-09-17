/**
 * 验因引擎 —— 因账记流内之验、诊面稿入因账、臆值判定（docs/03 §2/§8/§9/§10 锁死），
 * 全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流合审把所有会话的调用记进同一引擎（归并序见 audit.js）；
 * 插件只记本会话——单会话视图（跨会话验因证据互认归离线合并审计）。
 *
 * 通道（docs/03 §2）：因账收全流（验因要 write/observe/exec 三面）；判归因只判写——
 * write 族 p: ∧ isError !== true ∧ content 非空 ∧ 规整径命中诊面形；isError === true
 * 之写不入稿账（失败的写没落盘）、null 按已发生；observe/exec/other 永不判归因。
 * 无 content 之写（edit 族）无稿可判。诊面外之稿不审不记。
 *
 * 稿账：同径新写立稿（判词在 judge 时按当时全流验因现算——迟验是「拔验在后于本笔」，
 * 此为 docs/03 §8 的判定语义：拔验在后只留注记，勘验重演在后不采——望不洗臆）。
 *
 * 豁免（立案前）：臆册 excuse glob ∪ 演域名段 → 整稿不审不记。
 *
 * 判定序（docs/03 §9）：逐行——归因形 → 推词门（显疑注记）→ 因面前缀指代 / 词元空
 * （泛因注记）→ 验因三通道（拔验清白 / 迟验注记 / 望断 +15 / 臆断 +30；每行至多一案）。
 *
 * 臆值（docs/03 §10）：yi=min(60,30×臆断)+wang=min(40,15×望断)，total=min(100)；
 * 分带 澈 0–14 / 望 15–29 / 臆 ≥30；门默认 30——单臆断即红、双望断即红、单望断黄牌不咬门。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import { globMatch } from './yice.js'
import { isZhenmian, findGuiyin, hasTui, isZhidaiQianzhui, hasGuo, tokensOf, extractYinmian, djb2 } from './guiyin.js'

export const GATE_DEFAULT = 30

export function bandOf(total) {
  if (total < 15) return '澈'
  if (total < 30) return '望'
  return '臆'
}

/** 演域名段（docs/03 §2，稿径含名段即豁免，立案前）：正则形 13（目录段在径首亦算段）。 */
const RANGE_FORMS = [
  /(?:^|\/)tests?\//,
  /(?:^|\/)specs?\//,
  /(?:^|\/)__tests__\//,
  /(?:^|\/)__mocks__\//,
  /(?:^|\/)fixtures\//,
  /(?:^|\/)scratch\//,
  /(?:^|\/)drafts?\//,
  /(?:^|\/)wip\//,
  /(?:^|\/)sandbox\//,
  /(?:^|\/)demos?\//,
  /(?:^|\/)notes?\//,
  /\.test\./,
  /\.spec\./,
]

function inRange(path) {
  return RANGE_FORMS.some((re) => re.test(path))
}

/** 引擎装配：臆册（免审）→ 因账。无册（null）→ excuse 为空——无册照判（凡因必验）。 */
export function createEngine({ book = null } = {}) {
  return {
    cfg: {
      excuse: (book?.excuse ?? []).map((g) => String(g)),
    },
    calls: [], // 全流调用（验因之源），record 序即流序
    drafts: new Map(), // 规整稿径 → { lines, rows, writeIndex }（同径最近带文之写）
  }
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
  if (text === null || text.length === 0) return engine // 无稿可判
  if (engine.cfg.excuse.some((g) => globMatch(path, g))) return engine // 臆册免审（立案前）
  if (inRange(path)) return engine // 演域豁免（立案前）
  if (!isZhenmian(path)) return engine // 诊面门：非诊断文书不审不记
  const lines = String(text).split(/\r?\n/)
  engine.drafts.set(path, {
    lines,
    rows: lines.filter((s) => s.trim()).length,
    writeIndex: engine.calls.length - 1, // 本笔在流内的序（验因先于本笔为据）
  }) // 新稿立撤：同径旧稿换下
  return engine
}

/** 单调用词面（动因/验果的查证面）：write 径+content；observe content；exec 命令+content。 */
function surfaceOf(c) {
  const fam = familyOf(c.name)
  const key = objectKey(c.args, c.name)
  const parts = []
  if (key.startsWith('p:')) parts.push(normalizePath(key.slice(2)))
  else if (key.startsWith('c:')) parts.push(key.slice(2))
  if (typeof c.content === 'string' && c.content.length > 0) parts.push(c.content)
  return { fam, key, text: parts.join('\n') }
}

function hitsToken(text, tokens) {
  return tokens.some((t) => text.includes(t))
}

/**
 * 验因对账（docs/03 §8）：证据只认流内序 < writeIndex 的调用；返回
 *   'bay'   拔验清白（动因 write 在先 ∧ 其后成功 exec 验果，皆 < writeIndex）
 *   'chi'   迟验（拔验对全在本笔之后——先断言后补的干预验证，0 分注记）
 *   'wang'  望档（重演 ≥2 笔 ∪ 勘验在场——看过≠验过）
 *   'none'  全无（臆断）
 * 失败之见不是见：isError===true 的 observe/write 永不生勘验/拔验；
 * exec 的成败只影响勘验/拔验——重演专认败相（成败皆算，果词 × 因面同笔）。
 */
function evidenceOf(engine, tokens, writeIndex) {
  let bay = false
  let chi = false
  let zhong = 0
  let kan = false
  for (let j = 0; j < engine.calls.length; j++) {
    const c = engine.calls[j]
    const { fam, key, text } = surfaceOf(c)
    if (fam === 'write') {
      if (c.isError !== true && key.startsWith('p:') && hitsToken(text, tokens)) {
        if (j < writeIndex) {
          // 动因笔在先：找其后、本笔之前的成功验果 exec
          for (let k = j + 1; k < writeIndex; k++) {
            const e = engine.calls[k]
            if (familyOf(e.name) !== 'exec' || e.isError === true) continue
            if (hitsToken(surfaceOf(e).text, tokens)) {
              bay = true
              break
            }
          }
          if (bay) return 'bay'
        } else if (j > writeIndex) {
          // 动因笔在后：其后任一成功 exec 验果 → 迟验（勘验重演在后不采）
          for (let k = j + 1; k < engine.calls.length; k++) {
            const e = engine.calls[k]
            if (familyOf(e.name) !== 'exec' || e.isError === true) continue
            if (hitsToken(surfaceOf(e).text, tokens)) {
              chi = true
              break
            }
          }
        }
      }
    } else if (fam === 'exec') {
      if (j < writeIndex && hitsToken(text, tokens)) {
        if (hasGuo(text)) zhong++
        if (c.isError !== true) kan = true
      }
    } else if (fam === 'observe') {
      if (j < writeIndex && c.isError !== true && typeof c.content === 'string' && c.content.length > 0 && hitsToken(c.content, tokens)) {
        kan = true
      }
    }
  }
  if (chi) return 'chi'
  if (zhong >= 2 || kan) return 'wang'
  return 'none'
}

/** 单稿判定（docs/03 §9 判定序）。返回 { cases, notes }。 */
export function auditDraft(engine, path, draft) {
  const cases = []
  const notes = []
  for (let li = 0; li < draft.lines.length; li++) {
    const line = draft.lines[li]
    if (!line.trim()) continue
    const hit = findGuiyin(line)
    if (!hit) continue // 无归因形——不是因果断言
    if (hasTui(line)) {
      notes.push({ type: '显疑', line: li + 1 }) // 疑而后言者——留痕不入罪
      continue
    }
    const yinmian = extractYinmian(line, hit)
    if (isZhidaiQianzhui(yinmian)) {
      notes.push({ type: '泛因', line: li + 1 }) // 因之无物——无从对账（宁纵）
      continue
    }
    const tokens = tokensOf(yinmian)
    if (tokens.length === 0) {
      notes.push({ type: '泛因', line: li + 1 })
      continue
    }
    const ev = evidenceOf(engine, tokens, draft.writeIndex)
    if (ev === 'bay') continue // 拔验清白（动因验果，皆在断言先）
    if (ev === 'chi') notes.push({ type: '迟验', line: li + 1 }) // 补的是溯，不算枉
    else if (ev === 'wang') cases.push({ type: '望断', line: li + 1, fp: djb2(line) })
    else cases.push({ type: '臆断', line: li + 1, fp: djb2(line) })
  }
  return { cases, notes }
}

/** issues 行（锁死，docs/03 §9/§12）：案按 稿径→行→案别，注记排其后（显疑 → 迟验 → 泛因）。 */
export function issuesOf(engine) {
  const cases = []
  const notes = []
  let rows = 0
  for (const [path, d] of engine.drafts) {
    rows += d.rows
    const res = auditDraft(engine, path, d)
    for (const c of res.cases) cases.push({ path, ...c })
    for (const n of res.notes) notes.push({ path, ...n })
  }
  const rank = { 臆断: 0, 望断: 1 }
  const nrank = { 显疑: 0, 迟验: 1, 泛因: 2 }
  cases.sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    if (a.line !== b.line) return a.line - b.line
    if (rank[a.type] !== rank[b.type]) return rank[a.type] - rank[b.type]
    return 0
  })
  notes.sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    if (a.line !== b.line) return a.line - b.line
    if (nrank[a.type] !== nrank[b.type]) return nrank[a.type] - nrank[b.type]
    return 0
  })
  const issues = []
  for (const c of cases) {
    issues.push(`${c.type}：${c.path}:${c.line}（指纹 ${c.fp}）`)
  }
  for (const n of notes) {
    if (n.type === '显疑') issues.push(`注记：${n.path}:${n.line} 显疑（推词在场）`)
    else if (n.type === '迟验') issues.push(`注记：${n.path}:${n.line} 迟验（拔验在后）`)
    else issues.push(`注记：${n.path}:${n.line} 泛因（因之无物）`)
  }
  if (issues.length === 0) {
    issues.push(`因皆有验 ×${engine.drafts.size} 稿 ${rows} 行 —— 凡因必验，动因验果`)
  }
  return { issues, rows }
}

/** 判定：臆值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const counts = { yd: 0, wd: 0, xy: 0, cy: 0, fy: 0 }
  const cases = []
  const notes = []
  let rows = 0
  for (const [path, d] of engine.drafts) {
    rows += d.rows
    const res = auditDraft(engine, path, d)
    for (const c of res.cases) {
      cases.push({ path, ...c })
      if (c.type === '臆断') counts.yd++
      else counts.wd++
    }
    for (const n of res.notes) {
      notes.push({ path, ...n })
      if (n.type === '显疑') counts.xy++
      else if (n.type === '迟验') counts.cy++
      else counts.fy++
    }
  }
  const score = {
    yi: Math.min(60, 30 * counts.yd),
    wang: Math.min(40, 15 * counts.wd),
  }
  score.total = Math.min(100, score.yi + score.wang)
  const band = bandOf(score.total)
  const verdict = score.total >= gate ? 'fail' : 'pass'
  const issued = issuesOf(engine)
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
    issues: issued.issues,
    cases,
    notes,
  }
}
