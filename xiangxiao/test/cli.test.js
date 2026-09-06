/**
 * 乡校 CLI 测试 —— 退出码、选项语义、逐字节确定性（A3/A4/A5），全部子进程真实执行。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'xiangxiao.js')
const fx = (name) => join(root, 'fixtures', name)
const MINGSHI_BIN = join(root, '..', 'mingshi', 'src', 'bin', 'mingshi.js')
const MINGSHI_FX = (name) => join(root, '..', 'mingshi', 'fixtures', name)

function run(args, cwd = root) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' }
}

function tmp() {
  return mkdtempSync(join(tmpdir(), 'xiangxiao-cli-'))
}

// ---------------------------------------------------------------- audit（A2 复现）

test('A4：audit clean 夹具 —— 0 分 / 畅 / exit 0，字段与定标一致', () => {
  const r = run(['audit', fx('clean-stream.jsonl')])
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  for (const k of ['sessions', 'calls', 'writes', 'cases', 'score', 'band', 'gate', 'verdict', 'ok', 'counts', 'issues']) {
    assert.ok(k in j, `报告应含 ${k}`)
  }
  assert.deepEqual(j.score, { total: 0, silence: 0, bypass: 0, skip: 0 })
  assert.equal(j.band, '畅')
  assert.equal(j.verdict, 'pass')
  assert.equal(j.counts.justified, 1)
})

test('A4：audit hushed 夹具 —— 90 分 / 毁 / exit 1，counts 逐字吻合', () => {
  const r = run(['audit', fx('hushed-stream.jsonl')])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.score, { total: 90, silence: 60, bypass: 30, skip: 0 })
  assert.equal(j.band, '毁')
  assert.deepEqual(j.counts, {
    mutedDirectives: 3, bypassFlags: 1, skippedTests: 0, keptDirectives: 0, justified: 0, exempted: 0,
  })
  assert.match(j.issues.join('\n'), /缄笔 ×3/)
  assert.match(j.issues.join('\n'), /避检 ×1/)
})

test('A4：audit skippy 夹具 —— 20 分 / 壅 / exit 0', () => {
  const r = run(['audit', fx('skippy-stream.jsonl')])
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.score, { total: 20, silence: 0, bypass: 0, skip: 20 })
  assert.equal(j.band, '壅')
  assert.match(j.issues.join('\n'), /略测 ×2/)
})

test('A4：audit kept 夹具 —— 10 分 / 畅 / exit 0 / 保留 1', () => {
  const r = run(['audit', fx('kept-stream.jsonl')])
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.score, { total: 10, silence: 0, bypass: 0, skip: 10 })
  assert.equal(j.band, '畅')
  assert.equal(j.counts.keptDirectives, 1)
})

test('A4：audit exempt 带 --mute WPS-4119 —— 30 分 / 毁 / exit 1 / 豁免 1；不带 —— 60 分', () => {
  const withMute = run(['audit', fx('exempt-stream.jsonl'), '--mute', 'WPS-4119'])
  assert.equal(withMute.code, 1)
  const j = JSON.parse(withMute.out)
  assert.deepEqual(j.score, { total: 30, silence: 30, bypass: 0, skip: 0 })
  assert.equal(j.counts.exempted, 1)
  assert.match(j.issues.join('\n'), /豁免 ×1/)

  const withoutMute = run(['audit', fx('exempt-stream.jsonl')])
  assert.equal(withoutMute.code, 1)
  const j2 = JSON.parse(withoutMute.out)
  assert.deepEqual(j2.score, { total: 60, silence: 60, bypass: 0, skip: 0 })
  assert.equal(j2.counts.exempted, 0)
})

test('A4：audit 多流合并 —— 会话数 2、calls 6、值 90', () => {
  const r = run(['audit', fx('clean-stream.jsonl'), fx('hushed-stream.jsonl')])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.equal(j.sessions, 2)
  assert.equal(j.calls, 6)
  assert.equal(j.score.total, 90)
})

test('A4：audit --gate 15 —— 20 分亦红', () => {
  const r = run(['audit', fx('skippy-stream.jsonl'), '--gate', '15'])
  assert.equal(r.code, 1)
  assert.equal(JSON.parse(r.out).score.total, 20)
})

test('A4：坏 JSON 行 → exit 2 并报行号', () => {
  const dir = tmp()
  writeFileSync(join(dir, 'bad.jsonl'), '{"type":"tool_call"}\nnot-json\n')
  const r = run(['audit', 'bad.jsonl'], dir)
  assert.equal(r.code, 2)
  assert.match(r.err, /第 2 行/)
})

test('A4：流缺失 → exit 2；--file 声册缺失 → exit 2', () => {
  assert.equal(run(['audit', join(tmpdir(), 'nope.jsonl')]).code, 2)
  assert.equal(run(['audit', fx('clean-stream.jsonl'), '--file', join(tmpdir(), 'nope.json')]).code, 2)
})

test('A4：坏声册 → exit 2', () => {
  const dir = tmp()
  writeFileSync(join(dir, '.xiangxiao.json'), 'not-json')
  const r = run(['audit', fx('clean-stream.jsonl'), '--file', '.xiangxiao.json'], dir)
  assert.equal(r.code, 2)
  assert.match(r.err, /坏声册/)
})

// ---------------------------------------------------------------- A3 跨项目互认

test('A3：mingshi 流喂 xiangxiao —— import 非静音指令，0 分 / 畅 / exit 0', () => {
  const r = run(['audit', MINGSHI_FX('ghost-stream.jsonl')])
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  assert.equal(j.cases, 0)
  assert.deepEqual(j.score, { total: 0, silence: 0, bypass: 0, skip: 0 })
  assert.equal(j.band, '畅')
})

test('A3：xiangxiao 流喂 mingshi（子进程真跑对方 bin）—— 名值 0 / 正 / exit 0', () => {
  const r = spawnSync(process.execPath, [MINGSHI_BIN, 'audit', fx('hushed-stream.jsonl'), '--file', MINGSHI_FX('clean-registry.json')], { encoding: 'utf8', cwd: join(root, '..', 'mingshi') })
  assert.equal(r.status, 0, r.stderr)
  const j = JSON.parse(r.stdout)
  assert.deepEqual(j.score, { total: 0, ghost: 0, stray: 0 })
  assert.equal(j.band, '正')
})

// ---------------------------------------------------------------- register / revoke / list

test('A4：register --mute/--form 快照，重复登记 exit 2，全空参 exit 2，逗号分隔 mute', () => {
  const dir = tmp()
  let r = run(['register', '--mute', 'WPS-4119,SLX-22', '--form', '--nocommit-hook'], dir)
  assert.equal(r.code, 0)
  const reg = JSON.parse(readFileSync(join(dir, '.xiangxiao.json'), 'utf8'))
  assert.deepEqual(reg.mute, ['WPS-4119', 'SLX-22'])
  assert.deepEqual(reg.forms, ['--nocommit-hook'])

  r = run(['register', '--mute', 'WPS-4119'], dir)
  assert.equal(r.code, 2)
  assert.match(r.err, /已在册/)

  r = run(['register'], dir)
  assert.equal(r.code, 2)
})

test('A4：revoke 恰一语义——无此名 exit 2，双给 exit 2，成功销名', () => {
  const dir = tmp()
  run(['register', '--mute', 'WPS-4119', '--form', '--nocommit-hook'], dir)
  assert.equal(run(['revoke', '--mute', 'nope'], dir).code, 2)
  assert.equal(run(['revoke', '--form', 'nope'], dir).code, 2)
  assert.equal(run(['revoke', '--mute', 'WPS-4119', '--form', '--nocommit-hook'], dir).code, 2)
  const r = run(['revoke', '--mute', 'WPS-4119'], dir)
  assert.equal(r.code, 0)
  const reg = JSON.parse(readFileSync(join(dir, '.xiangxiao.json'), 'utf8'))
  assert.deepEqual(reg.mute, [])
})

test('A4：list / block 声册缺失 → exit 2', () => {
  const dir = tmp()
  assert.equal(run(['list', '--file', join(dir, '.xiangxiao.json')]).code, 2)
  assert.equal(run(['block', '--file', join(dir, '.xiangxiao.json')]).code, 2)
})

// ---------------------------------------------------------------- A5 谏牌块逐字节确定

test('A5：block 同一声册两次 shasum 相同；增一豁免词后文本改变', () => {
  const dir = tmp()
  run(['register', '--mute', 'WPS-4119'], dir)
  const a = run(['block', '--file', '.xiangxiao.json'], dir).out
  const b = run(['block', '--file', '.xiangxiao.json'], dir).out
  assert.equal(a, b)
  const ha = createHash('sha1').update(a).digest('hex')
  assert.ok(ha.length, 'shasum 可算')
  run(['register', '--mute', 'SLX-22'], dir)
  const c = run(['block', '--file', '.xiangxiao.json'], dir).out
  assert.notEqual(a, c)
  assert.match(c, /SLX-22/)
})

test('A5：空册确定性空册文本', () => {
  const dir = tmp()
  writeFileSync(join(dir, '.xiangxiao.json'), JSON.stringify({ version: 1 }))
  const a = run(['block', '--file', '.xiangxiao.json'], dir).out
  const b = run(['block', '--file', '.xiangxiao.json'], dir).out
  assert.equal(a, b)
  assert.match(a, /空册/)
})

// ---------------------------------------------------------------- gate / version / help

test('A4：gate --value 按门判 0/1', () => {
  assert.equal(run(['gate', '--value', '10']).code, 0)
  assert.equal(run(['gate', '--value', '30']).code, 1)
  assert.equal(run(['gate', '--value', '15', '--gate', '10']).code, 1)
})

test('A4：--version 与 --help', () => {
  const v = run(['--version'])
  assert.equal(v.code, 0)
  assert.match(v.out, /0\.1\.0/)
  const h = run(['--help'])
  assert.equal(h.code, 0)
  assert.match(h.out, /用法/)
})
