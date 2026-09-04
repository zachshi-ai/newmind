/**
 * 定分 core 测试 —— 判定语义逐条对 docs/03（先于实现锁死）。
 * A2 的手算夹具期望值也在此复核；实现与本文冲突时只能改实现。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf } from '../src/core/object.js'
import { normalizePath, globMatches, globsIntersectWitness, segWitness } from '../src/core/glob.js'
import {
  emptyRegistry,
  parseRegistry,
  serializeRegistry,
  claim,
  release,
  openDuring,
  findOverlaps,
} from '../src/core/fence.js'
import { createEngine, recordCall, judge, bandOf, GATE_DEFAULT } from '../src/core/zheng.js'
import { auditStreams, sessionName } from '../src/core/audit.js'
import { renderJiebei } from '../src/core/jiebei.js'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8')

const write = (engine, session, path, at, isError = false) =>
  recordCall(engine, { session, name: 'edit', args: { path }, isError, at })

// ---------------------------------------------------------------- glob（界的语言）

test('glob：normalizePath 处理反斜杠、./、//、尾斜杠', () => {
  assert.equal(normalizePath('src\\auth\\login.js'), 'src/auth/login.js')
  assert.equal(normalizePath('./src/a.js'), 'src/a.js')
  assert.equal(normalizePath('src//a.js'), 'src/a.js')
  assert.equal(normalizePath('src/auth/'), 'src/auth')
  assert.equal(normalizePath('src/a.js'), 'src/a.js')
})

test('glob：字面段精确匹配', () => {
  assert.equal(globMatches('src/auth/login.js', 'src/auth/login.js'), true)
  assert.equal(globMatches('src/auth/login.js', 'src/auth/token.js'), false)
})

test('glob：* 段内非空、不跨段', () => {
  assert.equal(globMatches('src/*.js', 'src/a.js'), true)
  assert.equal(globMatches('src/*.js', 'src/.js'), false, '* 至少一字')
  assert.equal(globMatches('src/*.js', 'src/a/b.js'), false, '* 不跨段')
})

test('glob：** 跨零段（src/auth/** 命中 src/auth 本段目录）', () => {
  assert.equal(globMatches('src/auth/**', 'src/auth'), true)
})

test('glob：** 跨多段', () => {
  assert.equal(globMatches('src/auth/**', 'src/auth/deep/token.js'), true)
  assert.equal(globMatches('src/auth/**', 'src/auth/token.js'), true)
  assert.equal(globMatches('src/auth/**', 'src/api/token.js'), false)
})

test('glob：** 居中可回溯', () => {
  assert.equal(globMatches('a/**/d', 'a/d'), true)
  assert.equal(globMatches('a/**/d', 'a/b/c/d'), true)
  assert.equal(globMatches('a/**/d', 'a/b/c/e'), false)
})

test('glob：大小写敏感、匹配前双方都规范化', () => {
  assert.equal(globMatches('src/Auth/**', 'src/auth/x'), false)
  assert.equal(globMatches('./src/*.js', '.\\src\\a.js'), true)
})

test('glob 交：恒等界给出见证径且双方命中', () => {
  const w = globsIntersectWitness('src/**', 'src/**')
  assert.ok(w, '有交')
  assert.equal(globMatches('src/**', w), true)
})

test('glob 交：不相交界返回 null', () => {
  assert.equal(globsIntersectWitness('src/a/**', 'lib/**'), null)
  assert.equal(globsIntersectWitness('a*x', 'b*y'), null)
})

test('glob 交：*.js × auth* 有交，见证径自证', () => {
  const w = globsIntersectWitness('*.js', 'auth*')
  assert.ok(w, `期望有交，实际 ${w}`)
  assert.equal(globMatches('*.js', w), true)
  assert.equal(globMatches('auth*', w), true)
})

test('glob 交：语料库一致性（见证⇒双方命中；无交⇒语料无共同命中）', () => {
  const globs = ['src/**', 'src/*.js', 'lib/**', '*.md', 'a*b', 'auth*', 'src/auth/**', 'docs/*']
  const corpus = ['src/a.js', 'src/auth/t.js', 'lib/x.py', 'README.md', 'axb', 'auth.js', 'docs/plan.md', 'zzz.qqq']
  for (let i = 0; i < globs.length; i++) {
    for (let j = 0; j < globs.length; j++) {
      const w = globsIntersectWitness(globs[i], globs[j])
      if (w !== null) {
        assert.ok(globMatches(globs[i], w) && globMatches(globs[j], w), `${globs[i]} × ${globs[j]} 见证 ${w} 必须双方命中`)
      } else {
        const strays = corpus.filter((p) => globMatches(globs[i], p) && globMatches(globs[j], p))
        assert.equal(strays.length, 0, `${globs[i]} × ${globs[j]} 判无交，但语料命中：${strays}`)
      }
    }
  }
})

test('glob：segWitness 基本面', () => {
  assert.equal(segWitness('abc', 'abc'), 'abc')
  assert.equal(segWitness('abc', 'abd'), null)
  assert.ok(segWitness('a*c', 'a*c'))
  assert.equal(segWitness('*b', '*c'), null, '公共后缀不可能：b≠c')
})

// ---------------------------------------------------------------- 分册（fence）

test('分册：空册与 serialize→parse 往返', () => {
  const round = parseRegistry(serializeRegistry(emptyRegistry()))
  assert.deepEqual(round, { version: 1, claims: [] })
})

test('分册：形状校验从紧（坏 JSON / 缺 claims / 坏 fences / 坏 at）', () => {
  assert.throws(() => parseRegistry('{oops'))
  assert.throws(() => parseRegistry('{"version":1}'))
  assert.throws(() => parseRegistry('{"version":1,"claims":[{"id":"x","fences":[1],"at":0}]}'))
  assert.throws(() => parseRegistry('{"version":1,"claims":[{"id":"x","fences":["a/**"],"at":"now"}]}'))
})

test('分册：领分追加；同 id 开放之分原位更新', () => {
  let reg = claim(emptyRegistry(), { id: 'a', fences: ['src/**'], at: 10 })
  assert.equal(reg.claims.length, 1)
  reg = claim(reg, { id: 'a', fences: ['lib/**'], at: 20 })
  assert.equal(reg.claims.length, 1, '开放中同 id 原位更新')
  assert.deepEqual(reg.claims[0].fences, ['lib/**'])
  assert.equal(reg.claims[0].at, 20)
})

test('分册：销分后再领分是新条目（史保留）', () => {
  let reg = claim(emptyRegistry(), { id: 'a', fences: ['src/**'], at: 10 })
  reg = release(reg, { id: 'a', at: 50 })
  reg = claim(reg, { id: 'a', fences: ['docs/**'], at: 60 })
  assert.equal(reg.claims.length, 2)
  assert.equal(reg.claims[0].releasedAt, 50)
  assert.equal(reg.claims[1].fences[0], 'docs/**')
})

test('分册：销分置 releasedAt；无开放之分销分抛错', () => {
  let reg = claim(emptyRegistry(), { id: 'a', fences: ['src/**'], at: 10 })
  reg = release(reg, { id: 'a', at: 99 })
  assert.equal(reg.claims[0].releasedAt, 99)
  assert.throws(() => release(reg, { id: 'a', at: 120 }))
  assert.throws(() => release(emptyRegistry(), { id: 'ghost', at: 1 }))
})

test('分册：开放时段 [at, releasedAt] 的边界', () => {
  const c = { id: 'a', fences: ['src/**'], at: 10, releasedAt: 50 }
  assert.equal(openDuring(c, 9), false)
  assert.equal(openDuring(c, 10), true)
  assert.equal(openDuring(c, 50), true, 'releasedAt 当刻仍开放')
  assert.equal(openDuring(c, 51), false)
  assert.equal(openDuring({ ...c, releasedAt: null }, 10 ** 9), true)
})

test('分册：争界告警自带见证径且自证', () => {
  const reg = claim(claim(emptyRegistry(), { id: 'a', fences: ['src/**'], at: 0 }), { id: 'b', fences: ['src/api/**'], at: 0 })
  const ov = findOverlaps(reg, { id: 'c', fences: ['src/api/notes.md'] })
  assert.equal(ov.length, 2, '与 a、b 各争一处')
  for (const o of ov) {
    assert.ok(globMatches(o.globA, o.witness) && globMatches(o.globB, o.witness), '见证径必须双方命中')
  }
  const none = findOverlaps(reg, { id: 'c', fences: ['totally/other/**'] })
  assert.equal(none.length, 0)
})

// ---------------------------------------------------------------- 流解析

test('流：注释与空行跳过、坏行报行号', () => {
  const events = parseStream('# 注释\n\n{"type":"turn_start","id":"t1"}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"ok":1}\nbroken line\n'), /第 2 行/)
})

test('流：id 配对回填 isError', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_call","id":"c1","name":"edit","args":{"path":"a.js"},"at":1}',
        '{"type":"tool_result","id":"c1","name":"edit","args":{"path":"a.js"},"isError":true,"at":2}',
      ].join('\n')
    )
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('流：zhizhi 旧格式（无 id）就近配对', () => {
  const { calls } = buildCalls(
    parseStream(
      [
        '{"type":"tool_call","name":"bash","args":{"command":"npm test"},"at":1}',
        '{"type":"tool_result","name":"bash","args":{"command":"npm test"},"isError":true,"at":2}',
      ].join('\n')
    )
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('流：孤儿 result 独立建档（不丢真实执行）', () => {
  const { calls } = buildCalls(
    parseStream('{"type":"tool_result","id":"x9","name":"edit","args":{"path":"a.js"},"isError":false,"at":3}')
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
})

test('流：缺 at 记 null（无时之写的前提）', () => {
  const { calls } = buildCalls(parseStream('{"type":"tool_call","id":"c1","name":"edit","args":{"path":"a.js"}}'))
  assert.equal(calls[0].at, null)
})

// ---------------------------------------------------------------- 对象键与工具族

test('对象键：path > file_path > command > n: 的三级回退', () => {
  assert.equal(objectKey({ path: 'a.js', command: 'ls' }, 'edit'), 'p:a.js')
  assert.equal(objectKey({ file_path: 'b.js', command: 'ls' }, 'edit'), 'p:b.js')
  assert.equal(objectKey({ command: ' npm test ' }, 'bash'), 'c:npm test')
  assert.equal(objectKey({ novel: 1 }, 'think'), 'n:think')
})

test('工具族：写 / 观察 / 执行 / 其他（与 jiubian 同词表）', () => {
  assert.equal(familyOf('edit'), 'write')
  assert.equal(familyOf('WriteFile'), 'write')
  assert.equal(familyOf('read'), 'observe')
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('think'), 'other')
})

test('写账：失败之写不入账（isError true），缺结果视同已落', () => {
  const e = createEngine()
  recordCall(e, { session: 's', name: 'edit', args: { path: 'a.js' }, isError: true, at: 1 })
  assert.equal(e.writes.length, 0)
  recordCall(e, { session: 's', name: 'edit', args: { path: 'a.js' }, isError: false, at: 2 })
  recordCall(e, { session: 's', name: 'write', args: { path: 'b.js' }, isError: null, at: 3 })
  assert.equal(e.writes.length, 2)
})

// ---------------------------------------------------------------- A2 夹具（手算值锁死）

test('A2：fenced-stream —— 6 调用 2 写、争值 0、带「定」、pass', () => {
  const r = auditStreams([{ name: 'fenced-stream.jsonl', text: fx('fenced-stream.jsonl') }])
  assert.equal(r.sessions, 1)
  assert.equal(r.calls, 6)
  assert.equal(r.writes, 2)
  assert.deepEqual(r.score, { total: 0, strife: 0, trespass: 0, stray: 0 })
  assert.equal(r.band, '定')
  assert.equal(r.ok, true)
  assert.equal(r.verdict, 'pass')
})

test('A2：racer-a + racer-b —— 11 调用 8 写、争写 2 处 = cap 60、共写 1、带「争」、fail', () => {
  const r = auditStreams([
    { name: 'racer-a.jsonl', text: fx('racer-a.jsonl') },
    { name: 'racer-b.jsonl', text: fx('racer-b.jsonl') },
  ])
  assert.equal(r.sessions, 2)
  assert.equal(r.calls, 11)
  assert.equal(r.writes, 8)
  assert.equal(r.counts.strifeSpots, 2)
  assert.equal(r.score.strife, 60, '2 处 ×30 = 60 恰达 cap')
  assert.deepEqual(r.score, { total: 60, strife: 60, trespass: 0, stray: 0 })
  assert.equal(r.counts.coWrites, 1)
  assert.deepEqual(r.coWriteKeys, ['p:HANDOFF.md'])
  assert.equal(r.band, '争')
  assert.equal(r.ok, false)
  assert.deepEqual(r.strifeSpots, [
    { key: 'p:core/auth.js', a: 'racer-a', b: 'racer-b' },
    { key: 'p:src/api/router.js', a: 'racer-a', b: 'racer-b' },
  ])
})

test('A2：stray-stream + stray-registry —— 侵入 1（30）+ 越分 1（6）= 36、带「争」、fail', () => {
  const registry = parseRegistry(fx('stray-registry.json'))
  const r = auditStreams([{ name: 'stray.jsonl', text: fx('stray.jsonl') }], { registry })
  assert.equal(r.calls, 5)
  assert.equal(r.writes, 4)
  assert.equal(r.counts.trespassPaths, 1)
  assert.equal(r.counts.strayPaths, 1)
  assert.deepEqual(r.score, { total: 36, strife: 0, trespass: 30, stray: 6 })
  assert.equal(r.band, '争')
  assert.equal(r.ok, false)
  assert.deepEqual(r.trespassEntries[0], { session: 'stray', path: 'src/api/notes.md', owner: 'tenant', glob: 'src/api/**' })
  assert.deepEqual(r.strayEntries[0], { session: 'stray', path: 'docs/plan.md', own: 'src/auth/**' })
})

test('A2：同流换无 tenant 分册 —— 争值 12、带「定」、pass（侵入与越分判然分界）', () => {
  const registry = parseRegistry('{ "version": 1, "claims": [ { "id": "stray", "fences": ["src/auth/**"], "at": 10, "releasedAt": null } ] }')
  const r = auditStreams([{ name: 'stray.jsonl', text: fx('stray.jsonl') }], { registry })
  assert.deepEqual(r.score, { total: 12, strife: 0, trespass: 0, stray: 12 })
  assert.equal(r.band, '定')
  assert.equal(r.ok, true)
})

// ---------------------------------------------------------------- 争写交错判定

test('争写：A,B,A → 一处（有序对 A × B），+30', () => {
  const e = createEngine()
  write(e, 'A', 'x.js', 1)
  write(e, 'B', 'x.js', 2)
  write(e, 'A', 'x.js', 3)
  const r = judge(e)
  assert.deepEqual(r.strifeSpots, [{ key: 'p:x.js', a: 'A', b: 'B' }])
  assert.equal(r.score.total, 30)
})

test('争写：A,B,A,B → 两处（双向各一），+60 恰达 cap', () => {
  const e = createEngine()
  write(e, 'A', 'x.js', 1)
  write(e, 'B', 'x.js', 2)
  write(e, 'A', 'x.js', 3)
  write(e, 'B', 'x.js', 4)
  const r = judge(e)
  assert.equal(r.counts.strifeSpots, 2)
  assert.equal(r.score.strife, 60)
  assert.deepEqual(r.strifeSpots.map((s) => `${s.a}×${s.b}`), ['A×B', 'B×A'])
})

test('共写：A 然后 B 先后接手 → 不计分，仅提示', () => {
  const e = createEngine()
  write(e, 'A', 'x.js', 1)
  write(e, 'B', 'x.js', 2)
  const r = judge(e)
  assert.equal(r.counts.strifeSpots, 0)
  assert.equal(r.counts.coWrites, 1)
  assert.equal(r.score.total, 0)
})

test('单会话重写同径不是争写', () => {
  const e = createEngine()
  write(e, 'A', 'x.js', 1)
  write(e, 'A', 'x.js', 2)
  write(e, 'A', 'x.js', 3)
  const r = judge(e)
  assert.equal(r.counts.strifeSpots, 0)
  assert.equal(r.counts.coWrites, 0)
})

test('无时之写：组内缺 at 整组退出交错判定，只记提示', () => {
  const e = createEngine()
  write(e, 'A', 'x.js', 1)
  write(e, 'B', 'x.js', null)
  write(e, 'A', 'x.js', 3)
  const r = judge(e)
  assert.equal(r.counts.strifeSpots, 0, '无时不成案')
  assert.deepEqual(r.timelessKeys, ['p:x.js'])
  assert.equal(r.timelessWrites, 1)
})

// ---------------------------------------------------------------- 权界判定（侵入 > 越分 > 未领分）

const REG = (claims) => ({ version: 1, claims })

test('侵入：他方开放之分命中 → +30，且不再记越分', () => {
  const e = createEngine()
  write(e, 'me', 'src/api/x.js', 100)
  const r = judge(e, { registry: REG([
    { id: 'me', fences: ['src/own/**'], at: 0, releasedAt: null },
    { id: 'other', fences: ['src/api/**'], at: 0, releasedAt: null },
  ]) })
  assert.equal(r.counts.trespassPaths, 1)
  assert.equal(r.counts.strayPaths, 0, '判定序：侵入吃掉越分')
  assert.equal(r.score.total, 30)
})

test('越分：无他方之分命中、自家分不命中 → +6', () => {
  const e = createEngine()
  write(e, 'me', 'docs/plan.md', 100)
  const r = judge(e, { registry: REG([{ id: 'me', fences: ['src/own/**'], at: 0, releasedAt: null }]) })
  assert.equal(r.counts.strayPaths, 1)
  assert.equal(r.score.total, 6)
})

test('未领分：自家无开放之分 → 提示不计分（声明权在账方）', () => {
  const e = createEngine()
  write(e, 'me', 'anything/x.js', 100)
  const r = judge(e, { registry: REG([{ id: 'other', fences: ['elsewhere/**'], at: 0, releasedAt: null }]) })
  assert.equal(r.counts.unclaimed, 1)
  assert.deepEqual(r.unclaimedSessions, ['me'])
  assert.equal(r.score.total, 0)
})

test('时段：@5 他方之分开放 → 侵入（自家未领不免罪）；@200 他方已销 → 降为越分', () => {
  const e = createEngine()
  write(e, 'me', 'src/api/x.js', 5)
  write(e, 'me', 'src/api/y.js', 200)
  const r = judge(e, { registry: REG([
    { id: 'me', fences: ['src/own/**'], at: 10, releasedAt: null },
    { id: 'other', fences: ['src/api/**'], at: 0, releasedAt: 100 },
  ]) })
  assert.equal(r.counts.trespassPaths, 1, '@5：other 之分开放中，侵入照判（判定序侵入 > 未领分）')
  assert.equal(r.counts.strayPaths, 1, '@200：other 已销分，自家分不命中 → 越分')
  assert.equal(r.score.total, 36)
})

test('c:/n: 对象是黑盒：有分册也不判', () => {
  const e = createEngine()
  recordCall(e, { session: 'me', name: 'bash', args: { command: 'vim src/api/x.js' }, isError: false, at: 100 })
  recordCall(e, { session: 'me', name: 'think', args: { note: 'x' }, isError: false, at: 101 })
  const r = judge(e, { registry: REG([{ id: 'other', fences: ['**'], at: 0, releasedAt: null }]) })
  assert.equal(r.counts.trespassPaths, 0)
  assert.equal(r.score.total, 0)
})

test('侵入按（会话×对象）去重：同会话闯同径两次是一宗', () => {
  const e = createEngine()
  write(e, 'me', 'src/api/x.js', 100)
  write(e, 'me', 'src/api/x.js', 200)
  const r = judge(e, { registry: REG([{ id: 'other', fences: ['src/api/**'], at: 0, releasedAt: null }]) })
  assert.equal(r.counts.trespassPaths, 1)
  assert.equal(r.score.trespass, 30)
})

test('无分册：权界三宗全不判，只剩流间事实', () => {
  const e = createEngine()
  write(e, 'me', 'src/api/x.js', 100)
  const r = judge(e)
  assert.deepEqual(r.counts, { strifeSpots: 0, coWrites: 0, trespassPaths: 0, strayPaths: 0, unclaimed: 0 })
})

// ---------------------------------------------------------------- 争值与分带（公式锁死）

test('争值：三 cap 与 total cap（60+60+30=150 → 100）', () => {
  const e = createEngine()
  // 争写 3 处：x.js A,B,A,B(2) + y.js A,B,A(1)
  write(e, 'A', 'x.js', 1)
  write(e, 'B', 'x.js', 2)
  write(e, 'A', 'x.js', 3)
  write(e, 'B', 'x.js', 4)
  write(e, 'A', 'y.js', 5)
  write(e, 'B', 'y.js', 6)
  write(e, 'A', 'y.js', 7)
  // 侵入 2 径 + 越分 5 径
  for (const p of ['api/1.js', 'api/2.js']) write(e, 'me', p, 100)
  for (const p of ['w/1', 'w/2', 'w/3', 'w/4', 'w/5']) write(e, 'me', p, 101)
  const r = judge(e, { registry: REG([
    { id: 'me', fences: ['own/**'], at: 0, releasedAt: null },
    { id: 'api', fences: ['api/**'], at: 0, releasedAt: null },
  ]) })
  assert.equal(r.score.strife, 60, '3 处 ×30 → cap 60')
  assert.equal(r.score.trespass, 60, '2 径 ×30 = 60')
  assert.equal(r.score.stray, 30, '5 径 ×6 = 30（未达 cap，cap 30 需 6 径）')
  assert.equal(r.score.total, 100, 'min(100, 150)')
})

test('分带边界：14 定 / 15 竞 / 29 竞 / 30 争', () => {
  assert.equal(bandOf(14), '定')
  assert.equal(bandOf(15), '竞')
  assert.equal(bandOf(29), '竞')
  assert.equal(bandOf(30), '争')
})

test('门：默认 30，total ≥ 门即 fail（单处争写即红）；自定义门生效', () => {
  const e = createEngine()
  write(e, 'A', 'x.js', 1)
  write(e, 'B', 'x.js', 2)
  write(e, 'A', 'x.js', 3)
  assert.equal(judge(e).gate, GATE_DEFAULT)
  assert.equal(judge(e).verdict, 'fail', '30 ≥ 30：有受害者的一票即红')
  assert.equal(judge(e, { gate: 40 }).verdict, 'pass', '30 < 40 自定义门放行')
})

test('A3：跨项目互认 —— jiubian 与 zhizhi 夹具直接喂 audit（1 会话、0 分、定、pass）', () => {
  const jb = readFileSync(join(here, '..', '..', 'jiubian', 'fixtures', 'adaptive-stream.jsonl'), 'utf8')
  const zz = readFileSync(join(here, '..', '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl'), 'utf8')
  for (const [name, text] of [['jiubian', jb], ['zhizhi', zz]]) {
    const r = auditStreams([{ name, text }])
    assert.equal(r.sessions, 1, `${name} 单会话`)
    assert.deepEqual(r.score, { total: 0, strife: 0, trespass: 0, stray: 0 })
    assert.equal(r.band, '定')
    assert.equal(r.ok, true)
  }
})

// ---------------------------------------------------------------- 判词（issues）

test('判词：racer 的判词逐字吻合', () => {
  const r = auditStreams([
    { name: 'racer-a.jsonl', text: fx('racer-a.jsonl') },
    { name: 'racer-b.jsonl', text: fx('racer-b.jsonl') },
  ])
  assert.deepEqual(r.issues, [
    '争写 ×2：core/auth.js（racer-a × racer-b）、src/api/router.js（racer-a × racer-b）——交错覆盖，后者闭眼',
    '共写 ×1（不计分）：HANDOFF.md —— 先后接手，非相争',
  ])
})

test('判词：stray 的判词逐字吻合', () => {
  const registry = parseRegistry(fx('stray-registry.json'))
  const r = auditStreams([{ name: 'stray.jsonl', text: fx('stray.jsonl') }], { registry })
  assert.deepEqual(r.issues, [
    '侵入 ×1（+30）：src/api/notes.md —— 落入 tenant 开放之分（src/api/**）',
    '越分 ×1（+6）：docs/plan.md —— 漂出自家分界（src/auth/**）',
  ])
})

// ---------------------------------------------------------------- 界碑块

test('界碑块：同一分册两次渲染逐字节相同', () => {
  const reg = parseRegistry(fx('stray-registry.json'))
  const a = renderJiebei(reg)
  const b = renderJiebei(parseRegistry(fx('stray-registry.json')))
  assert.equal(a, b)
  assert.match(a, /【定分 · 界碑】/)
  assert.match(a, /· stray ── src\/auth\/\*\*/)
  assert.match(a, /争界：无——分已定，行者不顾。/)
})

test('界碑块：争界处附见证径；空册出确定性空册文本', () => {
  const reg = parseRegistry(
    '{ "version": 1, "claims": [ {"id":"a","fences":["src/**"],"at":0,"releasedAt":null}, {"id":"b","fences":["src/api/**"],"at":0,"releasedAt":null} ] }'
  )
  const text = renderJiebei(reg)
  assert.match(text, /争界 1 处：/)
  const m = text.match(/见证径 ([^\s（]+)/)
  assert.ok(m, '附见证径')
  assert.ok(globMatches('src/**', m[1]) && globMatches('src/api/**', m[1]), '见证径双方命中')

  const empty = renderJiebei(emptyRegistry())
  assert.match(empty, /分册无开放之分——无分之地，写入先领分。/)
  assert.equal(empty, renderJiebei(parseRegistry('{"version":1,"claims":[]}')))
})

// ---------------------------------------------------------------- 会话名

test('会话名：去 .jsonl 后缀，其余原样；audit 撞名报错', () => {
  assert.equal(sessionName('racer-a.jsonl'), 'racer-a')
  assert.equal(sessionName('plain'), 'plain')
  assert.throws(() => auditStreams([{ name: 'a/x.jsonl', text: '{"type":"turn_start"}' }, { name: 'b/x.jsonl', text: '' }]), /撞名/)
})
