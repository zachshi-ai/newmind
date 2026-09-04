/**
 * CLI 集成单测 —— 每条命令的退出码语义与输出字段。
 * 退出码约定：0 通过；1 验收门失败；2 用法/输入错误。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const BIN = join(here, '..', 'src', 'bin', 'jiebi.js')
const FIXTURES = join(here, '..', 'fixtures')

function run(args, cwd = process.cwd()) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
}

test('check：均衡账本 → 0 分通过，退出码 0', () => {
  const r = run(['check', join(FIXTURES, 'balanced-ledger.json')])
  assert.equal(r.status, 0)
  const out = JSON.parse(r.stdout)
  assert.equal(out.ledger, 'd-002')
  assert.equal(out.score, 0)
  assert.equal(out.band, '明')
  assert.equal(out.verdict, 'pass')
  assert.deepEqual(out.issues, [])
})

test('check：偏蔽账本 → 蔽值 100，退出码 1', () => {
  const r = run(['check', join(FIXTURES, 'biased-ledger.json')])
  assert.equal(r.status, 1)
  const out = JSON.parse(r.stdout)
  assert.equal(out.score, 100)
  assert.equal(out.band, '蔽')
  assert.equal(out.verdict, 'fail')
  assert.equal(out.issues.length, 7)
})

test('check：--fail-over 可调阈门（15 分的账本：阈 15 挂，阈 16 过）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jiebi-cli-'))
  try {
    const ledger = {
      version: 1,
      id: 'd-15',
      kind: 'approach',
      question: 'q',
      alternatives: [
        { name: 'A', steelman: 's', killCondition: 'k' },
        { name: 'B', steelman: 's', killCondition: 'k' },
      ],
      disconfirming: [],
      verdict: { choice: 'A', weights: 'w', falsifiable: 'f' },
    }
    const file = join(tmp, 'd15.json')
    writeFileSync(file, JSON.stringify(ledger))
    assert.equal(run(['check', file, '--fail-over', '15']).status, 1)
    assert.equal(run(['check', file, '--fail-over', '16']).status, 0)
    assert.equal(JSON.parse(run(['check', file]).stdout).score, 15)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('check：schema 非法 → 退出码 2，报出全部 path', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jiebi-cli-'))
  try {
    const file = join(tmp, 'bad.json')
    writeFileSync(file, JSON.stringify({ version: 2, kind: 'nope' }))
    const r = run(['check', file])
    assert.equal(r.status, 2)
    assert.match(r.stderr, /version/)
    assert.match(r.stderr, /kind/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('check：非 JSON 文件 → 退出码 2', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jiebi-cli-'))
  try {
    const file = join(tmp, 'broken.json')
    writeFileSync(file, '{oops')
    const r = run(['check', file])
    assert.equal(r.status, 2)
    assert.match(r.stderr, /不是合法 JSON/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('score：只算分不设门，恒退出码 0', () => {
  const biased = join(FIXTURES, 'biased-ledger.json')
  const r = run(['score', biased])
  assert.equal(r.status, 0)
  const out = JSON.parse(r.stdout)
  assert.equal(out.score, 100)
  assert.ok(Array.isArray(out.issues))
})

test('template：骨架合法（check 应通过 schema 层）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jiebi-cli-'))
  try {
    const r = run(['template'])
    assert.equal(r.status, 0)
    const t = JSON.parse(r.stdout)
    assert.equal(t.version, 1)
    const file = join(tmp, 't.json')
    writeFileSync(file, JSON.stringify(t))
    // 骨架的占位文本 schema 合法；蔽值 20（裁决悬空）在阈门内通过
    const checked = run(['check', file])
    assert.equal(checked.status, 0)
    assert.equal(JSON.parse(checked.stdout).score, 20)
    const r2 = run(['template', '--kind', 'approach'])
    assert.equal(JSON.parse(r2.stdout).kind, 'approach')
    assert.equal(run(['template', '--kind', 'vibes']).status, 2)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('reconcile：账实相符 → 0；悬空引用 → 1', () => {
  const stream = join(FIXTURES, 'sample-stream.jsonl')
  const ok = run(['reconcile', join(FIXTURES, 'balanced-ledger.json'), stream])
  assert.equal(ok.status, 0)
  const report = JSON.parse(ok.stdout)
  assert.equal(report.match, true)
  assert.equal(report.refsChecked, 4)

  const tmp = mkdtempSync(join(tmpdir(), 'jiebi-cli-'))
  try {
    const ledger = JSON.parse(readFileSync(join(FIXTURES, 'balanced-ledger.json'), 'utf8'))
    ledger.alternatives[0].evidence.push({ ref: 't9-nope', expect: 'fail' })
    const file = join(tmp, 'dangling.json')
    writeFileSync(file, JSON.stringify(ledger))
    const bad = run(['reconcile', file, stream])
    assert.equal(bad.status, 1)
    const r = JSON.parse(bad.stdout)
    assert.equal(r.match, false)
    assert.ok(r.refs.some((x) => x.status === 'dangling'))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('audit：样例流有 flag → 退出码 1；干净流 → 0；坏流报行号 → 2', () => {
  const flagged = run(['audit', join(FIXTURES, 'sample-stream.jsonl')])
  assert.equal(flagged.status, 1)
  const report = JSON.parse(flagged.stdout)
  assert.equal(report.verdict, 'flagged')
  assert.equal(report.flags[0].signature, 'bash:npm test')

  const tmp = mkdtempSync(join(tmpdir(), 'jiebi-cli-'))
  try {
    const clean = join(tmp, 'clean.jsonl')
    writeFileSync(clean, [
      '{"type":"turn_start","id":"t1"}',
      '{"type":"tool_call","name":"read","args":{"path":"a"}}',
      '{"type":"tool_call","name":"bash","args":{"command":"npm test"}}',
    ].join('\n'))
    assert.equal(run(['audit', clean]).status, 0)

    const broken = join(tmp, 'broken.jsonl')
    writeFileSync(broken, '{"type":"turn_start","id":"t1"}\n{{{')
    const r = run(['audit', broken])
    assert.equal(r.status, 2)
    assert.match(r.stderr, /第 2 行/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('audit：--streak 阈值可调；跨项目审计 zhizhi 样例流（A5）', () => {
  const zhizhiStream = join(here, '..', '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl')
  const r = run(['audit', zhizhiStream])
  assert.equal(r.status, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.flags[0].turn, 't1')
  assert.equal(report.flags[0].signature, 'bash:npm test')
})

test('用法：--help / --version / 未知命令 / 缺文件', () => {
  assert.match(run(['--help']).stdout, /用法/)
  assert.match(run(['--version']).stdout, /jiebi v/)
  assert.equal(run(['frobnicate']).status, 2)
  assert.equal(run(['check', join(tmpdir(), 'definitely-missing.json')]).status, 2)
  assert.equal(run(['check']).status, 2)
})
