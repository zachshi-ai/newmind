/**
 * 讳疾 CLI 测试 —— audit 复现五组 / 册操作 / block 确定性 / gate / 用法错误 exit 2。
 * 夹具手算期望锁死于 docs/04 A2/A4；退出码逐字断言。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdtempSync, existsSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'huiji.js')
const fx = (name) => join(root, 'fixtures', name)

function run(args, { cwd = root } = {}) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
}

function tmpdir() {
  return mkdtempSync(join(root, 'test', 'tmp-'))
}

// ---- A2 复现五组（5）--------------------------------------------------------

test('audit 复现：讳案/已痊/扫痊/迟痊/无诊五条退出码与输出逐字吻合', () => {
  const cases = [
    ['clean-stream.jsonl', 0, /已痊 1/],
    ['huiji-stream.jsonl', 1, /讳案 1/],
    ['yukuang-stream.jsonl', 0, /已痊 1/],
    ['saoquan-stream.jsonl', 0, /已痊 1/],
    ['wuzhen-stream.jsonl', 0, /1 愈行/],
  ]
  for (const [file, code, re] of cases) {
    const r = run(['audit', fx(file)])
    assert.equal(r.status, code, file)
    assert.match(r.stdout, re, file)
  }
  const chi = run(['audit', fx('chiyu-stream.jsonl')])
  assert.equal(chi.status, 1)
  assert.match(chi.stdout, /迟痊 1/)
  const wei = run(['audit', fx('weiyu-stream.jsonl')])
  assert.equal(wei.status, 1)
  assert.match(wei.stdout, /疾值 30/)
})

test('audit 合审：跨会话讳案红、已痊过', () => {
  const r1 = run(['audit', fx('hepan-a.jsonl'), fx('hepan-b.jsonl')])
  assert.equal(r1.status, 1)
  assert.match(r1.stdout, /会话 2 · 调用 2/)
  const r2 = run(['audit', fx('heyu-a.jsonl'), fx('heyu-b.jsonl')])
  assert.equal(r2.status, 0)
})

test('audit 痊册免案与无册对照', () => {
  const withBook = run(['audit', fx('zhaice-stream.jsonl'), '--file', fx('huiji-book.json')])
  assert.equal(withBook.status, 0)
  const noBook = run(['audit', fx('zhaice-stream.jsonl')])
  assert.equal(noBook.status, 1)
})

test('audit gate 翻转：40 过 / 20 红', () => {
  assert.equal(run(['audit', fx('huiji-stream.jsonl'), '--gate', '40']).status, 0)
  assert.equal(run(['audit', fx('huiji-stream.jsonl'), '--gate', '20']).status, 1)
})

test('audit --json 字段齐备', () => {
  const r = run(['audit', fx('huiji-stream.jsonl'), '--json'])
  assert.equal(r.status, 1)
  const obj = JSON.parse(r.stdout)
  assert.equal(obj.calls, 2)
  assert.equal(obj.counts.hui, 1)
  assert.equal(obj.score.total, 30)
  assert.equal(obj.band, '疾')
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
  assert.equal(run(['audit', fx('huiji-stream.jsonl'), '--wat']).status, 2)
  assert.equal(run(['audit', fx('huiji-stream.jsonl'), '--gate']).status, 2)
  assert.equal(run(['audit']).status, 2)
  rmSync(dir, { recursive: true, force: true })
})

test('register 缺 --path exit 2；revoke 无此径 exit 2；list 缺册 exit 2', () => {
  const dir = tmpdir()
  const book = join(dir, '.huiji.json')
  assert.equal(run(['register'], { cwd: dir }).status, 2)
  assert.equal(run(['revoke', '--path', 'a/*', '--file', book], { cwd: dir }).status, 2)
  assert.equal(run(['list', '--file', book], { cwd: dir }).status, 2)
  assert.equal(run(['revoke', '--path', 'x/*', '--file', fx('huiji-book.json')]).status, 2)
  rmSync(dir, { recursive: true, force: true })
})

// ---- 册操作（3）-------------------------------------------------------------

test('register 自动建册、去重、audit 免案生效', () => {
  const dir = tmpdir()
  const book = join(dir, '.huiji.json')
  const stream = join(dir, 's.jsonl')
  copyFileSync(fx('zhaice-stream.jsonl'), stream)
  const r1 = run(['register', '--path', 'docs/internal/*', '--file', book], { cwd: dir })
  assert.equal(r1.status, 0)
  assert.match(r1.stdout, /免审已立/)
  run(['register', '--path', 'docs/internal/*', '--file', book], { cwd: dir })
  const parsed = JSON.parse(readFileSync(book, 'utf8'))
  assert.deepEqual(parsed.allow, ['docs/internal/*'])
  assert.equal(run(['audit', stream, '--file', book], { cwd: dir }).status, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('revoke 撤销后门禁恢复', () => {
  const dir = tmpdir()
  const book = join(dir, '.huiji.json')
  const stream = join(dir, 's.jsonl')
  copyFileSync(fx('zhaice-stream.jsonl'), stream)
  run(['register', '--path', 'docs/internal/*', '--file', book], { cwd: dir })
  assert.equal(run(['audit', stream, '--file', book], { cwd: dir }).status, 0)
  const r = run(['revoke', '--path', 'docs/internal/*', '--file', book], { cwd: dir })
  assert.equal(r.status, 0)
  assert.equal(run(['audit', stream, '--file', book], { cwd: dir }).status, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('list 出册 JSON', () => {
  const r = run(['list', '--file', fx('huiji-book.json')])
  assert.equal(r.status, 0)
  const obj = JSON.parse(r.stdout)
  assert.deepEqual(obj.allow, ['docs/internal/*'])
})

// ---- 疾牌块（2）-------------------------------------------------------------

test('block 无册出确定性文本「痊册：未立（凡愈必痊）」；增免案文本改变', () => {
  const r1 = run(['block'])
  assert.equal(r1.status, 0)
  assert.ok(r1.stdout.includes('痊册：未立（凡愈必痊）'))
  const dir = tmpdir()
  const book = join(dir, '.huiji.json')
  copyFileSync(fx('huiji-book.json'), book)
  const b1 = run(['block', '--file', book]).stdout
  run(['register', '--path', 'drafts/*', '--file', book], { cwd: dir })
  const b2 = run(['block', '--file', book]).stdout
  assert.notEqual(b1, b2)
  rmSync(dir, { recursive: true, force: true })
})

test('block shasum 双跑一致（逐字节确定）', () => {
  const h1 = createHash('sha256').update(run(['block', '--file', fx('huiji-book.json')]).stdout).digest('hex')
  const h2 = createHash('sha256').update(run(['block', '--file', fx('huiji-book.json')]).stdout).digest('hex')
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
  assert.ok(r.stdout.includes('huiji audit'))
  assert.ok(r.stdout.includes('疾值阈门'))
  assert.equal(run(['frobnicate']).status, 2)
})
