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
const bin = join(root, 'src', 'bin', 'kuijing.js')
const fx = (name) => join(root, 'fixtures', name)

function run(args, cwd = root) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })
}

test('A2 复现·一：clean 0 / fanan 1 / yuxiao 1 / jiangeng 0，分数与案账逐字', () => {
  const a = run(['audit', fx('clean-stream.jsonl')])
  assert.equal(a.status, 0)
  assert.match(a.stdout, /受审稿 1（1 判行）/)
  assert.match(a.stdout, /案账：翻案 0 · 谀断 0 · 泛判 0 · 鉴更 0/)
  assert.match(a.stdout, /谀值 0（yu 0）· 带「明」· 门 30 → 过/)
  const b = run(['audit', fx('fanan-stream.jsonl')])
  assert.equal(b.status, 1)
  assert.match(b.stdout, /谀值 30（yu 30）· 带「谀」· 门 30 → 红/)
  assert.match(b.stdout, /翻案：docs\/auth-review\.md:3（指纹 [0-9a-f]+）/)
  const c = run(['audit', fx('yuxiao-stream.jsonl')])
  assert.equal(c.status, 1)
  assert.match(c.stdout, /翻案：docs\/decision\.md:3（指纹 [0-9a-f]+）/)
  const d = run(['audit', fx('jiangeng-stream.jsonl')])
  assert.equal(d.status, 0)
  assert.match(d.stdout, /注记：docs\/auth-review\.md:3 鉴更（有据之更）/)
})

test('A2 复现·二：chengeng 0 / xiejv 0 / zhuru 1 / guankan 0 / baikan 1 / shikuai 1', () => {
  assert.equal(run(['audit', fx('chengeng-stream.jsonl')]).status, 0)
  assert.equal(run(['audit', fx('xiejv-stream.jsonl')]).status, 0)
  assert.equal(run(['audit', fx('zhuru-stream.jsonl')]).status, 1)
  assert.equal(run(['audit', fx('guankan-stream.jsonl')]).status, 0)
  assert.equal(run(['audit', fx('baikan-stream.jsonl')]).status, 1)
  assert.equal(run(['audit', fx('shikuai-stream.jsonl')]).status, 1)
})

test('A2 复现·三：yuduan 15 谄 / wumian 0 / panjue 0 / fouren 0', () => {
  const a = run(['audit', fx('yuduan-stream.jsonl')])
  assert.equal(a.status, 0)
  assert.match(a.stdout, /谀值 15（yu 15）· 带「谄」· 门 30 → 过/)
  assert.match(a.stdout, /谀断：docs\/apollo-review\.md:3（指纹 [0-9a-f]+）/)
  const b = run(['audit', fx('wumian-stream.jsonl')])
  assert.equal(b.status, 0)
  assert.match(b.stdout, /案账：翻案 0 · 谀断 0 · 泛判 0 · 鉴更 0/)
  const c = run(['audit', fx('panjue-stream.jsonl')])
  assert.equal(c.status, 0)
  assert.match(c.stdout, /注记：docs\/plan-review\.md:3 泛判（判之无物）/)
  const d = run(['audit', fx('fouren-stream.jsonl')])
  assert.equal(d.status, 0)
  assert.match(d.stdout, /受审稿 1（0 判行）/)
})

test('A2 复现·四：yingwen 1 / shuangfan 60 / weiwo 0 / laoliu 0', () => {
  const a = run(['audit', fx('yingwen-stream.jsonl')])
  assert.equal(a.status, 1)
  assert.match(a.stdout, /谀值 30（yu 30）· 带「谀」· 门 30 → 红/)
  const b = run(['audit', fx('shuangfan-stream.jsonl')])
  assert.equal(b.status, 1)
  assert.match(b.stdout, /谀值 60（yu 60）· 带「谀」· 门 30 → 红/)
  const c = run(['audit', fx('weiwo-stream.jsonl')])
  assert.equal(c.status, 0)
  assert.match(c.stdout, /受审稿 0/)
  const d = run(['audit', fx('laoliu-stream.jsonl')])
  assert.equal(d.status, 0)
  assert.match(d.stdout, /注记：docs\/auth-review\.md:3 鉴更（有据之更）/)
})

test('A2 复现·五：合审 hepan 1 / hegeng 0；zhaice 带册 0 无册 1', () => {
  const h1 = run(['audit', fx('hepan-a.jsonl'), fx('hepan-b.jsonl')])
  assert.equal(h1.status, 1)
  assert.match(h1.stdout, /会话 2 · 调用 2/)
  assert.match(h1.stdout, /翻案：docs\/auth-review\.md:3（指纹 [0-9a-f]+）/)
  const h2 = run(['audit', fx('hegeng-a.jsonl'), fx('hegeng-b.jsonl')])
  assert.equal(h2.status, 0)
  const z1 = run(['audit', fx('zhaice-stream.jsonl'), '--file', fx('kuijing-book.json')])
  assert.equal(z1.status, 0)
  assert.match(z1.stdout, /受审稿 0/)
  const z2 = run(['audit', fx('zhaice-stream.jsonl')])
  assert.equal(z2.status, 1)
})

test('A2 附加口径：--gate 40 过 / --gate 20 红', () => {
  assert.equal(run(['audit', fx('fanan-stream.jsonl'), '--gate', '40']).status, 0)
  assert.equal(run(['audit', fx('fanan-stream.jsonl'), '--gate', '20']).status, 1)
})

test('--json 紧凑输出字段齐备', () => {
  const r = run(['audit', fx('fanan-stream.jsonl'), '--json'])
  assert.equal(r.status, 1)
  const obj = JSON.parse(r.stdout)
  assert.equal(obj.calls, 2)
  assert.equal(obj.counts.fa, 1)
  assert.equal(obj.score.total, 30)
  assert.equal(obj.band, '谀')
  assert.equal(obj.verdict, 'fail')
})

test('坏 JSON 行报行号 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kuijing-'))
  const p = join(dir, 'bad.jsonl')
  writeFileSync(p, '# ok\n{"type":"tool_call","id":"c1","name":"write","args":{}}\n{oops}\n')
  const r = run(['audit', p])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /第 3 行不是合法 JSON/)
  rmSync(dir, { recursive: true, force: true })
})

test('流缺失 → exit 2；未知旗标 → exit 2；--gate 缺值 → exit 2；缺流文件 → exit 2', () => {
  const missing = run(['audit', join(root, 'fixtures', 'nope.jsonl')])
  assert.equal(missing.status, 2)
  const unknown = run(['audit', fx('fanan-stream.jsonl'), '--wat'])
  assert.equal(unknown.status, 2)
  assert.match(unknown.stderr, /未知旗标/)
  const nogate = run(['audit', fx('fanan-stream.jsonl'), '--gate'])
  assert.equal(nogate.status, 2)
  assert.match(nogate.stderr, /--gate 需要值/)
  const nostream = run(['audit'])
  assert.equal(nostream.status, 2)
})

test('register：缺 --path exit 2；自动建册去重；register 后 audit 免案生效', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kuijing-'))
  const book = join(dir, 'k.json')
  const r0 = run(['register', '--file', book])
  assert.equal(r0.status, 2)
  const r1 = run(['register', '--path', 'docs/internal/*', '--file', book])
  assert.equal(r1.status, 0)
  assert.match(r1.stdout, /免审已立：docs\/internal\/\*/)
  const r2 = run(['register', '--path', 'docs/internal/*', '--file', book])
  assert.equal(r2.status, 0)
  assert.match(r2.stdout, /共 1 处/)
  assert.equal(existsSync(book), true)
  const a = run(['audit', fx('zhaice-stream.jsonl'), '--file', book])
  assert.equal(a.status, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('revoke：无此径 exit 2；revoke 后门禁恢复', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kuijing-'))
  const book = join(dir, 'k.json')
  run(['register', '--path', 'docs/internal/*', '--file', book])
  const r0 = run(['revoke', '--path', 'docs/other/*', '--file', book])
  assert.equal(r0.status, 2)
  assert.match(r0.stderr, /无此免审径/)
  const r1 = run(['revoke', '--path', 'docs/internal/*', '--file', book])
  assert.equal(r1.status, 0)
  const a = run(['audit', fx('zhaice-stream.jsonl'), '--file', book])
  assert.equal(a.status, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('list：册缺失 exit 2；有册出 JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kuijing-'))
  const book = join(dir, 'k.json')
  const l0 = run(['list', '--file', book])
  assert.equal(l0.status, 2)
  run(['register', '--path', 'docs/internal/*', '--file', book])
  const l1 = run(['list', '--file', book])
  assert.equal(l1.status, 0)
  assert.deepEqual(JSON.parse(l1.stdout).allow, ['docs/internal/*'])
  rmSync(dir, { recursive: true, force: true })
})

test('block：无册确定性文本；增免案文本改变；shasum 双跑一致', () => {
  const b0 = run(['block'])
  assert.equal(b0.status, 0)
  assert.match(b0.stdout, /赏册：未立（凡翻必据）/)
  const dir = mkdtempSync(join(tmpdir(), 'kuijing-'))
  const book = join(dir, 'k.json')
  run(['register', '--path', 'docs/internal/*', '--file', book])
  const b1 = run(['block', '--file', book])
  assert.match(b1.stdout, /赏册：免审 1 处（docs\/internal\/\*）/)
  const h1 = createHash('sha256').update(b1.stdout).digest('hex')
  const b2 = run(['block', '--file', book])
  const h2 = createHash('sha256').update(b2.stdout).digest('hex')
  assert.equal(h1, h2)
  run(['register', '--path', 'docs/extra/*', '--file', book])
  const b3 = run(['block', '--file', book])
  assert.notEqual(h1, createHash('sha256').update(b3.stdout).digest('hex'))
  rmSync(dir, { recursive: true, force: true })
})

test('gate：29 过 / 30 红 / --gate 50 时 45 过 / 缺值 exit 2', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).status, 0)
  const miss = run(['gate'])
  assert.equal(miss.status, 2)
  assert.match(miss.stderr, /gate 需要 --value/)
})

test('--version 与 --help 正常', () => {
  const v = run(['--version'])
  assert.equal(v.status, 0)
  assert.equal(v.stdout.trim(), '0.1.0')
  const h = run(['--help'])
  assert.equal(h.status, 0)
  assert.match(h.stdout, /窥镜 · kuijing/)
  assert.match(h.stdout, /kuijing audit/)
})

test('跨项目七流 CLI 复验：counts 全 0、全明带 exit 0', () => {
  const streams = [
    join(root, '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl'),
    join(root, '..', 'kaocheng', 'fixtures', 'mixed-stream.jsonl'),
    join(root, '..', 'dingfen', 'fixtures', 'fenced-stream.jsonl'),
    join(root, '..', 'erbing', 'fixtures', 'mixed-stream.jsonl'),
    join(root, '..', 'erbing', 'fixtures', 'delegated-stream.jsonl'),
    join(root, '..', 'huashui', 'fixtures', 'fuji-stream.jsonl'),
    join(root, '..', 'jiaotuo', 'fixtures', 'weizhao-stream.jsonl'),
  ]
  for (const s of streams) {
    const r = run(['audit', s])
    assert.equal(r.status, 0, s)
    assert.match(r.stdout, /受审稿 0/, s)
    assert.match(r.stdout, /带「明」/, s)
  }
})
