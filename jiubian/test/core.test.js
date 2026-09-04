/**
 * 核心测试 —— 对象键 / 工具族 / 流解析 / 四裁决 / 计分 / 分带 / 夹具与跨项目互认。
 * 全部断言 docs/03-design.md 锁死的语义与 docs/04-acceptance.md 先于实现手算的数字。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { objectKey, familyOf } from '../src/core/object.js'
import { parseStream, buildCalls } from '../src/core/stream.js'
import {
  createShiEngine,
  step,
  finalize,
  analyze,
  openDebts,
  GATE_DEFAULT,
  BLIND_POINTS,
  GRAZE_POINTS,
  STALE_CAP,
} from '../src/core/shi.js'
import { auditStream } from '../src/core/audit.js'
import { renderBianfang } from '../src/core/bianfang.js'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (name) => join(here, '..', 'fixtures', name)
const repo = (name) => join(here, '..', '..', name)

const call = (name, args, isError = false, ref = null) => ({ ref, name, args, isError })

function replay(calls) {
  return analyze(calls)
}

// ---------- 对象键 ----------

test('对象键：path / file_path / notebook_path 依次回退为 p: 前缀', () => {
  assert.equal(objectKey({ path: 'a/b.js' }, 'edit'), 'p:a/b.js')
  assert.equal(objectKey({ file_path: 'x.md' }, 'write'), 'p:x.md')
  assert.equal(objectKey({ notebook_path: 'n.ipynb' }, 'run'), 'p:n.ipynb')
})

test('对象键：path 优先于 file_path', () => {
  assert.equal(objectKey({ path: 'a', file_path: 'b' }, 'edit'), 'p:a')
})

test('对象键：command trim 后进 c: 前缀', () => {
  assert.equal(objectKey({ command: '  npm test  ' }, 'bash'), 'c:npm test')
})

test('对象键：空与缺字段回退 n:<工具名>', () => {
  assert.equal(objectKey({}, 'foo'), 'n:foo')
  assert.equal(objectKey(undefined, 'foo'), 'n:foo')
  assert.equal(objectKey({ path: 42, command: '' }, 'foo'), 'n:foo')
})

// ---------- 工具族 ----------

test('工具族：观察精确名与包含词（大小写不敏感）', () => {
  for (const n of ['read', 'glob', 'grep', 'ls', 'cat', 'view', 'Grep', 'list_dir', 'web_search']) {
    assert.equal(familyOf(n), 'observe', n)
  }
})

test('工具族：写精确名与包含词', () => {
  for (const n of ['write', 'edit', 'apply', 'create', 'move', 'remove', 'apply_patch', 'Edit']) {
    assert.equal(familyOf(n), 'write', n)
  }
})

test('工具族：执行精确名与包含词', () => {
  for (const n of ['bash', 'exec', 'run', 'shell', 'command', 'Bash', 'run_script']) {
    assert.equal(familyOf(n), 'exec', n)
  }
})

test('工具族：其余归 other（不参与再察）', () => {
  assert.equal(familyOf('browser_click'), 'other')
  assert.equal(familyOf('web_fetch'), 'other')
})

test('工具族：观察的包含词优先于写的包含词（read 先判）', () => {
  // 一个既含 read 又含 write 的假想名：观察在先
  assert.equal(familyOf('read_write'), 'observe')
})

// ---------- 流解析 ----------

test('流解析：# 与空行为注释，坏行报行号', () => {
  const events = parseStream('# 注释\n\n{"type":"turn_start","id":"t1"}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"ok":1}\n坏行\n'), /第 2 行/)
})

test('流解析：带 id 的 call/result 按 id 归并', () => {
  const { calls } = buildCalls(
    parseStream(
      '{"type":"tool_call","id":"a","name":"edit","args":{"path":"x"}}\n' +
        '{"type":"tool_result","id":"a","isError":true}\n',
    ),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
  assert.equal(calls[0].ref, 'a')
})

test('流解析：无 id（zhizhi 旧格式）result 并入紧邻 call', () => {
  const { calls } = buildCalls(
    parseStream(
      '{"type":"tool_call","name":"bash","args":{"command":"npm test"}}\n' +
        '{"type":"tool_result","name":"bash","isError":true}\n',
    ),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('流解析：孤儿 result 独立建档，不丢执行', () => {
  const { calls } = buildCalls(
    parseStream('{"type":"tool_result","id":"orphan","name":"bash","isError":true}\n'),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('流解析：turn_start/turn_end/reanchor 不是动作', () => {
  const { calls } = buildCalls(
    parseStream(
      '{"type":"turn_start","id":"t1"}\n{"type":"reanchor","id":"r1"}\n{"type":"turn_end","id":"t1"}\n',
    ),
  )
  assert.equal(calls.length, 0)
})

test('流解析：同名 id 的第二次 call 视为 result 回填（首见建档为准）', () => {
  const { calls } = buildCalls(
    parseStream(
      '{"type":"tool_call","id":"a","name":"edit","args":{"path":"x"}}\n' +
        '{"type":"tool_result","id":"a","isError":false}\n' +
        '{"type":"tool_result","id":"a","isError":true}\n',
    ),
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true, '后到的 result 覆盖 isError')
})

// ---------- p: 文件势变的四裁决 ----------

test('p: 失败后先观察同名对象 → 变', () => {
  const st = replay([call('edit', { path: 'x.js' }, true), call('read', { path: 'x.js' })])
  assert.equal(st.events[0].verdict, '变')
  assert.equal(st.counts.adapted, 1)
})

test('p: 失败后无观察的同名重试 → 盲捶', () => {
  const st = replay([call('edit', { path: 'x.js' }, true), call('edit', { path: 'x.js' })])
  assert.equal(st.events[0].verdict, '盲捶')
})

test('p: 失败后异名写不挡再察：write 之后 read 仍是 变', () => {
  const st = replay([
    call('edit', { path: 'x.js' }, true),
    call('write', { path: 'x.js' }),
    call('read', { path: 'x.js' }),
  ])
  assert.equal(st.events[0].verdict, '变')
})

test('p: 失败后流终无观察无重试 → 悬（挂账不计分）', () => {
  const st = replay([call('edit', { path: 'x.js' }, true), call('read', { path: 'other.js' })])
  assert.equal(st.events[0].verdict, '悬')
  assert.equal(st.counts.orphan, 1)
  assert.equal(st.score.stale, 0, '悬不计分')
})

test('p: 盲捶在先、观察在后 → 盲捶定谳不撤销（不追溯赦免）', () => {
  const st = replay([
    call('edit', { path: 'x.js' }, true),
    call('edit', { path: 'x.js' }),
    call('read', { path: 'x.js' }),
  ])
  assert.equal(st.events[0].verdict, '盲捶')
  assert.equal(st.events[0].observed, true)
})

test('p: 重试本身失败开新势变（链条自然生长）', () => {
  const st = replay([
    call('edit', { path: 'x.js' }, true),
    call('edit', { path: 'x.js' }, true),
  ])
  assert.equal(st.events.length, 2)
  assert.equal(st.events[0].verdict, '盲捶')
  assert.equal(st.events[1].verdict, '悬', '第二条势变流终无后继 → 悬')
})

// ---------- c:/n: 命令势变的裁决 ----------

test('c: 紧邻同名重试（无异途动作）→ 盲捶', () => {
  const st = replay([
    call('bash', { command: 'npm test' }, true),
    call('bash', { command: 'npm test' }),
  ])
  assert.equal(st.events[0].verdict, '盲捶')
})

test('c: 同名重试前有异途动作 → 变（路径动过，重试是有据复核）', () => {
  const st = replay([
    call('bash', { command: 'npm test' }, true),
    call('read', { path: 'src/a.js' }),
    call('bash', { command: 'npm test' }),
  ])
  assert.equal(st.events[0].verdict, '变')
})

test('c: 换命令也是异途：失败后改跑别的命令再回来 → 变', () => {
  const st = replay([
    call('bash', { command: 'npm test' }, true),
    call('bash', { command: 'npm run lint' }),
    call('bash', { command: 'npm test' }),
  ])
  assert.equal(st.events[0].verdict, '变')
})

test('c: 流终无重试 → 离（涂有所不由，正当改途，不计分不挂账）', () => {
  const st = replay([call('bash', { command: 'npm test' }, true), call('read', { path: 'a.js' })])
  assert.equal(st.events[0].verdict, '离')
  assert.equal(st.counts.pivot, 1)
  assert.equal(st.score.total, 0)
})

test('n: 不透明对象按 c: 规则裁决', () => {
  const st = replay([call('mystery', {}, true), call('mystery', {})])
  assert.equal(st.events[0].kind, 'n')
  assert.equal(st.events[0].verdict, '盲捶')
})

// ---------- 盲捶计分：链、免分、cap ----------

test('盲捶链：4 连败 → 3 条盲捶一链，首记免分 = 24 分', () => {
  const st = replay([
    call('bash', { command: 'npm test' }, true),
    call('bash', { command: 'npm test' }, true),
    call('bash', { command: 'npm test' }, true),
    call('bash', { command: 'npm test' }, true),
  ])
  assert.equal(st.counts.blind, 3)
  assert.equal(st.counts.blindCharged, 2)
  assert.equal(st.score.stale, 24)
})

test('瞬时重试免罚：一败一成（单记盲捶链）→ 0 分', () => {
  const st = replay([
    call('bash', { command: 'npm test' }, true),
    call('bash', { command: 'npm test' }),
  ])
  assert.equal(st.counts.blind, 1)
  assert.equal(st.counts.blindCharged, 0, '链首免分')
  assert.equal(st.score.stale, 0)
})

test('同链第二记起计分：败、败、成 → 12 分', () => {
  const st = replay([
    call('bash', { command: 'npm test' }, true),
    call('bash', { command: 'npm test' }, true),
    call('bash', { command: 'npm test' }),
  ])
  assert.equal(st.counts.blind, 2)
  assert.equal(st.counts.blindCharged, 1)
  assert.equal(st.score.stale, BLIND_POINTS)
})

test('不同对象的两条独立盲捶链各自免首记 → 0 分', () => {
  const st = replay([
    call('edit', { path: 'a.js' }, true),
    call('edit', { path: 'a.js' }, true),
    call('edit', { path: 'b.js' }, true),
    call('edit', { path: 'b.js' }, true),
  ])
  assert.equal(st.counts.blind, 2)
  assert.equal(st.score.stale, 0, '两条链各免首记')
})

test('同一对象的非相邻盲捶仍连一链（事件序相邻即链）', () => {
  const st = replay([
    call('bash', { command: 'npm test' }, true),
    call('bash', { command: 'npm test' }, true),
    call('read', { path: 'note.md' }),
    call('bash', { command: 'npm test' }, true),
    call('bash', { command: 'npm test' }),
  ])
  // e1(→c2 盲捶免), e2(异途后有 c4 重试 → 变), e3@c4(→c5 盲捶, +12)
  assert.equal(st.counts.blind, 2)
  assert.equal(st.counts.adapted, 1)
  assert.equal(st.score.stale, BLIND_POINTS)
})

test('盲捶 cap 60：7 连败 → 6 记免 1 计 6 = 72 → 60', () => {
  const st = replay(
    Array.from({ length: 7 }, () => call('bash', { command: 'npm test' }, true)),
  )
  assert.equal(st.counts.blind, 6)
  assert.equal(st.score.stale, STALE_CAP)
})

// ---------- 游骑计分 ----------

test('游骑：悬账未清时 3 个首现非观察对象 → +20，悬账记 悬', () => {
  const st = replay([
    call('edit', { path: 'x.js' }, true),
    call('edit', { path: 'a.js' }),
    call('edit', { path: 'b.js' }),
    call('edit', { path: 'c.js' }),
  ])
  assert.equal(st.counts.graze, 1)
  assert.equal(st.score.rash, GRAZE_POINTS)
  assert.equal(st.events[0].verdict, '悬')
})

test('游骑被观察打断：2+读+3 → 只后半段成轮', () => {
  const st = replay([
    call('edit', { path: 'x.js' }, true),
    call('edit', { path: 'a.js' }),
    call('edit', { path: 'b.js' }),
    call('read', { path: 'm.md' }),
    call('edit', { path: 'c.js' }),
    call('edit', { path: 'd.js' }),
    call('edit', { path: 'e.js' }),
  ])
  assert.equal(st.counts.graze, 1)
  assert.equal(st.score.rash, GRAZE_POINTS)
})

test('游骑被旧对象打断（非 fresh）不成轮', () => {
  const st = replay([
    call('edit', { path: 'x.js' }, true),
    call('edit', { path: 'a.js' }),
    call('edit', { path: 'a.js' }),
    call('edit', { path: 'b.js' }),
    call('edit', { path: 'c.js' }),
  ])
  assert.equal(st.counts.graze, 0)
  assert.equal(st.score.rash, 0)
})

test('无悬账时连开新文件不记游骑（正常开工）', () => {
  const st = replay([
    call('edit', { path: 'a.js' }),
    call('edit', { path: 'b.js' }),
    call('edit', { path: 'c.js' }),
    call('edit', { path: 'd.js' }),
  ])
  assert.equal(st.counts.graze, 0)
  assert.equal(st.score.total, 0)
})

test('游骑段长 2 不足 3 不记', () => {
  const st = replay([
    call('edit', { path: 'x.js' }, true),
    call('edit', { path: 'a.js' }),
    call('edit', { path: 'b.js' }),
  ])
  assert.equal(st.counts.graze, 0)
})

test('悬账期间的观察（再察）不算游骑前线', () => {
  const st = replay([
    call('edit', { path: 'x.js' }, true),
    call('read', { path: 'a.js' }),
    call('read', { path: 'b.js' }),
    call('read', { path: 'c.js' }),
  ])
  assert.equal(st.counts.graze, 0)
  assert.equal(st.score.total, 0)
})

test('再察归还悬账后武装解除：后续新对象连开不再算游骑（悬账已清）', () => {
  const st = replay([
    call('edit', { path: 'x.js' }, true),
    call('edit', { path: 'a.js' }),
    call('edit', { path: 'b.js' }),
    call('read', { path: 'x.js' }),
    call('edit', { path: 'c.js' }),
    call('edit', { path: 'd.js' }),
    call('edit', { path: 'e.js' }),
  ])
  assert.equal(st.events[0].verdict, '变')
  assert.equal(st.counts.graze, 0, '悬账归还后无前提：[a,b] 不足 3，[c,d,e] 无武装')
})

test('新悬账重新武装：归还旧账后新败又开游骑窗口', () => {
  const st = replay([
    call('edit', { path: 'x.js' }, true),
    call('edit', { path: 'a.js' }),
    call('edit', { path: 'b.js' }),
    call('read', { path: 'x.js' }),
    call('edit', { path: 'y.js' }, true),
    call('edit', { path: 'c.js' }),
    call('edit', { path: 'd.js' }),
    call('edit', { path: 'e.js' }),
  ])
  assert.equal(st.counts.graze, 1, '[c,d,e] 由 y 的新悬账武装')
  assert.equal(st.score.rash, GRAZE_POINTS)
})

test('游骑 cap 40：两轮 → 40', () => {
  const st = replay([
    call('edit', { path: 'x.js' }, true),
    call('edit', { path: 'a.js' }),
    call('edit', { path: 'b.js' }),
    call('edit', { path: 'c.js' }),
    call('read', { path: 'm.md' }),
    call('edit', { path: 'd.js' }),
    call('edit', { path: 'e.js' }),
    call('edit', { path: 'f.js' }),
  ])
  assert.equal(st.counts.graze, 2)
  assert.equal(st.score.rash, 40)
})

// ---------- 失机值、分带与门 ----------

test('失机值 = min(100, 滞+妄)：60+40 封顶 100', () => {
  const calls = Array.from({ length: 7 }, () => call('bash', { command: 'npm test' }, true))
  calls.push(call('edit', { path: 'y.js' }, true))
  calls.push(call('edit', { path: 'a.js' }))
  calls.push(call('edit', { path: 'b.js' }))
  calls.push(call('edit', { path: 'c.js' }))
  calls.push(call('read', { path: 'm.md' }))
  calls.push(call('edit', { path: 'd.js' }))
  calls.push(call('edit', { path: 'e.js' }))
  calls.push(call('edit', { path: 'f.js' }))
  const st = replay(calls)
  assert.equal(st.score.stale, 60, '盲捶链 6 记免 1 计 5 = 60 → cap 60')
  assert.equal(st.counts.blind, 6)
  assert.equal(st.score.rash, 40, '由 y 悬账武装的两轮游骑')
  assert.equal(st.score.total, 100)
})

test('分带：12 合 / 24 钝 / 36 胶', () => {
  const mk = (n) => replay(Array.from({ length: n }, () => call('bash', { command: 'x' }, true)))
  assert.equal(mk(2).band, '合', '1 记免分 → 0')
  assert.equal(mk(3).band, '合', '2 记免 1 计 1 → 12')
  assert.equal(mk(4).band, '钝', '3 计 2 → 24')
  assert.equal(mk(5).band, '胶', '4 计 3 → 36')
})

test('门默认 30；auditStream 遵循 --gate 覆盖', () => {
  assert.equal(GATE_DEFAULT, 30)
  const text = 'CHAPTER\n'.replace('CHAPTER', '') + [
    '{"type":"tool_call","id":"1","name":"bash","args":{"command":"x"}}',
    '{"type":"tool_result","id":"1","isError":true}',
  ].join('\n')
  assert.equal(auditStream(text).ok, true, '单败 0 分 → pass')
  assert.equal(auditStream(text, { gate: 0 }).ok, false, '门 0：0 ≥ 0 → fail')
})

test('空流：0 调用 0 势变 0 分，pass', () => {
  const st = replay([])
  assert.equal(st.calls.length, 0)
  assert.equal(st.events.length, 0)
  assert.equal(st.score.total, 0)
  const r = auditStream('# 只有注释\n')
  assert.equal(r.calls, 0)
  assert.equal(r.ok, true)
})

// ---------- 夹具（docs/04 A2：先于实现手算定死） ----------

test('夹具 adaptive-stream：0 分 / 合 / 变 2 / exit ok', () => {
  const r = auditStream(readFileSync(fx('adaptive-stream.jsonl'), 'utf8'))
  assert.equal(r.calls, 7)
  assert.equal(r.score.total, 0)
  assert.equal(r.band, '合')
  assert.equal(r.ok, true)
  assert.equal(r.counts.adapted, 2)
  assert.equal(r.counts.blind, 0)
  assert.equal(r.counts.graze, 0)
  assert.deepEqual(r.events.map((e) => e.verdict), ['变', '变'])
  assert.deepEqual(r.issues, [])
})

test('夹具 stubborn-stream：36 / 胶 / 盲捶 4 免 1 计 3 / 变 1 / 离 1 / fail', () => {
  const r = auditStream(readFileSync(fx('stubborn-stream.jsonl'), 'utf8'))
  assert.equal(r.calls, 7)
  assert.equal(r.score.total, 36)
  assert.equal(r.score.stale, 36)
  assert.equal(r.band, '胶')
  assert.equal(r.ok, false)
  assert.equal(r.counts.blind, 4)
  assert.equal(r.counts.blindCharged, 3)
  assert.equal(r.counts.adapted, 1)
  assert.equal(r.counts.pivot, 1)
  assert.deepEqual(r.events.map((e) => e.verdict), ['盲捶', '盲捶', '盲捶', '盲捶', '变', '离'])
  assert.match(r.issues[0], /\+36/)
})

test('夹具 grazing-stream：40 / 胶 / 游骑 2 / 变 1 / fail', () => {
  const r = auditStream(readFileSync(fx('grazing-stream.jsonl'), 'utf8'))
  assert.equal(r.calls, 10)
  assert.equal(r.score.total, 40)
  assert.equal(r.score.rash, 40)
  assert.equal(r.band, '胶')
  assert.equal(r.ok, false)
  assert.equal(r.counts.blind, 0)
  assert.equal(r.counts.graze, 2)
  assert.equal(r.counts.adapted, 1)
  assert.deepEqual(r.events.map((e) => e.verdict), ['变'])
  assert.match(r.issues[0], /游骑 ×2/)
  assert.match(r.issues[0], /\+40/)
})

// ---------- 跨项目互认（docs/04 A3：手算 8 调用 / 24 分 / 钝 / 盲捶 3 / 变 1） ----------

test('zhizhi 旧格式流直接验尸：8 调用 / 24 分 / 钝 / 盲捶 3 免 1 计 2 / 变 1', () => {
  const r = auditStream(readFileSync(repo('zhizhi/fixtures/sample-stream.jsonl'), 'utf8'))
  assert.equal(r.calls, 8)
  assert.equal(r.score.total, 24)
  assert.equal(r.band, '钝')
  assert.equal(r.counts.blind, 3)
  assert.equal(r.counts.blindCharged, 2)
  assert.equal(r.counts.adapted, 1)
  assert.equal(r.counts.pivot, 0)
  assert.equal(r.counts.orphan, 0)
})

test('jiebi 带 id 流直接验尸：8 调用 / 24 分 / 钝 / 盲捶 3 / 变 1 / 离 1', () => {
  const r = auditStream(readFileSync(repo('jiebi/fixtures/sample-stream.jsonl'), 'utf8'))
  assert.equal(r.calls, 8)
  assert.equal(r.score.total, 24)
  assert.equal(r.band, '钝')
  assert.equal(r.counts.blind, 3)
  assert.equal(r.counts.blindCharged, 2)
  assert.equal(r.counts.adapted, 1)
  assert.equal(r.counts.pivot, 1, 'repro 探针失败后改途 → 离')
})

// ---------- 变方渲染 ----------

test('变方：同一份已定谳流两次渲染逐字节相同', () => {
  const text = readFileSync(fx('grazing-stream.jsonl'), 'utf8')
  const mk = () => {
    const { calls } = buildCalls(parseStream(text))
    const st = analyze(calls)
    st.verdictsSettled = true
    return renderBianfang(st, 1)
  }
  assert.equal(mk(), mk())
})

test('变方：悬账逐条点名（序号按势变发生序）', () => {
  const { calls } = buildCalls([])
  const st = analyze(calls)
  step(st, call('edit', { path: 'x.js' }, true, 'c1'))
  step(st, call('edit', { path: 'a.js' }, false, 'c2'))
  step(st, call('edit', { path: 'b.js' }, false, 'c3'))
  step(st, call('edit', { path: 'c.js' }, false, 'c4'))
  const text = renderBianfang(st, 1)
  assert.match(text, /【九变 · 变方】势账 #1/)
  assert.match(text, /悬账（文件势变未归还）：/)
  assert.match(text, /1\. \[第1次动作\] edit p:x\.js/)
})

test('变方：无悬账时显示「悬账：无——势途相合，续行。」', () => {
  const { calls } = buildCalls(parseStream(readFileSync(fx('stubborn-stream.jsonl'), 'utf8')))
  const st = analyze(calls)
  st.verdictsSettled = true
  const text = renderBianfang(st, 1)
  assert.match(text, /悬账：无——势途相合，续行。/)
  assert.match(text, /盲捶前科：4 记/)
  assert.match(text, /失机值：36（胶）/)
})

test('变方：#k 随渲染序号递增', () => {
  const { calls } = buildCalls([])
  const st = analyze(calls)
  assert.match(renderBianfang(st, 1), /#1/)
  assert.match(renderBianfang(st, 2), /#2/)
})

test('变方：不同状态渲染不同文本（文本随势账变）', () => {
  const a = renderBianfang(analyze([]), 1)
  const st2 = analyze([call('edit', { path: 'x.js' }, true), call('read', { path: 'other.js' })])
  st2.verdictsSettled = true
  const b = renderBianfang(st2, 1)
  assert.notEqual(a, b)
})

// ---------- 引擎形状 ----------

test('引擎：step 与 analyze 等价（增量记账 = 一次性重放）', () => {
  const calls = [
    call('bash', { command: 'npm test' }, true, 'a'),
    call('bash', { command: 'npm test' }, true, 'b'),
    call('read', { path: 'src/a.js' }, false, 'c'),
    call('bash', { command: 'npm test' }, false, 'd'),
  ]
  const live = createShiEngine()
  for (const c of calls) step(live, c)
  finalize(live)
  const offline = analyze(calls)
  assert.deepEqual(live.score, offline.score)
  assert.equal(live.band, offline.band)
  assert.deepEqual(
    live.events.map((e) => [e.seq, e.verdict]),
    offline.events.map((e) => [e.seq, e.verdict]),
  )
})

test('finalize 后 openDebts 为空、悬账入 settledDebts', async () => {
  const { settledDebts } = await import('../src/core/shi.js')
  const st = analyze([call('edit', { path: 'x.js' }, true)])
  assert.equal(openDebts(st).length, 0, '定谳后无未决')
  assert.equal(settledDebts(st).length, 1)
})
