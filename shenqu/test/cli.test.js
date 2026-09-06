/**
 * CLI 语义测试 —— spawnSync 拿真实退出码（execFileSync 非零即抛，拿不到 stdout）。
 * 覆盖：五夹具分数与退出码、五条附加口径、坏输入 exit 2、register/revoke/list/block/gate、
 * 旗标直生效（--exempt/--markers/--window-fields）、--version/--help、材牌 shasum。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'shenqu.js')
const FX = (n) => join(root, 'fixtures', n)

function run(args, cwd = root) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
}

function audit(file, extra = [], cwd = root) {
  return run(['audit', FX(file), ...extra], cwd)
}

function jout(r) {
  return JSON.parse(r.stdout)
}

// ---------------------------------------------------------------- 五夹具

test('audit clean-stream：0 全 pass exit 0', () => {
  const r = audit('clean-stream.jsonl')
  assert.equal(r.status, 0)
  const o = jout(r)
  assert.equal(o.calls, 4)
  assert.equal(o.views, 2)
  assert.equal(o.writes, 2)
  assert.equal(o.cases, 0)
  assert.deepEqual(o.score, { total: 0, blind: 0, crawl: 0 })
  assert.equal(o.band, '全')
  assert.deepEqual(o.counts, { blindActs: 0, crawls: 0, partialViews: 0, fullViews: 2, exempted: 0 })
  assert.deepEqual(o.gauge, { viewedPaths: 2, windowReads: 1, markerHits: 0, fragTop: [] })
})

test('audit blind-stream：30 盲 fail exit 1', () => {
  const r = audit('blind-stream.jsonl')
  assert.equal(r.status, 1)
  const o = jout(r)
  assert.deepEqual(o.score, { total: 30, blind: 30, crawl: 0 })
  assert.equal(o.band, '盲')
  assert.equal(o.counts.blindActs, 1)
  assert.match(o.issues[0], /盲动 ×1（\+30\/案）：src\/api\.js 残见 1 笔（窗 1） —— 审曲面势，以饬五材/)
})

test('audit marked-stream：30 盲 fail exit 1（显残通道）', () => {
  const r = audit('marked-stream.jsonl')
  assert.equal(r.status, 1)
  const o = jout(r)
  assert.equal(o.score.total, 30)
  assert.equal(o.gauge.markerHits, 1)
  assert.equal(o.gauge.windowReads, 0)
})

test('audit crawly-stream：10 全 pass exit 0（点名不咬门）', () => {
  const r = audit('crawly-stream.jsonl')
  assert.equal(r.status, 0)
  const o = jout(r)
  assert.deepEqual(o.score, { total: 10, blind: 0, crawl: 10 })
  assert.equal(o.band, '全')
  assert.deepEqual(o.gauge.fragTop, [{ path: 'logs/a.log', partials: 3 }, { path: 'logs/b.log', partials: 2 }])
})

test('audit mixed-stream：30 盲 fail exit 1', () => {
  const r = audit('mixed-stream.jsonl')
  assert.equal(r.status, 1)
  const o = jout(r)
  assert.equal(o.views, 5)
  assert.equal(o.writes, 2)
  assert.equal(o.gauge.windowReads, 4)
  assert.deepEqual(o.gauge.fragTop, [{ path: 'logs/x.log', partials: 2 }, { path: 'src/big.js', partials: 2 }])
})

// ---------------------------------------------------------------- 附加口径

test('blind --gate 40：pass exit 0（门是审计方的口径）', () => {
  const r = audit('blind-stream.jsonl', ['--gate', '40'])
  assert.equal(r.status, 0)
  assert.equal(jout(r).verdict, 'pass')
})

test('crawly --file shenqu-book（fragWindows 2）：碎览 2 径案 20 昧 exit 0', () => {
  const r = run(['audit', FX('crawly-stream.jsonl'), '--file', FX('shenqu-book.json')])
  assert.equal(r.status, 0)
  const o = jout(r)
  assert.deepEqual(o.score, { total: 20, blind: 0, crawl: 20 })
  assert.equal(o.band, '昧')
  assert.equal(o.counts.crawls, 2)
})

test('marked --file noDefaults-book：残记默认表关 → 0 全 exit 0', () => {
  const r = run(['audit', FX('marked-stream.jsonl'), '--file', FX('noDefaults-book.json')])
  assert.equal(r.status, 0)
  const o = jout(r)
  assert.equal(o.score.total, 0)
  assert.equal(o.counts.fullViews, 1)
})

test('blind --file noDefaults-book：窗字段默认表关 → 0 全 exit 0、fullViews 2', () => {
  const r = run(['audit', FX('blind-stream.jsonl'), '--file', FX('noDefaults-book.json')])
  assert.equal(r.status, 0)
  const o = jout(r)
  assert.equal(o.score.total, 0)
  assert.equal(o.counts.fullViews, 2)
})

test('clean --file exempt-book（src/）：views 0 writes 0 exempted 3', () => {
  const r = run(['audit', FX('clean-stream.jsonl'), '--file', FX('exempt-book.json')])
  assert.equal(r.status, 0)
  const o = jout(r)
  assert.equal(o.views, 0)
  assert.equal(o.writes, 0)
  assert.equal(o.counts.exempted, 3)
})

test('--exempt 旗标直生效：与册同效', () => {
  const r = audit('clean-stream.jsonl', ['--exempt', 'src/'])
  assert.equal(r.status, 0)
  assert.equal(jout(r).counts.exempted, 3)
})

test('--markers 旗标认全文：自定义残记词在内容中部也命中', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shenqu-cli-'))
  const streamPath = join(dir, 's.jsonl')
  const pair = (id, name, args, content) =>
    `{"type":"tool_call","id":"${id}","name":"${name}","args":${JSON.stringify(args)}}\n` +
    `{"type":"tool_result","id":"${id}","isError":false${content ? `,"content":${JSON.stringify(content)}` : ''},"at":1}`
  writeFileSync(streamPath, [
    pair('c1', 'read', { path: 'a.md' }, '上半\nEXCERPT-END 在中部\n结尾正常'),
    pair('c2', 'edit', { path: 'a.md', content: 'x' }, null),
  ].join('\n') + '\n')
  const r = run(['audit', streamPath, '--markers', 'EXCERPT-END'])
  assert.equal(r.status, 1)
  assert.equal(jout(r).score.total, 30)
})

test('--window-fields 旗标增补窗字段：noDefaults 册下仍可指认', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shenqu-cli-'))
  const streamPath = join(dir, 's.jsonl')
  const pair = (id, name, args, content) =>
    `{"type":"tool_call","id":"${id}","name":"${name}","args":${JSON.stringify(args)}}\n` +
    `{"type":"tool_result","id":"${id}","isError":false${content ? `,"content":${JSON.stringify(content)}` : ''},"at":1}`
  writeFileSync(streamPath, [
    pair('c1', 'read', { path: 'a.js', rows: 40 }, JSON.parse(JSON.stringify(Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')))),
    pair('c2', 'edit', { path: 'a.js', content: 'x' }, null),
  ].join('\n') + '\n')
  const off = run(['audit', streamPath, '--file', FX('noDefaults-book.json')])
  assert.equal(off.status, 0) // 默认表关、无增补 → 全览清白
  const on = run(['audit', streamPath, '--file', FX('noDefaults-book.json'), '--window-fields', 'rows'])
  assert.equal(on.status, 1) // 增补 rows 为窗字段 → 残见 → 盲动
  assert.equal(jout(on).score.total, 30)
})

// ---------------------------------------------------------------- 多流与坏输入

test('audit 多流：两会话合并审计、分账判定', () => {
  const r = run(['audit', FX('blind-stream.jsonl'), FX('crawly-stream.jsonl')])
  const o = jout(r)
  assert.equal(o.sessions, 2)
  assert.equal(o.counts.blindActs, 1)
  assert.equal(o.counts.crawls, 1)
  assert.equal(o.score.total, 40)
})

test('audit 坏 JSON 行 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shenqu-cli-'))
  const p = join(dir, 'bad.jsonl')
  writeFileSync(p, '{"type":"tool_call"}\n坏行\n')
  const r = run(['audit', p])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /第 2 行/)
})

test('audit 流缺失 → exit 2', () => {
  const r = run(['audit', join(root, 'fixtures', 'no-such-stream.jsonl')])
  assert.equal(r.status, 2)
})

test('audit 坏材册 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shenqu-cli-'))
  const p = join(dir, 'bad-book.json')
  writeFileSync(p, '{"version":1,"fragWindows":0}')
  const r = run(['audit', FX('clean-stream.jsonl'), '--file', p])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /fragWindows/)
})

// ---------------------------------------------------------------- register / revoke / list / block / gate

test('register 增豁免与调阈写册、revoke 销名', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shenqu-cli-'))
  const book = join(dir, '.shenqu.json')
  const reg = run(['register', '--exempt', 'gen/,dist/', '--frag-windows', '2', '--file', book])
  assert.equal(reg.status, 0)
  const o = jout(reg)
  assert.deepEqual(o.exempt, ['gen/', 'dist/'])
  assert.equal(o.fragWindows, 2)
  const listed = jout(run(['list', '--file', book]))
  assert.deepEqual(listed.exempt, ['gen/', 'dist/'])
  const rev = run(['revoke', '--exempt', 'dist/', '--file', book])
  assert.equal(rev.status, 0)
  assert.deepEqual(jout(run(['list', '--file', book])).exempt, ['gen/'])
})

test('register 全空参 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shenqu-cli-'))
  const r = run(['register', '--file', join(dir, '.shenqu.json')])
  assert.equal(r.status, 2)
})

test('revoke 未登记名 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shenqu-cli-'))
  const book = join(dir, '.shenqu.json')
  run(['register', '--exempt', 'gen/', '--file', book])
  const r = run(['revoke', '--exempt', 'other/', '--file', book])
  assert.equal(r.status, 2)
})

test('list / block 册缺失 → exit 2；block 有册输出确定性文本', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shenqu-cli-'))
  assert.equal(run(['list', '--file', join(dir, 'absent.json')]).status, 2)
  assert.equal(run(['block', '--file', join(dir, 'absent.json')]).status, 2)
  const blk = run(['block', '--file', FX('shenqu-book.json')])
  assert.equal(blk.status, 0)
  assert.match(blk.stdout, /【审曲 · 材牌】/)
  assert.match(blk.stdout, /残记 10 形 · 窗字段 18 名 · 碎览阈 2 窗/)
})

test('材牌块逐字节确定：同册两次渲染 shasum 相同；增豁免后文本改变', () => {
  const a = run(['block', '--file', FX('shenqu-book.json')]).stdout
  const b = run(['block', '--file', FX('shenqu-book.json')]).stdout
  assert.equal(a, b)
  const dir = mkdtempSync(join(tmpdir(), 'shenqu-cli-'))
  const book = join(dir, '.shenqu.json')
  writeFileSync(book, readFileSync(FX('shenqu-book.json')))
  run(['register', '--exempt', 'gen/', '--file', book])
  const c = run(['block', '--file', book]).stdout
  assert.notEqual(a, c)
  assert.match(c, /豁免径 1 条/)
})

test('全缺省册 block：生效表计数 10 形 / 18 名 / 阈 3（CLI block 只公示册，无材账行）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shenqu-cli-'))
  const book = join(dir, '.shenqu.json')
  writeFileSync(book, '{}\n')
  const blk = run(['block', '--file', book]).stdout
  assert.match(blk, /残记 10 形 · 窗字段 18 名 · 碎览阈 3 窗/)
  assert.doesNotMatch(blk, /材账/) // counts 缺省时省略材账行（插件侧才带账）
  assert.match(blk, /审曲面势，以饬五材/)
})

test('gate --value：30 红退 1、29 绿退 0、--gate 覆盖', () => {
  assert.equal(run(['gate', '--value', '30']).status, 1)
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '20', '--gate', '21']).status, 0)
  assert.equal(run(['gate', '--value', '21', '--gate', '21']).status, 1)
})

test('--version 与 --help 正常', () => {
  assert.equal(run(['--version']).stdout.trim(), '0.1.0')
  assert.match(run(['--help']).stdout, /审曲面势/)
  assert.match(run([]).stdout, /用法/)
})

test('未知命令 → exit 2', () => {
  const r = run(['nonsense'])
  assert.equal(r.status, 2)
})
