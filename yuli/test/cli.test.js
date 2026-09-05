/**
 * 豫立 CLI 测试 —— audit / risks / yupai / gate / list / enroll 的语义与退出码。
 * 期望值全部先于实现手算（见 docs/04-acceptance.md）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const BIN = join(here, '..', 'src', 'bin', 'yuli.js')
const FIX = join(here, '..', 'fixtures')

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    ...opts,
  })
  return r.stdout ?? ''
}

function runCode(args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' })
  return r.status
}

function lastJson(args) {
  return JSON.parse(run(args))
}

// ---- audit（A10） -----------------------------------------------------------

test('A10: naked 流 → 险值 60（废）exit 1', () => {
  assert.equal(runCode(['audit', join(FIX, 'naked-stream.jsonl')]), 1)
  const report = lastJson(['audit', join(FIX, 'naked-stream.jsonl'), '--json'])
  assert.equal(report.score.total, 60)
  assert.equal(report.band, '废')
  assert.equal(report.counts.nakedCases, 3)
  assert.equal(report.counts.feints, 1)
})

test('A10: naked 流 --risk 显式险词 → 险值 70 仍 exit 1', () => {
  const report = lastJson(['audit', join(FIX, 'naked-stream.jsonl'), '--risk', 'kubectl delete', '--json'])
  assert.equal(report.score.total, 70)
  assert.equal(report.score.declare, 10)
  assert.equal(runCode(['audit', join(FIX, 'naked-stream.jsonl'), '--risk', 'kubectl delete']), 1)
})

test('A10: netted 流 --exempt → 险值 0（豫）exit 0', () => {
  assert.equal(runCode(['audit', join(FIX, 'netted-stream.jsonl'), '--exempt', 'reviewed-ok']), 0)
  const report = lastJson(['audit', join(FIX, 'netted-stream.jsonl'), '--exempt', 'reviewed-ok', '--json'])
  assert.equal(report.score.total, 0)
  assert.equal(report.band, '豫')
  assert.equal(report.counts.nettedCases, 4)
  assert.equal(report.counts.ganpao, 2)
  assert.equal(report.counts.luokuan, 1)
})

test('A10: netted 流无款词 → 遁引裸险 30（废）exit 1', () => {
  const report = lastJson(['audit', join(FIX, 'netted-stream.jsonl'), '--json'])
  assert.equal(report.score.total, 30)
  assert.equal(runCode(['audit', join(FIX, 'netted-stream.jsonl')]), 1)
})

test('A10: mixed 流 → 险值 30（废）exit 1；--gate 60 翻 pass', () => {
  const report = lastJson(['audit', join(FIX, 'mixed-stream.jsonl'), '--json'])
  assert.equal(report.score.total, 30)
  assert.equal(report.band, '废')
  assert.equal(runCode(['audit', join(FIX, 'mixed-stream.jsonl')]), 1)
  assert.equal(runCode(['audit', join(FIX, 'mixed-stream.jsonl'), '--gate', '60']), 0)
})

test('A10: --no-defaults 关默认形——naked 流翻 0', () => {
  const report = lastJson(['audit', join(FIX, 'naked-stream.jsonl'), '--no-defaults', '--json'])
  assert.equal(report.score.total, 0)
  assert.equal(runCode(['audit', join(FIX, 'naked-stream.jsonl'), '--no-defaults']), 0)
})

test('A10: --register 缺省载入 ./.yuli.json（存在时款词生效）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yuli-cli-'))
  try {
    const regPath = join(dir, '.yuli.json')
    writeFileSync(regPath, JSON.stringify({ version: 1, risk: [], exempt: ['reviewed-ok'] }))
    const report = JSON.parse(
      spawnSync(process.execPath, [BIN, 'audit', join(FIX, 'netted-stream.jsonl'), '--json'], {
        encoding: 'utf8',
        cwd: dir,
      }).stdout,
    )
    assert.equal(report.score.total, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---- risks / yupai（A10） ---------------------------------------------------

test('A10: risks 逐案清单（纯文本逐案点名，seq 为案序）', () => {
  const out = run(['risks', join(FIX, 'naked-stream.jsonl')])
  assert.match(out, /#1 bash｜灭迹｜裸险 \+30/)
  assert.match(out, /#3 bash｜断史｜裸险 \+30/)
  assert.match(out, /#5 bash｜覆宗｜裸险 \+30/)
  assert.match(out, /#6 bash｜遁引｜虚险（未遂，不计分）/)
  assert.match(out, /#2 bash｜灭迹｜有备（行前有影\/史\/演）/)
  assert.equal(runCode(['risks', join(FIX, 'naked-stream.jsonl')]), 1)
})

test('A10: risks 门放行时逐案照列、退出 0', () => {
  const out = run(['risks', join(FIX, 'mixed-stream.jsonl'), '--gate', '60'])
  assert.match(out, /#1 bash｜灭迹｜裸险 \+30/)
  assert.equal(runCode(['risks', join(FIX, 'mixed-stream.jsonl'), '--gate', '60']), 0)
})

test('A10: yupai 两次输出逐字节相同（确定性），--json 可包装', () => {
  const t1 = run(['yupai', join(FIX, 'naked-stream.jsonl')])
  const t2 = run(['yupai', join(FIX, 'naked-stream.jsonl')])
  assert.equal(t1, t2)
  assert.match(t1, /【豫立 · 豫牌块 #1】/)
  assert.match(t1, /险值 60（废），门 30，判 fail/)
  const wrapped = JSON.parse(run(['yupai', join(FIX, 'naked-stream.jsonl'), '--json']))
  assert.equal(wrapped.k, 1)
  assert.equal(wrapped.text, t1.trim())
})

test('A10: yupai 门禁退出码随险值', () => {
  assert.equal(runCode(['yupai', join(FIX, 'mixed-stream.jsonl')]), 1)
  assert.equal(runCode(['yupai', join(FIX, 'mixed-stream.jsonl'), '--gate', '60']), 0)
})

// ---- gate / list / enroll（A10） --------------------------------------------

test('A10: gate --value 裁决（pass exit 0 / fail exit 1）', () => {
  assert.equal(runCode(['gate', '--value', '25']), 0)
  assert.equal(runCode(['gate', '--value', '30']), 1)
  assert.equal(run(['gate', '--value', '30', '--gate', '60']).trim(), 'pass')
  const j = JSON.parse(run(['gate', '--value', '30', '--json']))
  assert.deepEqual(j, { value: 30, gate: 30, verdict: 'fail', ok: false })
})

test('A10: list 出册 JSON（文件册 ∪ CLI 词表）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yuli-cli-'))
  try {
    const regPath = join(dir, '.yuli.json')
    writeFileSync(regPath, JSON.stringify({ version: 1, risk: ['helm uninstall'], exempt: ['x'] }))
    const reg = JSON.parse(run(['list', '--register', regPath, '--risk', 'kubectl delete', '--json']))
    assert.deepEqual(reg.risk, ['helm uninstall', 'kubectl delete'])
    assert.deepEqual(reg.exempt, ['x'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A10: enroll 并集去重、只增不删', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yuli-cli-'))
  try {
    const regPath = join(dir, '.yuli.json')
    run(['enroll', '--register', regPath, '--risk', 'a', '--exempt', 'x'])
    run(['enroll', '--register', regPath, '--risk', 'a,b'])
    const reg = JSON.parse(readFileSync(regPath, 'utf8'))
    assert.deepEqual(reg.risk, ['a', 'b'])
    assert.deepEqual(reg.exempt, ['x'])
    assert.equal(reg.version, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---- 用法与错误（A10） ------------------------------------------------------

test('A10: --help / --version', () => {
  assert.match(run(['--help']), /豫立 · yuli/)
  assert.match(run(['--version']).trim(), /^\d+\.\d+\.\d+$/)
})

test('A10: 坏流文件 / 坏流内容 / 未知命令 / 缺参数 / 未知选项 → 2', () => {
  assert.equal(runCode(['audit', join(FIX, 'no-such-file.jsonl')]), 2)
  const dir = mkdtempSync(join(tmpdir(), 'yuli-cli-'))
  try {
    const bad = join(dir, 'bad.jsonl')
    writeFileSync(bad, '{"ok":1}\nnot-json\n')
    assert.equal(runCode(['audit', bad]), 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  assert.equal(runCode(['frobnicate']), 2)
  assert.equal(runCode(['audit']), 2)
  assert.equal(runCode(['audit', join(FIX, 'mixed-stream.jsonl'), '--frobnicate']), 2)
  assert.equal(runCode(['gate']), 2)
})
