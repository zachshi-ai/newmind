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
const BIN = join(root, 'src', 'bin', 'saowu.js')
const fx = (n) => join(root, 'fixtures', n)
const BOOK = fx('saowu-book.json')

function run(args, { cwd = root } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

const audit = (files, extra = []) => run(['audit', ...files, '--file', BOOK, ...extra])

// ---- A2 夹具复现（手算表逐字段断言）---------------------------------------------

test('A2 clean：全 0 洁带 exit 0（末卷净）', () => {
  const r = audit([fx('clean-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /调用 2 · 受审径 1/)
  assert.match(r.out, /案账：遗针 0 处 · 遗屑 0 处 · 已扫 0 · 帚账不前 0/)
  assert.match(r.out, /垢值 0 · 带「洁」· 门 30 → 过/)
  assert.match(r.out, /帚过皆洁 ×1/)
})

test('A2 yizhen：遗针 1 处 30 垢 exit 1，点名带径行形', () => {
  const r = audit([fx('yizhen-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /遗针：src\/auth\.js:2（debugger）/)
  assert.match(r.out, /垢值 30 · 带「垢」· 门 30 → 红/)
})

test('A2 yixie：遗屑 1 处 15 蒙 exit 0（单屑黄牌不咬门）', () => {
  const r = audit([fx('yixie-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /遗屑：src\/auth\.js:2（console\.log×DEBUG）/)
  assert.match(r.out, /垢值 15 · 带「蒙」· 门 30 → 过/)
})

test('A2 shuangxie：遗屑 2 处 30 垢 exit 1', () => {
  const r = audit([fx('shuangxie-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /遗屑：bin\/stage\.sh:1（echo×====）/)
  assert.match(r.out, /遗屑：bin\/stage\.sh:2（console\.log×HERE）/)
})

test('A2 yisao：已扫注记 0 分洁带 exit 0', () => {
  const r = audit([fx('yisao-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /已扫：src\/calc\.js（曾撒 1 处，末卷已净）/)
  assert.match(r.out, /垢值 0 · 带「洁」/)
})

test('A2 pinzhen：三径三针 60 封顶 exit 1', () => {
  const r = audit([fx('pinzhen-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /受审径 3/)
  assert.match(r.out, /垢值 60 · 带「垢」/)
  assert.match(r.out, /遗针：src\/a\.js:1（debugger）/)
  assert.match(r.out, /遗针：lib\/b\.rb:1（binding）/)
  assert.match(r.out, /遗针：bin\/deploy\.sh:1（set_x）/)
})

test('A2 shichang：试验场豁免受审径 0 exit 0', () => {
  const r = audit([fx('shichang-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /受审径 0/)
  assert.match(r.out, /帚过皆洁 ×0/)
})

test('A2 liuce：带册豁免 exit 0 / 无册对照 45 垢 exit 1', () => {
  const withBook = audit([fx('liuce-stream.jsonl')])
  assert.equal(withBook.code, 0)
  assert.match(withBook.out, /受审径 0/)
  const bare = run(['audit', fx('liuce-stream.jsonl')])
  assert.equal(bare.code, 1)
  assert.match(bare.out, /垢值 45 · 带「垢」/)
  assert.match(bare.out, /遗针：scripts\/dev\.sh:1（set_x）/)
  assert.match(bare.out, /遗屑：scripts\/dev\.sh:2（echo×DEBUG）/)
})

test('A2 wujuan：无末卷全 0 受审径 1 exit 0', () => {
  const r = audit([fx('wujuan-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /受审径 1/)
  assert.match(r.out, /帚过皆洁 ×1/)
})

test('A2 duozhen：单卷三针 60 封顶 exit 1', () => {
  const r = audit([fx('duozhen-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /遗针：src\/legacy\.js:1（debugger）/)
  assert.match(r.out, /遗针：src\/legacy\.js:2（import_pdb）/)
  assert.match(r.out, /遗针：src\/legacy\.js:3（console_trace）/)
})

test('A2 biaoji：三路屑 40 封顶 exit 1', () => {
  const r = audit([fx('biaoji-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /遗屑：src\/parse\.js:1（print×>>>）/)
  assert.match(r.out, /遗屑：src\/parse\.js:2（console\.log×XXX）/)
  assert.match(r.out, /遗屑：src\/parse\.js:3（printf×debug-note）/)
})

test('A2 daoci：catch 体内屑照案 15 蒙 exit 0（与防川两账并记）', () => {
  const r = audit([fx('daoci-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /遗屑：src\/net\.js:4（console\.log×DEBUG）/)
  assert.match(r.out, /垢值 15 · 带「蒙」/)
})

test('A2 huisheng：正当输出不诬全 0 exit 0', () => {
  const r = audit([fx('huisheng-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /帚过皆洁 ×1/)
})

test('A2 qianzhang：遗针 1 处照出 + 帚账不前注记 1 exit 1', () => {
  const r = audit([fx('qianzhang-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /遗针：src\/a\.js:2（debugger）/)
  assert.match(r.out, /帚账不前：src\/a\.js（末卷后无文之写 1 笔，判定止于末卷）/)
})

test('A2 附加口径：yizhen --gate 100 过 / yixie --gate 10 红', () => {
  assert.equal(audit([fx('yizhen-stream.jsonl')], ['--gate', '100']).code, 0)
  assert.equal(audit([fx('yixie-stream.jsonl')], ['--gate', '10']).code, 1)
})

// ---- A3 跨项目互认 ----------------------------------------------------------------

test('A3 六流零误伤：zhizhi/kaocheng/fangchuan/yuefa/huashui/erbing 夹具全 0', () => {
  const six = [
    ['zhizhi', 'sample-stream.jsonl', 8],
    ['kaocheng', 'mixed-stream.jsonl', 4],
    ['fangchuan', 'yancao-stream.jsonl', 2],
    ['yuefa', 'clean-stream.jsonl', 2],
    ['huashui', 'clean-stream.jsonl', 4],
    ['erbing', 'mixed-stream.jsonl', 5],
  ]
  for (const [proj, file, calls] of six) {
    const r = run(['audit', join(root, '..', proj, 'fixtures', file)])
    assert.equal(r.code, 0, `${proj} ${file}`)
    const j = JSON.parse(run(['audit', join(root, '..', proj, 'fixtures', file), '--json']).out)
    assert.equal(j.calls, calls, `${proj} calls`)
    assert.equal(j.score.total, 0, `${proj} score`)
    assert.equal(j.band, '洁', `${proj} band`)
  }
})

// ---- 错误处理与册管理 --------------------------------------------------------------

test('audit：坏 JSON 行报行号 exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'saowu-'))
  const bad = join(dir, 'bad.jsonl')
  writeFileSync(bad, '{"ok":1}\nnot-json\n')
  assert.equal(run(['audit', bad]).code, 2)
  rmSync(dir, { recursive: true, force: true })
})

test('audit：流文件缺失 exit 2；无流参数 exit 2；未知旗标 exit 2', () => {
  assert.equal(run(['audit', fx('nope.jsonl')]).code, 2)
  assert.equal(run(['audit']).code, 2)
  assert.equal(audit([fx('clean-stream.jsonl')], ['--wat']).code, 2)
})

test('register：册缺失自动建册、重复登记去重；缺 --path exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'saowu-'))
  const book = join(dir, 'b.json')
  const r1 = run(['register', '--path', 'vendor/*', '--file', book])
  assert.equal(r1.code, 0)
  const r2 = run(['register', '--path', 'vendor/*', '--file', book])
  assert.match(r2.out, /共 1 处/)
  assert.equal(run(['register', '--file', book]).code, 2)
  rmSync(dir, { recursive: true, force: true })
})

test('revoke：无此径 exit 2', () => {
  assert.equal(run(['revoke', '--path', 'nope/*', '--file', BOOK]).code, 2)
})

test('list：缺册 exit 2；有册出 JSON', () => {
  assert.equal(run(['list', '--file', join(root, '.nope.json')]).code, 2)
  const r = run(['list', '--file', BOOK])
  assert.equal(r.code, 0)
  assert.deepEqual(JSON.parse(r.out).retain, ['scripts/*'])
})

test('block：无册出确定性文本；有册出留册公示', () => {
  const bare = run(['block'])
  assert.match(bare.out, /留册：未立（凡迹皆记）/)
  const withBook = run(['block', '--file', BOOK])
  assert.match(withBook.out, /留册：许留 1 处（scripts\/\*）/)
})

test('block：增一许留后文本改变（同一命令两次渲染之间册变）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'saowu-'))
  const book = join(dir, 'b.json')
  const t1 = run(['block', '--file', book]).out
  run(['register', '--path', 'vendor/*', '--file', book])
  const t2 = run(['block', '--file', book]).out
  assert.notEqual(t1, t2)
  rmSync(dir, { recursive: true, force: true })
})

test('gate：29 过 / 30 红；--gate 50 时 45 过', () => {
  assert.equal(run(['gate', '--value', '29']).code, 0)
  assert.equal(run(['gate', '--value', '30']).code, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).code, 0)
  assert.equal(run(['gate']).code, 2)
})

test('--version 与 --help 正常；未知命令 exit 2', () => {
  assert.equal(run(['--version']).code, 0)
  assert.match(run(['--help']).out, /扫屋/)
  assert.equal(run(['frobnicate']).code, 2)
})

// ---- A5 shasum（逐字节确定）--------------------------------------------------------

test('A5 帚牌块：同册两次 block shasum 全等；--json 紧凑输出', () => {
  const o1 = run(['block', '--file', BOOK]).out
  const o2 = run(['block', '--file', BOOK]).out
  assert.equal(createHash('sha256').update(o1).digest('hex').slice(0, 8), createHash('sha256').update(o2).digest('hex').slice(0, 8))
  const j = audit([fx('clean-stream.jsonl')], ['--json'])
  assert.equal(j.code, 0)
  const obj = JSON.parse(j.out)
  assert.deepEqual(obj.cases, { zhen: 0, xie: 0, sao: 0, qian: 0 })
})
