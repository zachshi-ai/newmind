/**
 * 安澜 CLI 测试 —— audit 复现各组 / 册操作 / block 确定性 / gate / 用法错误 exit 2。
 * 夹具手算期望锁死于 docs/04 A2/A4；退出码逐字断言。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdtempSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'anlan.js')
const fx = (name) => join(root, 'fixtures', name)

function run(args, { cwd = root } = {}) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
}

function tmpdir() {
  return mkdtempSync(join(root, 'test', 'tmp-'))
}

// ---- A2 复现（4）------------------------------------------------------------

test('audit 复现：守准/荡案/风浪/未达门槛四条退出码与输出逐字吻合', () => {
  const cases = [
    ['clean-stream.jsonl', 0, /荡案 0 · 风浪 0/],
    ['anlang-stream.jsonl', 1, /荡案 1/],
    ['fenglang-stream.jsonl', 0, /风浪 1/],
    ['weidie-stream.jsonl', 0, /荡案 0 · 风浪 0/],
  ]
  for (const [file, code, re] of cases) {
    const r = run(['audit', fx(file)])
    assert.equal(r.status, code, file)
    assert.match(r.stdout, re, file)
  }
})

test('audit 复现：收敛不赦/对象独立/双荡案/全科笔镜', () => {
  assert.equal(run(['audit', fx('shoulian-stream.jsonl')]).status, 1)
  const dui = run(['audit', fx('duixiang-stream.jsonl')])
  assert.equal(dui.status, 1)
  assert.match(dui.stdout, /荡案：auth/)
  const shuang = run(['audit', fx('shuangdang-stream.jsonl')])
  assert.equal(shuang.status, 1)
  assert.match(shuang.stdout, /荡值 60/)
  assert.equal(run(['audit', fx('quanliang-stream.jsonl')]).status, 1)
})

test('audit 复现：老流/无矢/迟搅/观察不入账 全过', () => {
  for (const f of ['laoliu-stream.jsonl', 'wushi-stream.jsonl', 'chijiao-stream.jsonl', 'guance-stream.jsonl']) {
    assert.equal(run(['audit', fx(f)]).status, 0, f)
  }
  const chi = run(['audit', fx('chijiao-stream.jsonl')])
  assert.match(chi.stdout, /风浪 1/)
})

test('audit 复现：首绿起振/交错/英文 荡案与静默各归其位', () => {
  assert.equal(run(['audit', fx('huangfan-stream.jsonl')]).status, 1)
  assert.equal(run(['audit', fx('jiaocha-stream.jsonl')]).status, 0)
  const ying = run(['audit', fx('yingwen-stream.jsonl')])
  assert.equal(ying.status, 1)
  assert.match(ying.stdout, /荡案：auth/)
})

// ---- 澜册、合审、gate、json（4）---------------------------------------------

test('audit 澜册免审与无册对照', () => {
  const withBook = run(['audit', fx('cemian-stream.jsonl'), '--file', fx('anlan-book.json')])
  assert.equal(withBook.status, 0)
  const noBook = run(['audit', fx('cemian-stream.jsonl')])
  assert.equal(noBook.status, 1)
})

test('audit 合审：跨会话荡案红（6 调用 2 会话）', () => {
  const r = run(['audit', fx('hepan-a.jsonl'), fx('hepan-b.jsonl')])
  assert.equal(r.status, 1)
  assert.match(r.stdout, /会话 2 · 调用 6/)
  assert.match(r.stdout, /荡案：auth（叠 3 · 搅 2）/)
})

test('audit gate 翻转：40 过 / 20 红', () => {
  assert.equal(run(['audit', fx('anlang-stream.jsonl'), '--gate', '40']).status, 0)
  assert.equal(run(['audit', fx('anlang-stream.jsonl'), '--gate', '20']).status, 1)
})

test('audit --json 字段齐备', () => {
  const r = run(['audit', fx('anlang-stream.jsonl'), '--json'])
  assert.equal(r.status, 1)
  const obj = JSON.parse(r.stdout)
  assert.equal(obj.calls, 7)
  assert.equal(obj.objects, 1)
  assert.equal(obj.counts.dang, 1)
  assert.equal(obj.score.total, 30)
  assert.equal(obj.band, '荡')
  assert.equal(obj.verdict, 'fail')
  assert.ok(Array.isArray(obj.issues) && obj.issues.length === 1)
})

// ---- 用法错误 exit 2（2）----------------------------------------------------

test('坏 JSON 行报行号、流缺失、未知旗标、缺值皆 exit 2', () => {
  const dir = tmpdir()
  const badStream = join(dir, 'bad.jsonl')
  writeFileSync(badStream, '{"type":"tool_call"}\n{"broken"\n')
  assert.equal(run(['audit', badStream]).status, 2)
  assert.match(run(['audit', badStream]).stderr, /第 2 行/)
  assert.equal(run(['audit', join(dir, 'missing.jsonl')]).status, 2)
  assert.equal(run(['audit', fx('anlang-stream.jsonl'), '--wat']).status, 2)
  assert.equal(run(['audit', fx('anlang-stream.jsonl'), '--gate']).status, 2)
  assert.equal(run(['audit']).status, 2)
  rmSync(dir, { recursive: true, force: true })
})

test('register 无旗标 exit 2；--path 非本层旗标 exit 2；revoke 无此对象 exit 2；list 缺册 exit 2', () => {
  const dir = tmpdir()
  const book = join(dir, '.anlan.json')
  assert.equal(run(['register'], { cwd: dir }).status, 2)
  assert.equal(run(['register', '--path', 'docs/*'], { cwd: dir }).status, 2, '本层无径豁免——--path 是未知旗标')
  assert.equal(run(['revoke', '--spare', 'auth', '--file', book], { cwd: dir }).status, 2)
  assert.equal(run(['list', '--file', book], { cwd: dir }).status, 2)
  assert.equal(run(['revoke', '--spare', 'nosuch', '--file', fx('anlan-book.json')]).status, 2)
  rmSync(dir, { recursive: true, force: true })
})

// ---- 册操作（4）-------------------------------------------------------------

test('register --spare 自动建册、去重、audit 免审生效', () => {
  const dir = tmpdir()
  const book = join(dir, '.anlan.json')
  const stream = join(dir, 's.jsonl')
  copyFileSync(fx('cemian-stream.jsonl'), stream)
  const r1 = run(['register', '--spare', 'auth', '--file', book], { cwd: dir })
  assert.equal(r1.status, 0)
  assert.match(r1.stdout, /澜册已立/)
  run(['register', '--spare', 'auth', '--file', book], { cwd: dir })
  const parsed = JSON.parse(readFileSync(book, 'utf8'))
  assert.deepEqual(parsed.spare, ['auth'])
  assert.equal(run(['audit', stream, '--file', book], { cwd: dir }).status, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('revoke 撤销后门禁恢复红', () => {
  const dir = tmpdir()
  const book = join(dir, '.anlan.json')
  const stream = join(dir, 's.jsonl')
  copyFileSync(fx('cemian-stream.jsonl'), stream)
  run(['register', '--spare', 'auth', '--file', book], { cwd: dir })
  assert.equal(run(['audit', stream, '--file', book], { cwd: dir }).status, 0)
  const r = run(['revoke', '--spare', 'auth', '--file', book], { cwd: dir })
  assert.equal(r.status, 0)
  assert.equal(run(['audit', stream, '--file', book], { cwd: dir }).status, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('register --forms 增诊形生效（mvn verify 荡案）', () => {
  const dir = tmpdir()
  const book = join(dir, '.anlan.json')
  const stream = join(dir, 's.jsonl')
  writeFileSync(
    stream,
    [
      JSON.stringify({ type: 'tool_call', id: 'c1', name: 'bash', args: { command: 'mvn verify -Dtest=Auth' }, at: 100 }),
      JSON.stringify({ type: 'tool_result', id: 'c1', name: 'bash', args: { command: 'mvn verify -Dtest=Auth' }, isError: true, content: 'FAIL Auth', at: 101 }),
      JSON.stringify({ type: 'tool_call', id: 'c2', name: 'write', args: { path: 'src/Auth.java', content: 'fix\n' }, at: 150 }),
      JSON.stringify({ type: 'tool_result', id: 'c2', name: 'write', args: { path: 'src/Auth.java' }, isError: false, at: 151 }),
      JSON.stringify({ type: 'tool_call', id: 'c3', name: 'bash', args: { command: 'mvn verify -Dtest=Auth' }, at: 200 }),
      JSON.stringify({ type: 'tool_result', id: 'c3', name: 'bash', args: { command: 'mvn verify -Dtest=Auth' }, isError: false, content: 'Auth ok', at: 201 }),
      JSON.stringify({ type: 'tool_call', id: 'c4', name: 'write', args: { path: 'src/Auth.java', content: 'retry\n' }, at: 250 }),
      JSON.stringify({ type: 'tool_result', id: 'c4', name: 'write', args: { path: 'src/Auth.java' }, isError: false, at: 251 }),
      JSON.stringify({ type: 'tool_call', id: 'c5', name: 'bash', args: { command: 'mvn verify -Dtest=Auth' }, at: 300 }),
      JSON.stringify({ type: 'tool_result', id: 'c5', name: 'bash', args: { command: 'mvn verify -Dtest=Auth' }, isError: true, content: 'FAIL Auth', at: 301 }),
      JSON.stringify({ type: 'tool_call', id: 'c6', name: 'write', args: { path: 'src/Auth.java', content: 'fix2\n' }, at: 350 }),
      JSON.stringify({ type: 'tool_result', id: 'c6', name: 'write', args: { path: 'src/Auth.java' }, isError: false, at: 351 }),
      JSON.stringify({ type: 'tool_call', id: 'c7', name: 'bash', args: { command: 'mvn verify -Dtest=Auth' }, at: 400 }),
      JSON.stringify({ type: 'tool_result', id: 'c7', name: 'bash', args: { command: 'mvn verify -Dtest=Auth' }, isError: false, content: 'Auth ok', at: 401 }),
    ].join('\n') + '\n'
  )
  assert.equal(run(['audit', stream, '--file', book], { cwd: dir }).status, 0, '无册时 mvn verify 非诊形')
  run(['register', '--forms', 'mvn verify', '--file', book], { cwd: dir })
  const parsed = JSON.parse(readFileSync(book, 'utf8'))
  assert.deepEqual(parsed.forms, ['mvn verify'])
  assert.equal(run(['audit', stream, '--file', book], { cwd: dir }).status, 1, '增形后成诊、荡案红')
  rmSync(dir, { recursive: true, force: true })
})

test('list 出澜册 JSON', () => {
  const r = run(['list', '--file', fx('anlan-book.json')])
  assert.equal(r.status, 0)
  const obj = JSON.parse(r.stdout)
  assert.deepEqual(obj.spare, ['auth'])
})

// ---- 荡牌块（2）-------------------------------------------------------------

test('block 无册出确定性文本「澜册：未立（凡荡必审）」；增豁免文本改变', () => {
  const r1 = run(['block'])
  assert.equal(r1.status, 0)
  assert.ok(r1.stdout.includes('澜册：未立（凡荡必审）'))
  const dir = tmpdir()
  const book = join(dir, '.anlan.json')
  copyFileSync(fx('anlan-book.json'), book)
  const b1 = run(['block', '--file', book]).stdout
  run(['register', '--spare', 'cache', '--file', book], { cwd: dir })
  const b2 = run(['block', '--file', book]).stdout
  assert.notEqual(b1, b2)
  rmSync(dir, { recursive: true, force: true })
})

test('block shasum 双跑一致（逐字节确定）', () => {
  const h1 = createHash('sha256').update(run(['block', '--file', fx('anlan-book.json')]).stdout).digest('hex')
  const h2 = createHash('sha256').update(run(['block', '--file', fx('anlan-book.json')]).stdout).digest('hex')
  assert.equal(h1, h2)
})

// ---- gate 命令（1）----------------------------------------------------------

test('gate --value：29 过 / 30 红 / --gate 50 时 45 过 / 缺值 exit 2', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).status, 0)
  assert.equal(run(['gate', '--value']).status, 2)
})

// ---- 用法（2）---------------------------------------------------------------

test('--version 输出 0.1.0（trim 全等）', () => {
  const r = run(['--version'])
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), '0.1.0')
})

test('--help 出用法、未知命令 exit 2', () => {
  const r = run(['--help'])
  assert.equal(r.status, 0)
  assert.ok(r.stdout.includes('anlan audit'))
  assert.ok(r.stdout.includes('荡值阈门'))
  assert.equal(run(['frobnicate']).status, 2)
})
