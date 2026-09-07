/**
 * 核心判定语义测试 —— 断言恰好 docs/04 A1 锁死的分值与案名（实现与手算冲突时改实现）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath } from '../src/core/object.js'
import { lineSet, globMatch } from '../src/core/sanxu.js'
import { createEngine, recordCall, judge, settleAll, bandOf, GATE_DEFAULT } from '../src/core/juzhang.js'
import { emptyBook, parseBook, registerEntry, revokeEntry, serializeBook, bookCount } from '../src/core/shuice.js'
import { renderShuipai } from '../src/core/shuipai.js'
import { auditStreams } from '../src/core/audit.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (n) => readFileSync(join(here, '..', 'fixtures', n), 'utf8')

const V1 = 'const a = 1\nconst b = 2\nconst c = 3\n'
const V2 = 'const a = 1\nconst d = 4\n'
const V2S = 'const a = 1\nconst c = 3\nconst d = 4\n'
const V3 = 'const a = 1\nconst b = 2\nconst c = 3\nconst e = 5\n'
const V2E = 'const a = 1\nconst d = 4\nconst e = 5\n'

// ---- 流解析 -----------------------------------------------------------------

test('流解析：# 注释与空行跳过、坏行报行号', () => {
  const events = parseStream('# 注释\n\n{"type":"tool_call","id":"c1","name":"read","args":{},"at":1}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"ok":1}\nnot-json\n'), /第 2 行/)
})

test('流解析：id 配对回填 result 的 isError/content', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"c1","name":"read","args":{"path":"a.js"}}\n' +
    '{"type":"tool_result","id":"c1","name":"read","isError":false,"content":"x\\n"}\n'
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
  assert.equal(calls[0].content, 'x\n')
})

test('流解析：孤儿 result 独立建档，无 id result 并入紧邻 call', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_result","id":"z9","name":"read","isError":true}\n' +
    '{"type":"tool_call","name":"bash","args":{"command":"ls"}}\n' +
    '{"type":"tool_result","name":"bash","isError":false}\n'
  ))
  assert.equal(calls.length, 2)
  assert.equal(calls[0].ref, 'z9')
  assert.equal(calls[0].isError, true)
  assert.equal(calls[1].ref, null)
  assert.equal(calls[1].isError, false)
})

test('流解析：turn_start/turn_end/principal 等非工具事件跳过', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"turn_start","id":"t1"}\n{"type":"principal","text":"主"}\n{"type":"turn_end","id":"t1"}\n'
  ))
  assert.equal(calls.length, 0)
})

// ---- 对象与径规整 -----------------------------------------------------------

test('对象键：p:/c:/n: 按序取第一个命中', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'write'), 'p:a.js')
  assert.equal(objectKey({ command: ' ls ' }, 'bash'), 'c:ls')
  assert.equal(objectKey({ question: 'q' }, 'ask'), 'n:ask')
})

test('径规整：反斜杠归正、剥 ./ 前缀与尾斜杠（防同文件异写之诬）', () => {
  assert.equal(normalizePath('.\\a\\b.js'), 'a/b.js')
  assert.equal(normalizePath('./a/b/'), 'a/b')
  assert.equal(normalizePath('././a.js'), 'a.js')
  assert.equal(familyOf('NotebookEdit'), 'write')
  assert.equal(familyOf('WebFetch'), 'other')
})

// ---- 行集与 glob ------------------------------------------------------------

test('行集：切行 trim 弃空行去重', () => {
  const s = lineSet('a\n  a  \n\nb\r\n')
  assert.deepEqual([...s].sort(), ['a', 'b'])
})

test('globMatch：逐字相等 ∪ * 跨目录通配，正则元字符不逃逸', () => {
  assert.equal(globMatch('vendor/fix/src.js', 'vendor/*'), true)
  assert.equal(globMatch('src/a.js', 'vendor/*'), false)
  assert.equal(globMatch('src/a.js', 'src/a.js'), true)
  assert.equal(globMatch('a+b/c.js', 'a+b/*'), true)
})

// ---- 文据通道 ----------------------------------------------------------------

test('文据通道：读据/写据生文据，无文之写只生痕，失败之写全不入', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: null }) // 读而无文：无据
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'edit', args: { path: 'a.js' } }) // 无文之写：痕
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V3 }, isError: true }) // 失败：全不入
  assert.equal(e.grips.get('a.js').length, 2)
  assert.equal(e.marks.get('a.js').length, 1)
  assert.equal(e.seq, 3) // 失败之写不占 seq
})

test('文据通道：exec 是黑盒（不生据不生痕），isError 未知按已发生', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'bash', args: { command: "echo x > a.js" }, content: 'x' })
  assert.equal(e.grips.size, 0)
  assert.equal(e.marks.size, 0)
  recordCall(e, { session: 's', name: 'write', args: { path: 'b.js', content: V1 }, isError: null })
  assert.equal(e.grips.get('b.js').length, 1)
})

// ---- 三序判定 ----------------------------------------------------------------

test('三序：覆己（读 V1 写 V2 写 V3——陈线 2 新线 1）', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })
  const r = judge(e)
  assert.deepEqual(r.cases, { shi: 0, ji: 1, xian: 0, gai: 0 })
  assert.equal(r.score.total, 15)
  assert.equal(r.band, '滞')
  assert.equal(r.verdict, 'pass')
  assert.match(r.issues[0], /覆己：a\.js（seq 3 覆 seq 2——陈线 2 · 新线 1）/)
})

test('三序：写前重读则白（读 V1 写 V2 重读 V2 写 V2E）', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V2 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2E } })
  const r = judge(e)
  assert.deepEqual(r.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
  assert.equal(r.issues[0], '水皆活 ×1 —— 见新乃写，不作画水之记')
})

test('三序：失鲜（陈线 1 新线 1 只注记不改分）', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2S } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })
  const r = judge(e)
  assert.deepEqual(r.cases, { shi: 0, ji: 0, xian: 1, gai: 0 })
  assert.equal(r.score.total, 0)
  assert.match(r.issues[0], /失鲜：a\.js（seq 3——陈线 1 · 新线 1）/)
})

test('三序：初据无可覆（写 V1 写 V2——变写前无旧据，静默）', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V1 } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  const r = judge(e)
  assert.deepEqual(r.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
  assert.match(r.issues[0], /水皆活 ×1/)
})

test('三序：等文重写不判（世未变）', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V1 } })
  const r = judge(e)
  assert.deepEqual(r.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
})

test('三序：保新线不罚（并集式重写非覆）', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V1 + 'const d = 4\n' } }) // 复古 b,c 且保 d
  const r = judge(e)
  assert.deepEqual(r.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
})

test('三序：纯增之中变不判（陈线为空，净向）', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V1 + 'const x = 9\n' } }) // 纯添
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V1 } }) // 删回添行
  const r = judge(e)
  assert.deepEqual(r.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
})

test('三序：陈改不判两形（无变写看最后文据→j 窗；有变写看 m→j 窗）', () => {
  const e1 = createEngine({})
  recordCall(e1, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e1, { session: 's', name: 'edit', args: { path: 'a.js' } })
  recordCall(e1, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })
  const r1 = judge(e1)
  assert.deepEqual(r1.cases, { shi: 0, ji: 0, xian: 0, gai: 1 })
  assert.match(r1.issues[0], /陈改：a\.js（最近文据后无文之写 1 笔，判定不及）/)

  const e2 = createEngine({})
  recordCall(e2, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e2, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e2, { session: 's', name: 'edit', args: { path: 'a.js' } })
  recordCall(e2, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })
  const r2 = judge(e2)
  assert.deepEqual(r2.cases, { shi: 0, ji: 0, xian: 0, gai: 1 }) // 隔断先于覆案
})

test('三序：案前曾重读随案注记不改分', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: '旧窗口之文\n' }) // 重读但行集未含新线全景
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })
  const r = judge(e)
  assert.equal(r.cases.ji, 1)
  assert.match(r.issues[0], /案前曾重读/)
  assert.equal(r.score.total, 15)
})

test('三序：逐笔立案（一径两笔覆己两案 + 一失鲜，cap 后 30）', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })  // 案1：覆 (V1,V2)
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2S } }) // 失鲜：对 (V2,V3) 陈线1
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })  // 案2：覆 (V3,V2S)
  const r = judge(e)
  assert.equal(r.cases.ji, 2)
  assert.equal(r.cases.xian, 1)
  assert.equal(r.score.total, 30) // min(40, 15×2)
  assert.equal(r.verdict, 'fail')
})

test('三序：最近一对与等文跳过（等文重写夹中间不挡 k——世未变）', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } }) // 等文重写
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })
  const { findings } = settleAll(e)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].seq, 4)
  assert.equal(findings[0].mSeq, 3) // 变写取最近异文写据（等文重写也是写据）
  const j = findings[0]
  assert.equal(j.type, '覆己') // 旧据跳过等文写据取读 V1——世未变，谱系仍有效
  assert.equal(j.chen, 2)
  assert.equal(j.xin, 1)
})

// ---- 陈值门禁 ----------------------------------------------------------------

test('陈值门禁：覆世 30/案 cap 60（三案即 60）', () => {
  const e = createEngine({})
  for (const p of ['p1.js', 'p2.js', 'p3.js']) {
    recordCall(e, { session: 'sess-a', name: 'read', args: { path: p }, content: V1 })
    recordCall(e, { session: 'sess-b', name: 'write', args: { path: p, content: V2 } })
    recordCall(e, { session: 'sess-a', name: 'write', args: { path: p, content: V3 } })
  }
  const r = judge(e)
  assert.deepEqual(r.cases, { shi: 3, ji: 0, xian: 0, gai: 0 })
  assert.equal(r.score.shi, 60) // min(60, 30×3)
  assert.equal(r.score.total, 60)
  assert.equal(r.band, '腐')
})

test('陈值门禁：覆世须两会话（合审），单流恒覆己', () => {
  const e = createEngine({})
  recordCall(e, { session: 'sess-a', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 'sess-b', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 'sess-a', name: 'write', args: { path: 'a.js', content: V3 } })
  const r = judge(e)
  assert.deepEqual(r.cases, { shi: 1, ji: 0, xian: 0, gai: 0 })
  assert.equal(r.score.total, 30)
  assert.equal(r.band, '腐')
  assert.equal(r.verdict, 'fail')
})

test('陈值门禁：分带与门（活/滞/腐，默认门 30，自定义门翻转）', () => {
  assert.equal(bandOf(0), '活')
  assert.equal(bandOf(14), '活')
  assert.equal(bandOf(15), '滞')
  assert.equal(bandOf(29), '滞')
  assert.equal(bandOf(30), '腐')
  assert.equal(GATE_DEFAULT, 30)
  const e = createEngine({})
  recordCall(e, { session: 'a', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 'b', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 'a', name: 'write', args: { path: 'a.js', content: V3 } })
  assert.equal(judge(e, { gate: 30 }).verdict, 'fail')
  assert.equal(judge(e, { gate: 40 }).verdict, 'pass')
})

// ---- 水册 --------------------------------------------------------------------

test('水册：许复免账在立案前（径不入据账），无此径 revoke 报错', () => {
  const book = parseBook('{"version":1,"excuse":["vendor/*"]}')
  const e = createEngine({ book })
  recordCall(e, { session: 's', name: 'read', args: { path: 'vendor/fix/a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'vendor/fix/a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'vendor/fix/a.js', content: V3 } })
  const r = judge(e)
  assert.equal(r.paths, 0)
  assert.deepEqual(r.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })

  const b = emptyBook()
  registerEntry(b, 'legacy/*')
  registerEntry(b, 'legacy/*')
  assert.deepEqual(b.excuse, ['legacy/*'])
  assert.throws(() => revokeEntry(b, 'other/*'), /无此许复径/)
  revokeEntry(b, 'legacy/*')
  assert.equal(bookCount(b), 0)
  assert.equal(parseBook(serializeBook(b)).version, 1)
})

test('水册：无册 = 全账（空册同判），bad JSON 报错', () => {
  const e = createEngine({ book: null })
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })
  assert.equal(judge(e).cases.ji, 1)
  assert.throws(() => parseBook('nope'), /不是合法 JSON/)
})

// ---- 行序与水牌块 ------------------------------------------------------------

test('行序锁死：覆世 → 覆己 → 失鲜 → 陈改；全活行收尾', () => {
  const e = createEngine({})
  // 陈改径
  recordCall(e, { session: 's', name: 'read', args: { path: 'z.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'edit', args: { path: 'z.js' } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'z.js', content: V3 } })
  // 失鲜径
  recordCall(e, { session: 's', name: 'read', args: { path: 'm.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'm.js', content: V2S } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'm.js', content: V3 } })
  // 覆己径
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })
  const r = judge(e)
  assert.deepEqual(r.issues.map((l) => l.split('：')[0]), ['覆己', '失鲜', '陈改'])
})

test('水牌块：逐字节确定，不含行原文；无册出确定性文本', () => {
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })
  const judged = judge(e)
  const a = renderShuipai({ version: 1, excuse: [] }, judged)
  const b = renderShuipai({ version: 1, excuse: [] }, judge(e))
  assert.equal(a, b)
  assert.match(a, /【画水 · 水牌】/)
  assert.match(a, /水册：未立（凡覆皆记）/)
  assert.match(a, /覆己：a\.js（seq 3 覆 seq 2——陈线 2 · 新线 1）/)
  assert.ok(!a.includes('const b = 2')) // 行原文永不进水牌
  const empty = renderShuipai(null, { cases: { shi: 0, ji: 0, xian: 0, gai: 0 }, findings: [], issues: [] })
  assert.match(empty, /水册：未立（凡覆皆记）/)
})

// ---- 合审序 ------------------------------------------------------------------

test('合审序：全 at 有数按 (at, 流序, 流内序) 归并——覆世可见', () => {
  const res = auditStreams([
    { name: 'fushi-a-stream.jsonl', text: fx('fushi-a-stream.jsonl') },
    { name: 'fushi-b-stream.jsonl', text: fx('fushi-b-stream.jsonl') },
  ], {})
  assert.equal(res.sessions, 2)
  assert.deepEqual(res.cases, { shi: 1, ji: 0, xian: 0, gai: 0 })
  assert.equal(res.score.total, 30)
  assert.equal(res.verdict, 'fail')
})

test('合审序：缺 at 按参序拼接（审计方须自证流序——宁漏）', () => {
  const stripAt = (t) => t.split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => JSON.stringify({ ...JSON.parse(l), at: undefined })).join('\n')
  const res = auditStreams([
    { name: 'a.jsonl', text: stripAt(fx('fushi-a-stream.jsonl')) },
    { name: 'b.jsonl', text: stripAt(fx('fushi-b-stream.jsonl')) },
  ], {})
  assert.deepEqual(res.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
  assert.throws(() => auditStreams([{ name: 'x.jsonl', text: '{"ok":1}' }, { name: 'x.jsonl', text: '{"ok":1}' }], {}), /撞名/)
})

// ---- 夹具全量（A2 手算对表）----------------------------------------------------

test('夹具全量：十一夹具判词与手算逐字段一致', () => {
  const opt = { book: { version: 1, excuse: ['vendor/*'] } }
  const T = (name, extra = {}) => auditStreams([{ name: `${name}-stream.jsonl`, text: fx(`${name}-stream.jsonl`) }], { ...opt, ...extra })
  const clean = T('clean')
  assert.deepEqual(clean.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
  assert.equal(clean.score.total, 0)
  assert.equal(clean.band, '活')
  const fuji = T('fuji')
  assert.deepEqual(fuji.cases, { shi: 0, ji: 1, xian: 0, gai: 0 })
  assert.equal(fuji.score.total, 15)
  const shuangfu = T('shuangfu')
  assert.equal(shuangfu.score.total, 30)
  assert.equal(shuangfu.verdict, 'fail')
  const xufu = T('xufu')
  assert.deepEqual(xufu.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
  assert.equal(xufu.paths, 0)
  const xufuBare = auditStreams([{ name: 'x.jsonl', text: fx('xufu-stream.jsonl') }], {})
  assert.equal(xufuBare.cases.ji, 1)
  const fuxian = T('fuxian')
  assert.deepEqual(fuxian.cases, { shi: 0, ji: 0, xian: 1, gai: 0 })
  const chenbi = T('chenbi')
  assert.deepEqual(chenbi.cases, { shi: 0, ji: 0, xian: 0, gai: 1 })
  const dugrip = T('dugrip')
  assert.deepEqual(dugrip.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
  const shixie = T('shixie')
  assert.deepEqual(shixie.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
  const idem = T('idem')
  assert.deepEqual(idem.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
})

// ---- 幂等 --------------------------------------------------------------------

test('幂等：重放同流必得同判词（judge 不改引擎）', () => {
  const run = () => auditStreams([{ name: 'fuji-stream.jsonl', text: fx('fuji-stream.jsonl') }], {})
  assert.deepEqual(run(), run())
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'read', args: { path: 'a.js' }, content: V1 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V2 } })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a.js', content: V3 } })
  const a = judge(e)
  const b = judge(e)
  assert.deepEqual(a, b)
})

test('边界：audit 空条目抛错；据账全空出全活 ×0', () => {
  assert.throws(() => auditStreams([], {}), /至少一个会话流/)
  const e = createEngine({})
  recordCall(e, { session: 's', name: 'bash', args: { command: 'ls' }, content: 'x' })
  const r = judge(e)
  assert.equal(r.paths, 0)
  assert.equal(r.issues[0], '水皆活 ×0 —— 见新乃写，不作画水之记')
})

test('水册序列化：register/revoke 后 serializeBook → parseBook 往返一致', () => {
  const b = emptyBook()
  registerEntry(b, 'legacy/*')
  registerEntry(b, 'src/generated/**')
  revokeEntry(b, 'legacy/*')
  const back = parseBook(serializeBook(b))
  assert.deepEqual(back, { version: 1, excuse: ['src/generated/**'] })
})
