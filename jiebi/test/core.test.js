/**
 * 核心单测 —— 解蔽账本（schema/蔽值/模板）、签名归一化、流解析与配对、
 * 账实对账、对比审计。零依赖，离线可跑。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  validateLedger,
  scoreLedger,
  makeTemplate,
  bandOf,
  THRESHOLD_DEFAULT,
} from '../src/core/ledger.js'
import { signatureOf, stableJson } from '../src/core/signature.js'
import { parseStream, buildCalls } from '../src/core/stream.js'
import { reconcile } from '../src/core/reconcile.js'
import { contrastAudit } from '../src/core/audit.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8')
const balanced = () => JSON.parse(fixture('balanced-ledger.json'))
const biased = () => JSON.parse(fixture('biased-ledger.json'))

// ---------------------------------------------------------------------------
// 蔽值分带
// ---------------------------------------------------------------------------

test('bandOf：分带边界 0/14/15/29/30/100', () => {
  assert.equal(bandOf(0), '明')
  assert.equal(bandOf(14), '明')
  assert.equal(bandOf(15), '半蔽')
  assert.equal(bandOf(29), '半蔽')
  assert.equal(bandOf(30), '蔽')
  assert.equal(bandOf(100), '蔽')
})

test('默认阈门是 30', () => {
  assert.equal(THRESHOLD_DEFAULT, 30)
})

// ---------------------------------------------------------------------------
// schema 校验
// ---------------------------------------------------------------------------

test('schema：均衡账本合法', () => {
  const { valid, issues } = validateLedger(balanced())
  assert.equal(valid, true)
  assert.deepEqual(issues, [])
})

test('schema：非对象直接判非法', () => {
  for (const bad of [null, 42, 'x', []]) {
    const { valid, issues } = validateLedger(bad)
    assert.equal(valid, false)
    assert.equal(issues[0].code, 'schema')
  }
})

test('schema：version/kind/question/id 逐项报错', () => {
  const ledger = { ...balanced(), version: 2, kind: 'vibes', question: '', id: null }
  const { valid, issues } = validateLedger(ledger)
  assert.equal(valid, false)
  const paths = issues.map((i) => i.path)
  assert.ok(paths.includes('version'))
  assert.ok(paths.includes('kind'))
  assert.ok(paths.includes('question'))
  assert.ok(paths.includes('id'))
})

test('schema：alternatives 非数组报错', () => {
  const { valid, issues } = validateLedger({ ...balanced(), alternatives: 'two' })
  assert.equal(valid, false)
  assert.equal(issues[0].path, 'alternatives')
})

test('schema：候选缺 name、steelman 空串同罪', () => {
  const ledger = {
    ...balanced(),
    alternatives: [
      { name: '', steelman: '   ' },
      { name: 'B' },
    ],
  }
  const { valid, issues } = validateLedger(ledger)
  assert.equal(valid, false)
  assert.ok(issues.some((i) => i.path === 'alternatives[0].name'))
  assert.ok(issues.some((i) => i.path === 'alternatives[0].steelman'))
})

test('schema：evidence 结构（非数组/缺 ref/坏 expect）', () => {
  const ledger = {
    ...balanced(),
    alternatives: [
      { name: 'A', evidence: 'nope' },
      { name: 'B', evidence: [{ ref: '' }, { ref: 'x', expect: 'Fail' }] },
    ],
  }
  const { valid, issues } = validateLedger(ledger)
  assert.equal(valid, false)
  assert.ok(issues.some((i) => i.path === 'alternatives[0].evidence'))
  assert.ok(issues.some((i) => i.path === 'alternatives[1].evidence[0].ref'))
  assert.ok(issues.some((i) => i.path === 'alternatives[1].evidence[1].expect'))
})

test('schema：disconfirming 结构（非数组/缺 ref）', () => {
  const ledger = { ...balanced(), disconfirming: [{ ref: 'ok' }, {}] }
  const { valid, issues } = validateLedger(ledger)
  assert.equal(valid, false)
  assert.ok(issues.some((i) => i.path === 'disconfirming[1].ref'))
})

test('schema：verdict 非对象 / 字段空串同罪', () => {
  const a = validateLedger({ ...balanced(), verdict: null })
  assert.equal(a.valid, false)
  const b = validateLedger({
    ...balanced(),
    verdict: { choice: '序列化层类型错误', weights: '  ' },
  })
  assert.equal(b.valid, false)
  assert.ok(b.issues.some((i) => i.path === 'verdict.weights'))
})

test('schema：status 取值域', () => {
  assert.equal(validateLedger({ ...balanced(), status: 'open' }).valid, true)
  assert.equal(validateLedger({ ...balanced(), status: 'done' }).valid, false)
})

test('schema：空数组合法（蔽值层管完备性，schema 层只管类型）', () => {
  const ledger = {
    version: 1,
    id: 'd-0',
    kind: 'conclusion',
    question: 'q',
    alternatives: [],
    disconfirming: [],
    verdict: {},
  }
  assert.equal(validateLedger(ledger).valid, true)
})

// ---------------------------------------------------------------------------
// 蔽值评分（七项条款逐项 + 组合 + cap）
// ---------------------------------------------------------------------------

test('蔽值：均衡账本 0 分「明」', () => {
  const { score, band, issues } = scoreLedger(balanced())
  assert.equal(score, 0)
  assert.equal(band, '明')
  assert.deepEqual(issues, [])
})

test('蔽值：偏蔽账本七项全中，封顶 100', () => {
  const { score, band, issues } = scoreLedger(biased())
  assert.equal(score, 100, '40+8+8+15+15+10+20=116 → cap 100')
  assert.equal(band, '蔽')
  const codes = issues.map((i) => i.code).sort()
  assert.deepEqual(codes, [
    'dangling_choice',
    'few_alternatives',
    'missing_kill',
    'missing_steelman',
    'no_disconfirming',
    'no_falsifiable',
    'no_weights',
  ])
})

test('蔽值：单候选即 40（蔽于一曲是大头），其余项独立可加', () => {
  const ledger = {
    ...balanced(),
    alternatives: [
      {
        name: 'A',
        steelman: 's',
        killCondition: 'k',
      },
    ],
    verdict: { choice: 'A', weights: 'w', falsifiable: 'f' },
  }
  const { score, issues } = scoreLedger(ledger)
  assert.equal(score, 40)
  assert.equal(issues.length, 1)
  assert.equal(issues[0].code, 'few_alternatives')
})

test('蔽值：steelman 扣分按个数、封顶 16', () => {
  const alt = (name, extra = {}) => ({ name, steelman: 's', killCondition: 'k', ...extra })
  const base = {
    version: 1,
    id: 'd-x',
    kind: 'approach',
    question: 'q',
    disconfirming: [{ ref: 'r1' }],
    verdict: { choice: 'A', weights: 'w', falsifiable: 'f' },
  }
  const oneMissing = { ...base, alternatives: [alt('A', { steelman: undefined }), alt('B')] }
  assert.equal(scoreLedger(oneMissing).score, 8)
  const allMissing = {
    ...base,
    alternatives: [alt('A', { steelman: undefined }), alt('B', { steelman: undefined }), alt('C', { steelman: undefined })],
  }
  assert.equal(scoreLedger(allMissing).score, 16, '3 个缺 → 24 封顶为 16')
})

test('蔽值：killCondition 扣分封顶 16', () => {
  const alt = (name, extra = {}) => ({ name, steelman: 's', killCondition: 'k', ...extra })
  const ledger = {
    version: 1,
    id: 'd-x',
    kind: 'approach',
    question: 'q',
    alternatives: [
      alt('A', { killCondition: undefined }),
      alt('B', { killCondition: undefined }),
      alt('C', { killCondition: undefined }),
    ],
    disconfirming: [{ ref: 'r1' }],
    verdict: { choice: 'A', weights: 'w', falsifiable: 'f' },
  }
  const { score, issues } = scoreLedger(ledger)
  assert.equal(score, 16)
  assert.equal(issues[0].code, 'missing_kill')
})

test('蔽值：零反证 = +15（虚门）', () => {
  const ledger = { ...balanced(), disconfirming: [] }
  const { score, issues } = scoreLedger(ledger)
  assert.equal(score, 15)
  assert.equal(issues[0].code, 'no_disconfirming')
})

test('蔽值：无证伪条件 = +15（静门）；无权重 = +10（县衡）', () => {
  const noFalsifiable = scoreLedger({ ...balanced(), verdict: { ...balanced().verdict, falsifiable: '' } })
  assert.equal(noFalsifiable.score, 15)
  const noWeights = scoreLedger({ ...balanced(), verdict: { ...balanced().verdict, weights: undefined } })
  assert.equal(noWeights.score, 10)
})

test('蔽值：裁决悬空 = +20', () => {
  const { score, issues } = scoreLedger({ ...balanced(), verdict: { ...balanced().verdict, choice: '从未登记的候选' } })
  assert.equal(score, 20)
  assert.equal(issues[0].code, 'dangling_choice')
})

test('蔽值：三门组合恰好跨过阈门（15+15=30 → 蔽）', () => {
  const ledger = {
    ...balanced(),
    disconfirming: [],
    verdict: { choice: balanced().verdict.choice, weights: balanced().verdict.weights },
  }
  const { score, band } = scoreLedger(ledger)
  assert.equal(score, 30)
  assert.equal(band, '蔽')
})

// ---------------------------------------------------------------------------
// 模板
// ---------------------------------------------------------------------------

test('template：骨架 schema 合法；占位文本使裁决悬空（+20，半蔽）', () => {
  const t = makeTemplate()
  assert.equal(t.version, 1)
  assert.equal(t.kind, 'diagnosis')
  assert.equal(t.alternatives.length, 2)
  assert.ok(Array.isArray(t.disconfirming))
  assert.ok('falsifiable' in t.verdict)
  const { score, band } = scoreLedger(t)
  assert.equal(score, 20, 'choice 占位文本未命中候选名 → 悬空 +20')
  assert.equal(band, '半蔽')
})

test('模板：kind 变体与非法 kind', () => {
  assert.ok(makeTemplate('approach').question.length > 0)
  assert.ok(makeTemplate('conclusion').question.length > 0)
  assert.throws(() => makeTemplate('vibes'), /kind/)
})

// ---------------------------------------------------------------------------
// 签名归一化
// ---------------------------------------------------------------------------

test('签名：command 归一化 —— 换参数磨同一扇门应同签名', () => {
  assert.equal(signatureOf('bash', { command: 'npm test' }), 'bash:npm test')
  assert.equal(signatureOf('bash', { command: 'npm test -- --grep user' }), 'bash:npm test')
  assert.equal(signatureOf('bash', { command: 'npm  test' }), 'bash:npm test')
})

test('签名：非多词命令取首词', () => {
  assert.equal(signatureOf('bash', { command: 'node scripts/repro.js' }), 'bash:node')
  assert.equal(signatureOf('bash', { command: 'pytest -k user' }), 'bash:pytest')
})

test('签名：已知多词工具白名单', () => {
  assert.equal(signatureOf('bash', { command: 'git commit -m x' }), 'bash:git commit')
  assert.equal(signatureOf('bash', { command: 'cargo build --release' }), 'bash:cargo build')
  assert.equal(signatureOf('bash', { command: 'go test ./...' }), 'bash:go test')
})

test('签名：path 与 query 键', () => {
  assert.equal(signatureOf('read', { path: 'src/user.js' }), 'read:src/user.js')
  assert.equal(signatureOf('edit', { file_path: ' a.md ' }), 'edit:a.md')
  assert.equal(signatureOf('search', { query: 'jiebi ledger' }), 'search:jiebi ledger')
})

test('签名：无 args / null args / 数组 args', () => {
  assert.equal(signatureOf('done', null), 'done')
  assert.equal(signatureOf('done', undefined), 'done')
  assert.equal(signatureOf('weird', [1, 2]), 'weird:[1,2]')
  assert.equal(signatureOf('empty', {}), 'empty:{}')
})

test('签名：对象键序不影响（稳定 JSON）', () => {
  assert.equal(signatureOf('x', { b: 2, a: 1 }), signatureOf('x', { a: 1, b: 2 }))
  assert.equal(stableJson({ b: 2, a: 1 }), '{"a":1,"b":2}')
})

test('签名：长参数截断到 64 字符', () => {
  const long = 'x'.repeat(200)
  const sig = signatureOf('bash', { command: long })
  assert.ok(sig.length <= 64 + 'bash:'.length)
  assert.ok(sig.endsWith('…'))
})

// ---------------------------------------------------------------------------
// 流解析与配对
// ---------------------------------------------------------------------------

test('流解析：容忍注释空行；报错带行号', () => {
  const events = parseStream('# 注释\n\n{"type":"turn_start","id":"t1"}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"type":"turn_start"}\nnot json'), /第 2 行/)
  assert.throws(() => parseStream('{"id":"x"}'), /type/)
})

test('配对：带 id 的 call/result 逐字配对', () => {
  const events = parseStream(fixture('sample-stream.jsonl'))
  const { calls, turns, duplicatedRefs } = buildCalls(events)
  assert.equal(calls.length, 8)
  assert.equal(turns.length, 2)
  assert.deepEqual(turns.map((t) => t.id), ['t1', 't2'])
  assert.equal(duplicatedRefs.length, 0)
  const t2c4 = calls.find((c) => c.ref === 't2-c4')
  assert.equal(t2c4.isError, false)
  const t1c2 = calls.find((c) => c.ref === 't1-c2')
  assert.equal(t1c2.isError, true)
})

test('配对：zhizhi 裸流（无 id）按名就近配对', () => {
  const events = parseStream([
    '{"type":"turn_start","id":"t1"}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
    '{"type":"tool_result","name":"read","isError":false}',
    '{"type":"tool_call","name":"read","args":{"path":"b"}}',
    '{"type":"tool_result","name":"read","isError":true}',
  ].join('\n'))
  const { calls } = buildCalls(events)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].isError, false)
  assert.equal(calls[1].isError, true)
})

test('配对：按 id 配对后，同名裸 result 不再错配', () => {
  const events = parseStream([
    '{"type":"tool_call","id":"r1","name":"read","args":{"path":"a"}}',
    '{"type":"tool_result","id":"r1","name":"read","isError":false}',
    '{"type":"tool_result","name":"read","isError":true}', // 悬空裸结果：无处安放，忽略
  ].join('\n'))
  const { calls } = buildCalls(events)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
})

test('配对：turn_start 之前归隐式回合；tool_denied 视为失败探针', () => {
  const events = parseStream([
    '{"type":"tool_call","name":"bash","args":{"command":"ls"}}',
    '{"type":"tool_denied","name":"bash","args":{"command":"ls"},"rule":"stopLoss"}',
    '{"type":"turn_start","id":"t1"}',
    '{"type":"tool_call","name":"read","args":{"path":"x"}}',
  ].join('\n'))
  const { calls, turns } = buildCalls(events)
  assert.equal(turns[0].id, '(no turn)')
  assert.equal(calls[1].isError, true, 'tool_denied → 失败探针')
  assert.equal(calls[2].turnId, 't1')
})

test('配对：重复 id 记 ambiguous（以首条为准）', () => {
  const events = parseStream([
    '{"type":"tool_call","id":"r1","name":"read","args":{"path":"a"}}',
    '{"type":"tool_call","id":"r1","name":"read","args":{"path":"a"}}',
    '{"type":"tool_result","id":"r1","name":"read","isError":true}',
  ].join('\n'))
  const { duplicatedRefs } = buildCalls(events)
  assert.deepEqual(duplicatedRefs, ['r1'])
})

// ---------------------------------------------------------------------------
// 账实对账
// ---------------------------------------------------------------------------

test('对账：均衡账本 × 样例流 —— 逐条 verified，match=true', () => {
  const report = reconcile(balanced(), parseStream(fixture('sample-stream.jsonl')))
  assert.equal(report.ledger, 'd-002')
  assert.equal(report.match, true)
  assert.equal(report.refsChecked, 4)
  assert.equal(report.confidence, 'refs')
  const byRef = Object.fromEntries(report.refs.map((r) => [r.ref, r.status]))
  assert.deepEqual(byRef, {
    't2-c1': 'verified',
    't2-c4': 'verified',
    't1-c1': 'verified',
    't2-c2': 'linked',
  })
  assert.deepEqual(report.verdict, { choice: '序列化层类型错误', resolved: true })
})

test('对账：悬空引用 → dangling，match=false（A4 可证伪）', () => {
  const ledger = balanced()
  ledger.alternatives[0].evidence.push({ ref: 't9-nope', expect: 'fail' })
  const report = reconcile(ledger, parseStream(fixture('sample-stream.jsonl')))
  assert.equal(report.match, false)
  assert.ok(report.refs.some((r) => r.ref === 't9-nope' && r.status === 'dangling'))
})

test('对账：expect 方向与事实相反 → contradicted，match=false', () => {
  const ledger = balanced()
  ledger.alternatives[0].evidence[1].expect = 'fail' // t2-c4 实际成功
  const report = reconcile(ledger, parseStream(fixture('sample-stream.jsonl')))
  assert.equal(report.match, false)
  assert.ok(report.refs.some((r) => r.ref === 't2-c4' && r.status === 'contradicted'))
})

test('对账：裁决悬空 → resolved=false，match=false', () => {
  const ledger = balanced()
  ledger.verdict.choice = '缓存问题'
  const report = reconcile(ledger, parseStream(fixture('sample-stream.jsonl')))
  assert.equal(report.verdict.resolved, false)
  assert.equal(report.match, false)
})

test('对账：零引用 → match=true 但 confidence=none（不装懂）', () => {
  const ledger = {
    version: 1,
    id: 'd-0',
    kind: 'approach',
    question: 'q',
    alternatives: [
      { name: 'A', steelman: 's', killCondition: 'k' },
      { name: 'B', steelman: 's', killCondition: 'k' },
    ],
    disconfirming: [],
    verdict: { choice: 'A', weights: 'w', falsifiable: 'f' },
  }
  const report = reconcile(ledger, [])
  assert.equal(report.match, true)
  assert.equal(report.refsChecked, 0)
  assert.equal(report.confidence, 'none')
})

// ---------------------------------------------------------------------------
// 对比审计
// ---------------------------------------------------------------------------

test('审计：样例流 —— t1 记 monoculture，t2 干净（verdict=flagged）', () => {
  const report = contrastAudit(fixture('sample-stream.jsonl'))
  assert.equal(report.mode, 'contrast')
  assert.deepEqual(report.totals, { turns: 2, calls: 8, flags: 1 })
  assert.deepEqual(report.flags, [
    { type: 'monoculture', turn: 't1', signature: 'bash:npm test', run: 4 },
  ])
  assert.equal(report.verdict, 'flagged')
  assert.deepEqual(
    report.turns.map((t) => [t.id, t.calls, t.distinctProbes, t.failures, t.maxStreak]),
    [
      ['t1', 4, 1, 4, 4],
      ['t2', 4, 4, 1, 1],
    ],
  )
})

test('审计：干净流 → verdict=pass，退出语义无 flag', () => {
  const text = [
    '{"type":"turn_start","id":"t1"}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
    '{"type":"tool_call","name":"bash","args":{"command":"npm test"}}',
    '{"type":"tool_call","name":"search","args":{"query":"x"}}',
  ].join('\n')
  const report = contrastAudit(text)
  assert.equal(report.verdict, 'pass')
  assert.deepEqual(report.flags, [])
})

test('审计：阈值可调（--streak 2）', () => {
  const text = [
    '{"type":"turn_start","id":"t1"}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
    '{"type":"tool_call","name":"read","args":{"path":"b"}}',
    '{"type":"tool_call","name":"read","args":{"path":"b"}}',
  ].join('\n')
  assert.equal(contrastAudit(text, { streakThreshold: 2 }).verdict, 'flagged')
  assert.equal(contrastAudit(text, { streakThreshold: 3 }).verdict, 'pass')
})

test('审计：连击被打断后重开 —— 回合内取最长段（maxStreak=4）', () => {
  const text = [
    '{"type":"turn_start","id":"t1"}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
    '{"type":"tool_call","name":"bash","args":{"command":"ls"}}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
    '{"type":"tool_call","name":"read","args":{"path":"a"}}',
  ].join('\n')
  const report = contrastAudit(text, { streakThreshold: 4 })
  assert.equal(report.totals.flags, 1, '离线审计按回合记 flag，一回合一条')
  assert.equal(report.turns[0].maxStreak, 4)
})

// ---------------------------------------------------------------------------
// 观察式引擎（observe.js —— 插件的大脑，Cordis 无关）
// ---------------------------------------------------------------------------

import { createObserver } from '../src/core/observe.js'

test('观察器：会话级连击 —— 打断后重开记两条 flag', () => {
  const obs = createObserver({ streakThreshold: 4 })
  for (let i = 0; i < 4; i++) obs.observe({ name: 'read', args: { path: 'a' }, isError: false })
  obs.observe({ name: 'bash', args: { command: 'ls' }, isError: false })
  for (let i = 0; i < 4; i++) obs.observe({ name: 'read', args: { path: 'a' }, isError: false })
  const report = obs.report()
  assert.equal(report.totals.callsObserved, 9)
  assert.equal(report.totals.flags, 2, '两段连击是两次独立的蔽')
  assert.deepEqual(report.flags.map((f) => f.run), [4, 4])
})

test('观察器：beginTurn/endTurn 与 exportStream 往返', () => {
  const obs = createObserver()
  obs.beginTurn('t1')
  obs.observe({ name: 'bash', args: { command: 'npm test' }, isError: true })
  obs.endTurn()
  obs.beginTurn('t2')
  obs.observe({ name: 'read', args: { path: 'a' }, isError: false })
  obs.endTurn()
  const report = obs.report()
  assert.equal(report.totals.turnsObserved, 2)
  const events = obs.exportStream()
  const text = events.map((e) => JSON.stringify(e)).join('\n')
  const { calls, turns } = buildCalls(parseStream(text))
  assert.equal(calls.length, 2)
  assert.deepEqual(turns.map((t) => t.id), ['t1', 't2'])
  assert.equal(calls[0].isError, true)
})

test('观察器：enabled=false 完全静默（观察口关闸）', () => {
  const obs = createObserver({ enabled: false })
  obs.beginTurn('t1')
  obs.observe({ name: 'read', args: { path: 'a' }, isError: true })
  obs.endTurn()
  const report = obs.report()
  assert.equal(report.totals.callsObserved, 0)
  assert.equal(report.totals.turnsObserved, 0)
  assert.equal(report.totals.flags, 0)
  assert.deepEqual(obs.exportStream(), [])
})

test('观察器：checkLedger 注册账本并记录蔽值', () => {
  const obs = createObserver()
  const good = obs.checkLedger(balanced())
  assert.equal(good.valid, true)
  assert.equal(good.score, 0)
  const bad = obs.checkLedger(biased())
  assert.equal(bad.valid, true)
  assert.equal(bad.score, 100)
  const broken = obs.checkLedger({ version: 9 })
  assert.equal(broken.valid, false)
  assert.equal(broken.score, null)
  assert.ok(broken.issues.length > 0)
  const report = obs.report()
  assert.equal(report.totals.ledgersChecked, 3)
  assert.deepEqual(report.ledgers.map((l) => l.band), ['明', '蔽', null])
})

test('观察器：病态 args（循环引用）不反噬', () => {
  const obs = createObserver()
  const args = { path: 'a' }
  args.self = args
  assert.doesNotThrow(() => obs.observe({ name: 'read', args, isError: false }))
  assert.equal(obs.report().totals.callsObserved, 1)
})

test('审计：隐式回合（无 turn_start）可用', () => {
  const text = [
    '{"type":"tool_call","name":"bash","args":{"command":"npm test"}}',
    '{"type":"tool_call","name":"bash","args":{"command":"npm test"}}',
    '{"type":"tool_call","name":"bash","args":{"command":"npm test"}}',
    '{"type":"tool_call","name":"bash","args":{"command":"npm test"}}',
  ].join('\n')
  const report = contrastAudit(text)
  assert.equal(report.turns[0].id, '(no turn)')
  assert.equal(report.verdict, 'flagged')
})

test('审计：跨项目互认 —— zhizhi 的样例流直接可审（A5）', () => {
  const zhizhiStream = readFileSync(
    join(here, '..', '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl'),
    'utf8',
  )
  const report = contrastAudit(zhizhiStream)
  assert.deepEqual(report.totals, { turns: 2, calls: 8, flags: 1 })
  assert.equal(report.flags[0].signature, 'bash:npm test')
  assert.equal(report.flags[0].turn, 't1')
  assert.equal(report.verdict, 'flagged')
})
