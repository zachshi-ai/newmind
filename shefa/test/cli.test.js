/**
 * CLI 语义测试 —— audit/register/revoke/list/block/gate 与退出码（docs/04 的 A2/A4）。
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
const BIN = join(root, 'src', 'bin', 'shefa.js')
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

test('夹具 clean：0 净 exit 0', () => {
  const r = audit('clean-stream.jsonl', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 3)
  assert.equal(s.rafts, 0)
  assert.deepEqual(s.score, { total: 0, infield: 0, exfield: 0 })
  assert.equal(s.band, '净')
})

test('夹具 leftover：60 积 exit 1（落物 3 · 遗 2 · 外逸 1）', () => {
  const r = audit('leftover-stream.jsonl', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.equal(s.calls, 5)
  assert.equal(s.rafts, 3)
  assert.equal(s.paths, 3)
  assert.deepEqual(s.score, { total: 60, infield: 30, exfield: 30 })
  assert.equal(s.band, '积')
  assert.deepEqual(s.counts, { dropped: 3, removed: 0, adopted: 0, exempted: 0, left: 2, stray: 1 })
})

test('夹具 shepherded：0 净 exit 0（舍 2）', () => {
  const r = audit('shepherded-stream.jsonl', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.deepEqual(s.counts, { dropped: 2, removed: 2, adopted: 0, exempted: 0, left: 0, stray: 0 })
})

test('夹具 adopted：0 净 exit 0（归 1）', () => {
  const r = audit('adopted-stream.jsonl', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.deepEqual(s.counts, { dropped: 1, removed: 0, adopted: 1, exempted: 0, left: 0, stray: 0 })
})

test('夹具 mixed：45 积 exit 1（舍 1 归 1 遗 1 外逸 1）', () => {
  const r = audit('mixed-stream.jsonl', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.equal(s.rafts, 4)
  assert.deepEqual(s.score, { total: 45, infield: 15, exfield: 30 })
  assert.deepEqual(s.counts, { dropped: 4, removed: 1, adopted: 1, exempted: 0, left: 1, stray: 1 })
})

test('附加口径：leftover + 筏册（keep+roots）→ 15 滞 exit 0 exempted 2', () => {
  const r = audit('leftover-stream.jsonl', '--file', F('shefa-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.deepEqual(s.score, { total: 15, infield: 15, exfield: 0 })
  assert.equal(s.band, '滞')
  assert.equal(s.counts.exempted, 2)
})

test('附加口径：leftover + --keep 旗标 → 30 积 exit 1', () => {
  const r = audit('leftover-stream.jsonl', '--keep', 'scratch/,.bak', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.deepEqual(s.score, { total: 30, infield: 0, exfield: 30 })
})

test('附加口径：leftover + --no-defaults --raft .bak → rafts 1、15 滞 exit 0', () => {
  const r = audit('leftover-stream.jsonl', '--no-defaults', '--raft', '.bak', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.rafts, 1)
  assert.deepEqual(s.score, { total: 15, infield: 15, exfield: 0 })
})

test('附加口径：mixed + --gate 50 → 45 过门 exit 0', () => {
  const r = audit('mixed-stream.jsonl', '--gate', '50')
  assert.equal(r.status, 0)
})

// ---- A3：跨项目互认 -------------------------------------------------------

test('互认：zhizhi sample 流零误伤（8 调用 · 0 净）', () => {
  const r = run(['audit', join(root, '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl'), '--json'])
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 8)
  assert.equal(s.rafts, 0)
  assert.equal(s.band, '净')
})

test('互认：dingfen fenced 流零误伤（6 调用 · 0 净）', () => {
  const r = run(['audit', join(root, '..', 'dingfen', 'fixtures', 'fenced-stream.jsonl'), '--json'])
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 6)
  assert.equal(s.rafts, 0)
  assert.equal(s.band, '净')
})

// ---- A4：CLI 语义与退出码 -------------------------------------------------

test('audit：坏 JSON 行 exit 2；流缺失 exit 2；未知旗标 exit 2', () => {
  const bad = join(root, 'test', '.tmp-bad.jsonl')
  writeFileSync(bad, '{"a":1}\n垃圾\n')
  assert.equal(run(['audit', bad]).status, 2)
  rmSync(bad)
  assert.equal(audit('no-such-stream.jsonl').status, 2)
  assert.equal(audit('clean-stream.jsonl', '--bogus').status, 2)
})

test('audit：坏册 exit 2；多流合审（两夹具拼接会话数 2）', () => {
  const badBook = join(root, 'test', '.tmp-bad-book.json')
  writeFileSync(badBook, 'not-json')
  assert.equal(audit('clean-stream.jsonl', '--file', badBook).status, 2)
  const r = run(['audit', F('clean-stream.jsonl'), F('leftover-stream.jsonl'), '--json'])
  const s = scoreOf(r)
  assert.equal(s.sessions, 2)
  assert.equal(s.calls, 8)
})

test('register/revoke：全空参 exit 2；roundtrip 生效；revoke 无此名 exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shefa-cli-'))
  const file = join(dir, 'book.json')
  assert.equal(run(['register', '--file', file]).status, 2)
  const reg = run(['register', '--file', file, '--keep', 'gen/,vendor/'])
  assert.equal(reg.status, 0)
  const listed = JSON.parse(run(['list', '--file', file, '--json']).stdout)
  assert.deepEqual(listed.book.keep, ['gen/', 'vendor/'])
  assert.equal(run(['revoke', '--file', file, '--keep', 'nope/']).status, 2)
  assert.equal(run(['revoke', '--file', file, '--keep', 'vendor/']).status, 0)
  const after = JSON.parse(run(['list', '--file', file, '--json']).stdout)
  assert.deepEqual(after.book.keep, ['gen/'])
})

test('list/block：册缺失 exit 2；全缺省空册 block 确定性文本；shasum 双跑一致；增 keep 文本改变', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shefa-cli-'))
  assert.equal(run(['list', '--file', join(dir, 'none.json')]).status, 2)
  assert.equal(run(['block', '--file', join(dir, 'none.json')]).status, 2)

  const emptyBook = join(dir, 'empty.json')
  writeFileSync(emptyBook, '{\n  "version": 1,\n  "keep": [],\n  "raft": [],\n  "roots": [],\n  "noDefaults": false\n}\n')
  const def1 = run(['block', '--file', emptyBook]).stdout
  const def2 = run(['block', '--file', emptyBook]).stdout
  assert.equal(def1, def2)
  assert.match(def1, /【舍筏 · 舍牌】/)

  const file = join(dir, 'book.json')
  run(['register', '--file', file, '--keep', 'vendor/'])
  const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8)
  const a = run(['block', '--file', file]).stdout
  const b = run(['block', '--file', file]).stdout
  assert.equal(h(a), h(b))
  assert.notEqual(h(a), h(def1))
  assert.match(a, /keep vendor\//)
})

test('gate --value：按门判 0/1', () => {
  assert.equal(run(['gate', '--value', '15']).status, 0)
  assert.equal(run(['gate', '--value', '45']).status, 1)
  const s = JSON.parse(run(['gate', '--value', '15', '--json']).stdout)
  assert.equal(s.band, '滞')
})

test('--version 与 --help 正常；audit 无流 exit 2', () => {
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/)
  assert.match(run(['--help']).stdout, /shefa audit/)
  assert.equal(run(['audit']).status, 2)
})
