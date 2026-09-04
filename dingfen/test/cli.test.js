/**
 * 定分 CLI 测试 —— 退出码、选项语义、逐字节确定性（A4/A5），全部子进程真实执行。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'dingfen.js')
const fx = (name) => join(root, 'fixtures', name)

function run(args, cwd = root) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' }
}

function tmp() {
  return mkdtempSync(join(tmpdir(), 'dingfen-cli-'))
}

// ---------------------------------------------------------------- audit

test('A4：audit fenced 夹具 —— 0 分 / 定 / exit 0，字段与定标一致', () => {
  const r = run(['audit', fx('fenced-stream.jsonl')])
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  for (const k of ['sessions', 'calls', 'writes', 'score', 'band', 'gate', 'verdict', 'ok', 'counts', 'issues']) {
    assert.ok(k in j, `报告应含 ${k}`)
  }
  assert.deepEqual(j.score, { total: 0, strife: 0, trespass: 0, stray: 0 })
  assert.equal(j.band, '定')
  assert.equal(j.verdict, 'pass')
})

test('A2/A4：audit racer 两流 —— 60 / 争 / exit 1，counts 手算吻合', () => {
  const r = run(['audit', fx('racer-a.jsonl'), fx('racer-b.jsonl')])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.equal(j.sessions, 2)
  assert.equal(j.calls, 11)
  assert.equal(j.writes, 8)
  assert.deepEqual(j.score, { total: 60, strife: 60, trespass: 0, stray: 0 })
  assert.deepEqual(j.counts, { strifeSpots: 2, coWrites: 1, trespassPaths: 0, strayPaths: 0, unclaimed: 0 })
  assert.equal(j.band, '争')
  assert.ok(j.issues[0].includes('争写 ×2'))
})

test('A2/A4：audit stray + 分册 —— 36 / 争 / exit 1', () => {
  const r = run(['audit', fx('stray.jsonl'), '--file', fx('stray-registry.json')])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.score, { total: 36, strife: 0, trespass: 30, stray: 6 })
  assert.equal(j.band, '争')
})

test('A2/A4：同流换无 tenant 分册 —— 12 / 定 / exit 0', () => {
  const dir = tmp()
  const reg = join(dir, 'notenant.json')
  writeFileSync(reg, '{ "version": 1, "claims": [ { "id": "stray", "fences": ["src/auth/**"], "at": 10, "releasedAt": null } ] }')
  const r = run(['audit', fx('stray.jsonl'), '--file', reg])
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.score, { total: 12, strife: 0, trespass: 0, stray: 12 })
  assert.equal(j.band, '定')
})

test('A4：--gate 生效（36 对门 70 放行、对门 10 拦下）', () => {
  const base = ['audit', fx('stray.jsonl'), '--file', fx('stray-registry.json')]
  assert.equal(run([...base, '--gate', '70']).code, 0)
  assert.equal(run([...base, '--gate', '10']).code, 1)
})

test('A4：--json 紧凑输出（单行）', () => {
  const r = run(['audit', fx('fenced-stream.jsonl'), '--json'])
  assert.equal(r.code, 0)
  assert.equal(r.out.trim().split('\n').length, 1)
  assert.equal(JSON.parse(r.out).band, '定')
})

test('A4：坏 JSON → exit 2；流缺失 → exit 2；无流参数 → exit 2', () => {
  const dir = tmp()
  const bad = join(dir, 'bad.jsonl')
  writeFileSync(bad, '{"ok":1}\nnot json\n')
  assert.equal(run(['audit', bad]).code, 2)
  assert.equal(run(['audit', join(dir, 'missing.jsonl')]).code, 2)
  assert.equal(run(['audit']).code, 2)
})

test('A4：会话 id 撞名（同基名两流）→ exit 2', () => {
  const d1 = tmp()
  const d2 = tmp()
  writeFileSync(join(d1, 'x.jsonl'), '')
  writeFileSync(join(d2, 'x.jsonl'), '')
  assert.equal(run(['audit', join(d1, 'x.jsonl'), join(d2, 'x.jsonl')]).code, 2)
})

test('A3：跨项目互认 —— jiubian / zhizhi 夹具直接喂 audit（1 会话、0 分、定、exit 0）', () => {
  for (const [proj, file] of [['jiubian', 'adaptive-stream.jsonl'], ['zhizhi', 'sample-stream.jsonl']]) {
    const r = run(['audit', join(root, '..', proj, 'fixtures', file)])
    assert.equal(r.code, 0, `${proj} 应放行`)
    const j = JSON.parse(r.out)
    assert.equal(j.sessions, 1)
    assert.deepEqual(j.score, { total: 0, strife: 0, trespass: 0, stray: 0 })
    assert.equal(j.band, '定')
  }
})

// ---------------------------------------------------------------- claim / release / list

test('A4：claim 缺 --id 或 --fence → exit 2', () => {
  const dir = tmp()
  assert.equal(run(['claim', '--fence', 'src/**'], dir).code, 2)
  assert.equal(run(['claim', '--id', 'a'], dir).code, 2)
})

test('A4：claim 成功写册；争界告警附见证径；--strict 争界 → exit 1', () => {
  const dir = tmp()
  const r1 = run(['claim', '--id', 'a', '--fence', 'src/**', '--at', '10'], dir)
  assert.equal(r1.code, 0)
  assert.match(r1.out, /领分：a ── src\/\*\*/)
  assert.ok(existsSync(join(dir, '.dingfen.json')))
  const r2 = run(['claim', '--id', 'b', '--fence', 'src/api/**', '--at', '20'], dir)
  assert.equal(r2.code, 0)
  assert.match(r2.out, /⚠ 争界：b × a ── 见证径 /)
  const r3 = run(['claim', '--id', 'c', '--fence', 'src/core/**', '--at', '30', '--strict'], dir)
  assert.equal(r3.code, 1, '--strict 下有争界即 1')
  const r4 = run(['claim', '--id', 'd', '--fence', 'docs/**', '--at', '40', '--strict'], dir)
  assert.equal(r4.code, 0, '无争界的 --strict 放行')
})

test('A4：release 落账；无开放之分 → exit 2', () => {
  const dir = tmp()
  run(['claim', '--id', 'a', '--fence', 'src/**', '--at', '10'], dir)
  const r = run(['release', '--id', 'a', '--at', '50'], dir)
  assert.equal(r.code, 0)
  const reg = JSON.parse(readFileSync(join(dir, '.dingfen.json'), 'utf8'))
  assert.equal(reg.claims[0].releasedAt, 50)
  assert.equal(run(['release', '--id', 'a', '--at', '60'], dir).code, 2)
  assert.equal(run(['release', '--id', 'ghost'], dir).code, 2)
})

test('A4：list 输出册 JSON；册缺失 → exit 2', () => {
  const dir = tmp()
  assert.equal(run(['list'], dir).code, 2)
  run(['claim', '--id', 'a', '--fence', 'src/**', '--at', '10'], dir)
  const r = run(['list'], dir)
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  assert.equal(j.claims.length, 1)
  assert.equal(j.claims[0].id, 'a')
})

// ---------------------------------------------------------------- block（A5 逐字节确定）

test('A5：block 两次 shasum 逐字节一致；增一开放之分后文本改变', () => {
  const dir = tmp()
  run(['claim', '--id', 'stray', '--fence', 'src/auth/**', '--at', '10'], dir)
  const h1 = createHash('sha1').update(run(['block'], dir).out).digest('hex')
  const h2 = createHash('sha1').update(run(['block'], dir).out).digest('hex')
  assert.equal(h1, h2, '同一分册两次渲染逐字节一致')
  run(['claim', '--id', 'tenant', '--fence', 'src/api/**', '--at', '20'], dir)
  const h3 = createHash('sha1').update(run(['block'], dir).out).digest('hex')
  assert.notEqual(h1, h3, '册态变了，块必变')
})

test('A5：空册 block 出确定性空册文本；册缺失 → exit 2', () => {
  const dir = tmp()
  writeFileSync(join(dir, 'empty.json'), '{ "version": 1, "claims": [] }')
  const r = run(['block', '--file', join(dir, 'empty.json')])
  assert.equal(r.code, 0)
  assert.match(r.out, /分册无开放之分——无分之地，写入先领分。/)
  const again = run(['block', '--file', join(dir, 'empty.json')])
  assert.equal(r.out, again.out, '空册文本也逐字节确定')
  assert.equal(run(['block', '--file', join(dir, 'nope.json')]).code, 2)
})

// ---------------------------------------------------------------- gate / --version / --help

test('A4：gate --value 按门判 0/1', () => {
  assert.equal(run(['gate', '--value', '36']).code, 1)
  assert.equal(run(['gate', '--value', '29']).code, 0)
  assert.equal(run(['gate', '--value', '12', '--gate', '10']).code, 1)
  const j = JSON.parse(run(['gate', '--value', '36']).out)
  assert.deepEqual(j, { value: 36, gate: 30, verdict: 'fail', ok: false })
})

test('A4：--version 与 --help 正常', () => {
  assert.match(run(['--version']).out.trim(), /^\d+\.\d+\.\d+$/)
  assert.match(run(['--help']).out, /定分 · dingfen/)
  assert.match(run(['--help']).out, /退出码/)
})
