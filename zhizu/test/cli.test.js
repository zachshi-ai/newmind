/**
 * 知足 · CLI 测试 —— 退出码语义 / 旗标覆盖 / 册管理 / 量牌 shasum / 跨项目互认。
 * 子进程一律 spawnSync（非零退出码不抛，拿得到 stdout）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'zhizu.js')
const FIX = (name) => join(root, 'fixtures', name)

function run(args, cwd = root) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
}

function json(args, cwd) {
  const r = run([...args, '--json'], cwd)
  return { code: r.status, report: JSON.parse(r.stdout) }
}

// ---------------------------------------------------------------- audit

test('audit modest:0 俭 exit 0', () => {
  const { code, report } = json(['audit', FIX('modest-stream.jsonl')])
  assert.equal(code, 0)
  assert.equal(report.score.total, 0)
  assert.equal(report.band, '俭')
  assert.equal(report.counts.freshNotes, 1)
})

test('audit bloated:60 溢 exit 1', () => {
  const { code, report } = json(['audit', FIX('bloated-stream.jsonl')])
  assert.equal(code, 1)
  assert.equal(report.score.total, 60)
  assert.equal(report.band, '溢')
})

test('audit sprawling:20 盈 exit 0', () => {
  const { code, report } = json(['audit', FIX('sprawling-stream.jsonl')])
  assert.equal(code, 0)
  assert.equal(report.score.total, 20)
  assert.equal(report.band, '盈')
})

test('audit churny:10 俭 exit 0(单屡改案点名不咬门)', () => {
  const { code, report } = json(['audit', FIX('churny-stream.jsonl')])
  assert.equal(code, 0)
  assert.equal(report.score.total, 10)
  assert.equal(report.band, '俭')
})

test('audit mixed:50 溢 exit 1', () => {
  const { code, report } = json(['audit', FIX('mixed-stream.jsonl')])
  assert.equal(code, 1)
  assert.equal(report.score.total, 50)
  assert.deepEqual(report.score, { total: 50, huge: 30, fan: 20, churn: 0 })
})

test('audit 无流参数:exit 2', () => {
  const r = run(['audit'])
  assert.equal(r.status, 2)
})

test('audit 流缺失:exit 2', () => {
  const r = run(['audit', 'fixtures/不存在.jsonl'])
  assert.equal(r.status, 2)
})

test('audit 坏 JSON 行:exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhizu-'))
  const p = join(dir, 'bad.jsonl')
  writeFileSync(p, '{"type":"tool_call","id":"c1"}\n坏行\n')
  const r = run(['audit', p])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /第 2 行/)
})

test('audit --gate 10:10 分即红翻转', () => {
  const { code, report } = json(['audit', FIX('churny-stream.jsonl'), '--gate', '10'])
  assert.equal(code, 1)
  assert.equal(report.gate, 10)
  assert.equal(report.verdict, 'fail')
})

test('audit --churn-free 2:屡改 3 案 20 盈 exit 0', () => {
  const { code, report } = json(['audit', FIX('churny-stream.jsonl'), '--churn-free', '2'])
  assert.equal(code, 0)
  assert.equal(report.score.total, 20)
  assert.equal(report.counts.churns, 3)
  assert.equal(report.band, '盈')
})

test('audit --huge-lines 500:阈值放松,巨写归零', () => {
  const { code, report } = json(['audit', FIX('bloated-stream.jsonl'), '--huge-lines', '500'])
  assert.equal(code, 0)
  assert.deepEqual(report.score, { total: 0, huge: 0, fan: 0, churn: 0 })
})

test('audit --exempt:豁免子串与出账', () => {
  const { code, report } = json(['audit', FIX('modest-stream.jsonl'), '--exempt', 'src/generated'])
  assert.equal(code, 0)
  assert.equal(report.counts.exempted, 1)
  assert.equal(report.counts.freshNotes, 0)
  assert.equal(report.score.total, 0)
})

test('audit --file 足册:exempt 含 src/generated 同口径', () => {
  const { code, report } = json(['audit', FIX('modest-stream.jsonl'), '--file', FIX('zuzu-book.json')])
  assert.equal(code, 0)
  assert.equal(report.counts.exempted, 1)
})

test('audit 坏足册:exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhizu-'))
  const p = join(dir, 'bad.json')
  writeFileSync(p, '{"hugeLines":"x"}')
  const r = run(['audit', FIX('modest-stream.jsonl'), '--file', p])
  assert.equal(r.status, 2)
})

test('audit --file 缺失册:exit 2(--file 显式指定时必在)', () => {
  const r = run(['audit', FIX('modest-stream.jsonl'), '--file', join(tmpdir(), '不存在的册.json')])
  assert.equal(r.status, 2)
})

test('audit 多流:两会话合审', () => {
  const { code, report } = json(['audit', FIX('modest-stream.jsonl'), FIX('churny-stream.jsonl')])
  assert.equal(code, 0)
  assert.equal(report.sessions, 2)
  assert.equal(report.calls, 15)
})

// ---------------------------------------------------------------- 跨项目互认(A3)

test('互认:zhizhi sample-stream → 0 俭 exit 0', () => {
  const { code, report } = json(['audit', join(root, '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl')])
  assert.equal(code, 0)
  assert.equal(report.calls, 8)
  assert.equal(report.writes, 2)
  assert.equal(report.score.total, 0)
  assert.equal(report.band, '俭')
})

test('互认:dingfen fenced-stream → 0 俭 exit 0', () => {
  const { code, report } = json(['audit', join(root, '..', 'dingfen', 'fixtures', 'fenced-stream.jsonl')])
  assert.equal(code, 0)
  assert.equal(report.calls, 6)
  assert.equal(report.writes, 2)
  assert.equal(report.score.total, 0)
  assert.equal(report.band, '俭')
})

// ---------------------------------------------------------------- 册管理

test('register/list/revoke 全链路 + revoke 无此名 exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhizu-'))
  const book = join(dir, '.zhizu.json')
  const r1 = run(['register', '--exempt', 'a.lock,b.lock', '--huge-lines', '300', '--file', book], dir)
  assert.equal(r1.status, 0)
  const listed = JSON.parse(run(['list', '--file', book], dir).stdout)
  assert.deepEqual(listed.exempt, ['a.lock', 'b.lock'])
  assert.equal(listed.hugeLines, 300)
  const r2 = run(['revoke', '--exempt', 'a.lock', '--file', book], dir)
  assert.equal(r2.status, 0)
  const listed2 = JSON.parse(run(['list', '--file', book], dir).stdout)
  assert.deepEqual(listed2.exempt, ['b.lock'])
  const r3 = run(['revoke', '--exempt', '不存在', '--file', book], dir)
  assert.equal(r3.status, 2)
})

test('register 全空参:exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhizu-'))
  const r = run(['register', '--file', join(dir, '.zhizu.json')], dir)
  assert.equal(r.status, 2)
})

test('revoke 双名:exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhizu-'))
  const book = join(dir, '.zhizu.json')
  run(['register', '--exempt', 'a', '--file', book], dir)
  const r = run(['revoke', '--exempt', 'a,b', '--file', book], dir)
  assert.equal(r.status, 2)
})

test('list/block 册缺失:exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhizu-'))
  assert.equal(run(['list', '--file', join(dir, '无.json')], dir).status, 2)
  assert.equal(run(['block', '--file', join(dir, '无.json')], dir).status, 2)
})

test('坏阈值旗标:exit 2', () => {
  const r = run(['audit', FIX('modest-stream.jsonl'), '--churn-free', 'x'])
  assert.equal(r.status, 2)
})

// ---------------------------------------------------------------- 量牌与杂项

test('量牌:同一足册两次 block shasum 逐字节一致;增豁免后改变', () => {
  const h = (args) => createHash('sha256').update(run(args).stdout).digest('hex')
  const h1 = h(['block', '--file', FIX('zuzu-book.json')])
  const h2 = h(['block', '--file', FIX('zuzu-book.json')])
  assert.equal(h1, h2)
  const dir = mkdtempSync(join(tmpdir(), 'zhizu-'))
  const book = join(dir, '.zhizu.json')
  run(['register', '--exempt', 'extra-lock', '--file', book], dir)
  const h3 = h(['block', '--file', book])
  assert.notEqual(h1, h3)
})

test('量牌:全缺省册输出确定性文本', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhizu-'))
  const book = join(dir, '.zhizu.json')
  run(['register', '--exempt', 'once', '--file', book], dir)
  run(['revoke', '--exempt', 'once', '--file', book], dir)
  const out = run(['block', '--file', book]).stdout
  assert.match(out, /【知足 · 量牌】/)
  assert.match(out, /巨写阈 400 行/)
})

test('gate --value:按门判 0/1', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  assert.equal(run(['gate', '--value', '10', '--gate', '10']).status, 1)
})

test('gate 缺 --value:exit 2', () => {
  assert.equal(run(['gate']).status, 2)
})

test('--version 与 --help', () => {
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/)
  assert.match(run(['--help']).stdout, /用法/)
  assert.match(run([]).stdout, /用法/)
})

test('未知命令:exit 2', () => {
  assert.equal(run(['frobnicate']).status, 2)
})
