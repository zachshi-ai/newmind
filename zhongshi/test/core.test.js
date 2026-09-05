/**
 * 终始 core 单测 —— 验收标准 A1–A8（docs/04）。
 * 夹具期望值先于实现手算（docs/04 夹具表），此处逐项对账。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { familyOf, workFamilyOf, argsText } from '../src/core/object.js'
import {
  normalizeItem,
  createRegister,
  validateRegister,
  mergeRegister,
  loadRegister,
} from '../src/core/shice.js'
import {
  createChengzhangEngine,
  step,
  liveScore,
  analyze,
  scoreOf,
  bandName,
  GATE_DEFAULT,
} from '../src/core/chengzhang.js'
import { renderChengkuai } from '../src/core/chengkuai.js'
import { auditStream } from '../src/core/audit.js'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (p) => join(here, '..', 'fixtures', p)
const read = (p) => readFileSync(fx(p), 'utf8')

const call = (name, args, isError = false, at = null, ref = null) => ({ ref, name, args, isError, at })

// ---------- A1 流解析 ----------

test('A1: 注释与空行跳过；坏 JSON 报行号', () => {
  const events = parseStream('# 注释\n\n{"type":"turn_start","id":"t"}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"type":"turn_start"}\n坏行\n'), /第 2 行/)
})

test('A1: 带 id 配对（isError 回填）；重复 id 不重复建档、结算以末次为准', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_call","id":"a","name":"bash","args":{"command":"x"}}',
        '{"type":"tool_result","id":"a","isError":true}',
        '{"type":"tool_result","id":"a","isError":false}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false) // 重试后以最终结算记账
})

test('A1: 无 id 旧格式 result 并入紧邻其前 call', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_call","name":"read","args":{"path":"a.js"}}',
        '{"type":"tool_result","isError":false}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
})

test('A1: 孤儿 result 独立建档（携带 isError 原样保留；缺失记 null）', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_result","id":"ghost","isError":true}',
        '{"type":"tool_result","id":"ghost2"}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 2)
  assert.equal(calls[0].ref, 'ghost')
  assert.equal(calls[0].isError, true)
  assert.equal(calls[1].isError, null)
})

test('A1: turn_* 等非工具事件跳过', () => {
  const { calls } = buildCalls(
    parseStream('{"type":"turn_start","id":"t"}\n{"type":"turn_end","id":"t"}'),
  )
  assert.equal(calls.length, 0)
})

test('A1: 多流按序拼接、seq 全局递增', () => {
  const reg = { items: [{ id: 'A', name: 'alpha', aliases: [], terminal: ['alpha done'], abandon: [] }], order: [] }
  const t1 = JSON.stringify({ type: 'tool_call', id: '1', name: 'bash', args: { command: 'work alpha' } })
  const t2 = JSON.stringify({ type: 'tool_call', id: '2', name: 'bash', args: { command: 'alpha done' } })
  const report = auditStream([t1, t2], { items: reg.items, order: reg.order })
  const s = report.items.find((i) => i.id === 'A')
  assert.equal(s.status, '有终')
  assert.equal(s.startSeq, 1)
  assert.equal(s.terminalSeq, 2)
})

// ---------- A2 工具族与作工面 ----------

test('A2: familyOf 同仓惯例逐字（精确表 ∪ 包含表）', () => {
  assert.equal(familyOf('read'), 'observe')
  assert.equal(familyOf('WebSearch'), 'observe') // 包含 search
  assert.equal(familyOf('edit'), 'write')
  assert.equal(familyOf('notebook_edit'), 'write') // 包含 edit
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('run_cmd'), 'exec') // 包含 run
  assert.equal(familyOf('todo_write'), 'write') // 共享表口径（本层另有收窄）
  assert.equal(familyOf('weather'), 'other')
})

test('A2: 本层作工面把 todo 族收窄为 other', () => {
  assert.equal(workFamilyOf('todo_write'), 'other')
  assert.equal(workFamilyOf('todowrite'), 'other')
  assert.equal(workFamilyOf('todo'), 'other')
  assert.equal(workFamilyOf('bash'), 'exec')
  assert.equal(workFamilyOf('edit'), 'write')
  assert.equal(workFamilyOf('read'), 'observe')
})

test('A2: argsText 递归收集全部字符串值', () => {
  assert.equal(argsText({ a: 'x', b: { c: ['y', { d: 'z' }] } }), 'x y z')
})

test('A2: 写族调用计入作工（路径含项词 → W）', () => {
  const engine = analyze([call('edit', { path: 'src/payments/fee.js' })], {
    items: [{ id: 'A', name: 'payments', aliases: [], terminal: [], abandon: [] }],
  })
  const live = liveScore(engine)
  assert.equal(live.states[0].status, '半途')
  assert.equal(live.states[0].startSeq, 1)
})

test('A2: 观察族计入作工（查即始）；other 族不入账', () => {
  const items = [{ id: 'A', name: 'payments', aliases: [], terminal: [], abandon: [] }]
  const obs = analyze([call('read', { path: 'src/payments/index.js' })], { items })
  assert.equal(liveScore(obs).states[0].status, '半途')

  const other = analyze([call('weather', { city: 'payments-town' })], { items })
  assert.equal(liveScore(other).states[0].status, '幽项')
  assert.equal(liveScore(other).counts.callsObserved, 1)
})

test('A2: todo_write 参数里全是项词也不计作工（幽项可判性的前提）', () => {
  const engine = analyze(
    [call('todo_write', { todos: [{ id: 'T1', content: 'payments 修复', status: 'in_progress' }] })],
    { items: [{ id: 'A', name: 'payments', aliases: [], terminal: [], abandon: [] }] },
  )
  const live = liveScore(engine)
  assert.equal(live.states[0].status, '幽项')
  assert.equal(live.counts.callsObserved, 1)
})

// ---------- A3 事册 ----------

test('A3: normalizeItem——name 缺省以 id 兼作；词集 = name ∪ aliases；空串滤除', () => {
  const it = normalizeItem({ id: 'T9', aliases: [' x ', ''], terminal: [], abandon: [] })
  assert.equal(it.name, 'T9')
  assert.deepEqual(it.words, ['T9', 'x'])
  assert.equal(it.terminal.length, 0)
  assert.throws(() => normalizeItem({ name: '无 id' }), /缺少 id/)
})

test('A3: 校验——重复 id 抛错；order 引用未立之事抛错', () => {
  assert.throws(
    () => validateRegister(createRegister({ items: [{ id: 'A' }, { id: 'A' }] })),
    /重复立事/,
  )
  assert.throws(
    () => validateRegister(createRegister({ items: [{ id: 'A' }], order: [['A', 'B']] })),
    /未立之事/,
  )
  assert.doesNotThrow(() =>
    validateRegister(createRegister({ items: [{ id: 'A' }, { id: 'B' }], order: [['A', 'B']] })),
  )
})

test('A3: loadRegister 缺文件 → 空册；载夹具事册得四事', () => {
  const empty = loadRegister(fx('不存在的册.json'))
  assert.equal(empty.items.length, 0)
  const reg = loadRegister(fx('silent.zhongshi.json'))
  assert.equal(reg.items.length, 4)
  assert.equal(reg.items[0].name, '重复扣款修复')
})

test('A3: mergeRegister 按 id 并集只增不删（既有 id 原样保留、新 id 追加）', () => {
  const file = createRegister({
    items: [{ id: 'A', name: '旧名', aliases: [], terminal: ['keep'], abandon: [] }],
    order: [['A', 'B']],
  })
  const merged = mergeRegister(file, createRegister({ items: [{ id: 'A', name: '改名' }, { id: 'B' }] }))
  assert.equal(merged.items.length, 2)
  assert.equal(merged.items[0].name, '旧名') // 既有 id 不动
  assert.equal(merged.items[1].id, 'B')
  assert.deepEqual(merged.order, [['A', 'B']])
})

// ---------- A4 词法与逐调用分类 ----------

test('A4: 词命中大小写归一', () => {
  const engine = analyze([call('bash', { command: 'grep -rn DEDUPE src/' })], {
    items: [{ id: 'A', name: 'dedupe', aliases: [], terminal: [], abandon: [] }],
  })
  assert.equal(liveScore(engine).states[0].status, '半途')
})

test('A4: 判定序锁死——弃 > 终 > 工', () => {
  const items = [
    { id: 'A', name: '迁移', aliases: ['migrate'], terminal: ['migrate check'], abandon: ['跳过迁移'] },
  ]
  const a = analyze([call('bash', { command: 'run migrate check # 跳过迁移' })], { items })
  assert.equal(liveScore(a).states[0].status, '有弃')

  const t = analyze([call('bash', { command: 'run migrate check on migrate' })], { items })
  assert.equal(liveScore(t).states[0].status, '有终')
})

test('A4: 一调用可并行结账多项', () => {
  const engine = analyze([call('bash', { command: 'npm run full-regression' })], {
    items: [
      { id: 'A', name: 'fa', aliases: [], terminal: ['full-regression'], abandon: [] },
      { id: 'B', name: 'fb', aliases: [], terminal: ['full-regression'], abandon: [] },
    ],
  })
  const live = liveScore(engine)
  assert.ok(live.states.every((s) => s.status === '有终'))
})

test('A4: 失败调用亦记作工（试错也是始）', () => {
  const engine = analyze([call('bash', { command: 'test payments-suite' }, true)], {
    items: [{ id: 'A', name: 'payments-suite', aliases: [], terminal: [], abandon: [] }],
  })
  assert.equal(liveScore(engine).states[0].status, '半途')
})

test('A4: 孤儿（isError:null）照成功侧口径', () => {
  const engine = analyze([call('bash', { command: 'work orphan-item' }, null)], {
    items: [{ id: 'A', name: 'orphan-item', aliases: [], terminal: [], abandon: [] }],
  })
  assert.equal(liveScore(engine).states[0].status, '半途')
})

test('A4: 未宣终形之项不得认终（至多半途，noTerminalDeclared 点名）', () => {
  const engine = analyze(
    [call('bash', { command: 'work alpha' }), call('bash', { command: 'alpha done' })],
    { items: [{ id: 'A', name: 'alpha', aliases: [], terminal: [], abandon: [] }] },
  )
  const live = liveScore(engine)
  assert.equal(live.states[0].status, '半途')
  assert.equal(live.states[0].noTerminalDeclared, true)
})

// ---------- A5 案别 ----------

test('A5: 幽项——全流无事件', () => {
  const engine = analyze([call('bash', { command: 'echo hi' })], {
    items: [{ id: 'A', name: 'quiet', aliases: [], terminal: [], abandon: [] }],
  })
  assert.equal(liveScore(engine).states[0].status, '幽项')
})

test('A5: 半途——末笔为 W；有终——末笔为 T', () => {
  const items = [{ id: 'A', name: 'alpha', aliases: [], terminal: ['alpha ok'], abandon: [] }]
  const ban = analyze([call('bash', { command: 'work alpha' })], { items })
  assert.equal(liveScore(ban).states[0].status, '半途')
  const zhong = analyze([call('bash', { command: 'work alpha' }), call('bash', { command: 'alpha ok' })], { items })
  assert.equal(liveScore(zhong).states[0].status, '有终')
})

test('A5: 空终——终言后复作工，末态不影响计数（W,T,W,T → 有终 + 空终 1）', () => {
  const items = [{ id: 'A', name: 'alpha', aliases: [], terminal: ['alpha ok'], abandon: [] }]
  const engine = analyze(
    [
      call('bash', { command: 'work alpha' }),
      call('bash', { command: 'alpha ok' }),
      call('bash', { command: 'work alpha again' }),
      call('bash', { command: 'alpha ok now' }),
    ],
    { items },
  )
  const live = liveScore(engine)
  assert.equal(live.states[0].status, '有终')
  assert.equal(live.counts.kongCount, 1)
  assert.deepEqual([live.kongList[0].terminalSeq, live.kongList[0].workSeq], [2, 3])
})

test('A5: 复活——弃后复作工，弃言作废（末笔定案）', () => {
  const items = [{ id: 'A', name: 'alpha', aliases: [], terminal: [], abandon: ['放弃 alpha'] }]
  const engine = analyze(
    [call('bash', { command: '放弃 alpha' }), call('bash', { command: 'work alpha' })],
    { items },
  )
  assert.equal(liveScore(engine).states[0].status, '半途')
})

test('A5: 终后言弃 → 有弃，不计空终（终被显式弃取代）', () => {
  const items = [{ id: 'A', name: 'alpha', aliases: [], terminal: ['alpha ok'], abandon: ['放弃 alpha'] }]
  const engine = analyze(
    [call('bash', { command: 'alpha ok' }), call('bash', { command: '放弃 alpha' })],
    { items },
  )
  const live = liveScore(engine)
  assert.equal(live.states[0].status, '有弃')
  assert.equal(live.counts.kongCount, 0)
})

test('A5: 空终多案逐案计（T,W,T,W → 两案）', () => {
  const items = [{ id: 'A', name: 'alpha', aliases: [], terminal: ['alpha ok'], abandon: [] }]
  const engine = analyze(
    [
      call('bash', { command: 'alpha ok' }),
      call('bash', { command: 'work alpha' }),
      call('bash', { command: 'alpha ok again' }),
      call('bash', { command: 'work alpha more' }),
    ],
    { items },
  )
  const live = liveScore(engine)
  assert.equal(live.counts.kongCount, 2)
  assert.deepEqual(
    live.kongList.map((c) => [c.terminalSeq, c.workSeq]),
    [[1, 2], [3, 4]],
  )
  assert.equal(scoreOf(0, 1, 2, 0).kong, 40) // 2 案即触 cap40
})

test('A5: 幽项封顶——3 项以上仍 60', () => {
  const items = [
    { id: 'A', name: 'aa', aliases: [], terminal: ['aa ok'], abandon: [] },
    { id: 'B', name: 'bb', aliases: [], terminal: [], abandon: [] },
    { id: 'C', name: 'cc', aliases: [], terminal: [], abandon: [] },
    { id: 'D', name: 'dd', aliases: [], terminal: [], abandon: [] },
  ]
  const report = auditStream([JSON.stringify({ type: 'tool_call', id: 'x', name: 'bash', args: { command: 'aa ok' } })], { items })
  assert.equal(report.counts.youCount, 3)
  assert.equal(report.score.you, 60)
  assert.equal(report.score.total, 60)
})

// ---------- A6 先后账 ----------

test('A6: 失序——B 首作工早于 A 首终，判一案', () => {
  const engine = analyze(
    [
      call('bash', { command: 'work b-item' }),
      call('bash', { command: 'work a-item' }),
      call('bash', { command: 'a-item ok' }),
    ],
    {
      items: [
        { id: 'A', name: 'a-item', aliases: [], terminal: ['a-item ok'], abandon: [] },
        { id: 'B', name: 'b-item', aliases: [], terminal: [], abandon: [] },
      ],
      order: [['A', 'B']],
    },
  )
  const live = liveScore(engine)
  assert.equal(live.counts.xuCount, 1)
  assert.deepEqual(live.violations[0].order, ['A', 'B'])
  assert.equal(live.violations[0].bStartSeq, 1)
  assert.equal(live.violations[0].aTerminalSeq, 3)
})

test('A6: A 无终不判（宁纵——不让 B 代 A 受罚）', () => {
  const engine = analyze(
    [call('bash', { command: 'work b-item' }), call('bash', { command: 'work a-item' })],
    {
      items: [
        { id: 'A', name: 'a-item', aliases: [], terminal: ['a-item ok'], abandon: [] },
        { id: 'B', name: 'b-item', aliases: [], terminal: [], abandon: [] },
      ],
      order: [['A', 'B']],
    },
  )
  const live = liveScore(engine)
  assert.equal(live.counts.xuCount, 0)
  assert.equal(live.counts.banCount, 2) // 两事各背半途
})

test('A6: 次序正确不判；多对逐对计', () => {
  const ok = analyze(
    [call('bash', { command: 'work a' }), call('bash', { command: 'a ok' }), call('bash', { command: 'work b' })],
    {
      items: [
        { id: 'A', name: 'a', aliases: [], terminal: ['a ok'], abandon: [] },
        { id: 'B', name: 'b', aliases: [], terminal: [], abandon: [] },
      ],
      order: [['A', 'B']],
    },
  )
  assert.equal(liveScore(ok).counts.xuCount, 0)

  const multi = analyze(
    [
      call('bash', { command: 'work b' }),
      call('bash', { command: 'work c' }),
      call('bash', { command: 'a ok' }),
    ],
    {
      items: [
        { id: 'A', name: 'a', aliases: [], terminal: ['a ok'], abandon: [] },
        { id: 'B', name: 'b', aliases: [], terminal: [], abandon: [] },
        { id: 'C', name: 'c', aliases: [], terminal: [], abandon: [] },
      ],
      order: [
        ['A', 'B'],
        ['A', 'C'],
      ],
    },
  )
  assert.equal(liveScore(multi).counts.xuCount, 2)
})

test('A6: B 全程未作工不判失序（bStartSeq 缺席）', () => {
  const engine = analyze([call('bash', { command: 'work a' })], {
    items: [
      { id: 'A', name: 'a', aliases: [], terminal: ['a ok'], abandon: [] },
      { id: 'B', name: 'b', aliases: [], terminal: [], abandon: [] },
    ],
    order: [['A', 'B']],
  })
  const live = liveScore(engine)
  assert.equal(live.counts.xuCount, 0)
})

test('A8: 有弃行渲染「弃#n」', () => {
  const engine = analyze([call('bash', { command: 'git commit -m "放弃 alpha：改道"' })], {
    items: [{ id: 'A', name: 'alpha', aliases: [], terminal: [], abandon: ['放弃 alpha'] }],
  })
  const text = renderChengkuai(engine, 1, 30)
  assert.ok(text.includes('A alpha｜有弃｜弃#1'))
})

// ---------- A7 程值与分带 ----------

test('A7: 分带边界逐点（14 近道 / 15 鲜终 / 29 鲜终 / 30 无终）', () => {
  assert.equal(bandName(0), '近道')
  assert.equal(bandName(14), '近道')
  assert.equal(bandName(15), '鲜终')
  assert.equal(bandName(29), '鲜终')
  assert.equal(bandName(30), '无终')
  assert.equal(bandName(100), '无终')
})

test('A7: 四轴 cap 逐点 + 合计 cap 100', () => {
  assert.equal(scoreOf(3, 0, 0, 0).you, 60) // 90→60
  assert.equal(scoreOf(0, 3, 0, 0).ban, 30) // 45→30
  assert.equal(scoreOf(0, 0, 3, 0).kong, 40) // 60→40
  assert.equal(scoreOf(0, 0, 0, 4).xu, 30) // 40→30
  const all = scoreOf(2, 2, 2, 3) // 60+30+40+30=160→100
  assert.equal(all.total, 100)
  assert.equal(scoreOf(1, 1, 0, 0).total, 45)
})

test('A7: 单幽项即红（30 = 无终）；门默认 30；--gate 可覆盖', () => {
  assert.equal(GATE_DEFAULT, 30)
  const items = [
    { id: 'A', name: 'done-thing', aliases: [], terminal: ['done-thing ok'], abandon: [] },
    { id: 'B', name: 'ghost-thing', aliases: [], terminal: [], abandon: [] },
  ]
  const report = auditStream([JSON.stringify({ type: 'tool_call', id: 'x', name: 'bash', args: { command: 'done-thing ok' } })], { items })
  assert.equal(report.score.total, 30)
  assert.equal(report.band, '无终')
  assert.equal(report.ok, false)
  const lenient = auditStream(
    [JSON.stringify({ type: 'tool_call', id: 'x', name: 'bash', args: { command: 'done-thing ok' } })],
    { items, gate: 31 },
  )
  assert.equal(lenient.ok, true)
})

test('A7: liveScore 与离线重放同流前缀一致', () => {
  const items = [
    { id: 'A', name: 'alpha', aliases: [], terminal: ['alpha ok'], abandon: [] },
    { id: 'B', name: 'beta', aliases: [], terminal: ['beta ok'], abandon: [] },
  ]
  const calls = [
    call('bash', { command: 'work alpha' }),
    call('bash', { command: 'alpha ok' }),
    call('bash', { command: 'work beta' }),
  ]
  for (let k = 1; k <= calls.length; k++) {
    const online = createChengzhangEngine({ items })
    for (let i = 0; i < k; i++) step(online, calls[i])
    const live = liveScore(online)
    const offline = liveScore(analyze(calls.slice(0, k), { items }))
    assert.deepEqual(live.score, offline.score, `前缀 ${k}`)
    assert.deepEqual(live.states, offline.states, `前缀 ${k}`)
  }
})

// ---------- A8 程账块逐字节确定 ----------

test('A8: 两次渲染 #k 之外逐字节相同（首行单独比、其余 deepEqual）', () => {
  const engine = analyze(
    [
      call('bash', { command: 'grep -rn dedupe src/' }),
      call('bash', { command: 'npm test -- test dedupe' }),
      call('bash', { command: 'grep -rn edge-cases test/' }),
    ],
    { items: readJson(fx('silent.zhongshi.json')).items },
  )
  const t1 = renderChengkuai(engine, 1, 30)
  const t2 = renderChengkuai(engine, 2, 30)
  const l1 = t1.split('\n')
  const l2 = t2.split('\n')
  assert.equal(l1[0], '【终始 · 程账块 #1】')
  assert.equal(l2[0], '【终始 · 程账块 #2】')
  assert.deepEqual(l1.slice(1), l2.slice(1))
})

test('A8: 末行逐字断言；无时间戳字段', () => {
  const engine = analyze([call('bash', { command: 'work alpha' })], {
    items: [{ id: 'A', name: 'alpha', aliases: [], terminal: [], abandon: [] }],
  })
  const text = renderChengkuai(engine, 1, 30)
  assert.ok(text.endsWith('—— 本块由确定性规则生成；重放同一流必得同一文本。'))
  assert.ok(!text.includes(String(Date.now()).slice(0, 8)))
})

test('A8: 未宣终形之半途在行尾点名；幽项行「全流无作工」', () => {
  const engine = analyze([call('bash', { command: 'work edge-cases' })], {
    items: [
      { id: 'T3', name: '边界用例', aliases: ['edge-cases'], terminal: [], abandon: [] },
      { id: 'T2', name: '账单导出', aliases: [], terminal: [], abandon: [] },
    ],
  })
  const text = renderChengkuai(engine, 1, 30)
  assert.ok(text.includes('T3 边界用例｜半途｜始#1 末作#1（未宣终形）'))
  assert.ok(text.includes('T2 账单导出｜幽项｜全流无作工'))
})

// ---------- 夹具对账（期望先于实现手算，见 docs/04） ----------

test('夹具 silent：程值 75（无终）；T1 有终 / T2 幽项 / T3 半途（未宣终形）/ T4 幽项', () => {
  const reg = readJson(fx('silent.zhongshi.json'))
  const report = auditStream(read('silent-stream.jsonl'), { items: reg.items, order: reg.order })
  assert.equal(report.score.total, 75)
  assert.equal(report.band, '无终')
  assert.equal(report.ok, false)
  const by = Object.fromEntries(report.items.map((s) => [s.id, s]))
  assert.equal(by.T1.status, '有终')
  assert.deepEqual([by.T1.startSeq, by.T1.terminalSeq], [2, 4])
  assert.equal(by.T2.status, '幽项')
  assert.equal(by.T3.status, '半途')
  assert.deepEqual([by.T3.startSeq, by.T3.lastWorkSeq], [5, 9])
  assert.equal(by.T4.status, '幽项')
  assert.deepEqual(report.kongList, [])
  assert.deepEqual(report.violations, [])
})

test('夹具 washed：程值 60（无终）；半途 2 + 空终 1 + 失序 1；T2 有弃、T3 有终', () => {
  const reg = readJson(fx('washed.zhongshi.json'))
  const report = auditStream(read('washed-stream.jsonl'), { items: reg.items, order: reg.order })
  assert.equal(report.score.total, 60)
  assert.deepEqual([report.score.you, report.score.ban, report.score.kong, report.score.xu], [0, 30, 20, 10])
  const by = Object.fromEntries(report.items.map((s) => [s.id, s]))
  assert.equal(by.T1.status, '半途')
  assert.equal(by.T2.status, '有弃')
  assert.equal(by.T2.abandonSeq, 4)
  assert.equal(by.T3.status, '有终')
  assert.equal(by.T4.status, '半途')
  assert.equal(report.kongList.length, 1)
  assert.deepEqual([report.kongList[0].itemId, report.kongList[0].terminalSeq, report.kongList[0].workSeq], ['T1', 2, 3])
  assert.equal(report.violations.length, 1)
  assert.deepEqual(report.violations[0].order, ['T3', 'T4'])
  assert.equal(report.violations[0].bStartSeq, 6)
  assert.equal(report.violations[0].aTerminalSeq, 7)
})

test('夹具 fenced：part1 单流 45 无终；拼接 0 近道（续跑图跨班）；反序 35 无终（流序敏感）', () => {
  const reg = readJson(fx('fenced.zhongshi.json'))
  const opts = { items: reg.items, order: reg.order }
  const p1 = read('fenced-part1.jsonl')
  const p2 = read('fenced-part2.jsonl')

  const alone = auditStream(p1, opts)
  assert.equal(alone.score.total, 45)
  assert.equal(alone.band, '无终')
  const byAlone = Object.fromEntries(alone.items.map((s) => [s.id, s]))
  assert.equal(byAlone.T1.status, '半途')
  assert.equal(byAlone.T2.status, '幽项')

  const both = auditStream([p1, p2], opts)
  assert.equal(both.score.total, 0)
  assert.equal(both.band, '近道')
  const by = Object.fromEntries(both.items.map((s) => [s.id, s]))
  assert.equal(by.T1.status, '有终')
  assert.deepEqual([by.T1.startSeq, by.T1.terminalSeq], [1, 4]) // 上一班开的头，这一班收的尾
  assert.equal(by.T2.status, '有终')
  assert.deepEqual([by.T2.startSeq, by.T2.terminalSeq], [5, 6])

  const swapped = auditStream([p2, p1], opts)
  assert.equal(swapped.score.total, 35)
  assert.equal(swapped.band, '无终')
  const byS = Object.fromEntries(swapped.items.map((s) => [s.id, s]))
  assert.equal(byS.T1.status, '半途')
  assert.equal(swapped.kongList.length, 1)
  assert.deepEqual([swapped.kongList[0].terminalSeq, swapped.kongList[0].workSeq], [2, 5])
})

// ---------- 帮手 ----------

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}
