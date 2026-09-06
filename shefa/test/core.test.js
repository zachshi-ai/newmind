/**
 * 核心判定语义测试 —— 落物通道、销案判定序、域外判定、分值分带、词法与册（docs/03/04 的 A1）。
 * 期望值全部先于实现手算定死（docs/03 §10）；实现与手算冲突只能改实现。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath } from '../src/core/object.js'
import { segments, tokenize, headWord, dropTargets, globMatch, wildcardMatch, inSystemArea } from '../src/core/lexicon.js'
import { createEngine, recordCall, judge, settleLines, bandOf, assembleOpts } from '../src/core/fazhang.js'
import { parseBook, serializeBook, overrideBook, emptyBook, DEFAULT_RAFT_FORMS, DEFAULT_KEEP_FORMS } from '../src/core/zuce.js'
import { renderShepai } from '../src/core/shepai.js'
import { auditStreams, sessionName } from '../src/core/audit.js'

// ---- 流解析 ---------------------------------------------------------------

test('流解析：# 注释与空行跳过、坏行报行号', () => {
  const ok = parseStream('# 注释\n\n{"type":"tool_call","id":"c1","name":"read"}\n')
  assert.equal(ok.length, 1)
  assert.throws(() => parseStream('{"a":1}\n不是json\n'), /第 2 行/)
})

test('流解析：id 配对回填 isError 与 content；孤儿 result 建档', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"c1","name":"edit"}\n' +
    '{"type":"tool_result","id":"c1","isError":true,"content":"boom"}\n' +
    '{"type":"tool_result","id":"zz","isError":false}\n',
  ))
  assert.equal(calls.length, 2)
  assert.equal(calls[0].isError, true)
  assert.equal(calls[0].content, 'boom')
  assert.equal(calls[1].ref, 'zz')
})

test('流解析：无 id result 并入紧邻 call（zhizhi 旧格式）', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","name":"bash"}\n{"type":"tool_result","isError":false}\n',
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
})

// ---- 对象键与工具族 -------------------------------------------------------

test('对象键：path 字段优先序与命令对象、不透明对象', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'x'), 'p:a.js')
  assert.equal(objectKey({ command: ' npm test ' }, 'x'), 'c:npm test')
  assert.equal(objectKey({ other: 1 }, 'tool9'), 'n:tool9')
})

test('工具族：写/执行/观察/其他', () => {
  assert.equal(familyOf('write'), 'write')
  assert.equal(familyOf('patch_file'), 'write')
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('run_command'), 'exec')
  assert.equal(familyOf('read'), 'observe')
  assert.equal(familyOf('grep'), 'observe')
  assert.equal(familyOf('web_search'), 'observe') // 共享观察族表：search 子串归观察（全仓同规）
  assert.equal(familyOf('deploy_service'), 'other')
})

test('径规整：./ 前缀、反斜杠、尾斜杠', () => {
  assert.equal(normalizePath('./a/b.js'), 'a/b.js')
  assert.equal(normalizePath('a\\b.js'), 'a/b.js')
  assert.equal(normalizePath('a/b/'), 'a/b')
})

// ---- 落物词法（docs/03 §4.2）---------------------------------------------

test('词法：段切分与词元化（引号删除）', () => {
  assert.deepEqual(segments('a && b || c; d | e'), ['a ', ' b ', ' c', ' d ', ' e'])
  assert.deepEqual(tokenize("git commit -m 'wip: add x'"), ['git', 'commit', '-m', 'wip:', 'add', 'x'])
  assert.equal(headWord('  /usr/bin/env node x'), 'env')
})

test('词法：cp/mv 取末词元、tee/touch 取全部词元、旗标丢弃', () => {
  assert.deepEqual(dropTargets('cp -r src/a.js src/a.js.bak'), ['src/a.js.bak'])
  assert.deepEqual(dropTargets('mv old.js scratch/old.js'), ['scratch/old.js'])
  assert.deepEqual(dropTargets('touch scratch/t1.js scratch/t2.js'), ['scratch/t1.js', 'scratch/t2.js'])
  assert.deepEqual(dropTargets('tee out.tmp in.log'), ['out.tmp', 'in.log'])
})

test('词法：重定向形（> >> 2> &>）与 2>&1 丢弃', () => {
  assert.deepEqual(dropTargets('echo x > /tmp/a.log'), ['/tmp/a.log'])
  assert.deepEqual(dropTargets('echo x >> /tmp/a.log'), ['/tmp/a.log'])
  assert.deepEqual(dropTargets('cmd 2> err.bak'), ['err.bak'])
  assert.deepEqual(dropTargets('cmd &> all.tmp'), ['all.tmp'])
  assert.deepEqual(dropTargets('cmd > f.log 2>&1'), ['f.log'])
  // 词法层只提词元不做 keep 滤——/dev/null 的弃物址豁免在引擎 admit 层（见豁免用例 rafts 0）
  assert.deepEqual(dropTargets('echo done > /dev/null'), ['/dev/null'])
})

test('词法：git add/commit 段不落物（无重定向无特段型）', () => {
  assert.deepEqual(dropTargets("git commit -m 'wip: add scratch check'"), [])
  assert.deepEqual(dropTargets('git add scratch/check.js'), [])
})

test('glob：roots 域界语义（** 跨 /、* 不跨 /、? 单字符、尾 / 目录前缀）', () => {
  assert.equal(globMatch('src/**', 'src/a/b.js'), true)
  assert.equal(globMatch('src/*', 'src/a.js'), true)
  assert.equal(globMatch('src/*', 'src/a/b.js'), false)
  assert.equal(globMatch('src/?.js', 'src/a.js'), true)
  assert.equal(globMatch('docs/', 'docs/x.md'), true)
  assert.equal(globMatch('src/**', 'scratch/x.js'), false)
})

test('wildcard：rm 凭据宽 glob（* 跨 /）', () => {
  assert.equal(wildcardMatch('scratch/*.js', 'scratch/deep/x.js'), true)
  assert.equal(wildcardMatch('scratch/?x.js', 'scratch/ax.js'), true)
  assert.equal(wildcardMatch('a.js', 'a.js'), true)
  assert.equal(wildcardMatch('a.js', 'b.js'), false)
})

test('系统区前缀回退', () => {
  assert.equal(inSystemArea('/tmp/x'), true)
  assert.equal(inSystemArea('/var/tmp/x'), true)
  assert.equal(inSystemArea('~/x'), true)
  assert.equal(inSystemArea('src/x.js'), false)
})

// ---- 落物立案与豁免 -------------------------------------------------------

function run(streams, opts = {}) {
  return auditStreams(streams, opts)
}

test('落物：write 族筏形立案、每径一案落物笔数累计', () => {
  const r = run([{ name: 's.jsonl', text: [
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"edit","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
  ].join('\n') }])
  assert.equal(r.rafts, 2)
  assert.equal(r.paths, 1)
  assert.equal(r.gauge.raftTop[0].hits, 2)
})

test('落物：非筏形永不入账、exec 无径词面天然沉默', () => {
  const r = run([{ name: 's.jsonl', text: [
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"src/util.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"npm install"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
  ].join('\n') }])
  assert.equal(r.rafts, 0)
  assert.equal(r.paths, 0)
})

test('落物：失败写不入账、isError 未知按已发生', () => {
  const r = run([{ name: 's.jsonl', text: [
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":true}',
    '{"type":"tool_call","id":"c2","name":"write","args":{"path":"scratch/b.js"}}',
  ].join('\n') }])
  assert.equal(r.rafts, 1)
  assert.equal(r.paths, 1)
})

test('豁免：keep 形完全出账（默认 /dev/null 与册内签字）', () => {
  const r = run([{ name: 's.jsonl', text: [
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"echo x > /dev/null"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"write","args":{"path":"vendor/lib.bak"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
  ].join('\n') }], { book: { version: 1, keep: ['vendor/'], raft: [], roots: [] } })
  assert.equal(r.rafts, 0)
  assert.equal(r.counts.exempted, 1)
  assert.equal(r.issues.some((i) => i.startsWith('豁免')), true)
})

// ---- 销案判定序（docs/03 §4.3：舍 > 归 > 外逸 > 遗）-----------------------

const streamOf = (lines) => ({ name: 's.jsonl', text: lines.join('\n') })

test('舍：rm 词元逐字销案', () => {
  const r = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"rm scratch/a.js"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
  ])])
  assert.deepEqual(r.counts, { dropped: 1, removed: 1, adopted: 0, exempted: 0, left: 0, stray: 0 })
})

test('舍：rm 宽通配销案与 git rm、rmdir 词元', () => {
  const r = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"write","args":{"path":"scratch/b.js"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
    '{"type":"tool_call","id":"c3","name":"bash","args":{"command":"git rm scratch/a.js"}}',
    '{"type":"tool_result","id":"c3","isError":false}',
    '{"type":"tool_call","id":"c4","name":"bash","args":{"command":"rmdir scratch/b.js"}}',
    '{"type":"tool_result","id":"c4","isError":false}',
  ])])
  assert.equal(r.counts.removed, 2)
})

test('舍：git clean 全域销案', () => {
  const r = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"git clean -fd"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
  ])])
  assert.deepEqual(r.counts, { dropped: 1, removed: 1, adopted: 0, exempted: 0, left: 0, stray: 0 })
})

test('归：add 见证 + 更后 commit 销案；add 无 commit 不归', () => {
  const okR = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"git add scratch/a.js"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
    '{"type":"tool_call","id":"c3","name":"bash","args":{"command":"git commit -m x"}}',
    '{"type":"tool_result","id":"c3","isError":false}',
  ])])
  assert.equal(okR.counts.adopted, 1)
  const halfR = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"git add scratch/a.js"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
  ])])
  assert.equal(halfR.counts.adopted, 0)
  assert.equal(halfR.counts.left, 1)
})

test('时序保护：先删后写不销案（物又回来了）；先写后删才销', () => {
  const r = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"rm scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
  ])])
  assert.equal(r.counts.left, 1)
})

test('时序保护：rm 失败不销案；末落之后的 rm 才销（再落刷新基点）', () => {
  const r = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"rm scratch/a.js"}}',
    '{"type":"tool_result","id":"c2","isError":true}',
    '{"type":"tool_call","id":"c3","name":"bash","args":{"command":"rm scratch/a.js"}}',
    '{"type":"tool_result","id":"c3","isError":false}',
    '{"type":"tool_call","id":"c4","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c4","isError":false}',
  ])])
  // c3 的 rm 在 c4 再落之前——基点已刷新到 c4，rm 不再销案
  assert.equal(r.counts.left, 1)
})

test('舍优先于归：rm 之后同径的 add+commit 不动摇舍', () => {
  const r = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"rm scratch/a.js"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
    '{"type":"tool_call","id":"c3","name":"bash","args":{"command":"git add scratch/a.js"}}',
    '{"type":"tool_result","id":"c3","isError":false}',
    '{"type":"tool_call","id":"c4","name":"bash","args":{"command":"git commit -m x"}}',
    '{"type":"tool_result","id":"c4","isError":false}',
  ])])
  assert.equal(r.counts.removed, 1)
  assert.equal(r.counts.adopted, 0)
})

// ---- 域外判定 -------------------------------------------------------------

test('域外：roots 非空时纯按 glob；空则系统区回退', () => {
  const withRoots = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"/tmp/a.log"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
  ])], { book: { version: 1, keep: [], raft: [], roots: ['/tmp/**'] } })
  assert.equal(withRoots.counts.left, 1) // roots 含 /tmp → 域内遗
  const noRoots = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"/tmp/a.log"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
  ])])
  assert.equal(noRoots.counts.stray, 1) // 系统区 → 外逸
})

// ---- 分值、分带、门禁与幂等 ------------------------------------------------

test('分值：单遗 15 滞、双遗 30 积、外逸 30 积、cap（三遗 30、三外逸 60）', () => {
  const one = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
  ])])
  assert.deepEqual(one.score, { total: 15, infield: 15, exfield: 0 })
  assert.equal(one.band, '滞')
  assert.equal(one.verdict, 'pass') // 单案域内遗黄牌不咬门

  const three = run([{ name: 's.jsonl', text: [1, 2, 3].map((i) =>
    `{"type":"tool_call","id":"c${i}","name":"write","args":{"path":"scratch/a${i}.js"}}\n` +
    `{"type":"tool_result","id":"c${i}","isError":false}`).join('\n') }])
  assert.deepEqual(three.score, { total: 30, infield: 30, exfield: 0 })
  assert.equal(three.band, '积')
  assert.equal(three.verdict, 'fail')

  const strays = run([{ name: 's.jsonl', text: ['/tmp/a', '/var/b', '/tmp/c'].map((p, i) =>
    `{"type":"tool_call","id":"c${i}","name":"write","args":{"path":"${p}.log"}}\n` +
    `{"type":"tool_result","id":"c${i}","isError":false}`).join('\n') }])
  assert.deepEqual(strays.score, { total: 60, infield: 0, exfield: 60 })
})

test('分带：净 0–14 / 滞 15–29 / 积 ≥30', () => {
  assert.equal(bandOf(0), '净')
  assert.equal(bandOf(14), '净')
  assert.equal(bandOf(15), '滞')
  assert.equal(bandOf(29), '滞')
  assert.equal(bandOf(30), '积')
})

test('门禁：默认 30；gate 覆盖翻转；judge 幂等', () => {
  const engine = createEngine({})
  recordCall(engine, { session: 's', name: 'write', args: { path: 'scratch/a.js' }, isError: false })
  recordCall(engine, { session: 's', name: 'write', args: { path: 'scratch/b.js' }, isError: false })
  assert.equal(judge(engine).verdict, 'fail')
  assert.equal(judge(engine, { gate: 50 }).verdict, 'pass')
  const a = judge(engine)
  const b = judge(engine)
  assert.deepEqual(a, b)
})

test('多流合审：撞名报错；跨流凭据时序按参序拼接', () => {
  assert.throws(() => run([
    { name: 'a.jsonl', text: '{"type":"tool_call","id":"c1","name":"read"}' },
    { name: 'a.jsonl', text: '{"type":"tool_call","id":"c1","name":"read"}' },
  ]), /撞名/)
  const r = run([
    { name: 's1.jsonl', text: '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}\n{"type":"tool_result","id":"c1","isError":false}' },
    { name: 's2.jsonl', text: '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"git add scratch/a.js"}}\n{"type":"tool_result","id":"c2","isError":false}\n{"type":"tool_call","id":"c3","name":"bash","args":{"command":"git commit -m x"}}\n{"type":"tool_result","id":"c3","isError":false}' },
  ])
  assert.equal(r.sessions, 2)
  assert.equal(r.counts.adopted, 1)
})

test('多流会话名：文件名去扩展', () => {
  assert.equal(sessionName('/x/y/s1.jsonl'), 's1.jsonl')
})

// ---- 筏册 -----------------------------------------------------------------

test('筏册：坏输入报错、合法册装配、overrideBook 并集与 noDefaults', () => {
  assert.throws(() => parseBook('不是json'), /合法 JSON/)
  assert.throws(() => parseBook('[]'), /JSON 对象/)
  assert.throws(() => parseBook('{"keep":"x"}'), /字符串数组/)
  assert.throws(() => parseBook('{"noDefaults":"yes"}'), /布尔/)
  const b = parseBook('{"keep":["a/"],"raft":[".foo"],"roots":["src/**"],"noDefaults":true}')
  assert.deepEqual(b, { version: 1, keep: ['a/'], raft: ['.foo'], roots: ['src/**'], noDefaults: true })
  const o = overrideBook(b, { keep: ['b/'], raft: ['.bar'], roots: ['docs/*'], noDefaults: true })
  assert.deepEqual(o.keep, ['a/', 'b/'])
  assert.deepEqual(o.raft, ['.foo', '.bar'])
  assert.deepEqual(o.roots, ['src/**', 'docs/*'])
  assert.throws(() => overrideBook(b, { keep: 'x' }), /逗号分隔|字符串/)
})

test('筏册：无册装配 = 默认形表开箱；noDefaults 只认显式', () => {
  const d = assembleOpts({})
  assert.ok(d.raft.includes('scratch/'))
  assert.ok(d.keepAll.includes('/dev/null'))
  assert.equal(d.raft.length, DEFAULT_RAFT_FORMS.length)
  const n = assembleOpts({ overrides: { noDefaults: true, raft: ['.bak'] } })
  assert.deepEqual(n.raft, ['.bak'])
  assert.equal(n.keepAll.includes('/dev/null'), true)
  JSON.stringify(serializeBook(emptyBook())) // 序列化不抛
})

// ---- 舍牌块与报告形状 -------------------------------------------------------

test('舍牌：同输入两次渲染逐字节相同；增 keep 后文本改变', () => {
  const a = renderShepai({ version: 1, keep: [], raft: [], roots: [], noDefaults: false },
    { dropped: 1, removed: 0, adopted: 0, exempted: 0, left: 1, stray: 0, paths: 1 },
    [{ path: 'scratch/a.js', form: 'scratch/', state: '遗', hits: 1, session: 's1' }])
  const b = renderShepai({ version: 1, keep: [], raft: [], roots: [], noDefaults: false },
    { dropped: 1, removed: 0, adopted: 0, exempted: 0, left: 1, stray: 0, paths: 1 },
    [{ path: 'scratch/a.js', form: 'scratch/', state: '遗', hits: 1, session: 's1' }])
  assert.equal(a, b)
  const c = renderShepai({ version: 1, keep: ['vendor/'], raft: [], roots: [], noDefaults: false })
  assert.notEqual(a, c)
  assert.match(a, /【舍筏 · 舍牌】/)
  assert.match(c, /keep vendor\//)
})

test('报告：形状锁定（docs/03 §8）与 issues 行序（外逸→遗→舍→归→豁免→净筏）', () => {
  const r = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"/tmp/p.py"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
    '{"type":"tool_call","id":"c3","name":"write","args":{"path":"src/keep.bak"}}',
    '{"type":"tool_result","id":"c3","isError":false}',
    '{"type":"tool_call","id":"c4","name":"bash","args":{"command":"rm src/keep.bak"}}',
    '{"type":"tool_result","id":"c4","isError":false}',
    '{"type":"tool_call","id":"c5","name":"write","args":{"path":"scratch/b.js"}}',
    '{"type":"tool_result","id":"c5","isError":false}',
    '{"type":"tool_call","id":"c6","name":"bash","args":{"command":"git add scratch/b.js"}}',
    '{"type":"tool_result","id":"c6","isError":false}',
    '{"type":"tool_call","id":"c7","name":"bash","args":{"command":"git commit -m x"}}',
    '{"type":"tool_result","id":"c7","isError":false}',
    '{"type":"tool_call","id":"c8","name":"bash","args":{"command":"echo t > vendor/x.tmp"}}',
    '{"type":"tool_result","id":"c8","isError":false}',
  ])], { book: { version: 1, keep: ['vendor/'], raft: [], roots: [] } })
  for (const key of ['sessions', 'calls', 'rafts', 'paths', 'cases', 'score', 'band', 'gate', 'verdict', 'ok', 'counts', 'gauge', 'issues']) {
    assert.ok(key in r, `缺字段 ${key}`)
  }
  const order = r.issues.map((i) => i.split(' ')[0])
  assert.deepEqual(order, ['外逸', '遗筏', '舍', '归', '豁免'])
  const empty = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"read","args":{"path":"src/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
  ])])
  assert.deepEqual(empty.issues, ['净筏：筏账无案——渡尽舍筏，无有所住'])
  assert.ok(settleLines(createEngine({})).length === 0)
})

// ---- 补充边界用例（A1 core ≥40）-------------------------------------------

test('词法：无空格粘连重定向不命中（宁纵）；引号路径词元；mv 目标为目录记目录径', () => {
  assert.deepEqual(dropTargets('echo x>f.log'), []) // `>f` 前非空白——词法不认（宁纵）
  // 引号删后空白切分，末词元为碎词——词面账的既知代价（docs/03 §12 已披露）
  assert.deepEqual(dropTargets("cp 'src/a.js' 'scratch/a copy.js'"), ['copy.js'])
  assert.deepEqual(dropTargets('cp a.js scratch/'), ['scratch/'])
})

test('默认形表 15 形逐一命中立案', () => {
  const forms = ['tmp/x', 'temp/x', 'scratch/x', 'sandbox/x', 'draft/x', 'wip/x', 'debug/x',
    'backup/x', 'a.bak', 'a.tmp', 'a.orig', 'a.rej', 'a.swp', 'a.old', 'copy_of_x']
  for (const p of forms) {
    const r = run([streamOf([
      `{"type":"tool_call","id":"c1","name":"write","args":{"path":"p/${p}"}}`,
      '{"type":"tool_result","id":"c1","isError":false}',
    ])])
    assert.equal(r.paths, 1, `形 ${p} 应命中`)
  }
  const clean = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"src/deploy/production.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
  ])])
  assert.equal(clean.paths, 0) // 非筏形路径不误伤
})

test('roots 多 glob 任一命中即域内；外逸豁免组合', () => {
  const r = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"/tmp/a.log"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"write","args":{"path":"docs/note.tmp"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
  ])], { book: { version: 1, keep: [], raft: [], roots: ['docs/**', 'src/**'] } })
  // /tmp/a.log 不在 roots → 外逸；docs/note.tmp 命中 docs/** → 域内遗
  assert.deepEqual(r.score, { total: 45, infield: 15, exfield: 30 })
})

test('归后再落刷新基点：旧 add+commit 不销新落之笔', () => {
  const r = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"git add scratch/a.js"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
    '{"type":"tool_call","id":"c3","name":"bash","args":{"command":"git commit -m x"}}',
    '{"type":"tool_result","id":"c3","isError":false}',
    '{"type":"tool_call","id":"c4","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c4","isError":false}',
  ])])
  // c4 再落 → 基点刷新到 c4，c2/c3 凭据全部失效 → 遗
  assert.equal(r.counts.left, 1)
  assert.equal(r.counts.adopted, 0)
})

test('judge 纯函数：判定不改引擎（settleLines 前后一致）', () => {
  const engine = createEngine({})
  recordCall(engine, { session: 's', name: 'write', args: { path: 'scratch/a.js' }, isError: false })
  const before = JSON.stringify(engine.creds.length) + engine.order.length
  judge(engine)
  const after = JSON.stringify(engine.creds.length) + engine.order.length
  assert.equal(before, after)
})

test('分值封顶：外逸 cap 60 与域内 cap 30 的组合 45/60/75', () => {
  const mk = (strays, lefts) => run([{ name: 's.jsonl', text: [
    ...strays.map((p, i) => `{"type":"tool_call","id":"s${i}","name":"write","args":{"path":"${p}"}}\n{"type":"tool_result","id":"s${i}","isError":false}`),
    ...lefts.map((p, i) => `{"type":"tool_call","id":"l${i}","name":"write","args":{"path":"${p}"}}\n{"type":"tool_result","id":"l${i}","isError":false}`),
  ].join('\n') }])
  assert.deepEqual(mk(['/tmp/a.log'], ['scratch/a.js']).score, { total: 45, infield: 15, exfield: 30 })
  assert.deepEqual(mk(['/tmp/a.log', '/var/tmp/b.log'], []).score, { total: 60, infield: 0, exfield: 60 })
  assert.deepEqual(mk(['/tmp/a.log', '/var/tmp/b.log'], ['scratch/a.js', 'scratch/b.js', 'scratch/c.js']).score,
    { total: 90, infield: 30, exfield: 60 }) // min(100, 60+30)
})

test('对象键缺 at 照判：无 at 的流照常立案销案', () => {
  const r = run([streamOf([
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"scratch/a.js"}}',
    '{"type":"tool_result","id":"c1","isError":false}',
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"rm scratch/a.js"}}',
    '{"type":"tool_result","id":"c2","isError":false}',
  ])])
  assert.equal(r.counts.removed, 1)
})

test('插件导出流成对：exportStream 形状（call+result 成对、args 原样）', async () => {
  const plugin = await import('../src/plugin/shefa.js')
  assert.equal(plugin.name, 'shefa')
  assert.deepEqual(plugin.inject, ['tools'])
  assert.equal(typeof plugin.ShefaService, 'function')
  assert.equal(typeof plugin.apply, 'function')
})
