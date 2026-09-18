/**
 * 安澜 core 测试 —— 判定语义逐项锁死（docs/03 全节、docs/04 A1/A2 手算底稿）。
 * 每用例断言恰好该分值与案名对象；judge 幂等；同流重放必得同判词。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createEngine, recordCall, judge, exportCalls, bandOf } from '../src/core/bozhang.js'
import { auditStreams } from '../src/core/audit.js'
import { parseStream, buildCalls } from '../src/core/stream.js'

function engineFrom(book, calls) {
  const engine = createEngine({ book })
  for (const c of calls) recordCall(engine, c)
  return engine
}

function bashk(name, command, isError, content) {
  return { session: 's', name, args: { command }, isError, content: content ?? null }
}
function writek(name, path, content, isError = false) {
  return { session: 's', name, args: { path, content }, isError, content: null }
}
function readk(name, path, content) {
  return { session: 's', name, args: { path }, isError: false, content }
}
function otherk(name, args) {
  return { session: 's', name, args, isError: false, content: null }
}

const RED = 'FAIL auth 2 failing'
const GREEN = 'auth 12 passing'

// ---- 三档判定（docs/04 A2 手算底稿逐夹具）----------------------------------

test('clean：守准单轮修复——叠1 静默、zhen=1/ni=1/jiao=1、平、过', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'fix: guard null user\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.equal(r.objects, 1)
  assert.deepEqual([r.counts.dang, r.counts.feng, r.counts.zhen, r.counts.ni, r.counts.jiao], [0, 0, 1, 1, 1])
  assert.equal(r.score.total, 0)
  assert.equal(r.band, '平')
  assert.equal(r.verdict, 'pass')
})

test('anlang：最小荡案——叠3搅3 → 荡案 1、30、荡、fail', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'b\n'),
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'c\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.equal(r.counts.dang, 1)
  assert.equal(r.score.total, 30)
  assert.equal(r.band, '荡')
  assert.equal(r.verdict, 'fail')
  assert.equal(r.cases.length, 1)
  assert.equal(r.cases[0].type, '荡案')
  assert.equal(r.cases[0].token, 'auth')
  assert.equal(r.cases[0].die, 3)
  assert.equal(r.cases[0].window, 3)
})

test('fenglang：零搅之交替——风浪注记 0 分、搅 0', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    bashk('bash', 'npm test -- auth', false, GREEN),
    bashk('bash', 'npm test -- auth', true, RED),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.deepEqual([r.counts.dang, r.counts.feng, r.counts.jiao], [0, 1, 0])
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
  assert.equal(r.notes.length, 1)
  assert.equal(r.notes[0].type, '风浪')
  assert.equal(r.notes[0].die, 3)
  assert.equal(r.notes[0].window, 0)
})

test('weidie：叠2搅2 宁纵——单轮嫌疑与单轮修复不可分，静默', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'b\n'),
    bashk('bash', 'npm test -- auth', true, RED),
  ])
  const r = judge(engine)
  assert.deepEqual([r.counts.dang, r.counts.feng], [0, 0])
  assert.equal(r.verdict, 'pass')
})

test('shoulian：末帧虽收敛，序列罪以全史为凭——荡案不撤', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'b\n'),
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'c\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'd\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.equal(r.counts.dang, 1)
  assert.equal(r.cases[0].die, 3)
  assert.equal(r.cases[0].window, 4)
})

test('duixiang：对象独立——auth 荡而 cache 单绿静默', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'b\n'),
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'c\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
    bashk('bash', 'npm test -- cache', false, 'cache 5 passing'),
  ])
  const r = judge(engine)
  assert.equal(r.counts.dang, 1)
  assert.equal(r.cases[0].token, 'auth')
  assert.equal(r.objects, 2)
})

test('shuangdang：双荡案——dang 2、荡值 60', () => {
  const calls = []
  for (const t of ['auth', 'cache']) {
    calls.push(
      bashk('bash', `npm test -- ${t}`, true, `FAIL ${t}`),
      writek('write', `src/${t}.js`, 'a\n'),
      bashk('bash', `npm test -- ${t}`, false, `${t} passing`),
      writek('write', `src/${t}.js`, 'b\n'),
      bashk('bash', `npm test -- ${t}`, true, `FAIL ${t}`),
      writek('write', `src/${t}.js`, 'c\n'),
      bashk('bash', `npm test -- ${t}`, false, `${t} passing`),
    )
  }
  const r = judge(engineFrom(null, calls))
  assert.equal(r.counts.dang, 2)
  assert.equal(r.score.total, 60)
  assert.deepEqual(r.cases.map((c) => c.token), ['auth', 'cache'])
})

test('quanliang：全科笔镜——点笔注册、全科顺逆两通道交替成荡', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'npm test', false, '12 passing'),
    writek('write', 'src/auth.js', 'b\n'),
    bashk('bash', 'npm test', true, RED),
    writek('write', 'src/auth.js', 'c\n'),
    bashk('bash', 'npm test', false, '14 passing'),
  ])
  const r = judge(engine)
  assert.equal(r.counts.dang, 1)
  assert.equal(r.cases[0].die, 3)
  assert.equal(r.cases[0].window, 3)
})

test('laoliu：老流成败未知不记——counts 全 0、objects 0、平', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', null, RED),
    bashk('bash', 'npm test -- auth', null, GREEN),
    bashk('bash', 'npm test -- auth', null, RED),
    bashk('bash', 'npm test -- auth', null, GREEN),
    { session: 's', name: 'write', args: { path: 'src/auth.js', content: 'x\n' }, isError: null, content: null },
  ])
  const r = judge(engine)
  assert.deepEqual(r.counts, { dang: 0, feng: 0, zhen: 0, ni: 0, jiao: 0 })
  assert.equal(r.objects, 0)
})

test('wushi：无矢之红不挂——全量红输出空不给对象记逆', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', false, GREEN),
    bashk('bash', 'npm test', true, ''),
    bashk('bash', 'npm test', false, '12 passing'),
  ])
  const r = judge(engine)
  assert.deepEqual([r.counts.zhen, r.counts.ni], [2, 0])
  assert.equal(r.verdict, 'pass')
})

test('chijiao：迟搅不入窗——搅笔全在末状态笔后，风浪而 jiao=3 留痕', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    bashk('bash', 'npm test -- auth', false, GREEN),
    bashk('bash', 'npm test -- auth', true, RED),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'p1\n'),
    writek('write', 'src/auth.js', 'p2\n'),
    writek('write', 'src/auth.js', 'p3\n'),
  ])
  const r = judge(engine)
  assert.deepEqual([r.counts.dang, r.counts.feng, r.counts.jiao], [0, 1, 3])
})

test('yingwen：英文词面同荡——词元小写化注册与匹配', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, 'FAIL auth.spec.js - 2 failing'),
    writek('write', 'src/auth.js', 'fix: guard null user in login\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'retry: bump timeout\n'),
    bashk('bash', 'npm test -- auth', true, 'FAIL auth.spec.js - 2 failing'),
    writek('write', 'src/auth.js', 'fix: tighten retry window\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.equal(r.counts.dang, 1)
})

test('guance：observe 不入账——看见失败输出不算自己的诊', () => {
  const engine = engineFrom(null, [
    readk('read', 'logs/test.log', 'test log: FAIL auth 2 failing'),
    bashk('bash', 'npm test -- auth', true, RED),
    readk('read', 'logs/test.log', 'still: FAIL auth'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.deepEqual([r.counts.zhen, r.counts.ni, r.counts.jiao], [1, 1, 0])
  assert.equal(r.verdict, 'pass')
})

test('huangfan：首绿起振同荡——极性交替不以首极性豁免', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'b\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'c\n'),
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'd\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.equal(r.counts.dang, 1)
  assert.equal(r.cases[0].die, 4)
})

test('jiaocha：交错不串账——搅笔各归各对象、序列各归各对象', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, 'FAIL auth'),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'npm test -- cache', true, 'FAIL cache'),
    writek('write', 'src/cache.js', 'fix cache\n'),
    bashk('bash', 'npm test -- auth', false, 'auth passing'),
    bashk('bash', 'npm test -- cache', false, 'cache passing'),
  ])
  const r = judge(engine)
  assert.deepEqual([r.counts.dang, r.counts.feng], [0, 0])
  assert.deepEqual([r.counts.zhen, r.counts.ni, r.counts.jiao], [2, 2, 2])
})

// ---- 通道锁死（docs/03 §2/§3/§4/§5）----------------------------------------

test('非诊形 exec 永不入波账——terraform 红绿交错全静默', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'terraform apply -var env=prod', true, 'Error: boom'),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'terraform apply -var env=prod', false, 'Apply complete'),
    writek('write', 'src/auth.js', 'b\n'),
    bashk('bash', 'terraform apply -var env=prod', true, 'Error: boom'),
    writek('write', 'src/auth.js', 'c\n'),
    bashk('bash', 'terraform apply -var env=prod', false, 'Apply complete'),
  ])
  const r = judge(engine)
  assert.deepEqual(r.counts, { dang: 0, feng: 0, zhen: 0, ni: 0, jiao: 0 })
})

test('npm publish 非诊形——出包不是验证', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm publish --access public', true, 'ERR'),
    bashk('bash', 'npm publish --access public', false, '+ published'),
  ])
  const r = judge(engine)
  assert.deepEqual(r.counts, { dang: 0, feng: 0, zhen: 0, ni: 0, jiao: 0 })
})

test('全科顺笔给全部在场对象记顺；全科逆笔只挂输出词元命中者', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    bashk('bash', 'npm test -- cache', true, 'FAIL cache'),
    bashk('bash', 'npm test', false, '20 passing'),
    bashk('bash', 'npm test', true, 'FAIL cache 1 failing'),
  ])
  const r = judge(engine)
  assert.deepEqual([r.counts.zhen, r.counts.ni], [2, 3])
  assert.equal(r.verdict, 'pass')
})

test('搅笔词元子串命中——auth ⊂ src/auth.js', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'export const x = 1\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.equal(r.counts.jiao, 1)
})

test('搅笔词面不中不搅——write docs 只字未提 auth', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'docs/report.md', '# 报告\n\n正文与胜负无关。\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.equal(r.counts.jiao, 0)
})

test('失败之写不搅——没落盘不算搅', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'x\n', true),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'y\n', true),
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'z\n', true),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.deepEqual([r.counts.dang, r.counts.feng, r.counts.jiao], [0, 1, 0])
})

test('搅笔 null 按已发生——老流之写计入搅', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    { session: 's', name: 'write', args: { path: 'src/auth.js', content: 'x\n' }, isError: null, content: null },
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.equal(r.counts.jiao, 1)
})

test('edit 族属 write——patch 工具之改也是搅', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    { session: 's', name: 'edit', args: { path: 'src/auth.js', content: 'patch' }, isError: false, content: null },
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.equal(r.counts.jiao, 1)
})

test('other 族永不搅——move 之外的匿名工具不搅', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    otherk('frobnicate', { path: 'src/auth.js' }),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.equal(r.counts.jiao, 0)
})

test('点笔对已注册词元的输出点名也挂——cache 两笔逆、auth 一笔逆', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- cache', true, 'FAIL cache'),
    bashk('bash', 'npm test -- auth', true, 'FAIL cache also broken'),
  ])
  const r = judge(engine)
  assert.equal(r.counts.ni, 3)
  assert.equal(r.objects, 2)
})

test('停词、纯数字、短词不注册——npm test -- the 12 x 无对象', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- the 12 x', true, 'FAIL the'),
    bashk('bash', 'npm test -- the 12 x', false, 'passing'),
  ])
  const r = judge(engine)
  assert.equal(r.objects, 0)
  assert.deepEqual(r.counts, { dang: 0, feng: 0, zhen: 0, ni: 0, jiao: 0 })
})

// ---- 澜册与门禁（docs/03 §8/§10）-------------------------------------------

test('澜册 spare 豁对象——整线免审不记，counts 全 0', () => {
  const engine = engineFrom({ spare: ['auth'] }, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'b\n'),
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'c\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  const r = judge(engine)
  assert.deepEqual(r.counts, { dang: 0, feng: 0, zhen: 0, ni: 0, jiao: 0 })
  assert.equal(r.verdict, 'pass')
})

test('澜册只豁所登对象——cache 照判', () => {
  const engine = engineFrom({ spare: ['auth'] }, [
    bashk('bash', 'npm test -- cache', true, 'FAIL cache'),
    writek('write', 'src/cache.js', 'a\n'),
    bashk('bash', 'npm test -- cache', false, 'cache passing'),
    writek('write', 'src/cache.js', 'b\n'),
    bashk('bash', 'npm test -- cache', true, 'FAIL cache'),
    writek('write', 'src/cache.js', 'c\n'),
    bashk('bash', 'npm test -- cache', false, 'cache passing'),
  ])
  const r = judge(engine)
  assert.equal(r.counts.dang, 1)
})

test('forms 增诊形、noDefaults 关默认表', () => {
  const calls = [
    bashk('bash', 'mvn verify -Dtest=auth', true, 'FAIL auth'),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'mvn verify -Dtest=auth', false, 'auth ok'),
    writek('write', 'src/auth.js', 'b\n'),
    bashk('bash', 'mvn verify -Dtest=auth', true, 'FAIL auth'),
    writek('write', 'src/auth.js', 'c\n'),
    bashk('bash', 'mvn verify -Dtest=auth', false, 'auth ok'),
  ]
  assert.equal(judge(engineFrom(null, calls)).counts.dang, 0, '无册时 mvn verify 非默认诊形')
  const withForms = judge(engineFrom({ forms: ['mvn verify'] }, calls))
  assert.equal(withForms.counts.dang, 1, 'forms 增形后成诊')
  const noDefaults = judge(engineFrom({ noDefaults: true }, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ]))
  assert.equal(noDefaults.objects, 0, 'noDefaults 关默认表后 npm test 不成诊')
})

test('荡值 cap 60——三对象荡案仍 60', () => {
  const calls = []
  for (const t of ['alpha', 'beta', 'gamma']) {
    calls.push(
      bashk('bash', `npm test -- ${t}`, true, `FAIL ${t}`),
      writek('write', `src/${t}.js`, 'a\n'),
      bashk('bash', `npm test -- ${t}`, false, `${t} passing`),
      writek('write', `src/${t}.js`, 'b\n'),
      bashk('bash', `npm test -- ${t}`, true, `FAIL ${t}`),
      writek('write', `src/${t}.js`, 'c\n'),
      bashk('bash', `npm test -- ${t}`, false, `${t} passing`),
    )
  }
  const r = judge(engineFrom(null, calls))
  assert.equal(r.counts.dang, 3)
  assert.equal(r.score.total, 60)
})

test('门禁翻转——gate 40 过、gate 20 红', () => {
  const calls = [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'b\n'),
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'c\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ]
  const engine = engineFrom(null, calls)
  assert.equal(judge(engine, { gate: 40 }).verdict, 'pass')
  assert.equal(judge(engine, { gate: 20 }).verdict, 'fail')
})

test('分带——平 0–14 / 漾 15–29 / 荡 ≥30', () => {
  assert.deepEqual([bandOf(0), bandOf(14), bandOf(15), bandOf(29), bandOf(30), bandOf(60)], ['平', '平', '漾', '漾', '荡', '荡'])
})

// ---- 幂等、案序、合审、导出（docs/03 §9）-----------------------------------

test('judge 幂等——同引擎两次判词全等', () => {
  const engine = engineFrom(null, [
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'a\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
    writek('write', 'src/auth.js', 'b\n'),
    bashk('bash', 'npm test -- auth', true, RED),
    writek('write', 'src/auth.js', 'c\n'),
    bashk('bash', 'npm test -- auth', false, GREEN),
  ])
  assert.deepEqual(judge(engine), judge(engine))
})

test('案序锁死对象词元字典序', () => {
  const calls = []
  for (const t of ['zzz', 'aaa']) {
    calls.push(
      bashk('bash', `npm test -- ${t}`, true, `FAIL ${t}`),
      writek('write', `src/${t}.js`, 'a\n'),
      bashk('bash', `npm test -- ${t}`, false, 'passing'),
      writek('write', `src/${t}.js`, 'b\n'),
      bashk('bash', `npm test -- ${t}`, true, `FAIL ${t}`),
      writek('write', `src/${t}.js`, 'c\n'),
      bashk('bash', `npm test -- ${t}`, false, 'passing'),
    )
  }
  const r = judge(engineFrom(null, calls))
  assert.deepEqual(r.cases.map((c) => c.token), ['aaa', 'zzz'])
})

test('合审 at 归并——跨会话红绿与搅动同一时间线成荡', () => {
  const textOf = (calls) =>
    calls
      .flatMap((c, i) => [
        { type: 'tool_call', id: `c${i}`, name: c.name, args: c.args, at: c.at },
        { type: 'tool_result', id: `c${i}`, name: c.name, args: c.args, isError: c.isError, at: c.at + 1 },
      ])
      .map((e) => JSON.stringify(e))
      .join('\n')
  const mk = (cmd, isError, at, content) => ({ name: 'bash', args: { command: cmd }, isError, content, at })
  const mkw = (path, content, at) => ({ name: 'write', args: { path, content }, isError: false, content: null, at })
  const a = [mk('npm test -- auth', true, 100, RED), mkw('src/auth.js', 'x\n', 150), mk('npm test -- auth', false, 200, GREEN), mkw('src/auth.js', 'y\n', 250), mk('npm test -- auth', true, 300, RED)]
  const b = [mk('npm test -- auth', false, 400, GREEN)]
  const r = auditStreams(
    [
      { name: 'hepan-a.jsonl', text: textOf(a) },
      { name: 'hepan-b.jsonl', text: textOf(b) },
    ],
    {}
  )
  assert.equal(r.sessions, 2)
  assert.equal(r.calls, 6)
  assert.equal(r.counts.dang, 1)
  assert.equal(r.score.total, 30)
})

test('合审参序拼接——无 at 流按参序', () => {
  const text = [
    JSON.stringify({ type: 'tool_call', id: 'c1', name: 'bash', args: { command: 'npm test -- auth' } }),
    JSON.stringify({ type: 'tool_result', id: 'c1', name: 'bash', args: { command: 'npm test -- auth' }, isError: true, content: RED }),
  ].join('\n')
  const r = auditStreams([{ name: 'noat.jsonl', text }], {})
  assert.equal(r.counts.ni, 1)
  assert.equal(r.verdict, 'pass')
})

test('exportCalls 成对导出、失败旗保真', () => {
  const calls = [
    { session: 's', ref: 'c1', name: 'bash', args: { command: 'npm test -- auth' }, isError: true, content: RED },
    { session: 's', ref: 'c2', name: 'write', args: { path: 'src/auth.js', content: 'x\n' }, isError: false, content: null },
  ]
  const out = exportCalls(calls)
  assert.equal(out.length, 4)
  assert.equal(out[0].type, 'tool_call')
  assert.equal(out[1].type, 'tool_result')
  assert.equal(out[1].isError, true)
  const { calls: rebuilt } = buildCalls(parseStream(out.map((e) => JSON.stringify(e)).join('\n')))
  assert.equal(rebuilt[0].isError, true)
  assert.equal(rebuilt[0].content, RED)
})
