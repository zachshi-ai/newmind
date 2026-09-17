/**
 * CLI 语义测试 —— 复现命令逐字对表（docs/04 A2/A4/A5 锁定）。
 * 每例以子进程跑真实 CLI，断言退出码与输出字段。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const bin = join(root, 'src', 'bin', 'zhixia.js')
const fx = (name) => join(root, 'fixtures', name)

function run(args, { cwd = root } = {}) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })
}

function json(args, opts) {
  const r = run([...args, '--json'], opts)
  return { code: r.status, out: JSON.parse(r.stdout) }
}

test('A2 十七流复现：退出码逐字吻合（0/1/1/0/1/0/0/0/0/1/0/0/0/0/0/1/0）', () => {
  const expect = [
    ['clean-stream.jsonl', 0], ['guailie-stream.jsonl', 1], ['shuangli-stream.jsonl', 1],
    ['zhenglie-stream.jsonl', 0], ['guaizong-stream.jsonl', 1], ['hezong-stream.jsonl', 0],
    ['xiaoshu-stream.jsonl', 0], ['duohe-stream.jsonl', 0], ['daoqi-stream.jsonl', 0],
    ['shuangdao-stream.jsonl', 1], ['quelie-stream.jsonl', 0], ['xiaochang-stream.jsonl', 0],
    ['xianmo-stream.jsonl', 0], ['baishi-stream.jsonl', 0], ['yingwen-stream.jsonl', 1],
    ['gelie-stream.jsonl', 0],
  ]
  for (const [file, code] of expect) {
    const r = run(['audit', fx(file)])
    assert.equal(r.status, code, file)
  }
})

test('clean：counts 全 0、瑕值 0、带「净」、全净行', () => {
  const { code, out } = json(['audit', fx('clean-stream.jsonl')])
  assert.equal(code, 0)
  assert.equal(out.calls, 1)
  assert.deepEqual(out.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 })
  assert.deepEqual(out.score, { lie: 0, zong: 0, dao: 0, total: 0 })
  assert.equal(out.band, '净')
  assert.match(out.issues[0], /卷皆净 ×1 径 1 行/)
})

test('guailie：乖列 1、30、疵、言 5 实 3、指纹掩码', () => {
  const { code, out } = json(['audit', fx('guailie-stream.jsonl')])
  assert.equal(code, 1)
  assert.equal(out.counts.gl, 1)
  assert.deepEqual(out.score, { lie: 30, zong: 0, dao: 0, total: 30 })
  assert.equal(out.band, '疵')
  assert.match(out.issues[0], /乖列：docs\/report\.md:3 言 5 实 3（指纹 [0-9a-f]+）/)
  assert.ok(!out.issues[0].includes('空指针')) // 行原文不进判词
})

test('daoqi：倒期 1、15、瑕、黄牌过门；shuangdao：倒期 2、30、疵、红', () => {
  const a = json(['audit', fx('daoqi-stream.jsonl')])
  assert.equal(a.code, 0)
  assert.equal(a.out.counts.dq, 1)
  assert.equal(a.out.score.total, 15)
  assert.equal(a.out.band, '瑕')
  assert.match(a.out.issues[0], /倒期：docs\/schedule\.md:3 起 2026-09-10 止 2026-09-05（指纹 [0-9a-f]+）/)
  const b = json(['audit', fx('shuangdao-stream.jsonl')])
  assert.equal(b.code, 1)
  assert.equal(b.out.counts.dq, 2)
  assert.equal(b.out.band, '疵')
})

test('guaizong：乖总 1、30、表第 2 列 言 100 和 90', () => {
  const { code, out } = json(['audit', fx('guaizong-stream.jsonl')])
  assert.equal(code, 1)
  assert.equal(out.counts.gz, 1)
  assert.match(out.issues[0], /乖总：docs\/budget\.md:8 表第 2 列 言 100 和 90（指纹 [0-9a-f]+）/)
})

test('quelie：阙列注记 1、0 分过门；xianmo：已磨注记 1', () => {
  const a = json(['audit', fx('quelie-stream.jsonl')])
  assert.equal(a.code, 0)
  assert.equal(a.out.counts.que, 1)
  assert.match(a.out.issues[0], /注记：docs\/report\.md:1 阙列（言 3 无近列）/)
  const b = json(['audit', fx('xianmo-stream.jsonl')])
  assert.equal(b.code, 0)
  assert.equal(b.out.calls, 2)
  assert.equal(b.out.counts.mo, 1)
  assert.match(b.out.issues[0], /注记：docs\/report\.md 已磨（先瑕今净）/)
})

test('mianze 带册 paths 0 过门；无册对照乖列 30 红', () => {
  const a = json(['audit', fx('mianze-stream.jsonl'), '--file', fx('zhixia-book.json')])
  assert.equal(a.code, 0)
  assert.equal(a.out.paths, 0)
  assert.deepEqual(a.out.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 })
  const b = json(['audit', fx('mianze-stream.jsonl')])
  assert.equal(b.code, 1)
  assert.equal(b.out.paths, 1)
  assert.equal(b.out.counts.gl, 1)
})

test('合审两流：2 调用、乖列 1、30 红', () => {
  const { code, out } = json(['audit', fx('guailie-stream.jsonl'), fx('clean-stream.jsonl')])
  assert.equal(code, 1)
  assert.equal(out.calls, 2)
  assert.equal(out.sessions, 2)
  assert.equal(out.counts.gl, 1)
})

test('gate 口径：guailie --gate 40 过门、daoqi --gate 10 翻红', () => {
  const a = json(['audit', fx('guailie-stream.jsonl'), '--gate', '40'])
  assert.equal(a.code, 0)
  assert.equal(a.out.score.total, 30)
  assert.equal(a.out.gate, 40)
  assert.equal(a.out.verdict, 'pass')
  const b = json(['audit', fx('daoqi-stream.jsonl'), '--gate', '10'])
  assert.equal(b.code, 1)
  assert.equal(b.out.score.total, 15)
  assert.equal(b.out.verdict, 'fail')
})

test('坏 JSON 行报行号 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhixia-'))
  const bad = join(dir, 'bad.jsonl')
  writeFileSync(bad, '{"type":"tool_call","id":"a","name":"write"}\n{oops}\n')
  const r = run(['audit', bad])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /第 2 行不是合法 JSON/)
  rmSync(dir, { recursive: true, force: true })
})

test('流缺失 → exit 2；未知旗标 → exit 2；audit 零流 → exit 2', () => {
  const r1 = run(['audit', fx('nope-stream.jsonl')])
  assert.equal(r1.status, 2)
  const r2 = run(['audit', fx('clean-stream.jsonl'), '--wat'])
  assert.equal(r2.status, 2)
  assert.match(r2.stderr, /未知旗标/)
  const r3 = run(['audit'])
  assert.equal(r3.status, 2)
})

test('register 缺 --path → exit 2；自动建册 + 重复登记去重', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhixia-'))
  const cwd = dir
  const r0 = run(['register'], { cwd })
  assert.equal(r0.status, 2)
  const r1 = run(['register', '--path', 'docs/reports/*'], { cwd })
  assert.equal(r1.status, 0)
  assert.match(r1.stdout, /免审已立：docs\/reports\/\*（.*\.zhixia\.json，共 1 处）/)
  const r2 = run(['register', '--path', 'docs/reports/*'], { cwd })
  assert.equal(r2.status, 0)
  const book = JSON.parse(readFileSync(join(dir, '.zhixia.json'), 'utf8'))
  assert.deepEqual(book.excuse, ['docs/reports/*']) // 去重
  rmSync(dir, { recursive: true, force: true })
})

test('register 后 audit 免案生效（cwd 册）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhixia-'))
  const target = join(dir, 'mianze-stream.jsonl')
  writeFileSync(target, readFileSync(fx('mianze-stream.jsonl'), 'utf8'))
  run(['register', '--path', 'docs/reports/*'], { cwd: dir })
  const r = run(['audit', 'mianze-stream.jsonl'], { cwd: dir })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /受审径 0/)
  rmSync(dir, { recursive: true, force: true })
})

test('revoke 无此径 → exit 2；revoke 成功 → 免审已撤', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhixia-'))
  const r1 = run(['revoke', '--path', 'nope/*'], { cwd: dir })
  assert.equal(r1.status, 2) // 册缺失
  run(['register', '--path', 'docs/*'], { cwd: dir })
  const r2 = run(['revoke', '--path', 'other/*'], { cwd: dir })
  assert.equal(r2.status, 2)
  assert.match(r2.stderr, /瑕册无此免审径/)
  const r3 = run(['revoke', '--path', 'docs/*'], { cwd: dir })
  assert.equal(r3.status, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('list 缺册 → exit 2；list 有册出 JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhixia-'))
  const r1 = run(['list'], { cwd: dir })
  assert.equal(r1.status, 2)
  run(['register', '--path', 'docs/*'], { cwd: dir })
  const r2 = run(['list', '--json'], { cwd: dir })
  assert.equal(r2.status, 0)
  assert.deepEqual(JSON.parse(r2.stdout), { version: 1, excuse: ['docs/*'] })
  rmSync(dir, { recursive: true, force: true })
})

test('block 无册出确定性文本（瑕册公示是供给不是门禁）、增免案后文本改变', () => {
  const r1 = run(['block'])
  assert.equal(r1.status, 0)
  assert.match(r1.stdout, /【指瑕 · 瑕牌】/)
  assert.match(r1.stdout, /瑕册：未立（凡卷皆审）/)
  assert.match(r1.stdout, /词法：数言三形/)
  const dir = mkdtempSync(join(tmpdir(), 'zhixia-'))
  run(['register', '--path', 'legacy/*'], { cwd: dir })
  const r2 = run(['block'], { cwd: dir })
  assert.match(r2.stdout, /瑕册：免审 1 处（legacy\/\*）/)
  assert.notEqual(r1.stdout, r2.stdout)
  rmSync(dir, { recursive: true, force: true })
})

test('block shasum 双跑逐字节一致', () => {
  const h = (args) => {
    const r = execFileSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8' })
    return createHash('sha256').update(r).digest('hex')
  }
  assert.equal(h(['block']), h(['block']))
  assert.equal(h(['block', '--file', fx('zhixia-book.json')]), h(['block', '--file', fx('zhixia-book.json')]))
})

test('gate --value：29 过 / 30 红 / --gate 50 时 45 过', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).status, 0)
  const r = run(['gate', '--value', '15'])
  assert.match(r.stdout, /瑕值 15 · 带「瑕」· 门 30 → 过/)
})

test('gate --value 缺值 → exit 2', () => {
  const r = run(['gate'])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /需要 --value/)
})

test('--version 与 --help 正常', () => {
  const v = run(['--version'])
  assert.equal(v.status, 0)
  assert.match(v.stdout, /^0\.1\.0/)
  const h = run(['--help'])
  assert.equal(h.status, 0)
  assert.match(h.stdout, /指瑕 · zhixia/)
  assert.match(h.stdout, /audit/)
})
