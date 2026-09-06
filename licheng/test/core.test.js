/**
 * 核心测试 —— 绳账 schema（A1）/ 结账引擎（A2）/ 流解析与账实对账（A3）/
 * 结账块确定性（A4）。全部纯函数、零依赖、零 IO（夹具直读除外）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  parseLedger,
  templateLedger,
  validateDischarge,
  openIdsOf,
} from '../src/core/ledger.js'
import { parseStream, buildCalls } from '../src/core/stream.js'
import { settleLedger, bandOf, matchDischarge, GATE_DEFAULT } from '../src/core/settle.js'
import { renderBlock } from '../src/core/block.js'
import { DEFAULT_MARKERS, normalizeMarkers, countMarkerHits } from '../src/core/lexicon.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const readFixture = (name) => readFileSync(join(root, 'fixtures', name), 'utf8')

const P = (over = {}) => ({ type: 'promise', id: 'p-1', what: '做一件事', ...over })

// ---------------------------------------------------------------- A1 schema

test('A1 · template 输出可直接通过 parseLedger 校验（3 立 1 改 1 弃 1 宣告）', () => {
  const r = parseLedger(templateLedger())
  assert.equal(r.valid, true)
  assert.equal(r.entries.length, 6)
  assert.equal(r.entries.filter((e) => e.type === 'promise').length, 3)
})

test('A1 · 最小 promise（无凭）合法', () => {
  const r = parseLedger(JSON.stringify(P()) + '\n')
  assert.equal(r.valid, true)
  assert.equal(r.entries.length, 1)
})

test('A1 · promise 带合法 discharge 合法', () => {
  const r = parseLedger(JSON.stringify(P({ discharge: { tool: 'bash', contains: 'npm test', ok: true } })) + '\n')
  assert.equal(r.valid, true)
})

test('A1 · discharge 缺 contains 拒绝', () => {
  const r = parseLedger(JSON.stringify(P({ discharge: { tool: 'bash' } })) + '\n')
  assert.equal(r.valid, false)
  assert.ok(r.issues.some((m) => m.includes('contains')))
})

test('A1 · discharge.ok 非 boolean 拒绝', () => {
  const r = parseLedger(JSON.stringify(P({ discharge: { contains: 'x', ok: 'yes' } })) + '\n')
  assert.equal(r.valid, false)
  assert.ok(r.issues.some((m) => m.includes('ok')))
})

test('A1 · discharge.tool 空串拒绝', () => {
  const r = parseLedger(JSON.stringify(P({ discharge: { tool: '', contains: 'x' } })) + '\n')
  assert.equal(r.valid, false)
})

test('A1 · discharge 未知键拒绝', () => {
  const r = parseLedger(JSON.stringify(P({ discharge: { contains: 'x', why: '因为' } })) + '\n')
  assert.equal(r.valid, false)
  assert.ok(r.issues.some((m) => m.includes('why')))
})

test('A1 · promise 未知键（supersedes）拒绝', () => {
  const r = parseLedger(JSON.stringify(P({ supersedes: 'p-0' })) + '\n')
  assert.equal(r.valid, false)
  assert.ok(r.issues.some((m) => m.includes('未知键 "supersedes"')))
})

test('A1 · revise 缺 reason 拒绝', () => {
  const r = parseLedger(
    [JSON.stringify(P()), JSON.stringify({ type: 'revise', id: 'p-1r', supersedes: 'p-1' })].join('\n') + '\n'
  )
  assert.equal(r.valid, false)
  assert.ok(r.issues.some((m) => m.includes('reason')))
})

test('A1 · revise 带 settles 拒绝', () => {
  const r = parseLedger(
    [
      JSON.stringify(P()),
      JSON.stringify({ type: 'revise', id: 'p-1r', supersedes: 'p-1', reason: '变', settles: 'p-1' }),
    ].join('\n') + '\n'
  )
  assert.equal(r.valid, false)
  assert.ok(r.issues.some((m) => m.includes('未知键 "settles"')))
})

test('A1 · abandon 带 what / 带 discharge 均拒绝', () => {
  const a1 = parseLedger(
    [JSON.stringify(P()), JSON.stringify({ type: 'abandon', id: 'p-1a', supersedes: 'p-1', reason: '变', what: 'x' })].join('\n')
  )
  const a2 = parseLedger(
    [JSON.stringify(P()), JSON.stringify({ type: 'abandon', id: 'p-1a', supersedes: 'p-1', reason: '变', discharge: { contains: 'x' } })].join('\n')
  )
  assert.equal(a1.valid, false)
  assert.equal(a2.valid, false)
})

test('A1 · discharge 条目缺 settles 拒绝、带 id 拒绝', () => {
  const a = parseLedger(JSON.stringify({ type: 'discharge', discharge: { contains: 'x' } }) + '\n')
  const b = parseLedger(JSON.stringify({ type: 'discharge', id: 'd-1', settles: 'p-1', discharge: { contains: 'x' } }) + '\n')
  assert.equal(a.valid, false)
  assert.ok(a.issues.some((m) => m.includes('settles')))
  assert.equal(b.valid, false)
  assert.ok(b.issues.some((m) => m.includes('未知键 "id"')))
})

test('A1 · 未知 type 拒绝', () => {
  const r = parseLedger(JSON.stringify({ type: 'note', text: 'hi' }) + '\n')
  assert.equal(r.valid, false)
  assert.ok(r.issues[0].includes('type 未知'))
})

test('A1 · 坏 JSON 行报行号', () => {
  const r = parseLedger('# 注释\n{"type":"promise","id":"p-1",\n')
  assert.equal(r.valid, false)
  assert.match(r.issues[0], /第 2 行不是合法 JSON/)
})

test('A1 · 注释与空行合法跳过', () => {
  const r = parseLedger('# 头\n\n   \n' + JSON.stringify(P()) + '\n')
  assert.equal(r.valid, true)
})

test('A1 · id 重复拒绝（报行号）', () => {
  const r = parseLedger([JSON.stringify(P()), JSON.stringify(P({ what: '另一件' }))].join('\n') + '\n')
  assert.equal(r.valid, false)
  assert.match(r.issues[0], /第 2 行 id 重复: p-1/)
})

test('A1 · supersedes 指向不存在的结拒绝', () => {
  const r = parseLedger(JSON.stringify({ type: 'abandon', id: 'p-9a', supersedes: 'p-9', reason: 'x' }) + '\n')
  assert.equal(r.valid, false)
  assert.ok(r.issues[0].includes('不存在的结'))
})

test('A1 · revise 已关闭的结拒绝（二次改同一目标）', () => {
  const r = parseLedger(
    [
      JSON.stringify(P()),
      JSON.stringify({ type: 'revise', id: 'p-1r', supersedes: 'p-1', reason: '一改' }),
      JSON.stringify({ type: 'revise', id: 'p-1r2', supersedes: 'p-1', reason: '二改' }),
    ].join('\n') + '\n'
  )
  assert.equal(r.valid, false)
  assert.ok(r.issues[0].includes('已关闭'))
})

test('A1 · discharge 宣告指向已关闭的结拒绝', () => {
  const r = parseLedger(
    [
      JSON.stringify(P()),
      JSON.stringify({ type: 'abandon', id: 'p-1a', supersedes: 'p-1', reason: '弃' }),
      JSON.stringify({ type: 'discharge', settles: 'p-1', discharge: { contains: 'x' } }),
    ].join('\n') + '\n'
  )
  assert.equal(r.valid, false)
  assert.ok(r.issues[0].includes('已关闭'))
})

test('A1 · 空串字段拒绝', () => {
  const r = parseLedger(JSON.stringify({ type: 'promise', id: 'p-1', what: '' }) + '\n')
  assert.equal(r.valid, false)
  assert.ok(r.issues.some((m) => m.includes('空串')))
})

test('A1 · validateDischarge 直测：合法与三类非法', () => {
  assert.equal(validateDischarge({ contains: 'x' }).valid, true)
  assert.equal(validateDischarge(null).valid, false)
  assert.equal(validateDischarge({ contains: 3 }).valid, false)
  assert.equal(validateDischarge({ contains: 'x', ok: 1 }).valid, false)
})

test('A1 · openIdsOf：revise 换结、abandon 关结', () => {
  const { open, seen } = openIdsOf([
    P({ id: 'p-1' }),
    P({ id: 'p-2' }),
    { type: 'revise', id: 'p-1r', supersedes: 'p-1', reason: '变' },
    { type: 'abandon', id: 'p-2a', supersedes: 'p-2' },
  ])
  assert.deepEqual([...open.keys()], ['p-1r'])
  assert.equal(seen.has('p-1'), true)
})

// ---------------------------------------------------------------- A2 引擎

const C = (name, args, isError = false) => ({ ref: null, name, args, isError, at: null })

test('A2 · 空账空流：咎值 0 无咎过门，speech 诚实 null', () => {
  const r = settleLedger([], [])
  assert.deepEqual(r.totals, { promised: 0, discharged: 0, revised: 0, abandoned: 0, breached: 0 })
  assert.equal(r.score, 0)
  assert.equal(r.band, '无咎')
  assert.equal(r.verdict, 'pass')
  assert.equal(r.gate, GATE_DEFAULT)
  assert.deepEqual(r.speech, { events: 0, markerHits: 0, unaccounted: null })
})

test('A2 · 凭据命中 → 兑现，记首次命中调用序号', () => {
  const calls = [C('write', { path: 'a.js' }), C('bash', { command: 'npm test' })]
  const r = settleLedger([P({ discharge: { tool: 'bash', contains: 'npm test', ok: true } })], calls)
  assert.equal(r.totals.discharged, 1)
  assert.equal(r.discharged[0].dischargedAt, 1)
  assert.equal(r.score, 0)
  assert.equal(r.verdict, 'pass')
})

test('A2 · 凭据无匹配 → 失诺 30 入咎带过不了门', () => {
  const r = settleLedger([P({ what: '跑测试', discharge: { contains: 'npm test', ok: true } })], [C('write', { path: 'a.js' })])
  assert.equal(r.totals.breached, 1)
  assert.equal(r.breakdown.blame, 30)
  assert.equal(r.score, 30)
  assert.equal(r.band, '咎')
  assert.equal(r.verdict, 'fail')
  assert.deepEqual(r.knots[0], { id: 'p-1', what: '跑测试', blame: 30, leniency: 0, cause: '凭据无匹配' })
})

test('A2 · 无凭悬结：咎 30 + 吝 10 = 40', () => {
  const r = settleLedger([P({ what: '随口一诺' })], [])
  assert.equal(r.score, 40)
  assert.deepEqual(r.breakdown, { blame: 30, leniency: 10 })
  assert.deepEqual(r.knots[0], { id: 'p-1', what: '随口一诺', blame: 30, leniency: 10, cause: '整条链无凭据' })
})

test('A2 · 咎 cap 60：三笔封顶，四笔不再涨', () => {
  const three = settleLedger([P({ id: 'a', discharge: { contains: 'x' } }), P({ id: 'b', discharge: { contains: 'x' } }), P({ id: 'c', discharge: { contains: 'x' } })], [])
  const four = settleLedger([P({ id: 'a', discharge: { contains: 'x' } }), P({ id: 'b', discharge: { contains: 'x' } }), P({ id: 'c', discharge: { contains: 'x' } }), P({ id: 'd', discharge: { contains: 'x' } })], [])
  assert.equal(three.breakdown.blame, 60)
  assert.equal(four.breakdown.blame, 60)
  assert.equal(four.score, 60)
})

test('A2 · 无凭弃约记吝：一笔 10 留痕（无咎带内），两笔 20 入吝带，三笔封顶 20', () => {
  const one = settleLedger(
    [P({ id: 'a' }), { type: 'abandon', id: 'aa', supersedes: 'a', reason: '变' }],
    []
  )
  assert.equal(one.totals.abandoned, 1)
  assert.deepEqual(one.breakdown, { blame: 0, leniency: 10 })
  assert.equal(one.breakdown.leniency, 10)
  assert.equal(one.score, 10)
  assert.equal(one.band, '无咎', '吝带起点 15：一笔轻诺留痕但不过带')
  assert.equal(one.verdict, 'pass')

  const two = settleLedger(
    [
      P({ id: 'a' }),
      P({ id: 'b' }),
      { type: 'abandon', id: 'aa', supersedes: 'a', reason: '变' },
      { type: 'abandon', id: 'ba', supersedes: 'b', reason: '变' },
    ],
    []
  )
  assert.equal(two.breakdown.leniency, 20)
  assert.equal(two.score, 20)
  assert.equal(two.band, '吝')

  const three = settleLedger(
    [
      P({ id: 'a' }),
      P({ id: 'b' }),
      P({ id: 'c' }),
      { type: 'abandon', id: 'aa', supersedes: 'a', reason: '变' },
      { type: 'abandon', id: 'ba', supersedes: 'b', reason: '变' },
      { type: 'abandon', id: 'ca', supersedes: 'c', reason: '变' },
    ],
    []
  )
  assert.equal(three.breakdown.leniency, 20)
  assert.deepEqual(three.lenientAbandoned.map((k) => k.id), ['a', 'b', 'c'])
})

test('A2 · 总分 cap：2 失诺（60）+ 6 无凭弃约（封 20）= 80', () => {
  const entries = [
    P({ id: 'x1', discharge: { contains: 'nope' } }),
    P({ id: 'x2', discharge: { contains: 'nope' } }),
    ...['a', 'b', 'c', 'd', 'e', 'f'].flatMap((id) => [
      P({ id }),
      { type: 'abandon', id: `${id}a`, supersedes: id, reason: '变' },
    ]),
  ]
  const r = settleLedger(entries, [])
  assert.deepEqual(r.breakdown, { blame: 60, leniency: 20 })
  assert.equal(r.score, 80)
})

test('A2 · 分带边界逐点：14 无咎 / 15 吝 / 29 吝 / 30 咎', () => {
  assert.equal(bandOf(0), '无咎')
  assert.equal(bandOf(14), '无咎')
  assert.equal(bandOf(15), '吝')
  assert.equal(bandOf(29), '吝')
  assert.equal(bandOf(30), '咎')
  assert.equal(bandOf(100), '咎')
})

test('A2 · verdict 门语义：score>=gate 判 fail；调高 gate 翻 pass', () => {
  const entries = [P({ discharge: { contains: 'nope' } })]
  assert.equal(settleLedger(entries, [], { gate: 30 }).verdict, 'fail')
  assert.equal(settleLedger(entries, [], { gate: 31 }).verdict, 'pass')
  assert.equal(settleLedger(entries, [], { gate: 100 }).verdict, 'pass')
})

test('A2 · 改诺链：只对链尾结账，凭据与 what 均可继承', () => {
  const entries = [
    P({ id: 'p-1', what: '跑全量', discharge: { tool: 'bash', contains: 'npm test', ok: true } }),
    { type: 'revise', id: 'p-1r', supersedes: 'p-1', reason: '收窄' },
  ]
  const r = settleLedger(entries, [C('bash', { command: 'npm test' })])
  assert.equal(r.totals.revised, 1)
  assert.equal(r.totals.discharged, 1)
  assert.equal(r.score, 0)
})

test('A2 · 改诺显式换凭：新凭命中即兑现', () => {
  const entries = [
    P({ id: 'p-1', discharge: { contains: 'never-happens' } }),
    { type: 'revise', id: 'p-1r', supersedes: 'p-1', reason: '换法', discharge: { contains: 'smoke' } },
  ]
  const r = settleLedger(entries, [C('bash', { command: 'npm run smoke' })])
  assert.equal(r.totals.discharged, 1)
  assert.equal(r.totals.breached, 0)
})

test('A2 · 改诺未带 what：失诺行继承原 what', () => {
  const entries = [
    P({ id: 'p-1', what: '原始诺言' }),
    { type: 'revise', id: 'p-1r', supersedes: 'p-1', reason: '换法' },
  ]
  const r = settleLedger(entries, [])
  assert.equal(r.knots[0].what, '原始诺言')
  assert.equal(r.knots[0].id, 'p-1r')
})

test('A2 · 带凭弃约：悔 0 分，lenientAbandoned 为空', () => {
  const entries = [
    P({ id: 'p-1', discharge: { contains: 'x' } }),
    { type: 'abandon', id: 'p-1a', supersedes: 'p-1', reason: '作废' },
  ]
  const r = settleLedger(entries, [])
  assert.equal(r.score, 0)
  assert.equal(r.totals.abandoned, 1)
  assert.equal(r.lenientAbandoned.length, 0)
})

test('A2 · discharge 宣告：命中 → 兑现；不命中 → 有凭失诺只记咎不记吝', () => {
  const good = settleLedger(
    [P({ id: 'p-1' }), { type: 'discharge', settles: 'p-1', discharge: { contains: 'README' } }],
    [C('write', { path: 'README.md' })]
  )
  assert.equal(good.totals.discharged, 1)
  assert.equal(good.score, 0)

  const bad = settleLedger(
    [P({ id: 'p-1' }), { type: 'discharge', settles: 'p-1', discharge: { contains: 'README' } }],
    []
  )
  assert.equal(bad.totals.breached, 1)
  assert.deepEqual(bad.breakdown, { blame: 30, leniency: 0 })
  assert.equal(bad.knots[0].cause, '凭据无匹配')
})

test('A2 · ok 语义：ok:false 被失败调用满足；ok:true 不被失败调用满足', () => {
  const failed = [C('bash', { command: 'npm test' }, true)]
  const okFalse = settleLedger([P({ discharge: { contains: 'npm test', ok: false } })], failed)
  assert.equal(okFalse.totals.discharged, 1)
  const okTrue = settleLedger([P({ discharge: { contains: 'npm test', ok: true } })], failed)
  assert.equal(okTrue.totals.breached, 1)
})

test('A2 · tool 过滤：同名工具才相认；contains 是 args JSON 的子串', () => {
  const calls = [C('write', { path: 'npm test 计划.md' }), C('bash', { command: 'npm test' })]
  const r = settleLedger([P({ discharge: { tool: 'bash', contains: 'npm test', ok: true } })], calls)
  assert.equal(r.discharged[0].dischargedAt, 1, 'write 的 args 虽含子串，但 tool 不匹配')
})

test('A2 · isError 未知的调用（孤儿 result）不满足 ok:true', () => {
  const r = settleLedger([P({ discharge: { contains: 'npm test', ok: true } })], [C('bash', { command: 'npm test' }, null)])
  assert.equal(r.totals.breached, 1)
})

test('A2 · 悬结按账序输出', () => {
  const r = settleLedger([P({ id: 'z-2' }), P({ id: 'a-1' })], [])
  assert.deepEqual(r.knots.map((k) => k.id), ['z-2', 'a-1'])
})

// ---------------------------------------------------------------- A3 流与对账

test('A3 · parseStream：注释空行跳过、坏行报行号', () => {
  const evs = parseStream('# 注\n\n{"type":"tool_call","id":"c1","name":"bash","args":{}}\n')
  assert.equal(evs.length, 1)
  assert.throws(() => parseStream('{"ok":1}\n{oops}\n'), /第 2 行不是合法 JSON/)
})

test('A3 · buildCalls：带 id 配对回填 isError', () => {
  const { calls } = buildCalls([
    { type: 'tool_call', id: 'c1', name: 'bash', args: { command: 'npm test' } },
    { type: 'tool_result', id: 'c1', isError: true },
  ])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
  assert.equal(calls[0].name, 'bash')
})

test('A3 · buildCalls：无 id 旧格式 result 并入紧邻 call', () => {
  const { calls } = buildCalls([
    { type: 'tool_call', name: 'bash', args: { command: 'npm test' } },
    { type: 'tool_result', isError: false },
    { type: 'tool_call', name: 'write', args: { path: 'a' } },
    { type: 'tool_result', isError: true },
  ])
  assert.equal(calls.length, 2)
  assert.equal(calls[0].isError, false)
  assert.equal(calls[1].isError, true)
})

test('A3 · buildCalls：孤儿 result 独立建档（isError null）', () => {
  const { calls } = buildCalls([{ type: 'tool_result', id: 'ghost', name: 'bash', isError: true }])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('A3 · buildCalls：speech 收集（凡非空话语都入账，词表只在计数时用），空串不收', () => {
  const { speech } = buildCalls([
    { type: 'speech', text: '接下来我会补测试', turn: 't3' },
    { type: 'speech', text: '' },
    { type: 'speech', text: '好的' },
  ])
  assert.equal(speech.length, 2, '空串丢弃，非空全收')
  assert.equal(speech[0].turn, 't3')
})

test('A3 · matchDischarge 直测：命中首个即返回', () => {
  const calls = [C('bash', { command: 'npm test' }), C('bash', { command: 'npm test -- -x' })]
  assert.equal(matchDischarge({ contains: 'npm test', ok: true }, calls), 0)
  assert.equal(matchDischarge({ contains: 'nope' }, calls), null)
})

test('A3 · 词表：事件级去重、可替换、非法替换抛 TypeError', () => {
  assert.ok(DEFAULT_MARKERS.includes('接下来'))
  const speech = [{ text: '接下来我会补测试' }, { text: '回头再说' }]
  assert.equal(countMarkerHits(speech, normalizeMarkers(null)), 2, '事件一含两标记只记一次')
  assert.equal(countMarkerHits(speech, normalizeMarkers({ markers: ['保证'] })), 0)
  assert.throws(() => normalizeMarkers({ markers: [''] }), TypeError)
  assert.throws(() => normalizeMarkers({ markers: '接下来' }), TypeError)
})

test('A3 · speech 统计：hits>promised 记缺口，hits<=promised 记 0', () => {
  const entries = [P({ id: 'p-1' }), P({ id: 'p-2' }), P({ id: 'p-3' })]
  const speech = [
    { text: '接下来我会做' },
    { text: '稍后做' },
    { text: '回头做' },
    { text: '待会儿做' },
    { text: '随后做' },
  ]
  const r = settleLedger(entries, [], { speech })
  assert.deepEqual(r.speech, { events: 5, markerHits: 5, unaccounted: 2 })
  const r2 = settleLedger(entries, [], { speech: speech.slice(0, 2) })
  assert.equal(r2.speech.unaccounted, 0)
})

test('A3 · 夹具 clean：两结全兑现，咎值 0，speech null', () => {
  const ledger = parseLedger(readFixture('clean-ledger.jsonl'))
  const { calls, speech } = buildCalls(parseStream(readFixture('clean-stream.jsonl')))
  const r = settleLedger(ledger.entries, calls, { speech })
  assert.equal(ledger.valid, true)
  assert.deepEqual(r.totals, { promised: 2, discharged: 2, revised: 0, abandoned: 0, breached: 0 })
  assert.equal(r.score, 0)
  assert.equal(r.band, '无咎')
  assert.equal(r.verdict, 'pass')
  assert.deepEqual(r.speech, { events: 0, markerHits: 0, unaccounted: null })
})

test('A3 · 夹具 broken：立3兑1弃1失1，咎值 40，unaccounted 2', () => {
  const ledger = parseLedger(readFixture('broken-ledger.jsonl'))
  const { calls, speech } = buildCalls(parseStream(readFixture('broken-stream.jsonl')))
  const r = settleLedger(ledger.entries, calls, { speech })
  assert.deepEqual(r.totals, { promised: 3, discharged: 1, revised: 0, abandoned: 1, breached: 1 })
  assert.deepEqual(r.breakdown, { blame: 30, leniency: 10 })
  assert.equal(r.score, 40)
  assert.equal(r.band, '咎')
  assert.equal(r.verdict, 'fail')
  assert.deepEqual(r.speech, { events: 5, markerHits: 5, unaccounted: 2 })
  assert.deepEqual(r.knots, [{ id: 'p-002', what: '同步 README 示例', blame: 30, leniency: 10, cause: '整条链无凭据' }])
  assert.deepEqual(r.lenientAbandoned, [])
})

// ---------------------------------------------------------------- A4 结账块

test('A4 · 夹具 broken 的结账块逐字节等于金样', () => {
  const ledger = parseLedger(readFixture('broken-ledger.jsonl'))
  const { calls, speech } = buildCalls(parseStream(readFixture('broken-stream.jsonl')))
  const block = renderBlock(settleLedger(ledger.entries, calls, { speech }))
  assert.equal(
    block,
    [
      '【立诚 · 结绳】',
      '诺言：立 3 · 兑现 1 · 改诺 0 · 弃约 1 · 失诺 1',
      '咎值：40（咎）· 门 30',
      '悬结：p-002「同步 README 示例」咎+30，轻诺+10（整条链无凭据）',
      '——《周易·系辞上》：无咎者，善补过也。',
      '',
    ].join('\n')
  )
})

test('A4 · 同一输入两次渲染逐字节相同（shasum 语义）', () => {
  const ledger = parseLedger(readFixture('broken-ledger.jsonl'))
  const { calls, speech } = buildCalls(parseStream(readFixture('broken-stream.jsonl')))
  const a = renderBlock(settleLedger(ledger.entries, calls, { speech }))
  const b = renderBlock(settleLedger(ledger.entries, calls, { speech }))
  assert.equal(a, b)
  assert.doesNotMatch(a, /\d{4}-\d{2}-\d{2}/, '无时间戳字段')
})

test('A4 · 全平账以「绳上无悬结。」与文言引文收尾', () => {
  const ledger = parseLedger(readFixture('clean-ledger.jsonl'))
  const { calls } = buildCalls(parseStream(readFixture('clean-stream.jsonl')))
  const block = renderBlock(settleLedger(ledger.entries, calls, { speech: [] }))
  assert.match(block, /绳上无悬结。\n/)
  assert.match(block, /——《周易·乾·文言》：庸言之信，庸行之谨。\n$/)
})

test('A4 · 纯吝账：轻诺行 + 系辞引文，无悬结行、无「绳上无悬结」', () => {
  const entries = [
    P({ id: 'p-1', what: '甲' }),
    P({ id: 'p-2', what: '乙' }),
    { type: 'abandon', id: 'p-1a', supersedes: 'p-1', reason: '变' },
    { type: 'abandon', id: 'p-2a', supersedes: 'p-2', reason: '变' },
  ]
  const block = renderBlock(settleLedger(entries, [], { speech: [] }))
  assert.equal(
    block,
    [
      '【立诚 · 结绳】',
      '诺言：立 2 · 兑现 0 · 改诺 0 · 弃约 2 · 失诺 0',
      '咎值：20（吝）· 门 30',
      '轻诺：p-1「甲」吝+10（无凭弃约）',
      '轻诺：p-2「乙」吝+10（无凭弃约）',
      '——《周易·系辞上》：无咎者，善补过也。',
      '',
    ].join('\n')
  )
})

test('A4 · 凭据无匹配的悬结行版式（有凭，无轻诺）', () => {
  const r = settleLedger([P({ id: 'p-9', what: '写报告', discharge: { contains: 'REPORT' } })], [], { speech: [] })
  const block = renderBlock(r)
  assert.match(block, /悬结：p-9「写报告」咎\+30（凭据无匹配）\n/)
  assert.doesNotMatch(block, /轻诺/)
})
