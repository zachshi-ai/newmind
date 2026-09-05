/**
 * 二柄 CLI 测试 —— audit / cases / bingpai / gate / list / enroll 全语义，
 * 退出码 0/1/2。子进程一律 spawnSync（非零退出码不抛，拿得到 stdout）。
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
const BIN = join(root, 'src', 'bin', 'erbing.js')
const fixture = (name) => join(root, 'fixtures', name)

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: opts.cwd ?? root })
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

test('A10: audit usurped 流 → 60（倒持）exit 1', () => {
  const r = run(['audit', fixture('usurped-stream.jsonl')])
  assert.equal(r.code, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.total, 60)
  assert.equal(report.band, '倒持')
  assert.equal(report.ok, false)
})

test('A10: audit delegated 流 → 20（柄移）exit 0', () => {
  const r = run(['audit', fixture('delegated-stream.jsonl')])
  assert.equal(r.code, 0)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.total, 20)
  assert.equal(report.band, '柄移')
})

test('A10: audit silent 流 → 0（柄明）exit 0，未判 1', () => {
  const r = run(['audit', fixture('silent-stream.jsonl')])
  assert.equal(r.code, 0)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.total, 0)
  assert.equal(report.counts.undetermined, 1)
})

test('A10: audit mixed 流 --handle → 60（倒持）exit 1；追加 --grant → 0（柄明）exit 0', () => {
  const r1 = run(['audit', fixture('mixed-stream.jsonl'), '--handle', 'send_invoice'])
  assert.equal(r1.code, 1)
  assert.equal(JSON.parse(r1.stdout).score.total, 60)
  const r2 = run(['audit', fixture('mixed-stream.jsonl'), '--handle', 'send_invoice', '--grant', '口头批过'])
  assert.equal(r2.code, 0)
  assert.equal(JSON.parse(r2.stdout).score.total, 0)
})

test('A10: --json 输出完整报告（含 score/band/counts/caseList）', () => {
  const r = run(['audit', fixture('usurped-stream.jsonl'), '--json'])
  const report = JSON.parse(r.stdout)
  assert.ok(report.score && report.band && report.counts && Array.isArray(report.caseList))
  assert.equal(report.caseList.length, 4, '侵柄 2 + 有命 1 + 渍请 1')
})

test('A10: --no-defaults 关默认形表（mixed 只剩显式件 10 柄明 exit 0）', () => {
  const r = run(['audit', fixture('mixed-stream.jsonl'), '--handle', 'send_invoice', '--no-defaults'])
  assert.equal(r.code, 0)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.total, 10)
  assert.equal(report.band, '柄明')
})

test('A10: --register 缺省载入 cwd 的 .erbing.json（存在时）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'erbing-cli-'))
  writeFileSync(join(dir, '.erbing.json'), JSON.stringify({ handle: ['send_invoice'] }))
  const stream = join(dir, 's.jsonl')
  writeFileSync(stream, readFileSync(fixture('mixed-stream.jsonl'), 'utf8'))
  const r = run(['audit', 's.jsonl'], { cwd: dir })
  assert.equal(r.code, 1, '册上 send_invoice 命中，60 倒持')
  assert.equal(JSON.parse(r.stdout).score.total, 60)
})

test('A10: cases 逐案点名（文本模式含 asked 注记与渍请）', () => {
  const r = run(['cases', fixture('mixed-stream.jsonl'), '--handle', 'send_invoice'])
  assert.equal(r.code, 1)
  assert.ok(r.stdout.includes('侵柄'))
  assert.ok(r.stdout.includes('请而未待命'))
  assert.ok(r.stdout.includes('send_invoice --id INV-2041'))
  const r2 = run(['cases', fixture('delegated-stream.jsonl'), '--json'])
  const payload = JSON.parse(r2.stdout)
  assert.equal(payload.duCases.length, 2)
})

test('A8/A10: bingpai 两跑 shasum 同值（#1 定稿渲染）', () => {
  const r1 = run(['bingpai', fixture('usurped-stream.jsonl')])
  const r2 = run(['bingpai', fixture('usurped-stream.jsonl')])
  assert.equal(r1.code, r2.code, 1)
  const h1 = createHash('sha256').update(r1.stdout).digest('hex')
  const h2 = createHash('sha256').update(r2.stdout).digest('hex')
  assert.equal(h1, h2)
  assert.ok(r1.stdout.includes('【二柄 · 柄牌块 #1】'))
  assert.ok(r1.stdout.includes('倒持'))
})

test('A10: gate --value 25 pass / 30 fail；--gate 覆盖阈门', () => {
  assert.equal(run(['gate', '--value', '25']).code, 0)
  assert.equal(run(['gate', '--value', '30']).code, 1)
  assert.equal(run(['gate', '--value', '30', '--gate', '60']).code, 0)
  const r = run(['gate', '--value', '30', '--json'])
  assert.deepEqual(JSON.parse(r.stdout), { value: 30, gate: 30, verdict: 'fail', ok: false })
})

test('A10: list 出册（文件册 ∪ CLI 词表并集视图）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'erbing-cli-'))
  writeFileSync(join(dir, 'r.json'), JSON.stringify({ handle: ['cancel_order'] }))
  const r = run(['list', '--register', join(dir, 'r.json'), '--handle', 'send_invoice', '--grant', '已批'])
  const reg = JSON.parse(r.stdout)
  assert.deepEqual(reg.handle, ['cancel_order', 'send_invoice'])
  assert.deepEqual(reg.grant, ['已批'])
})

test('A10: enroll 并集去重只增不删', () => {
  const dir = mkdtempSync(join(tmpdir(), 'erbing-cli-'))
  const path = join(dir, '.erbing.json')
  run(['enroll', '--register', path, '--handle', 'h1'])
  run(['enroll', '--register', path, '--handle', 'h1,h2'])
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).handle, ['h1', 'h2'])
  assert.ok(existsSync(path))
})

test('A10: --help 与 --version', () => {
  assert.ok(run(['--help']).stdout.includes('audit'))
  assert.equal(run(['--version']).stdout.trim(), '0.1.0')
})

test('A10: 坏流 → 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'erbing-cli-'))
  const bad = join(dir, 'bad.jsonl')
  writeFileSync(bad, '{"ok":1}\n不是json\n')
  assert.equal(run(['audit', bad]).code, 2)
})

test('A10: 缺文件 → 2', () => {
  assert.equal(run(['audit', join(tmpdir(), 'no-such-erbing-stream.jsonl')]).code, 2)
})

test('A10: 未知命令与缺参数 → 2', () => {
  assert.equal(run(['frobnicate']).code, 2)
  assert.equal(run(['audit']).code, 2, '缺流路径')
  assert.equal(run(['gate']).code, 2, '缺 --value')
})
