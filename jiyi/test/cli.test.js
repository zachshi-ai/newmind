/**
 * 稽疑 CLI 测试 —— audit / register / revoke / list / block / gate 的语义与退出码（A2/A3/A4/A5）。
 * dingfen 跨项目互认经子进程真跑对方 bin。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'jiyi.js')
const FX = (name) => join(root, 'fixtures', name)
const DINGFEN_BIN = join(root, '..', 'dingfen', 'src', 'bin', 'dingfen.js')
const TMP = join(root, 'test', 'tmp-cli')

function run(args, cwd = root) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd })
}

test.beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
})
test.after(() => {
  rmSync(TMP, { recursive: true, force: true })
})

// ---------------------------------------------------------------- audit

test('A2：audit clean 夹具 —— 0 分 / 谋 / exit 0', () => {
  const r = run(['audit', FX('clean-stream.jsonl'), '--file', FX('clean-askfile.json')])
  assert.equal(r.status, 0)
  const j = JSON.parse(r.stdout)
  assert.deepEqual(j.score, { total: 0, late: 0, blind: 0 })
  assert.equal(j.band, '谋')
  assert.deepEqual(j.counts, { triggered: 3, fulfilled: 1, late: 0, blind: 0, emptyAsk: 0, unseen: 2, askCount: 3 })
})

test('A2：audit blind 夹具 —— 10 分 / 谋 / exit 0', () => {
  const r = run(['audit', FX('blind-stream.jsonl'), '--file', FX('blind-askfile.json')])
  assert.equal(r.status, 0)
  const j = JSON.parse(r.stdout)
  assert.deepEqual(j.score, { total: 10, late: 10, blind: 0 })
  assert.equal(j.band, '谋')
})

test('A2：audit guilt 夹具 —— 30 分 / 独 / exit 1', () => {
  const r = run(['audit', FX('guilt-stream.jsonl'), '--file', FX('guilt-askfile.json')])
  assert.equal(r.status, 1)
  const j = JSON.parse(r.stdout)
  assert.deepEqual(j.score, { total: 30, late: 0, blind: 30 })
  assert.equal(j.band, '独')
  assert.equal(j.verdict, 'fail')
})

test('A2：audit guilt 无册 —— 无册不判 / 0 分 / exit 0', () => {
  const r = run(['audit', FX('guilt-stream.jsonl')])
  assert.equal(r.status, 0)
  const j = JSON.parse(r.stdout)
  assert.equal(j.score.total, 0)
  assert.ok(j.issues.some((s) => s.includes('无稽疑册')))
})

test('audit --json 输出紧凑单行', () => {
  const r = run(['audit', FX('clean-stream.jsonl'), '--file', FX('clean-askfile.json'), '--json'])
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim().split('\n').length, 1)
})

test('audit --gate 提阈翻转裁决', () => {
  const r = run(['audit', FX('guilt-stream.jsonl'), '--file', FX('guilt-askfile.json'), '--gate', '31'])
  assert.equal(r.status, 0)
  const j = JSON.parse(r.stdout)
  assert.equal(j.verdict, 'pass')
})

test('audit 坏流报行号 exit 2', () => {
  writeTmp('bad.jsonl', '{"type":"tool_call"}\nnot-json\n')
  const r = run(['audit', join(TMP, 'bad.jsonl'), '--file', FX('clean-askfile.json')])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /第 2 行/)
})

test('audit 流缺失 exit 2', () => {
  const r = run(['audit', join(TMP, 'no-such.jsonl'), '--file', FX('clean-askfile.json')])
  assert.equal(r.status, 2)
})

test('audit --file 疑册缺失 exit 2', () => {
  const r = run(['audit', FX('clean-stream.jsonl'), '--file', join(TMP, 'no.json')])
  assert.equal(r.status, 2)
})

test('audit 坏疑册 exit 2', () => {
  const bad = join(TMP, 'bad.json')
  writeTmp('bad.json', '{"version":9,"asks":[]}')
  const r = run(['audit', FX('clean-stream.jsonl'), '--file', bad])
  assert.equal(r.status, 2)
})

// ---------------------------------------------------------------- register / revoke / list

test('register 成对写入、list 可见、askCount 含默认并入', () => {
  const file = join(TMP, '.jiyi.json')
  const r = run(['register', '--ask', 'X.md', '--on', 'write', '--file', file])
  assert.equal(r.status, 0)
  const l = run(['list', '--file', file])
  const j = JSON.parse(l.stdout)
  assert.deepEqual(j.asks, [{ path: 'X.md', on: 'write' }])
  assert.equal(j.noDefaults, false)
})

test('register 同 (path,on) 幂等去重', () => {
  const file = join(TMP, '.jiyi.json')
  run(['register', '--ask', 'X.md', '--on', 'write', '--file', file])
  run(['register', '--ask', 'X.md', '--on', 'write', '--file', file])
  const j = JSON.parse(run(['list', '--file', file]).stdout)
  assert.equal(j.asks.length, 1)
})

test('register --no-defaults 持久化、--defaults 复开', () => {
  const file = join(TMP, '.jiyi.json')
  run(['register', '--ask', 'X.md', '--on', 'write', '--no-defaults', '--file', file])
  assert.equal(JSON.parse(run(['list', '--file', file]).stdout).noDefaults, true)
  run(['register', '--ask', 'Y.md', '--on', 'any', '--defaults', '--file', file])
  const j = JSON.parse(run(['list', '--file', file]).stdout)
  assert.equal(j.noDefaults, false)
  assert.equal(j.asks.length, 2)
})

test('register 无 --ask exit 2、--on 非法值 exit 2、不成对 exit 2', () => {
  const file = join(TMP, '.jiyi.json')
  assert.equal(run(['register', '--file', file]).status, 2)
  assert.equal(run(['register', '--ask', 'X.md', '--on', 'fly', '--file', file]).status, 2)
  assert.equal(run(['register', '--ask', 'X.md', '--file', file]).status, 2)
  assert.equal(existsSync(file), false)
})

test('revoke 销条与无条 exit 2', () => {
  const file = join(TMP, '.jiyi.json')
  run(['register', '--ask', 'X.md', '--on', 'write', '--ask', 'X.md', '--on', 'exec', '--file', file])
  const r = run(['revoke', '--ask', 'X.md', '--file', file])
  assert.equal(r.status, 0)
  assert.equal(JSON.parse(r.stdout).removed, 2)
  assert.equal(run(['revoke', '--ask', 'X.md', '--file', file]).status, 2)
})

// ---------------------------------------------------------------- block / gate / 元命令

test('A5：block 同一疑册两次 shasum 逐字节一致', () => {
  const a = run(['block', '--file', FX('guilt-askfile.json')])
  const b = run(['block', '--file', FX('guilt-askfile.json')])
  assert.equal(a.status, 0)
  assert.equal(a.stdout, b.stdout)
  assert.match(a.stdout, /【稽疑 · 疑册】/)
  assert.match(a.stdout, /汝则有大疑/)
})

test('A5：block 空籍确定性文本、疑册缺失 exit 2', () => {
  const file = join(TMP, 'empty.json')
  writeTmp('empty.json', '{"version":1,"asks":[],"noDefaults":true}')
  const r = run(['block', '--file', file])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /空籍/)
  assert.equal(run(['block', '--file', join(TMP, 'no.json')]).status, 2)
})

test('gate --value 按门判 0/1', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  assert.equal(run(['gate', '--value', '15', '--gate', '10']).status, 1)
})

test('--version 与 --help', () => {
  assert.match(run(['--version']).stdout.trim(), /^0\.1\.0$/)
  assert.match(run(['--help']).stdout, /稽疑 · jiyi/)
  assert.match(run([]).stdout, /用法/)
})

test('未知命令 exit 2', () => {
  assert.equal(run(['fly']).status, 2)
})

// ---------------------------------------------------------------- A3 跨项目互认

test('A3：dingfen fenced 流喂 jiyi（clean-askfile）—— 15 / 疏 / exit 0', () => {
  const r = run(['audit', join(root, '..', 'dingfen', 'fixtures', 'fenced-stream.jsonl'), '--file', FX('clean-askfile.json')])
  assert.equal(r.status, 0)
  const j = JSON.parse(r.stdout)
  assert.deepEqual(j.score, { total: 15, late: 0, blind: 15 })
  assert.equal(j.band, '疏')
  assert.deepEqual(j.counts, { triggered: 3, fulfilled: 0, late: 0, blind: 1, emptyAsk: 0, unseen: 2, askCount: 3 })
})

test('A3：dingfen fenced 流喂 jiyi（空籍疑册）—— 无册不判 0 / 谋 / exit 0', () => {
  const file = join(TMP, 'none.json')
  writeTmp('none.json', '{"version":1,"asks":[],"noDefaults":true}')
  const r = run(['audit', join(root, '..', 'dingfen', 'fixtures', 'fenced-stream.jsonl'), '--file', file])
  assert.equal(r.status, 0)
  const j = JSON.parse(r.stdout)
  assert.equal(j.score.total, 0)
  assert.equal(j.band, '谋')
})

test('A3：jiyi guilt 流喂 dingfen（子进程真跑对方 bin）—— 争值 0 / 定 / exit 0', () => {
  const r = spawnSync(process.execPath, [DINGFEN_BIN, 'audit', FX('guilt-stream.jsonl')], {
    encoding: 'utf8', cwd: join(root, '..', 'dingfen'),
  })
  assert.equal(r.status, 0, r.stderr || r.stdout)
  const j = JSON.parse(r.stdout)
  assert.equal(j.score.total, 0)
  assert.equal(j.band, '定')
})

// ---------------------------------------------------------------- helpers

function writeTmp(name, text) {
  mkdirSync(TMP, { recursive: true })
  writeFileSync(join(TMP, name), text)
}
