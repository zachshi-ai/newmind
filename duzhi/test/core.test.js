/**
 * 度支 core 单测 —— 流解析 / 制册 schema / 用账引擎 / 分带门禁 / 余量块渲染。
 * 夹具期望值先于实现手算锁死（docs/04-acceptance.md），实现后未改动任何期望值。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { validateRegister, validateCaps, resolveCaps, hasCaps, GATE_DEFAULT } from '../src/core/register.js'
import {
  createLedger,
  step,
  liveScore,
  analyze,
  bandName,
} from '../src/core/ledger.js'
import { renderYuliang } from '../src/core/block.js'
import { auditStream } from '../src/core/audit.js'

// ---------- 流解析 ----------

test('流: 注释与空行跳过，坏 JSON 报行号', () => {
  const events = parseStream('# 头注释\n\n{"type":"turn_start","id":"t1"}\n   \n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"type":"turn_start"}\n不是JSON\n'), /第 2 行/)
})

test('流: 带 id 的 call/result 按 id 配对，result 回填 isError，call 首见建档唯一', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"npm test"},"at":100}',
        '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"npm test"},"at":105}',
        '{"type":"tool_result","id":"c1","isError":false,"at":110}',
        '{"type":"tool_result","id":"c1","isError":true,"at":120}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 1) // call 首见为准：重复 id 的 call 不再建档
  assert.equal(calls[0].at, 100)
  assert.equal(calls[0].isError, true) // result 回填以最后到账者为准（真实流一案一结果）
})

test('流: 无 id 旧格式 result 并入紧邻其前的 call', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_call","name":"bash","args":{"command":"ls"}}',
        '{"type":"tool_result","isError":true}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('流: 孤儿 result 独立建档（isError:null 不丢执行）', () => {
  const { calls } = buildCalls(parseStream('{"type":"tool_result","id":"x","isError":false}'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].ref, 'x')
  assert.equal(calls[0].isError, false)
})

test('流: 非工具事件跳过，at 原样保留', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"turn_start","id":"t1","at":1730000000000}',
        '{"type":"tool_call","id":"c1","name":"read","args":{"path":"a"},"at":1730000001000}',
        '{"type":"tool_result","id":"c1","isError":false}',
        '{"type":"turn_end","id":"t1"}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].at, 1730000001000)
})

// ---------- 制册 schema ----------

test('制册: 合法全册（双线）', () => {
  const v = validateRegister({ version: 1, id: '任一', budget: { maxCalls: 10, maxMinutes: 5 } })
  assert.equal(v.valid, true)
  assert.equal(v.issues.length, 0)
})

test('制册: 单线皆合法（只 maxCalls / 只 maxMinutes）', () => {
  assert.equal(validateRegister({ version: 1, id: 'a', budget: { maxCalls: 3 } }).valid, true)
  assert.equal(validateRegister({ version: 1, id: 'b', budget: { maxMinutes: 1 } }).valid, true)
})

test('制册: version 错、id 缺、budget 缺、budget 空各出一条 issue', () => {
  const cases = [
    { version: 2, id: 'a', budget: { maxCalls: 1 } },
    { version: 1, budget: { maxCalls: 1 } },
    { version: 1, id: 'a' },
    { version: 1, id: 'a', budget: {} },
  ]
  for (const c of cases) {
    const v = validateRegister(c)
    assert.equal(v.valid, false, JSON.stringify(c))
    assert.ok(v.issues.length >= 1)
    assert.equal(v.issues[0].code, 'schema')
  }
})

test('制册: 线必须是 ≥1 整数（0 / 负 / 小数 / 字符串皆拒）', () => {
  for (const bad of [0, -1, 1.5, '3', null]) {
    const v = validateRegister({ version: 1, id: 'a', budget: { maxCalls: bad } })
    assert.equal(v.valid, false, String(bad))
  }
})

test('制册: 多余字段宽容忽略', () => {
  const v = validateRegister({ version: 1, id: 'a', budget: { maxCalls: 2 }, note: '随便', extra: [1] })
  assert.equal(v.valid, true)
})

test('制册: resolveCaps 册形取 budget、简形取顶层', () => {
  const nested = resolveCaps({ register: { version: 1, id: 'n', budget: { maxCalls: 7 } } })
  assert.deepEqual(nested.caps, { maxCalls: 7 })
  assert.equal(nested.id, 'n')
  const flat = resolveCaps({ register: { id: 'f', maxMinutes: 9 } })
  assert.deepEqual(flat.caps, { maxMinutes: 9 })
  assert.equal(flat.id, 'f')
})

test('制册: CLI 旗标与册互补、同键覆盖', () => {
  const merged = resolveCaps({
    register: { version: 1, id: 'a', budget: { maxCalls: 10, maxMinutes: 30 } },
    maxCalls: 5,
  })
  assert.deepEqual(merged.caps, { maxCalls: 5, maxMinutes: 30 })
})

test('制册: 非法旗标被拒且 validateCaps 出 issue（0 / 小数）', () => {
  assert.equal(validateCaps({ maxCalls: 0 }).valid, false)
  assert.equal(validateCaps({ maxMinutes: 2.5 }).valid, false)
  assert.equal(validateCaps({ maxCalls: 3, maxMinutes: 4 }).valid, true)
  const r = resolveCaps({ maxCalls: 0 })
  assert.deepEqual(r.caps, {})
})

test('制册: id 优先级 旗标 > 册 > null；一条线都没有即无制', () => {
  assert.equal(resolveCaps({ maxCalls: 1, id: 'x', register: { id: 'y' } }).id, 'x')
  assert.equal(resolveCaps({ register: { id: 'y' } }).id, 'y')
  assert.equal(resolveCaps({}).id, null)
  assert.equal(hasCaps(resolveCaps({}).caps), false)
  assert.equal(hasCaps(resolveCaps({ maxMinutes: 2 }).caps), true)
})

// ---------- 用账引擎 ----------

const call = (at = null, isError = false, ref = null) => ({ ref, name: 'bash', args: {}, isError, at })

test('用账: 前缀一致——cap 3 八调用逐步制值 0,0,0,6,12,18,24,30', () => {
  const led = createLedger({ caps: { maxCalls: 3 }, id: 't' })
  const seen = []
  for (let i = 1; i <= 8; i++) {
    step(led, call(1000 * i))
    seen.push(liveScore(led).score.total)
  }
  assert.deepEqual(seen, [0, 0, 0, 6, 12, 18, 24, 30])
})

test('用账: 第 maxCalls 次合法，第 maxCalls+1 次起逾（线内合法过线即逾）', () => {
  const led = createLedger({ caps: { maxCalls: 2 }, id: 't' })
  step(led, call(1))
  step(led, call(2))
  assert.equal(liveScore(led).counts.overCalls, 0)
  step(led, call(3))
  assert.equal(liveScore(led).counts.overCalls, 1)
  assert.equal(liveScore(led).overCases[0].seq, 3)
  assert.equal(liveScore(led).overCases[0].via, 'calls')
})

test('用账: 时程过线严格大于——恰在线上合法', () => {
  const led = createLedger({ caps: { maxMinutes: 1 }, id: 't' })
  step(led, call(0))
  step(led, call(60000))
  assert.equal(liveScore(led).counts.overCalls, 0, '恰在 60000ms 线上，不逾')
  step(led, call(60001))
  assert.equal(liveScore(led).counts.overCalls, 1)
  assert.equal(liveScore(led).overCases[0].via, 'time')
})

test('用账: 两线同越 via both，一案计一次不双罚', () => {
  const led = createLedger({ caps: { maxCalls: 1, maxMinutes: 1 }, id: 't' })
  step(led, call(0))
  step(led, call(120000))
  const live = liveScore(led)
  assert.equal(live.counts.overCalls, 1)
  assert.equal(live.overCases[0].via, 'both')
  assert.equal(live.score.yuzhi, 6)
})

test('用账: 失败调用照计（失败也花了钱），无 isError 计为守界出量', () => {
  const led = createLedger({ caps: { maxCalls: 1 }, id: 't' })
  step(led, call(1, true))
  assert.equal(liveScore(led).counts.overCalls, 0)
  step(led, call(2, true))
  assert.equal(liveScore(led).counts.overCalls, 1)
  assert.equal(liveScore(led).score.total, 6)
})

test('用账: 无 at 之流——spanMs null、时程逾不判、调用线照判', () => {
  const led = createLedger({ caps: { maxMinutes: 1 }, id: 't' })
  step(led, call(null))
  step(led, call(null))
  const live = liveScore(led)
  assert.equal(live.counts.spanMs, null)
  assert.equal(live.score.total, 0)

  const led2 = createLedger({ caps: { maxCalls: 1 }, id: 't' })
  step(led2, call(null))
  step(led2, call(null))
  assert.equal(liveScore(led2).score.total, 6)
})

test('用账: firstAt 取首个带 at 调用，前面缺 at 的不设基准', () => {
  const led = createLedger({ caps: { maxMinutes: 1 }, id: 't' })
  step(led, call(null))
  step(led, call(1730000000000))
  step(led, call(1730000061000)) // 距首带 at 61s > 60s → 逾
  const live = liveScore(led)
  assert.equal(live.counts.overCalls, 1)
  assert.equal(live.overCases[0].via, 'time')
})

test('用账: 个别缺 at 的调用只跳时程逾判，调用维度照判', () => {
  const led = createLedger({ caps: { maxCalls: 2, maxMinutes: 1 }, id: 't' })
  step(led, call(0))
  step(led, call(1))
  step(led, call(null)) // 第 3 次：调用过线；无 at → 时程不可判
  const live = liveScore(led)
  assert.equal(live.counts.overCalls, 1)
  assert.equal(live.overCases[0].via, 'calls')
})

test('用账: 逾制 cap 60——11 案 66 记 60（账面照记 11 案）', () => {
  const led = createLedger({ caps: { maxCalls: 1 }, id: 't' })
  for (let i = 0; i < 12; i++) step(led, call(i))
  const live = liveScore(led)
  assert.equal(live.counts.overCalls, 11)
  assert.equal(live.score.yuzhi, 60)
  assert.equal(live.score.total, 60)
})

test('用账: 无制 40 一次性，不随调用量增长', () => {
  const led = createLedger({})
  step(led, call(1))
  step(led, call(2))
  step(led, call(3))
  const live = liveScore(led)
  assert.equal(live.counts.wuzhi, true)
  assert.equal(live.score.wuzhi, 40)
  assert.equal(live.score.total, 40)
})

test('用账: 分带边界 14足/15急/29急/30非', () => {
  assert.equal(bandName(0), '足')
  assert.equal(bandName(14), '足')
  assert.equal(bandName(15), '急')
  assert.equal(bandName(29), '急')
  assert.equal(bandName(30), '非')
  assert.equal(bandName(60), '非')
})

test('用账: spanMs = 末带 at − 首带 at', () => {
  const led = createLedger({ caps: { maxCalls: 100 }, id: 't' })
  step(led, call(1730000000000))
  step(led, call(1730000005000))
  step(led, call(1730000180000))
  assert.equal(liveScore(led).counts.spanMs, 180000)
})

test('用账: analyze 与逐步 liveScore 同流同前缀一致（账实对账的前提）', () => {
  const calls = Array.from({ length: 6 }, (_, i) => call(1000 * (i + 1)))
  const online = createLedger({ caps: { maxCalls: 4 }, id: 't' })
  for (let k = 1; k <= calls.length; k++) {
    step(online, calls[k - 1])
    const offlinePrefix = analyze(calls.slice(0, k), { caps: { maxCalls: 4 }, id: 't' })
    assert.deepEqual(liveScore(offlinePrefix).score, liveScore(online).score, `前缀 ${k} 不一致`)
  }
})

// ---------- 余量块渲染 ----------

test('余量块: 同一账本状态两次渲染逐字节相同', () => {
  const led = analyze(
    [call(1730000000000), call(1730000060000), call(1730000120000)],
    { caps: { maxCalls: 5 }, id: '任一' },
  )
  const a = renderYuliang(led, 1)
  const b = renderYuliang(led, 1)
  assert.equal(a, b)
  assert.ok(!a.includes('at'))
})

test('余量块: #k 随渲染递增且仅首行不同', () => {
  const led = analyze([call(1), call(2)], { caps: { maxCalls: 1 }, id: 't' })
  const l1 = renderYuliang(led, 1).split('\n')
  const l2 = renderYuliang(led, 2).split('\n')
  assert.equal(l1[0], '【度支 · 余量块 #1】')
  assert.equal(l2[0], '【度支 · 余量块 #2】')
  assert.deepEqual(l1.slice(1), l2.slice(1))
})

test('余量块: 有制不逾全行（fenced 手算）', () => {
  const led = analyze(
    [
      { ref: 'c1', name: 'read', args: {}, isError: false, at: 1730000000000 },
      { ref: 'c2', name: 'bash', args: {}, isError: false, at: 1730000180000 },
    ],
    { caps: { maxCalls: 100, maxMinutes: 60 }, id: 'fix-login-bug' },
  )
  const text = renderYuliang(led, 1)
  const lines = text.split('\n')
  assert.equal(lines[0], '【度支 · 余量块 #1】')
  assert.equal(lines[1], '任：fix-login-bug')
  assert.equal(lines[2], '入：调用 ≤100 · 时长 ≤60 分钟')
  assert.equal(lines[3], '出：调用 2 · 时程 3.0 分钟')
  assert.equal(lines[4], '蓄：调用 98 · 时程 57.0 分钟')
  assert.equal(lines[5], '带：足')
  assert.equal(lines[6], '逾：无')
  assert.equal(lines[7], '—— 本块由确定性规则生成；重放同一流必得同一文本。')
})

test('余量块: 无制变体全行（unbounded 手算）', () => {
  const led = analyze([call(1000), call(6000)], {})
  const lines = renderYuliang(led, 1).split('\n')
  assert.equal(lines[1], '任：（未立制册）')
  assert.equal(lines[2], '入：未制——量入无从谈起，出已无界')
  assert.equal(lines[3], '出：调用 2 · 时程 0.1 分钟')
  assert.equal(lines[4], '蓄：——')
  assert.equal(lines[5], '带：非')
  assert.equal(lines[6], '逾：未制，逾无从判')
})

test('余量块: 透支蓄与逾点名（overrun 手算）', () => {
  const calls = Array.from({ length: 8 }, (_, i) => call(1000 * (i + 1)))
  const led = analyze(calls, { caps: { maxCalls: 3 }, id: 'tight-scope' })
  const text = renderYuliang(led, 1)
  assert.ok(text.includes('入：调用 ≤3 · 时长 ——（未设）'))
  assert.ok(text.includes('蓄：−5 调用（已透支） · 时程 ——（未设）'))
  assert.ok(text.includes('带：非'))
  assert.ok(
    text.includes(
      '逾：第 4 次调用（调用过线）、第 5 次调用（调用过线）、第 6 次调用（调用过线）、第 7 次调用（调用过线）、第 8 次调用（调用过线）',
    ),
  )
})

test('余量块: 无时不判与 both 标签变体', () => {
  const led = analyze([call(null), call(null)], { caps: { maxMinutes: 5 }, id: 'clockless' })
  const text = renderYuliang(led, 1)
  assert.ok(text.includes('出：调用 2 · 时程 ——（无时不判）'))
  assert.ok(text.includes('调用 ——（未设） · 时长 ≤5 分钟'))
  assert.ok(text.includes('时程 ——（无时不判）'))

  const led2 = createLedger({ caps: { maxCalls: 1, maxMinutes: 1 }, id: 't' })
  step(led2, call(0))
  step(led2, call(120000))
  assert.ok(renderYuliang(led2, 1).includes('第 2 次调用（调用·时程过线）'))
})

// ---------- 离线审计胶水 ----------

test('审计: auditStream 全链路——守界/逾制/无制/追认四种裁决', () => {
  const fenced = auditStream(
    [
      '{"type":"tool_call","id":"a","name":"read","args":{},"at":1730000000000}',
      '{"type":"tool_result","id":"a","isError":false}',
      '{"type":"tool_call","id":"b","name":"edit","args":{},"at":1730000180000}',
      '{"type":"tool_result","id":"b","isError":false}',
    ].join('\n'),
    { register: { version: 1, id: '任一', budget: { maxCalls: 10, maxMinutes: 60 } } },
  )
  assert.equal(fenced.score.total, 0)
  assert.equal(fenced.band, '足')
  assert.equal(fenced.ok, true)
  assert.equal(fenced.counts.spanMs, 180000)

  const calls8 = Array.from(
    { length: 8 },
    (_, i) => `{"type":"tool_call","id":"c${i}","name":"bash","args":{},"at":${1000 * (i + 1)}}`,
  ).join('\n')
  const over = auditStream(calls8, { register: { version: 1, id: '任二', budget: { maxCalls: 3 } } })
  assert.equal(over.score.total, 30)
  assert.equal(over.band, '非')
  assert.equal(over.ok, false)

  const unbounded = auditStream(calls8, {})
  assert.equal(unbounded.counts.wuzhi, true)
  assert.equal(unbounded.score.total, 40)
  assert.equal(unbounded.ok, false)

  const retro = auditStream(calls8, { maxCalls: 5 })
  assert.equal(retro.score.total, 18)
  assert.equal(retro.band, '急')
  assert.equal(retro.ok, true)
  const tight = auditStream(calls8, { maxCalls: 3 })
  assert.equal(tight.score.total, 30)
  assert.equal(tight.ok, false)
})

test('审计: 册形非法抛错并点名路径（调用方决定退出码 2）', () => {
  assert.throws(() => auditStream('{"type":"tool_call","id":"a","name":"bash","args":{}}', {
    register: { version: 1, id: 'a', budget: {} },
  }), /budget/)
  assert.throws(() => auditStream('{}', { maxCalls: 0 }), /maxCalls/)
})

test('审计: 门默认 30（GATE_DEFAULT），--gate 覆盖生效', () => {
  assert.equal(GATE_DEFAULT, 30)
  const calls8 = Array.from(
    { length: 8 },
    (_, i) => `{"type":"tool_call","id":"c${i}","name":"bash","args":{},"at":${1000 * (i + 1)}}`,
  ).join('\n')
  assert.equal(auditStream(calls8, { maxCalls: 3, gate: 30 }).ok, false)
  assert.equal(auditStream(calls8, { maxCalls: 3, gate: 31 }).ok, true)
  assert.equal(auditStream(calls8, { maxCalls: 4, gate: 24 }).ok, false) // 4 逾案=24，恰在门上即 fail
  assert.equal(auditStream(calls8, { maxCalls: 4, gate: 25 }).ok, true)
})

// ---------- 补充边角（实现期追加，期望仍先于断言手算） ----------

test('流: 合法 JSON 但非对象之事件在归并处跳过（纯量不成调用）', () => {
  const events = parseStream('123\n"str"\n[1,2]\n{"type":"tool_call","id":"c1","name":"bash","args":{}}')
  assert.equal(events.length, 4) // 解析层照收，归并层去纯量
  const { calls } = buildCalls(events)
  assert.equal(calls.length, 1)
})

test('用账: 逾案逐案留痕 ref 与 at（对账可点名到次与时刻）', () => {
  const led = createLedger({ caps: { maxCalls: 1 }, id: 't' })
  step(led, { ref: 'c1', name: 'bash', args: {}, isError: false, at: 111 })
  step(led, { ref: 'c2', name: 'edit', args: {}, isError: false, at: 222 })
  const live = liveScore(led)
  assert.deepEqual(live.overCases, [{ seq: 2, ref: 'c2', at: 222, via: 'calls' }])
})

test('余量块: 时程透支变体（负分钟，全角负号）', () => {
  const led = analyze([call(0), call(180000)], { caps: { maxMinutes: 2 }, id: '任丁' })
  // spanMs = 180000 = 3.0 分；蓄 = 2 − 3.0 = −1.0 → 全角负号书写
  const text = renderYuliang(led, 1)
  assert.ok(text.includes('蓄：调用 ——（未设） · 时程 −1.0 分钟（已透支）'))
  assert.ok(text.includes('带：足')) // 时程逾 1 案 = 6 < 30
})

test('制册: resolveCaps 对缺 budget 之册等价空简形（issues 由 validateRegister 管）', () => {
  const r = resolveCaps({ register: { version: 1, id: 'n' } })
  assert.deepEqual(r.caps, {})
  assert.equal(r.id, 'n')
})

test('审计: --id 旗标注入追认报告（id 旗标 > 册 id）', () => {
  const report = auditStream(
    '{"type":"tool_call","id":"a","name":"bash","args":{},"at":1}',
    { maxCalls: 5, id: '追认之任' },
  )
  assert.equal(report.id, '追认之任')
  assert.equal(report.counts.wuzhi, false)
})
