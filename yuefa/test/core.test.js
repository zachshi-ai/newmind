/**
 * 核心判定语义测试 —— 断言恰好 docs/04 A1 锁死的分值与案名（实现与手算冲突时改实现）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath } from '../src/core/object.js'
import { surfaceOf, globMatch, hasVoice } from '../src/core/mianxing.js'
import { createEngine, recordCall, judge, settleAll, bandOf, GATE_DEFAULT } from '../src/core/yueyin.js'
import { emptyBook, parseBook, registerEntry, revokeEntry, serializeBook, bookCount } from '../src/core/yuece.js'
import { renderYuepai } from '../src/core/yuepai.js'
import { auditStreams } from '../src/core/audit.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (n) => readFileSync(join(here, '..', 'fixtures', n), 'utf8')

const V1 = 'export function parseConfig() {}\nexport function formatDate() {}\nexport const VERSION = "1"\n'
const V2 = 'export function parseConfig() {}\nexport const VERSION = "1"\n'
const V3 = 'export function parseConfig() {}\n'
const V1E = 'export function parseConfig() {}\nexport function formatDate() {}\nexport const VERSION = "1"\nexport function formatTime() {}\n'

const call = (name, args, { isError = false, content = null, at = 0, id = 'c' } = {}) => ({ name, args, isError, content, at, id })

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

test('流解析：turn_start/principal 等非工具事件跳过', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"turn_start","id":"t1"}\n{"type":"principal","text":"主"}\n{"type":"turn_end","id":"t1"}\n'
  ))
  assert.equal(calls.length, 0)
})

// ---- 对象与径规整 -------------------------------------------------------------

test('对象键：path/file_path/notebook_path → p:，command → c:，其余 n:', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'read'), 'p:a.js')
  assert.equal(objectKey({ file_path: 'b.ts' }, 'read'), 'p:b.ts')
  assert.equal(objectKey({ command: ' ls -la ' }, 'bash'), 'c:ls -la')
  assert.equal(objectKey({ query: 'x' }, 'grep'), 'n:grep')
})

test('径规整：反斜杠归正、剥 ./ 前缀与尾 /', () => {
  assert.equal(normalizePath('.\\src\\a.js\\'), 'src/a.js')
  assert.equal(normalizePath('./src/a.js'), 'src/a.js')
})

// ---- 约形（docs/03 §3）--------------------------------------------------------

test('约形：JS 行首形五式', () => {
  const s = surfaceOf(V1 + 'module.exports.helper = fn\nexports.other = fn')
  assert.ok(s.has('parseConfig') && s.has('formatDate') && s.has('VERSION') && s.has('helper') && s.has('other'))
  assert.equal(s.size, 5)
})

test('约形：花括号形 as 取后名、跨行、from 尾不染', () => {
  const s = surfaceOf('export function keepOne() {}\nexport {\n  dropMe,\n  keepTwo as renamed,\n} from \'./x\'\n')
  assert.deepEqual([...s].sort(), ['dropMe', 'keepOne', 'renamed'])
})

test('约形：Python def/class 与 _ 前缀不入面、__all__ 列举', () => {
  const s = surfaceOf('def load_cfg(source):\n    pass\n\nclass Parser:\n    pass\n\ndef _hidden():\n    pass\n\n__all__ = ["load_cfg", "_p", "run_it"]\n')
  assert.deepEqual([...s].sort(), ['Parser', 'load_cfg', 'run_it'])
})

test('约形：Go 首字母大写与 receiver 形；小写不入面', () => {
  const s = surfaceOf('func LoadCfg() {}\nfunc (r *Reader) Read() {}\nfunc helper() {}\ntype Writer interface {}\n')
  assert.deepEqual([...s].sort(), ['LoadCfg', 'Read', 'Writer'])
})

test('约形：Rust 裸 pub 收、pub(crate) 限域不收', () => {
  const s = surfaceOf('pub fn run() {}\npub struct Item;\npub(crate) fn inner() {}\nfn private_fn() {}\n')
  assert.deepEqual([...s].sort(), ['Item', 'run'])
})

test('约形：册 forms 增形生效、noDefaults 关默认表、约外不治', () => {
  const forms = ['^\\s*export\\s+hook\\s+(?<name>\\w+)']
  assert.deepEqual([...surfaceOf('export hook myHook\n', { forms })], ['myHook'])
  assert.deepEqual([...surfaceOf('export const X = 1\n', { forms })].sort(), ['X']) // 默认表与增形并用
  const only = surfaceOf('export const X = 1\nexport hook myHook\n', { forms, noDefaults: true })
  assert.deepEqual([...only], ['myHook'])
  assert.equal(surfaceOf('// export function notReal() {}\n').size, 0) // 行中散文不治
})

// ---- 约据通道（docs/03 §2）----------------------------------------------------

function run_(calls, book = null) {
  const engine = createEngine({ book })
  for (const c of calls) recordCall(engine, { session: 's', ref: c.id, name: c.name, args: c.args, isError: c.isError, content: c.content })
  return engine
}

test('约据唯二：读据立约、写据受判、exec 黑盒不生据不生痕', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('bash', { command: 'sed -i d a.js' }),
    call('write', { path: 'a.js', content: V2 }),
  ])
  const grips = e.grips.get('a.js')
  assert.equal(grips.length, 2)
  assert.equal(grips[0].kind, 'read')
  assert.equal(grips[1].kind, 'write')
  assert.deepEqual([...grips[1].surface].sort(), ['VERSION', 'parseConfig'])
})

test('入口滤：isError=true 不生据也不生痕（失败的写没落盘）', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: V2 }, { isError: true }),
  ])
  assert.equal(e.grips.get('a.js').length, 1)
  assert.equal((e.marks.get('a.js') ?? []).length, 0)
})

test('无文之写只留痕；受审径含痕径；isError 未知（null）按已发生', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('edit', { path: 'a.js' }),
    call('write', { path: 'a.js', content: V2 }, { isError: null }),
  ])
  assert.equal(e.grips.get('a.js').length, 2)
  assert.equal(e.marks.get('a.js').length, 1)
})

// ---- 判定序（docs/03 §4）------------------------------------------------------

test('无约静默：无前置读的写不判（首笔落卷与盲写皆无约）', () => {
  const e = run_([
    call('write', { path: 'a.js', content: V1 }),
    call('write', { path: 'a.js', content: V2 }),
  ])
  assert.deepEqual(settleAll(e).findings, [])
})

test('读据永不受判；读后等面重写守约静默', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: V1 }),
  ])
  assert.deepEqual(settleAll(e).findings, [])
})

test('哑削：读 U1 写 U2 削 1 名 +30 单名即红', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: V2 }),
  ])
  const { findings } = settleAll(e)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].type, '哑削')
  assert.deepEqual(findings[0].names, ['formatDate'])
  assert.equal(findings[0].total, 3)
  const j = judge(e)
  assert.equal(j.cases.ya, 1)
  assert.equal(j.score.total, 30)
  assert.equal(j.verdict, 'fail') // 单哑削名即红（杀人者死）
})

test('展约不判：只增不减（读 U1 写 U1E）静默', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: V1E }),
  ])
  assert.deepEqual(settleAll(e).findings, [])
})

test('世据折旧：m 折旧后保持者静默（他人已削，本笔只保持）', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: V2 }),
    call('write', { path: 'a.js', content: V2 }),
  ])
  const { findings } = settleAll(e)
  assert.equal(findings.length, 1) // 唯 j1 立案；j2 经折旧静默
  assert.deepEqual(findings[0].names, ['formatDate'])
})

test('世据折旧等文写据照取：面等则折旧无效果（数学等价）', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: V1 }), // 等文写据：m=U1，折旧自然无效果
    call('write', { path: 'a.js', content: V2 }),
  ])
  const { findings } = settleAll(e)
  assert.equal(findings.length, 1)
  assert.deepEqual(findings[0].names, ['formatDate'])
})

test('逐笔立案：读 U1 写 U2 写 U3 两案两名 60 cap', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: V2 }),
    call('write', { path: 'a.js', content: V3 }),
  ])
  const { findings } = settleAll(e)
  assert.equal(findings.length, 2)
  assert.deepEqual(findings.map((f) => f.names), [['formatDate'], ['VERSION']])
  const j = judge(e)
  assert.equal(j.cases.ya, 2)
  assert.equal(j.score.total, 60) // min(60, 60) cap
})

test('约改不判：约据与落笔间有无文之痕判定不及', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('edit', { path: 'a.js' }),
    call('write', { path: 'a.js', content: V2 }),
  ])
  const { findings } = settleAll(e)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].type, '约改')
  assert.equal(findings[0].gap, 1)
  const j = judge(e)
  assert.equal(j.cases.gai, 1)
  assert.equal(j.score.total, 0)
})

test('削名跨多径各自立案；read 不受判', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('read', { path: 'b.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: V2 }),
    call('write', { path: 'b.js', content: V2 }),
  ])
  const j = judge(e)
  assert.equal(j.cases.ya, 2)
  assert.equal(j.paths, 2)
})

// ---- 明削声（docs/03 §3.4）----------------------------------------------------

test('明削：弃词与名同行共现赦为明削 0 分', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: V2 + '// @deprecated formatDate: removed, use calendar\n' }),
  ])
  const j = judge(e)
  assert.deepEqual(j.cases, { ya: 0, ming: 1, gai: 0 })
  assert.equal(j.score.total, 0)
  assert.match(j.issues[0], /明削：a\.js（削 formatDate——声在码中）/)
})

test('明削词界：跨行注记不赦（宁严一格）；中文弃词同行赦', () => {
  assert.equal(hasVoice(V2 + '// deprecated stuff elsewhere\n', 'formatDate'), false)
  assert.equal(hasVoice('// 移除 formatDate，改用 calendar\n', 'formatDate'), true)
  assert.equal(hasVoice('// removed the deprecated helper\n', 'formatDate'), false) // 名不同行不赦
})

// ---- 削值与门禁（docs/03 §6）--------------------------------------------------

test('削值公式与分带：min(60,30×哑削名)，坚/渝/背', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: 'export function loadData() {}\n' }), // 削 3 名 → 90 → cap 60
  ])
  const j = judge(e)
  assert.deepEqual(j.cases, { ya: 3, ming: 0, gai: 0 })
  assert.equal(j.score.total, 60)
  assert.equal(j.band, '背')
  assert.equal(bandOf(0), '坚')
  assert.equal(bandOf(15), '渝')
  assert.equal(bandOf(29), '渝')
  assert.equal(bandOf(30), '背')
})

test('门禁参数：默认 30；judge 幂等（重放同流必得同判词）', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: V2 }),
  ])
  assert.equal(judge(e).verdict, 'fail')
  assert.equal(judge(e, { gate: 100 }).verdict, 'pass')
  assert.equal(judge(e, { gate: GATE_DEFAULT }).verdict, judge(e).verdict)
  const a = judge(e)
  const b = judge(e)
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b)) // 纯函数重放同判词
})

// ---- 约册（docs/03 §5）--------------------------------------------------------

test('约册：parse/register/revoke/serialize 往返，无册=全账', () => {
  const book = parseBook(fx('yuefa-book.json'))
  assert.deepEqual(book.allow, ['legacy/*'])
  assert.equal(book.noDefaults, false)
  registerEntry(book, 'vendor/**')
  registerEntry(book, 'vendor/**') // 去重
  assert.deepEqual(book.allow, ['legacy/*', 'vendor/**'])
  assert.equal(bookCount(book), 2)
  assert.throws(() => revokeEntry(book, 'other/*'), /无此许削径/)
  revokeEntry(book, 'vendor/**')
  const round = parseBook(serializeBook(book))
  assert.deepEqual(round.allow, ['legacy/*'])
  assert.throws(() => parseBook('not-json'), /合法 JSON/)
  assert.throws(() => parseBook('[1]'), /须为对象/)
  assert.deepEqual(emptyBook(), { version: 1, allow: [], forms: [], noDefaults: false })
})

test('约册 allow 立案前免账：命中径不入账', () => {
  const e = run_([
    call('read', { path: 'legacy/util.js' }, { content: 'export function legacyFnA() {}\nexport function legacyFnB() {}\n' }),
    call('write', { path: 'legacy/util.js', content: 'export function legacyFnA() {}\n' }),
  ], { version: 1, allow: ['legacy/*'] })
  assert.equal(e.grips.size, 0)
  const j = judge(e)
  assert.equal(j.paths, 0)
  assert.equal(j.score.total, 0)
})

test('globMatch：* 跨目录通配、无 * 逐字相等', () => {
  assert.equal(globMatch('legacy/util.js', 'legacy/*'), true)
  assert.equal(globMatch('a/legacy/util.js', 'legacy/*'), true) // 尾部匹配
  assert.equal(globMatch('src/util.js', 'src/util.js'), true)
  assert.equal(globMatch('src/other.js', 'src/util.js'), false)
})

// ---- 行序与约牌（docs/03 §7/§8）-----------------------------------------------

test('issues 行序锁死：哑削 → 明削 → 约改 → 全坚', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('edit', { path: 'a.js' }),
    call('write', { path: 'a.js', content: V2 + '// @deprecated b\n' }),
  ])
  const j = judge(e)
  assert.equal(j.issues[0].startsWith('约改'), true)
  const e2 = run_([call('read', { path: 'z.js' }, { content: V1 })])
  assert.match(judge(e2).issues[0], /^约皆坚 ×1 —— 面各有其名，不作背约之削$/)
})

test('约牌块：公示与点名、掩码（行原文不进块）、无册确定性文本', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1 }),
    call('write', { path: 'a.js', content: V2 }),
  ])
  const j = judge(e)
  const text = renderYuepai({ version: 1, allow: ['legacy/*'] }, j)
  assert.match(text, /【约法 · 约牌】/)
  assert.match(text, /约册：许削 1 处（legacy\/\*）/)
  assert.match(text, /案账：哑削 1 名 · 明削 0 名 · 约改 0/)
  assert.match(text, /哑削：a\.js（削 formatDate——公面 3 失 1）/)
  assert.ok(!text.includes('export function')) // 行原文不进约牌
  const bare = renderYuepai(null, { cases: { ya: 0, ming: 0, gai: 0 }, findings: [], issues: ['约皆坚 ×0 —— 面各有其名，不作背约之削'] })
  assert.match(bare, /约册：未立（凡削皆记）/)
})

// ---- 合审与夹具 ----------------------------------------------------------------

test('合审序：全 at 有数按 (at,流序,流内序) 归并；读据不分会话', () => {
  const a = [
    JSON.stringify({ type: 'tool_call', id: 'a1', name: 'read', args: { path: 'x.js' }, at: 100 }),
    JSON.stringify({ type: 'tool_result', id: 'a1', name: 'read', isError: false, at: 101, content: V1 }),
    JSON.stringify({ type: 'tool_call', id: 'a2', name: 'write', args: { path: 'x.js', content: V2 }, at: 300 }),
    JSON.stringify({ type: 'tool_result', id: 'a2', name: 'write', isError: false, at: 301 }),
  ].join('\n')
  const b = [
    JSON.stringify({ type: 'tool_call', id: 'b1', name: 'write', args: { path: 'x.js', content: V3 }, at: 200 }),
    JSON.stringify({ type: 'tool_result', id: 'b1', name: 'write', isError: false, at: 201 }),
  ].join('\n')
  const r = auditStreams([{ name: 'a.jsonl', text: a }, { name: 'b.jsonl', text: b }])
  assert.equal(r.sessions, 2)
  // at 归并：a 读@100 → b 写@200（削 VERSION）→ a 写@300（折旧后削 formatDate）
  assert.deepEqual(r.cases, { ya: 2, ming: 0, gai: 0 })
  assert.equal(r.score.total, 60)
  assert.throws(() => auditStreams([{ name: 's.jsonl', text: a }, { name: 's.jsonl', text: a }]), /撞名/)
})

test('夹具全量：十三口径逐夹具断言恰好手算分值', () => {
  const book = parseBook(fx('yuefa-book.json'))
  const expect = [
    ['clean-stream', { ya: 0, ming: 0, gai: 0 }, 0, '坚', 0, 1],
    ['zhanwo-stream', { ya: 0, ming: 0, gai: 0 }, 0, '坚', 0, 1],
    ['xiaojian-stream', { ya: 1, ming: 0, gai: 0 }, 30, '背', 1, 1],
    ['mingxiao-stream', { ya: 0, ming: 1, gai: 0 }, 0, '坚', 0, 1],
    ['zhujian-stream', { ya: 2, ming: 0, gai: 0 }, 60, '背', 1, 1],
    ['baochi-stream', { ya: 1, ming: 0, gai: 0 }, 30, '背', 1, 1],
    ['geyue-stream', { ya: 0, ming: 0, gai: 1 }, 0, '坚', 0, 1],
    ['wuyue-stream', { ya: 0, ming: 0, gai: 0 }, 0, '坚', 0, 1],
    ['quanxie-stream', { ya: 3, ming: 0, gai: 0 }, 60, '背', 1, 1],
    ['xuyue-stream', { ya: 0, ming: 0, gai: 0 }, 0, '坚', 0, 0], // 带册：受审径 0
    ['duoyan-stream', { ya: 1, ming: 0, gai: 0 }, 30, '背', 1, 1],
    ['huakuo-stream', { ya: 1, ming: 0, gai: 0 }, 30, '背', 1, 1],
  ]
  for (const [name, cases, total, band, verdict, paths] of expect) {
    const r = auditStreams([{ name, text: fx(name + '.jsonl') }], { book })
    assert.deepEqual(r.cases, cases, name)
    assert.equal(r.score.total, total, name)
    assert.equal(r.band, band, name)
    assert.equal(r.ok, verdict === 0, name)
    assert.equal(r.paths, paths, name)
  }
  // xuyue 无册对照：哑削 1 名 30 背
  const bare = auditStreams([{ name: 'xuyue-stream', text: fx('xuyue-stream.jsonl') }])
  assert.deepEqual(bare.cases, { ya: 1, ming: 0, gai: 0 })
  assert.equal(bare.score.total, 30)
})

test('judge 幂等：同引擎两次 judge 深度全等；seq 只数入账事件', () => {
  const e = run_([
    call('read', { path: 'a.js' }, { content: V1, at: 1 }),
    call('bash', { command: 'ls' }, { at: 2 }),
    call('write', { path: 'a.js', content: V2 }, { at: 3 }),
    call('edit', { path: 'a.js' }, { at: 4 }),
    call('read', { path: 'a.js' }, { content: V1, at: 5 }),
  ])
  assert.equal(e.seq, 4) // 读+写+痕+读 = 4；exec 黑盒不占 seq
  assert.deepEqual(JSON.stringify(judge(e)), JSON.stringify(judge(e)))
})
