/**
 * 知足 · 核心判定测试 —— 流解析 / 对象键 / 足册 / 三宗判定 / 清白道 / 分带 / 夹具 / 互认。
 * 期望值全部先于实现手算（docs/03 §10），断言恰好该分值。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath, parentDir, contentOf, countLines } from '../src/core/object.js'
import { emptyBook, parseBook, serializeBook, bookCount, overrideBook, DEFAULT_THRESHOLDS } from '../src/core/zuce.js'
import { createEngine, recordCall, judge, bandOf, GATE_DEFAULT } from '../src/core/liangzhang.js'
import { auditStreams } from '../src/core/audit.js'
import { renderLiangpai } from '../src/core/liangpai.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8')

const call = (name, args, isError = false) => ({ session: 's', name, args, isError, content: null })
const write = (path, content, isError = false) => call('write', { path, content }, isError)
const rewrite = (path, content, isError = false) => call('edit', { path, content }, isError)
const read = (path, isError = false) => call('read', { path }, isError)
const bash = (command, isError = false) => call('bash', { command }, isError)

const N = (n, tag = 'x') => Array.from({ length: n }, (_, i) => `${tag} ${i}`).join('\n')

function engineOf(calls, opts = {}) {
  const e = createEngine(opts)
  for (const c of calls) recordCall(e, c)
  return e
}

// ---------------------------------------------------------------- 流解析

test('解析:#注释与空行跳过', () => {
  const ev = parseStream('# 注释\n\n{"type":"tool_call","id":"c1","name":"write","args":{}}\n')
  assert.equal(ev.length, 1)
})

test('解析:坏行报行号', () => {
  assert.throws(() => parseStream('{"a":1}\n坏行\n'), /第 2 行/)
})

test('归并:id 配对回填 isError 与 content', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"a.js"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false,"content":"正文"}\n',
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
  assert.equal(calls[0].content, '正文')
})

test('归并:无 id 紧邻配对（zhizhi 旧格式）', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","name":"write","args":{"path":"a.js"}}\n' +
    '{"type":"tool_result","name":"write","isError":false}\n',
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
})

test('归并:孤儿 result 独立建档', () => {
  const { calls } = buildCalls(parseStream('{"type":"tool_result","id":"z9","isError":true}\n'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

// ---------------------------------------------------------------- 对象键与工具族

test('对象键:三级回退', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'write'), 'p:a.js')
  assert.equal(objectKey({ file_path: 'b.js' }, 'write'), 'p:b.js')
  assert.equal(objectKey({ command: ' ls ' }, 'bash'), 'c:ls')
  assert.equal(objectKey({}, 'write'), 'n:write')
})

test('工具族:观察/写/执行/其他', () => {
  assert.equal(familyOf('read'), 'observe')
  assert.equal(familyOf('Grep'), 'observe')
  assert.equal(familyOf('write'), 'write')
  assert.equal(familyOf('edit_file'), 'write')
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('other'), 'other')
})

test('径规整:./ 前缀、反斜杠、尾斜杠', () => {
  assert.equal(normalizePath('./a/b.js'), 'a/b.js')
  assert.equal(normalizePath('././a.js'), 'a.js')
  assert.equal(normalizePath('a\\b.js'), 'a/b.js')
  assert.equal(normalizePath('a/b/'), 'a/b')
  assert.equal(normalizePath('./a.js'), normalizePath('a.js'))
})

test('父目录:嵌套与顶层', () => {
  assert.equal(parentDir('src/auth/login.js'), 'src/auth')
  assert.equal(parentDir('a.js'), '.')
})

test('内容字段:按序取首个非空字符串值', () => {
  assert.equal(contentOf({ text: 't', content: 'c' }), 'c')
  assert.equal(contentOf({ new_string: 'ns' }), 'ns')
  assert.equal(contentOf({ path: 'a.js' }), null)
})

test('行数:末尾换行不计额外一行', () => {
  assert.equal(countLines('a\nb\nc\n'), 3)
  assert.equal(countLines('a\nb'), 2)
  assert.equal(countLines('a'), 1)
})

// ---------------------------------------------------------------- 足册

test('足册:全缺省解析出默认值', () => {
  const b = parseBook('{"version":1}')
  assert.deepEqual(b.exempt, [])
  assert.deepEqual(
    { hugeLines: b.hugeLines, fanDirs: b.fanDirs, fanFiles: b.fanFiles, churnFree: b.churnFree },
    DEFAULT_THRESHOLDS,
  )
})

test('足册:坏 JSON / 非对象 / 坏阈值 / 坏豁免全部报错', () => {
  assert.throws(() => parseBook('no'), /JSON/)
  assert.throws(() => parseBook('[]'), /对象/)
  assert.throws(() => parseBook('{"hugeLines":0}'), /≥1/)
  assert.throws(() => parseBook('{"churnFree":-1}'), /≥1/)
  assert.throws(() => parseBook('{"hugeLines":2.5}'), /整数/)
  assert.throws(() => parseBook('{"exempt":[1]}'), /字符串/)
})

test('足册:序列化往返', () => {
  const b = parseBook('{"exempt":["dist/"],"hugeLines":500}')
  const b2 = parseBook(serializeBook(b))
  assert.deepEqual(b2, b)
  assert.equal(bookCount(b), 1)
})

test('足册:审计方口径覆盖(旗标 > 册)与豁免并集', () => {
  const b = parseBook('{"hugeLines":300,"exempt":["dist/"]}')
  const o = overrideBook(b, { hugeLines: 500, exempt: ['a.lock'] })
  assert.equal(o.hugeLines, 500)
  assert.deepEqual(o.exempt, ['dist/', 'a.lock'])
  assert.equal(b.hugeLines, 300) // 原册不被改
  assert.throws(() => overrideBook(b, { fanDirs: 0 }), /≥1/)
})

test('空册工厂', () => {
  assert.deepEqual(emptyBook(), { version: 1, exempt: [], ...DEFAULT_THRESHOLDS })
})

// ---------------------------------------------------------------- 入口滤

test('入口滤:失败之写不入账(未落盘,试错归九变)', () => {
  const e = engineOf([read('src/a.js'), write('src/a.js', N(500), true)])
  const r = judge(e)
  assert.equal(r.counts.hugeWrites, 0)
  assert.equal(r.counts.churns, 0)
  assert.equal(r.score.total, 0)
})

test('入口滤:isError 未知(null,老流)按已发生入账', () => {
  const e = engineOf([
    read('src/a.js'),
    { session: 's', name: 'edit', args: { path: 'src/a.js', content: N(500) }, isError: null, content: null },
  ])
  assert.equal(judge(e).counts.hugeWrites, 1)
})

// ---------------------------------------------------------------- 巨写

test('巨写:改笔超阈立案恰 30(先读后写)', () => {
  const e = engineOf([read('src/api.js'), write('src/api.js', N(450))])
  const r = judge(e)
  assert.equal(r.counts.hugeWrites, 1)
  assert.equal(r.score.huge, 30)
  assert.equal(r.score.total, 30)
  assert.equal(r.band, '溢')
})

test('巨写:写后写同为改笔(本次写不算自己的先见)', () => {
  const e = engineOf([write('src/a.js', N(10)), write('src/a.js', N(450))])
  assert.equal(judge(e).counts.hugeWrites, 1)
})

test('巨写:创笔超阈免记——注记不计分', () => {
  const e = engineOf([write('src/new/schema.js', N(401))])
  const r = judge(e)
  assert.equal(r.counts.hugeWrites, 0)
  assert.equal(r.counts.freshNotes, 1)
  assert.equal(r.score.total, 0)
  assert.equal(r.band, '俭')
})

test('巨写:创笔之后同径再超阈是改笔——立案', () => {
  const e = engineOf([write('src/new.js', N(401)), write('src/new.js', N(402))])
  const r = judge(e)
  assert.equal(r.counts.freshNotes, 1)
  assert.equal(r.counts.hugeWrites, 1)
})

test('巨写:行数恰等阈不立案(严格大于)', () => {
  const e = engineOf([read('src/a.js'), write('src/a.js', N(400))])
  assert.equal(judge(e).counts.hugeWrites, 0)
})

test('巨写:cap 60(三案封顶)', () => {
  const e = engineOf([
    read('src/a.js'),
    write('src/a.js', N(401)),
    read('src/b.js'),
    write('src/b.js', N(401)),
    read('src/c.js'),
    write('src/c.js', N(401)),
  ])
  const r = judge(e)
  assert.equal(r.counts.hugeWrites, 3)
  assert.equal(r.score.huge, 60)
})

// ---------------------------------------------------------------- 蔓延

test('蔓延:目录数超阈单案 +20', () => {
  const paths = ['a/f.js', 'b/f.js', 'c/f.js', 'd/f.js', 'e/f.js', 'f/f.js', 'g/f.js']
  const e = engineOf(paths.map((p) => write(p, N(3))))
  const r = judge(e)
  assert.equal(r.counts.fanouts, 1)
  assert.equal(r.score.fan, 20)
  assert.equal(r.band, '盈')
  assert.equal(r.verdict, 'pass')
})

test('蔓延:目录不超但文件数超阈也立案', () => {
  const calls = []
  for (let i = 0; i < 20; i++) calls.push(write(`src/f${i}.js`, N(2)))
  const r = judge(engineOf(calls))
  assert.equal(r.gauge.writeDirs, 1)
  assert.equal(r.counts.fanouts, 1)
})

test('蔓延:都在阈内无案', () => {
  const calls = ['src/a.js', 'src/b.js', 'lib/c.js'].map((p) => write(p, N(2)))
  const r = judge(engineOf(calls))
  assert.equal(r.counts.fanouts, 0)
  assert.equal(r.score.fan, 0)
})

test('蔓延:judge 幂等——两次判定案数不变', () => {
  const paths = ['a/f.js', 'b/f.js', 'c/f.js', 'd/f.js', 'e/f.js', 'f/f.js', 'g/f.js']
  const e = engineOf(paths.map((p) => write(p, N(3))))
  const r1 = judge(e)
  const r2 = judge(e)
  assert.equal(r1.cases, r2.cases)
  assert.equal(r2.counts.fanouts, 1)
})

// ---------------------------------------------------------------- 屡改

test('屡改:免额内(3 笔)0 案', () => {
  const calls = [read('src/a.js')]
  for (let i = 0; i < 3; i++) calls.push(rewrite('src/a.js', N(3)))
  const r = judge(engineOf(calls))
  assert.equal(r.counts.churns, 0)
  assert.equal(r.score.total, 0)
})

test('屡改:第 5 笔起 1 案(超出 2 笔满 2 记 1)', () => {
  const calls = []
  for (let i = 0; i < 4; i++) calls.push(write('src/a.js', N(3)))
  assert.equal(judge(engineOf(calls)).counts.churns, 0) // 4 笔超出 1 → 0 案
  for (let i = 0; i < 5 - 4; i++) calls.push(write('src/a.js', N(3)))
  const r = judge(engineOf(calls)) // 5 笔超出 2 → 1 案
  assert.equal(r.counts.churns, 1)
  assert.equal(r.score.churn, 10)
})

test('屡改:第 7 笔 2 案、第 9 笔 cap 20', () => {
  const calls = []
  for (let i = 0; i < 7; i++) calls.push(write('src/a.js', N(3)))
  assert.equal(judge(engineOf(calls)).counts.churns, 2)
  for (let i = 0; i < 2; i++) calls.push(write('src/a.js', N(3)))
  const r = judge(engineOf(calls)) // 9 笔超出 6 → 3 案 → cap 20
  assert.equal(r.score.churn, 20)
  assert.equal(r.counts.churns, 3)
})

test('屡改:增量记账——逐笔判定的分数与离线整放前缀一致(单调不回退)', () => {
  const calls = []
  const seen = []
  for (let i = 0; i < 8; i++) {
    calls.push(write('src/a.js', N(3)))
    const e = engineOf(calls)
    seen.push(judge(e).score.churn)
  }
  // 8 笔超出 5 → 2 案;逐笔前缀:0,0,0,0,10,10,20,20
  assert.deepEqual(seen, [0, 0, 0, 0, 10, 10, 20, 20])
})

test('屡改:免额可配(--churn-free 2 口径)', () => {
  const calls = []
  for (let i = 0; i < 6; i++) calls.push(write('src/a.js', N(3)))
  const r = judge(engineOf(calls, { book: { version: 1, exempt: [], hugeLines: 400, fanDirs: 6, fanFiles: 20, churnFree: 2 } }))
  assert.equal(r.counts.churns, 2) // 超出 4 → 2 案
})

test('屡改与巨写谓词正交:同径既巨写又屡改,两案并记', () => {
  const calls = [read('src/a.js')]
  for (let i = 0; i < 5; i++) calls.push(write('src/a.js', N(450)))
  const r = judge(engineOf(calls))
  assert.equal(r.counts.hugeWrites, 5) // 每一笔 450 行都是改笔超阈,逐笔计案
  assert.equal(r.counts.churns, 1) // 5 笔超出 2 → 1 案
  assert.equal(r.score.huge, 60) // cap
  assert.equal(r.score.total, 70) // 60 + 10
})

// ---------------------------------------------------------------- 豁免与黑盒

test('豁免:径含子串三宗全免、完全出账', () => {
  const calls = [read('pkg/package-lock.json')]
  for (let i = 0; i < 6; i++) calls.push(write('pkg/package-lock.json', N(500)))
  const book = { version: 1, exempt: ['package-lock.json'], hugeLines: 400, fanDirs: 6, fanFiles: 20, churnFree: 3 }
  const r = judge(engineOf(calls, { book }))
  assert.equal(r.counts.exempted, 1)
  assert.equal(r.counts.hugeWrites, 0)
  assert.equal(r.counts.churns, 0)
  assert.equal(r.score.total, 0)
  assert.equal(r.gauge.writePaths, 0)
})

test('豁免:注记每径一记', () => {
  const calls = [write('dist/a.js', N(3)), write('dist/a.js', N(3)), write('dist/b.js', N(3))]
  const book = { version: 1, exempt: ['dist/'], hugeLines: 400, fanDirs: 6, fanFiles: 20, churnFree: 3 }
  assert.equal(judge(engineOf(calls, { book })).counts.exempted, 2)
})

test('exec 黑盒:重定向大写不判规模、不入扇出', () => {
  const e = engineOf([bash('cat big.tpl > src/huge.js')])
  const r = judge(e)
  assert.equal(r.score.total, 0)
  assert.equal(r.gauge.writePaths, 0)
})

test('exec 失败:入口滤覆盖', () => {
  const e = engineOf([bash('make boom', true)])
  assert.equal(judge(e).calls, 1)
  assert.equal(judge(e).score.total, 0)
})

test('无 p: 的写族调用不入写账', () => {
  const e = engineOf([call('write', { content: N(500) })])
  const r = judge(e)
  assert.equal(r.writes, 0)
  assert.equal(r.score.total, 0)
})

// ---------------------------------------------------------------- 老流诚实退化

test('老流无 content:巨写沉默,蔓延与屡改照判', () => {
  const calls = [
    read('src/a.js'),
    call('edit', { path: 'src/a.js' }),
    call('edit', { path: 'src/a.js' }),
    call('edit', { path: 'src/a.js' }),
    call('edit', { path: 'src/a.js' }),
    call('edit', { path: 'src/a.js' }),
  ]
  const r = judge(engineOf(calls))
  assert.equal(r.counts.hugeWrites, 0)
  assert.equal(r.counts.churns, 1) // 5 笔超出 2 → 1 案
  assert.equal(r.gauge.maxLines, 0)
})

// ---------------------------------------------------------------- 分带与门

test('分带:俭 0–14 / 盈 15–29 / 溢 ≥30', () => {
  assert.equal(bandOf(0), '俭')
  assert.equal(bandOf(14), '俭')
  assert.equal(bandOf(15), '盈')
  assert.equal(bandOf(29), '盈')
  assert.equal(bandOf(30), '溢')
  assert.equal(bandOf(100), '溢')
})

test('门默认 30;可调门翻转', () => {
  const calls = [read('src/a.js'), write('src/a.js', N(450))] // 30
  assert.equal(judge(engineOf(calls)).verdict, 'fail')
  assert.equal(judge(engineOf(calls), { gate: 31 }).verdict, 'pass')
  assert.equal(GATE_DEFAULT, 30)
})

test('溢值封顶 100', () => {
  const calls = []
  for (let i = 0; i < 12; i++) calls.push(read(`d${i}/f.js`), write(`d${i}/f.js`, N(450))) // 12 巨写案 60(cap) + 蔓延 12 目录 20
  const r = judge(engineOf(calls))
  assert.equal(r.score.huge, 60)
  assert.equal(r.score.fan, 20)
  assert.equal(r.score.total, 80)
  assert.ok(r.score.total <= 100)
})

// ---------------------------------------------------------------- gauge 与 issues

test('gauge:写径数/目录数/最大单笔/写频前三', () => {
  const calls = [read('src/big.js'), write('src/big.js', N(450))]
  for (let i = 0; i < 4; i++) calls.push(write('src/small.js', N(2)))
  const r = judge(engineOf(calls))
  assert.equal(r.gauge.writePaths, 2)
  assert.equal(r.gauge.writeDirs, 1)
  assert.equal(r.gauge.maxLines, 450)
  assert.deepEqual(r.gauge.churnTop[0], { path: 'src/small.js', writes: 4 })
})

test('issues 行序锁死:巨写 → 蔓延 → 屡改 → 创笔 → 豁免', () => {
  const calls = [
    write('pkg/lock.json', N(3)),
    write('fresh/g.js', N(401)),
    read('src/big.js'),
    write('src/big.js', N(450)),
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((d) => write(`${d}/f.js`, N(3))),
  ]
  const book = { version: 1, exempt: ['pkg/lock'], hugeLines: 400, fanDirs: 6, fanFiles: 20, churnFree: 3 }
  const r = judge(engineOf(calls, { book }))
  const heads = r.issues.map((s) => s.slice(0, 2))
  assert.deepEqual(heads, ['巨写', '蔓延', '创笔', '豁免'])
})

test('issues:净量收尾', () => {
  const r = judge(engineOf([read('src/a.js'), write('src/a.js', N(3))]))
  assert.deepEqual(r.issues, ['净量：量账无案——行少欲者，触事有余'])
})

// ---------------------------------------------------------------- 多流合审

test('多流合审:径去重与屡改跨会话归并', () => {
  const s1 = '# 会话一\n' + [0, 1, 2].map((i) => JSON.stringify({ type: 'tool_call', id: `x${i}`, name: 'write', args: { path: 'src/a.js', content: N(3) } }) + '\n' + JSON.stringify({ type: 'tool_result', id: `x${i}`, isError: false })).join('\n') + '\n'
  const s2 = '# 会话二\n' + [0, 1, 2].map((i) => JSON.stringify({ type: 'tool_call', id: `y${i}`, name: 'write', args: { path: 'src/a.js', content: N(3) } }) + '\n' + JSON.stringify({ type: 'tool_result', id: `y${i}`, isError: false })).join('\n') + '\n'
  const r = auditStreams([{ name: 's1.jsonl', text: s1 }, { name: 's2.jsonl', text: s2 }])
  assert.equal(r.sessions, 2)
  assert.equal(r.writes, 6)
  assert.equal(r.counts.churns, 1) // 6 笔超出 3 → 1 案
})

test('多流合审:撞名报错', () => {
  assert.throws(() => auditStreams([{ name: 'a.jsonl', text: '' }, { name: 'a.jsonl', text: '' }]), /撞名/)
})

// ---------------------------------------------------------------- 夹具(先于实现手算,docs/03 §10)

test('夹具 modest:0 俭 exit 0、创笔注记 1', () => {
  const r = auditStreams([{ name: 'modest-stream.jsonl', text: fixture('modest-stream.jsonl') }])
  assert.equal(r.calls, 3)
  assert.equal(r.writes, 2)
  assert.equal(r.cases, 0)
  assert.deepEqual(r.score, { total: 0, huge: 0, fan: 0, churn: 0 })
  assert.equal(r.band, '俭')
  assert.equal(r.verdict, 'pass')
  assert.deepEqual(r.counts, { hugeWrites: 0, fanouts: 0, churns: 0, freshNotes: 1, exempted: 0 })
})

test('夹具 bloated:巨写 2 案 60 溢', () => {
  const r = auditStreams([{ name: 'bloated-stream.jsonl', text: fixture('bloated-stream.jsonl') }])
  assert.equal(r.calls, 3)
  assert.equal(r.writes, 2)
  assert.equal(r.cases, 2)
  assert.deepEqual(r.score, { total: 60, huge: 60, fan: 0, churn: 0 })
  assert.equal(r.band, '溢')
  assert.equal(r.verdict, 'fail')
})

test('夹具 sprawling:蔓延 1 案 20 盈', () => {
  const r = auditStreams([{ name: 'sprawling-stream.jsonl', text: fixture('sprawling-stream.jsonl') }])
  assert.equal(r.calls, 8)
  assert.equal(r.writes, 8)
  assert.equal(r.cases, 1)
  assert.deepEqual(r.score, { total: 20, huge: 0, fan: 20, churn: 0 })
  assert.equal(r.band, '盈')
  assert.equal(r.verdict, 'pass')
  assert.equal(r.counts.freshNotes, 0)
})

test('夹具 churny:屡改 1 案 10 俭(点名不咬门)', () => {
  const r = auditStreams([{ name: 'churny-stream.jsonl', text: fixture('churny-stream.jsonl') }])
  assert.equal(r.calls, 12)
  assert.equal(r.writes, 10)
  assert.equal(r.cases, 1)
  assert.deepEqual(r.score, { total: 10, huge: 0, fan: 0, churn: 10 })
  assert.equal(r.band, '俭')
  assert.equal(r.verdict, 'pass')
})

test('夹具 mixed:巨写 30 + 蔓延 20 = 50 溢', () => {
  const r = auditStreams([{ name: 'mixed-stream.jsonl', text: fixture('mixed-stream.jsonl') }])
  assert.equal(r.calls, 10)
  assert.equal(r.writes, 9)
  assert.equal(r.cases, 2)
  assert.deepEqual(r.score, { total: 50, huge: 30, fan: 20, churn: 0 })
  assert.equal(r.band, '溢')
  assert.equal(r.verdict, 'fail')
  assert.ok(r.issues[0].startsWith('巨写'))
  assert.ok(r.issues[1].startsWith('蔓延'))
})

// ---------------------------------------------------------------- 跨项目互认

test('互认:zhizhi sample 真实路径审计', () => {
  const r = auditStreams([{ name: 'sample-stream.jsonl', text: readFileSync(join(here, '..', '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl'), 'utf8') }])
  assert.equal(r.calls, 8)
  assert.equal(r.writes, 2)
  assert.deepEqual(r.score, { total: 0, huge: 0, fan: 0, churn: 0 })
  assert.equal(r.band, '俭')
  assert.equal(r.verdict, 'pass')
})

test('互认:dingfen fenced-stream 喂知足——0 俭', () => {
  const r = auditStreams([{ name: 'fenced-stream.jsonl', text: readFileSync(join(here, '..', '..', 'dingfen', 'fixtures', 'fenced-stream.jsonl'), 'utf8') }])
  assert.equal(r.calls, 6)
  assert.equal(r.writes, 2)
  assert.deepEqual(r.score, { total: 0, huge: 0, fan: 0, churn: 0 })
  assert.equal(r.band, '俭')
})

// ---------------------------------------------------------------- 量牌块

test('量牌:同一足册两次渲染逐字节一致', () => {
  const book = parseBook(fixture('zuzu-book.json'))
  const a = renderLiangpai(book)
  const b = renderLiangpai(book)
  assert.equal(a, b)
  assert.match(a, /【知足 · 量牌】/)
  assert.match(a, /巨写阈 400 行/)
})

test('量牌:带账统计注入', () => {
  const text = renderLiangpai(parseBook(fixture('zuzu-book.json')), { hugeWrites: 1, fanouts: 0, churns: 2, freshNotes: 1, exempted: 1 })
  assert.match(text, /巨写 1 · 蔓延 0 · 屡改 2/)
})

test('量牌:全缺省输出确定性文本', () => {
  const a = renderLiangpai(null)
  const b = renderLiangpai({})
  assert.equal(a, b)
  assert.match(a, /巨写阈 400 行 · 蔓延阈 6 目录\/20 文件 · 屡改免 3 笔/)
})
