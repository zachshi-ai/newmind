/**
 * 知行 CLI 测试 —— 子命令语义与退出码（docs/04 A4）。
 * execFile 直跑 bin，断言退出码与输出；临时目录隔离造册副作用。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'zhixing.js')
const fixture = (name) => join(root, 'fixtures', name)

function run(args, { cwd = root } = {}) {
  try {
    const out = execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8' })
    return { code: 0, out }
  } catch (error) {
    return { code: error.status, out: String(error.stdout ?? ''), err: String(error.stderr ?? '') }
  }
}

test('--version 输出版本号', () => {
  const r = run(['--version'])
  assert.equal(r.code, 0)
  assert.match(r.out, /^\d+\.\d+\.\d+/)
})

test('--help 输出用法（含子命令与退出码说明）', () => {
  const r = run(['--help'])
  assert.equal(r.code, 0)
  assert.match(r.out, /audit/)
  assert.match(r.out, /退出码/)
})

test('audit clean（主册）：exit 0 行值 0 带合', () => {
  const r = run(['audit', fixture('clean-stream.jsonl'), '--file', fixture('zhixing-book.json')])
  assert.equal(r.code, 0)
  assert.match(r.out, /行值 0 带「合」/)
})

test('audit weizhi（无册默认知形）：exit 1 行值 30 带悖', () => {
  const r = run(['audit', fixture('weizhi-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /行值 30 带「悖」/)
})

test('audit mixed（副册 --gate 50）：45 过门 exit 0', () => {
  const r = run(['audit', fixture('mixed-stream.jsonl'), '--file', fixture('zhixing-book-mixed.json'), '--gate', '50'])
  assert.equal(r.code, 0)
  assert.match(r.out, /过门/)
})

test('audit --json 输出可解析且案数一致', () => {
  const r = run(['audit', fixture('mixed-stream.jsonl'), '--file', fixture('zhixing-book-mixed.json'), '--json'])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.equal(j.score.total, 45)
  assert.equal(j.counts.wei, 1)
  assert.equal(j.ok, false)
})

test('audit 坏 JSON 行 → exit 2 并报行号', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhixing-'))
  const bad = join(dir, 'bad.jsonl')
  writeFileSync(bad, '{"type":"tool_call"}\n不是 JSON\n')
  const r = run(['audit', bad])
  assert.equal(r.code, 2)
  assert.match(r.err, /第 2 行/)
  rmSync(dir, { recursive: true, force: true })
})

test('audit 流缺失 / 未知旗标 → exit 2', () => {
  assert.equal(run(['audit', 'no-such-stream.jsonl']).code, 2)
  assert.equal(run(['audit', fixture('clean-stream.jsonl'), '--frobnicate']).code, 2)
})

test('audit 坏册（坏 JSON / 字段非数组 / 含空串）→ exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhixing-'))
  const b1 = join(dir, 'b1.json')
  writeFileSync(b1, '{坏')
  assert.equal(run(['audit', fixture('clean-stream.jsonl'), '--file', b1]).code, 2)
  const b2 = join(dir, 'b2.json')
  writeFileSync(b2, '{"bans":"x"}')
  assert.equal(run(['audit', fixture('clean-stream.jsonl'), '--file', b2]).code, 2)
  const b3 = join(dir, 'b3.json')
  writeFileSync(b3, '{"musts":[""]}')
  assert.equal(run(['audit', fixture('clean-stream.jsonl'), '--file', b3]).code, 2)
  rmSync(dir, { recursive: true, force: true })
})

test('rule 缺增条旗标 / 空串 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhixing-'))
  assert.equal(run(['rule', '--file', join(dir, 'b.json')]).code, 2)
  assert.equal(run(['rule', '--ban', '--must', 'x', '--file', join(dir, 'b.json')]).code, 2)
  rmSync(dir, { recursive: true, force: true })
})

test('rule 增条去重 upsert：两次同词只记一条', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhixing-'))
  const book = join(dir, '.zhixing.json')
  assert.equal(run(['rule', '--ban', 'git push --force', '--file', book]).code, 0)
  assert.equal(run(['rule', '--ban', 'git push --force', '--must', 'npm run lint', '--file', book]).code, 0)
  const j = JSON.parse(readFileSync(book, 'utf8'))
  assert.deepEqual(j.bans, ['git push --force'])
  assert.deepEqual(j.musts, ['npm run lint'])
  rmSync(dir, { recursive: true, force: true })
})

test('show 无册 exit 2；show 主册出五字段', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhixing-'))
  assert.equal(run(['show', '--file', join(dir, 'nope.json')]).code, 2)
  rmSync(dir, { recursive: true, force: true })
  const r = run(['show', '--file', fixture('zhixing-book.json')])
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.bans, ['TODO_FIXME'])
})

test('block 无亲命册出确定性文本（两次 shasum 相同）；增条后文本改变', () => {
  const t1 = run(['block', '--file', fixture('zhixing-book-mixed.json')]).out
  const t2 = run(['block', '--file', fixture('zhixing-book-mixed.json')]).out
  assert.equal(t1, t2)
  assert.match(t1, /知形在岗/)
  const t3 = run(['block', '--file', fixture('zhixing-book.json')]).out
  assert.notEqual(t1, t3)
  assert.ok(t3.includes('TODO_FIXME'))
  assert.equal(t3.includes('提交前必须写测试'), false)
})

test('block 合牌文本逐字节确定（shasum 复现）', () => {
  const t1 = run(['block', '--file', fixture('zhixing-book.json')]).out
  const h1 = createHash('sha256').update(t1).digest('hex')
  const t2 = run(['block', '--file', fixture('zhixing-book.json')]).out
  const h2 = createHash('sha256').update(t2).digest('hex')
  assert.equal(h1, h2)
})

test('gate：30/门 40 过、30/门 20 红；缺值 exit 2', () => {
  assert.equal(run(['gate', '--value', '40', '--score', '30']).code, 0)
  assert.equal(run(['gate', '--value', '20', '--score', '30']).code, 1)
  assert.equal(run(['gate', '--value', '40']).code, 2)
})

test('audit --no-defaults：xianliu 归零合带 exit 0', () => {
  const r = run(['audit', fixture('xianliu-stream.jsonl'), '--no-defaults'])
  assert.equal(r.code, 0)
  assert.match(r.out, /行值 0 带「合」/)
})

test('多流合审 CLI：weizhi 拆两流合审 30 悖 exit 1', () => {
  const r = run(['audit', fixture('weizhi-read.jsonl'), fixture('weizhi-exec.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /行值 30 带「悖」/)
})
