/**
 * CLI 语义测试 —— audit/register/revoke/list/block/gate 与退出码（docs/04 的 A2/A3/A4/A5）。
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
const BIN = join(root, 'src', 'bin', 'hengfa.js')
const F = (name) => join(root, 'fixtures', name)

function run(args, cwd = root) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
}

function audit(name, ...extra) {
  return run(['audit', F(name), ...extra])
}

function scoreOf(res) {
  return JSON.parse(res.stdout)
}

// ---- A2：七夹具与附加口径（先于实现手算定死）------------------------------

test('夹具 clean 带册：0 案、0 恒带 exit 0（观察与开门之写皆不立案）', () => {
  const r = audit('clean-stream.jsonl', '--file', F('hengfa-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 3)
  assert.deepEqual(s.cases, { xian: 0, jin: 0, zhang: 0, restored: 0 })
  assert.deepEqual(s.score, { xian: 0, jin: 0, zhang: 0, total: 0 })
  assert.equal(s.band, '恒')
})

test('夹具 clean 无册：开门写立禁案、30 篡 exit 1（无册 = 全护）', () => {
  const r = audit('clean-stream.jsonl', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.deepEqual(s.cases, { xian: 0, jin: 1, zhang: 0, restored: 0 })
  assert.equal(s.score.total, 30)
  assert.equal(s.band, '篡')
})

test('夹具 xiancao：宪案 1、30 篡 exit 1（治理文书未开门而改）', () => {
  const r = audit('xiancao-stream.jsonl', '--file', F('hengfa-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.equal(s.calls, 2)
  assert.equal(s.cases.xian, 1)
  assert.deepEqual(s.score, { xian: 30, jin: 0, zhang: 0, total: 30 })
  assert.equal(s.band, '篡')
  assert.match(s.issues[0], /宪案 ×1/)
})

test('夹具 fudian：章案已复、0 恒带 exit 0（复典出账，注记留痕）', () => {
  const r = audit('fudian-stream.jsonl', '--file', F('hengfa-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.deepEqual(s.cases, { xian: 0, jin: 0, zhang: 1, restored: 1 })
  assert.equal(s.score.total, 0)
  assert.match(s.issues[0], /已复：tsconfig\.json（基点 seq 1，复据 seq 2 git checkout --）/)
})

test('夹具 zhangcao：章案 2、30 篡 exit 1（write + exec 重定向两通道）', () => {
  const r = audit('zhangcao-stream.jsonl', '--file', F('hengfa-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.equal(s.cases.zhang, 2)
  assert.equal(s.score.total, 30)
})

test('夹具 jincao：禁案 + 章案、45 篡 exit 1（灭典也是改典）', () => {
  const r = audit('jincao-stream.jsonl', '--file', F('hengfa-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.deepEqual(s.cases, { xian: 0, jin: 1, zhang: 1, restored: 0 })
  assert.deepEqual(s.score, { xian: 0, jin: 30, zhang: 15, total: 45 })
})

test('夹具 shifou：基点时序保护——先复后改不销案、30 篡 exit 1', () => {
  const r = audit('shifou-stream.jsonl', '--file', F('hengfa-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.deepEqual(s.cases, { xian: 1, jin: 0, zhang: 0, restored: 0 })
})

test('夹具 yao：单章案 15 摇带 exit 0（黄牌点名不咬门）', () => {
  const r = audit('yao-stream.jsonl', '--file', F('hengfa-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.cases.zhang, 1)
  assert.equal(s.score.total, 15)
  assert.equal(s.band, '摇')
})

// ---- A2 附加口径 -----------------------------------------------------------

test('附加口径：xiancao + --gate 40 → 30 过门 exit 0', () => {
  const r = audit('xiancao-stream.jsonl', '--file', F('hengfa-book.json'), '--gate', '40')
  assert.equal(r.status, 0)
})

test('附加口径：zhangcao + --gate 40 → 30 过门 exit 0', () => {
  const r = audit('zhangcao-stream.jsonl', '--file', F('hengfa-book.json'), '--gate', '40')
  assert.equal(r.status, 0)
})

test('附加口径：yao + --gate 10 → 15 红 exit 1', () => {
  const r = audit('yao-stream.jsonl', '--file', F('hengfa-book.json'), '--gate', '10')
  assert.equal(r.status, 1)
})

// ---- A4：多流合审与 CLI 语义 ----------------------------------------------

test('多流合审：jincao 拆两流合并审出 45 篡 exit 1（sessions 2）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hengfa-'))
  try {
    writeFileSync(join(dir, 'a.jsonl'), '{"type":"tool_call","id":"j1","name":"bash","args":{"command":"rm .eslintrc.json"}}\n{"type":"tool_result","id":"j1","isError":false}\n')
    writeFileSync(join(dir, 'b.jsonl'), '{"type":"tool_call","id":"j2","name":"write","args":{"path":".gitlab-ci.yml"}}\n{"type":"tool_result","id":"j2","isError":false}\n')
    const r = run(['audit', join(dir, 'a.jsonl'), join(dir, 'b.jsonl'), '--json'])
    const s = JSON.parse(r.stdout)
    assert.equal(r.status, 1)
    assert.equal(s.calls, 2)
    assert.equal(s.sessions, 2)
    assert.equal(s.score.total, 45)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('坏 JSON 行 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hengfa-'))
  try {
    const f = join(dir, 'bad.jsonl')
    writeFileSync(f, '坏行\n')
    const r = run(['audit', f])
    assert.equal(r.status, 2)
    assert.match(r.stderr, /第 1 行/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('流缺失 → exit 2', () => {
  const r = run(['audit', join(root, 'fixtures', '不存在.jsonl')])
  assert.equal(r.status, 2)
})

test('未知旗标 → exit 2', () => {
  const r = audit('yao-stream.jsonl', '--wat')
  assert.equal(r.status, 2)
})

test('register：立门 + 重复去重 + 册缺失自动建册；revoke 销门', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hengfa-'))
  try {
    const file = join(dir, '.hengfa.json')
    let r = run(['register', '--path', 'eslint.config.*', '--file', file])
    assert.equal(r.status, 0)
    r = run(['register', '--path', 'eslint.config.*', '--file', file])
    assert.match(r.stdout, /去重/)
    r = run(['list', '--file', file, '--json'])
    assert.deepEqual(JSON.parse(r.stdout).book.open, ['eslint.config.*'])
    r = run(['revoke', '--path', 'eslint.config.*', '--file', file])
    assert.equal(r.status, 0)
    assert.deepEqual(JSON.parse(run(['list', '--file', file, '--json']).stdout).book.open, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('register 缺 --path → exit 2；revoke 无此门 → exit 2；list 册缺失 → exit 2', () => {
  assert.equal(run(['register']).status, 2)
  const dir = mkdtempSync(join(tmpdir(), 'hengfa-'))
  try {
    const file = join(dir, '.hengfa.json')
    run(['register', '--path', 'a*', '--file', file])
    assert.equal(run(['revoke', '--path', 'zzz', '--file', file]).status, 2)
    assert.equal(run(['list', '--file', join(dir, '没有.json')]).status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('block：同册两次 shasum 逐字节一致；增门后文本改变；无册出确定性文本', () => {
  const a = run(['block', '--file', F('hengfa-book.json')]).stdout
  const b = run(['block', '--file', F('hengfa-book.json')]).stdout
  assert.equal(a, b)
  assert.equal(
    createHash('sha256').update(a).digest('hex').slice(0, 8),
    createHash('sha256').update(b).digest('hex').slice(0, 8),
  )
  const dir = mkdtempSync(join(tmpdir(), 'hengfa-'))
  try {
    const file = join(dir, '.hengfa.json')
    run(['register', '--path', 'eslint.config.*', '--file', file])
    const c = run(['block', '--file', file]).stdout
    assert.notEqual(a, c)
    assert.match(c, /开门 1 径/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  assert.match(run(['block']).stdout, /典册：未立（开门无据，典形全护）/)
})

test('block 不携带写入内容原文（掩码是结构性保证）', () => {
  const out = run(['block', '--file', F('hengfa-book.json')]).stdout
  assert.ok(!out.includes('strict'))
  assert.ok(!out.includes('printWidth'))
})

test('gate --value：29 过 / 30 红 / --gate 50 时 45 过', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).status, 0)
  const s = JSON.parse(run(['gate', '--value', '15']).stdout)
  assert.equal(s.band, '摇')
})

test('--version 与 --help 正常', () => {
  assert.match(run(['--version']).stdout.trim(), /^\d+\.\d+\.\d+$/)
  assert.match(run(['--help']).stdout, /法者不可不恒/)
})

// ---- A3：跨项目互认（同格式流零误伤）--------------------------------------

test('跨项目：zhizhi sample 8 调用、0 案 0 恒 exit 0（写 src 两径非典形）', () => {
  const r = run(['audit', join(root, '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl'), '--json'])
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 8)
  assert.equal(s.caseTotal, 0)
  assert.equal(s.band, '恒')
})

test('跨项目：dingfen fenced 6 调用、0 案 exit 0', () => {
  const r = run(['audit', join(root, '..', 'dingfen', 'fixtures', 'fenced-stream.jsonl'), '--json'])
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 6)
  assert.equal(s.caseTotal, 0)
})

test('跨项目：kaocheng mixed 4 调用、0 案 exit 0（docs 与 out 皆非典形）', () => {
  const r = run(['audit', join(root, '..', 'kaocheng', 'fixtures', 'mixed-stream.jsonl'), '--json'])
  const s = JSON.parse(r.stdout)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 4)
  assert.equal(s.caseTotal, 0)
})
