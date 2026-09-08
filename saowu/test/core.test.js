/**
 * 核心判定语义测试 —— 断言恰好 docs/04 A1 锁死的分值与案名（实现与手算冲突时改实现）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath } from '../src/core/object.js'
import { scanContent, globMatch, grounded } from '../src/core/gouxing.js'
import { createEngine, recordCall, judge, settleAll, bandOf, GATE_DEFAULT } from '../src/core/zhouzhai.js'
import { emptyBook, parseBook, registerEntry, revokeEntry, serializeBook, bookCount } from '../src/core/liuce.js'
import { renderZhoupai } from '../src/core/zhoupai.js'
import { auditStreams } from '../src/core/audit.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (n) => readFileSync(join(here, '..', 'fixtures', n), 'utf8')

const V1 = 'export function id(x) {\n  return x\n}\n'
const V2 = 'export function check(t) {\n  debugger;\n  return t\n}\n'
const V3 = 'export function check(t) {\n  console.log("DEBUG: token =", t)\n  return t\n}\n'

const call = (name, args, { isError = false, content = null, at = 0, id = 'c' } = {}) => ({ name, args, isError, content, at, id })

/** 单会话单流引擎判定（无册）。 */
function judgeOne(calls, { book = null } = {}) {
  const engine = createEngine({ book })
  for (const c of calls) recordCall(engine, { session: 's', ref: c.id, name: c.name, args: c.args, isError: c.isError, content: c.content })
  return judge(engine)
}

// ---- 流解析 -----------------------------------------------------------------

test('流解析：# 注释与空行跳过、坏行报行号', () => {
  const events = parseStream('# 注释\n\n{"type":"tool_call","id":"c1","name":"write","args":{},"at":1}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"ok":1}\nnot-json\n'), /第 2 行/)
})

test('流解析：id 配对回填 result 的 isError/content', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"a.js"}}\n' +
    '{"type":"tool_result","id":"c1","name":"write","isError":false,"content":"x\\n"}\n'
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

test('对象键：path/file_path/notebook_path → p:，command → c:，其余 n:；工具族四分', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'read'), 'p:a.js')
  assert.equal(objectKey({ file_path: 'b.ts' }, 'read'), 'p:b.ts')
  assert.equal(objectKey({ command: ' ls -la ' }, 'bash'), 'c:ls -la')
  assert.equal(objectKey({ query: 'x' }, 'grep'), 'n:grep')
  assert.equal(familyOf('str_replace_editor'), 'write')
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('read'), 'observe')
})

test('径规整：反斜杠归正、剥 ./ 前缀与尾 /', () => {
  assert.equal(normalizePath('.\\src\\a.js\\'), 'src/a.js')
  assert.equal(normalizePath('./src/a.js'), 'src/a.js')
})

// ---- 针形（docs/03 §3.1）------------------------------------------------------

test('针形：行首形命中（debugger / import pdb / from pdb import / byebug / set -x）', () => {
  const hits = scanContent('debugger;\nimport pdb\nfrom pdb import set_trace\nbyebug\nset -x\n')
  assert.deepEqual(hits.map((h) => [h.line, h.kind, h.name]), [
    [1, 'zhen', 'debugger'],
    [2, 'zhen', 'import_pdb'],
    [3, 'zhen', 'from_pdb'],
    [4, 'zhen', 'byebug'],
    [5, 'zhen', 'set_x'],
  ])
})

test('针形：缩进行首形与子串形命中（breakpoint( / set_trace / binding.pry / dbg!( / console.trace(）', () => {
  const hits = scanContent('  debugger;\n\tbreakpoint()\n  pdb.set_trace()\nbinding.pry\nlet y = dbg!(x)\nconsole.trace(ctx)\n')
  assert.deepEqual(hits.map((h) => [h.line, h.kind, h.name]), [
    [1, 'zhen', 'debugger'],
    [2, 'zhen', 'breakpoint'],
    [3, 'zhen', 'set_trace'],
    [4, 'zhen', 'binding'],
    [5, 'zhen', 'dbg'],
    [6, 'zhen', 'console_trace'],
  ])
})

test('针形：行首形注释不中（宁纵）——// debugger 与 # import pdb 不案', () => {
  const hits = scanContent('// debugger\n# import pdb\n// byebug\n')
  assert.equal(hits.length, 0)
})

test('针形：set -o xtrace 命中，行中 set 不中，裸 set 不中', () => {
  const hits = scanContent('set -o xtrace\necho "run set -x here"\nsetstate ok\n')
  assert.deepEqual(hits.map((h) => [h.line, h.name]), [[1, 'set_x']])
})

test('针形：大小写敏感与词界——Debugger 与 debuggers() 不案', () => {
  const hits = scanContent('Debugger;\ndebuggers()\nimport pdbgui\n')
  assert.equal(hits.length, 0)
})

test('针形：ipdb/pudb set_trace 与 binding.irb、remote_pry 同收', () => {
  const hits = scanContent('ipdb.set_trace()\npudb.set_trace()\nbinding.irb\nbinding.remote_pry\n')
  assert.deepEqual(hits.map((h) => h.name), ['set_trace', 'set_trace', 'binding', 'binding'])
})

// ---- 屑形（docs/03 §3.2）------------------------------------------------------

test('屑形：console.log × DEBUG 共现立案，无标记的 console.log 不案', () => {
  const hits = scanContent('console.log("DEBUG: token =", t)\nconsole.log("listening on port 3000")\n')
  assert.deepEqual(hits.map((h) => [h.line, h.kind, h.name]), [[1, 'xie', 'console.log×DEBUG']])
})

test('屑形：print × >>>、printf × ###、pprint、alert 各路共现', () => {
  const hits = scanContent("print('>>> checkpoint')\nprintf('### stage')\npprint('DEBUG obj')\nalert('XXX here')\n")
  assert.deepEqual(hits.map((h) => h.name), ['print×>>>', 'printf×###', 'print×DEBUG', 'alert×XXX'])
})

test('屑形：echo × ====、puts × DBG、println! × HERE、System.out.print × TODO', () => {
  const hits = scanContent('echo "==== stage 1 ===="\nputs "DBG point"\nprintln!("HERE now")\nSystem.out.println("TODO fix")\n')
  assert.deepEqual(hits.map((h) => h.name), ['echo×====', 'puts×DBG', 'println×HERE', 'System.out.print×TODO'])
})

test('屑形：console.error 与 logger.* 不在原语表，小写 debug 标记不中（词面和谐，宁纵）', () => {
  const hits = scanContent('console.error("DEBUG failed")\nlogger.info("DEBUG started")\nconsole.log("debug: x")\n')
  assert.equal(hits.length, 0)
})

// ---- 屑注释独立路 ---------------------------------------------------------------

test('屑形：探针注释形独立立案（# debug: 与 // debug:，无需原语）', () => {
  const hits = scanContent('# debug: entered parser\nlet x = 1 // debug: mid value\n//debug: compact\n')
  assert.deepEqual(hits.map((h) => [h.line, h.name]), [[1, 'debug-note'], [2, 'debug-note'], [3, 'debug-note']])
})

// ---- 试验场豁免（docs/03 §4）---------------------------------------------------

test('试验场：径段名段命中（tests/ test/ specs/ spec/ __tests__/ __mocks__/ fixtures/ debug/ .test. .spec. .mock. .debug.）', () => {
  for (const p of ['tests/a.js', 'src/test/b.js', 'specs/c.rb', 'spec/d.rb', '__tests__/e.ts', '__mocks__/f.js', 'fixtures/g.json', 'debug/h.js', 'i.test.js', 'j.spec.ts', 'k.mock.js', 'l.debug.py']) {
    assert.ok(grounded(p), p)
  }
  assert.equal(grounded('src/auth.js'), false)
  assert.equal(grounded('bin/deploy.sh'), false)
  assert.equal(grounded('testing/a.js'), false) // 无 /tests?/ 段
})

test('试验场：立案前豁免——write 进 tests/ 径不入帚账', () => {
  const res = judgeOne([call('write', { path: 'tests/auth.test.js', content: 'debugger;\nbreakpoint()\n' })])
  assert.equal(res.paths, 0)
  assert.equal(res.cases.zhen, 0)
})

// ---- 留册（docs/03 §5）----------------------------------------------------------

test('留册：parseBook/register 去重/revoke 无此径抛错/serializeBook 往返', () => {
  const book = parseBook(fx('saowu-book.json'))
  assert.deepEqual(book.retain, ['scripts/*'])
  registerEntry(book, 'bin/cli.js')
  registerEntry(book, 'bin/cli.js') // 重复去重
  assert.equal(bookCount(book), 2)
  assert.throws(() => revokeEntry(book, 'nope/*'), /无此许留径/)
  revokeEntry(book, 'bin/cli.js')
  const back = parseBook(serializeBook(book))
  assert.deepEqual(back.retain, ['scripts/*'])
})

test('留册：册增形须命名捕获组、命中计遗屑进案名、noDefaults 关默认表', () => {
  const opts = { forms: ['^\\s*trace\\s*\\(\\s*(?<name>[\'"][^\'"]+)'] }
  const hits = scanContent('trace("verbose path")\ndebugger;\n', opts)
  assert.deepEqual(hits.map((h) => [h.kind, h.name]), [['xie', '"verbose path'], ['zhen', 'debugger']])
  const off = scanContent('debugger;\n', { ...opts, noDefaults: true })
  assert.equal(off.length, 0)
  assert.throws(() => scanContent('x', { forms: ['([bad'] }), /不是合法正则/)
})

// ---- 判定序（docs/03 §6）--------------------------------------------------------

test('帚账唯写：observe 不入账、exec 黑盒、isError write 不入账', () => {
  const res = judgeOne([
    call('read', { path: 'src/a.js' }, { content: V2 }),
    call('bash', { command: 'echo debugger > src/b.js' }),
    call('write', { path: 'src/c.js', content: V2 }, { isError: true }),
  ])
  assert.equal(res.paths, 0)
  assert.equal(res.cases.zhen, 0)
})

test('帚账：write 带 content 入账；content 缺失只留无文之痕', () => {
  const res = judgeOne([
    call('write', { path: 'src/a.js', content: V1 }),
    call('write', { path: 'src/b.js' }),
  ])
  assert.equal(res.paths, 2) // 帚账径 + 痕径
  assert.equal(res.cases.zhen, 0)
})

test('判定序：末卷口径——先撒后扫出已扫注记，先净后脏照末卷立案', () => {
  const res1 = judgeOne([
    call('write', { path: 'src/calc.js', content: 'function f() {\n  breakpoint()\n}\n' }),
    call('write', { path: 'src/calc.js', content: 'function f() {\n  return 1\n}\n' }),
  ])
  assert.equal(res1.cases.zhen, 0)
  assert.equal(res1.cases.sao, 1)
  const res2 = judgeOne([
    call('write', { path: 'src/calc.js', content: V1 }),
    call('write', { path: 'src/calc.js', content: V2 }),
  ])
  assert.equal(res2.cases.zhen, 1)
  assert.equal(res2.cases.sao, 0)
})

test('判定序：帚账不前——末卷之案照出，其后无文之痕出注记（案注并存）', () => {
  const res = judgeOne([
    call('write', { path: 'src/a.js', content: V2 }),
    call('edit', { path: 'src/a.js' }),
  ])
  assert.equal(res.cases.zhen, 1)
  assert.equal(res.cases.qian, 1)
  assert.ok(res.issues.some((i) => i.startsWith('帚账不前：src/a.js')))
})

test('判定序：无末卷全静默（只有无文之痕的径不出案不出注记）', () => {
  const res = judgeOne([call('write', { path: 'src/a.js' }), call('edit', { path: 'src/a.js' })])
  assert.equal(res.paths, 1)
  assert.equal(res.cases.zhen, 0)
  assert.equal(res.cases.qian, 0)
})

test('判定序：一处一行——多行多针逐处立案，一行多形只计一处且针优先', () => {
  const res = judgeOne([call('write', { path: 'src/legacy.js', content: 'debugger;\nimport pdb\nconsole.trace(x)\n' })])
  assert.equal(res.cases.zhen, 3)
  const one = judgeOne([call('write', { path: 'src/a.js', content: 'debugger; console.log("DEBUG here")\n' })])
  assert.deepEqual(one.findings.map((f) => [f.kind, f.name]), [['zhen', 'debugger']])
})

test('判定序：留册 retain 与试验场皆立案前豁免，留册 glob 跨目录', () => {
  const book = { version: 1, retain: ['scripts/*'], forms: [], noDefaults: false }
  const res = judgeOne([call('write', { path: 'scripts/dev.sh', content: 'set -x\necho "DEBUG: starting"\n' })], { book })
  assert.equal(res.paths, 0)
  assert.ok(globMatch('scripts/dev.sh', 'scripts/*'))
  assert.equal(globMatch('bin/dev.sh', 'scripts/*'), false)
})

// ---- 垢值与门禁（docs/03 §7）----------------------------------------------------

test('垢值公式：min(60,30×针)+min(40,15×屑)，分带边界 14/15/29/30', () => {
  const mixed = judgeOne([
    call('write', { path: 'src/a.js', content: V2 }), // 针 1
    call('write', { path: 'src/b.js', content: V3 }), // 屑 1
  ])
  assert.equal(mixed.score.gou, 45)
  assert.equal(bandOf(14), '洁')
  assert.equal(bandOf(15), '蒙')
  assert.equal(bandOf(29), '蒙')
  assert.equal(bandOf(30), '垢')
  const cap = judgeOne([call('write', { path: 'src/c.js', content: 'debugger;\ndebugger;\ndebugger;\n' })])
  assert.equal(cap.score.gou, 60)
  const capX = judgeOne([call('write', { path: 'src/d.js', content: 'print(">>> 1")\nprint(">>> 2")\nprint(">>> 3")\n' })])
  assert.equal(capX.score.gou, 40)
})

test('门禁：默认门 30——29 过 30 红；gate 参数覆写', () => {
  const engine = createEngine({})
  recordCall(engine, { session: 's', name: 'write', args: { path: 'src/a.js', content: V2 }, isError: false, content: null })
  assert.equal(judge(engine, { gate: 30 }).verdict, 'fail')
  assert.equal(judge(engine, { gate: 31 }).verdict, 'pass')
  assert.equal(GATE_DEFAULT, 30)
})

// ---- 帚牌块与 issues 行序（docs/03 §8/§9）----------------------------------------

test('issues 行序：遗针 → 遗屑 → 已扫 → 帚账不前 → 全洁', () => {
  const engine = createEngine({})
  recordCall(engine, { session: 's', name: 'write', args: { path: 'src/b.js', content: V3 }, isError: false })
  recordCall(engine, { session: 's', name: 'write', args: { path: 'src/a.js', content: V2 }, isError: false })
  recordCall(engine, { session: 's', name: 'write', args: { path: 'src/c.js', content: 'breakpoint()\n' }, isError: false })
  recordCall(engine, { session: 's', name: 'write', args: { path: 'src/c.js', content: V1 }, isError: false })
  recordCall(engine, { session: 's', name: 'edit', args: { path: 'src/a.js' }, isError: false })
  const res = judge(engine)
  assert.deepEqual(res.issues, [
    '遗针：src/a.js:2（debugger）',
    '遗屑：src/b.js:2（console.log×DEBUG）',
    '已扫：src/c.js（曾撒 1 处，末卷已净）',
    '帚账不前：src/a.js（末卷后无文之写 1 笔，判定止于末卷）',
  ])
})

test('帚牌块：留册公示 + 案账清点 + 无册确定性文本 + 块不含行原文', () => {
  const book = { version: 1, retain: ['scripts/*'], forms: [], noDefaults: false }
  const judged = judgeOne([call('write', { path: 'src/a.js', content: V2 })])
  const block = renderZhoupai(book, judged)
  assert.ok(block.startsWith('【扫屋 · 帚牌】'))
  assert.ok(block.includes('留册：许留 1 处（scripts/*）'))
  assert.ok(block.includes('遗针：src/a.js:2（debugger）'))
  assert.ok(!block.includes('export function check')) // 行原文不进块
  const bare = renderZhoupai(null, { cases: { zhen: 0, xie: 0, sao: 0, qian: 0 }, findings: [], notes: [], issues: ['帚过皆洁 ×0 —— 末卷无垢，帚下留净'] })
  assert.ok(bare.includes('留册：未立（凡迹皆记）'))
})

// ---- 合审序（docs/03 §2）---------------------------------------------------------

test('合审序：全 at 有数按 (at, 流序, 流内序) 归并；撞名报错；否则参序拼接', () => {
  const a = '{"type":"tool_call","id":"a1","name":"write","args":{"path":"src/a.js","content":"clean\\n"},"at":200}\n' +
            '{"type":"tool_result","id":"a1","name":"write","isError":false,"at":201}\n'
  const b = '{"type":"tool_call","id":"b1","name":"write","args":{"path":"src/a.js","content":"debugger;\\n"},"at":100}\n' +
            '{"type":"tool_result","id":"b1","name":"write","isError":false,"at":101}\n'
  // 参序 a 在前，但 b 的 at=100 更早：按 (at,流序,流内序) 归并后 b(debugger) 先、a(clean) 后 → 末卷 clean → 已扫
  const res = auditStreams([{ name: 'a.jsonl', text: a }, { name: 'b.jsonl', text: b }])
  assert.equal(res.sessions, 2)
  assert.equal(res.cases.sao, 1)
  assert.equal(res.cases.zhen, 0)
  assert.throws(() => auditStreams([{ name: 'x.jsonl', text: a }, { name: 'x.jsonl', text: b }]), /撞名/)
})

// ---- 夹具全量（docs/04 A2 手算）---------------------------------------------------

test('夹具全量：十五口径与手算逐字吻合', () => {
  const book = parseBook(fx('saowu-book.json'))
  const exp = [
    ['clean', 0, 1, '洁', 0, 0, 0, 0, 0],
    ['yizhen', 30, 1, '垢', 1, 0, 0, 0, 0],
    ['yixie', 15, 1, '蒙', 0, 1, 0, 0, 0],
    ['shuangxie', 30, 1, '垢', 0, 2, 0, 0, 0],
    ['yisao', 0, 1, '洁', 0, 0, 1, 0, 0],
    ['pinzhen', 60, 3, '垢', 3, 0, 0, 0, 0],
    ['shichang', 0, 0, '洁', 0, 0, 0, 0, 0],
    ['liuce', 0, 0, '洁', 0, 0, 0, 0, 0],
    ['wujuan', 0, 1, '洁', 0, 0, 0, 0, 0],
    ['duozhen', 60, 1, '垢', 3, 0, 0, 0, 0],
    ['biaoji', 40, 1, '垢', 0, 3, 0, 0, 0],
    ['daoci', 15, 1, '蒙', 0, 1, 0, 0, 0],
    ['huisheng', 0, 1, '洁', 0, 0, 0, 0, 0],
    ['qianzhang', 30, 1, '垢', 1, 0, 0, 1, 0],
  ]
  for (const [name, score, paths, band, zhen, xie, sao, qian, expCallsUnused] of exp) {
    void expCallsUnused
    const res = auditStreams([{ name: `${name}.jsonl`, text: fx(`${name}-stream.jsonl`) }], { book })
    assert.equal(res.score.total, score, `${name} 分数`)
    assert.equal(res.band, band, `${name} 分带`)
    assert.equal(res.cases.zhen, zhen, `${name} 遗针`)
    assert.equal(res.cases.xie, xie, `${name} 遗屑`)
    assert.equal(res.cases.sao, sao, `${name} 已扫`)
    assert.equal(res.cases.qian, qian, `${name} 帚账不前`)
    assert.equal(res.verdict, score >= 30 ? 'fail' : 'pass', `${name} 门禁`)
    assert.equal(res.paths, paths, `${name} 受审径`)
  }
  // 无册对照：liuce 45 垢
  const bare = auditStreams([{ name: 'liuce.jsonl', text: fx('liuce-stream.jsonl') }])
  assert.equal(bare.score.total, 45)
  assert.equal(bare.cases.zhen, 1)
  assert.equal(bare.cases.xie, 1)
})

// ---- 幂等与 seq -------------------------------------------------------------------

test('judge 幂等：同引擎两次判定同判词；seq 只数入账事件（帚账与痕）', () => {
  const engine = createEngine({})
  recordCall(engine, { session: 's', name: 'write', args: { path: 'src/a.js', content: V2 }, isError: false })
  recordCall(engine, { session: 's', name: 'write', args: { path: 'src/b.js' }, isError: false })
  recordCall(engine, { session: 's', name: 'write', args: { path: 'src/c.js', content: V1 }, isError: true }) // 失败不入
  const r1 = judge(engine)
  const r2 = judge(engine)
  assert.deepEqual(r1.cases, r2.cases)
  assert.equal(r1.score.total, r2.score.total)
  assert.equal(engine.seq, 2) // 一帚账 + 一痕；失败的写不计
  const { findings } = settleAll(engine)
  assert.equal(findings.length, r1.findings.length)
})
