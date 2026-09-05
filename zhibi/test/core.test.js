/**
 * 直笔核心测试 —— 对 docs/04-acceptance.md 的 A1–A7：
 * 流解析兼容、笔册语义、史事判定、讳形表、案别状态机、讳值分带、实录块确定性。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseStream, buildCalls } from '../src/core/stream.js'
import {
  DEFAULT_WORDS,
  DEFAULT_MASKS,
  createBice,
  matchWords,
  matchMasks,
  matchExcuse,
  redact,
  maskSecret,
} from '../src/core/bice.js'
import {
  createBizhangEngine,
  step,
  liveScore,
  analyze,
  isExec,
  commandText,
  bandName,
  GATE_DEFAULT,
} from '../src/core/bizhang.js'
import { auditStream } from '../src/core/audit.js'
import { renderShilu } from '../src/core/shilu.js'

const here = dirname(fileURLToPath(import.meta.url))
const FIX = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8')

// ---- A1 流解析 ------------------------------------------------------------

test('A1: 注释与空行合法，坏 JSON 报行号', () => {
  const text = '# 注释行\n\n{"type":"tool_call","id":"a","name":"bash","args":{}}\n坏行\n'
  assert.throws(() => parseStream(text), /第 4 行/)
  const evs = parseStream('# 注释\n\n{"type":"turn_start","id":"t"}\n')
  assert.equal(evs.length, 1)
})

test('A1: 带 id 的 call/result 首见配对，result 回填 isError', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_call","id":"x1","name":"bash","args":{"command":"npm test"}}',
        '{"type":"tool_call","id":"x1","name":"bash","args":{"command":"重复 id 首见为准"}}',
        '{"type":"tool_result","id":"x1","name":"bash","args":{},"isError":false}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].args.command, 'npm test')
  assert.equal(calls[0].isError, false)
})

test('A1: 无 id 旧格式 result 并入紧邻其前的 call', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_call","name":"bash","args":{"command":"make"}}',
        '{"type":"tool_result","name":"bash","args":{},"isError":true}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('A1: 孤儿 result 独立建档（isError 原样保留）', () => {
  const { calls } = buildCalls(
    parseStream('{"type":"tool_result","id":"o1","name":"bash","args":{"command":"npm test"},"isError":true}'),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
  assert.equal(calls[0].ref, 'o1')
})

test('A1: turn_* 等非工具事件跳过', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"turn_start","id":"t1"}',
        '{"type":"tool_call","id":"a","name":"bash","args":{"command":"npm test"}}',
        '{"type":"turn_end","id":"t1"}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 1)
})

test('A1: at 原样保留但判定只用流序（healed 夹具 at 倒挂仍按序列判）', () => {
  const { calls } = buildCalls(parseStream(FIX('healed-stream.jsonl')))
  assert.equal(calls[0].at, 999)
  assert.equal(calls[1].at, 305)
  const live = liveScore(analyze(calls, {}))
  assert.equal(live.score.total, 10) // 讳笔在前、真判在后：已赎 +10，而非空绿 +30
  assert.equal(live.familyList[0].verdict, 'zhi')
})

// ---- A2 笔册 --------------------------------------------------------------

test('A2: 默认史词 12 词、默认讳形 6 形；显式与默认取并集且只增不删', () => {
  assert.equal(DEFAULT_WORDS.length, 12)
  assert.equal(DEFAULT_MASKS.length, 6)
  const bice = createBice({ words: ['mysmoke\\s+verify'], masks: ['--my-flag'] })
  assert.equal(bice.words.length, 13)
  assert.equal(bice.masks.length, 7)
  for (const w of DEFAULT_WORDS) assert.ok(bice.words.some((x) => x.re === w.re), '默认词仍在')
})

test('A2: 显式登记去重按正则源', () => {
  const bice = createBice({ words: ['\\bmake\\b', '\\bmake\\b', 'other'] })
  assert.equal(bice.words.length, 13) // 默认 12 + 显式 other；显式 make 与默认撞源只记一次
  assert.equal(bice.words.filter((w) => w.re === '\\bmake\\b').length, 1)
})

test('A2: 豁免词纯显式（无默认）', () => {
  assert.equal(createBice({}).excuses.length, 0)
  assert.deepEqual(createBice({ excuses: ['smoke-optional'] }).excuses, ['smoke-optional'])
})

test('A2: noDefaults 关闭两张默认表（显式仍在）', () => {
  const bice = createBice({ words: ['custom\\sword'], masks: ['custom\\smask'], noDefaults: true })
  assert.equal(bice.words.length, 1)
  assert.equal(bice.masks.length, 1)
  assert.equal(bice.noDefaults, true)
})

test('A2: 非法显式正则建册即抛（报哪一项）', () => {
  assert.throws(() => createBice({ words: ['([bad'] }), /无效的史词正则/)
  assert.throws(() => createBice({ masks: ['([bad'] }), /无效的讳形正则/)
})

// ---- A3 史事判定 ----------------------------------------------------------

test('A3: exec 族判定——精确集 ∪ 子串，大小写不敏感', () => {
  for (const n of ['bash', 'exec', 'run', 'shell', 'command', 'Bash', 'shell_session', 'runner']) {
    assert.equal(isExec(n), true, n)
  }
  for (const n of ['read', 'edit', 'grep', 'Write', 'fetch_page']) {
    assert.equal(isExec(n), false, n)
  }
})

test('A3: 非 exec 族永不为史事（命令里词与讳形俱全也不入账）', () => {
  const state = analyze(
    [{ ref: 'a', name: 'edit', args: { path: 'x.js', command: 'npm test || true' }, isError: false }],
    {},
  )
  const live = liveScore(state)
  assert.equal(live.counts.shishi, 0)
  assert.equal(live.counts.callsObserved, 1)
  assert.equal(live.score.total, 0)
})

test('A3: args.command 优先；无 command 时拼接 args 字符串值', () => {
  assert.equal(commandText({ command: 'npm test', extra: 1 }), 'npm test')
  assert.equal(commandText({ a: 'make', b: ['all', 'x'] }), 'make all x')
})

test('A3: 史词命中才成史事；一词一族，一案可同属多族', () => {
  const bice = createBice({})
  const text = 'bash -c "set +e; make all; npm run test"'
  const words = matchWords(bice, text)
  assert.deepEqual(words.map((w) => w.label).sort(), ['make', 'pkg-test'])
  const state = analyze(
    [{ ref: 'a', name: 'bash', args: { command: text }, isError: false }],
    {},
  )
  const live = liveScore(state)
  assert.equal(live.counts.families, 2)
  assert.equal(live.counts.konglv, 2) // 一案双族，族末皆讳
  assert.equal(live.score.total, 60)
})

test('A3: 族内先后只用流内序列（引擎不读 at）', () => {
  const state = createBizhangEngine({})
  step(state, { ref: 'a', name: 'bash', args: { command: 'npm test || true' }, isError: false, at: 5 })
  step(state, { ref: 'b', name: 'bash', args: { command: 'npm test' }, isError: false, at: 1 })
  const live = liveScore(state)
  assert.equal(live.familyList[0].verdict, 'zhi')
  assert.equal(live.score.total, 10)
})

// ---- A4 讳形表 ------------------------------------------------------------

test('A4: 六形逐一命中（吞真/吞言/吞零/弛禁/塞目双写法/虚准）', () => {
  const bice = createBice({})
  const cases = [
    ['npm test || true', ['吞真形']],
    ['npm test || :', ['吞真形']],
    ['npm test || echo done', ['吞言形']],
    ['npm test || exit 0', ['吞零形']],
    ['set +e; npm test', ['弛禁形']],
    ['npm test > /dev/null 2>&1', ['塞目形']],
    ['npm test &>/dev/null', ['塞目形']],
    ['vitest run --passWithNoTests', ['虚准形']],
  ]
  for (const [cmd, expect] of cases) {
    const hits = matchMasks(bice, `x ${cmd} x`) // 包一层前缀，index 非零
    assert.deepEqual(hits.map((h) => h.label), expect, cmd)
  }
})

test('A4: 一史事多形全列点名，分数按案计不按形复利', () => {
  const state = analyze(
    [{ ref: 'a', name: 'bash', args: { command: 'set +e; npm test || true > /dev/null 2>&1' }, isError: false }],
    {},
  )
  const live = liveScore(state)
  assert.equal(state.cases[0].maskHits.length, 3) // 弛禁 + 吞真 + 塞目
  assert.equal(live.counts.konglv, 1)
  assert.equal(live.score.total, 30) // 空绿 30，不因三形复利
})

test('A4: 裸 2>/dev/null 不是默认讳形（弃声非讳咎——退出码仍真）', () => {
  const bice = createBice({})
  assert.equal(matchMasks(bice, 'npm test 2>/dev/null').length, 0)
  const live = liveScore(analyze([{ ref: 'a', name: 'bash', args: { command: 'npm test 2>/dev/null' }, isError: false }], {}))
  assert.equal(live.score.total, 0)
  assert.equal(live.familyList[0].verdict, 'zhi')
})

test('A4: 显式讳形扩展生效', () => {
  const live = liveScore(
    analyze([{ ref: 'a', name: 'bash', args: { command: 'deploy --force-no-verify' }, isError: false }], {
      words: ['\\bdeploy\\b'],
      masks: ['--force-no-verify'],
    }),
  )
  assert.equal(live.counts.konglv, 1)
  assert.equal(live.score.total, 30)
})

// ---- A5 案别与族末状态机 --------------------------------------------------

test('A5: 判定序锁死——豁免优先于一切（带讳形的失败侧豁免命令仍是豁笔）', () => {
  const state = analyze(
    [{ ref: 'a', name: 'bash', args: { command: 'npm test || true # smoke-optional' }, isError: true }],
    { excuses: ['smoke-optional'] },
  )
  const live = liveScore(state)
  assert.equal(live.counts.huibi, 1)
  assert.equal(live.counts.shibi, 0)
  assert.equal(live.counts.families, 0) // 豁笔不触族末
  assert.equal(live.score.total, 0)
})

test('A5: 失败侧讳形是试笔（0 分），族末置试——讳而未成，信以传信', () => {
  const state = analyze([{ ref: 'a', name: 'bash', args: { command: 'npm test || true' }, isError: true }], {})
  const live = liveScore(state)
  assert.equal(live.counts.shibi, 1)
  assert.equal(live.counts.konglv, 0)
  assert.equal(live.familyList[0].verdict, 'shi')
  assert.equal(live.score.total, 0)
})

test('A5: 成功侧讳笔落账，账面无命令全文、只有掩码摘录', () => {
  const state = analyze(
    [{ ref: 'a', name: 'bash', args: { command: 'npm test || true' }, isError: false }],
    {},
  )
  assert.equal(state.cases.length, 1)
  assert.equal(state.cases[0].text, undefined)
  assert.ok(state.cases[0].excerpt.includes('|| true'))
})

test('A5: 族末讳笔升级空绿 +30，不再另计 +10（一讳不两罚）', () => {
  const { calls } = buildCalls(parseStream(FIX('hollow-stream.jsonl')))
  const live = liveScore(analyze(calls, {}))
  assert.equal(live.counts.konglv, 1)
  assert.equal(live.counts.weibi, 0)
  assert.equal(live.score.total, 30)
})

test('A5: 已赎讳笔 +10（同族真判已还）', () => {
  const { calls } = buildCalls(parseStream(FIX('healed-stream.jsonl')))
  const live = liveScore(analyze(calls, {}))
  assert.equal(live.counts.weibi, 1)
  assert.equal(live.counts.konglv, 0)
  assert.equal(live.score.total, 10)
})

test('A5: 前讳后讳——非族末讳笔 +10，族末讳笔归空绿 +30', () => {
  const state = createBizhangEngine({})
  step(state, { ref: 'a', name: 'bash', args: { command: 'npm test || true' }, isError: false })
  step(state, { ref: 'b', name: 'bash', args: { command: 'npm test' }, isError: false })
  step(state, { ref: 'c', name: 'bash', args: { command: 'npm test || true' }, isError: false })
  const live = liveScore(state)
  assert.equal(live.counts.weibi, 1) // 第一笔（被第二笔赎）
  assert.equal(live.counts.konglv, 1) // 第三笔是族末
  assert.equal(live.score.total, 40)
})

test('A5: 成串之讳不互赎——两笔讳笔中间无真判，只有族末升级空绿', () => {
  const state = createBizhangEngine({})
  step(state, { ref: 'a', name: 'bash', args: { command: 'npm test || true' }, isError: false })
  step(state, { ref: 'b', name: 'bash', args: { command: 'npm test || true' }, isError: false })
  const live = liveScore(state)
  assert.equal(live.counts.konglv, 1)
  assert.equal(live.counts.weibi, 1) // 第一笔非族末
  assert.equal(live.score.total, 40)
})

test('A5: isError null（孤儿）按成功侧口径落案', () => {
  const live = liveScore(
    analyze([{ ref: 'o1', name: 'bash', args: { command: 'npm test || true' }, isError: null }], {}),
  )
  assert.equal(live.counts.konglv, 1)
  assert.equal(live.score.total, 30)
})

// ---- A6 讳值与分带 --------------------------------------------------------

test('A6: 分带边界逐点（14 素 / 15 讳 / 29 讳 / 30 诬）', () => {
  assert.deepEqual([bandName(0), bandName(14)], ['素', '素'])
  assert.deepEqual([bandName(15), bandName(29)], ['讳', '讳'])
  assert.deepEqual([bandName(30), bandName(90)], ['诬', '诬'])
})

test('A6: 已赎讳笔封顶 30（四案 40→30，账面照记）', () => {
  const state = createBizhangEngine({})
  for (let i = 0; i < 4; i++) {
    step(state, { ref: `m${i}`, name: 'bash', args: { command: 'npm test || true' }, isError: false })
    step(state, { ref: `c${i}`, name: 'bash', args: { command: 'npm test' }, isError: false })
  }
  const live = liveScore(state)
  assert.equal(live.counts.weibi, 4)
  assert.equal(live.score.wei, 30) // cap
  assert.equal(live.score.total, 30)
})

test('A6: 空绿封顶 60（三族 90→60，账面照记）', () => {
  const state = createBizhangEngine({})
  step(state, { ref: 'a', name: 'bash', args: { command: 'npm test || true' }, isError: false })
  step(state, { ref: 'b', name: 'bash', args: { command: 'make all || true' }, isError: false })
  step(state, { ref: 'c', name: 'bash', args: { command: 'go test ./... || true' }, isError: false })
  const live = liveScore(state)
  assert.equal(live.counts.konglv, 3)
  assert.equal(live.score.kong, 60) // cap
  assert.equal(live.score.total, 60)
})

test('A6: 门默认 30；即时值与离线重放全前缀一致', () => {
  assert.equal(GATE_DEFAULT, 30)
  const { calls } = buildCalls(parseStream(FIX('mixed-stream.jsonl')))
  const stepwise = createBizhangEngine({})
  calls.forEach((c, i) => {
    step(stepwise, c)
    const a = liveScore(stepwise)
    const b = liveScore(analyze(calls.slice(0, i + 1), {}))
    assert.deepEqual(a.score, b.score, `前缀 ${i + 1}`)
    assert.equal(a.band, b.band)
    assert.deepEqual(a.counts, b.counts)
  })
})

test('A6: 干净流不虚报——讳值 0、无案、无注记', () => {
  const { calls } = buildCalls(parseStream(FIX('clean-stream.jsonl')))
  const live = liveScore(analyze(calls, {}))
  assert.equal(live.score.total, 0)
  assert.equal(live.band, '素')
  assert.equal(live.counts.shishi, 2)
  assert.equal(live.counts.huibi, 0)
  assert.equal(live.counts.shibi, 0)
})

// ---- A7 实录块与掩码自洁 --------------------------------------------------

test('A7: 摘录过掩码自洁——sk- 与 Bearer 形不出现原文', () => {
  assert.ok(!redact('token=sk-live-abcdef0123456789abcdef x').includes('sk-live-abcdef0123456789abcdef'))
  assert.ok(redact('Authorization: Bearer aaaaBBBBcccc1234dd').includes('Bear…dd'))
  assert.equal(maskSecret('sk-12345678'), 'sk-1…78')
  assert.equal(maskSecret('short'), '…')
})

test('A7: 摘录骑缝不漏——窗口边界落进凭据区段时折算到掩码起点', () => {
  const { calls } = buildCalls(
    parseStream(
      '{"type":"tool_call","id":"a","name":"bash","args":{"command":"k=sk-live-abcdef0123456789; npm test || true"}}',
    ),
  )
  const state = analyze(calls, {})
  const ex = state.cases[0].excerpt
  assert.ok(ex.includes('…'), '掩码应在摘录内')
  assert.ok(!ex.includes('abcdef0123456789'), '凭据原文不得出现')
  assert.ok(ex.includes('|| true'))
})

test('A7: 实录块同状态两次渲染逐字节相同，#k 仅首行不同', () => {
  const { calls } = buildCalls(parseStream(FIX('mixed-stream.jsonl')))
  const state = analyze(calls, {})
  const t1 = renderShilu(state, 1, 30)
  const t2 = renderShilu(state, 1, 30)
  assert.equal(t1, t2)
  const state2 = analyze(calls, {})
  const u1 = renderShilu(state2, 1, 30)
  const u2 = renderShilu(state2, 2, 30)
  assert.equal(u1.split('\n')[0], '【直笔 · 实录块 #1】')
  assert.equal(u2.split('\n')[0], '【直笔 · 实录块 #2】')
  assert.deepEqual(u1.split('\n').slice(1), u2.split('\n').slice(1))
})

test('A7: 实录块结构齐备（点名、族末、末行），无时间戳字段', () => {
  const { calls } = buildCalls(parseStream(FIX('hollow-stream.jsonl')))
  const text = renderShilu(analyze(calls, {}), 1, 30)
  assert.ok(text.includes('讳值 30（诬），门 30，判 fail'))
  assert.ok(text.includes('空绿点名（按族序）：'))
  assert.ok(text.includes('· pkg-test｜族末讳笔，此后无真判——交付态勿立其上'))
  assert.ok(text.includes('· pkg-test：讳（空绿）（末笔 #2）'))
  assert.ok(text.includes('—— 本块由确定性规则生成；重放同一流必得同一文本。'))
  assert.ok(!/\bat\b[:=]/.test(text))
})

test('A7: 无史事时出确定性空块', () => {
  const text = renderShilu(createBizhangEngine({}), 1, 30)
  assert.ok(text.includes('史事 0 笔（族 0：直 0 · 讳 0 · 红 0 · 试 0），讳笔 0 案，空绿 0 族'))
  assert.ok(text.includes('（无）'))
  assert.equal(text, renderShilu(createBizhangEngine({}), 1, 30))
})

// ---- 夹具端到端（手算对账） ----------------------------------------------

test('夹具手算：clean=0 素 / hollow=30 诬 / healed=10 素 / honestred=0 素 / mixed=70 诬', () => {
  const rows = [
    ['clean-stream.jsonl', {}, 0, '素'],
    ['hollow-stream.jsonl', {}, 30, '诬'],
    ['healed-stream.jsonl', {}, 10, '素'],
    ['honestred-stream.jsonl', {}, 0, '素'],
    ['mixed-stream.jsonl', {}, 70, '诬'],
  ]
  for (const [f, opts, total, band] of rows) {
    const r = auditStream(FIX(f), opts)
    assert.equal(r.score.total, total, f)
    assert.equal(r.band, band, f)
  }
})
