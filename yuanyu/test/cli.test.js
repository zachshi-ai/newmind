/**
 * CLI 语义测试 —— audit/register/revoke/list/block/gate 与退出码（docs/04 的 A2/A3/A4/A5）。
 * 子进程一律 spawnSync（非零退出拿得到 stdout）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'yuanyu.js')
const F = (name) => join(root, 'fixtures', name)

function run(args, cwd = root) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
}

function audit(name, ...extra) {
  return run(['audit', F(name), ...extra])
}

function scoreOf(res) {
  return JSON.parse(res.stdout)
}

// ---- A2：五夹具与附加口径（先于实现手算定死）------------------------------

test('夹具 clean：0 澄 exit 0（白形静默、未得不入）', () => {
  const r = audit('clean-stream.jsonl', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 4)
  assert.deepEqual(s.counts, { loads: 0, duty: 0, sight: 0, spread: 0 })
  assert.deepEqual(s.score, { total: 0, sight: 0, spread: 0 })
  assert.equal(s.band, '澄')
})

test('夹具 peek：45 渍 exit 1（涉视 3）', () => {
  const r = audit('peek-stream.jsonl', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.equal(s.calls, 3)
  assert.equal(s.loads, 3)
  assert.deepEqual(s.score, { total: 45, sight: 45, spread: 0 })
  assert.equal(s.band, '渍')
  assert.deepEqual(s.counts, { loads: 3, duty: 0, sight: 3, spread: 0 })
})

test('夹具 spread：45 渍 exit 1（涉视 1 + 转运 1）', () => {
  const r = audit('spread-stream.jsonl', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.equal(s.calls, 2)
  assert.deepEqual(s.score, { total: 45, sight: 15, spread: 30 })
  assert.equal(s.band, '渍')
  assert.deepEqual(s.counts, { loads: 1, duty: 0, sight: 1, spread: 1 })
})

test('夹具 duty + 礼册：15 浊 exit 0（本职 0 分、单涉视黄牌不咬门）', () => {
  const r = audit('duty-stream.jsonl', '--file', F('yuanyu-duty-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 2)
  assert.deepEqual(s.score, { total: 15, sight: 15, spread: 0 })
  assert.equal(s.band, '浊')
  assert.deepEqual(s.counts, { loads: 2, duty: 1, sight: 1, spread: 0 })
})

test('夹具 mixed：60 渍 exit 1（涉视 2 + 转运 1）', () => {
  const r = audit('mixed-stream.jsonl', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.equal(s.calls, 6)
  assert.deepEqual(s.score, { total: 60, sight: 30, spread: 30 })
  assert.equal(s.band, '渍')
  assert.deepEqual(s.counts, { loads: 2, duty: 0, sight: 2, spread: 1 })
})

test('附加口径：peek + --duty .env → 30 渍 exit 1', () => {
  const r = audit('peek-stream.jsonl', '--duty', '.env', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.deepEqual(s.counts, { loads: 3, duty: 1, sight: 2, spread: 0 })
  assert.deepEqual(s.score, { total: 30, sight: 30, spread: 0 })
  assert.equal(s.band, '渍')
})

test('附加口径：peek + --no-defaults → 0 澄 exit 0', () => {
  const r = audit('peek-stream.jsonl', '--no-defaults', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.deepEqual(s.counts, { loads: 0, duty: 0, sight: 0, spread: 0 })
  assert.equal(s.band, '澄')
})

test('附加口径：peek + --file 礼册（duty .env+.npmrc）→ 15 浊 exit 0', () => {
  const r = audit('peek-stream.jsonl', '--file', F('yuanyu-duty-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.deepEqual(s.counts, { loads: 3, duty: 2, sight: 1, spread: 0 })
  assert.deepEqual(s.score, { total: 15, sight: 15, spread: 0 })
  assert.equal(s.band, '浊')
})

test('附加口径：mixed + --gate 70 → 60 过门 exit 0', () => {
  const r = audit('mixed-stream.jsonl', '--gate', '70', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.deepEqual(s.score, { total: 60, sight: 30, spread: 30 })
  assert.equal(s.verdict, 'pass')
})

// ---- A3：跨项目互认 -------------------------------------------------------

const X = (name) => join(root, '..', name) // 跨项目夹具：newmind/<proj>/fixtures/…

test('A3：zhizhi sample-stream 喂 yuanyu —— 8 调用 0 案澄 exit 0（零误伤）', () => {
  const r = run(['audit', X('zhizhi/fixtures/sample-stream.jsonl'), '--json'])
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 8)
  assert.equal(s.cases, 0)
  assert.deepEqual(s.score, { total: 0, sight: 0, spread: 0 })
  assert.equal(s.band, '澄')
})

test('A3：dingfen fenced-stream 喂 yuanyu —— 6 调用 0 案澄 exit 0（零误伤）', () => {
  const r = run(['audit', X('dingfen/fixtures/fenced-stream.jsonl'), '--json'])
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 6)
  assert.equal(s.cases, 0)
  assert.deepEqual(s.score, { total: 0, sight: 0, spread: 0 })
  assert.equal(s.band, '澄')
})

// ---- A4：CLI 语义 ---------------------------------------------------------

test('audit：坏 JSON 行 → exit 2；流缺失 → exit 2；未知旗标 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yuanyu-'))
  try {
    const bad = join(dir, 'bad.jsonl')
    writeFileSync(bad, '{"ok":1}\nnope\n')
    assert.equal(run(['audit', bad]).status, 2)
    assert.equal(run(['audit', join(dir, 'missing.jsonl')]).status, 2)
    assert.equal(run(['audit', F('clean-stream.jsonl'), '--wat']).status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('register/revoke/list/block：全空参 exit 2、无此名 exit 2、缺册 exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yuanyu-'))
  try {
    const book = join(dir, '.yuanyu.json')
    assert.equal(run(['register'], dir).status, 2)
    assert.equal(run(['register', '--duty', '.env', '--file', book]).status, 0)
    assert.ok(existsSync(book))
    assert.equal(run(['revoke', '--duty', 'nope', '--file', book]).status, 2)
    assert.equal(run(['revoke', '--duty', '.env', '--file', book]).status, 0)
    assert.equal(run(['list', '--file', join(dir, 'missing.json')]).status, 2)
    assert.equal(run(['block', '--file', join(dir, 'missing.json')]).status, 2)
    const listed = JSON.parse(run(['list', '--file', book]).stdout)
    assert.equal(listed.entries.duty, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('register：坏册 → exit 2；--json 输出紧凑', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yuanyu-'))
  try {
    const book = join(dir, '.yuanyu.json')
    writeFileSync(book, 'not json')
    assert.equal(run(['register', '--duty', '.env', '--file', book]).status, 2)
    const r = audit('clean-stream.jsonl', '--json')
    assert.ok(!r.stdout.includes('\n '))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('gate：--value 按门判 0/1；缺 --value → exit 2', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  const custom = run(['gate', '--value', '45', '--gate', '50'])
  assert.equal(custom.status, 0)
  const out = JSON.parse(run(['gate', '--value', '45', '--gate', '40']).stdout)
  assert.equal(out.verdict, 'fail')
  assert.equal(out.band, '渍')
  assert.equal(run(['gate']).status, 2)
})

test('--version 与 --help 正常', () => {
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/)
  assert.match(run(['--help']).stdout, /用法/)
})

// ---- A5：鉴牌块逐字节确定 ---------------------------------------------------

test('鉴牌块：同册两次 shasum 相同；增 duty 后文本改变', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yuanyu-'))
  try {
    const book = join(dir, '.yuanyu.json')
    run(['register', '--duty', '.env', '--file', book])
    const h = (args) => createHash('sha256').update(run(['block', ...args, '--file', book]).stdout).digest('hex')
    const before = h([])
    assert.equal(before, h([])) // 同册两次逐字节相同
    run(['register', '--duty', '.npmrc', '--file', book])
    assert.notEqual(before, h([])) // 增一 duty 形后文本改变
    assert.equal(run(['block', '--file', join(dir, 'missing.json')]).status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
