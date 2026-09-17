/**
 * CLI 语义测试 —— 复现命令逐字对表（docs/04 A2/A4/A5 锁定）。
 * 每例以子进程跑真实 CLI，断言退出码与输出字段。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const bin = join(root, 'src', 'bin', 'chachu.js')
const fx = (name) => join(root, 'fixtures', name)

function run(args, { cwd = root } = {}) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })
}

function json(args, opts) {
  const r = run([...args, '--json'], opts)
  return { code: r.status, out: JSON.parse(r.stdout) }
}

test('A2 复现：退出码逐字吻合（mianze 带册，余十八流直审，合审四条）', () => {
  const expect = [
    ['clean-stream.jsonl', 0], ['huanyan-stream.jsonl', 1], ['duchuan-stream.jsonl', 1],
    ['mujian-stream.jsonl', 0], ['shujian-stream.jsonl', 0], ['xingjian-stream.jsonl', 0],
    ['zizhi-stream.jsonl', 0], ['chizheng-stream.jsonl', 0], ['shibai-stream.jsonl', 1],
    ['bachang-stream.jsonl', 0], ['shimo-stream.jsonl', 0],
    ['yinyu-stream.jsonl', 1], ['xuzhi-stream.jsonl', 0], ['yingwen-stream.jsonl', 1],
    ['wangwei-stream.jsonl', 0], ['yiyan-stream.jsonl', 0], ['baishi-stream.jsonl', 0],
  ]
  for (const [file, code] of expect) {
    const r = run(['audit', fx(file)])
    assert.equal(r.status, code, file)
  }
  // 带册四条 + 合审两条
  assert.equal(run(['audit', fx('mianze-stream.jsonl'), '--file', fx('chachu-book.json')]).status, 0, 'mianze 带册')
  assert.equal(run(['audit', fx('jiyan-stream.jsonl'), '--file', fx('chachu-book.json')]).status, 0, 'jiyan 带册')
  assert.equal(run(['audit', fx('jiyan-stream.jsonl')]).status, 1, 'jiyan 无册对照')
  assert.equal(run(['audit', fx('hejian-a.jsonl'), fx('hejian-b.jsonl')]).status, 0, '合审目见在前')
  assert.equal(run(['audit', fx('hechi-a.jsonl'), fx('hechi-b.jsonl')]).status, 0, '合审迟证')
})

test('clean：counts 全 0、幻值 0、带「彰」、言皆有据行', () => {
  const { code, out } = json(['audit', fx('clean-stream.jsonl')])
  assert.equal(code, 0)
  assert.equal(out.calls, 1)
  assert.deepEqual(out.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
  assert.deepEqual(out.score, { huan: 0, yi: 0, total: 0 })
  assert.equal(out.band, '彰')
  assert.match(out.issues[0], /言皆有据 ×1 稿 1 行/)
})

test('huanyan：幻言 2、60 cap、诞、指纹掩码', () => {
  const { code, out } = json(['audit', fx('huanyan-stream.jsonl')])
  assert.equal(code, 1)
  assert.equal(out.counts.hy, 2)
  assert.deepEqual(out.score, { huan: 60, yi: 0, total: 60 })
  assert.equal(out.band, '诞')
  assert.match(out.issues[0], /幻言：docs\/report\.md:3 指物 src\/config\.js（指纹 [0-9a-f]+）/)
  assert.ok(!out.issues[0].includes('配置集中在')) // 行原文不进判词
})

test('duchuan：单幻言 30 诞红；--gate 40 过门', () => {
  const a = json(['audit', fx('duchuan-stream.jsonl')])
  assert.equal(a.code, 1)
  assert.deepEqual(a.out.score, { huan: 30, yi: 0, total: 30 })
  assert.equal(a.out.band, '诞')
  assert.equal(run(['audit', fx('duchuan-stream.jsonl'), '--gate', '40']).status, 0)
})

test('mujian/shujian/xingjian/zizhi：见据三通道与自指清白（字段断言）', () => {
  for (const f of ['mujian-stream.jsonl', 'shujian-stream.jsonl', 'xingjian-stream.jsonl', 'zizhi-stream.jsonl']) {
    const { code, out } = json(['audit', fx(f)])
    assert.equal(code, 0, f)
    assert.equal(out.band, '彰', f)
    assert.deepEqual(out.counts, { hy: 0, yy: 0, cz: 0, xz: 0 }, f)
  }
  assert.equal(json(['audit', fx('shujian-stream.jsonl')]).out.paths, 2)
})

test('shibai：失败之见不是见——30 诞红', () => {
  const { code, out } = json(['audit', fx('shibai-stream.jsonl')])
  assert.equal(code, 1)
  assert.equal(out.counts.hy, 1)
  assert.match(out.issues[0], /幻言：docs\/report\.md:3 指物 src\/config\.js/)
})

test('jiyan 带册基径清白 / 无册对照幻言；mianze 免审 paths 0', () => {
  const g = json(['audit', fx('jiyan-stream.jsonl'), '--file', fx('chachu-book.json')])
  assert.equal(g.code, 0)
  assert.equal(g.out.band, '彰')
  const n = json(['audit', fx('jiyan-stream.jsonl')])
  assert.equal(n.code, 1)
  assert.equal(n.out.counts.hy, 1)
  const m = json(['audit', fx('mianze-stream.jsonl'), '--file', fx('chachu-book.json')])
  assert.equal(m.code, 0)
  assert.equal(m.out.paths, 0)
})

test('bachang 靶场豁免 paths 0；shimo 模态门全 0', () => {
  const b = json(['audit', fx('bachang-stream.jsonl')])
  assert.equal(b.code, 0)
  assert.equal(b.out.paths, 0)
  const s = json(['audit', fx('shimo-stream.jsonl')])
  assert.equal(s.code, 0)
  assert.deepEqual(s.out.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
})

test('yinyu 引语不避 30 红；xuzhi 虚指注记 0 分；yingwen 英文 30 红；wangwei 网卫 0 分', () => {
  const y = json(['audit', fx('yinyu-stream.jsonl')])
  assert.equal(y.code, 1)
  assert.deepEqual(y.out.score, { huan: 30, yi: 0, total: 30 })
  const x = json(['audit', fx('xuzhi-stream.jsonl')])
  assert.equal(x.code, 0)
  assert.equal(x.out.counts.xz, 1)
  assert.equal(x.out.score.total, 0)
  const w = json(['audit', fx('yingwen-stream.jsonl')])
  assert.equal(w.code, 1)
  assert.equal(w.out.counts.hy, 1)
  const g = json(['audit', fx('wangwei-stream.jsonl')])
  assert.equal(g.code, 0)
  assert.equal(g.out.counts.xz, 1)
})

test('yiyan：疑言 15 疑黄牌过门；--gate 10 翻红', () => {
  const a = json(['audit', fx('yiyan-stream.jsonl')])
  assert.equal(a.code, 0)
  assert.deepEqual(a.out.score, { huan: 0, yi: 15, total: 15 })
  assert.equal(a.out.band, '疑')
  assert.equal(run(['audit', fx('yiyan-stream.jsonl'), '--gate', '10']).status, 1)
})

test('baishi：败写不入稿账 paths 0', () => {
  const { code, out } = json(['audit', fx('baishi-stream.jsonl')])
  assert.equal(code, 0)
  assert.equal(out.paths, 0)
  assert.equal(out.calls, 1)
})

test('hejian/hechi 合审：sessions 2、调用 2、全 0', () => {
  const a = json(['audit', fx('hejian-a.jsonl'), fx('hejian-b.jsonl')])
  assert.equal(a.code, 0)
  assert.equal(a.out.sessions, 2)
  assert.equal(a.out.calls, 2)
  assert.equal(a.out.band, '彰')
  const b = json(['audit', fx('hechi-a.jsonl'), fx('hechi-b.jsonl')])
  assert.equal(b.code, 0)
  assert.equal(b.out.counts.cz, 1)
})

test('用法错误：坏行报行号、缺流、未知旗标、--gate 缺值 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chachu-cli-'))
  const bad = join(dir, 'bad.jsonl')
  writeFileSync(bad, '{"ok":1}\n{bad}\n')
  assert.equal(run(['audit', bad]).status, 2)
  assert.match(run(['audit', bad]).stderr, /第 2 行不是合法 JSON/)
  assert.equal(run(['audit']).status, 2)
  assert.equal(run(['audit', fx('clean-stream.jsonl'), '--wat']).status, 2)
  assert.equal(run(['audit', fx('clean-stream.jsonl'), '--gate']).status, 2)
  rmSync(dir, { recursive: true, force: true })
})

test('register/revoke/list：缺 --path exit 2、册缺失自动建册、去重、revoke 无此径 exit 2、list 缺册 exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chachu-cli-'))
  const book = join(dir, '.chachu.json')
  assert.equal(run(['register'], { cwd: dir }).status, 2)
  assert.equal(run(['register', '--path', 'docs/reports/*', '--file', book], { cwd: dir }).status, 0)
  assert.equal(run(['register', '--path', 'docs/reports/*', '--file', book], { cwd: dir }).status, 0)
  const listed = JSON.parse(run(['list', '--file', book], { cwd: dir }).stdout)
  assert.deepEqual(listed.excuse, ['docs/reports/*'])
  assert.equal(run(['revoke', '--path', 'nope/*', '--file', book], { cwd: dir }).status, 2)
  assert.equal(run(['revoke', '--path', 'docs/reports/*', '--file', book], { cwd: dir }).status, 0)
  const empty = mkdtempSync(join(tmpdir(), 'chachu-cli-'))
  assert.equal(run(['list'], { cwd: empty }).status, 2) // 缺册（未建册的目录）
  rmSync(empty, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
})

test('block：无册确定性文本、双跑 shasum 一致、增免案文本改变', () => {
  const r1 = run(['block'])
  assert.match(r1.stdout, /【察传 · 证牌】/)
  assert.match(r1.stdout, /证册：未立（凡言必据）/)
  const h1 = createHash('sha256').update(r1.stdout).digest('hex')
  const h2 = createHash('sha256').update(run(['block']).stdout).digest('hex')
  assert.equal(h1, h2)
  const dir = mkdtempSync(join(tmpdir(), 'chachu-cli-'))
  const book = join(dir, '.chachu.json')
  run(['register', '--path', 'legacy/*', '--file', book], { cwd: dir })
  const r2 = run(['block', '--file', book], { cwd: dir })
  assert.match(r2.stdout, /证册：免审 1 处（legacy\/\*）/)
  assert.notEqual(h1, createHash('sha256').update(r2.stdout).digest('hex'))
  rmSync(dir, { recursive: true, force: true })
})

test('gate：29 过 / 30 红 / --gate 50 时 45 过；缺值 exit 2', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).status, 0)
  assert.equal(run(['gate']).status, 2)
})

test('--version 与 --help 正常', () => {
  assert.equal(run(['--version']).stdout.trim(), '0.1.0')
  assert.match(run(['--help']).stdout, /得言不可以不察/)
  assert.match(run([]).stdout, /用法/)
})

test('跨项目互认：七条外部夹具流经 CLI 全部 exit 0', () => {
  const cases = [
    ['zhizhi/fixtures/sample-stream.jsonl', 8],
    ['kaocheng/fixtures/mixed-stream.jsonl', 4],
    ['dingfen/fixtures/fenced-stream.jsonl', 6],
    ['erbing/fixtures/mixed-stream.jsonl', 5],
    ['erbing/fixtures/delegated-stream.jsonl', 5],
    ['huashui/fixtures/fuji-stream.jsonl', 3],
    ['jiaotuo/fixtures/weizhao-stream.jsonl', 2],
  ]
  for (const [rel, calls] of cases) {
    const r = json(['audit', join(root, '..', rel)])
    assert.equal(r.code, 0, rel)
    assert.equal(r.out.calls, calls, rel)
    assert.deepEqual(r.out.counts, { hy: 0, yy: 0, cz: 0, xz: 0 }, rel)
  }
})
