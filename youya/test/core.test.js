/**
 * 有涯核心测试 —— 流解析 / 对象与工具族 / 复见 / 复命 / 殆值与分带 / 陈账 / 要籍渲染。
 * 夹具期望值先于实现手算（fixtures/ 注释），此处逐项对账。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, observeClass } from '../src/core/object.js'
import {
  createJianwenEngine,
  step,
  analyze,
  finalize,
  liveScore,
  chenAccounts,
  bandOf,
  FUJIAN_POINTS,
  FUJIAN_CAP,
  FUMING_POINTS,
  FUMING_CAP,
  TOTAL_CAP,
  GATE_DEFAULT,
  CHEN_GAP_DEFAULT,
} from '../src/core/jianwen.js'
import { auditStream } from '../src/core/audit.js'
import { renderYaoji } from '../src/core/yaoji.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8')

/** 造一个调用（默认成功）。 */
const c = (name, args, isError = false, ref = null) => ({ ref, name, args, isError })
/** 一次性重放。 */
const run = (calls, chenGap) => analyze(calls, chenGap)

// ---------------------------------------------------------------- 流解析（A1）

test('流解析：# 与空行为注释，坏 JSON 报行号', () => {
  const events = parseStream('# 注释\n\n{"type":"tool_call","id":"a","name":"read"}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"ok":1}\nnot-json\n'), /第 2 行/)
})

test('流解析：带 id 的 result 按 id 回填 isError', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_call","id":"a","name":"read","args":{"path":"x"}}',
        '{"type":"tool_result","id":"a","isError":true}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('流解析：id 首见为准，重复 id 的 call 不重复建档', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_call","id":"a","name":"read","args":{"path":"x"}}',
        '{"type":"tool_call","id":"a","name":"read","args":{"path":"x"}}',
        '{"type":"tool_result","id":"a","isError":false}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 1)
})

test('流解析：无 id 旧格式 result 并入紧邻其前的 call', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_call","name":"read","args":{"path":"x"}}',
        '{"type":"tool_result","isError":false}',
      ].join('\n'),
    ),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
})

test('流解析：孤儿 result 独立建档，isError 为 null（无凭不记功过）', () => {
  const { calls } = buildCalls(parseStream('{"type":"tool_result","id":"orphan","isError":true}'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
  const { calls: calls2 } = buildCalls(
    parseStream('{"type":"tool_result","id":"orphan2","name":"read"}'),
  )
  assert.equal(calls2[0].isError, null)
})

test('流解析：非工具事件跳过，空输入零调用', () => {
  const { calls } = buildCalls(
    parseStream('{"type":"turn_start","id":"t1"}\n{"type":"turn_end","id":"t1"}'),
  )
  assert.equal(calls.length, 0)
  assert.equal(buildCalls(parseStream('')).calls.length, 0)
})

// ---------------------------------------------------- 对象键 / 工具族 / 装载类（A2 前置）

test('对象键：path 字段按序优先，command trim，其余 n: 不透明', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'read'), 'p:a.js')
  assert.equal(objectKey({ file_path: 'b.js' }, 'read'), 'p:b.js')
  assert.equal(objectKey({ notebook_path: 'c.ipynb' }, 'read'), 'p:c.ipynb')
  assert.equal(objectKey({ path: 'a.js', file_path: 'b.js' }, 'read'), 'p:a.js')
  assert.equal(objectKey({ command: '  npm test  ' }, 'bash'), 'c:npm test')
  assert.equal(objectKey({ query: 'x' }, 'search'), 'n:search')
})

test('工具族：observe/write/exec/other 词表', () => {
  assert.equal(familyOf('read'), 'observe')
  assert.equal(familyOf('grep'), 'observe')
  assert.equal(familyOf('edit'), 'write')
  assert.equal(familyOf('apply_patch'), 'write')
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('webfetch'), 'other')
})

test('装载类再分：read/cat/view 是 load，检索类是 search，非观察族 null；工具名大小写不敏感', () => {
  assert.equal(observeClass('read'), 'load')
  assert.equal(observeClass('cat'), 'load')
  assert.equal(observeClass('view'), 'load')
  assert.equal(observeClass('grep'), 'search')
  assert.equal(observeClass('glob'), 'search')
  assert.equal(observeClass('ls'), 'search')
  assert.equal(observeClass('bash'), null)
  assert.equal(observeClass('Read'), 'load')
})

// ---------------------------------------------------------------- 复见（A2）

test('复见：首次装载只设基线，不入罪', () => {
  const s = run([c('read', { path: 'a.js' })])
  assert.equal(s.sins.length, 0)
})

test('复见：世未变而原样重装载 → 一记一案 +12', () => {
  const s = run([c('read', { path: 'a.js' }), c('bash', { command: 'ls' }), c('read', { path: 'a.js' })])
  assert.equal(s.sins.length, 1)
  assert.equal(s.sins[0].kind, '复见')
  assert.equal(s.counts.fujianCases, 1)
  assert.equal(s.score.fujian, FUJIAN_POINTS)
})

test('复见：三连原样读并一案（记 2 免 1），+12 不是 +24', () => {
  const s = run([c('read', { path: 'a.js' }), c('read', { path: 'a.js' }), c('read', { path: 'a.js' })])
  assert.equal(s.counts.fujianRecords, 2)
  assert.equal(s.counts.fujianCases, 1)
  assert.equal(s.score.fujian, 12)
})

test('复见：夹任何其他调用即分案（read a, read a, read b, read a → 2 案）', () => {
  const s = run([
    c('read', { path: 'a.js' }),
    c('read', { path: 'a.js' }),
    c('read', { path: 'b.js' }),
    c('read', { path: 'a.js' }),
  ])
  assert.equal(s.counts.fujianRecords, 2)
  assert.equal(s.counts.fujianCases, 2)
  assert.equal(s.score.fujian, 24)
})

test('复见：同路径成功写入后再读是「鲜」，不入罪', () => {
  const s = run([c('read', { path: 'a.js' }), c('edit', { path: 'a.js' }), c('read', { path: 'a.js' })])
  assert.equal(s.sins.length, 0)
  assert.equal(s.score.total, 0)
})

test('复见：写的是别的路径不救此案（路径寻址只看己身）', () => {
  const s = run([c('read', { path: 'a.js' }), c('edit', { path: 'b.js' }), c('read', { path: 'a.js' })])
  assert.equal(s.counts.fujianCases, 1)
})

test('复见：基线后夹失败装载（设瑕）免记；脱瑕后的再犯照记', () => {
  const s = run([
    c('read', { path: 'a.js' }),
    c('read', { path: 'a.js' }, true),
    c('read', { path: 'a.js' }),
    c('read', { path: 'a.js' }),
  ])
  assert.equal(s.sins.length, 1, 'c2 失败设瑕 → c3 免记并立新基线；c4 世未变再读 → 记')
  assert.equal(s.counts.fujianCases, 1)
})

test('复见：失败写入不改变世界（其后未变之读照记）', () => {
  const s = run([c('read', { path: 'a.js' }), c('edit', { path: 'a.js' }, true), c('read', { path: 'a.js' })])
  assert.equal(s.counts.fujianCases, 1)
})

test('复见：检索类永不入罪、不设基线（同路径异参是合法的再问）', () => {
  const s = run([
    c('grep', { path: 'a.js', pattern: 'x' }),
    c('grep', { path: 'a.js', pattern: 'y' }),
    c('ls', { path: 'a.js' }),
  ])
  assert.equal(s.sins.length, 0)
  const s2 = run([
    c('read', { path: 'a.js' }),
    c('grep', { path: 'a.js', pattern: 'x' }),
    c('read', { path: 'a.js' }),
  ])
  assert.equal(s2.counts.fujianCases, 1, 'grep 不刷新基线也不挡罪')
})

test('复见：n: 不透明对象不入账（宁漏勿诬）', () => {
  const s = run([c('search', { query: 'x' }), c('search', { query: 'y' }), c('search', { query: 'x' })])
  assert.equal(s.sins.length, 0)
})

test('复见：路径不归一化（./a.js 与 a.js 是两个对象）', () => {
  const s = run([c('read', { path: './a.js' }), c('read', { path: 'a.js' })])
  assert.equal(s.sins.length, 0)
  assert.equal(s.counts.paths, 2)
})

test('复见：isError null 的装载既不设基线也不设瑕（无凭不记功过）', () => {
  const s = run([c('read', { path: 'a.js' }, null), c('read', { path: 'a.js' }), c('read', { path: 'a.js' })])
  assert.equal(s.sins.length, 1, 'c2 才是基线；c3 记一记')
})

// ---------------------------------------------------------------- 复命（A3）

test('复命：首次执行只设基线；世未变而同串重跑 → 一记一案 +8', () => {
  const s = run([c('bash', { command: 'git status' }), c('bash', { command: 'git status' })])
  assert.equal(s.sins.length, 1)
  assert.equal(s.sins[0].kind, '复命')
  assert.equal(s.score.fuming, FUMING_POINTS)
})

test('复命：其间任意对象成功写入 → 全库重置，不入罪', () => {
  const s = run([
    c('bash', { command: 'npm test' }),
    c('edit', { path: 'whatever.js' }),
    c('bash', { command: 'npm test' }),
  ])
  assert.equal(s.sins.length, 0)
})

test('复命：异串命令是不同对象（npm test ≠ npm test --watch）', () => {
  const s = run([
    c('bash', { command: 'npm test' }),
    c('bash', { command: 'npm test --watch' }),
    c('bash', { command: 'npm test' }),
  ])
  assert.equal(s.counts.fumingCases, 1, '第三个 npm test 仍世未变 → 记；watch 是另一对象')
})

test('复命：同命令失败执行设瑕免记（势变之地归九变）；异命令失败不设瑕', () => {
  const s = run([
    c('bash', { command: 'npm test' }),
    c('bash', { command: 'npm test' }, true),
    c('bash', { command: 'npm test' }),
  ])
  assert.equal(s.sins.length, 0, '夹有同命令失败 → 免记')
  const s2 = run([
    c('bash', { command: 'npm test' }),
    c('bash', { command: 'boom' }, true),
    c('bash', { command: 'npm test' }),
  ])
  assert.equal(s2.sins.length, 1, '失败的是别的命令，世界照样没变 → 记')
})

test('复命：三连同串重跑并一案（记 2 免 1）；夹其他调用分案', () => {
  const s = run([
    c('bash', { command: 'ls src' }),
    c('bash', { command: 'ls src' }),
    c('bash', { command: 'ls src' }),
  ])
  assert.equal(s.counts.fumingRecords, 2)
  assert.equal(s.counts.fumingCases, 1)
  const s2 = run([
    c('bash', { command: 'ls src' }),
    c('bash', { command: 'ls src' }),
    c('read', { path: 'x.js' }),
    c('bash', { command: 'ls src' }),
  ])
  assert.equal(s2.counts.fumingCases, 2)
  assert.equal(s2.counts.fumingRecords, 2)
})

test('复命：isError null 的执行既不设基线也不设瑕', () => {
  const s = run([
    c('bash', { command: 'ls' }, null),
    c('bash', { command: 'ls' }),
    c('bash', { command: 'ls' }),
  ])
  assert.equal(s.sins.length, 1)
})

test('复见与复命同流并行记账，互不干扰', () => {
  const s = run([
    c('read', { path: 'a.js' }),
    c('bash', { command: 'ls' }),
    c('read', { path: 'a.js' }),
    c('bash', { command: 'ls' }),
  ])
  assert.equal(s.counts.fujianCases, 1)
  assert.equal(s.counts.fumingCases, 1)
  assert.equal(s.score.total, FUJIAN_POINTS + FUMING_POINTS)
})

// ---------------------------------------------------------------- 殆值与分带（A4）

test('分带边界逐点：14 新硎 / 15 割 / 29 割 / 30 折', () => {
  assert.equal(bandOf(0), '新硎')
  assert.equal(bandOf(14), '新硎')
  assert.equal(bandOf(15), '割')
  assert.equal(bandOf(29), '割')
  assert.equal(bandOf(30), '折')
  assert.equal(bandOf(100), '折')
})

test('计分常数锁死：12/60、8/40、总 cap 100、门默认 30、陈限默认 40', () => {
  assert.equal(FUJIAN_POINTS, 12)
  assert.equal(FUJIAN_CAP, 60)
  assert.equal(FUMING_POINTS, 8)
  assert.equal(FUMING_CAP, 40)
  assert.equal(TOTAL_CAP, 100)
  assert.equal(GATE_DEFAULT, 30)
  assert.equal(CHEN_GAP_DEFAULT, 40)
})

/** 六个互不相邻的复见案：read a 打底，六个夹心再读。 */
function sixFujianCases() {
  const calls = [c('read', { path: 'a.js' })]
  for (const filler of ['b.js', 'c.js', 'd.js', 'e.js', 'f.js', 'g.js']) {
    calls.push(c('read', { path: filler }))
    calls.push(c('read', { path: 'a.js' }))
  }
  return calls
}

test('复见分 cap 60：六案 72 → 60，带「折」', () => {
  const s = run(sixFujianCases())
  assert.equal(s.counts.fujianCases, 6)
  assert.equal(s.score.fujian, FUJIAN_CAP)
  assert.equal(s.band, '折')
})

function sixFumingCases() {
  const calls = [c('bash', { command: 'go' })]
  for (const filler of ['a', 'b', 'c', 'd', 'e', 'f']) {
    calls.push(c('bash', { command: filler }))
    calls.push(c('bash', { command: 'go' }))
  }
  return calls
}

test('复命分 cap 40：六案 48 → 40；复见+复命 100 封顶', () => {
  const s = run(sixFumingCases())
  assert.equal(s.counts.fumingCases, 6)
  assert.equal(s.score.fuming, FUMING_CAP)
  const both = run([...sixFujianCases(), ...sixFumingCases()])
  assert.equal(both.score.total, TOTAL_CAP)
})

test('liveScore 前缀一致：任何前缀的即时分数 = 离线重放同前缀（amnesiac 全流逐步对账）', () => {
  const { calls } = buildCalls(parseStream(fixture('amnesiac-stream.jsonl')))
  const state = createJianwenEngine()
  calls.forEach((call, i) => {
    step(state, call)
    const offline = analyze(calls.slice(0, i + 1))
    assert.equal(
      liveScore(state).score.total,
      offline.score.total,
      `前缀 ${i + 1} 调用时即时分与离线重放一致`,
    )
  })
})

// ---------------------------------------------------------------- 陈账（A5 前置）

test('陈账：不足陈限不出账（amnesiac 全流 10 调 < 40）', () => {
  const { calls } = buildCalls(parseStream(fixture('amnesiac-stream.jsonl')))
  assert.equal(chenAccounts(run(calls)).length, 0)
})

test('陈账：恰好达到陈限即出账，标「其间无写」', () => {
  const calls = [c('read', { path: 'old.js' })]
  for (let i = 0; i < 40; i++) calls.push(c('read', { path: `f${i}.js` }))
  const rows = chenAccounts(run(calls))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].object, 'p:old.js')
  assert.equal(rows[0].gap, 40)
  assert.equal(rows[0].kind, 'load')
})

test('陈账：写触底的路径标「写后未再顾」；多条按末次触碰位次升序', () => {
  const calls = [c('read', { path: 'x.js' })]
  for (let i = 0; i < 30; i++) calls.push(c('probe', { q: i }))
  calls.push(c('edit', { path: 'y.js' }))
  for (let i = 30; i < 71; i++) calls.push(c('probe', { q: i }))
  const rows = chenAccounts(run(calls))
  assert.equal(rows.length, 2, 'n: 填充不入工作集，只有 x/y 两路径')
  assert.equal(rows[0].object, 'p:x.js')
  assert.equal(rows[0].kind, 'load')
  assert.equal(rows[1].object, 'p:y.js')
  assert.equal(rows[1].kind, 'write')
})

// ---------------------------------------------------------------- 要籍渲染（A5）

test('要籍：同一状态两次渲染逐字节相同；#k 是唯一差异', () => {
  const { calls } = buildCalls(parseStream(fixture('amnesiac-stream.jsonl')))
  const a = run(calls)
  const b = run(calls)
  assert.equal(renderYaoji(a, 3), renderYaoji(b, 3))
  assert.equal(renderYaoji(a, 1), renderYaoji(b, 2).replace('#2', '#1'))
})

test('要籍：amnesiac（无陈账）输出空陈账行、工作集与殆值行、收尾承诺行', () => {
  const { calls } = buildCalls(parseStream(fixture('amnesiac-stream.jsonl')))
  const text = renderYaoji(run(calls), 1)
  assert.match(text, /【有涯 · 要籍】见闻账 #1/)
  assert.match(text, /（无陈账：见闻皆鲜，游刃有余。）/)
  assert.match(text, /工作集：路径 3 ｜ 命令 1 ｜ 复见 2 案 ｜ 复命 1 案/)
  assert.match(text, /殆值：32（折）｜ 门 30/)
  assert.match(text, /本块由确定性规则生成；重放同一流必得同一文本。/)
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}/, '无时间戳字段')
})

test('要籍：陈账按账序列出，含位次与间隔', () => {
  const calls = [c('read', { path: 'old.js' })]
  for (let i = 0; i < 40; i++) calls.push(c('read', { path: `f${i}.js` }))
  const text = renderYaoji(run(calls), 1)
  assert.match(text, /1\. p:old\.js ｜ 末见闻第1调用 ｜ 已隔40调 ｜ 其间无写/)
})

// ---------------------------------------------------------------- 夹具手算对账（A4）

test('夹具 fresh：殆值 0、新硎、零罪记、可过门', () => {
  const r = auditStream(fixture('fresh-stream.jsonl'))
  assert.equal(r.calls, 9)
  assert.equal(r.sins, 0)
  assert.deepEqual(r.score, { total: 0, fujian: 0, fuming: 0 })
  assert.equal(r.band, '新硎')
  assert.equal(r.ok, true)
  assert.equal(r.verdict, 'pass')
})

test('夹具 hazy：复见 1 案 + 复命 1 案 = 20、割、可过门', () => {
  const r = auditStream(fixture('hazy-stream.jsonl'))
  assert.equal(r.calls, 8)
  assert.deepEqual(r.score, { total: 20, fujian: 12, fuming: 8 })
  assert.equal(r.band, '割')
  assert.equal(r.ok, true)
  assert.equal(r.counts.fujianRecords, 1)
  assert.equal(r.counts.fujianCases, 1)
  assert.equal(r.counts.fumingRecords, 1)
  assert.equal(r.counts.fumingCases, 1)
  assert.deepEqual(
    r.sinsList.map((s) => `${s.kind}@${s.at}`),
    ['复命@5', '复见@8'],
  )
})

test('夹具 amnesiac：复见 3 记 2 案 + 复命 2 记 1 案 = 32、折、门禁红灯', () => {
  const r = auditStream(fixture('amnesiac-stream.jsonl'))
  assert.equal(r.calls, 10)
  assert.deepEqual(r.score, { total: 32, fujian: 24, fuming: 8 })
  assert.equal(r.band, '折')
  assert.equal(r.ok, false)
  assert.equal(r.verdict, 'fail')
  assert.deepEqual(
    r.sinsList.map((s) => `${s.kind}@${s.at}`),
    ['复见@4', '复见@5', '复命@6', '复命@7', '复见@10'],
  )
  assert.deepEqual(r.issues.filter((i) => i.startsWith('复见')).length, 1)
  assert.ok(r.issues.some((i) => i.includes('p:docs/plan.md')))
})

// ---------------------------------------------------------------- 补充边界

test('写族词表：apply/create/move/remove 皆写（写后重读皆「鲜」）', () => {
  for (const name of ['apply', 'create', 'move', 'remove']) {
    const s = run([c('read', { path: 'a.js' }), c(name, { path: 'a.js' }), c('read', { path: 'a.js' })])
    assert.equal(s.sins.length, 0, `${name} 之后的重读是正当刷新`)
    assert.equal(s.counts.paths, 1)
  }
})

test('写族子串匹配：apply_patch 算写族', () => {
  assert.equal(familyOf('apply_patch'), 'write')
  const s = run([c('read', { path: 'a.js' }), c('apply_patch', { path: 'a.js' }), c('read', { path: 'a.js' })])
  assert.equal(s.sins.length, 0)
})

test('复命：isError null 的写入不构成重置（无凭不记功过）', () => {
  const s = run([
    c('bash', { command: 'npm test' }),
    c('edit', { path: 'w.js' }, null),
    c('bash', { command: 'npm test' }),
  ])
  assert.equal(s.counts.fumingCases, 1, 'null 写入无凭 → 世界照样没变 → 记')
})

test('陈限可配置：引擎与离线审计的 chenGap 选项生效', () => {
  const s = createJianwenEngine(5)
  step(s, c('read', { path: 'a.js' }))
  for (let i = 0; i < 5; i++) step(s, c('probe', { q: i }))
  const rows = chenAccounts(finalize(s))
  assert.equal(rows.length, 1, 'gap 5 恰达自定陈限 → a.js 出账')
  assert.equal(rows[0].object, 'p:a.js')
  const r = auditStream(fixture('fresh-stream.jsonl'), { chenGap: 2 })
  assert.equal(r.counts.chen, 2, 'fresh 全流对 chenGap 2：a.js 隔 6 调、b.js 隔 2 调 → 两路径出账')
  assert.equal(r.chen[0].object, 'p:src/a.js')
  assert.equal(r.chen[1].object, 'p:src/b.js')
})

test('要籍：门可覆盖渲染（门 50）', () => {
  const { calls } = buildCalls(parseStream(fixture('amnesiac-stream.jsonl')))
  assert.match(renderYaoji(run(calls), 1, 50), /殆值：32（折）｜ 门 50/)
})
