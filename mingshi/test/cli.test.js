/**
 * 名实 CLI 测试 —— 退出码、选项语义、逐字节确定性（A3/A4/A5），全部子进程真实执行。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'mingshi.js')
const fx = (name) => join(root, 'fixtures', name)
const DINGFEN_BIN = join(root, '..', 'dingfen', 'src', 'bin', 'dingfen.js')
const DINGFEN_FX = (name) => join(root, '..', 'dingfen', 'fixtures', name)

function run(args, cwd = root) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' }
}

function tmp() {
  return mkdtempSync(join(tmpdir(), 'mingshi-cli-'))
}

// ---------------------------------------------------------------- audit（A2 复现）

test('A4：audit clean 夹具 —— 0 分 / 正 / exit 0，字段与定标一致', () => {
  const r = run(['audit', fx('clean-stream.jsonl'), '--file', fx('clean-registry.json')])
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  for (const k of ['sessions', 'calls', 'writes', 'imports', 'score', 'band', 'gate', 'verdict', 'ok', 'counts', 'issues']) {
    assert.ok(k in j, `报告应含 ${k}`)
  }
  assert.deepEqual(j.score, { total: 0, ghost: 0, stray: 0 })
  assert.equal(j.band, '正')
  assert.equal(j.verdict, 'pass')
})

test('A4：audit ghost 夹具 —— 51 分 / 妄 / exit 1，counts 逐字吻合', () => {
  const r = run(['audit', fx('ghost-stream.jsonl'), '--file', fx('ghost-registry.json')])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.score, { total: 51, ghost: 45, stray: 6 })
  assert.equal(j.band, '妄')
  assert.deepEqual(j.counts, {
    ghostPackages: 1, ghostRelatives: 1, strayInstalls: 1, trialInstalls: 1,
    exemptImports: 1, exemptInstalls: 1, registryCount: 3,
  })
  assert.match(j.issues.join('\n'), /幻包 ×1/)
  assert.match(j.issues.join('\n'), /幻径 ×1/)
  assert.match(j.issues.join('\n'), /新装 ×1/)
  assert.match(j.issues.join('\n'), /试装 ×1/)
})

test('A4：audit ghost + strict 实册 —— 75 分 / 妄 / 犯装', () => {
  const r = run(['audit', fx('ghost-stream.jsonl'), '--file', fx('strict-registry.json')])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.score, { total: 75, ghost: 45, stray: 30 })
  assert.match(j.issues.join('\n'), /犯装 ×1/)
})

test('A4：audit ghost 无实册 —— 0 分 / 正 / exit 0 / registryCount 0', () => {
  const r = run(['audit', fx('ghost-stream.jsonl')])
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.score, { total: 0, ghost: 0, stray: 0 })
  assert.equal(j.counts.registryCount, 0)
  assert.equal(j.band, '正')
})

test('A4：audit 多流合并 —— 会话数 2，跨会话同名去重', () => {
  const r = run(['audit', fx('clean-stream.jsonl'), fx('ghost-stream.jsonl'), '--file', fx('clean-registry.json')])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.equal(j.sessions, 2)
  assert.equal(j.calls, 8)
})

test('A4：audit --gate 15 —— 15 分亦红', () => {
  const dir = tmp()
  const reg = { version: 1, roots: ['src/**', 'test/**'], packages: ['lodash'] }
  writeFileSync(join(dir, '.mingshi.json'), JSON.stringify(reg, null, 2))
  writeFileSync(join(dir, 's.jsonl'), [
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"src/app.js","content":"import { c } from \'../config/secrets.js\'"}}',
    '{"type":"tool_result","id":"c1","name":"write","args":{"path":"src/app.js","content":"import { c } from \'../config/secrets.js\'"},"isError":false}',
  ].join('\n'))
  const r = run(['audit', 's.jsonl', '--file', '.mingshi.json', '--gate', '15'], dir)
  assert.equal(r.code, 1)
  assert.equal(JSON.parse(r.out).score.total, 15)
})

test('A4：坏 JSON 行 → exit 2 并报行号', () => {
  const dir = tmp()
  writeFileSync(join(dir, 'bad.jsonl'), '{"type":"tool_call"}\nnot-json\n')
  const r = run(['audit', 'bad.jsonl'], dir)
  assert.equal(r.code, 2)
  assert.match(r.err, /第 2 行/)
})

test('A4：流缺失 → exit 2；--file 实册缺失 → exit 2', () => {
  assert.equal(run(['audit', join(tmpdir(), 'nope.jsonl')]).code, 2)
  assert.equal(run(['audit', fx('clean-stream.jsonl'), '--file', join(tmpdir(), 'nope.json')]).code, 2)
})

test('A4：坏实册 → exit 2', () => {
  const dir = tmp()
  writeFileSync(join(dir, '.mingshi.json'), 'not-json')
  const r = run(['audit', fx('clean-stream.jsonl'), '--file', '.mingshi.json'], dir)
  assert.equal(r.code, 2)
  assert.match(r.err, /坏实册/)
})

// ---------------------------------------------------------------- A3 跨项目互认

test('A3：dingfen 流喂 mingshi —— 无内容字段即无名可提，0 分 / 正 / exit 0', () => {
  const r = run(['audit', DINGFEN_FX('fenced-stream.jsonl'), '--file', fx('ghost-registry.json')])
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  assert.equal(j.imports, 0)
  assert.deepEqual(j.score, { total: 0, ghost: 0, stray: 0 })
  assert.equal(j.band, '正')
})

test('A3：mingshi 流喂 dingfen（子进程真跑对方 bin）—— 争值 0 / 定 / exit 0', () => {
  const r = spawnSync(process.execPath, [DINGFEN_BIN, 'audit', fx('ghost-stream.jsonl')], { encoding: 'utf8', cwd: join(root, '..', 'dingfen') })
  assert.equal(r.status, 0, r.stderr)
  const j = JSON.parse(r.stdout)
  assert.deepEqual(j.score, { total: 0, strife: 0, trespass: 0, stray: 0 })
  assert.equal(j.band, '定')
})

// ---------------------------------------------------------------- register / revoke / list

test('A4：register --root/--pkg/--pkgfile 快照，重复登记 exit 2，全空参 exit 2', () => {
  const dir = tmp()
  writeFileSync(join(dir, 'pkg.json'), JSON.stringify({ dependencies: { lodash: '^4' }, devDependencies: { vitest: '^1' } }))
  let r = run(['register', '--root', 'src/**', '--pkg', 'left-pad', '--pkgfile', 'pkg.json'], dir)
  assert.equal(r.code, 0)
  const reg = JSON.parse(readFileSync(join(dir, '.mingshi.json'), 'utf8'))
  assert.deepEqual(reg.roots, ['src/**'])
  assert.ok(reg.packages.includes('lodash') && reg.packages.includes('vitest') && reg.packages.includes('left-pad'))
  assert.equal(reg.packages.length, 3)

  r = run(['register', '--root', 'src/**'], dir)
  assert.equal(r.code, 2)
  assert.match(r.err, /已在册/)

  r = run(['register'], dir)
  assert.equal(r.code, 2)

  r = run(['register', '--pkgfile', join(tmpdir(), 'nope.json')], dir)
  assert.equal(r.code, 2)
})

test('A4：revoke 恰一语义——无此名 exit 2，--root 与 --pkg 双给 exit 2，成功销名', () => {
  const dir = tmp()
  run(['register', '--root', 'src/**', '--pkg', 'lodash'], dir)
  assert.equal(run(['revoke', '--root', 'nope/**'], dir).code, 2)
  assert.equal(run(['revoke', '--pkg', 'nope'], dir).code, 2)
  assert.equal(run(['revoke', '--root', 'src/**', '--pkg', 'lodash'], dir).code, 2)
  const r = run(['revoke', '--root', 'src/**'], dir)
  assert.equal(r.code, 0)
  const reg = JSON.parse(readFileSync(join(dir, '.mingshi.json'), 'utf8'))
  assert.deepEqual(reg.roots, [])
})

test('A4：list / block 实册缺失 → exit 2', () => {
  const dir = tmp()
  assert.equal(run(['list', '--file', join(dir, '.mingshi.json')]).code, 2)
  assert.equal(run(['block', '--file', join(dir, '.mingshi.json')]).code, 2)
})

// ---------------------------------------------------------------- A5 名册块逐字节确定

test('A5：block 同一实册两次 shasum 相同；增一界后文本改变', () => {
  const dir = tmp()
  run(['register', '--root', 'src/**', '--pkg', 'lodash'], dir)
  const a = run(['block', '--file', '.mingshi.json'], dir).out
  const b = run(['block', '--file', '.mingshi.json'], dir).out
  assert.equal(a, b)
  const ha = createHash('sha1').update(a).digest('hex')
  assert.ok(ha.length, 'shasum 可算')
  run(['register', '--root', 'test/**'], dir)
  const c = run(['block', '--file', '.mingshi.json'], dir).out
  assert.notEqual(a, c)
  assert.match(c, /test\/\*\*/)
})

test('A5：空籍确定性空籍文本', () => {
  const dir = tmp()
  writeFileSync(join(dir, '.mingshi.json'), JSON.stringify({ version: 1 }))
  const a = run(['block', '--file', '.mingshi.json'], dir).out
  const b = run(['block', '--file', '.mingshi.json'], dir).out
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
