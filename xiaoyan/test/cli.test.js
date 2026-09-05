/**
 * CLI 语义测试 —— spawn 真实进程，断言 exit 0/1/2 与输出（docs/03 §10、docs/04 A4）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'xiaoyan.js')
const fx = (name) => join(root, 'fixtures', name)

const tmp = mkdtempSync(join(tmpdir(), 'xiaoyan-cli-'))
const write = (name, text) => {
  const p = join(tmp, name)
  writeFileSync(p, text)
  return p
}

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8' })
    return { code: 0, stdout }
  } catch (error) {
    return { code: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

test('audit：干净流 → exit 0，效值 0、带「明」', () => {
  const r = run(['audit', fx('clean-stream.jsonl')])
  assert.equal(r.code, 0)
  const out = JSON.parse(r.stdout)
  assert.equal(out.score.total, 0)
  assert.equal(out.band, '明')
  assert.equal(out.verdict, 'pass')
})

test('audit：空言流 → exit 1，效值 50、带「虚」', () => {
  const r = run(['audit', fx('vacuous-stream.jsonl')])
  assert.equal(r.code, 1)
  const out = JSON.parse(r.stdout)
  assert.equal(out.score.total, 50)
  assert.equal(out.band, '虚')
  assert.equal(out.verdict, 'fail')
})

test('audit：回令流 → exit 0（20 分疏带点名不咬门）', () => {
  const r = run(['audit', fx('echo-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.equal(JSON.parse(r.stdout).band, '疏')
})

test('audit：免验流不带 --exempt → exit 1；带 --exempt → exit 0', () => {
  assert.equal(run(['audit', fx('exempt-stream.jsonl')]).code, 1)
  const r = run(['audit', fx('exempt-stream.jsonl'), '--exempt', fx('exempt-words.json')])
  assert.equal(r.code, 0)
  assert.equal(JSON.parse(r.stdout).counts.exempted, 2)
})

test('audit：--gate 自定义门生效（20 → 回令流 20 分即 fail）', () => {
  const r = run(['audit', fx('echo-stream.jsonl'), '--gate', '20'])
  assert.equal(r.code, 1)
  assert.equal(JSON.parse(r.stdout).gate, 20)
})

test('audit：--json 紧凑输出可解析', () => {
  const r = run(['audit', fx('vacuous-stream.jsonl'), '--json'])
  assert.equal(r.code, 1)
  const out = JSON.parse(r.stdout)
  assert.equal(out.counts.vacuous, 2)
  assert.ok(!r.stdout.includes('\n '), '紧凑输出')
})

test('audit：坏 JSON 流 → exit 2 并报行号', () => {
  const p = write('bad.jsonl', '{"type":"principal"}\n{oops}\n')
  const r = run(['audit', p])
  assert.equal(r.code, 2)
  assert.match(r.stderr, /第 2 行/)
})

test('audit：流缺失 → exit 2', () => {
  const r = run(['audit', join(tmp, 'nope.jsonl')])
  assert.equal(r.code, 2)
  assert.match(r.stderr, /不可读/)
})

test('audit：坏词表 / 坏免验表 → exit 2', () => {
  const bad = write('bad-words.json', '{"not":"array"}')
  assert.equal(run(['audit', fx('clean-stream.jsonl'), '--words', bad]).code, 2)
  assert.equal(run(['audit', fx('clean-stream.jsonl'), '--exempt', bad]).code, 2)
})

test('audit：--words 追加自定义效词（默认词保留）', () => {
  const stream = write('custom.jsonl', [
    JSON.stringify({ type: 'tool_call', id: 'd1', name: 'bash', args: { command: 'make deploy' } }),
    JSON.stringify({ type: 'tool_result', id: 'd1', name: 'bash', args: { command: 'make deploy' }, isError: false }),
    JSON.stringify({ type: 'tool_call', id: 'd2', name: 'bash', args: { command: 'npm test' } }),
    JSON.stringify({ type: 'tool_result', id: 'd2', name: 'bash', args: { command: 'npm test' }, isError: false, content: '' }),
  ].join('\n'))
  const words = write('words.json', JSON.stringify(['deploy']))
  const r = run(['audit', stream, '--words', words])
  assert.equal(r.code, 1, '自定义词命中的静默 deploy（25）+ 空言 npm test（25）→ 50 超门')
  const out = JSON.parse(r.stdout)
  assert.equal(out.counts.verified, 2)
  assert.equal(out.score.total, 50)
  const words2 = write('words2.json', JSON.stringify(['deploy']))
  const r2 = run(['audit', stream, '--words', words2, '--exempt', write('ex2.json', JSON.stringify(['npm test']))])
  assert.equal(r2.code, 0, '免验 npm test 后只剩 deploy 一件 → 25 疏带不咬门')
})

test('zheng：默认纯文本，--json 包装', () => {
  const r = run(['zheng', fx('echo-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /【效验 · 证块】效账 #1/)
  const j = run(['zheng', fx('echo-stream.jsonl'), '--json'])
  const out = JSON.parse(j.stdout)
  assert.equal(out.k, 1)
  assert.equal(out.echo, 1)
  assert.equal(out.stray, 1)
  assert.equal(out.stale, 1)
  assert.match(out.text, /效账 #1/)
})

test('zheng：同一流两次输出 shasum 一致（逐字节确定）', () => {
  const a = run(['zheng', fx('vacuous-stream.jsonl')]).stdout
  const b = run(['zheng', fx('vacuous-stream.jsonl')]).stdout
  assert.equal(createHash('sha1').update(b).digest('hex'), createHash('sha1').update(a).digest('hex'))
})

test('gate --value：按门判 0/1，恰等于门即 fail', () => {
  assert.equal(run(['gate', '--value', '24']).code, 0, '24 < 默认门 30')
  assert.equal(run(['gate', '--value', '25']).code, 0)
  assert.equal(run(['gate', '--value', '25', '--gate', '25']).code, 1, '恰等于门 → fail')
  assert.equal(run(['gate', '--value', '29', '--gate', '30']).code, 0)
  assert.equal(run(['gate', '--value', '30', '--gate', '30']).code, 1)
  assert.equal(run(['gate', '--value', '30']).code, 1, '30 ≥ 默认门 30')
})

test('gate：缺 --value → exit 2', () => {
  assert.equal(run(['gate']).code, 2)
})

test('--version 与 --help 正常；无命令出用法', () => {
  const v = run(['--version'])
  assert.equal(v.code, 0)
  assert.equal(v.stdout.trim(), '0.1.0')
  assert.equal(run(['--help']).code, 0)
  assert.match(run(['--help']).stdout, /成色审计层/)
  assert.match(run([]).stdout, /用法/)
})
