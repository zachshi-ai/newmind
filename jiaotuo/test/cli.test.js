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
const BIN = join(root, 'src', 'bin', 'jiaotuo.js')
const fx = (n) => join(root, 'fixtures', n)
const BOOK = fx('jiaotuo-book.json')

function run(args, { cwd = root } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

const audit = (files, extra = []) => run(['audit', ...files.map((f) => fx(f)), ...extra])

// ---- A2 夹具复现（十四流 + 合审 + gate 口径，分数逐字段断言）---------------------

test('A2 clean：全 0 信带 exit 0（净卷无引形）', () => {
  const r = audit(['clean-stream.jsonl'])
  assert.equal(r.code, 0)
  assert.match(r.out, /调用 1 · 受审径 1（2 行 0 笔）/)
  assert.match(r.out, /案账：矫引 0 · 佚据 0 · 征引 0 · 托主 0 · 阙据 0 · 泛引 0/)
  assert.match(r.out, /矫值 0（zj 0 \+ yj 0）· 带「信」· 门 30 → 过/)
  assert.match(r.out, /引皆信 ×2 行 0 笔/)
})

test('A2 weizhao：矫引 30 矫 exit 1，点名带径:行:引形与托径', () => {
  const r = audit(['weizhao-stream.jsonl'])
  assert.equal(r.code, 1)
  assert.match(r.out, /矫引：docs\/report\.md:3 规定（托 AGENTS\.md 查无此语 · 指纹 [0-9a-f]+）/)
  assert.match(r.out, /矫值 30（zj 30 \+ yj 0）· 带「矫」· 门 30 → 红/)
})

test('A2 zhengyin：征引 0 信 exit 0（原文征得）', () => {
  const r = audit(['zhengyin-stream.jsonl'])
  assert.equal(r.code, 0)
  assert.match(r.out, /征引：docs\/report\.md:3 规定（托 AGENTS\.md 原文征得）/)
  assert.match(r.out, /矫值 0/)
})

test('A2 wuben：阙据注记 exit 0（托 STYLE.md 流内无本）', () => {
  const r = audit(['wuben-stream.jsonl'])
  assert.equal(r.code, 0)
  assert.match(r.out, /注记：docs\/report\.md:3 阙据（托 STYLE\.md 流内无本）/)
})

test('A2 tuozhu：托主 + 泛引注记 exit 0', () => {
  const r = audit(['tuozhu-stream.jsonl'])
  assert.equal(r.code, 0)
  assert.match(r.out, /注记：docs\/handoff\.md:3 托主（主渠道无文——线下终裁）/)
  assert.match(r.out, /注记：docs\/handoff\.md:4 泛引（未指名文书）/)
})

test('A2 fangyin：佚据 15 疑 exit 0（黄牌点名不咬门）', () => {
  const r = audit(['fangyin-stream.jsonl'])
  assert.equal(r.code, 0)
  assert.match(r.out, /佚据：docs\/report\.md:3 规定（托 AGENTS\.md 词元命中 2\/9 · 指纹 [0-9a-f]+）/)
  assert.match(r.out, /矫值 15（zj 0 \+ yj 15）· 带「疑」· 门 30 → 过/)
})

test('A2 zhengju：征据 5/7 清白 exit 0', () => {
  const r = audit(['zhengju-stream.jsonl'])
  assert.equal(r.code, 0)
  assert.match(r.out, /征据：docs\/report\.md:3 规定（托 AGENTS\.md 词元命中 5\/7）/)
})

test('A2 shuangwei：双矫引 60 cap 矫 exit 1', () => {
  const r = audit(['shuangwei-stream.jsonl'])
  assert.equal(r.code, 1)
  assert.match(r.out, /矫引：docs\/r1\.md:1 规定/)
  assert.match(r.out, /矫引：docs\/r2\.md:1 依据/)
  assert.match(r.out, /矫值 60（zj 60 \+ yj 0）/)
})

test('A2 jiaoling：exec 嵌套取内矫引 30 exit 1，命令原文不进点名', () => {
  const r = audit(['jiaoling-stream.jsonl'])
  assert.equal(r.code, 1)
  assert.match(r.out, /矫引：cmd:[0-9a-f]+ per（托 AGENTS\.md 查无此语/)
  assert.ok(!r.out.includes('git commit'))
})

test('A2 mianze：带册免案 paths 0 exit 0；无册对照矫引 30 exit 1', () => {
  const withBook = audit(['mianze-stream.jsonl'], ['--file', BOOK])
  assert.equal(withBook.code, 0)
  assert.match(withBook.out, /受审径 0/)
  const noBook = audit(['mianze-stream.jsonl'])
  assert.equal(noBook.code, 1)
  assert.match(noBook.out, /矫值 30/)
})

test('A2 shixu / baishi / zishu / yingwen：时序阙据、失败写不入账、写亦生诏、英文伪托', () => {
  assert.equal(audit(['shixu-stream.jsonl']).code, 0)
  assert.match(audit(['shixu-stream.jsonl']).out, /阙据（托 AGENTS\.md 流内无本）/)
  assert.equal(audit(['baishi-stream.jsonl']).code, 0)
  assert.match(audit(['baishi-stream.jsonl']).out, /调用 1 · 受审径 0（0 行 0 笔）/)
  assert.equal(audit(['zishu-stream.jsonl']).code, 0)
  assert.match(audit(['zishu-stream.jsonl']).out, /征引：docs\/report\.md:1 规定（托 docs\/spec\.md 原文征得）/)
  const y = audit(['yingwen-stream.jsonl'])
  assert.equal(y.code, 1)
  assert.match(y.out, /矫引：REPORT\.md:1 per（托 AGENTS\.md 查无此语/)
})

test('A2 合审：weizhao + zhengyin → 4 调用矫引 1 征引 1 exit 1', () => {
  const r = audit(['weizhao-stream.jsonl', 'zhengyin-stream.jsonl'])
  assert.equal(r.code, 1)
  assert.match(r.out, /会话 2 · 调用 4 · 受审径 1（4 行 0 笔）/)
  assert.match(r.out, /案账：矫引 1 · 佚据 0 · 征引 1 · 托主 0 · 阙据 0 · 泛引 0/)
})

test('A2 附加口径：--gate 40 过门 / --gate 10 翻红', () => {
  assert.equal(audit(['weizhao-stream.jsonl'], ['--gate', '40']).code, 0)
  assert.equal(audit(['fangyin-stream.jsonl'], ['--gate', '10']).code, 1)
})

test('--json 紧凑输出：逐字段断言', () => {
  const r = audit(['weizhao-stream.jsonl'], ['--json'])
  assert.equal(r.code, 1)
  const j = JSON.parse(r.out)
  assert.equal(j.calls, 2)
  assert.equal(j.counts.zj, 1)
  assert.equal(j.score.total, 30)
  assert.equal(j.band, '矫')
  assert.equal(j.verdict, 'fail')
})

// ---- A3 跨项目互认（六流零误伤）------------------------------------------------

test('A3 跨项目六流零误伤：counts 全 0 全信带 exit 0', () => {
  const streams = [
    ['zhizhi', 'sample-stream.jsonl', 8],
    ['kaocheng', 'mixed-stream.jsonl', 4],
    ['dingfen', 'fenced-stream.jsonl', 6],
    ['erbing', 'mixed-stream.jsonl', 5],
    ['erbing', 'delegated-stream.jsonl', 5],
    ['huashui', 'fuji-stream.jsonl', 3],
  ]
  for (const [proj, file, calls] of streams) {
    const r = run(['audit', join(root, '..', proj, 'fixtures', file)])
    assert.equal(r.code, 0, `${proj}/${file}`)
    assert.match(r.out, new RegExp(`调用 ${calls}`), `${proj}/${file}`)
    assert.match(r.out, /案账：矫引 0 · 佚据 0 · 征引 0 · 托主 0 · 阙据 0 · 泛引 0/, `${proj}/${file}`)
    assert.match(r.out, /带「信」/, `${proj}/${file}`)
  }
})

// ---- CLI 契约（用法/输入错误 → exit 2）------------------------------------------

test('坏 JSON 行报行号 exit 2；流缺失 exit 2；未知旗标 exit 2', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jiaotuo-'))
  const bad = join(tmp, 'bad.jsonl')
  writeFileSync(bad, '{"type":"tool_call","id":"a","name":"write"}\nnot-json\n')
  assert.equal(run(['audit', bad]).code, 2)
  assert.match(run(['audit', bad]).err, /第 2 行不是合法 JSON/)
  assert.equal(run(['audit', join(tmp, 'missing.jsonl')]).code, 2)
  assert.equal(audit(['clean-stream.jsonl'], ['--wat']).code, 2)
  rmSync(tmp, { recursive: true, force: true })
})

test('register --path 缺值 exit 2、重复登记去重、册缺失自动建册；revoke 无此径 exit 2；list 缺册 exit 2', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jiaotuo-'))
  const book = join(tmp, '.jiaotuo.json')
  const opt = ['--file', book]
  assert.equal(run(['register', opt]).code, 2) // 缺 --path
  assert.equal(run(['register', '--path', 'docs/reports/*', ...opt]).code, 0)
  assert.equal(run(['register', '--path', 'docs/reports/*', ...opt]).code, 0)
  const listed = JSON.parse(run(['list', ...opt]).out)
  assert.deepEqual(listed.excuse, ['docs/reports/*'])
  assert.equal(run(['revoke', '--path', 'nope/*', ...opt]).code, 2)
  assert.equal(run(['revoke', '--path', 'docs/reports/*', ...opt]).code, 0)
  assert.equal(run(['list', '--file', join(tmp, 'none.json')]).code, 2)
  rmSync(tmp, { recursive: true, force: true })
})

test('register 后 audit 免案生效（册的声明权在任务方）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jiaotuo-'))
  const book = join(tmp, '.jiaotuo.json')
  const opt = ['--file', book]
  run(['register', '--path', 'docs/reports/*', ...opt])
  const r = run(['audit', fx('mianze-stream.jsonl'), ...opt])
  assert.equal(r.code, 0)
  assert.match(r.out, /受审径 0/)
  rmSync(tmp, { recursive: true, force: true })
})

test('block：无册确定性文本；同册两次 shasum 逐字节一致；增免案后文本改变', () => {
  const none = run(['block']).out
  assert.match(none, /诏册：未立（凡托皆记）/)
  assert.match(none, /引形：文书型 16 ∪ 泛型 9（默认 25 形）/)
  const tmp = mkdtempSync(join(tmpdir(), 'jiaotuo-'))
  const book = join(tmp, '.jiaotuo.json')
  run(['register', '--path', 'docs/reports/*', '--file', book])
  const a = run(['block', '--file', book]).out
  const b = run(['block', '--file', book]).out
  assert.equal(createHash('sha256').update(a).digest('hex'), createHash('sha256').update(b).digest('hex'))
  assert.match(a, /诏册：免案 1 处（docs\/reports\/\*）/)
  run(['register', '--path', 'legacy/*', '--file', book])
  assert.notEqual(run(['block', '--file', book]).out, a)
  rmSync(tmp, { recursive: true, force: true })
})

test('gate --value：29 过 / 30 红 / --gate 50 时 45 过', () => {
  assert.equal(run(['gate', '--value', '29']).code, 0)
  assert.equal(run(['gate', '--value', '30']).code, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).code, 0)
  assert.match(run(['gate', '--value', '30']).out, /带「矫」/)
})

test('audit 缺流文件参数 / gate 缺值 → exit 2；--version 与 --help 正常', () => {
  assert.equal(run(['audit']).code, 2)
  assert.equal(run(['gate']).code, 2)
  assert.equal(run(['--version']).code, 0)
  assert.equal(run(['--version']).out.trim(), '0.1.0')
  assert.match(run(['--help']).out, /矫托 · jiaotuo/)
  assert.equal(run(['frobnicate']).code, 2)
})
