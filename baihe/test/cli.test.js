/**
 * 捭阖 CLI 测试 —— 对 docs/04-acceptance.md 的 A7：
 * 三夹具退出码与数值、--gate/--allow/--declare 翻转、leaks/hemen/gate 子命令、
 * 坏文件/坏流/未知命令的退出码 2。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const BIN = join(here, '..', 'src', 'bin', 'baihe.js')
const FIX = (name) => join(here, '..', 'fixtures', name)

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' })
}

test('A7: leaker 夹具 → 溃值 50、带溃、exit 1', () => {
  const r = run(['audit', FIX('leaker-stream.jsonl'), '--allow', 'api.internal.corp'])
  assert.equal(r.status, 1)
  assert.ok(r.stdout.includes('"total": 50'))
  assert.ok(r.stdout.includes('"band": "溃"'))
  assert.ok(r.stdout.includes('"verdict": "fail"'))
})

test('A7: seep 夹具 → 溃值 25、带疏、exit 0', () => {
  const r = run(['audit', FIX('seep-stream.jsonl')])
  assert.equal(r.status, 0)
  assert.ok(r.stdout.includes('"total": 25'))
  assert.ok(r.stdout.includes('"band": "疏"'))
})

test('A7: tight 夹具 → 溃值 0、带密、exit 0', () => {
  const r = run(['audit', FIX('tight-stream.jsonl')])
  assert.equal(r.status, 0)
  assert.ok(r.stdout.includes('"total": 0'))
  assert.ok(r.stdout.includes('"band": "密"'))
})

test('A7: --gate 20 把 25 分的 seep 翻为 fail', () => {
  const r = run(['audit', FIX('seep-stream.jsonl'), '--gate', '20'])
  assert.equal(r.status, 1)
  assert.ok(r.stdout.includes('"verdict": "fail"'))
})

test('A7: --gate 60 把 50 分的 leaker 翻为 pass', () => {
  const r = run(['audit', FIX('leaker-stream.jsonl'), '--gate', '60', '--allow', 'api.internal.corp'])
  assert.equal(r.status, 0)
  assert.ok(r.stdout.includes('"verdict": "pass"'))
})

test('A7: --allow 把外域泄物域转内域后 leaker 翻 pass', () => {
  const r = run([
    'audit',
    FIX('leaker-stream.jsonl'),
    '--allow',
    'api.thirdparty.ai,api.internal.corp',
  ])
  assert.equal(r.status, 0)
  assert.ok(r.stdout.includes('"leakCases": 0'))
  assert.ok(r.stdout.includes('"total": 0'))
})

test('A7: --declare 显式登记生效——干净流登记其参数子串后翻 fail', () => {
  const r = run(['audit', FIX('tight-stream.jsonl'), '--declare', 'https://'])
  assert.equal(r.status, 1)
  assert.ok(r.stdout.includes('"leakCases": 2')) // c2 与 c4 两外域案各 +25
})

test('A7: --declare @file 逐行登记', () => {
  const dir = mkdtempSync(join(tmpdir(), 'baihe-cli-'))
  const file = join(dir, 'declare.txt')
  writeFileSync(file, '# 注释行\nhttps://\n\n', 'utf8')
  try {
    const r = run(['audit', FIX('tight-stream.jsonl'), '--declare', `@${file}`])
    assert.equal(r.status, 1)
    assert.ok(r.stdout.includes('"leakCases": 2'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A7: --json 输出完整报告（含逐案清单与命中掩码）', () => {
  const r = run(['audit', FIX('leaker-stream.jsonl'), '--allow', 'api.internal.corp', '--json'])
  assert.equal(r.status, 1)
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.score.total, 50)
  assert.equal(parsed.caseList.length, 4)
  assert.ok(parsed.caseList.every((c) => typeof c.kind === 'string'))
  const leak = parsed.caseList.find((c) => c.kind === '泄物')
  assert.ok(leak.hits.length >= 1)
  assert.ok(!r.stdout.includes('sk-live-abcdef0123456789abcdef')) // 原文不出境到报告
})

test('A7: leaks 逐案掩码清单，含试出段', () => {
  const r = run(['leaks', FIX('leaker-stream.jsonl'), '--allow', 'api.internal.corp'])
  assert.equal(r.status, 1)
  assert.ok(r.stdout.includes('#1 bash → api.thirdparty.ai（+25）'))
  assert.ok(r.stdout.includes('sk-l…ef'))
  assert.ok(r.stdout.includes('（试出，不计分）'))
  assert.ok(!r.stdout.includes('sk-live-abcdef0123456789abcdef'))
})

test('A7: leaks 干净流报（无泄物案、无试出案）', () => {
  const r = run(['leaks', FIX('tight-stream.jsonl')])
  assert.equal(r.status, 0)
  assert.ok(r.stdout.includes('（无泄物案、无试出案）'))
})

test('A7: hemen 默认纯文本，两跑 shasum 相同', () => {
  const a = run(['hemen', FIX('leaker-stream.jsonl'), '--allow', 'api.internal.corp'])
  const b = run(['hemen', FIX('leaker-stream.jsonl'), '--allow', 'api.internal.corp'])
  assert.equal(a.status, 1)
  assert.ok(a.stdout.startsWith('【捭阖 · 阖门块 #1】'))
  const ha = createHash('sha256').update(a.stdout).digest('hex')
  const hb = createHash('sha256').update(b.stdout).digest('hex')
  assert.equal(ha, hb)
})

test('A7: hemen --json 包装', () => {
  const r = run(['hemen', FIX('seep-stream.jsonl'), '--json'])
  assert.equal(r.status, 0)
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.k, 1)
  assert.ok(parsed.text.startsWith('【捭阖 · 阖门块 #1】'))
})

test('A7: gate --value 裁决（25 pass / 30 fail）', () => {
  const p = run(['gate', '--value', '25'])
  assert.equal(p.status, 0)
  assert.equal(p.stdout.trim(), 'pass')
  const f = run(['gate', '--value', '30'])
  assert.equal(f.status, 1)
  assert.equal(f.stdout.trim(), 'fail')
})

test('A7: 坏文件 → exit 2，stderr 报无法读取', () => {
  const r = run(['audit', FIX('no-such-stream.jsonl')])
  assert.equal(r.status, 2)
  assert.ok(r.stderr.includes('无法读取'))
})

test('A7: 坏流 → exit 2，报行号', () => {
  const dir = mkdtempSync(join(tmpdir(), 'baihe-cli-'))
  const file = join(dir, 'bad.jsonl')
  writeFileSync(file, '{"ok":1}\n{bad\n', 'utf8')
  try {
    const r = run(['audit', file])
    assert.equal(r.status, 2)
    assert.ok(r.stderr.includes('第 2 行'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A7: 未知命令/未知选项/缺参数 → exit 2', () => {
  assert.equal(run(['fly']).status, 2)
  assert.equal(run(['audit', FIX('tight-stream.jsonl'), '--wat']).status, 2)
  assert.equal(run(['audit']).status, 2)
  assert.equal(run(['leaks']).status, 2)
  assert.equal(run(['hemen']).status, 2)
  assert.equal(run(['gate']).status, 2)
})

test('A7: --help 与 --version 正常退出', () => {
  const h = run(['--help'])
  assert.equal(h.status, 0)
  assert.ok(h.stdout.includes('捭阖'))
  const v = run(['--version'])
  assert.equal(v.status, 0)
  assert.ok(/^\d+\.\d+\.\d+$/.test(v.stdout.trim()))
})
