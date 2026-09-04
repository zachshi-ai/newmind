/**
 * CLI 测试 —— 退出码语义（0 通过 / 1 验收门失败 / 2 用法输入错误）与输出形状。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { validateContract } from '../src/core/contract.js'

const here = dirname(fileURLToPath(import.meta.url))
const BIN = join(here, '..', 'src', 'bin', 'zhengnian.js')
const fx = (name) => join(here, '..', 'fixtures', name)

function run(args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr }
}

test('CLI：--help 与 --version', () => {
  const help = run(['--help'])
  assert.equal(help.code, 0)
  assert.match(help.stdout, /用法/)
  const ver = run(['--version'])
  assert.equal(ver.code, 0)
  assert.match(ver.stdout, /zhengnian v/)
})

test('CLI：template 输出的骨架通过契约 schema 校验', () => {
  const r = run(['template'])
  assert.equal(r.code, 0)
  assert.equal(validateContract(JSON.parse(r.stdout)).valid, true)
})

test('CLI：contract 合法 → 0；非法契约 → 2；坏 JSON → 2', () => {
  assert.equal(run(['contract', fx('clean-wish.json')]).code, 0)

  const tmp = mkdtempSync(join(tmpdir(), 'zn-cli-'))
  const bad = join(tmp, 'bad.json')
  writeFileSync(bad, JSON.stringify({ version: 2, id: 'x' }))
  assert.equal(run(['contract', bad]).code, 2)

  const broken = join(tmp, 'broken.json')
  writeFileSync(broken, '{oops')
  const r = run(['contract', broken])
  assert.equal(r.code, 2)
  assert.match(r.stderr, /不是合法 JSON/)
  rmSync(tmp, { recursive: true, force: true })
})

test('CLI：audit 干净夹具 → 0（ok:true，score:0）', () => {
  const r = run(['audit', fx('clean-wish.json'), fx('clean-stream.jsonl')])
  assert.equal(r.code, 0)
  const report = JSON.parse(r.stdout)
  assert.equal(report.ok, true)
  assert.equal(report.score, 0)
  assert.equal(report.band, '净')
})

test('CLI：audit 蒙尘夹具 → 1（score:66，band:蒙）', () => {
  const r = run(['audit', fx('drifting-wish.json'), fx('drifting-stream.jsonl')])
  assert.equal(r.code, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score, 66)
  assert.equal(report.band, '蒙')
  assert.equal(report.ok, false)
})

test('CLI：audit --acceptance——终验未对账 → 1（a2 artifact 从未发生）', () => {
  const r = run(['audit', fx('drifting-wish.json'), fx('drifting-stream.jsonl'), '--acceptance'])
  assert.equal(r.code, 1)
  const report = JSON.parse(r.stdout)
  assert.deepEqual(report.acceptance.unfulfilled, ['a2'])
})

test('CLI：audit --gate 覆盖（66 < 70 → 0）', () => {
  const r = run(['audit', fx('drifting-wish.json'), fx('drifting-stream.jsonl'), '--gate', '70'])
  assert.equal(r.code, 0)
  assert.equal(JSON.parse(r.stdout).gate, 70)
})

test('CLI：audit --acceptance --cwd——artifact 落盘即 verified → 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zn-cli2-'))
  mkdirSync(join(dir, 'reports'))
  writeFileSync(join(dir, 'reports', 'repro-fixed.txt'), 'ok')
  const r = run(['audit', fx('drifting-wish.json'), fx('drifting-stream.jsonl'), '--gate', '100', '--acceptance', '--cwd', dir])
  assert.equal(r.code, 0)
  assert.equal(JSON.parse(r.stdout).acceptance.verdict, 'fulfilled')
  rmSync(dir, { recursive: true, force: true })
})

test('CLI：audit --max-stale 收紧拂拭条款（两段各 4 > 3 → 20 分浮）并配 --gate 15 翻红灯', () => {
  const r = run(['audit', fx('clean-wish.json'), fx('clean-stream.jsonl'), '--max-stale', '3'])
  assert.equal(r.code, 0, '20 < 默认阈 30 → 通过')
  const report = JSON.parse(r.stdout)
  assert.deepEqual(report.breakdown, { forget: 0, grasp: 0, cadence: 20 })
  assert.equal(report.band, '浮')

  const gated = run(['audit', fx('clean-wish.json'), fx('clean-stream.jsonl'), '--max-stale', '3', '--gate', '15'])
  assert.equal(gated.code, 1, '20 ≥ 15 → 验收门红灯')
})

test('CLI：audit --window 收窄/放宽失念窗口（报告反映覆盖值，分项随之变化）', () => {
  const narrow = run(['audit', fx('drifting-wish.json'), fx('drifting-stream.jsonl'), '--window', '3'])
  assert.equal(narrow.code, 1, '58 = 失念 24 + 攀缘 24 + 息尘 10 ≥ 30')
  const report = JSON.parse(narrow.stdout)
  assert.equal(report.window, 3, '报告.window 反映 CLI 覆盖')
  assert.deepEqual(report.breakdown, { forget: 24, grasp: 24, cadence: 10 }, '窗口 3：只看尾部 3 连')

  const wider = run(['audit', fx('drifting-wish.json'), fx('drifting-stream.jsonl'), '--window', '9'])
  assert.equal(JSON.parse(wider.stdout).breakdown.forget, 32, '窗口 9：尾部连击仍是 4（c31–c34）')
})

test('CLI：audit 输入错误 → 2（文件缺失 / 契约非法）', () => {
  assert.equal(run(['audit', fx('clean-wish.json'), join(tmpdir(), 'zn-missing.jsonl')]).code, 2)
  assert.equal(run(['audit', join(tmpdir(), 'zn-missing-wish.json'), fx('clean-stream.jsonl')]).code, 2)
  const tmp = mkdtempSync(join(tmpdir(), 'zn-cli3-'))
  const bad = join(tmp, 'bad-wish.json')
  writeFileSync(bad, JSON.stringify({ version: 1, id: 'x', wish: 'w' }))
  assert.equal(run(['audit', bad, fx('clean-stream.jsonl')]).code, 2)
  rmSync(tmp, { recursive: true, force: true })
})

test('CLI：reanchor 无流为纯愿块（无尘值行）；--stream 携带尘值；--json 包装', () => {
  const plain = run(['reanchor', fx('clean-wish.json')])
  assert.equal(plain.code, 0)
  assert.match(plain.stdout, /本愿：/)
  assert.equal(plain.stdout.includes('尘值'), false)

  const withStream = run(['reanchor', fx('drifting-wish.json'), '--stream', fx('drifting-stream.jsonl')])
  assert.equal(withStream.code, 0)
  assert.match(withStream.stdout, /尘值：66（失念 32 · 攀缘 24 · 息尘 10）/)

  const json = run(['reanchor', fx('clean-wish.json'), '--json'])
  assert.equal(json.code, 0)
  assert.ok(JSON.parse(json.stdout).text.includes('时时勤拂拭'))
})

test('CLI：未知命令 → 2；未知选项 → 2', () => {
  assert.equal(run(['fly']).code, 2)
  assert.equal(run(['audit', fx('clean-wish.json'), fx('clean-stream.jsonl'), '--nope']).code, 2)
})
