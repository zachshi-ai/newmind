/**
 * CLI 测试 —— 退出码语义（0 通过 / 1 门禁失败 / 2 用法输入错误）与输出形状。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const BIN = join(here, '..', 'src', 'bin', 'jiubian.js')
const fx = (name) => join(here, '..', 'fixtures', name)

function run(args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr }
}

test('CLI：--help 与 --version', () => {
  const help = run(['--help'])
  assert.equal(help.code, 0)
  assert.match(help.stdout, /用法/)
  assert.match(help.stdout, /jiubian audit/)
  const ver = run(['--version'])
  assert.equal(ver.code, 0)
  assert.match(ver.stdout, /0\.1\.0/)
})

test('CLI：audit 健康夹具 → exit 0，报告形状完整', () => {
  const r = run(['audit', fx('adaptive-stream.jsonl')])
  assert.equal(r.code, 0)
  const report = JSON.parse(r.stdout)
  assert.equal(report.calls, 7)
  assert.equal(report.score.total, 0)
  assert.equal(report.band, '合')
  assert.equal(report.ok, true)
  assert.equal(report.verdict, 'pass')
  assert.equal(report.gate, 30)
})

test('CLI：audit 盲捶夹具 → exit 1，+36 入 issues', () => {
  const r = run(['audit', fx('stubborn-stream.jsonl')])
  assert.equal(r.code, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.total, 36)
  assert.equal(report.band, '胶')
  assert.equal(report.ok, false)
  assert.match(report.issues.join(' '), /\+36/)
})

test('CLI：audit 游骑夹具 → exit 1，游骑 ×2', () => {
  const r = run(['audit', fx('grazing-stream.jsonl')])
  assert.equal(r.code, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.rash, 40)
  assert.match(report.issues.join(' '), /游骑 ×2/)
})

test('CLI：--gate 覆盖阈门（36 分对门 37 → 0；对门 10 → 1）', () => {
  assert.equal(run(['audit', fx('stubborn-stream.jsonl'), '--gate', '37']).code, 0)
  assert.equal(run(['audit', fx('stubborn-stream.jsonl'), '--gate', '10']).code, 1)
})

test('CLI：--json 紧凑输出（单行合法 JSON）', () => {
  const r = run(['audit', fx('adaptive-stream.jsonl'), '--json'])
  assert.equal(r.code, 0)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  assert.equal(JSON.parse(r.stdout).calls, 7)
})

test('CLI：audit 文件不存在 → exit 2 + stderr', () => {
  const r = run(['audit', '/nonexistent/stream.jsonl'])
  assert.equal(r.code, 2)
  assert.match(r.stderr, /无法读取/)
})

test('CLI：audit 坏 JSON → exit 2', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jb-cli-'))
  const bad = join(tmp, 'bad.jsonl')
  writeFileSync(bad, '{"type":"tool_call"\n')
  assert.equal(run(['audit', bad]).code, 2)
})

test('CLI：audit 缺文件参数 → exit 2；未知命令 → exit 2', () => {
  assert.equal(run(['audit']).code, 2)
  assert.equal(run(['frobnicate']).code, 2)
  assert.equal(run(['audit', '--gate', 'oops', fx('adaptive-stream.jsonl')]).code, 2)
})

test('CLI：gate --value 按默认门 30 裁决', () => {
  assert.equal(run(['gate', '--value', '30']).code, 1, '30 ≥ 30 → fail')
  assert.equal(run(['gate', '--value', '29']).code, 0)
  const out = JSON.parse(run(['gate', '--value', '36']).stdout)
  assert.deepEqual(out, { value: 36, gate: 30, verdict: 'fail', ok: false })
})

test('CLI：gate --gate 覆盖门', () => {
  assert.equal(run(['gate', '--value', '36', '--gate', '37']).code, 0)
  assert.equal(run(['gate', '--value', '36', '--gate', '36']).code, 1)
})

test('CLI：gate 缺 --value → exit 2', () => {
  assert.equal(run(['gate']).code, 2)
})

test('CLI：bianfang 纯文本（含变方标志与失机值行）', () => {
  const r = run(['bianfang', fx('grazing-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /【九变 · 变方】势账 #1/)
  assert.match(r.stdout, /悬账：无——势途相合，续行。/)
  assert.match(r.stdout, /游骑前科：2 轮/)
  assert.match(r.stdout, /失机值：40（胶）/)
})

test('CLI：bianfang --json 包装（k=1 + openDebts + text）', () => {
  const r = run(['bianfang', fx('grazing-stream.jsonl'), '--json'])
  assert.equal(r.code, 0)
  const obj = JSON.parse(r.stdout)
  assert.equal(obj.k, 1)
  assert.equal(obj.openDebts, 0)
  assert.match(obj.text, /【九变 · 变方】/)
})

test('CLI：bianfang 对同一流两次输出逐字节一致', () => {
  const a = run(['bianfang', fx('stubborn-stream.jsonl')]).stdout
  const b = run(['bianfang', fx('stubborn-stream.jsonl')]).stdout
  assert.equal(a, b)
})

test('CLI：跨项目流直接验尸（zhizhi 旧格式 + jiebi 带 id）', () => {
  const zz = run(['audit', join(here, '..', '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl')])
  assert.equal(zz.code, 0, 'zhizhi 流 24 分 < 门 30 → pass')
  assert.equal(JSON.parse(zz.stdout).band, '钝')
  const jb = run(['audit', join(here, '..', '..', 'jiebi', 'fixtures', 'sample-stream.jsonl')])
  assert.equal(jb.code, 0, 'jiebi 流 24 分 < 门 30 → pass')
  assert.equal(JSON.parse(jb.stdout).score.total, 24)
})
