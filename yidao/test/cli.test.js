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
const BIN = join(root, 'src', 'bin', 'yidao.js')
const fx = (n) => join(root, 'fixtures', n)
const BOOK = fx('yidao-book.json')

function run(args, { cwd = root } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

const audit = (files, extra = []) => run(['audit', ...files, '--file', BOOK, ...extra])

// ---- A2 夹具复现（十三口径，分数逐字段断言）-------------------------------------

test('A2 clean：全 0 扃带 exit 0（净卷）', () => {
  const r = audit([fx('clean-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /调用 1 · 受审径 1/)
  assert.match(r.out, /案账：遇阻 0 · 素拆 0 · 复锁 0 · 无文之改 0/)
  assert.match(r.out, /锁值 0（yu 0 \+ su 0）· 带「扃」· 门 30 → 过/)
  assert.match(r.out, /锁皆扃 ×1/)
})

test('A2 yuzu：遇阻 30 洞 exit 1，点名带行号形名与窗内阻词', () => {
  const r = audit([fx('yuzu-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /遇阻：src\/client\.js:2 verify=False（窗内阻词 certificate @ seq 1）/)
  assert.match(r.out, /锁值 30（yu 30 \+ su 0）· 带「洞」· 门 30 → 红/)
})

test('A2 suchai：素拆 15 倚 exit 0（黄牌点名不咬门）', () => {
  const r = audit([fx('suchai-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /素拆：src\/client\.js:2 verify=False/)
  assert.match(r.out, /锁值 15（yu 0 \+ su 15）· 带「倚」· 门 30 → 过/)
})

test('A2 shuangsu：双素拆 30 洞 exit 1', () => {
  const r = audit([fx('shuangsu-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /素拆：src\/a\.js:2 verify=False/)
  assert.match(r.out, /素拆：src\/b\.js:2 rejectUnauthorized:false/)
})

test('A2 fusuo：复锁 0 扃 exit 0（扶令上马）', () => {
  const r = audit([fx('fusuo-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /复锁：src\/client\.js（尾文改净——扶令上马）/)
  assert.match(r.out, /锁值 0/)
})

test('A2 changmo：校场豁免 paths 0 扃 exit 0', () => {
  const r = audit([fx('changmo-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /受审径 0/)
})

test('A2 xufu 带册：免拆 paths 0；无册对照素拆 15', () => {
  const r = audit([fx('xufu-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /受审径 0/)
  const bare = run(['audit', fx('xufu-stream.jsonl')])
  assert.equal(bare.code, 0)
  assert.match(bare.out, /素拆：local-dev\/proxy\.js:2 verify=False/)
  assert.match(bare.out, /锁值 15/)
})

test('A2 wangsuo：网锁族遇阻 30 洞 exit 1（窗内阻词 cors）', () => {
  const r = audit([fx('wangsuo-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.out, /遇阻：src\/app\.js:1 origin:'\*'（窗内阻词 cors @ seq 1）/)
})

test('A2 wugai：素拆 1 + 尾文后无文之改注记，15 倚 exit 0', () => {
  const r = audit([fx('wugai-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /素拆：src\/client\.js:2 verify=False/)
  assert.match(r.out, /注记：src\/client\.js 尾文后无文之改 1 笔/)
})

test('A2 shixie：失败写不入账 全 0 扃 exit 0', () => {
  const r = audit([fx('shixie-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.out, /锁皆扃 ×0/)
})

test('A2 附加口径：shuangsu --gate 40 过门 / suchai --gate 10 红', () => {
  assert.equal(audit([fx('shuangsu-stream.jsonl')], ['--gate', '40']).code, 0)
  assert.equal(audit([fx('suchai-stream.jsonl')], ['--gate', '10']).code, 1)
})

// ---- CLI 面 ------------------------------------------------------------------

test('audit --json 紧凑输出可解析，字段与文本口径一致', () => {
  const r = audit([fx('yuzu-stream.jsonl')], ['--json'])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.deepEqual(j.counts, { yu: 1, su: 0, fu: 0, wu: 0 })
  assert.equal(j.score.total, 30)
  assert.equal(j.band, '洞')
  assert.equal(j.verdict, 'fail')
})

test('audit 坏 JSON 行 → exit 2 并报行号；缺值 → exit 2；未知旗标 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yidao-'))
  const bad = join(dir, 'bad.jsonl')
  writeFileSync(bad, '{"ok":1}\nnot-json\n')
  assert.equal(run(['audit', bad]).code, 2)
  assert.match(run(['audit', bad]).err, /第 2 行/)
  assert.equal(run(['audit', fx('yuzu-stream.jsonl'), '--file']).code, 2)
  assert.equal(audit([fx('yuzu-stream.jsonl')], ['--unknown']).code, 2)
  rmSync(dir, { recursive: true, force: true })
})

test('audit 流文件缺失 → exit 2；无流文件 → exit 2', () => {
  assert.equal(run(['audit', join(tmpdir(), '不存在-' + Date.now() + '.jsonl')]).code, 2)
  assert.equal(run(['audit']).code, 2)
})

test('register：册缺失自动建册、重复去重；revoke 无此径 exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yidao-'))
  const cwd = dir
  assert.equal(run(['register', '--path', 'legacy/*'], { cwd }).code, 0)
  assert.equal(run(['register', '--path', 'legacy/*'], { cwd }).code, 0)
  const book = JSON.parse(readFileSync(join(dir, '.yidao.json'), 'utf8'))
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
  assert.deepEqual(JSON.parse(r.out).excuse, ['local-dev/*'])
})

test('block：无册出确定性文本；有册公示锁册与形表', () => {
  const bare = run(['block'])
  assert.equal(bare.code, 0)
  assert.equal(bare.out.trim().split('\n')[1], '锁册：未立（凡拆皆记）')
  assert.match(bare.out, /形表：验锁 10 ∪ 网锁 2（默认 12 形）/)
  const r = run(['block', '--file', BOOK])
  assert.match(r.out, /锁册：免拆 1 处（local-dev\/\*）/)
  assert.match(r.out, /【揖盗 · 锁牌】/)
})

test('block 逐字节确定：同册两次输出 shasum 一致，增免拆后改变', () => {
  const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8)
  const a = run(['block', '--file', BOOK]).out
  const b = run(['block', '--file', BOOK]).out
  assert.equal(sha(a), sha(b))
  const dir = mkdtempSync(join(tmpdir(), 'yidao-'))
  run(['register', '--path', 'legacy/*'], { cwd: dir })
  const c = run(['block'], { cwd: dir }).out
  assert.notEqual(sha(a), sha(c))
  rmSync(dir, { recursive: true, force: true })
})

test('gate：29 过 / 30 红 / --gate 50 时 45 过；缺 --value exit 2', () => {
  assert.equal(run(['gate', '--value', '29']).code, 0)
  assert.equal(run(['gate', '--value', '30']).code, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).code, 0)
  assert.equal(run(['gate']).code, 2)
})

test('--version 与 --help 正常', () => {
  const v = run(['--version'])
  assert.equal(v.code, 0)
  assert.match(v.out, /^0\.1\.0/)
  const h = run(['--help'])
  assert.equal(h.code, 0)
  assert.match(h.out, /audit/)
  assert.match(h.out, /register/)
  assert.match(h.out, /锁册/)
})

test('A3 跨项目六流零误伤（zhizhi/kaocheng/dingfen/erbing×2/huashui）', () => {
  const flows = [
    ['../zhizhi/fixtures/sample-stream.jsonl', 8],
    ['../kaocheng/fixtures/mixed-stream.jsonl', 4],
    ['../dingfen/fixtures/fenced-stream.jsonl', 6],
    ['../erbing/fixtures/mixed-stream.jsonl', 5],
    ['../erbing/fixtures/delegated-stream.jsonl', 5],
    ['../huashui/fixtures/fuji-stream.jsonl', 3],
  ]
  for (const [rel, calls] of flows) {
    const r = run(['audit', join(root, rel)])
    assert.equal(r.code, 0, rel)
    assert.match(r.out, new RegExp(`调用 ${calls} `), rel)
    assert.match(r.out, /案账：遇阻 0 · 素拆 0 · 复锁 0 · 无文之改 0/, rel)
    assert.match(r.out, /带「扃」/, rel)
  }
})
