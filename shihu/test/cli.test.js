/**
 * CLI 语义测试 —— audit/register/revoke/list/block/gate 全命令面 + 退出码契约（docs/03 §10）。
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
const BIN = join(root, 'src', 'bin', 'shihu.js')
const fx = (n) => join(root, 'fixtures', n)
const BOOK = fx('shihu-book.json')

function run(args, { cwd = root } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

const audit = (files, extra = []) => run(['audit', ...files, '--file', BOOK, ...extra])

// ---- A2 夹具复现（手算表逐字段断言）---------------------------------------------

test('A2 clean：全 0 真带 exit 0（两条声明状键均命中作工面）', () => {
  const r = audit([fx('clean-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /调用 4 · 受审状面 1/)
  assert.match(r.out, /案账：虚功 0 · 掠据 0 · 无键 0/)
  assert.match(r.out, /虎值 0 · 带「真」· 门 30 → 过/)
  assert.match(r.out, /状皆实 ×1/)
})

test('A2 xugong：虚功 1 条 30 虎 exit 1，点名带径行号与状键', () => {
  const r = audit([fx('xugong-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /虚功：HANDOFF\.md:4（状键 src\/b\.js、空指针——本会话作工面查无）/)
  assert.match(r.out, /虎值 30 · 带「虎」· 门 30 → 红/)
})

test('A2 yinbai：掠据 1 条 0 分真带 exit 0', () => {
  const r = audit([fx('yinbai-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /掠据：HANDOFF\.md:3（引用署名——转述上游之功）/)
  assert.match(r.out, /虎值 0/)
})

test('A2 weixuan：未勾选与将来时不中状形，全 0 exit 0', () => {
  const r = audit([fx('weixuan-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /案账：虚功 0 · 掠据 0 · 无键 0/)
})

test('A2 shuangxu：双虚 60 cap 虎带 exit 1', () => {
  const r = audit([fx('shuangxu-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /案账：虚功 2 · 掠据 0 · 无键 0/)
  assert.match(r.out, /虎值 60 · 带「虎」/)
})

test('A2 daixian 带册免账受审状面 0；无册对照虚功 1 条 30 虎', () => {
  const r = audit([fx('daixian-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /受审状面 0/)
  assert.match(r.out, /状皆实 ×0/)
  const bare = run(['audit', fx('daixian-stream.jsonl')])
  assert.equal(bare.code, 1)
  assert.match(bare.out, /虚功：archive\/HANDOFF\.md:3（状键 src\/b\.js、空指针——本会话作工面查无）/)
})

test('A2 duoshu：两状面各一虚 60 cap exit 1', () => {
  const r = audit([fx('duoshu-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /虚功：docs\/HANDOFF\.md:3/)
  assert.match(r.out, /虚功：handoff-notes\.md:1/)
})

test('A2 shibai：失败 exec 亦入作工面（left-pad 有据），src/b.js 虚功 exit 1', () => {
  const r = audit([fx('shibai-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /案账：虚功 1 · 掠据 0 · 无键 0/)
  assert.equal((r.out.match(/虚功：/g) ?? []).length, 1) // 唯 src/b.js 一条
})

test('A2 zonghe：虚功 1 + 掠据 1 + 无键 1 混合口径', () => {
  const r = audit([fx('zonghe-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /案账：虚功 1 · 掠据 1 · 无键 1/)
  assert.match(r.out, /虚功：HANDOFF\.md:5/)
  assert.match(r.out, /掠据：HANDOFF\.md:4/)
  assert.match(r.out, /无键：HANDOFF\.md:6/)
})

test('A2 附加口径：shuangxu --gate 100 过门 / xugong --gate 10 红', () => {
  assert.equal(audit([fx('shuangxu-stream.jsonl')], ['--gate', '100']).code, 0)
  assert.equal(audit([fx('xugong-stream.jsonl')], ['--gate', '10']).code, 1)
})

// ---- CLI 面 ------------------------------------------------------------------

test('audit --json 紧凑输出可解析，字段与文本口径一致', () => {
  const r = audit([fx('xugong-stream.jsonl')], ['--json'])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.cases, { xu: 1, lue: 0, wu: 0 })
  assert.equal(j.score.total, 30)
  assert.equal(j.band, '虎')
  assert.equal(j.verdict, 'fail')
})

test('audit 坏 JSON 行 → exit 2 并报行号', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shihu-'))
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
  const dir = mkdtempSync(join(tmpdir(), 'shihu-'))
  const cwd = dir
  const r1 = run(['register', '--path', 'legacy/*'], { cwd })
  assert.equal(r1.code, 0)
  const r2 = run(['register', '--path', 'legacy/*'], { cwd })
  assert.equal(r2.code, 0)
  const book = JSON.parse(readFileSync(join(dir, '.shihu.json'), 'utf8'))
  assert.deepEqual(book.exempt, ['legacy/*'])
  assert.equal(run(['revoke', '--path', 'other/*'], { cwd }).code, 2)
  assert.equal(run(['revoke', '--path', 'legacy/*'], { cwd }).code, 0)
  assert.equal(run(['register'], { cwd }).code, 2) // 缺 --path
  rmSync(dir, { recursive: true, force: true })
})

test('list：缺册 exit 2；有册出 JSON', () => {
  assert.equal(run(['list']).code, 2)
  const r = run(['list', '--file', BOOK])
  assert.equal(r.code, 0)
  assert.deepEqual(JSON.parse(r.out).exempt, ['archive/*'])
})

test('block：无册出确定性文本；有册公示豁免', () => {
  const bare = run(['block'])
  assert.equal(bare.code, 0)
  assert.equal(bare.out.trim().split('\n')[1], '状册：未立（凡状皆对）')
  const r = run(['block', '--file', BOOK])
  assert.match(r.out, /【市虎 · 状牌】/)
  assert.match(r.out, /状册：豁免 1 处（archive\/\*）/)
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
  assert.match(h.out, /状册/)
})

test('block 逐字节确定：同册两次输出 shasum 一致，增豁免后改变', () => {
  const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8)
  const a = run(['block', '--file', BOOK]).out
  const b = run(['block', '--file', BOOK]).out
  assert.equal(sha(a), sha(b))
  const dir = mkdtempSync(join(tmpdir(), 'shihu-'))
  run(['register', '--path', 'legacy/*'], { cwd: dir })
  const c = run(['block'], { cwd: dir }).out
  assert.notEqual(sha(a), sha(c))
  rmSync(dir, { recursive: true, force: true })
})

test('--file 值缺失 → exit 2', () => {
  assert.equal(run(['audit', fx('clean-stream.jsonl'), '--file']).code, 2)
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
    assert.match(r.out, /受审状面 0/, rel)
    assert.match(r.out, /案账：虚功 0 · 掠据 0 · 无键 0/, rel)
    assert.match(r.out, /带「真」/, rel)
  }
})
