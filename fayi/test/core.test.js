/**
 * 法仪核心测试 —— 流解析 / 器册 / 验尺 / 翻红窗 / 虚器 / 照末 / 枉值 / 绳墨块。
 * 全部确定性：不触网、不碰盘、不用时钟（时刻都是显式 at）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { normalizePath, globMatches } from '../src/core/glob.js'
import { objectKey, familyOf } from '../src/core/object.js'
import {
  DEFAULT_GUARD_GLOBS, DEFAULT_VERIFY_PATTERNS,
  emptyRegister, parseRegister, serializeRegister, mergeRegister, classifyPath, isVerifyCommand,
} from '../src/core/qice.js'
import { HOLLOW_FORMS, scanHollow } from '../src/core/hollow.js'
import { createEngine, recordCall, judge, bandOf, GATE_DEFAULT } from '../src/core/fayi.js'
import { renderShengmo } from '../src/core/block.js'
import { auditStream, sessionName, buildIssues } from '../src/core/audit.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8')

// ---- A1 流解析 --------------------------------------------------------------
test('A1 · 注释与空行跳过，坏 JSON 报行号', () => {
  const events = parseStream('# 头注释\n\n{"type":"tool_call","id":"1","name":"edit"}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"ok":1}\n坏行\n'), /第 2 行/)
})

test('A1 · 带 id 的 call/result 配对，id 首见为准', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"a","name":"edit","args":{"path":"x.js"},"at":1}\n' +
    '{"type":"tool_call","id":"a","name":"dup","args":{},"at":2}\n' +
    '{"type":"tool_result","id":"a","isError":true,"at":3}\n'
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'edit', '重复 id 的第二个 call 不建档（首见为准）')
  assert.equal(calls[0].isError, true)
})

test('A1 · 无 id 旧格式 result 并入紧邻其前 call；孤儿 result 独立建档', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","name":"edit","args":{"path":"x.js"},"at":1}\n' +
    '{"type":"tool_result","isError":false,"at":2}\n' +
    '{"type":"tool_result","isError":true,"at":3}\n'
  ))
  assert.equal(calls.length, 2)
  assert.equal(calls[0].isError, false, '旧格式 result 并入紧邻其前 call')
  assert.equal(calls[1].isError, true, '孤儿 result 独立建档，isError:null→true 回填')
  assert.equal(calls[1].name, undefined)
})

test('A1 · 非工具事件跳过；缺 at 记 null', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"turn_start"}\n{"type":"tool_call","id":"z","name":"edit","args":{"path":"a"}}\n'
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].at, null)
})

// ---- 器册（A2）--------------------------------------------------------------
test('A2 · 空册形状与序列化回环', () => {
  const reg = emptyRegister()
  assert.deepEqual(reg, { version: 1, guards: [], amends: [], verify: [], noDefaults: false })
  const back = parseRegister(serializeRegister(reg))
  assert.deepEqual(back, reg)
})

test('A2 · parseRegister 拒绝坏形', () => {
  assert.throws(() => parseRegister('[]'), /JSON 对象/)
  assert.throws(() => parseRegister('{"guards":"x"}'), /非空字符串数组/)
  assert.throws(() => parseRegister('{"guards":[""]}'), /非空字符串数组/)
  assert.throws(() => parseRegister('{"noDefaults":"yes"}'), /布尔/)
})

test('A2 · mergeRegister 并集去重只增不删；noDefaults 一真不回落', () => {
  const m1 = mergeRegister(emptyRegister(), { guards: ['a/**', 'b/**'], amends: ['b/**'], verify: ['make'] })
  const m2 = mergeRegister(m1, { guards: ['b/**', 'c/**'], verify: ['make', 'x'], noDefaults: true })
  assert.deepEqual(m2.guards, ['a/**', 'b/**', 'c/**'])
  assert.deepEqual(m2.amends, ['b/**'])
  assert.deepEqual(m2.verify, ['make', 'x'])
  assert.equal(m2.noDefaults, true)
  const m3 = mergeRegister(m2, {})
  assert.equal(m3.noDefaults, true, 'noDefaults 一旦为真不再回落')
})

test('A2 · 分类序 amend > guard > 实测面；默认形表在册', () => {
  const reg = { version: 1, guards: ['contract/**'], amends: ['contract/specs/**'], verify: [], noDefaults: false }
  assert.equal(classifyPath(reg, 'contract/specs/a.test.js'), 'amend', 'amend 优先于 guard 与默认形')
  assert.equal(classifyPath(reg, 'contract/src.js'), 'guard')
  assert.equal(classifyPath(reg, 'test/a.test.js'), 'guard', '默认形 **/test/**')
  assert.equal(classifyPath(reg, 'src/mod.test.ts'), 'guard', '默认形 **/*.test.ts')
  assert.equal(classifyPath(reg, 'src/mod.js'), 'plain')
})

test('A2 · noDefaults 关闭默认形；显式仍在', () => {
  const reg = { version: 1, guards: ['t/**'], amends: [], verify: [], noDefaults: true }
  assert.equal(classifyPath(reg, 'test/a.test.js'), 'plain', '默认形已关')
  assert.equal(classifyPath(reg, 't/a.js'), 'guard')
})

test('A2 · 路径规范化后匹配；不触碰文件系统', () => {
  const reg = emptyRegister()
  assert.equal(classifyPath(reg, '.\\test\\a.js'), 'guard', '\\ → / 与 ./ 剥除')
  assert.equal(classifyPath(reg, 'x//test//b.js'), 'guard')
  assert.equal(classifyPath(reg, 'no/such/dir/test/c.spec.js'), 'guard', '离线路径照判')
})

test('A2 · 默认持性形逐形命中（抽 representative）', () => {
  const reg = emptyRegister()
  for (const p of ['a.test.js', 'b.spec.tsx', 'test/x.js', 'tests/y.py', '__tests__/z.js', '__snapshots__/s.snap',
    'jest.config.js', 'vitest.config.ts', 'playwright.config.ts', 'karma.conf.js',
    '.github/workflows/ci.yml', '.github/workflows/ci.yaml']) {
    assert.equal(classifyPath(reg, p), 'guard', p)
  }
})

test('A2 · globMatches 与定分同规（字面段 / 段内 * / 独占段 **）', () => {
  assert.equal(globMatches('src/**/*.test.js', 'src/a/b/c.test.js'), true)
  assert.equal(globMatches('src/*.js', 'src/a.js'), true)
  assert.equal(globMatches('src/*.js', 'src/a/b.js'), false, '段内 * 不跨段')
  assert.equal(globMatches('**/test/**', 'test/a.js'), true, '** 可跨零段')
  assert.equal(normalizePath('a\\\\b//c/'), 'a/b/c')
})

// ---- A3 验尺事件 ------------------------------------------------------------
test('A3 · 默认验尺词逐形命中', () => {
  const reg = emptyRegister()
  for (const cmd of ['npm test', 'npm run test', 'pnpm check', 'npx vitest run', 'npx jest', 'pytest -q',
    'go test ./...', 'cargo test', 'make', 'npx tsc --noEmit', 'mvn verify', 'gradle check', 'ctest']) {
    assert.equal(isVerifyCommand(reg, cmd), true, cmd)
  }
})

test('A3 · 显式词子串命中；noDefaults 只认显式', () => {
  const reg = { version: 1, guards: [], amends: [], verify: ['make check'], noDefaults: false }
  assert.equal(isVerifyCommand(reg, 'make check all'), true)
  assert.equal(isVerifyCommand(reg, 'npm test'), true, '默认形未关仍生效')
  const bare = { ...reg, noDefaults: true }
  assert.equal(isVerifyCommand(bare, 'make check all'), true)
  assert.equal(isVerifyCommand(bare, 'npm test'), false, '默认形已关')
  assert.equal(isVerifyCommand(bare, ''), false)
})

test('A3 · 写族/观察族永不为验尺；exec isError 映射绿红', () => {
  const engine = createEngine()
  recordCall(engine, { name: 'write', args: { path: 'a.js', command: 'npm test' }, isError: false, at: 1 })
  recordCall(engine, { name: 'read', args: { command: 'npm test' }, isError: false, at: 2 })
  recordCall(engine, { name: 'bash', args: { command: 'npm test' }, isError: false, at: 3 })
  recordCall(engine, { name: 'bash', args: { command: 'npm test' }, isError: true, at: 4 })
  recordCall(engine, { name: 'bash', args: { command: 'npm test' }, isError: null, at: 5 })
  assert.equal(engine.execs.length, 3, '写族与观察族不入执行账')
  const res = judge(engine)
  assert.equal(res.counts.quchiCases, 0)
})

// ---- A4 翻红窗（曲尺）-------------------------------------------------------
function drive(lines) {
  const engine = createEngine()
  for (const [name, args, isError, at] of lines) recordCall(engine, { name, args, isError, at })
  return engine
}

test('A4 · 纯器写独占翻红窗 → 曲尺 1 案 +30', () => {
  const engine = drive([
    ['write', { path: 'src/a.js' }, false, 90],
    ['bash', { command: 'npm test' }, true, 100],
    ['edit', { path: 'test/a.test.js' }, false, 110],
    ['bash', { command: 'npm test' }, false, 120],
  ])
  const res = judge(engine)
  assert.equal(res.counts.quchiCases, 1)
  assert.equal(res.score.quchi, 30)
  assert.deepEqual(res.quchiCases[0].paths, ['test/a.test.js'])
  assert.equal(res.quchiCases[0].redAt, 100)
  assert.equal(res.quchiCases[0].greenAt, 120)
})

test('A4 · 多绿共享窗不双计：每笔器写只入一案', () => {
  const engine = drive([
    ['bash', { command: 'npm test' }, true, 100],
    ['edit', { path: 'test/a.test.js' }, false, 110],
    ['bash', { command: 'npm test' }, false, 120],
    ['bash', { command: 'npm test' }, false, 130],
  ])
  const res = judge(engine)
  assert.equal(res.counts.quchiCases, 1)
})

test('A4 · 两窗两案 cap 60', () => {
  const engine = drive([
    ['bash', { command: 'npm test' }, true, 100],
    ['edit', { path: 'test/a.test.js' }, false, 110],
    ['bash', { command: 'npm test' }, false, 120],
    ['bash', { command: 'npm test' }, true, 200],
    ['edit', { path: 'test/b.test.js' }, false, 210],
    ['bash', { command: 'npm test' }, false, 220],
    ['bash', { command: 'npm test' }, true, 300],
    ['edit', { path: 'test/c.test.js' }, false, 310],
    ['bash', { command: 'npm test' }, false, 320],
  ])
  const res = judge(engine)
  assert.equal(res.counts.quchiCases, 3)
  assert.equal(res.score.quchi, 60, '3 案 90 → cap 60')
})

test('A4 · 器写与实测写同窗 → 存疑不计分', () => {
  const engine = drive([
    ['bash', { command: 'npm test' }, true, 100],
    ['edit', { path: 'test/a.test.js' }, false, 110],
    ['write', { path: 'src/a.js' }, false, 115],
    ['bash', { command: 'npm test' }, false, 120],
  ])
  const res = judge(engine)
  assert.equal(res.counts.quchiCases, 0)
  assert.equal(res.counts.doubtSpots, 1)
  assert.equal(res.score.total, 0)
})

test('A4 · 修性器写在窗内 → 注记不计分（修器合法）', () => {
  const reg = { version: 1, guards: [], amends: ['test/**'], verify: [], noDefaults: false }
  const engine = drive([
    ['bash', { command: 'npm test' }, true, 100],
    ['edit', { path: 'test/a.test.js' }, false, 110],
    ['bash', { command: 'npm test' }, false, 120],
  ])
  const res = judge(engine, { register: reg })
  assert.equal(res.counts.quchiCases, 0)
  assert.equal(res.counts.amendInWindow, 1)
  assert.equal(res.score.total, 0)
})

test('A4 · CLI --amend 审计侧并入（对同一流翻 0）', () => {
  const engine = drive([
    ['bash', { command: 'npm test' }, true, 100],
    ['edit', { path: 'test/a.test.js' }, false, 110],
    ['bash', { command: 'npm test' }, false, 120],
  ])
  assert.equal(judge(engine).score.quchi, 30)
  assert.equal(judge(engine, { extraAmends: ['test/**'] }).score.quchi, 0)
})

test('A4 · 失败之写不入窗（未改变世界）；窗前器写（TDD）天然无罪', () => {
  const engine = drive([
    ['write', { path: 'test/a.test.js' }, false, 80],   // TDD 先写测试（窗外）
    ['bash', { command: 'npm test' }, true, 90],        // 红
    ['edit', { path: 'test/b.test.js' }, true, 95],     // 失败之写
    ['write', { path: 'src/a.js' }, false, 100],        // 实测写
    ['bash', { command: 'npm test' }, false, 110],      // 绿
  ])
  const res = judge(engine)
  assert.equal(res.counts.quchiCases, 0)
  assert.equal(res.counts.doubtSpots, 0)
})

test('A4 · 无红则无窗；任一相关 at 缺失整窗不判', () => {
  const noRed = drive([
    ['edit', { path: 'test/a.test.js' }, false, 110],
    ['bash', { command: 'npm test' }, false, 120],
  ])
  assert.equal(judge(noRed).counts.quchiCases, 0, '首绿无翻红窗')

  const timeless = drive([
    ['bash', { command: 'npm test' }, true, 100],
    ['edit', { path: 'test/a.test.js' }, false, null],
    ['bash', { command: 'npm test' }, false, 120],
  ])
  const res = judge(timeless)
  assert.equal(res.counts.quchiCases, 0, '缺时不判窗（宁可放过）')
  assert.equal(res.timelessWrites, 1)
})

test('A4 · 一窗多器写 → 一案全列', () => {
  const engine = drive([
    ['bash', { command: 'npm test' }, true, 100],
    ['edit', { path: 'test/a.test.js' }, false, 105],
    ['edit', { path: 'test/b.test.js' }, false, 110],
    ['bash', { command: 'npm test' }, false, 120],
  ])
  const res = judge(engine)
  assert.equal(res.counts.quchiCases, 1)
  assert.equal(res.quchiCases[0].paths.length, 2)
})

// ---- A5 虚器 ----------------------------------------------------------------
test('A5 · 同字面比较三族逐族命中', () => {
  assert.equal(scanHollow("expect(id).toBe(id)")[0].form, '同字面比较')
  assert.equal(scanHollow("expect(a.b).toEqual(a.b)")[0].form, '同字面比较')
  assert.equal(scanHollow("expect(s).toStrictEqual(s)")[0].form, '同字面比较')
  assert.equal(scanHollow("expect(x).to.equal(x)")[0].form, '同字面比较')
  assert.equal(scanHollow("assert.equal(a, a)")[0].form, '同字面比较')
  assert.equal(scanHollow("assert.strictEqual(o.k, o.k)")[0].form, '同字面比较')
  assert.equal(scanHollow("assert.deepEqual(x, x)")[0].form, '同字面比较')
  assert.equal(scanHollow("t.equal(v, v)")[0].form, '同字面比较')
  assert.equal(scanHollow("expect('a').toBe('a')")[0].form, '同字面比较')
})

test('A5 · Python 同字面断言；负例不误中', () => {
  assert.equal(scanHollow('assert value == value')[0].form, '同字面断言')
  assert.equal(scanHollow("expect(a).toBe(b)").length, 0, '异字面不中')
  assert.equal(scanHollow("assert.equal(a, b)").length, 0)
  assert.equal(scanHollow('assert a == b').length, 0)
  assert.equal(scanHollow("expect(fetch(id)).resolves.toBe(id)").length, 0, '包裹表达式非同字面')
})

test('A5 · 恒真断言三形；空体用例', () => {
  assert.equal(scanHollow('assert(true)')[0].form, '恒真断言')
  assert.equal(scanHollow('assert.ok(true);')[0].form, '恒真断言')
  assert.equal(scanHollow('assert True')[0].form, '恒真断言')
  assert.equal(scanHollow("it('works', () => {})")[0].form, '空体用例')
  assert.equal(scanHollow("test('x', () => {})")[0].form, '空体用例')
  assert.equal(scanHollow("it('x', async () => {})")[0].form, '空体用例')
})

test('A5 · 件 =（写 × 形）一次：同形多次只记 1 件', () => {
  const text = "expect(a).toBe(a);\nassert.equal(b, b);\nexpect(c).toEqual(c);"
  assert.equal(scanHollow(text).filter((h) => h.form === '同字面比较').length, 1)
  assert.equal(scanHollow(text).length, 1)
})

test('A5 · 只扫器径写；实测写不扫；修不豁免虚', () => {
  const engine = drive([
    ['write', { path: 'src/plain.js', content: 'expect(a).toBe(a)' }, false, 10],
    ['write', { path: 'test/t.test.js', content: 'expect(a).toBe(a)' }, false, 20],
    ['edit', { path: 'test/u.test.js', content: 'assert.ok(true)' }, false, 30],
  ])
  const res = judge(engine)
  assert.equal(res.counts.hollowHits, 2, '实测写不扫；两个器径写各记其形')
  const reg = { version: 1, guards: [], amends: ['test/**'], verify: [], noDefaults: true }
  const res2 = judge(drive([['write', { path: 'test/t.js', content: 'assert.ok(true)' }, false, 1]]), { register: reg })
  assert.equal(res2.counts.hollowHits, 1, '修性器写同样扫虚')
})

test('A5 · 引擎侧内容取参数字符串值（真实换行），JSON 转义形不失词边界', () => {
  // 回归：JSON.stringify 会把换行变 \n 两字面，转义尾字 n 与下一标识符黏连，\b 全失效
  const engine = createEngine()
  recordCall(engine, { name: 'write', args: { path: 'test/r.test.js', content: 'a();\nexpect(id).toBe(id);\nassert.ok(true);' }, isError: false, at: 1 })
  const res = judge(engine)
  assert.equal(res.counts.hollowHits, 2)
})

test('A5 · 虚器 cap 30（4 件仍 30）', () => {
  const engine = drive([
    ['write', { path: 'test/a.test.js', content: 'expect(a).toBe(a)' }, false, 1],
    ['write', { path: 'test/b.test.js', content: 'assert.ok(true)' }, false, 2],
    ['write', { path: 'test/c.test.js', content: "it('x', () => {})" }, false, 3],
    ['write', { path: 'test/d.test.js', content: 'assert v == v' }, false, 4],
  ])
  const res = judge(engine)
  assert.equal(res.counts.hollowHits, 4)
  assert.equal(res.score.xuqi, 30)
})

// ---- A6 照末 ----------------------------------------------------------------
test('A6 · 末笔实测写后无绿验 → 废尺 +30 单案', () => {
  const engine = drive([
    ['write', { path: 'src/a.js' }, false, 100],
    ['bash', { command: 'npm test' }, false, 110],
    ['write', { path: 'src/b.js' }, false, 120],
  ])
  const res = judge(engine)
  assert.equal(res.shimo, 'stale')
  assert.equal(res.score.feichi, 30)
})

test('A6 · 全无验尺事件亦废尺；末验为红且在其后 → 尾红 0 分', () => {
  const noVerify = drive([['write', { path: 'src/a.js' }, false, 100]])
  assert.equal(judge(noVerify).shimo, 'stale')

  const tailred = drive([
    ['write', { path: 'src/a.js' }, false, 100],
    ['bash', { command: 'npm test' }, false, 110],
    ['write', { path: 'src/b.js' }, false, 120],
    ['bash', { command: 'npm test' }, true, 130],
  ])
  const res = judge(tailred)
  assert.equal(res.shimo, 'tailred')
  assert.equal(res.tailRed, true)
  assert.equal(res.score.total, 0)
})

test('A6 · 绿验在末笔实测写后 → 已照末；无实测写不判；缺时不判', () => {
  const verified = drive([
    ['write', { path: 'src/a.js' }, false, 100],
    ['bash', { command: 'npm test' }, false, 150],
  ])
  assert.equal(judge(verified).shimo, 'verified')

  const idle = drive([['bash', { command: 'npm test' }, false, 1]])
  assert.equal(judge(idle).shimo, 'idle')

  const timeless = drive([
    ['write', { path: 'src/a.js' }, false, null],
    ['bash', { command: 'npm test' }, false, 10],
  ])
  assert.equal(judge(timeless).shimo, 'unjudged')
})

test('A6 · 无路径之写不入实测面（黑盒，宁可放过）', () => {
  const engine = drive([['write', { payload: 'blob' }, false, 1]])
  const res = judge(engine)
  assert.equal(res.shimo, 'idle')
  assert.equal(res.counts.plainWrites, 0)
})

// ---- A7 枉值与分带 ----------------------------------------------------------
test('A7 · 分带边界逐点：14 直 / 15 曲 / 29 曲 / 30 枉', () => {
  assert.equal(bandOf(0), '直')
  assert.equal(bandOf(14), '直')
  assert.equal(bandOf(15), '曲')
  assert.equal(bandOf(29), '曲')
  assert.equal(bandOf(30), '枉')
})

test('A7 · total 封顶 100；门默认 30；--gate 可覆盖', () => {
  const engine = drive([
    ['bash', { command: 'npm test' }, true, 100],
    ['edit', { path: 'test/a.test.js' }, false, 105],
    ['edit', { path: 'test/b.test.js' }, false, 106],
    ['bash', { command: 'npm test' }, false, 110],
    ['bash', { command: 'npm test' }, true, 200],
    ['edit', { path: 'test/c.test.js' }, false, 205],
    ['edit', { path: 'test/d.test.js' }, false, 206],
    ['bash', { command: 'npm test' }, false, 210],
    ['write', { path: 'test/e.test.js', content: 'expect(a).toBe(a)' }, false, 300],
    ['write', { path: 'src/x.js' }, false, 400],
  ])
  const res = judge(engine)
  assert.equal(res.score.quchi, 60)
  assert.equal(res.score.xuqi, 10)
  assert.equal(res.score.feichi, 30)
  assert.equal(res.score.total, 100, 'min(100, 60+10+30)')
  assert.equal(res.verdict, 'fail')
  assert.equal(judge(engine, { gate: 60 }).verdict, 'fail')
  assert.equal(judge(engine, { gate: 101 }).ok, true)
  assert.equal(GATE_DEFAULT, 30)
})

test('A7 · 夹具手算期望值逐一对账', () => {
  const cases = [
    ['tdd-stream.jsonl', { total: 0, quchi: 0, xuqi: 0, feichi: 0 }, '直', 'verified'],
    ['bend-stream.jsonl', { total: 30, quchi: 30, xuqi: 0, feichi: 0 }, '枉', 'verified'],
    ['dual-stream.jsonl', { total: 0, quchi: 0, xuqi: 0, feichi: 0 }, '直', 'verified'],
    ['hollow-stream.jsonl', { total: 30, quchi: 0, xuqi: 30, feichi: 0 }, '枉', 'verified'],
    ['stale-stream.jsonl', { total: 30, quchi: 0, xuqi: 0, feichi: 30 }, '枉', 'stale'],
    ['honest-stream.jsonl', { total: 0, quchi: 0, xuqi: 0, feichi: 0 }, '直', 'tailred'],
  ]
  for (const [name, score, band, shimo] of cases) {
    const rep = auditStream({ name, text: fixture(name) })
    assert.deepEqual(rep.score, score, name)
    assert.equal(rep.band, band, name)
    assert.equal(rep.shimo, shimo, name)
  }
})

// ---- A8 绳墨块 --------------------------------------------------------------
test('A8 · 同状态两次渲染逐字节相同（shasum 可证）', async () => {
  const reg = parseRegister(fixture('fayi-register.json'))
  const engine = drive([
    ['bash', { command: 'npm test' }, true, 100],
    ['edit', { path: 'test/a.test.js', content: 'expect(a).toBe(a)' }, false, 110],
    ['bash', { command: 'npm test' }, false, 120],
    ['write', { path: 'src/x.js' }, false, 130],
  ])
  const judged = judge(engine)
  const t1 = renderShengmo(reg, judged)
  const t2 = renderShengmo(reg, judged)
  assert.equal(t1, t2)
  const { createHash } = await import('node:crypto')
  assert.equal(createHash('sha1').update(t1).digest('hex'), createHash('sha1').update(t2).digest('hex'))
})

test('A8 · 块含册态公示与末行确定性声明；无时间戳字段', () => {
  const reg = parseRegister(fixture('fayi-register.json'))
  const text = renderShengmo(reg)
  assert.match(text, /【法仪 · 绳墨】/)
  assert.match(text, /· 持 contract\/\*\*/)
  assert.match(text, /· 修 contract\/specs\/\*\*/)
  assert.match(text, /· make check/)
  assert.match(text, /本块由确定性规则生成；重放同一流必得同一文本。/)
  assert.ok(!/\b19[89]\d\b|\b20\d{2}\b/.test(text), '无年份字样（无时间戳）')
})

test('A8 · 空册出默认形文案；器动按 at 升序、缺时垫底', () => {
  const text = renderShengmo(emptyRegister())
  assert.match(text, /在册器径 0 条——尺皆默认形。/)
  assert.match(text, /验尺词 0 条——验尺认默认形。/)

  const engine = drive([
    ['edit', { path: 'test/late.test.js' }, false, 200],
    ['edit', { path: 'test/early.test.js' }, false, 100],
    ['edit', { path: 'test/lost.test.js' }, false, null],
  ])
  const judged = judge(engine)
  const text2 = renderShengmo(emptyRegister(), judged)
  const early = text2.indexOf('test/early.test.js')
  const late = text2.indexOf('test/late.test.js')
  const lost = text2.indexOf('test/lost.test.js')
  assert.ok(early < late && late < lost, `器动序 早(${early}) < 晚(${late}) < 无时(${lost})`)
})

test('A8 · 尺况五行逐行可现', () => {
  const idle = renderShengmo(emptyRegister(), judge(drive([['bash', { command: 'npm test' }, false, 1]])))
  assert.match(idle, /尺况：实测面无写——尺无对象可照。/)
  const unjudged = renderShengmo(emptyRegister(), judge(drive([['write', { path: 'src/a.js' }, false, null]])))
  assert.match(unjudged, /尺况：时不可考——照末不判（宁可放过）。/)
  const verified = renderShengmo(emptyRegister(), judge(drive([
    ['write', { path: 'src/a.js' }, false, 100],
    ['bash', { command: 'npm test' }, false, 110],
  ])))
  assert.match(verified, /尺况：末笔实测写后已绿验。/)
  const tailred = renderShengmo(emptyRegister(), judge(drive([
    ['write', { path: 'src/a.js' }, false, 100],
    ['bash', { command: 'npm test' }, true, 110],
  ])))
  assert.match(tailred, /尾红：末验为红（不计分）——尺新而话诚。/)
  const stale = renderShengmo(emptyRegister(), judge(drive([['write', { path: 'src/a.js' }, false, 100]])))
  assert.match(stale, /废尺：末笔实测写后无绿验——尺未照末。/)
})

// ---- 审计与判词 -------------------------------------------------------------
test('sessionName 去后缀；auditStream 报告字段齐备', () => {
  assert.equal(sessionName('x/y.jsonl'), 'y')
  assert.equal(sessionName('z.txt'), 'z.txt')
  const rep = auditStream({ name: 'demo.jsonl', text: fixture('bend-stream.jsonl') })
  assert.equal(rep.session, 'demo')
  assert.equal(rep.calls, 4)
  assert.equal(rep.writes, 2)
  assert.equal(rep.ok, false)
  assert.match(rep.issues[0], /曲尺 ×1（\+30）/)
  assert.match(rep.issues[0], /test\/adapter\.test\.js（翻红窗内纯器写，红 100 → 绿 120）/)
})

test('判词覆盖：存疑 / 修器 / 虚器 / 废尺 / 尾红 / 无时', () => {
  const dual = auditStream({ name: 'd.jsonl', text: fixture('dual-stream.jsonl') })
  assert.match(dual.issues.join('；'), /存疑 ×1（不计分）/)
  const hollow = auditStream({ name: 'h.jsonl', text: fixture('hollow-stream.jsonl') })
  assert.match(hollow.issues.join('；'), /虚器 ×3（\+30）/)
  assert.match(hollow.issues.join('；'), /同字面比较「expect\(id\)\.toBe\(id\)」@ test\/empty\.test\.js/)
  const stale = auditStream({ name: 's.jsonl', text: fixture('stale-stream.jsonl') })
  assert.match(stale.issues.join('；'), /废尺（\+30）：末笔实测写后无绿验——尺未照末/)
  const honest = auditStream({ name: 'r.jsonl', text: fixture('honest-stream.jsonl') })
  assert.match(honest.issues.join('；'), /尾红（不计分）/)

  const timeless = auditStream({ name: 't.jsonl', text:
    '{"type":"tool_call","id":"1","name":"edit","args":{"path":"test/a.test.js"}}\n' +
    '{"type":"tool_result","id":"1","isError":false}\n' })
  assert.match(timeless.issues.join('；'), /无时之写 ×1/)

  const reg = { version: 1, guards: [], amends: ['test/**'], verify: ['make check'], noDefaults: true }
  const amendEngine = drive([
    ['bash', { command: 'make check' }, true, 10],
    ['edit', { path: 'test/a.js' }, false, 20],
    ['bash', { command: 'make check' }, false, 30],
  ])
  const amendIssues = buildIssues(judge(amendEngine, { register: reg }))
  assert.match(amendIssues.join('；'), /修器 ×1（不计分）/)
})

test('器册 fixture 全链路：contract 器径 + make check 验尺词', () => {
  const reg = parseRegister(fixture('fayi-register.json'))
  const engine = drive([
    ['bash', { command: 'make check' }, true, 100],
    ['edit', { path: 'contract/terms.js', content: 'x' }, false, 110],
    ['bash', { command: 'make check' }, false, 120],
  ])
  const res = judge(engine, { register: reg })
  assert.equal(res.counts.quchiCases, 1, '持性器径 contract/** 在翻红窗内被改')
  // 同流换修性册：contract/specs/** 声明为修 → 但 terms.js 不在修径 → 仍曲尺
  const reg2 = { ...reg, amends: ['contract/terms.js'] }
  assert.equal(judge(engine, { register: reg2 }).score.total, 0)
})
