/**
 * 乡校核心测试 —— 词形表、首见定案、判定序、分值、分带、门禁（A1/A2）。
 * 期望值先于实现手算锁死（docs/03 §10），实现与手算冲突只能改实现。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf } from '../src/core/object.js'
import {
  DEFAULT_MUTE_FORMS, DEFAULT_SKIP_FORMS, DEFAULT_BYPASS_FORMS, JUSTIFIED_FORM,
  compileForms, isCodePath, contentOf, scanLines,
} from '../src/core/cixing.js'
import { emptyRegistry, parseRegistry, addMutes, addForms, revoke, registryCount } from '../src/core/shengce.js'
import { createEngine, recordCall, judge, bandOf, GATE_DEFAULT, assembleOpts } from '../src/core/shengzhang.js'
import { renderJianpai } from '../src/core/jianpai.js'
import { auditStreams, sessionName } from '../src/core/audit.js'

// ---------------------------------------------------------------- 流解析

test('流解析：# 注释与空行被跳过', () => {
  const ev = parseStream('# 注释\n\n{"type":"tool_call","id":"a","name":"read","args":{}}\n')
  assert.equal(ev.length, 1)
})

test('流解析：坏行报行号', () => {
  assert.throws(() => parseStream('{"type":"tool_call"}\nnot-json\n'), /第 2 行/)
})

test('流解析：id 配对回填 isError 与 content', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"a","name":"read","args":{"path":"x.js"}}\n' +
    '{"type":"tool_result","id":"a","name":"read","isError":false,"content":"file body"}\n'
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
  assert.equal(calls[0].content, 'file body')
})

test('流解析：孤儿 result 独立建档且带 content', () => {
  const { calls } = buildCalls(parseStream('{"type":"tool_result","name":"read","isError":false,"content":"body"}'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].content, 'body')
})

// ---------------------------------------------------------------- 对象键与工具族

test('对象键：p:/c:/n: 三级回退', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'write'), 'p:a.js')
  assert.equal(objectKey({ command: ' ls ' }, 'bash'), 'c:ls')
  assert.equal(objectKey({}, 'read'), 'n:read')
})

test('工具族：observe/write/exec/other', () => {
  assert.equal(familyOf('read'), 'observe')
  assert.equal(familyOf('multi_edit'), 'write')
  assert.equal(familyOf('Bash'), 'exec')
  assert.equal(familyOf('think'), 'other')
})

// ---------------------------------------------------------------- 词形表

test('缄形 m01–m05：逐形命中', () => {
  const forms = compileForms(DEFAULT_MUTE_FORMS.slice(0, 5))
  const samples = [
    'const x = 1 // @ts-ignore\n',
    '// @ts-nocheck\n',
    '/* eslint-disable no-console */\n',
    'x = fetch()  # noqa\n',
    'y = parse(s)  # type: ignore\n',
  ]
  for (let i = 0; i < 5; i++) {
    const hits = scanLines(samples[i], forms)
    assert.equal(hits.length, 1, samples[i])
    assert.equal(hits[0].form.id, `m0${i + 1}`)
    assert.equal(hits[0].line, 1)
  }
})

test('缄形 m06–m10：逐形命中', () => {
  const forms = compileForms(DEFAULT_MUTE_FORMS.slice(5))
  const samples = [
    '@SuppressWarnings("unchecked")\n',
    '#[allow(dead_code)]\n',
    '#![allow(unused)]\n',
    'foo() //nolint\n',
    '# shellcheck disable=SC2086\n',
    '# rubocop:disable Metrics/MethodLength\n',
  ]
  const expectIds = ['m06', 'm07', 'm07', 'm08', 'm09', 'm10']
  for (let i = 0; i < samples.length; i++) {
    const hits = scanLines(samples[i], forms)
    assert.equal(hits.length, 1, samples[i])
    assert.equal(hits[0].form.id, expectIds[i], samples[i])
  }
})

test('词界与大小写防御：@ts-ignores 与 @TS-IGNORE 不命中', () => {
  const forms = compileForms(DEFAULT_MUTE_FORMS.slice(0, 2))
  assert.equal(scanLines('const a = obj.ts_ignores\n', forms).length, 0)
  assert.equal(scanLines('// @ts-ignores many\n', forms).length, 0)
  assert.equal(scanLines('// @TS-IGNORE\n', forms).length, 0)
})

test('略形 s01–s05：逐形命中', () => {
  const forms = compileForms(DEFAULT_SKIP_FORMS)
  const samples = [
    "it.skip('a', () => {})\n",
    "xdescribe('b', () => {})\n",
    '@unittest.skip\nclass T:\n',
    '@pytest.mark.xfail\ndef t():\n',
    '@Disabled\nclass C {}\n',
  ]
  const expectIds = ['s01', 's02', 's03', 's04', 's05']
  for (let i = 0; i < samples.length; i++) {
    const hits = scanLines(samples[i], forms)
    assert.equal(hits.length, 1, samples[i])
    assert.equal(hits[0].form.id, expectIds[i], samples[i])
  }
})

test('略形词界：submit.skip 与 skipIf 不命中（宁纵）', () => {
  const forms = compileForms(DEFAULT_SKIP_FORMS)
  assert.equal(scanLines('submit.skip(() => {})\n', forms).length, 0)
  assert.equal(scanLines('@unittest.skipIf(cond, "x")\n', forms).length, 0)
  assert.equal(scanLines('@pytest.mark.skipif(cond)\n', forms).length, 0)
})

test('避形 b01 与凭形 j01', () => {
  const bypass = compileForms(DEFAULT_BYPASS_FORMS)
  assert.equal(scanLines('git commit --no-verify -m x', bypass).length, 1)
  assert.equal(scanLines('git commit -m x', bypass).length, 0)
  const j = compileForms([JUSTIFIED_FORM])[0]
  assert.ok(j.re.test('// @ts-expect-error 未知形状'))
  assert.ok(!j.re.test('// @ts-expect-errors'))
})

test('代码后缀门：默认 22 后缀，extraExts 可增，.md 不在', () => {
  for (const ext of ['.js', '.ts', '.tsx', '.py', '.java', '.kt', '.rs', '.go', '.rb', '.cs', '.php', '.c', '.sh']) {
    assert.ok(isCodePath(`a/b${ext}`), ext)
  }
  assert.ok(!isCodePath('a/b.md'))
  assert.ok(!isCodePath('a/b.json'))
  assert.ok(isCodePath('a/b.vue', ['.vue']))
})

test('内容字段：按序取首个非空字符串', () => {
  assert.equal(contentOf({ text: 'a', content: 'b' }), 'b')
  assert.equal(contentOf({ new_string: 'c', text: 'a' }), 'a') // 锁死序：text 先于 new_string
  assert.equal(contentOf({ content: '' }), null)
  assert.equal(contentOf(null), null)
})

// ---------------------------------------------------------------- 判定序

function feed(engine, seq) {
  for (const [id, name, args, isError, content] of seq) {
    recordCall(engine, { session: 's', ref: id, name, args, isError, content: content ?? null })
  }
  return engine
}

test('缄笔立案：write 成功 + @ts-ignore → 1 案 30 分带「毁」门红', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content: '// @ts-ignore 临时\nconst x = 1\n' }, false],
  ])
  const r = judge(engine)
  assert.equal(r.counts.mutedDirectives, 1)
  assert.equal(r.cases, 1)
  assert.deepEqual(r.score, { total: 30, silence: 30, bypass: 0, skip: 0 })
  assert.equal(r.band, '毁')
  assert.equal(r.verdict, 'fail')
  assert.match(r.issues[0], /缄笔 ×1/)
  assert.match(r.issues[0], /src\/a\.js:1 ts-ignore/)
})

test('同文件多行同形 → 1 案（首见行号），两形 → 2 案', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content: '// @ts-ignore A\nconst x = 1 // @ts-ignore B\n' }, false],
  ])
  assert.equal(judge(engine).counts.mutedDirectives, 1)

  const engine2 = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content: '/* eslint-disable x */\n// @ts-ignore\n' }, false],
  ])
  const r2 = judge(engine2)
  assert.equal(r2.counts.mutedDirectives, 2)
  assert.equal(r2.score.silence, 60)
})

test('非代码后缀不判；extraExts 增词后判；无 p: 与失败之写不判', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'docs/a.md', content: '// @ts-ignore 文档提及\n' }, false],
    ['c2', 'write', { path: 'src/a.vue', content: '// @ts-ignore vue\n' }, false],
    ['c3', 'write', { content: '// @ts-ignore 无径\n' }, false],
    ['c4', 'write', { path: 'src/b.js', content: '// @ts-ignore 失败写\n' }, true],
    ['c5', 'write', { path: 'src/c.vue', content: '// @ts-ignore 增词\n' }, false],
  ])
  const r = judge(engine, {})
  assert.equal(r.counts.mutedDirectives, 0) // .md 非代码、.vue 未登记增词、无径、失败写——四路皆不判
})

test('extraExts 注入后 .vue 之写照判', () => {
  const engine = createEngine({ registry: { version: 1, mute: [], forms: [], noDefaults: false, extraExts: ['.vue'] } })
  feed(engine, [['c1', 'write', { path: 'src/a.vue', content: '// @ts-ignore\n' }, false]])
  assert.equal(judge(engine).counts.mutedDirectives, 1)
})

test('读侧先见 → 保留注记 0 分；再写占位去重；异形仍立案', () => {
  const engine = createEngine()
  feed(engine, [
    ['k1', 'read', { path: 'src/old.js' }, false, '// @ts-ignore 旧债\n'],
    ['k2', 'write', { path: 'src/old.js', content: '// @ts-ignore 旧债\n' }, false],
    ['k3', 'write', { path: 'src/old.js', content: '// @ts-ignore 旧债\n// @ts-nocheck 新形\n' }, false],
  ])
  const r = judge(engine)
  assert.equal(r.counts.keptDirectives, 1)
  assert.equal(r.counts.mutedDirectives, 1) // @ts-nocheck 未见先见 → 立案
  assert.deepEqual(r.score, { total: 30, silence: 30, bypass: 0, skip: 0 })
  assert.ok(r.issues.join('\n').includes('保留 ×1'))
})

test('先立案后重写 → 去重（不重复计分）', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content: '// @ts-ignore\n' }, false],
    ['c2', 'read', { path: 'src/a.js' }, false, '// @ts-ignore\n'],
    ['c3', 'write', { path: 'src/a.js', content: '// @ts-ignore\n' }, false],
  ])
  const r = judge(engine)
  assert.equal(r.counts.mutedDirectives, 1)
  assert.equal(r.counts.keptDirectives, 0)
})

test('豁免：行内 mute 共现 → 注记不计分；豁免后同径裸写仍立案（不占先见位）', () => {
  const engine = feed(createEngine({ extraMutes: ['WPS-4119'] }), [
    ['c1', 'write', { path: 'src/a.js', content: '// @ts-ignore WPS-4119 上游缺陷\n' }, false],
    ['c2', 'write', { path: 'src/a.js', content: '// @ts-ignore WPS-4119 上游缺陷\n' }, false],
    ['c3', 'write', { path: 'src/b.js', content: '// @ts-ignore 新增\n' }, false],
  ])
  const r = judge(engine)
  assert.equal(r.counts.exempted, 1)
  assert.equal(r.counts.mutedDirectives, 1) // c3 新径立案；c1/c2 豁免（同径同形只记一次）
  assert.equal(r.score.total, 30)
  assert.ok(r.issues.join('\n').includes('豁免 ×1'))
})

test('mute 并集：声册与引擎追加同时生效', () => {
  const registry = { version: 1, mute: ['AAA'], forms: [], noDefaults: false, extraExts: [] }
  const engine = createEngine({ registry, extraMutes: ['BBB'] })
  feed(engine, [
    ['c1', 'write', { path: 'src/a.js', content: '// @ts-ignore AAA\n' }, false],
    ['c2', 'write', { path: 'src/b.js', content: '// @ts-ignore BBB\n' }, false],
  ])
  const r = judge(engine)
  assert.equal(r.counts.exempted, 2)
  assert.equal(r.score.total, 0)
})

test('避检：成功侧立案、失败侧不记、逐调用计案', () => {
  const okEngine = feed(createEngine(), [
    ['c1', 'bash', { command: 'git commit --no-verify -m wip' }, false],
    ['c2', 'bash', { command: 'git commit --no-verify -m wip2' }, false],
  ])
  const ok = judge(okEngine)
  assert.equal(ok.counts.bypassFlags, 2)
  assert.equal(ok.score.bypass, 60)

  const badEngine = feed(createEngine(), [
    ['c1', 'bash', { command: 'git commit --no-verify -m wip' }, true],
  ])
  const bad = judge(badEngine)
  assert.equal(bad.counts.bypassFlags, 0)
  assert.equal(bad.score.total, 0)
})

test('有凭之默：注记不计分；同行有缄形时以案为准', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.ts', content: '// @ts-expect-error 未知形状\nconst n = 1\n' }, false],
    ['c2', 'write', { path: 'src/b.ts', content: '// @ts-expect-error @ts-ignore 同行\nconst m = 2\n' }, false],
  ])
  const r = judge(engine)
  assert.equal(r.counts.justified, 1)
  assert.equal(r.counts.mutedDirectives, 1)
  assert.equal(r.score.total, 30)
  assert.ok(r.issues.join('\n').includes('有凭之默 ×1'))
})

test('noDefaults 关默认形；显式形并集生效', () => {
  const engine = createEngine({ registry: { version: 1, mute: [], forms: ['WONTFIX'], noDefaults: true, extraExts: [] } })
  feed(engine, [
    ['c1', 'write', { path: 'src/a.js', content: '// @ts-ignore 默认形已关\n' }, false],
    ['c2', 'write', { path: 'src/b.js', content: '// WONTFIX 显式形在岗\n' }, false],
  ])
  const r = judge(engine)
  assert.equal(r.counts.mutedDirectives, 1)
  assert.match(r.issues.join('\n'), /WONTFIX/)
})

test('坏显式形：assembleOpts 抛错（CLI 转 exit 2）', () => {
  assert.throws(() => createEngine({ registry: { version: 1, mute: [], forms: ['([bad'], noDefaults: true, extraExts: [] } }))
})

// ---------------------------------------------------------------- 声册

test('声册：缺省补全，坏籍报错', () => {
  const r = parseRegistry('{"version":1}')
  assert.deepEqual(r.mute, [])
  assert.equal(r.noDefaults, false)
  assert.throws(() => parseRegistry('{"version":0}'), /version/)
  assert.throws(() => parseRegistry('{"version":1,"mute":"x"}'), /mute/)
  assert.throws(() => parseRegistry('{"version":1,"noDefaults":"x"}'), /noDefaults/)
  assert.throws(() => parseRegistry('not-json'), /JSON/)
  assert.throws(() => parseRegistry('{"version":1,"forms":["([bad"]}'), /正则/)
})

test('声册：重复登记与销名', () => {
  let r = emptyRegistry()
  r = addMutes(r, ['WPS-4119'])
  assert.throws(() => addMutes(r, ['WPS-4119']), /已在册/)
  r = addForms(r, ['--nocommit-hook'])
  assert.throws(() => addForms(r, ['--nocommit-hook']), /已在册/)
  r = revoke(r, { mute: 'WPS-4119' })
  assert.throws(() => revoke(r, { mute: 'WPS-4119' }), /无此豁免词/)
  r = revoke(r, { form: '--nocommit-hook' })
  assert.throws(() => revoke(r, { form: '--nocommit-hook' }), /无此显式形/)
  assert.equal(registryCount(emptyRegistry()), 0)
})

// ---------------------------------------------------------------- 分值 / 分带 / 门禁

test('cap：三缄笔 60（30×3 封顶）、四略测 30（10×4 封顶）', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content: '// @ts-ignore\n/* eslint-disable x */\n#noqa\n' }, false],
    ['c2', 'write', { path: 'src/b.js', content: '// @ts-nocheck\n' }, false],
  ])
  assert.equal(judge(engine).score.silence, 60)

  const engine2 = feed(createEngine(), [
    ['c1', 'write', { path: 'test/a.test.js', content: 'it.skip("1")\n' }, false],
    ['c2', 'write', { path: 'test/b.test.js', content: 'it.skip("2")\n' }, false],
    ['c3', 'write', { path: 'test/c.test.js', content: 'it.skip("3")\n' }, false],
    ['c4', 'write', { path: 'test/d.test.js', content: 'it.skip("4")\n' }, false],
  ])
  assert.equal(judge(engine2).score.skip, 30)
})

test('total cap 100', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content: '// @ts-ignore\n/* eslint-disable x */\n#noqa\n' }, false],
    ['c2', 'write', { path: 'src/b.js', content: '// @ts-nocheck\n' }, false],
    ['c3', 'bash', { command: 'git commit --no-verify' }, false],
    ['c4', 'bash', { command: 'git push --no-verify' }, false],
    ['c5', 'bash', { command: 'git commit --no-verify --no-verify' }, false],
    ['c6', 'write', { path: 'test/t.test.js', content: 'it.skip("1")\nit.skip("2")\nit.skip("3")\nit.skip("4")\n' }, false],
  ])
  assert.equal(judge(engine).score.total, 100)
})

test('分带边界：14 畅 / 15 壅 / 29 壅 / 30 毁；门默认 30', () => {
  assert.equal(bandOf(0), '畅')
  assert.equal(bandOf(14), '畅')
  assert.equal(bandOf(15), '壅')
  assert.equal(bandOf(29), '壅')
  assert.equal(bandOf(30), '毁')
  assert.equal(GATE_DEFAULT, 30)
})

test('门可调：--gate 语义（>= 门即红）', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'test/a.test.js', content: 'it.skip("1")\n' }, false],
    ['c2', 'write', { path: 'test/b.test.js', content: 'it.skip("2")\n' }, false],
  ])
  const r = judge(engine, { gate: 15 })
  assert.equal(r.score.total, 20)
  assert.equal(r.verdict, 'fail')
  assert.equal(r.gate, 15)
})

test('issues 行序：缄笔 → 避检 → 略测；无案时净声收尾', () => {
  const engine = feed(createEngine(), [
    ['c1', 'bash', { command: 'git commit --no-verify' }, false],
    ['c2', 'write', { path: 'test/a.test.js', content: 'it.skip("1")\n' }, false],
    ['c3', 'write', { path: 'src/a.js', content: '// @ts-ignore\n' }, false],
  ])
  const issues = judge(engine).issues
  assert.match(issues[0], /^缄笔 ×1/)
  assert.match(issues[1], /^避检 ×1/)
  assert.match(issues[2], /^略测 ×1/)

  const clean = judge(createEngine())
  assert.match(clean.issues[0], /净声/)
})

// ---------------------------------------------------------------- 谏牌块

test('谏牌块：同一声册两次渲染逐字节相同；空册确定性文本', () => {
  const reg = parseRegistry(readFileSync(join(root, 'fixtures', 'hushed-book.json'), 'utf8'))
  const a = renderJianpai(reg)
  const b = renderJianpai(reg)
  assert.equal(a, b)
  assert.ok(a.includes('WPS-4119'))
  assert.ok(a.includes('是吾师也，若之何毁之'))
  const empty = renderJianpai(emptyRegistry())
  assert.ok(empty.includes('空册'))
  assert.equal(empty, renderJianpai(emptyRegistry()))
})

// ---------------------------------------------------------------- 多流与夹具（A2 手算锁死）

test('多流合并：跨会话先见生效、(径,形) 跨会话去重、撞名报错', () => {
  const r = auditStreams([
    { name: 'a.jsonl', text: streamOf([['c1', 'read', { path: 'src/old.js' }, false, '// @ts-ignore 旧债\n'], ['c2', 'write', { path: 'src/old.js', content: '// @ts-ignore\n' }, false]]) },
    { name: 'b.jsonl', text: streamOf([['d1', 'write', { path: 'src/old.js', content: '// @ts-ignore\n' }, false]]) },
  ], {})
  assert.equal(r.sessions, 2)
  assert.equal(r.counts.keptDirectives, 1)
  assert.equal(r.counts.mutedDirectives, 0)
  assert.equal(r.score.total, 0)

  assert.throws(() => auditStreams([
    { name: 'a.jsonl', text: '' },
    { name: 'x/a.jsonl', text: '' },
  ], {}), /撞名/)
})

test('bash 黑盒写不判：heredoc 之静音指令不在扫描面（宁漏勿诬）', () => {
  const engine = feed(createEngine(), [
    ['c1', 'bash', { command: "cat > a.js <<EOF\n// @ts-ignore\nEOF" }, false],
  ])
  const r = judge(engine)
  assert.equal(r.writes, 0)
  assert.equal(r.cases, 0)
  assert.equal(r.score.total, 0)
})

test('前缀一致：运行时逐步判定与离线全量重放同分（案不回撤）', () => {
  const seq = [
    ['c1', 'read', { path: 'src/old.js' }, false, '// @ts-ignore 旧债\n'],
    ['c2', 'write', { path: 'src/old.js', content: '// @ts-ignore 旧债\n' }, false],
    ['c3', 'write', { path: 'src/new.js', content: '// @ts-ignore 新增\n' }, false],
    ['c4', 'bash', { command: 'git commit --no-verify' }, false],
  ]
  const full = createEngine()
  feed(full, seq)
  const fullScore = judge(full).score.total

  const steps = []
  const live = createEngine()
  for (const rec of seq) {
    recordCall(live, { session: 's', ref: rec[0], name: rec[1], args: rec[2], isError: rec[3], content: rec[4] ?? null })
    steps.push(judge(live).score.total)
  }
  assert.equal(steps[steps.length - 1], fullScore)
  assert.equal(fullScore, 60) // 缄笔 30 + 避检 30（保留不计分）
  assert.ok(steps.every((v, i) => i === 0 || v >= steps[i - 1]), '分数单调不减（案不回撤）')
})

test('sessionName 取 basename', () => {
  assert.equal(sessionName('/tmp/hushed-stream.jsonl'), 'hushed-stream.jsonl')
})

test('A2：clean-stream —— 3 调用、写 2、cases 0、值 0、带「畅」、有凭之默 1', () => {
  const r = auditStreams([{ name: 'clean-stream.jsonl', text: fixtureText('clean-stream.jsonl') }], {})
  assert.equal(r.sessions, 1)
  assert.equal(r.calls, 3)
  assert.equal(r.writes, 2)
  assert.equal(r.cases, 0)
  assert.deepEqual(r.score, { total: 0, silence: 0, bypass: 0, skip: 0 })
  assert.equal(r.band, '畅')
  assert.equal(r.verdict, 'pass')
  assert.deepEqual(r.counts, {
    mutedDirectives: 0, bypassFlags: 0, skippedTests: 0, keptDirectives: 0, justified: 1, exempted: 0,
  })
  assert.equal(r.ok, true)
})

test('A2：hushed-stream —— 3 调用、写 2、cases 4、值 {90,60,30,0}、带「毁」、exit 1', () => {
  const r = auditStreams([{ name: 'hushed-stream.jsonl', text: fixtureText('hushed-stream.jsonl') }], {})
  assert.equal(r.calls, 3)
  assert.equal(r.writes, 2)
  assert.equal(r.cases, 4)
  assert.deepEqual(r.score, { total: 90, silence: 60, bypass: 30, skip: 0 })
  assert.equal(r.band, '毁')
  assert.equal(r.verdict, 'fail')
  assert.equal(r.ok, false)
  assert.deepEqual(r.counts, {
    mutedDirectives: 3, bypassFlags: 1, skippedTests: 0, keptDirectives: 0, justified: 0, exempted: 0,
  })
})

test('A2：skippy-stream —— cases 2、值 {20,0,0,20}、带「壅」、exit 0', () => {
  const r = auditStreams([{ name: 'skippy-stream.jsonl', text: fixtureText('skippy-stream.jsonl') }], {})
  assert.equal(r.calls, 3)
  assert.equal(r.writes, 2)
  assert.equal(r.cases, 2)
  assert.deepEqual(r.score, { total: 20, silence: 0, bypass: 0, skip: 20 })
  assert.equal(r.band, '壅')
  assert.equal(r.verdict, 'pass')
  assert.deepEqual(r.counts, {
    mutedDirectives: 0, bypassFlags: 0, skippedTests: 2, keptDirectives: 0, justified: 0, exempted: 0,
  })
})

test('A2：kept-stream —— cases 1、值 {10,0,0,10}、带「畅」、保留 1', () => {
  const r = auditStreams([{ name: 'kept-stream.jsonl', text: fixtureText('kept-stream.jsonl') }], {})
  assert.equal(r.calls, 3)
  assert.equal(r.writes, 2)
  assert.equal(r.cases, 1)
  assert.deepEqual(r.score, { total: 10, silence: 0, bypass: 0, skip: 10 })
  assert.equal(r.band, '畅')
  assert.equal(r.verdict, 'pass')
  assert.deepEqual(r.counts, {
    mutedDirectives: 0, bypassFlags: 0, skippedTests: 1, keptDirectives: 1, justified: 0, exempted: 0,
  })
})

test('A2：exempt-stream 带 --mute —— cases 1、值 30、豁免 1；不带 —— cases 2、值 60', () => {
  const withMute = auditStreams([{ name: 'exempt-stream.jsonl', text: fixtureText('exempt-stream.jsonl') }], { mutes: ['WPS-4119'] })
  assert.equal(withMute.cases, 1)
  assert.deepEqual(withMute.score, { total: 30, silence: 30, bypass: 0, skip: 0 })
  assert.equal(withMute.band, '毁')
  assert.equal(withMute.verdict, 'fail')
  assert.deepEqual(withMute.counts, {
    mutedDirectives: 1, bypassFlags: 0, skippedTests: 0, keptDirectives: 0, justified: 0, exempted: 1,
  })

  const withoutMute = auditStreams([{ name: 'exempt-stream.jsonl', text: fixtureText('exempt-stream.jsonl') }], {})
  assert.equal(withoutMute.cases, 2)
  assert.deepEqual(withoutMute.score, { total: 60, silence: 60, bypass: 0, skip: 0 })
  assert.deepEqual(withoutMute.counts, {
    mutedDirectives: 2, bypassFlags: 0, skippedTests: 0, keptDirectives: 0, justified: 0, exempted: 0,
  })
})

test('A2：多流合并 clean + hushed —— 会话数 2、calls 6、值 90', () => {
  const r = auditStreams([
    { name: 'clean-stream.jsonl', text: fixtureText('clean-stream.jsonl') },
    { name: 'hushed-stream.jsonl', text: fixtureText('hushed-stream.jsonl') },
  ], {})
  assert.equal(r.sessions, 2)
  assert.equal(r.calls, 6)
  assert.equal(r.score.total, 90)
  assert.equal(r.counts.justified, 1)
})

// ---------------------------------------------------------------- helpers

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const fixtureText = (name) => readFileSync(join(root, 'fixtures', name), 'utf8')

function streamOf(seq) {
  return seq.map(([id, name, args, isError, content]) => (
    `{"type":"tool_call","id":"${id}","name":"${name}","args":${JSON.stringify(args)}}\n` +
    `{"type":"tool_result","id":"${id}","name":"${name}","args":${JSON.stringify(args)},"isError":${isError}${content ? `,"content":${JSON.stringify(content)}` : ''}}\n`
  )).join('')
}
