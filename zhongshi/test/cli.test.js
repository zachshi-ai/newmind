/**
 * 终始 CLI 测试 —— 验收标准 A10（docs/04）。spawnSync 起子进程，断言退出码与输出。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const bin = join(root, 'src', 'bin', 'zhongshi.js')
const fx = (p) => join(root, 'fixtures', p)

function run(args, cwd = root) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function auditArgs(streams, extra = []) {
  return [
    'audit',
    ...streams.map((s) => fx(s)),
    '--register',
    fx(streams.includes('silent-stream.jsonl') ? 'silent.zhongshi.json' : streams.includes('washed-stream.jsonl') ? 'washed.zhongshi.json' : 'fenced.zhongshi.json'),
    ...extra,
  ]
}

test('A10: audit silent 流 → 程值 75（无终）exit 1；--gate 80 翻 pass', () => {
  const r = run(auditArgs(['silent-stream.jsonl']), root)
  assert.equal(r.status, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.total, 75)
  assert.equal(report.band, '无终')
  assert.equal(report.verdict, 'fail')
  const lenient = run(auditArgs(['silent-stream.jsonl'], ['--gate', '80']))
  assert.equal(lenient.status, 0)
  assert.equal(JSON.parse(lenient.stdout).verdict, 'pass')
})

test('A10: audit washed 流 → 60（无终）exit 1；--gate 80 翻 pass', () => {
  const r = run(auditArgs(['washed-stream.jsonl']))
  assert.equal(r.status, 1)
  assert.equal(JSON.parse(r.stdout).score.total, 60)
  assert.equal(run(auditArgs(['washed-stream.jsonl'], ['--gate', '80'])).status, 0)
})

test('A10: audit fenced——part1 单流 45 exit 1；拼接 0 exit 0；反序 35 exit 1', () => {
  const a1 = run(['audit', fx('fenced-part1.jsonl'), '--register', fx('fenced.zhongshi.json')])
  assert.equal(a1.status, 1)
  assert.equal(JSON.parse(a1.stdout).score.total, 45)

  const a2 = run([
    'audit',
    fx('fenced-part1.jsonl'),
    fx('fenced-part2.jsonl'),
    '--register',
    fx('fenced.zhongshi.json'),
  ])
  assert.equal(a2.status, 0)
  const both = JSON.parse(a2.stdout)
  assert.equal(both.score.total, 0)
  assert.equal(both.band, '近道')

  const a3 = run([
    'audit',
    fx('fenced-part2.jsonl'),
    fx('fenced-part1.jsonl'),
    '--register',
    fx('fenced.zhongshi.json'),
  ])
  assert.equal(a3.status, 1)
  assert.equal(JSON.parse(a3.stdout).score.total, 35)
})

test('A10: --json 输出完整报告（逐事清单 + 失序点名）', () => {
  const r = run(auditArgs(['washed-stream.jsonl'], ['--json']))
  const report = JSON.parse(r.stdout)
  assert.equal(report.items.length, 4)
  assert.equal(report.violations.length, 1)
  assert.equal(report.kongList.length, 1)
  assert.ok(report.issues.some((s) => s.includes('失序')))
})

test('A10: ledger 逐事点名（幽项/未宣终形/程值行）', () => {
  const r = run(auditArgs(['silent-stream.jsonl']).map((a, i) => (a === 'audit' ? 'ledger' : a)))
  assert.equal(r.status, 1)
  assert.ok(r.stdout.includes('T2 账单导出｜幽项｜全流无作工'))
  assert.ok(r.stdout.includes('T3 边界用例｜半途｜始#5 末作#9（未宣终形）'))
  assert.ok(r.stdout.includes('T1 重复扣款修复｜有终｜始#2 终#4'))
  assert.ok(r.stdout.includes('程值 75（无终），门 30，判 fail'))
})

test('A10: kuai 程账块两跑逐字节同（shasum 口径）；--json 包装', () => {
  const args = ['kuai', fx('fenced-part1.jsonl'), fx('fenced-part2.jsonl'), '--register', fx('fenced.zhongshi.json')]
  const r1 = run(args)
  const r2 = run(args)
  assert.equal(r1.status, 0)
  assert.equal(r1.stdout, r2.stdout)
  assert.ok(r1.stdout.includes('T1 断连修复｜有终｜始#1 终#4'))
  const j = run([...args, '--json'])
  const wrapped = JSON.parse(j.stdout)
  assert.equal(wrapped.k, 1)
  assert.ok(wrapped.text.includes('【终始 · 程账块 #1】'))
})

test('A10: --register 缺省载入 cwd 的 .zhongshi.json；无册不判 → exit 2', () => {
  const dir = join(tmpdir(), `zhongshi-cli-${Date.now()}`)
  mkdirSync(dir)
  try {
    copyFileSync(fx('fenced.zhongshi.json'), join(dir, '.zhongshi.json'))
    copyFileSync(fx('fenced-part1.jsonl'), join(dir, 's.jsonl'))
    const withReg = run(['audit', 's.jsonl'], dir)
    assert.equal(withReg.status, 1)
    assert.equal(JSON.parse(withReg.stdout).score.total, 45)

    rmSync(join(dir, '.zhongshi.json'))
    const noReg = run(['audit', 's.jsonl'], dir)
    assert.equal(noReg.status, 2)
    assert.ok(noReg.stderr.includes('无册不判'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A10: 坏册（重复 id / order 引用未立）→ exit 2', () => {
  const dir = join(tmpdir(), `zhongshi-cli-${Date.now()}`)
  mkdirSync(dir)
  try {
    writeFileSync(join(dir, 'dup.json'), JSON.stringify({ version: 1, items: [{ id: 'A' }, { id: 'A' }], order: [] }))
    const dup = run(['audit', fx('fenced-part1.jsonl'), '--register', join(dir, 'dup.json')], dir)
    assert.equal(dup.status, 2)
    assert.ok(dup.stderr.includes('重复立事'))

    writeFileSync(
      join(dir, 'badorder.json'),
      JSON.stringify({ version: 1, items: [{ id: 'A' }], order: [['A', 'ZZ']] }),
    )
    const badorder = run(['audit', fx('fenced-part1.jsonl'), '--register', join(dir, 'badorder.json')], dir)
    assert.equal(badorder.status, 2)
    assert.ok(badorder.stderr.includes('未立之事'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A10: 坏流报行号 → exit 2；未知命令/缺参数 → exit 2', () => {
  const dir = join(tmpdir(), `zhongshi-cli-${Date.now()}`)
  mkdirSync(dir)
  try {
    writeFileSync(join(dir, 'bad.jsonl'), '{"type":"tool_call","id":"a"}\n不是 JSON\n')
    const bad = run(['audit', 'bad.jsonl', '--register', fx('fenced.zhongshi.json')], dir)
    assert.equal(bad.status, 2)
    assert.ok(bad.stderr.includes('第 2 行'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  assert.equal(run(['nonsense']).status, 2)
  assert.equal(run(['audit']).status, 2)
  assert.equal(run(['gate']).status, 2)
})

test('A10: list 出册；enroll 按 id 并集只增不删', () => {
  const dir = join(tmpdir(), `zhongshi-cli-${Date.now()}`)
  mkdirSync(dir)
  try {
    copyFileSync(fx('fenced.zhongshi.json'), join(dir, '.zhongshi.json'))
    const listed = run(['list'], dir)
    const reg = JSON.parse(listed.stdout)
    assert.equal(reg.items.length, 2)

    const e1 = run(['enroll', '--item', JSON.stringify({ id: 'T1', name: '改动被拒' })], dir)
    assert.equal(e1.status, 0)
    const after1 = JSON.parse(readFileSync(join(dir, '.zhongshi.json'), 'utf8'))
    assert.equal(after1.items.length, 2)
    assert.equal(after1.items[0].name, '断连修复') // 既有 id 原样保留

    const e2 = run(['enroll', '--item', JSON.stringify({ id: 'T3', name: '新事', terminal: ['t3 ok'] })], dir)
    assert.equal(e2.status, 0)
    const after2 = JSON.parse(readFileSync(join(dir, '.zhongshi.json'), 'utf8'))
    assert.equal(after2.items.length, 3)
    assert.equal(after2.items[2].id, 'T3')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A10: gate 子命令裁决（--value 与 --gate；--json）', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  const j = JSON.parse(run(['gate', '--value', '30', '--gate', '40', '--json']).stdout)
  assert.deepEqual(j, { value: 30, gate: 40, verdict: 'pass', ok: true })
})

test('A10: ledger --json 输出逐事/空终/失序结构', () => {
  const args = auditArgs(['washed-stream.jsonl']).map((a) => (a === 'audit' ? 'ledger' : a))
  const j = JSON.parse(run([...args, '--json']).stdout)
  assert.equal(j.items.length, 4)
  assert.equal(j.kongList.length, 1)
  assert.equal(j.violations.length, 1)
  assert.equal(j.score.total, 60)
})

test('A10: enroll --item 坏 JSON → exit 2', () => {
  const r = run(['enroll', '--item', '{不是 JSON'], root)
  assert.equal(r.status, 2)
  assert.ok(r.stderr.includes('不是合法 JSON'))
})

test('A10: list 无册 → 空册视图 exit 0（list 不强制立事）', () => {
  const dir = join(tmpdir(), `zhongshi-cli-${Date.now()}`)
  mkdirSync(dir)
  try {
    const r = run(['list'], dir)
    assert.equal(r.status, 0)
    const reg = JSON.parse(r.stdout)
    assert.equal(reg.items.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
