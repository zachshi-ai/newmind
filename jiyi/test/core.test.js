/**
 * 稽疑核心测试 —— 触发域、问凭据、判定序、分值、分带、门禁（A1/A2）。
 * 期望值先于实现手算锁死（docs/03 §9），实现与手算冲突只能改实现。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf } from '../src/core/object.js'
import { normalizePath } from '../src/core/normalize.js'
import {
  emptyAskfile, parseAskfile, serializeAskfile, askCount,
  addAsk, setNoDefaults, revokeAsk, mergeAsks, ONS,
} from '../src/core/askfile.js'
import { isFulfil, isEmptyAsk, hasTrace, domainHit } from '../src/core/wen.js'
import { createEngine, recordCall, judge, bandOf, GATE_DEFAULT } from '../src/core/ji.js'
import { renderJice } from '../src/core/jice.js'
import { auditStreams } from '../src/core/audit.js'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8')

const call = (name, args, isError = false) => ({ ref: null, name, args, isError, at: null })

function engineOf(...calls) {
  const engine = createEngine()
  for (const c of calls) recordCall(engine, { session: 's', ...c })
  return engine
}

// ---------------------------------------------------------------- 流解析

test('流解析：# 注释与空行被跳过', () => {
  const ev = parseStream('# 注释\n\n{"type":"tool_call","id":"a","name":"read","args":{}}\n')
  assert.equal(ev.length, 1)
})

test('流解析：坏行报行号', () => {
  assert.throws(() => parseStream('{"type":"tool_call"}\nnot-json\n'), /第 2 行/)
})

test('流解析：id 配对回填 isError', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"a","name":"bash","args":{"command":"x"}}\n' +
    '{"type":"tool_result","id":"a","name":"bash","isError":true}\n'
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('流解析：孤儿 result 独立建档', () => {
  const { calls } = buildCalls(parseStream('{"type":"tool_result","name":"bash","isError":false}'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
})

test('流解析：无 id result 并入紧邻其前 call', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","name":"bash","args":{"command":"x"}}\n' +
    '{"type":"tool_result","name":"bash","isError":true}\n'
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

// ---------------------------------------------------------------- 对象键与工具族

test('对象键：p:/c:/n: 三级回退', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'write'), 'p:a.js')
  assert.equal(objectKey({ command: ' ls ' }, 'bash'), 'c:ls')
  assert.equal(objectKey({}, 'read'), 'n:read')
})

test('工具族：observe 词表（exact ∪ 子串，大小写不敏感）', () => {
  for (const n of ['read', 'cat', 'view', 'glob', 'grep', 'ls', 'ReadFile', 'globFiles']) {
    assert.equal(familyOf(n), 'observe', n)
  }
})

test('工具族：write 词表', () => {
  for (const n of ['write', 'edit', 'apply', 'create', 'move', 'remove', 'EditNotebook']) {
    assert.equal(familyOf(n), 'write', n)
  }
})

test('工具族：exec 词表', () => {
  for (const n of ['bash', 'exec', 'run', 'shell', 'command', 'Bash']) {
    assert.equal(familyOf(n), 'exec', n)
  }
})

test('工具族：未知工具 → other', () => {
  assert.equal(familyOf('think'), 'other')
})

// ---------------------------------------------------------------- 路径规整

test('normalizePath：\\ // ./ 尾斜杠规整', () => {
  assert.equal(normalizePath('.\\docs\\a.md'), 'docs/a.md')
  assert.equal(normalizePath('./AGENTS.md'), 'AGENTS.md')
  assert.equal(normalizePath('a//b/'), 'a/b')
})

test('normalizePath：大小写敏感、.. 不解析', () => {
  assert.notEqual(normalizePath('AGENTS.md'), 'agents.md')
  assert.equal(normalizePath('src/../AGENTS.md'), 'src/../AGENTS.md')
})

// ---------------------------------------------------------------- 疑册

test('疑册：parse 合法册', () => {
  const a = parseAskfile('{"version":1,"asks":[{"path":"AGENTS.md","on":"write"}],"noDefaults":false}')
  assert.equal(a.asks.length, 1)
  assert.equal(a.noDefaults, false)
})

test('疑册：parse 坏 version / 坏 on / 空 path 均抛', () => {
  assert.throws(() => parseAskfile('{"version":2,"asks":[]}'), /version/)
  assert.throws(() => parseAskfile('{"version":1,"asks":[{"path":"a","on":"fly"}]}'), /--on|on 必须是|on/)
  assert.throws(() => parseAskfile('{"version":1,"asks":[{"path":"","on":"write"}]}'), /path/)
  assert.throws(() => parseAskfile('not-json'), /JSON/)
})

test('疑册：merge 默认并入与显式档优先（同 path+on）', () => {
  const merged = mergeAsks({ version: 1, asks: [{ path: 'AGENTS.md', on: 'write' }], noDefaults: false })
  assert.equal(merged.length, 3)
  assert.equal(merged[0].tier, 'explicit')
  assert.deepEqual(merged.slice(1).map((a) => a.path), ['CLAUDE.md', 'README.md'])
})

test('疑册：merge noDefaults 关默认、asks 空册归并后为空', () => {
  const merged = mergeAsks({ version: 1, asks: [], noDefaults: true })
  assert.equal(merged.length, 0)
})

test('疑册：merge any 与默认 write 不互并（同 path 双条）', () => {
  const merged = mergeAsks({ version: 1, asks: [{ path: 'AGENTS.md', on: 'any' }], noDefaults: false })
  assert.equal(merged.length, 4)
  assert.equal(merged.filter((a) => a.path === 'AGENTS.md').length, 2)
})

test('疑册：显式条内部同 (path,on) 去重', () => {
  const merged = mergeAsks({
    version: 1,
    asks: [{ path: 'X.md', on: 'write' }, { path: 'X.md', on: 'write' }],
    noDefaults: true,
  })
  assert.equal(merged.length, 1)
})

test('疑册：addAsk 幂等、revokeAsk 按径销条、ONS 三域', () => {
  const a = emptyAskfile()
  addAsk(a, 'X.md', 'exec')
  addAsk(a, 'X.md', 'exec')
  assert.equal(a.asks.length, 1)
  assert.deepEqual(ONS, ['write', 'exec', 'any'])
  assert.equal(revokeAsk(a, 'X.md'), 1)
  assert.equal(revokeAsk(a, 'X.md'), 0)
  setNoDefaults(a, true)
  assert.equal(a.noDefaults, true)
  assert.equal(askCount(a), 0)
  assert.match(serializeAskfile(a), /"version": 1/)
})

// ---------------------------------------------------------------- 问凭据（wen）

const ASK = { path: 'AGENTS.md', on: 'write', tier: 'explicit' }

test('问凭据：读取通道成功即认（isError false / null）', () => {
  assert.equal(isFulfil(call('read', { path: 'AGENTS.md' }, false), ASK), true)
  assert.equal(isFulfil(call('read', { path: 'AGENTS.md' }, null), ASK), true)
})

test('问凭据：读取通道 ./ 前缀规整认问、异名不认', () => {
  assert.equal(isFulfil(call('read', { path: './AGENTS.md' }), ASK), true)
  assert.equal(isFulfil(call('read', { path: 'docs/AGENTS.md' }), ASK), false)
})

test('问凭据：命令通道成功 exec 命令含名即认', () => {
  assert.equal(isFulfil(call('bash', { command: 'cat package.json | jq .scripts' }), { ...ASK, path: 'package.json' }), true)
  assert.equal(isFulfil(call('bash', { command: 'npm run build' }), { ...ASK, path: 'package.json' }), false)
})

test('问凭据：失败调用永不构成凭据', () => {
  assert.equal(isFulfil(call('read', { path: 'AGENTS.md' }, true), ASK), false)
  assert.equal(isFulfil(call('bash', { command: 'cat AGENTS.md' }, true), ASK), false)
})

test('空疑：失败 observe 且路径相等；非 observe 失败不算', () => {
  assert.equal(isEmptyAsk(call('read', { path: 'AGENTS.md' }, true), ASK), true)
  assert.equal(isEmptyAsk(call('bash', { command: 'ls AGENTS.md' }, true), ASK), false)
  assert.equal(isEmptyAsk(call('read', { path: 'other.md' }, true), ASK), false)
})

test('痕迹：任何族对象路径相等 ∪ exec 命令含名（成败不论）', () => {
  assert.equal(hasTrace(call('read', { path: 'AGENTS.md' }, true), ASK), true)
  assert.equal(hasTrace(call('bash', { command: 'ls AGENTS.md' }, true), ASK), true)
  assert.equal(hasTrace(call('glob', { path: 'src/*.js' }), ASK), false)
})

test('触发域：write/exec/any 三域命中', () => {
  assert.equal(domainHit(call('edit', { path: 'a.js' }), 'write'), true)
  assert.equal(domainHit(call('edit', { path: 'a.js' }), 'exec'), false)
  assert.equal(domainHit(call('bash', { command: 'ls' }), 'any'), true)
  assert.equal(domainHit(call('read', { path: 'a' }), 'any'), false)
})

// ---------------------------------------------------------------- 引擎判定序（judge）

test('无册不判：askfile null → 全零 + 注记', () => {
  const r = judge(engineOf(call('edit', { path: 'a.js' })))
  assert.equal(r.score.total, 0)
  assert.equal(r.counts.askCount, 0)
  assert.equal(r.band, '谋')
  assert.equal(r.verdict, 'pass')
  assert.ok(r.issues.some((s) => s.includes('无稽疑册')))
})

test('无册不判：asks 空 ∪ noDefaults true 同判', () => {
  const r = judge(engineOf(call('edit', { path: 'a.js' })), {
    askfile: { version: 1, asks: [], noDefaults: true },
  })
  assert.equal(r.counts.askCount, 0)
  assert.ok(r.issues.some((s) => s.includes('无稽疑册')))
})

test('默认条触发域内无调用 → 无动不判（triggered 0）', () => {
  const r = judge(engineOf(call('read', { path: 'src/a.js' })), { askfile: emptyAskfile() })
  assert.equal(r.counts.askCount, 3)
  assert.equal(r.counts.triggered, 0)
  assert.equal(r.score.total, 0)
  assert.equal(r.issues.length, 0)
})

test('A2：clean 夹具 —— 谋值 0、带「谋」、counts 全对手算', () => {
  const r = auditStreams([{ name: 'clean-stream.jsonl', text: fx('clean-stream.jsonl') }], {
    askfile: parseAskfile(fx('clean-askfile.json')),
  })
  assert.equal(r.calls, 3)
  assert.equal(r.asks, 3)
  assert.deepEqual(r.score, { total: 0, late: 0, blind: 0 })
  assert.equal(r.band, '谋')
  assert.equal(r.verdict, 'pass')
  assert.deepEqual(r.counts, { triggered: 3, fulfilled: 1, late: 0, blind: 0, emptyAsk: 0, unseen: 2, askCount: 3 })
  assert.ok(r.issues.some((s) => s.includes('谋及 ×1：AGENTS.md')))
  assert.ok(r.issues.some((s) => s.includes('未见 ×2')))
})

test('A2：blind 夹具 —— 迟问 ×2 = 10、空疑 ×1、带「谋」', () => {
  const r = auditStreams([{ name: 'blind-stream.jsonl', text: fx('blind-stream.jsonl') }], {
    askfile: parseAskfile(fx('blind-askfile.json')),
  })
  assert.equal(r.calls, 5)
  assert.equal(r.asks, 5)
  assert.deepEqual(r.score, { total: 10, late: 10, blind: 0 })
  assert.equal(r.band, '谋')
  assert.equal(r.verdict, 'pass')
  assert.deepEqual(r.counts, { triggered: 5, fulfilled: 0, late: 2, blind: 0, emptyAsk: 1, unseen: 2, askCount: 5 })
  assert.ok(r.issues.some((s) => s.includes('迟问 ×2（+5/条）：AGENTS.md、package.json')))
  assert.ok(r.issues.some((s) => s.includes('空疑 ×1（不计分）：CONTRIBUTING.md')))
})

test('A2：guilt 夹具 —— 独谋显式 ×2 = 30、带「独」、门红', () => {
  const r = auditStreams([{ name: 'guilt-stream.jsonl', text: fx('guilt-stream.jsonl') }], {
    askfile: parseAskfile(fx('guilt-askfile.json')),
  })
  assert.equal(r.calls, 3)
  assert.equal(r.asks, 4)
  assert.deepEqual(r.score, { total: 30, late: 0, blind: 30 })
  assert.equal(r.band, '独')
  assert.equal(r.verdict, 'fail')
  assert.deepEqual(r.counts, { triggered: 4, fulfilled: 0, late: 0, blind: 2, emptyAsk: 0, unseen: 2, askCount: 4 })
  assert.ok(r.issues.some((s) => s.includes('独谋（显式）×2（+15/条）：AGENTS.md、Makefile')))
})

test('A2：guilt 夹具无册 —— 无册不判 0 分 exit 语义 pass', () => {
  const r = auditStreams([{ name: 'guilt-stream.jsonl', text: fx('guilt-stream.jsonl') }])
  assert.deepEqual(r.score, { total: 0, late: 0, blind: 0 })
  assert.equal(r.band, '谋')
  assert.equal(r.verdict, 'pass')
  assert.ok(r.issues.some((s) => s.includes('无稽疑册')))
})

test('动即问：首笔 exec `cat package.json` 同笔即凭据 → 谋及 0', () => {
  const r = judge(engineOf(call('bash', { command: 'cat package.json' })), {
    askfile: { version: 1, asks: [{ path: 'package.json', on: 'exec' }], noDefaults: true },
  })
  assert.equal(r.score.total, 0)
  assert.equal(r.counts.fulfilled, 1)
})

test('判定序：空疑先于迟问（404 在前、成功读取在后 → 空疑免）', () => {
  const r = judge(engineOf(
    call('read', { path: 'X.md' }, true),
    call('write', { path: 'a.js' }),
    call('read', { path: 'X.md' })
  ), { askfile: { version: 1, asks: [{ path: 'X.md', on: 'write' }], noDefaults: true } })
  assert.equal(r.counts.emptyAsk, 1)
  assert.equal(r.counts.late, 0)
  assert.equal(r.score.total, 0)
})

test('判定序：谋及先于一切（读取前置 → 0，其后再有读取不改判）', () => {
  const r = judge(engineOf(
    call('read', { path: 'AGENTS.md' }),
    call('write', { path: 'a.js' }),
    call('read', { path: 'AGENTS.md' })
  ), { askfile: { version: 1, asks: [{ path: 'AGENTS.md', on: 'write' }], noDefaults: true } })
  assert.equal(r.counts.fulfilled, 1)
  assert.equal(r.counts.late, 0)
  assert.equal(r.score.total, 0)
})

test('判定序：迟问（write 先、read 后）= +5', () => {
  const r = judge(engineOf(
    call('write', { path: 'a.js' }),
    call('read', { path: 'AGENTS.md' })
  ), { askfile: { version: 1, asks: [{ path: 'AGENTS.md', on: 'write' }], noDefaults: false } })
  assert.deepEqual(r.score, { total: 5, late: 5, blind: 0 })
  assert.equal(r.counts.unseen, 2)
})

test('判定序：失败 exec 含名不构成凭据 → 显式独谋 +15', () => {
  const r = judge(engineOf(
    call('bash', { command: 'cat package.json' }, true),
    call('bash', { command: 'npm run build' })
  ), { askfile: { version: 1, asks: [{ path: 'package.json', on: 'exec' }], noDefaults: true } })
  assert.deepEqual(r.score, { total: 15, late: 0, blind: 15 })
})

test('判定序：默认档有痕无凭据（失败 exec 含名）→ 独谋默认 +5', () => {
  const r = judge(engineOf(
    call('write', { path: 'a.js' }),
    call('bash', { command: 'ls CLAUDE.md' }, true)
  ), { askfile: emptyAskfile() })
  assert.deepEqual(r.score, { total: 5, late: 0, blind: 5 })
  assert.equal(r.counts.blind, 1)
  assert.equal(r.counts.unseen, 2)
})

test('判定序：默认档全流无踪 → 未见不计分', () => {
  const r = judge(engineOf(call('write', { path: 'a.js' })), { askfile: emptyAskfile() })
  assert.equal(r.score.total, 0)
  assert.equal(r.counts.unseen, 3)
  assert.ok(r.issues.some((s) => s.includes('未见 ×3（不计分）')))
})

test('判定序：on 域不匹配不触发（ask exec、流只有 write → 无动）', () => {
  const r = judge(engineOf(call('write', { path: 'a.js' })), {
    askfile: { version: 1, asks: [{ path: 'package.json', on: 'exec' }], noDefaults: true },
  })
  assert.equal(r.counts.triggered, 0)
  assert.equal(r.score.total, 0)
})

test('on:any：write 与 exec 皆触发，凭据照判', () => {
  const r = judge(engineOf(
    call('read', { path: 'X.md' }),
    call('write', { path: 'a.js' })
  ), { askfile: { version: 1, asks: [{ path: 'X.md', on: 'any' }], noDefaults: true } })
  assert.equal(r.counts.fulfilled, 1)
  assert.equal(r.score.total, 0)
})

// ---------------------------------------------------------------- 分值分带门禁

test('bandOf 边界：14/15 与 29/30', () => {
  assert.equal(bandOf(14), '谋')
  assert.equal(bandOf(15), '疏')
  assert.equal(bandOf(29), '疏')
  assert.equal(bandOf(30), '独')
})

test('迟问 cap：4 条迟问 = 15（3 默认 + 1 显式）', () => {
  const r = judge(engineOf(
    call('write', { path: 'a.js' }),
    call('read', { path: 'AGENTS.md' }),
    call('read', { path: 'CLAUDE.md' }),
    call('read', { path: 'README.md' }),
    call('read', { path: 'X.md' })
  ), { askfile: { version: 1, asks: [{ path: 'X.md', on: 'write' }], noDefaults: false } })
  assert.equal(r.counts.late, 4)
  assert.deepEqual(r.score, { total: 15, late: 15, blind: 0 })
  assert.equal(r.band, '疏')
})

test('独谋显式 cap：4 条 = 45、带「独」、门红', () => {
  const asks = ['A.md', 'B.md', 'C.md', 'D.md'].map((p) => ({ path: p, on: 'write' }))
  const r = judge(engineOf(call('write', { path: 'a.js' })), {
    askfile: { version: 1, asks, noDefaults: true },
  })
  assert.deepEqual(r.score, { total: 45, late: 0, blind: 45 })
  assert.equal(r.band, '独')
  assert.equal(r.verdict, 'fail')
})

test('独谋默认 cap：3 条有痕 = 15、带「疏」', () => {
  const r = judge(engineOf(
    call('write', { path: 'a.js' }),
    call('bash', { command: 'ls AGENTS.md' }, true),
    call('bash', { command: 'ls CLAUDE.md' }, true),
    call('bash', { command: 'ls README.md' }, true)
  ), { askfile: emptyAskfile() })
  assert.deepEqual(r.score, { total: 15, late: 0, blind: 15 })
  assert.equal(r.band, '疏')
  assert.equal(r.verdict, 'pass')
})

test('total 上限组合：显式 45 + 迟问 15 = 60', () => {
  const asks = ['A.md', 'B.md', 'C.md', 'D.md'].map((p) => ({ path: p, on: 'exec' }))
  const r = judge(engineOf(
    call('bash', { command: 'run' }),
    call('write', { path: 'a.js' }),
    call('read', { path: 'AGENTS.md' }),
    call('read', { path: 'CLAUDE.md' }),
    call('read', { path: 'README.md' })
  ), { askfile: { version: 1, asks, noDefaults: false } })
  // 4 显式独谋 45；默认三条的 write 触发在笔 1、读取在笔 2–4 → 迟问 3 → 15
  assert.equal(r.score.blind, 45)
  assert.equal(r.score.late, 15)
  assert.equal(r.score.total, 60)
})

test('门可调：gate 10 时单显式独谋 15 即红', () => {
  const r = judge(engineOf(call('write', { path: 'a.js' })), {
    askfile: { version: 1, asks: [{ path: 'X.md', on: 'write' }], noDefaults: true },
    gate: 10,
  })
  assert.equal(r.score.total, 15)
  assert.equal(r.verdict, 'fail')
})

test('门默认：GATE_DEFAULT = 30', () => {
  assert.equal(GATE_DEFAULT, 30)
})

// ---------------------------------------------------------------- 稽块

test('稽块：同一疑册两次渲染逐字节相同', () => {
  const a = parseAskfile(fx('clean-askfile.json'))
  assert.equal(renderJice(a), renderJice(a))
})

test('稽块：含疑条行、档位标注与典语', () => {
  const a = parseAskfile(fx('clean-askfile.json'))
  const text = renderJice(a)
  assert.match(text, /【稽疑 · 疑册】/)
  assert.match(text, /疑条 3 条（显式 1 ∪ 默认 2，noDefaults 否）/)
  assert.match(text, /· AGENTS\.md（write）\[显式\]/)
  assert.match(text, /· CLAUDE\.md（write）\[默认\]/)
  assert.match(text, /汝则有大疑，谋及乃心，谋及卿士/)
})

test('稽块：空籍确定性文本', () => {
  const a = { version: 1, asks: [], noDefaults: true }
  assert.equal(renderJice(a), renderJice(a))
  assert.match(renderJice(a), /空籍/)
  assert.match(renderJice(null), /空籍/)
})

test('稽块：问况与谋值随 stats 呈现', () => {
  const text = renderJice(parseAskfile(fx('guilt-askfile.json')), {
    fulfilled: 0, emptyAsk: 0, late: 0, blind: 2, unseen: 2, total: 30, band: '独',
  })
  assert.match(text, /问账：谋及 0 · 空疑 0 · 迟问 0 · 独谋 2 · 未见 2/)
  assert.match(text, /谋值：30（独）/)
})

// ---------------------------------------------------------------- 离线审计

test('auditStreams：多流合并——流 A 的读取救流 B 的首动（跨会话互认）', () => {
  const a = { version: 1, asks: [{ path: 'AGENTS.md', on: 'write' }], noDefaults: true }
  const r = auditStreams(
    [
      { name: 'a.jsonl', text: '{"type":"tool_call","id":"1","name":"read","args":{"path":"AGENTS.md"}}\n{"type":"tool_result","id":"1","name":"read","isError":false}\n' },
      { name: 'b.jsonl', text: '{"type":"tool_call","id":"2","name":"write","args":{"path":"x.js"}}\n{"type":"tool_result","id":"2","name":"write","isError":false}\n' },
    ],
    { askfile: a }
  )
  assert.equal(r.sessions, 2)
  assert.equal(r.calls, 2)
  assert.equal(r.counts.fulfilled, 1)
  assert.equal(r.score.total, 0)
})

test('auditStreams：session 计数与 calls 计数', () => {
  const r = auditStreams(
    [
      { name: 'a.jsonl', text: '{"type":"tool_call","name":"read","args":{"path":"x"}}\n' },
      { name: 'b.jsonl', text: '{"type":"tool_call","name":"read","args":{"path":"y"}}\n' },
    ],
    { askfile: { version: 1, asks: [], noDefaults: true } }
  )
  assert.equal(r.sessions, 2)
  assert.equal(r.calls, 2)
  assert.equal(r.asks, 0)
})
