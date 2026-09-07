/**
 * CLI 语义测试 —— audit/register/revoke/list/block/gate 全命令面 + 退出码契约（docs/03 §8）。
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
const BIN = join(root, 'src', 'bin', 'huashui.js')
const fx = (n) => join(root, 'fixtures', n)
const BOOK = fx('huashui-book.json')

function run(args, { cwd = root } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

const audit = (files, extra = []) => run(['audit', ...files, '--file', BOOK, ...extra])

// ---- A2 夹具复现（十三口径，分数逐字段断言）-------------------------------------

test('A2 clean：全 0 活带 exit 0（写前重读则白）', () => {
  const r = audit([fx('clean-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /调用 4 · 受审径 1/)
  assert.match(r.out, /案账：覆世 0 · 覆己 0 · 失鲜 0 · 陈改 0/)
  assert.match(r.out, /陈值 0（shi 0 \+ ji 0）· 带「活」· 门 30 → 过/)
  assert.match(r.out, /水皆活 ×1/)
})

test('A2 fuji：覆己 15 滞 exit 0（黄牌点名不咬门），点名带 seq 与行数', () => {
  const r = audit([fx('fuji-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /覆己：src\/a\.js（seq 3 覆 seq 2——陈线 2 · 新线 1）/)
  assert.match(r.out, /陈值 15（shi 0 \+ ji 15）· 带「滞」· 门 30 → 过/)
})

test('A2 shuangfu：覆己 2 案 30 腐 exit 1', () => {
  const r = audit([fx('shuangfu-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /陈值 30（shi 0 \+ ji 30）· 带「腐」· 门 30 → 红/)
  assert.match(r.out, /覆己：src\/x\.js/)
  assert.match(r.out, /覆己：src\/y\.js/)
})

test('A2 fushi 两流合审：覆世 30 腐 exit 1，sessions 2', () => {
  const r = audit([fx('fushi-a-stream.jsonl'), fx('fushi-b-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /会话 2 · 调用 3/)
  assert.match(r.out, /覆世：src\/a\.js（seq 3 覆 seq 2——陈线 2 · 新线 1）/)
})

test('A2 xufu 带册：许复免账 paths 0 全 0；无册对照覆己 15', () => {
  const r = audit([fx('xufu-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /受审径 0/)
  assert.match(r.out, /水皆活 ×0/)
  const bare = run(['audit', fx('xufu-stream.jsonl')])
  assert.equal(bare.code, 0)
  assert.match(bare.out, /覆己：vendor\/fix\/src\.js/)
  assert.match(bare.out, /陈值 15/)
})

test('A2 fuxian：失鲜 1 只注记，0 分活带 exit 0', () => {
  const r = audit([fx('fuxian-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /失鲜：src\/a\.js（seq 3——陈线 1 · 新线 1）/)
  assert.match(r.out, /陈值 0/)
})

test('A2 chenbi：陈改不判注记 exit 0', () => {
  const r = audit([fx('chenbi-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /陈改：src\/a\.js（最近文据后无文之写 1 笔，判定不及）/)
})

for (const [name, calls] of [['dugrip', 2], ['shixie', 3], ['idem', 2]]) {
  test(`A2 ${name}：全 0 活带 exit 0`, () => {
    const r = audit([fx(`${name}-stream.jsonl`)])
    assert.equal(r.code, 0)
    assert.match(r.out, new RegExp(`调用 ${calls}`))
    assert.match(r.out, /水皆活 ×1/)
  })
}

test('A2 附加口径：shuangfu --gate 40 过门 / fuji --gate 10 红', () => {
  assert.equal(audit([fx('shuangfu-stream.jsonl')], ['--gate', '40']).code, 0)
  assert.equal(audit([fx('fuji-stream.jsonl')], ['--gate', '10']).code, 1)
})

// ---- CLI 面 ------------------------------------------------------------------

test('audit --json 紧凑输出可解析，字段与文本口径一致', () => {
  const r = audit([fx('fuji-stream.jsonl')], ['--json'])
  assert.equal(r.code, 0)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.cases, { shi: 0, ji: 1, xian: 0, gai: 0 })
  assert.equal(j.score.total, 15)
  assert.equal(j.band, '滞')
  assert.equal(j.verdict, 'pass')
})

test('audit 坏 JSON 行 → exit 2 并报行号', () => {
  const dir = mkdtempSync(join(tmpdir(), 'huashui-'))
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
  assert.equal(audit([fx('fuji-stream.jsonl')], ['--unknown']).code, 2)
})

test('register：册缺失自动建册、重复去重；revoke 无此径 exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'huashui-'))
  const cwd = dir
  const r1 = run(['register', '--path', 'legacy/*'], { cwd })
  assert.equal(r1.code, 0)
  const r2 = run(['register', '--path', 'legacy/*'], { cwd })
  assert.equal(r2.code, 0)
  const book = JSON.parse(readFileSync(join(dir, '.huashui.json'), 'utf8'))
  assert.deepEqual(book.excuse, ['legacy/*'])
  assert.equal(run(['revoke', '--path', 'other/*'], { cwd }).code, 2)
  assert.equal(run(['revoke', '--path', 'legacy/*'], { cwd }).code, 0)
  assert.equal(run(['register'], { cwd }).code, 2) // 缺 --path
  rmSync(dir, { recursive: true, force: true })
})

test('list：缺册 exit 2；有册出 JSON', () => {
  assert.equal(run(['list']).code, 2)
  const r = run(['list', '--file', BOOK])
  assert.equal(r.code, 0)
  assert.deepEqual(JSON.parse(r.out).excuse, ['vendor/*'])
})

test('block：无册出确定性文本；有册公示许复', () => {
  const bare = run(['block'])
  assert.equal(bare.code, 0)
  assert.equal(bare.out.trim().split('\n')[1], '水册：未立（凡覆皆记）')
  const r = run(['block', '--file', BOOK])
  assert.match(r.out, /水册：许复 1 处（vendor\/\*）/)
  assert.match(r.out, /【画水 · 水牌】/)
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
  assert.match(h.out, /水册/)
})

test('block 逐字节确定：同册两次输出 shasum 一致，增许复后改变', () => {
  const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8)
  const a = run(['block', '--file', BOOK]).out
  const b = run(['block', '--file', BOOK]).out
  assert.equal(sha(a), sha(b))
  const dir = mkdtempSync(join(tmpdir(), 'huashui-'))
  run(['register', '--path', 'legacy/*'], { cwd: dir })
  const c = run(['block'], { cwd: dir }).out
  assert.notEqual(sha(a), sha(c))
  rmSync(dir, { recursive: true, force: true })
})

test('--file 值缺失 → exit 2', () => {
  assert.equal(run(['audit', fx('fuji-stream.jsonl'), '--file']).code, 2)
})

test('A3 跨项目六流零误伤（zhizhi/kaocheng/dingfen/fangchuan/erbing×2）', () => {
  const flows = [
    ['../zhizhi/fixtures/sample-stream.jsonl', 8],
    ['../kaocheng/fixtures/mixed-stream.jsonl', 4],
    ['../dingfen/fixtures/fenced-stream.jsonl', 6],
    ['../fangchuan/fixtures/yancao-stream.jsonl', 2],
    ['../erbing/fixtures/mixed-stream.jsonl', 5],
    ['../erbing/fixtures/delegated-stream.jsonl', 5],
  ]
  for (const [rel, calls] of flows) {
    const r = run(['audit', join(root, rel)])
    assert.equal(r.code, 0, rel)
    assert.match(r.out, new RegExp(`调用 ${calls} `), rel)
    assert.match(r.out, /案账：覆世 0 · 覆己 0 · 失鲜 0 · 陈改 0/, rel)
    assert.match(r.out, /带「活」/, rel)
  }
})
