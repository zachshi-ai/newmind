/**
 * CLI 测试 —— A6：子命令语义与退出码（0 过门 / 1 超门 / 2 坏输入或用法错误）。
 * 全部通过真实子进程运行 bin/licheng.js，零依赖（node:test + child_process）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseLedger } from '../src/core/ledger.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'licheng.js')
const fx = (name) => join(root, 'fixtures', name)

function run(args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8' }) }
  } catch (error) {
    return { code: error.status ?? 1, out: String(error.stdout ?? '') + String(error.stderr ?? '') }
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'licheng-cli-'))
test.after(() => rmSync(tmp, { recursive: true, force: true }))
const write = (name, text) => {
  const file = join(tmp, name)
  writeFileSync(file, text)
  return file
}

test('A6 · template：退出 0，输出可直接通过绳账校验', () => {
  const r = run(['template'])
  assert.equal(r.code, 0)
  const parsed = parseLedger(r.out)
  assert.equal(parsed.valid, true)
})

test('A6 · ledger：合法账退出 0 并报条目数', () => {
  const r = run(['ledger', fx('clean-ledger.jsonl')])
  assert.equal(r.code, 0)
  const out = JSON.parse(r.out)
  assert.equal(out.valid, true)
  assert.equal(out.entries, 2)
})

test('A6 · ledger：坏 JSON 退出 2 并报行号', () => {
  const file = write('bad.jsonl', '{"type":"promise",\n')
  const r = run(['ledger', file])
  assert.equal(r.code, 2)
  assert.match(r.out, /不是合法 JSON/)
})

test('A6 · ledger：缺必需键退出 2', () => {
  const file = write('missing.jsonl', '{"type":"promise","id":"p-1"}\n')
  const r = run(['ledger', file])
  assert.equal(r.code, 2)
  assert.match(r.out, /what/)
})

test('A6 · ledger：id 重复退出 2', () => {
  const line = '{"type":"promise","id":"p-1","what":"x"}\n'
  const r = run(['ledger', write('dup.jsonl', line + line)])
  assert.equal(r.code, 2)
  assert.match(r.out, /id 重复/)
})

test('A6 · settle：干净账退出 0，结账块以「绳上无悬结」收尾', () => {
  const r = run(['settle', fx('clean-ledger.jsonl'), fx('clean-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /绳上无悬结。/)
  assert.match(r.out, /庸言之信，庸行之谨。/)
})

test('A6 · settle：破账超门退出 1，咎值 40（咎）', () => {
  const r = run(['settle', fx('broken-ledger.jsonl'), fx('broken-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /咎值：40（咎）· 门 30/)
  assert.match(r.out, /悬结：p-002「同步 README 示例」咎\+30，轻诺\+10（整条链无凭据）/)
})

test('A6 · settle：--gate 100 把同一破账翻为过门（退出 0）', () => {
  const r = run(['settle', fx('broken-ledger.jsonl'), fx('broken-stream.jsonl'), '--gate', '100'])
  assert.equal(r.code, 0)
  assert.match(r.out, /门 100/)
})

test('A6 · settle --json：完整报告含 totals/breakdown/speech', () => {
  const r = run(['settle', fx('broken-ledger.jsonl'), fx('broken-stream.jsonl'), '--json'])
  assert.equal(r.code, 1)
  const report = JSON.parse(r.out)
  assert.deepEqual(report.totals, { promised: 3, discharged: 1, revised: 0, abandoned: 1, breached: 1 })
  assert.deepEqual(report.breakdown, { blame: 30, leniency: 10 })
  assert.equal(report.score, 40)
  assert.equal(report.band, '咎')
  assert.equal(report.verdict, 'fail')
  assert.deepEqual(report.speech, { events: 5, markerHits: 5, unaccounted: 2 })
})

test('A6 · settle --lexicon：替换词表生效（speech 命中归零），内置词表不受影响', () => {
  const r = run(['settle', fx('broken-ledger.jsonl'), fx('broken-stream.jsonl'), '--json', '--lexicon', fx('custom-lexicon.json')])
  const report = JSON.parse(r.out)
  assert.deepEqual(report.speech, { events: 5, markerHits: 0, unaccounted: 0 })
  const r2 = run(['lexicon'])
  assert.ok(JSON.parse(r2.out).markers.includes('接下来'))
})

test('A6 · settle：账文件不存在退出 2', () => {
  const r = run(['settle', join(tmp, 'nope.jsonl'), fx('clean-stream.jsonl')])
  assert.equal(r.code, 2)
  assert.match(r.out, /读不到文件/)
})

test('A6 · settle：坏流文件退出 2', () => {
  const r = run(['settle', fx('clean-ledger.jsonl'), write('bad-stream.jsonl', '{oops}\n')])
  assert.equal(r.code, 2)
  assert.match(r.out, /不是合法 JSON/)
})

test('A6 · block：恒退出 0，输出与 settle 的块逐字一致', () => {
  const a = run(['settle', fx('broken-ledger.jsonl'), fx('broken-stream.jsonl')])
  const b = run(['block', fx('broken-ledger.jsonl'), fx('broken-stream.jsonl')])
  assert.equal(b.code, 0)
  assert.equal(a.out, b.out)
})

test('A6 · block：两次运行逐字节相同（确定性）', () => {
  const a = run(['block', fx('broken-ledger.jsonl'), fx('broken-stream.jsonl')])
  const b = run(['block', fx('broken-ledger.jsonl'), fx('broken-stream.jsonl')])
  assert.equal(a.out, b.out)
})

test('A6 · lexicon：默认词表与自定义词表', () => {
  const def = JSON.parse(run(['lexicon']).out)
  assert.ok(def.markers.includes('我打算'))
  const custom = JSON.parse(run(['lexicon', '--lexicon', fx('custom-lexicon.json')]).out)
  assert.deepEqual(custom.markers, ['保证'])
})

test('A6 · 用法错误：未知命令 / 缺参数 / 坏 --gate 均退出 2', () => {
  assert.equal(run(['nonsense']).code, 2)
  assert.equal(run([]).code, 2)
  assert.equal(run(['settle', fx('clean-ledger.jsonl')]).code, 2)
  assert.equal(run(['settle', fx('clean-ledger.jsonl'), fx('clean-stream.jsonl'), '--gate', 'x']).code, 2)
  assert.equal(run(['settle', fx('clean-ledger.jsonl'), fx('clean-stream.jsonl'), '--nope']).code, 2)
})
