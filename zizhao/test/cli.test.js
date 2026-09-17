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
const bin = join(root, 'src', 'bin', 'zizhao.js')
const fx = (name) => join(root, 'fixtures', name)

function run(args, cwd = root) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })
}

test('A2 复现·一：clean 0 / huoduan 1 / mijing 0 / sigeng 0，分数与案账逐字', () => {
  const a = run(['audit', fx('clean-stream.jsonl')])
  assert.equal(a.status, 0)
  assert.match(a.stdout, /受审稿 1（2 行）/)
  assert.match(a.stdout, /案账：护短 0 · 思短 0 · 泛弃 0 · 虚弃 0 · 镜凭 0/)
  assert.match(a.stdout, /照值 0（hu 0）· 带「明」· 门 30 → 过/)
  const b = run(['audit', fx('huoduan-stream.jsonl')])
  assert.equal(b.status, 1)
  assert.match(b.stdout, /照值 30（hu 30）· 带「盲」· 门 30 → 红/)
  assert.match(b.stdout, /护短：docs\/retro-report\.md:3（指纹 [0-9a-f]+）/)
  const c = run(['audit', fx('mijing-stream.jsonl')])
  assert.equal(c.status, 0)
  assert.match(c.stdout, /注记：docs\/retro-report\.md:3 镜凭（基线在先）/)
  const d = run(['audit', fx('sigeng-stream.jsonl')])
  assert.equal(d.status, 0)
  assert.match(d.stdout, /注记：docs\/retro-report\.md:3 思短（弃后自更）/)
})

test('A2 复现·二：xuqi 0 / fanqi 0 / foujue 0 / suiyangdi 1', () => {
  const x = run(['audit', fx('xuqi-stream.jsonl')])
  assert.equal(x.status, 0)
  assert.match(x.stdout, /注记：docs\/retro-report\.md:3 虚弃（红之不在场）/)
  const f = run(['audit', fx('fanqi-stream.jsonl')])
  assert.equal(f.status, 0)
  assert.match(f.stdout, /注记：docs\/summary\.md:3 泛弃（弃之无物）/)
  const g = run(['audit', fx('foujue-stream.jsonl')])
  assert.equal(g.status, 0)
  assert.match(g.stdout, /案账：护短 0 · 思短 0 · 泛弃 0 · 虚弃 0 · 镜凭 0/)
  const s = run(['audit', fx('suiyangdi-stream.jsonl')])
  assert.equal(s.status, 1)
  assert.match(s.stdout, /照值 60（hu 60）· 带「盲」· 门 30 → 红/)
})

test('A2 复现·三：zhaoce 带册 0 无册 1 / yingwen 1 / yushiji 0', () => {
  const book = fx('zizhao-book.json')
  const w = run(['audit', fx('zhaoce-stream.jsonl'), '--file', book])
  assert.equal(w.status, 0)
  assert.match(w.stdout, /受审稿 0（0 行）/)
  assert.equal(run(['audit', fx('zhaoce-stream.jsonl')]).status, 1)
  assert.equal(run(['audit', fx('yingwen-stream.jsonl')]).status, 1)
  const y = run(['audit', fx('yushiji-stream.jsonl')])
  assert.equal(y.status, 0)
  assert.match(y.stdout, /案账：护短 0 · 思短 0 · 泛弃 0 · 虚弃 0 · 镜凭 0/)
})

test('A2 复现·四：yanwu 0 / mogai 0 / baixie 0 / zhenmian 0 / hezhao 1 / hejing 0 / 门禁口径', () => {
  assert.equal(run(['audit', fx('yanwu-stream.jsonl')]).status, 0)
  const m = run(['audit', fx('mogai-stream.jsonl')])
  assert.equal(m.status, 0)
  assert.match(m.stdout, /受审稿 1（1 行）/)
  assert.equal(run(['audit', fx('baixie-stream.jsonl')]).status, 0)
  assert.equal(run(['audit', fx('zhenmian-stream.jsonl')]).status, 0)
  assert.equal(run(['audit', fx('hezhao-a.jsonl'), fx('hezhao-b.jsonl')]).status, 1)
  const hj = run(['audit', fx('hejing-a.jsonl'), fx('hejing-b.jsonl')])
  assert.equal(hj.status, 0)
  assert.match(hj.stdout, /镜凭 1/)
  assert.equal(run(['audit', fx('huoduan-stream.jsonl'), '--gate', '40']).status, 0)
  assert.equal(run(['audit', fx('huoduan-stream.jsonl'), '--gate', '20']).status, 1)
})

test('坏 JSON 行报行号、流缺失、未知旗标、--gate 缺值 → exit 2', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'zizhao-cli-'))
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
  const tmp = mkdtempSync(join(tmpdir(), 'zizhao-cli-'))
  try {
    const book = join(tmp, '.zizhao.json')
    assert.equal(run(['register', '--file', book]).status, 2)
    const r1 = run(['register', '--path', 'reports/internal/*', '--file', book])
    assert.equal(r1.status, 0)
    assert.match(r1.stdout, /免审已立：reports\/internal\/\*/)
    run(['register', '--path', 'reports/internal/*', '--file', book])
    const saved = JSON.parse(readFileSync(book, 'utf8'))
    assert.deepEqual(saved, { version: 1, allow: ['reports/internal/*'] }) // 去重
    const a = run(['audit', fx('zhaoce-stream.jsonl'), '--file', book])
    assert.equal(a.status, 0) // 免案生效
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('revoke 无此径 exit 2；撤销后恢复判案；list 缺册 exit 2、有册出 JSON', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'zizhao-cli-'))
  try {
    const book = join(tmp, '.zizhao.json')
    assert.equal(run(['revoke', '--path', 'x/*', '--file', book]).status, 2) // 册缺失
    run(['register', '--path', 'reports/internal/*', '--file', book])
    assert.equal(run(['revoke', '--path', 'no/such/*', '--file', book]).status, 2)
    assert.equal(run(['revoke', '--path', 'reports/internal/*', '--file', book]).status, 0)
    assert.equal(run(['audit', fx('zhaoce-stream.jsonl'), '--file', book]).status, 1) // 撤后判案
    const l = run(['list', '--file', book])
    assert.equal(l.status, 0)
    assert.match(l.stdout, /"allow"/)
    assert.equal(run(['list', '--file', join(tmp, 'absent.json')]).status, 2)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('block 无册出确定性文本（照册：未立（凡弃必凭））；增免案后文本改变；同册两次 shasum 一致', () => {
  const b1 = run(['block'])
  assert.equal(b1.status, 0)
  assert.match(b1.stdout, /【自照 · 照牌】/)
  assert.match(b1.stdout, /照册：未立（凡弃必凭）/)
  assert.match(b1.stdout, /词法：责面形 10 · 弃责形 10 ∪ 15 · 否定卫 · 镜形 · 三通道（红账\/镜凭\/思短）/)
  const tmp = mkdtempSync(join(tmpdir(), 'zizhao-cli-'))
  try {
    const book = join(tmp, '.zizhao.json')
    const h0 = createHash('sha256').update(run(['block', '--file', book]).stdout).digest('hex')
    const h1 = createHash('sha256').update(run(['block', '--file', book]).stdout).digest('hex')
    assert.equal(h0, h1) // 同册（均无册）两次逐字节一致
    run(['register', '--path', 'reports/internal/*', '--file', book])
    const b2 = run(['block', '--file', book])
    assert.match(b2.stdout, /照册：免审 1 处（reports\/internal\/\*）/)
    assert.notEqual(createHash('sha256').update(b2.stdout).digest('hex'), h0) // 增免案后改变
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('gate --value：29 过 / 30 红 / --gate 50 时 45 过（盲带）/ 缺值 exit 2', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  const g = run(['gate', '--value', '45', '--gate', '50'])
  assert.equal(g.status, 0)
  assert.ok(g.stdout.includes('带「盲」'))
  assert.ok(run(['gate', '--value', '25']).stdout.includes('带「暗」'))
  assert.equal(run(['gate']).status, 2)
})

test('--version 与 --help 正常输出', () => {
  const v = run(['--version'])
  assert.equal(v.status, 0)
  assert.equal(v.stdout.trim(), '0.1.0')
  const h = run(['--help'])
  assert.equal(h.status, 0)
  assert.match(h.stdout, /用法:/)
  assert.match(h.stdout, /人欲自照，必须明镜/)
})

test('--json 紧凑输出（audit 单行 JSON，字段齐）', () => {
  const r = run(['audit', fx('huoduan-stream.jsonl'), '--json'])
  assert.equal(r.status, 1)
  const lines = r.stdout.trim().split('\n')
  assert.equal(lines.length, 1) // 紧凑单行
  const obj = JSON.parse(lines[0])
  assert.equal(obj.calls, 2)
  assert.equal(obj.score.total, 30)
  assert.equal(obj.band, '盲')
  assert.equal(obj.verdict, 'fail')
  assert.deepEqual(obj.counts, { hd: 1, sg: 0, fq: 0, xq: 0, mp: 0 })
  assert.ok(Array.isArray(obj.issues))
})

test('audit 无流文件 exit 2；未知命令 exit 2', () => {
  assert.equal(run(['audit']).status, 2)
  assert.match(run(['audit']).stderr, /至少一个会话流/)
  assert.equal(run(['frobnicate']).status, 2)
  assert.match(run(['frobnicate']).stderr, /未知命令/)
})

test('register 不带 --file 用 cwd 默认册（./.zizhao.json）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'zizhao-cli-'))
  try {
    const r = run(['register', '--path', 'reports/internal/*'], tmp)
    assert.equal(r.status, 0)
    assert.ok(existsSync(join(tmp, '.zizhao.json')))
    assert.match(r.stdout, /\.zizhao\.json/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('list --json 紧凑输出；audit 合审撞名 exit 2', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'zizhao-cli-'))
  try {
    const book = join(tmp, '.zizhao.json')
    run(['register', '--path', 'a/*', '--file', book])
    const l = run(['list', '--file', book, '--json'])
    assert.equal(l.status, 0)
    const obj = JSON.parse(l.stdout.trim().split('\n').join(''))
    assert.deepEqual(obj.allow, ['a/*'])
    const dup = run(['audit', fx('hezhao-a.jsonl'), fx('hezhao-a.jsonl')])
    assert.equal(dup.status, 2)
    assert.match(dup.stderr, /撞名/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('block 带案渲染：audit 判词不携带行原文与对象词元（掩码）', () => {
  const r = run(['audit', fx('huoduan-stream.jsonl')])
  assert.ok(!r.stdout.includes('历史遗留')) // 判词不携带行原文
  assert.ok(!r.stdout.includes('test_login')) // 对象词元不进判词（掩码是结构性保证）
  const b = run(['block'])
  assert.ok(!b.stdout.includes('历史遗留'))
  assert.match(b.stdout, /案账：护短 0 · 思短 0 · 泛弃 0 · 虚弃 0 · 镜凭 0/)
})

test('跨项目七流 CLI 复验：外层夹具喂本层零误伤、全明带 exit 0', () => {
  const names = [
    ['../zhizhi/fixtures/sample-stream.jsonl', 0],
    ['../kaocheng/fixtures/mixed-stream.jsonl', 1], // docs/report.md 受审但零弃责形
    ['../dingfen/fixtures/fenced-stream.jsonl', 0],
    ['../erbing/fixtures/mixed-stream.jsonl', 0],
    ['../erbing/fixtures/delegated-stream.jsonl', 0],
    ['../huashui/fixtures/fuji-stream.jsonl', 0],
    ['../jiaotuo/fixtures/weizhao-stream.jsonl', 1], // docs/report.md 受审但零弃责形
  ]
  for (const [rel, paths] of names) {
    const p = join(root, rel)
    assert.ok(existsSync(p), rel)
    const r = run(['audit', p])
    assert.equal(r.status, 0, rel)
    assert.match(r.stdout, new RegExp(`受审稿 ${paths}（`), rel)
    assert.match(r.stdout, /案账：护短 0 · 思短 0 · 泛弃 0 · 虚弃 0 · 镜凭 0/, rel)
  }
})
