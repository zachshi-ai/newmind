/**
 * 直笔 CLI 测试 —— 对 docs/04-acceptance.md 的 A9：
 * 六夹具退出码与数值、--gate/--excuse/--word/--mask/--no-defaults/--register 翻转、
 * block/list/enroll/gate 子命令、坏文件/坏流/未知命令的退出码 2。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const BIN = join(here, '..', 'src', 'bin', 'zhibi.js')
const FIX = (name) => join(here, '..', 'fixtures', name)

function run(args, opts = {}) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', ...opts })
}

const shasum = (s) => createHash('sha1').update(s).digest('hex')

// ---- audit 六夹具 ---------------------------------------------------------

test('A9: clean 夹具 → 讳值 0、带素、exit 0', () => {
  const r = run(['audit', FIX('clean-stream.jsonl')])
  assert.equal(r.status, 0)
  assert.ok(r.stdout.includes('"total": 0'))
  assert.ok(r.stdout.includes('"band": "素"'))
})

test('A9: hollow 夹具 → 讳值 30、带诬、exit 1（一空绿即诬）', () => {
  const r = run(['audit', FIX('hollow-stream.jsonl')])
  assert.equal(r.status, 1)
  assert.ok(r.stdout.includes('"total": 30'))
  assert.ok(r.stdout.includes('"band": "诬"'))
  assert.ok(r.stdout.includes('"verdict": "fail"'))
})

test('A9: healed 夹具 → 讳值 10、带素、exit 0；--gate 10 翻 fail', () => {
  const r = run(['audit', FIX('healed-stream.jsonl')])
  assert.equal(r.status, 0)
  assert.ok(r.stdout.includes('"total": 10'))
  const r2 = run(['audit', FIX('healed-stream.jsonl'), '--gate', '10'])
  assert.equal(r2.status, 1)
  assert.ok(r2.stdout.includes('"verdict": "fail"'))
})

test('A9: honestred 夹具 → 讳值 0、诚红 1、exit 0', () => {
  const r = run(['audit', FIX('honestred-stream.jsonl')])
  assert.equal(r.status, 0)
  assert.ok(r.stdout.includes('"chenghong": 1'))
})

test('A9: mixed 夹具 → 讳值 70、带诬、exit 1', () => {
  const r = run(['audit', FIX('mixed-stream.jsonl')])
  assert.equal(r.status, 1)
  assert.ok(r.stdout.includes('"total": 70'))
})

test('A9: excused 夹具带 --excuse → 0、exit 0；去豁免翻 1', () => {
  const r = run(['audit', FIX('excused-stream.jsonl'), '--excuse', 'smoke-optional'])
  assert.equal(r.status, 0)
  assert.ok(r.stdout.includes('"huibi": 1'))
  const r2 = run(['audit', FIX('excused-stream.jsonl')])
  assert.equal(r2.status, 1)
})

test('A9: --excuse 支持 @file 逐行一条（# 注释跳过）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhibi-cli-'))
  const file = join(dir, 'excuses.txt')
  writeFileSync(file, '# 注释\nsmoke-optional\n\nallow-fail-demo\n')
  const r = run(['audit', FIX('excused-stream.jsonl'), '--excuse', `@${file}`])
  assert.equal(r.status, 0)
  rmSync(dir, { recursive: true, force: true })
})

// ---- 选项语义 -------------------------------------------------------------

test('A9: --word 显式史词生效（族表外命令入账）', () => {
  const stream = join(
    mkdtempSync(join(tmpdir(), 'zhibi-cli-')),
    's.jsonl',
  )
  writeFileSync(
    stream,
    [
      '{"type":"tool_call","id":"a","name":"bash","args":{"command":"zsmoke verify-all || true"}}',
      '{"type":"tool_result","id":"a","name":"bash","args":{},"isError":false}',
    ].join('\n'),
  )
  const no = run(['audit', stream])
  assert.equal(no.status, 0) // 无登记 → 常事不书
  const yes = run(['audit', stream, '--word', 'zsmoke\\s+verify-all'])
  assert.equal(yes.status, 1) // 显式登记 → 空绿 30
  rmSync(join(stream, '..'), { recursive: true, force: true })
})

test('A9: --mask 显式讳形生效', () => {
  const stream = join(mkdtempSync(join(tmpdir(), 'zhibi-cli-')), 's.jsonl')
  writeFileSync(
    stream,
    [
      '{"type":"tool_call","id":"a","name":"bash","args":{"command":"make all --silent-skip"}}',
      '{"type":"tool_result","id":"a","name":"bash","args":{},"isError":false}',
    ].join('\n'),
  )
  const r = run(['audit', stream, '--mask', '--silent-skip'])
  assert.equal(r.status, 1)
  assert.ok(r.stdout.includes('--silent-skip'))
  rmSync(join(stream, '..'), { recursive: true, force: true })
})

test('A9: --no-defaults 关闭默认表后 hollow 流不再入账', () => {
  const r = run(['audit', FIX('hollow-stream.jsonl'), '--no-defaults'])
  assert.equal(r.status, 0)
  assert.ok(r.stdout.includes('"shishi": 0'))
})

test('A9: --register 载入册文件（豁免词生效翻 0）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhibi-cli-'))
  const reg = join(dir, 'reg.json')
  writeFileSync(reg, JSON.stringify({ version: 1, excuses: ['smoke-optional'] }))
  const r = run(['audit', FIX('excused-stream.jsonl'), '--register', reg])
  assert.equal(r.status, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('A9: --register 缺省载入 ./.zhibi.json（存在时）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhibi-cwd-'))
  writeFileSync(join(dir, '.zhibi.json'), JSON.stringify({ version: 1, excuses: ['smoke-optional'] }))
  const prev = process.cwd()
  process.chdir(dir)
  try {
    const r = run(['audit', FIX('excused-stream.jsonl')])
    assert.equal(r.status, 0)
  } finally {
    process.chdir(prev)
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---- block / list / enroll / gate ----------------------------------------

test('A9: block 两跑 shasum 相同；--json 包装；文本含点名', () => {
  const a = run(['block', FIX('mixed-stream.jsonl')])
  const b = run(['block', FIX('mixed-stream.jsonl')])
  assert.equal(a.status, 1) // mixed 越门
  assert.equal(shasum(a.stdout), shasum(b.stdout))
  assert.ok(a.stdout.includes('【直笔 · 实录块 #1】'))
  assert.ok(a.stdout.includes('空绿点名（按族序）：'))
  const j = run(['block', FIX('mixed-stream.jsonl'), '--json'])
  assert.ok(j.stdout.includes('"k":1'))
  assert.ok(j.stdout.includes('"text"'))
})

test('A9: list 出生效笔册（默认含 12 词 6 形；--no-defaults 只剩显式）', () => {
  const r = run(['list'])
  assert.ok(r.stdout.includes('"words": 12'))
  assert.ok(r.stdout.includes('npm|pnpm'))
  const r2 = run(['list', '--no-defaults', '--word', 'custom\\s+word'])
  const parsed = JSON.parse(r2.stdout)
  assert.deepEqual(parsed.words, ['custom\\s+word'])
  assert.equal(parsed.noDefaults, true)
  assert.equal(parsed.counts.words, 1)
})

test('A9: enroll 并集去重、只增不删（--file 指定目标）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhibi-enroll-'))
  const file = join(dir, 'reg.json')
  const r1 = run(['enroll', '--file', file, '--word', 'alpha\\s+check', '--excuse', 'opt-1'])
  assert.equal(r1.status, 0)
  const r2 = run(['enroll', '--file', file, '--word', 'alpha\\s+check', '--word', 'beta\\s+check'])
  assert.equal(r2.status, 0)
  const reg = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(reg.words, ['alpha\\s+check', 'beta\\s+check'])
  assert.deepEqual(reg.excuses, ['opt-1'])
  const r3 = run(['audit', FIX('hollow-stream.jsonl'), '--register', file])
  assert.equal(r3.status, 1) // 既有册不改变默认行为（words 只增）
  rmSync(dir, { recursive: true, force: true })
})

test('A9: gate --value 裁决（29/30 边界）', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  const j = JSON.parse(run(['gate', '--value', '30', '--gate', '60', '--json']).stdout)
  assert.deepEqual(j, { value: 30, gate: 60, verdict: 'pass', ok: true })
})

test('A9: help 与 version', () => {
  const h = run(['--help'])
  assert.equal(h.status, 0)
  assert.ok(h.stdout.includes('用法'))
  assert.ok(run(['--version']).stdout.trim().match(/^\d+\.\d+\.\d+$/))
})

// ---- 错误口径 -------------------------------------------------------------

test('A9: 多流 → 2（audit 恰取一流）', () => {
  const r = run(['audit', FIX('clean-stream.jsonl'), FIX('hollow-stream.jsonl')])
  assert.equal(r.status, 2)
  assert.ok(r.stderr.includes('恰取一流'))
})

test('A9: 坏文件 → 2；坏流报行号 → 2', () => {
  assert.equal(run(['audit', join(here, 'no-such-file.jsonl')]).status, 2)
  const dir = mkdtempSync(join(tmpdir(), 'zhibi-bad-'))
  const bad = join(dir, 'bad.jsonl')
  writeFileSync(bad, '{"type":"tool_call","id":"a"}\n这不是JSON\n')
  const r = run(['audit', bad])
  assert.equal(r.status, 2)
  assert.ok(r.stderr.includes('第 2 行'))
  rmSync(dir, { recursive: true, force: true })
})

test('A9: 未知命令 / 未知选项 / 缺参数 → 2', () => {
  assert.equal(run(['frobnicate']).status, 2)
  assert.equal(run(['audit', FIX('clean-stream.jsonl'), '--bogus']).status, 2)
  assert.equal(run(['audit']).status, 2)
  assert.equal(run(['enroll']).status, 2) // 无任何登记项
})
