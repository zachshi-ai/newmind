/**
 * CLI 语义测试 —— 复现命令退出码逐条断言 + 用法错误 exit 2 + 册管理与供给（docs/04 A4）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const bin = join(root, 'src', 'bin', 'suliu.js')
const fx = (name) => join(root, 'fixtures', name)

function run(args, cwd = root) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })
}

test('A2 复现·一：clean 0 / yiduan 1 / xianyi 0 / kanyan 0，分数与案账逐字', () => {
  const a = run(['audit', fx('clean-stream.jsonl')])
  assert.equal(a.status, 0)
  assert.match(a.stdout, /受审稿 1（2 行）/)
  assert.match(a.stdout, /案账：臆断 0 · 望断 0 · 显疑 0 · 迟验 0 · 泛因 0/)
  assert.match(a.stdout, /臆值 0（yi 0 \+ wang 0）· 带「澈」· 门 30 → 过/)
  const b = run(['audit', fx('yiduan-stream.jsonl')])
  assert.equal(b.status, 1)
  assert.match(b.stdout, /臆值 30（yi 30 \+ wang 0）· 带「臆」· 门 30 → 红/)
  assert.match(b.stdout, /臆断：docs\/postmortem\.md:3（指纹 [0-9a-f]+）/)
  const c = run(['audit', fx('xianyi-stream.jsonl')])
  assert.equal(c.status, 0)
  assert.match(c.stdout, /注记：docs\/postmortem\.md:3 显疑（推词在场）/)
  const d = run(['audit', fx('kanyan-stream.jsonl')])
  assert.equal(d.status, 0)
  assert.match(d.stdout, /臆值 15（yi 0 \+ wang 15）· 带「望」· 门 30 → 过/)
})

test('A2 复现·二：bayan 0 / chiyan 0 / fanyin 0 / shibai 1', () => {
  assert.equal(run(['audit', fx('bayan-stream.jsonl')]).status, 0)
  const c = run(['audit', fx('chiyan-stream.jsonl')])
  assert.equal(c.status, 0)
  assert.match(c.stdout, /注记：docs\/postmortem\.md:3 迟验（拔验在后）/)
  const f = run(['audit', fx('fanyin-stream.jsonl')])
  assert.equal(f.status, 0)
  assert.match(f.stdout, /注记：docs\/postmortem\.md:3 泛因（因之无物）/)
  assert.equal(run(['audit', fx('shibai-stream.jsonl')]).status, 1)
})

test('A2 复现·三：mianze 带册 0 无册 1 / yanma 0 / zhenmian 0 / yingwen 1 / baishi 0 / shuangdao 0 / mogao 0', () => {
  const book = fx('suliu-book.json')
  assert.equal(run(['audit', fx('mianze-stream.jsonl'), '--file', book]).status, 0)
  assert.equal(run(['audit', fx('mianze-stream.jsonl')]).status, 1)
  assert.equal(run(['audit', fx('yanma-stream.jsonl')]).status, 0)
  assert.equal(run(['audit', fx('zhenmian-stream.jsonl')]).status, 0)
  assert.equal(run(['audit', fx('yingwen-stream.jsonl')]).status, 1)
  assert.equal(run(['audit', fx('baishi-stream.jsonl')]).status, 0)
  assert.equal(run(['audit', fx('shuangdao-stream.jsonl')]).status, 0)
  assert.equal(run(['audit', fx('mogao-stream.jsonl')]).status, 0)
})

test('A2 复现·四：合审 hejian/hechi 与门禁口径 --gate 40 过、--gate 10 红', () => {
  assert.equal(run(['audit', fx('hejian-a.jsonl'), fx('hejian-b.jsonl')]).status, 0)
  const hc = run(['audit', fx('hechi-a.jsonl'), fx('hechi-b.jsonl')])
  assert.equal(hc.status, 0)
  assert.match(hc.stdout, /注记：docs\/postmortem\.md:3 迟验（拔验在后）/)
  assert.equal(run(['audit', fx('yiduan-stream.jsonl'), '--gate', '40']).status, 0)
  assert.equal(run(['audit', fx('kanyan-stream.jsonl'), '--gate', '10']).status, 1)
})

test('坏 JSON 行报行号、流缺失、未知旗标、--gate 缺值 → exit 2', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'suliu-cli-'))
  try {
    const bad = join(tmp, 'bad.jsonl')
    writeFileSync(bad, '{"type":"tool_call","id":"a"}\n{oops}\n')
    const r = run(['audit', bad])
    assert.equal(r.status, 2)
    assert.match(r.stderr, /第 2 行不是合法 JSON/)
    assert.equal(run(['audit', join(tmp, 'nope.jsonl')]).status, 2)
    assert.equal(run(['audit', fx('clean-stream.jsonl'), '--wat']).status, 2)
    assert.equal(run(['audit', fx('clean-stream.jsonl'), '--gate']).status, 2)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('register 缺 --path exit 2；自动建册去重；register 后 audit 免案生效', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'suliu-cli-'))
  try {
    const book = join(tmp, '.suliu.json')
    assert.equal(run(['register', '--file', book]).status, 2)
    const r1 = run(['register', '--path', 'docs/drafts/*', '--file', book])
    assert.equal(r1.status, 0)
    assert.match(r1.stdout, /免审已立：docs\/drafts\/\*/)
    run(['register', '--path', 'docs/drafts/*', '--file', book])
    const saved = JSON.parse(readFileSync(book, 'utf8'))
    assert.deepEqual(saved, { version: 1, excuse: ['docs/drafts/*'] }) // 去重
    // 免案生效：drafts 径在演域本就豁免，换臆册独有豁免验证——reports/internal/*
    const r2 = run(['register', '--path', 'reports/internal/*', '--file', book])
    assert.equal(r2.status, 0)
    const a = run(['audit', fx('mianze-stream.jsonl'), '--file', book])
    assert.equal(a.status, 0) // 免案生效
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('revoke 无此径 exit 2；撤销后恢复判案；list 缺册 exit 2、有册出 JSON', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'suliu-cli-'))
  try {
    const book = join(tmp, '.suliu.json')
    assert.equal(run(['revoke', '--path', 'x/*', '--file', book]).status, 2) // 册缺失
    run(['register', '--path', 'reports/internal/*', '--file', book])
    assert.equal(run(['revoke', '--path', 'no/such/*', '--file', book]).status, 2)
    assert.equal(run(['revoke', '--path', 'reports/internal/*', '--file', book]).status, 0)
    assert.equal(run(['audit', fx('mianze-stream.jsonl'), '--file', book]).status, 1) // 撤后判案
    const l = run(['list', '--file', book])
    assert.equal(l.status, 0)
    assert.match(l.stdout, /"excuse"/)
    assert.equal(run(['list', '--file', join(tmp, 'absent.json')]).status, 2)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('block 无册出确定性文本（臆册：未立（凡因必验））；增免案后文本改变；同册两次 shasum 一致', () => {
  const b1 = run(['block'])
  assert.equal(b1.status, 0)
  assert.match(b1.stdout, /【溯流 · 溯牌】/)
  assert.match(b1.stdout, /臆册：未立（凡因必验）/)
  assert.match(b1.stdout, /词法：诊面形 14 · 归因形 12 ∪ 9 · 验因三通道（拔验\/重演\/勘验）· 推词门/)
  const tmp = mkdtempSync(join(tmpdir(), 'suliu-cli-'))
  try {
    const book = join(tmp, '.suliu.json')
    const h0 = createHash('sha256').update(run(['block', '--file', book]).stdout).digest('hex')
    const h1 = createHash('sha256').update(run(['block', '--file', book]).stdout).digest('hex')
    assert.equal(h0, h1) // 同册（均无册）两次逐字节一致
    run(['register', '--path', 'reports/internal/*', '--file', book])
    const b2 = run(['block', '--file', book])
    assert.match(b2.stdout, /臆册：免审 1 处（reports\/internal\/\*）/)
    assert.notEqual(createHash('sha256').update(b2.stdout).digest('hex'), h0) // 增免案后改变
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('gate --value：29 过 / 30 红 / --gate 50 时 45 过 / 缺值 exit 2', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).status, 0)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).stdout.includes('带「臆」'), true)
  assert.equal(run(['gate', '--value', '25']).stdout.includes('带「望」'), true)
  assert.equal(run(['gate']).status, 2)
})

test('--version 与 --help 正常输出', () => {
  const v = run(['--version'])
  assert.equal(v.status, 0)
  assert.equal(v.stdout.trim(), '0.1.0')
  const h = run(['--help'])
  assert.equal(h.status, 0)
  assert.match(h.stdout, /用法:/)
  assert.match(h.stdout, /凡河中失石，当求之于上流/)
})

test('--json 紧凑输出（audit 单行 JSON，字段齐）', () => {
  const r = run(['audit', fx('yiduan-stream.jsonl'), '--json'])
  assert.equal(r.status, 1)
  const lines = r.stdout.trim().split('\n')
  assert.equal(lines.length, 1) // 紧凑单行
  const obj = JSON.parse(lines[0])
  assert.equal(obj.calls, 1)
  assert.equal(obj.score.total, 30)
  assert.equal(obj.verdict, 'fail')
  assert.ok(Array.isArray(obj.issues))
})

test('audit 无流文件 exit 2；未知命令 exit 2', () => {
  assert.equal(run(['audit']).status, 2)
  assert.match(run(['audit']).stderr, /至少一个会话流/)
  assert.equal(run(['frobnicate']).status, 2)
  assert.match(run(['frobnicate']).stderr, /未知命令/)
})

test('register 不带 --file 用 cwd 默认册（./.suliu.json）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'suliu-cli-'))
  try {
    const r = run(['register', '--path', 'reports/internal/*'], tmp)
    assert.equal(r.status, 0)
    assert.ok(existsSync(join(tmp, '.suliu.json')))
    assert.match(r.stdout, /\.suliu\.json/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('list --json 紧凑输出；audit 合审撞名 exit 2', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'suliu-cli-'))
  try {
    const book = join(tmp, '.suliu.json')
    run(['register', '--path', 'a/*', '--file', book])
    const l = run(['list', '--file', book, '--json'])
    assert.equal(l.status, 0)
    const obj = JSON.parse(l.stdout.trim().split('\n').join(''))
    assert.deepEqual(obj.excuse, ['a/*'])
    const dup = run(['audit', fx('hechi-a.jsonl'), fx('hechi-a.jsonl')])
    assert.equal(dup.status, 2)
    assert.match(dup.stderr, /撞名/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('block 带案渲染：issues 行进块、因面原文与行原文不进块（掩码）', () => {
  const r = run(['audit', fx('yiduan-stream.jsonl')])
  assert.ok(!r.stdout.includes('缓存过期')) // audit 判词不携带行原文与因面原文
  const b = run(['block'])
  assert.ok(!b.stdout.includes('缓存过期'))
  assert.match(b.stdout, /案账：臆断 0 · 望断 0 · 显疑 0 · 迟验 0 · 泛因 0/)
})

test('跨项目七流 CLI 复验：外层夹具喂本层零误伤、全澈带 exit 0', () => {
  const names = [
    '../zhizhi/fixtures/sample-stream.jsonl',
    '../kaocheng/fixtures/mixed-stream.jsonl',
    '../dingfen/fixtures/fenced-stream.jsonl',
    '../erbing/fixtures/mixed-stream.jsonl',
    '../erbing/fixtures/delegated-stream.jsonl',
    '../huashui/fixtures/fuji-stream.jsonl',
    '../jiaotuo/fixtures/weizhao-stream.jsonl',
  ]
  for (const rel of names) {
    const p = join(root, rel)
    assert.ok(existsSync(p), rel)
    const r = run(['audit', p])
    assert.equal(r.status, 0, rel)
    assert.match(r.stdout, /受审稿 0（0 行）/)
  }
})
