/**
 * CLI 语义测试 —— audit/register/revoke/list/block/gate 全命令面 + 退出码契约（docs/03 §9）。
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
const BIN = join(root, 'src', 'bin', 'yuefa.js')
const fx = (n) => join(root, 'fixtures', n)
const BOOK = fx('yuefa-book.json')

function run(args, { cwd = root } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

const audit = (files, extra = []) => run(['audit', ...files, '--file', BOOK, ...extra])

// ---- A2 夹具复现（手算表逐字段断言）---------------------------------------------

test('A2 clean：全 0 坚带 exit 0（等面重写守约）', () => {
  const r = audit([fx('clean-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /调用 2 · 受审径 1/)
  assert.match(r.out, /案账：哑削 0 名 · 明削 0 名 · 约改 0/)
  assert.match(r.out, /削值 0 · 带「坚」· 门 30 → 过/)
  assert.match(r.out, /约皆坚 ×1/)
})

test('A2 zhanwo：展约不判 exit 0', () => {
  const r = audit([fx('zhanwo-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /约皆坚 ×1/)
})

test('A2 xiaojian：哑削 1 名 30 背 exit 1，点名带名与公面数', () => {
  const r = audit([fx('xiaojian-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /哑削：src\/config\.js（削 formatDate——公面 3 失 1）/)
  assert.match(r.out, /削值 30 · 带「背」· 门 30 → 红/)
})

test('A2 mingxiao：明削 1 名 0 分坚带 exit 0', () => {
  const r = audit([fx('mingxiao-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /明削：src\/config\.js（削 formatDate——声在码中）/)
  assert.match(r.out, /削值 0/)
})

test('A2 zhujian：逐笔立案 2 名 60 cap 背带 exit 1', () => {
  const r = audit([fx('zhujian-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /案账：哑削 2 名 · 明削 0 名 · 约改 0/)
  assert.match(r.out, /削值 60 · 带「背」/)
})

test('A2 baochi：保持者经世据折旧静默，唯首笔 1 名立案', () => {
  const r = audit([fx('baochi-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /案账：哑削 1 名/)
  assert.equal((r.out.match(/哑削：/g) ?? []).length, 1)
})

test('A2 geyue：约改不判注记 exit 0', () => {
  const r = audit([fx('geyue-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /约改：src\/config\.js（约据后无文之写 1 笔，判定不及）/)
  assert.match(r.out, /削值 0/)
})

test('A2 wuyue：无约不判 exit 0', () => {
  const r = audit([fx('wuyue-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /案账：哑削 0 名 · 明削 0 名 · 约改 0/)
})

test('A2 quanxie：全换削 3 名 60 cap exit 1', () => {
  const r = audit([fx('quanxie-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /哑削：src\/config\.js（削 parseConfig、formatDate、VERSION——公面 3 失 3）/)
})

test('A2 xuyue 带册免账受审径 0；无册对照哑削 1 名 30 背', () => {
  const r = audit([fx('xuyue-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /受审径 0/)
  assert.match(r.out, /约皆坚 ×0/)
  const bare = run(['audit', fx('xuyue-stream.jsonl')])
  assert.equal(bare.code, 1)
  assert.match(bare.out, /哑削：legacy\/util\.js（削 legacyFnB——公面 2 失 1）/)
})

test('A2 duoyan：Python 约形命中削 Parser 30 背 exit 1', () => {
  const r = audit([fx('duoyan-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /哑削：a\.py（削 Parser——公面 2 失 1）/)
})

test('A2 huakuo：花括号形 as 取后名，削 dropMe 30 背 exit 1', () => {
  const r = audit([fx('huakuo-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /哑削：src\/index\.js（削 dropMe——公面 3 失 1）/)
})

test('A2 附加口径：quanxie --gate 100 过门 / xiaojian --gate 10 红', () => {
  assert.equal(audit([fx('quanxie-stream.jsonl')], ['--gate', '100']).code, 0)
  assert.equal(audit([fx('xiaojian-stream.jsonl')], ['--gate', '10']).code, 1)
})

// ---- CLI 面 ------------------------------------------------------------------

test('audit --json 紧凑输出可解析，字段与文本口径一致', () => {
  const r = audit([fx('xiaojian-stream.jsonl')], ['--json'])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.cases, { ya: 1, ming: 0, gai: 0 })
  assert.equal(j.score.total, 30)
  assert.equal(j.band, '背')
  assert.equal(j.verdict, 'fail')
})

test('audit 坏 JSON 行 → exit 2 并报行号', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yuefa-'))
  const bad = join(dir, 'bad.jsonl')
  writeFileSync(bad, '{"ok":1}\nnot-json\n')
  const r = run(['audit', bad])
  assert.equal(r.code, 2)
  assert.match(r.err, /第 2 行/)
  rmSync(dir, { recursive: true, force: true })
})

test('audit 流文件缺失 → exit 2；无流文件 → exit 2；未知旗标 → exit 2', () => {
  assert.equal(run(['audit', join(tmpdir(), '不存在-' + Date.now() + '.jsonl')]).code, 2)
  assert.equal(run(['audit']).code, 2)
  assert.equal(audit([fx('clean-stream.jsonl')], ['--unknown']).code, 2)
})

test('register：册缺失自动建册、重复去重；revoke 无此径 exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yuefa-'))
  const cwd = dir
  const r1 = run(['register', '--path', 'vendor/**'], { cwd })
  assert.equal(r1.code, 0)
  const r2 = run(['register', '--path', 'vendor/**'], { cwd })
  assert.equal(r2.code, 0)
  const book = JSON.parse(readFileSync(join(dir, '.yuefa.json'), 'utf8'))
  assert.deepEqual(book.allow, ['vendor/**'])
  assert.equal(book.noDefaults, false)
  assert.equal(run(['revoke', '--path', 'other/*'], { cwd }).code, 2)
  assert.equal(run(['revoke', '--path', 'vendor/**'], { cwd }).code, 0)
  assert.equal(run(['register'], { cwd }).code, 2) // 缺 --path
  rmSync(dir, { recursive: true, force: true })
})

test('list：缺册 exit 2；有册出 JSON', () => {
  assert.equal(run(['list']).code, 2)
  const r = run(['list', '--file', BOOK])
  assert.equal(r.code, 0)
  assert.deepEqual(JSON.parse(r.out).allow, ['legacy/*'])
})

test('block：无册出确定性文本；有册公示许削', () => {
  const bare = run(['block'])
  assert.equal(bare.code, 0)
  assert.equal(bare.out.trim().split('\n')[1], '约册：未立（凡削皆记）')
  const r = run(['block', '--file', BOOK])
  assert.match(r.out, /【约法 · 约牌】/)
  assert.match(r.out, /约册：许削 1 处（legacy\/\*）/)
})

test('gate：29 过 / 30 红 / --gate 50 时 45 过', () => {
  assert.equal(run(['gate', '--value', '29']).code, 0)
  assert.equal(run(['gate', '--value', '30']).code, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).code, 0)
  assert.equal(run(['gate']).code, 2) // 缺 --value
})

test('--version 与 --help 正常', () => {
  const v = run(['--version'])
  assert.equal(v.code, 0)
  assert.match(v.out, /^0\.1\.0/)
  const h = run(['--help'])
  assert.equal(h.code, 0)
  assert.match(h.out, /audit/)
  assert.match(h.out, /register/)
  assert.match(h.out, /约册/)
})

test('block 逐字节确定：同册两次输出 shasum 一致，增许削后改变', () => {
  const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8)
  const a = run(['block', '--file', BOOK]).out
  const b = run(['block', '--file', BOOK]).out
  assert.equal(sha(a), sha(b))
  const dir = mkdtempSync(join(tmpdir(), 'yuefa-'))
  run(['register', '--path', 'vendor/*'], { cwd: dir })
  const c = run(['block'], { cwd: dir }).out
  assert.notEqual(sha(a), sha(c))
  rmSync(dir, { recursive: true, force: true })
})

test('--file 值缺失 → exit 2', () => {
  assert.equal(run(['audit', fx('clean-stream.jsonl'), '--file']).code, 2)
})

test('A3 跨项目六流零误伤（zhizhi/kaocheng/dingfen/fangchuan/erbing×2）', () => {
  const flows = [
    ['../zhizhi/fixtures/sample-stream.jsonl', 8, 2],
    ['../kaocheng/fixtures/mixed-stream.jsonl', 4, 2],
    ['../dingfen/fixtures/fenced-stream.jsonl', 6, 2],
    ['../fangchuan/fixtures/yancao-stream.jsonl', 2, 2],
    ['../erbing/fixtures/mixed-stream.jsonl', 5, 0],
    ['../erbing/fixtures/delegated-stream.jsonl', 5, 0],
  ]
  for (const [rel, calls, paths] of flows) {
    const r = run(['audit', join(root, rel)])
    assert.equal(r.code, 0, rel)
    assert.match(r.out, new RegExp(`调用 ${calls} `), rel)
    assert.match(r.out, new RegExp(`受审径 ${paths}`), rel)
    assert.match(r.out, /案账：哑削 0 名 · 明削 0 名 · 约改 0/, rel)
    assert.match(r.out, /带「坚」/, rel)
  }
})
