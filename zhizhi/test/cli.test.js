/**
 * CLI 测试 —— 以子进程方式驱动真实 CLI，断言 JSON 输出与退出码语义。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createEngine } from '../src/core/engine.js'

const here = dirname(fileURLToPath(import.meta.url))
const BIN = join(here, '..', 'src', 'bin', 'zhizhi.js')
const FIXTURE = join(here, '..', 'fixtures', 'sample-stream.jsonl')

function run(args, { expectCode = 0 } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8' })
    assert.equal(expectCode, 0, `期望退出码 ${expectCode}，实际 0`)
    return { code: 0, stdout }
  } catch (error) {
    assert.equal(error.status, expectCode, `退出码不符: ${error.message}`)
    return { code: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

test('CLI --help 与 --version', () => {
  const h = run(['--help'])
  assert.match(h.stdout, /用法|zhizhi audit/)
  const v = run(['--version'])
  assert.match(v.stdout, /v0\.1\.0/)
})

test('CLI audit：样例会话 what-if 报告（1 次止损 + 1 次盲写；t1 无证据、t2 已核验）', () => {
  const { stdout } = run(['audit', FIXTURE])
  const r = JSON.parse(stdout)
  assert.equal(r.mode, 'whatif')
  assert.equal(r.totals.calls, 8)
  assert.equal(r.totals.intercepted, 2)
  assert.equal(r.totals.interceptedByRule.stopLoss, 1)
  assert.equal(r.totals.interceptedByRule.readBeforeWrite, 1)
  assert.equal(r.waste.savedRoundTrips, 2)
  assert.deepEqual(r.unverifiedTurns, [{ id: 't1', calls: 5 }])
  assert.equal(r.turns.find(t => t.id === 't2').verified, true)
  assert.equal(r.verdict, 'pass')
})

test('CLI audit --fail-on-unverified：无证据 turn → 退出码 1', () => {
  const { stdout } = run(['audit', '--fail-on-unverified', FIXTURE], { expectCode: 1 })
  const r = JSON.parse(stdout)
  assert.equal(r.verdict, 'fail')
})

test('CLI audit --threshold：调低阈值改变拦截数', () => {
  const { stdout } = run(['audit', '--threshold', '2', FIXTURE])
  const r = JSON.parse(stdout)
  // 阈值 2：第 3、4 次重试都被拦，加上盲写共 3 次
  assert.equal(r.totals.interceptedByRule.stopLoss, 2)
  assert.equal(r.totals.intercepted, 3)
})

test('CLI audit --gated：对运行时导出流对账一致', () => {
  // 用引擎真实生成一份 gated 流
  const e = createEngine({ stopLoss: { threshold: 2 } })
  const lines = [{ type: 'turn_start', id: 't1' }]
  for (let i = 0; i < 3; i++) {
    const call = { name: 'bash', args: { command: 'npm test' } }
    lines.push({ type: 'tool_call', name: call.name, args: call.args })
    const verdict = e.guard(call)
    if (verdict.decision === 'deny') {
      e.noteDenied(call, verdict)
      lines.push({ type: 'tool_denied', name: call.name, rule: verdict.rule })
    } else {
      lines.push({ type: 'tool_result', name: call.name, args: call.args, isError: true, errorDigest: 'e' })
      e.observe({ ...call, isError: true, errorDigest: 'e' })
    }
  }
  lines.push({ type: 'turn_end', id: 't1' })

  const dir = mkdtempSync(join(tmpdir(), 'zhizhi-'))
  const file = join(dir, 'gated.jsonl')
  writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n'))
  const { stdout } = run(['audit', '--gated', '--threshold', '2', file])
  const r = JSON.parse(stdout)
  assert.equal(r.consistency.match, true)
  assert.equal(r.consistency.runtimeDenied, 1)
})

test('CLI 错误处理：未知选项 / 缺文件 / 不存在的输入', () => {
  const bad = run(['audit', '--nope', FIXTURE], { expectCode: 2 })
  assert.match(bad.stderr, /未知选项/)
  const missing = run(['audit'], { expectCode: 2 })
  assert.match(missing.stderr, /缺少输入文件/)
  const noent = run(['audit', '/nonexistent/stream.jsonl'], { expectCode: 2 })
  assert.match(noent.stderr, /无法读取/)
  const badCmd = run(['frobnicate'], { expectCode: 2 })
  assert.match(badCmd.stderr, /未知命令/)
})

test('CLI audit：坏 JSONL 报行号，退出码 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhizhi-'))
  const file = join(dir, 'broken.jsonl')
  writeFileSync(file, '{"type":"turn_start"}\n{broken}\n')
  const r = run(['audit', file], { expectCode: 2 })
  assert.match(r.stderr, /第 2 行/)
})
