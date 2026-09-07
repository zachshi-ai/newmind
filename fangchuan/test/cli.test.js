/**
 * CLI 语义测试 —— audit/register/revoke/list/block/gate 与退出码（docs/04 的 A2/A3/A4/A5）。
 * 子进程一律 spawnSync（非零退出拿得到 stdout）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'fangchuan.js')
const F = (name) => join(root, 'fixtures', name)

function run(args, cwd = root) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
}

function audit(name, ...extra) {
  return run(['audit', F(name), ...extra])
}

// ---- A2：七夹具与附加口径（先于实现手算定死）------------------------------

test('夹具 clean 带册：0 案、0 宣带 exit 0（导词在场 + 文档豁免）', () => {
  const r = audit('clean-stream.jsonl', '--file', F('fangchuan-book.json'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 3)
  assert.deepEqual(s.cases, { yan: 0, jun: 0, sha: 0, wu: 0 })
  assert.deepEqual(s.score, { yan: 0, total: 0 })
  assert.equal(s.band, '宣')
})

test('夹具 yancao：湮案 1、15 淤 exit 0（单案黄牌点名不咬门）', () => {
  const r = audit('yancao-stream.jsonl', '--file', F('fangchuan-book.json'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 2)
  assert.deepEqual(s.cases, { yan: 1, jun: 0, sha: 0, wu: 0 })
  assert.deepEqual(s.score, { yan: 15, total: 15 })
  assert.equal(s.band, '淤')
  assert.match(s.issues[0], /湮案：src\/a\.js:3 空捕/)
})

test('夹具 shuangyan：湮案 2、30 塞 exit 1（js 空捕 + py 多行空捕）', () => {
  const r = audit('shuangyan-stream.jsonl', '--file', F('fangchuan-book.json'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 1)
  assert.deepEqual(s.cases, { yan: 2, jun: 0, sha: 0, wu: 0 })
  assert.deepEqual(s.score, { yan: 30, total: 30 })
  assert.equal(s.band, '塞')
})

test('夹具 jun：已浚 1、0 宣带 exit 0（考其末文，改了就净）', () => {
  const r = audit('jun-stream.jsonl', '--file', F('fangchuan-book.json'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.deepEqual(s.cases, { yan: 0, jun: 1, sha: 0, wu: 0 })
  assert.match(s.issues[0], /已浚：src\/a\.js（改净于 seq 2）/)
})

test('夹具 shachuan：沙川 1、0 宣带 exit 0（重定向落点文面不可见）', () => {
  const r = audit('shachuan-stream.jsonl', '--file', F('fangchuan-book.json'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.deepEqual(s.cases, { yan: 0, jun: 0, sha: 1, wu: 0 })
  assert.match(s.issues[0], /沙川：src\/a\.js（seq 1 重定向）/)
})

test('夹具 daozhu：导词在场 + 纵列免扫、0 案 exit 0', () => {
  const r = audit('daozhu-stream.jsonl', '--file', F('fangchuan-book.json'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.deepEqual(s.cases, { yan: 0, jun: 0, sha: 0, wu: 0 })
})

test('夹具 laoliu：末文不改——湮案照计 + 无文之改注记、15 淤 exit 0', () => {
  const r = audit('laoliu-stream.jsonl', '--file', F('fangchuan-book.json'), '--json')
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.deepEqual(s.cases, { yan: 1, jun: 0, sha: 0, wu: 0 })
  assert.match(s.issues.join('\n'), /无文之改 1 笔/)
})

// ---- A2 附加口径 -----------------------------------------------------------

test('附加口径：shuangyan + --gate 40 → 30 过门 exit 0', () => {
  const r = audit('shuangyan-stream.jsonl', '--file', F('fangchuan-book.json'), '--gate', '40')
  assert.equal(r.status, 0)
})

test('附加口径：yancao + --gate 10 → 15 红 exit 1', () => {
  const r = audit('yancao-stream.jsonl', '--file', F('fangchuan-book.json'), '--gate', '10')
  assert.equal(r.status, 1)
})

// ---- A4：多流合审与 CLI 语义 ----------------------------------------------

test('多流合审：shuangyan 拆两流合并审出 30 塞 exit 1（sessions 2）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fangchuan-'))
  try {
    writeFileSync(join(dir, 'a.jsonl'), '{"type":"tool_call","id":"p1","name":"write","args":{"path":"src/a.js","content":"try { x() } catch (e) { }\\n"}}\n{"type":"tool_result","id":"p1","isError":false}\n')
    writeFileSync(join(dir, 'b.jsonl'), '{"type":"tool_call","id":"p2","name":"write","args":{"path":"src/b.py","content":"try:\\n    x()\\nexcept:\\n    pass\\n"}}\n{"type":"tool_result","id":"p2","isError":false}\n')
    const r = run(['audit', join(dir, 'a.jsonl'), join(dir, 'b.jsonl'), '--json'])
    const s = JSON.parse(r.stdout)
    assert.equal(r.status, 1)
    assert.equal(s.calls, 2)
    assert.equal(s.sessions, 2)
    assert.equal(s.score.total, 30)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('坏 JSON 行 → exit 2；流缺失 → exit 2；未知旗标 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fangchuan-'))
  try {
    const f = join(dir, 'bad.jsonl')
    writeFileSync(f, '坏行\n')
    assert.equal(run(['audit', f]).status, 2)
    assert.equal(run(['audit', join(root, 'fixtures', '不存在.jsonl')]).status, 2)
    assert.equal(audit('yancao-stream.jsonl', '--wat').status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('register：立纵 + 去重 + 自动建册；revoke 销纵；缺 --path → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fangchuan-'))
  try {
    const file = join(dir, '.fangchuan.json')
    assert.equal(run(['register']).status, 2)
    let r = run(['register', '--path', 'src/best-effort/*', '--file', file])
    assert.equal(r.status, 0)
    r = run(['register', '--path', 'src/best-effort/*', '--file', file])
    assert.match(r.stdout, /去重/)
    assert.deepEqual(JSON.parse(run(['list', '--file', file, '--json']).stdout).book.indulge, ['src/best-effort/*'])
    r = run(['revoke', '--path', 'src/best-effort/*', '--file', file])
    assert.equal(r.status, 0)
    assert.deepEqual(JSON.parse(run(['list', '--file', file, '--json']).stdout).book.indulge, [])
    assert.equal(run(['revoke', '--path', 'zzz', '--file', file]).status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('list 册缺失 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fangchuan-'))
  try {
    assert.equal(run(['list', '--file', join(dir, '没有.json')]).status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('block：同册两次 shasum 逐字节一致；增纵后文本改变；无册出确定性文本', () => {
  const a = run(['block', '--file', F('fangchuan-book.json')]).stdout
  const b = run(['block', '--file', F('fangchuan-book.json')]).stdout
  assert.equal(a, b)
  assert.equal(
    createHash('sha256').update(a).digest('hex').slice(0, 8),
    createHash('sha256').update(b).digest('hex').slice(0, 8),
  )
  const dir = mkdtempSync(join(tmpdir(), 'fangchuan-'))
  try {
    const file = join(dir, '.fangchuan.json')
    run(['register', '--path', 'vendor/*', '--file', file])
    const c = run(['block', '--file', file]).stdout
    assert.notEqual(a, c)
    assert.match(c, /纵列 1 径/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  assert.match(run(['block']).stdout, /川册：未立（纵列无据，湮形全护）/)
})

test('block 不携带命中行原文（掩码是结构性保证）', () => {
  const out = run(['block', '--file', F('fangchuan-book.json')]).stdout
  assert.ok(!out.includes('load()'))
  assert.ok(!out.includes('catch (e)'))
})

test('gate --value：29 过 / 30 红 / --gate 50 时 45 过', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).status, 0)
  const s = JSON.parse(run(['gate', '--value', '15']).stdout)
  assert.equal(s.band, '淤')
})

test('--version 与 --help 正常', () => {
  assert.match(run(['--version']).stdout.trim(), /^\d+\.\d+\.\d+$/)
  assert.match(run(['--help']).stdout, /防民之口，甚于防川/)
})

// ---- A3：跨项目互认（同格式流零误伤）--------------------------------------

test('跨项目：zhizhi sample 8 调用、无文 2、0 宣带 exit 0（两笔 write 族无 content）', () => {
  const r = run(['audit', join(root, '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl'), '--json'])
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 8)
  assert.deepEqual(s.cases, { yan: 0, jun: 0, sha: 0, wu: 2 })
  assert.equal(s.band, '宣')
})

test('跨项目：dingfen fenced 6 调用、无文 2、exit 0', () => {
  const r = run(['audit', join(root, '..', 'dingfen', 'fixtures', 'fenced-stream.jsonl'), '--json'])
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 6)
  assert.deepEqual(s.cases, { yan: 0, jun: 0, sha: 0, wu: 2 })
})

test('跨项目：kaocheng mixed 4 调用、全 0、exit 0（md/json/extra.txt 皆豁免后缀）', () => {
  const r = run(['audit', join(root, '..', 'kaocheng', 'fixtures', 'mixed-stream.jsonl'), '--json'])
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 4)
  assert.deepEqual(s.cases, { yan: 0, jun: 0, sha: 0, wu: 0 })
})
