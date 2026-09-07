/**
 * CLI 语义测试 —— audit/allow/disallow/list/block/gate 与退出码（docs/04 的 A2/A3/A4/A5）。
 * 子进程一律 spawnSync（非零退出拿得到 stdout）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'chengshi.js')
const F = (name) => join(root, 'fixtures', name)
const SIB = (proj, name) => join(root, '..', proj, 'fixtures', name)
const BOOK = F('chengshi-book.json')

function run(args, cwd = root) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
}

function audit(...args) {
  return run(['audit', ...args])
}

// ---- A2：七夹具与附加口径（先于实现手算定死）------------------------------

test('夹具 clean 带册：初遂 3、0 谐 exit 0（首笔恒初遂；mail 失败不遂；npm test 非遂形）', () => {
  const r = audit(F('clean-stream.jsonl'), '--file', BOOK, '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 6)
  assert.deepEqual(s.cases, { chu: 3, chong: 0, xiao: 0, huo: 0, cheng: 0 })
  assert.deepEqual(s.score, { chong: 0, total: 0 })
  assert.equal(s.band, '谐')
})

test('夹具 chonggao：重决 1、30 叠 exit 1（两笔 write 夹一双生——夹写不断罪）', () => {
  const r = audit(F('chonggao-stream.jsonl'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 1)
  assert.equal(s.calls, 4)
  assert.deepEqual(s.cases, { chu: 1, chong: 1, xiao: 0, huo: 0, cheng: 0 })
  assert.deepEqual(s.score, { chong: 30, total: 30 })
  assert.equal(s.band, '叠')
  assert.match(s.issues[0], /重决：gh·issue·create [0-9a-f]{8} ×1（初遂 seq 0，再施 seq 1）/)
})

test('夹具 chonggao --gate 40：30 过门 exit 0', () => {
  const r = audit(F('chonggao-stream.jsonl'), '--gate', '40')
  assert.equal(r.status, 0)
})

test('夹具 shuangchong：重决 2、60 沓 exit 1（重邮 + 重单，cap 60 触顶）', () => {
  const r = audit(F('shuangchong-stream.jsonl'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 1)
  assert.deepEqual(s.cases, { chu: 2, chong: 2, xiao: 0, huo: 0, cheng: 0 })
  assert.deepEqual(s.score, { chong: 60, total: 60 })
  assert.equal(s.band, '沓')
})

test('夹具 chengming：承施 1、0 谐 exit 0（主文命词「再发」开新决）', () => {
  const r = audit(F('chengming-stream.jsonl'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.deepEqual(s.cases, { chu: 1, chong: 0, xiao: 0, huo: 0, cheng: 1 })
  assert.equal(s.score.total, 0)
  assert.match(s.issues.find((i) => i.startsWith('承施')), /命于 seq 1/)
})

test('夹具 xiaoju：已消 1、0 谐 exit 0（成物之柄 7 × 消词 close）', () => {
  const r = audit(F('xiaoju-stream.jsonl'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.deepEqual(s.cases, { chu: 1, chong: 0, xiao: 1, huo: 0, cheng: 0 })
  assert.match(s.issues.find((i) => i.startsWith('已消')), /消于 seq 1/)
})

test('夹具 yunchong 带册：豁施 2、0 谐 exit 0；无册对照：重决 2、60 沓 exit 1', () => {
  const withBook = audit(F('yunchong-stream.jsonl'), '--file', BOOK, '--json')
  const a = JSON.parse(withBook.stdout)
  assert.equal(withBook.status, 0)
  assert.deepEqual(a.cases, { chu: 1, chong: 0, xiao: 0, huo: 2, cheng: 0 })
  const noBook = audit(F('yunchong-stream.jsonl'), '--json')
  const b = JSON.parse(noBook.stdout)
  assert.equal(noBook.status, 1)
  assert.deepEqual(b.cases, { chu: 1, chong: 2, xiao: 0, huo: 0, cheng: 0 })
  assert.deepEqual(b.score, { chong: 60, total: 60 })
})

test('夹具 laoliu 老流：无 isError 按已发生——重决 1、30 叠 exit 1', () => {
  const r = audit(F('laoliu-stream.jsonl'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 1)
  assert.equal(s.calls, 2)
  assert.deepEqual(s.cases, { chu: 1, chong: 1, xiao: 0, huo: 0, cheng: 0 })
})

test('附加口径：shuangchong 拆两流合审仍 60 沓 exit 1（离线合并）', () => {
  const r = audit(F('shuangchong-part1.jsonl'), F('shuangchong-part2.jsonl'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 1)
  assert.deepEqual(s.cases, { chu: 2, chong: 2, xiao: 0, huo: 0, cheng: 0 })
  assert.equal(s.score.total, 60)
})

test('附加口径：chonggao 拆两会话合审仍重决 1（跨会话重决）', () => {
  const r = audit(F('chonggao-s1.jsonl'), F('chonggao-s2.jsonl'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 1)
  assert.deepEqual(s.cases, { chu: 1, chong: 1, xiao: 0, huo: 0, cheng: 0 })
})

// ---- A3：跨项目互认（全零误伤）--------------------------------------------

test('A3：zhizhi sample 无册喂入——npm test 非遂形，全 0 谐 exit 0', () => {
  const r = audit(SIB('zhizhi', 'sample-stream.jsonl'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 8)
  assert.deepEqual(s.cases, { chu: 0, chong: 0, xiao: 0, huo: 0, cheng: 0 })
})

test('A3：kaocheng mixed 与 fangchuan yancao 无册喂入——写与重定向非施，全 0', () => {
  for (const [proj, name, calls] of [['kaocheng', 'mixed-stream.jsonl', 4], ['fangchuan', 'yancao-stream.jsonl', 2]]) {
    const r = audit(SIB(proj, name), '--json')
    const s = JSON.parse(r.stdout)
    assert.equal(r.status, 0, `${proj}/${name}`)
    assert.equal(s.calls, calls, `${proj}/${name}`)
    assert.deepEqual(s.cases, { chu: 0, chong: 0, xiao: 0, huo: 0, cheng: 0 }, `${proj}/${name}`)
  }
})

test('A3：erbing mixed 与 delegated 无册喂入——terraform/npm publish 排除类、mail 失败不遂，全 0', () => {
  const mixed = audit(SIB('erbing', 'mixed-stream.jsonl'), '--json')
  const a = JSON.parse(mixed.stdout)
  assert.equal(mixed.status, 0)
  assert.equal(a.calls, 5)
  assert.deepEqual(a.cases, { chu: 0, chong: 0, xiao: 0, huo: 0, cheng: 0 })
  const delegated = audit(SIB('erbing', 'delegated-stream.jsonl'), '--json')
  const b = JSON.parse(delegated.stdout)
  assert.equal(delegated.status, 0)
  assert.equal(b.calls, 5) // 4 笔 exec + 1 笔 ask（other 族非施）
  assert.deepEqual(b.cases, { chu: 0, chong: 0, xiao: 0, huo: 0, cheng: 0 })
})

// ---- A4：CLI 语义 ----------------------------------------------------------

test('audit：坏 JSON 行 → exit 2；流缺失 → exit 2；未知旗标 → exit 2', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'chengshi-'))
  const bad = join(tmp, 'bad.jsonl')
  writeFileSync(bad, '{"type":"tool_call"}\n坏行\n')
  assert.equal(audit(bad).status, 2)
  assert.equal(audit(join(tmp, 'missing.jsonl')).status, 2)
  assert.equal(audit(F('clean-stream.jsonl'), '--wat').status, 2)
  rmSync(tmp, { recursive: true, force: true })
})

test('audit：无流文件 → exit 2', () => {
  assert.equal(run(['audit']).status, 2)
})

test('allow：缺 --key → exit 2；册缺失自动建册；重复登记去重', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'chengshi-'))
  const book = join(tmp, 'new-book.json')
  assert.equal(run(['allow'], tmp).status, 2)
  assert.equal(run(['allow', '--key', 'curl -d*beat*', '--file', book], tmp).status, 0)
  assert.match(readFileSync(book, 'utf8'), /curl -d\*beat\*/)
  const r = run(['allow', '--key', 'curl -d*beat*', '--file', book], tmp)
  assert.match(r.stdout, /已允，去重/)
  rmSync(tmp, { recursive: true, force: true })
})

test('disallow：无此允 → exit 2；list：册缺失 → exit 2', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'chengshi-'))
  const book = join(tmp, 'b.json')
  writeFileSync(book, '{"version":1,"allow":[]}')
  assert.equal(run(['disallow', '--key', 'nope'], tmp).status, 2)
  assert.equal(run(['list'], tmp).status, 2)
  const r = run(['list', '--file', book], tmp)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /"allow"/)
  rmSync(tmp, { recursive: true, force: true })
})

test('gate：29 过 / 30 红 / --gate 50 时 45 过', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).status, 0)
  assert.equal(run(['gate']).status, 2)
})

test('--version 与 --help 正常', () => {
  assert.match(run(['--version']).stdout.trim(), /^\d+\.\d+\.\d+$/)
  assert.match(run(['--help']).stdout, /用法/)
  assert.match(run([]).stdout, /用法/)
})

// ---- A5：遂牌块逐字节确定 --------------------------------------------------

test('A5：同一遂册两次 block shasum 相同；增允后文本改变；无册出确定性文本', () => {
  const t1 = run(['block', '--file', BOOK]).stdout
  const t2 = run(['block', '--file', BOOK]).stdout
  assert.equal(t1, t2)
  assert.equal(
    createHash('sha256').update(t1).digest('hex').slice(0, 8),
    createHash('sha256').update(t2).digest('hex').slice(0, 8),
  )
  const tmp = mkdtempSync(join(tmpdir(), 'chengshi-'))
  const book = join(tmp, 'b.json')
  run(['allow', '--key', 'gh release*', '--file', book], tmp)
  const t3 = run(['block', '--file', book]).stdout
  assert.notEqual(t1, t3)
  assert.match(t3, /允 1 键（gh release\*）/)
  const noBook = run(['block'], tmp).stdout
  assert.match(noBook, /遂册：未立（允列无据，已遂照账）/)
  rmSync(tmp, { recursive: true, force: true })
})
