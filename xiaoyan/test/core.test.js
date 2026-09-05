/**
 * 核心判定语义测试 —— 断言 docs/03 锁死的每一个数字与文本。
 * 夹具期望值（A2/A3）先于实现手算定死（docs/04），实测必须逐字吻合。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseStream, buildRaw } from '../src/core/stream.js'
import { DEFAULT_XIAO_WORDS, normalizeWords, matchWords, collapse, wordHit } from '../src/core/words.js'
import { computeAccount, bandOf, GATE_DEFAULT, mask, excerpt48, extractTokens } from '../src/core/xiao.js'
import { renderZheng } from '../src/core/zheng.js'
import { auditStream } from '../src/core/audit.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8')

const line = (obj) => JSON.stringify(obj)
const call = (id, name, args, at = 1) => ({ type: 'tool_call', id, name, args, at })
const result = (id, name, args, patch = {}, at = 2) => ({ type: 'tool_result', id, name, args, isError: false, ...patch, at })
const audit = (text, opts = {}) => auditStream(text, opts)
const auditCalls = (calls, opts = {}) => computeAccount({ principalBlocks: 0, calls }, opts)

// ---------- 流解析 ----------

test('解析：# 与空行为注释，坏行报行号', () => {
  const text = '# 注释\n\n{"type":"principal","text":"任务"}\n{oops}\n'
  assert.throws(() => parseStream(text), /第 4 行/)
})

test('解析：id 配对回填 isError 与 content', () => {
  const raw = buildRaw(parseStream([line(call('a1', 'bash', { command: 'npm test' })), line(result('a1', 'bash', { command: 'npm test' }, { isError: false, content: 'ok' }))].join('\n')))
  assert.equal(raw.calls.length, 1)
  assert.equal(raw.calls[0].isError, false)
  assert.equal(raw.calls[0].content, 'ok')
})

test('解析：content 空串保留、缺失保持 undefined（记住空）', () => {
  const raw = buildRaw(parseStream([
    line(call('a1', 'bash', { command: 'x' })),
    line(result('a1', 'bash', { command: 'x' }, { content: '' })),
    line(call('a2', 'bash', { command: 'y' })),
    line(result('a2', 'bash', { command: 'y' }, {})),
  ].join('\n')))
  assert.equal(raw.calls[0].content, '')
  assert.equal(raw.calls[1].content, undefined)
})

test('解析：无 id 旧格式并入紧邻 call（zhizhi 格式）', () => {
  const text = [
    line({ type: 'tool_call', name: 'bash', args: { command: 'npm test' } }),
    line({ type: 'tool_result', name: 'bash', args: { command: 'npm test' }, isError: false }),
  ].join('\n')
  const raw = buildRaw(parseStream(text))
  assert.equal(raw.calls.length, 1)
  assert.equal(raw.calls[0].isError, false)
  assert.equal(raw.calls[0].content, undefined)
})

test('解析：孤儿 result 独立建档；turn/principal 不入 calls；principal 计数', () => {
  const text = [
    line({ type: 'turn_start', id: 't1' }),
    line({ type: 'principal', text: '任务' }),
    line({ type: 'principal', text: '补充' }),
    line({ type: 'tool_result', id: 'orphan', name: 'bash', args: {}, isError: true }),
  ].join('\n')
  const raw = buildRaw(parseStream(text))
  assert.equal(raw.principalBlocks, 2)
  assert.equal(raw.calls.length, 1)
  assert.equal(raw.calls[0].isError, true)
})

// ---------- 词表 ----------

test('词界：latest 不误伤 test；parse.test.js 命中 test', () => {
  assert.equal(wordHit('{"command":"npm install pkg@latest"}', 'test'), false)
  assert.equal(wordHit('{"command":"vitest run src/parse.test.js"}', 'test'), true)
  assert.equal(wordHit('spec helpers', 'spec'), true)
})

test('CJK 子串匹配；ASCII 词界不咬中文相邻', () => {
  assert.equal(wordHit('运行测试与构建', '测试'), true)
  assert.equal(wordHit('运行测试与构建', '构建'), true)
  assert.equal(wordHit('plain text', '测试'), false)
})

test('词表并集：自定义追加、小写化、去重，默认表不可删减', () => {
  const words = [...new Set([...DEFAULT_XIAO_WORDS, ...normalizeWords(['Deploy', 'deploy', '测试'])])]
  assert.ok(words.includes('deploy'))
  assert.ok(words.includes('test'))
  assert.equal(words.filter((w) => w === 'deploy').length, 1)
  assert.equal(words.filter((w) => w === '测试').length, 1)
  assert.equal(words.length, DEFAULT_XIAO_WORDS.length + 1)
})

test('命中坍缩：最长词胜出', () => {
  assert.deepEqual(collapse(['test', 'vitest']), ['vitest'])
  assert.deepEqual(collapse(['lint', 'check']), ['lint', 'check'])
})

test('默认效词表恰 26 条（ASCII 18 + CJK 8，见 docs/03 §4 勘误）', () => {
  assert.equal(DEFAULT_XIAO_WORDS.length, 26)
})

// ---------- 判定序与发现 ----------

test('失败与成败未知不入账；非效类静默成功合法沉默', () => {
  const acc = auditCalls([
    { seq: 1, ref: 'f1', name: 'bash', args: { command: 'npm test' }, isError: true, content: 'boom' },
    { seq: 2, ref: 'n1', name: 'bash', args: { command: 'npm test' }, isError: null, content: '' },
    { seq: 3, ref: 'm1', name: 'bash', args: { command: 'mkdir -p x' }, isError: false, content: undefined },
  ])
  assert.deepEqual(acc.counts, { successes: 1, verified: 0, exempted: 0, vacuous: 0, echo: 0, stray: 0, stale: 0 })
  assert.equal(acc.score.total, 0)
})

test('空言：空串、纯空白、缺失内容各 +25', () => {
  for (const content of ['', '   ', undefined]) {
    const acc = auditCalls([{ seq: 1, ref: 'v', name: 'bash', args: { command: 'npm test' }, isError: false, content }])
    assert.equal(acc.counts.vacuous, 1)
    assert.equal(acc.score.vacuity, 25)
    assert.equal(acc.band, '疏')
    assert.equal(acc.ok, true, '单件空言 25 分落疏带，不咬门')
  }
})

test('虚分封顶：两件 50，三件仍 50', () => {
  const mk = (n) => auditCalls(Array.from({ length: n }, (_, i) => ({ seq: i + 1, ref: `v${i}`, name: 'bash', args: { command: `npm test ${i}` }, isError: false, content: '' })))
  assert.equal(mk(2).score.vacuity, 50)
  assert.equal(mk(3).score.vacuity, 50)
  assert.equal(mk(3).score.total, 50)
})

test('回令：输出是 argsText 的子串（大小写/空白不敏感）+20；带额外内容不构成回令', () => {
  const echo = auditCalls([{ seq: 1, ref: 'e', name: 'bash', args: { command: 'npm run smoke' }, isError: false, content: '  npm run smoke\n' }])
  assert.equal(echo.counts.echo, 1)
  assert.equal(echo.score.echo, 20)
  const richer = auditCalls([{ seq: 1, ref: 'e', name: 'bash', args: { command: 'npm run smoke' }, isError: false, content: 'npm run smoke\nall up' }])
  assert.equal(richer.counts.echo, 0)
})

test('回分封顶：两件 30', () => {
  const acc = auditCalls([
    { seq: 1, ref: 'e1', name: 'bash', args: { command: 'npm run smoke' }, isError: false, content: 'npm run smoke' },
    { seq: 2, ref: 'e2', name: 'bash', args: { command: 'npm run build' }, isError: false, content: 'npm run build' },
  ])
  assert.equal(acc.score.echo, 30)
  assert.equal(acc.band, '虚')
})

test('离效：词元零相干只点名不计分', () => {
  const acc = auditCalls([{ seq: 1, ref: 's', name: 'bash', args: { command: 'npm run smoke' }, isError: false, content: 'All health checks OK · uptime 42s' }])
  assert.equal(acc.counts.stray, 1)
  assert.equal(acc.score.total, 0)
  assert.match(acc.issues[0], /^离效：调用1 bash s 答非所问/)
})

test('离效宁纵：词元命中即不点名（npm test → "Tests: 5 passed" 命中 test）', () => {
  const acc = auditCalls([{ seq: 1, ref: 'c', name: 'bash', args: { command: 'npm test' }, isError: false, content: 'Tests: 5 passed, 5 total' }])
  assert.equal(acc.counts.stray, 0)
  assert.deepEqual(acc.events, [])
})

test('陈效：同参异果点名不计分，指向最近先例；同果不点名', () => {
  const same = { name: 'bash', args: { command: 'npm run smoke' } }
  const acc = auditCalls([
    { seq: 1, ref: 's1', ...same, isError: false, content: 'smoke: up · uptime 42s' },
    { seq: 2, ref: 's2', ...same, isError: false, content: 'smoke: up · uptime 57s' },
    { seq: 3, ref: 's3', ...same, isError: false, content: 'smoke: up · uptime 57s' },
  ])
  assert.equal(acc.counts.stale, 1)
  assert.equal(acc.events[0].kind, '陈效')
  assert.equal(acc.events[0].call, 2)
  assert.equal(acc.events[0].prevCall, 1)
  assert.match(acc.issues[0], /^陈效：调用2 bash s2 与调用1 同参异果——旧果勿复引$/)
})

test('陈效的先例账：空言件不建档（无实质内容不成先例）；离效件建档', () => {
  const acc = auditCalls([
    { seq: 1, ref: 'v1', name: 'bash', args: { command: 'npm test' }, isError: false, content: '' },
    { seq: 2, ref: 'v2', name: 'bash', args: { command: 'npm test' }, isError: false, content: 'Tests: 5 passed' },
  ])
  assert.equal(acc.counts.stale, 0)
  assert.equal(acc.counts.vacuous, 1)
})

test('陈效的 identity 含工具名：同名不同参不复引', () => {
  const acc = auditCalls([
    { seq: 1, ref: 'a', name: 'bash', args: { command: 'npm test' }, isError: false, content: 'Tests: 1 passed' },
    { seq: 2, ref: 'b', name: 'bash', args: { command: 'npm run test' }, isError: false, content: 'Tests: 2 passed' },
  ])
  assert.equal(acc.counts.stale, 0)
})

test('免验：命中即豁免三问，只计数；免验件不建先例账', () => {
  const acc = auditCalls([
    { seq: 1, ref: 'x1', name: 'bash', args: { command: 'npm test --reporter=silent' }, isError: false, content: '' },
    { seq: 2, ref: 'x2', name: 'bash', args: { command: 'npm test --reporter=silent' }, isError: false, content: 'different' },
  ], { exempt: ['--reporter=silent'] })
  assert.deepEqual(acc.counts, { successes: 2, verified: 2, exempted: 2, vacuous: 0, echo: 0, stray: 0, stale: 0 })
  assert.equal(acc.score.total, 0)
})

test('免验词表默认空表：提及≠豁免', () => {
  const acc = auditCalls([{ seq: 1, ref: 'v', name: 'bash', args: { command: 'npm test' }, isError: false, content: '' }])
  assert.equal(acc.counts.exempted, 0)
  assert.equal(acc.counts.vacuous, 1)
})

test('混合评分：空言 25 + 回令 20 = 45，带「虚」，门禁咬住', () => {
  const acc = auditCalls([
    { seq: 1, ref: 'v', name: 'bash', args: { command: 'npm test' }, isError: false, content: '' },
    { seq: 2, ref: 'e', name: 'bash', args: { command: 'npm run lint' }, isError: false, content: 'npm run lint' },
  ])
  assert.deepEqual(acc.score, { total: 45, vacuity: 25, echo: 20 })
  assert.equal(acc.band, '虚')
  assert.equal(acc.ok, false)
  assert.equal(acc.verdict, 'fail')
})

test('分带边界：14 明 / 15 疏 / 29 疏 / 30 虚；门恰等即 fail', () => {
  assert.deepEqual([0, 14, 15, 29, 30, 100].map(bandOf), ['明', '明', '疏', '疏', '虚', '虚'])
  const acc = auditCalls([{ seq: 1, ref: 'v', name: 'bash', args: { command: 'npm test' }, isError: false, content: '' }], { gate: 25 })
  assert.equal(acc.ok, false, '25 ≥ 门 25 → fail')
  assert.equal(auditCalls([{ seq: 1, ref: 'v', name: 'bash', args: { command: 'npm test' }, isError: false, content: '' }], { gate: 26 }).ok, true)
  assert.equal(GATE_DEFAULT, 30)
})

test('效值总帽 100：四件空言（50）+ 三件回令（30）= 80，不足 100', () => {
  const calls = [
    ...Array.from({ length: 4 }, (_, i) => ({ seq: i + 1, ref: `v${i}`, name: 'bash', args: { command: `npm test ${i}` }, isError: false, content: '' })),
    ...Array.from({ length: 3 }, (_, i) => ({ seq: 5 + i, ref: `e${i}`, name: 'bash', args: { command: `npm run lint ${i}` }, isError: false, content: 'npm run lint' })),
  ]
  const acc = auditCalls(calls)
  assert.equal(acc.score.total, 80)
})

// ---------- 词元、摘录与掩码 ----------

test('词元提取：JSON 脚手架键名计入（宁纵），CJK 连串成词元', () => {
  assert.deepEqual(extractTokens('{"command":"npm test"}'), ['command', 'npm', 'test'])
  assert.deepEqual(extractTokens('{"path":"源代码/模块"}'), ['path', '源代码', '模块'])
})

test('掩码自洁：四形命中即替换', () => {
  assert.equal(mask('key sk-abcd12345678 end'), 'key ⟪掩⟫ end')
  assert.equal(mask('Authorization: Bearer abcdef12345.xy'), 'Authorization: ⟪掩⟫')
  assert.equal(mask('-----BEGIN RSA PRIVATE KEY-----'), '⟪掩⟫')
  assert.equal(mask('aws id AKIAIOSFODNN7EXAMPLE ok'), 'aws id ⟪掩⟫ ok')
  assert.equal(mask('no secret here'), 'no secret here')
})

test('摘录 excerpt48：前 48 字符、换行替换 ⏎、先摘录后掩码', () => {
  assert.equal(excerpt48('a'.repeat(100)), 'a'.repeat(48))
  assert.equal(excerpt48('行1\n行2'), '行1⏎行2')
  assert.ok(excerpt48('x'.repeat(20) + ' sk-abcdefgh1234 y').includes('⟪掩⟫'))
})

test('issues 模板逐字锁定；ref 为 null 显示 -', () => {
  const acc = auditCalls([
    { seq: 1, ref: null, name: 'bash', args: { command: 'npm test' }, isError: false, content: '' },
    { seq: 2, ref: 'e2', name: 'bash', args: { command: 'vitest run a.test.js' }, isError: false, content: 'vitest run a.test.js' },
  ])
  assert.deepEqual(acc.issues, [
    '空言：调用1 bash - 验证成功而内容为空（账上无据）',
    '回令：调用2 bash e2 以令为证——“vitest run a.test.js”',
  ])
  assert.deepEqual(acc.events.map((e) => e.kind), ['空言', '回令'])
  assert.equal(acc.events[0].excerpt, '{"command":"npm test"}')
})

// ---------- 补充语义（词法大小写、name 命中、空 args、判定序细节） ----------

test('效类可由工具名命中（词界内）；args 缺失按 "{}" 处理', () => {
  const acc = auditCalls([{ seq: 1, ref: 't', name: 'test-runner', args: undefined, isError: false, content: '' }])
  assert.equal(acc.counts.vacuous, 1, '工具名 test-runner 命中 test（连字符是词界）')
  const notVerified = auditCalls([{ seq: 1, ref: 't', name: 'tester', args: undefined, isError: false, content: '' }])
  assert.equal(notVerified.counts.verified, 0, 'tester 无词界——与 latest 同理不误伤')
  const silent = auditCalls([{ seq: 1, ref: 'm', name: 'bash', args: undefined, isError: false, content: undefined }])
  assert.equal(silent.counts.verified, 0, 'bash + 无参数 → 非效类')
})

test('词法大小写：被检文本小写化后匹配；免验词小写化归一', () => {
  const acc = auditCalls([{ seq: 1, ref: 'u', name: 'bash', args: { Command: 'NPM TEST' }, isError: false, content: '' }])
  assert.equal(acc.counts.vacuous, 1, '大写命令仍命中 test')
  const acc2 = auditCalls([{ seq: 1, ref: 'q', name: 'bash', args: { command: 'npm run check --QUIET' }, isError: false, content: '' }], { exempt: ['--quiet'] })
  assert.equal(acc2.counts.exempted, 1, '免验词小写化后子串命中 --QUIET')
})

test('回令边缘：空 JSON 回显（效类由工具名成立）、trim 与大小写不敏感', () => {
  const acc = auditCalls([{ seq: 1, ref: 'j', name: 'lint-tool', args: {}, isError: false, content: '{}\n' }])
  assert.equal(acc.counts.echo, 1, 'argsText "{}" 的回显')
})

test('空言短路：不做回令/离效/陈效判定（每件至多一项发现）', () => {
  const acc = auditCalls([
    { seq: 1, ref: 'a', name: 'bash', args: { command: 'npm test' }, isError: false, content: '' },
    { seq: 2, ref: 'b', name: 'bash', args: { command: 'npm test' }, isError: false, content: '' },
  ])
  assert.deepEqual(acc.events.map((e) => e.kind), ['空言', '空言'])
  assert.equal(acc.counts.stale, 0)
})

test('normalizeWords：滤空与打非字符串；小写化去重', () => {
  assert.deepEqual(normalizeWords(['A', 'a', '', '  ', 3, null, 'B']), ['a', 'b'])
  assert.deepEqual(normalizeWords('not-array'), [])
})

test('extractTokens：下划线切断字母数字串（锁定行为）', () => {
  assert.deepEqual(extractTokens('{"command":"foo_bar baz"}'), ['command', 'foo', 'bar', 'baz'])
})

test('孤儿 result 独立建档且效类判定照常（孤儿成功无内容 → 空言）', () => {
  const text = line({ type: 'tool_result', id: 'orphan', name: 'bash', args: { command: 'npm test' }, isError: false })
  const acc = audit(text)
  assert.equal(acc.calls, 1)
  assert.equal(acc.counts.vacuous, 1)
})

test('auditStream 输出：principal 只计数（信封形状 docs/03 §10）、calls 计数与流一致', () => {
  const text = [
    line({ type: 'principal', text: '任务' }),
    line(call('a1', 'bash', { command: 'npm test' })),
    line(result('a1', 'bash', { command: 'npm test' }, { content: 'Tests: 5 passed' })),
  ].join('\n')
  const acc = audit(text)
  assert.deepEqual(acc.principal, { blocks: 1 })
  assert.equal(acc.calls, 1)
  assert.deepEqual(acc.counts, { successes: 1, verified: 1, exempted: 0, vacuous: 0, echo: 0, stray: 0, stale: 0 })
})

test('证块发现序：空言行在前、回令行在后（流序 #k 无关）', () => {
  const acc = audit(fixture('vacuous-stream.jsonl'))
  const text = renderZheng(acc, 1)
  const i1 = text.indexOf('[调用1]')
  const i2 = text.indexOf('[调用2]')
  assert.ok(i1 > 0 && i2 > i1, '按调用序列出')
  assert.match(text, /空言: “\{"command":"npm test"\}”→ 成功而耳目无实/)
})

test('空言摘录取 argsText：JSON 转义的换行以字面 \\n 呈现（excerpt48 的 ⏎ 只作用于真实换行）', () => {
  const acc = auditCalls([{ seq: 1, ref: 'm', name: 'bash', args: { command: 'npm test &&\n npm run lint' }, isError: false, content: undefined }])
  assert.equal(acc.events[0].excerpt, '{"command":"npm test &&\\n npm run lint"}')
})

test('门禁裁决 gate() 语义：total < gate → pass（computeAccount 字段锁定）', () => {
  const acc = auditCalls([{ seq: 1, ref: 'e', name: 'bash', args: { command: 'npm run smoke' }, isError: false, content: 'npm run smoke' }])
  assert.equal(acc.gate, 30)
  assert.equal(acc.verdict, 'pass')
  assert.equal(acc.ok, true)
})

// ---------- A2 夹具（先于实现手算定死） ----------

test('夹具 clean-stream：0 分 · 明 · pass（静默 mkdir 永不审）', () => {
  const acc = audit(fixture('clean-stream.jsonl'))
  assert.equal(acc.calls, 3)
  assert.deepEqual(acc.counts, { successes: 3, verified: 2, exempted: 0, vacuous: 0, echo: 0, stray: 0, stale: 0 })
  assert.deepEqual(acc.score, { total: 0, vacuity: 0, echo: 0 })
  assert.equal(acc.band, '明')
  assert.equal(acc.ok, true)
  assert.deepEqual(acc.events, [])
})

test('夹具 vacuous-stream：50 分 · 虚 · fail（两件空言恰达虚分帽）', () => {
  const acc = audit(fixture('vacuous-stream.jsonl'))
  assert.equal(acc.calls, 3)
  assert.deepEqual(acc.counts, { successes: 3, verified: 2, exempted: 0, vacuous: 2, echo: 0, stray: 0, stale: 0 })
  assert.deepEqual(acc.score, { total: 50, vacuity: 50, echo: 0 })
  assert.equal(acc.band, '虚')
  assert.equal(acc.ok, false)
  assert.equal(acc.events[0].kind, '空言')
  assert.equal(acc.events[1].kind, '空言')
})

test('夹具 echo-stream：20 分 · 疏 · pass（回令+离效+陈效各一件）', () => {
  const acc = audit(fixture('echo-stream.jsonl'))
  assert.equal(acc.calls, 3)
  assert.deepEqual(acc.counts, { successes: 3, verified: 3, exempted: 0, vacuous: 0, echo: 1, stray: 1, stale: 1 })
  assert.deepEqual(acc.score, { total: 20, vacuity: 0, echo: 20 })
  assert.equal(acc.band, '疏')
  assert.equal(acc.ok, true)
  assert.deepEqual(acc.events.map((e) => e.kind), ['回令', '离效', '陈效'])
  assert.equal(acc.events[2].call, 3)
  assert.equal(acc.events[2].prevCall, 2)
})

test('夹具 exempt-stream（配 exempt-words.json）：0 分 · 明 · pass（免验 2 件）', () => {
  const acc = audit(fixture('exempt-stream.jsonl'), { exempt: JSON.parse(readFileSync(join(here, '..', 'fixtures', 'exempt-words.json'), 'utf8')) })
  assert.equal(acc.calls, 3)
  assert.deepEqual(acc.counts, { successes: 3, verified: 3, exempted: 2, vacuous: 0, echo: 0, stray: 0, stale: 0 })
  assert.deepEqual(acc.score, { total: 0, vacuity: 0, echo: 0 })
  assert.equal(acc.band, '明')
  assert.equal(acc.ok, true)
})

// ---------- A3 跨项目互认（先于实现手算定死） ----------

test('A3：zhizhi 历史流 → 8 调用 / 成报 4 / 空言 1（账上无据）/ 25 分 · 疏 · pass', () => {
  const acc = audit(readFileSync(join(here, '..', '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl'), 'utf8'))
  assert.equal(acc.calls, 8)
  assert.deepEqual(acc.counts, { successes: 4, verified: 1, exempted: 0, vacuous: 1, echo: 0, stray: 0, stale: 0 })
  assert.deepEqual(acc.score, { total: 25, vacuity: 25, echo: 0 })
  assert.equal(acc.band, '疏')
  assert.equal(acc.ok, true)
})

test('A3：jiebi 历史流 → 8 调用 / 成报 3 / 空言 1 / 25 分 · 疏 · pass', () => {
  const acc = audit(readFileSync(join(here, '..', '..', 'jiebi', 'fixtures', 'sample-stream.jsonl'), 'utf8'))
  assert.equal(acc.calls, 8)
  assert.deepEqual(acc.counts, { successes: 3, verified: 1, exempted: 0, vacuous: 1, echo: 0, stray: 0, stale: 0 })
  assert.deepEqual(acc.score, { total: 25, vacuity: 25, echo: 0 })
  assert.equal(acc.band, '疏')
  assert.equal(acc.ok, true)
})

// ---------- 证块 ----------

test('证块：空言回令逐条列出，同流两次渲染逐字节一致（仅 #k 递增）', () => {
  const acc = audit(fixture('echo-stream.jsonl'))
  const first = renderZheng(acc, 1)
  const second = renderZheng(acc, 2)
  assert.equal(second, first.replace('#1', '#2'))
  assert.match(first, /【效验 · 证块】效账 #1/)
  assert.match(first, /事莫明于有效，论莫定于有证——以下成功信号空言虚语，验证不算数：/)
  assert.match(first, /1\. \[调用1\] bash 回令: 以令为证——“vitest run src\/parse\.test\.js”/)
  assert.match(first, /离效：1 件（点名不计分）｜ 陈效：1 件 ｜ 免验：0 件 ｜ 效值：20（疏）/)
  assert.match(first, /—— 本块由确定性规则生成；重放同一流必得同一文本。/)
})

test('证块：干净流出确定性「证验在场」空块', () => {
  const acc = audit(fixture('clean-stream.jsonl'))
  const text = renderZheng(acc, 1)
  assert.equal(text, [
    '【效验 · 证块】效账 #1',
    '证验在场——效类成功皆有可观。',
    '离效：0 件（点名不计分）｜ 陈效：0 件 ｜ 免验：0 件 ｜ 效值：0（明）',
    '—— 本块由确定性规则生成；重放同一流必得同一文本。',
  ].join('\n'))
})

// ---------- 导出流重放 ----------

test('exportStream 形状的流可被离线 audit 重放（含空串 content）', () => {
  const events = [
    call('v1', 'bash', { command: 'npm test' }),
    result('v1', 'bash', { command: 'npm test' }, { content: '' }),
    call('c1', 'bash', { command: 'npm test' }),
    result('c1', 'bash', { command: 'npm test' }, { content: 'Tests: 5 passed, 5 total' }),
  ]
  const text = events.map((e) => JSON.stringify(e)).join('\n')
  const acc = audit(text)
  assert.deepEqual(acc.counts, { successes: 2, verified: 2, exempted: 0, vacuous: 1, echo: 0, stray: 0, stale: 0 })
  assert.equal(acc.score.total, 25)
})
