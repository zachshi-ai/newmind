/**
 * CLI 语义测试 —— audit/register/revoke/list/block/gate 与退出码（docs/04 的 A2/A3/A4/A5）。
 * 子进程一律 spawnSync（非零退出拿得到 stdout）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'kaocheng.js')
const F = (name) => join(root, 'fixtures', name)

function run(args, cwd = root) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
}

function audit(name, ...extra) {
  return run(['audit', F(name), ...extra])
}

function scoreOf(res) {
  return JSON.parse(res.stdout)
}

// ---- A2：六夹具与附加口径（先于实现手算定死）------------------------------

test('夹具 clean：诚物 2、0 诚带 exit 0（册外写与读不入考）', () => {
  const r = audit('clean-stream.jsonl', '--file', F('kaocheng-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 4)
  assert.deepEqual(s.counts, { items: 2, cheng: 2, ci: 0, ke: 0, qi: 0, mie: 0, you: 0, unseen: 0, noend: 0 })
  assert.deepEqual(s.score, { total: 0, you: 0, mie: 0, ke: 0, qi: 0, fields: 0, words: 0, lines: 0 })
  assert.equal(s.band, '诚')
})

test('夹具 youwu：幽物 2、60 欺 exit 1（契上之物全流无工）', () => {
  const r = audit('youwu-stream.jsonl', '--file', F('kaocheng-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.equal(s.calls, 3)
  assert.deepEqual(s.counts, { items: 2, cheng: 0, ci: 0, ke: 0, qi: 0, mie: 0, you: 2, unseen: 0, noend: 0 })
  assert.deepEqual(s.score, { total: 60, you: 60, mie: 0, ke: 0, qi: 0, fields: 0, words: 0, lines: 0 })
  assert.equal(s.band, '欺')
})

test('夹具 qiwu：畸物 1、30 欺 exit 1（声 json 而末据不可解析）', () => {
  const r = audit('qiwu-stream.jsonl', '--file', F('kaocheng-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.equal(s.calls, 2)
  assert.deepEqual(s.counts, { items: 2, cheng: 1, ci: 0, ke: 0, qi: 1, mie: 0, you: 0, unseen: 0, noend: 0 })
  assert.deepEqual(s.score, { total: 30, you: 0, mie: 0, ke: 0, qi: 30, fields: 0, words: 0, lines: 0 })
  assert.equal(s.band, '欺')
})

test('夹具 mixed：壳物 1 + 疵物 1（缺域 count）、30 欺 exit 1', () => {
  const r = audit('mixed-stream.jsonl', '--file', F('kaocheng-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.equal(s.calls, 4)
  assert.deepEqual(s.counts, { items: 2, cheng: 0, ci: 1, ke: 1, qi: 0, mie: 0, you: 0, unseen: 0, noend: 0 })
  assert.deepEqual(s.score, { total: 30, you: 0, mie: 0, ke: 20, qi: 0, fields: 10, words: 0, lines: 0 })
  assert.equal(s.band, '欺')
})

test('夹具 miewu：灭物 1、30 欺 exit 1（末笔写后遭 rm 词族毁）', () => {
  const r = audit('miewu-stream.jsonl', '--file', F('kaocheng-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 1)
  assert.equal(s.calls, 3)
  assert.deepEqual(s.counts, { items: 2, cheng: 1, ci: 0, ke: 0, qi: 0, mie: 1, you: 0, unseen: 0, noend: 0 })
  assert.deepEqual(s.score, { total: 30, you: 0, mie: 30, ke: 0, qi: 0, fields: 0, words: 0, lines: 0 })
  assert.equal(s.band, '欺')
})

test('夹具 workseen：工见未考 1（注记不计分）、0 诚带 exit 0', () => {
  const r = audit('workseen-stream.jsonl', '--file', F('kaocheng-book.json'), '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 2)
  assert.deepEqual(s.counts, { items: 2, cheng: 1, ci: 0, ke: 0, qi: 0, mie: 0, you: 0, unseen: 1, noend: 0 })
  assert.deepEqual(s.score, { total: 0, you: 0, mie: 0, ke: 0, qi: 0, fields: 0, words: 0, lines: 0 })
  assert.equal(s.band, '诚')
})

test('附加口径：youwu + --gate 70 → 60 过门 exit 0', () => {
  const r = audit('youwu-stream.jsonl', '--file', F('kaocheng-book.json'), '--gate', '70', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.score.total, 60)
  assert.equal(s.verdict, 'pass')
})

test('附加口径：mixed + --gate 40 → 30 过门 exit 0', () => {
  const r = audit('mixed-stream.jsonl', '--file', F('kaocheng-book.json'), '--gate', '40', '--json')
  assert.equal(r.status, 0)
})

test('附加口径：clean 无 --file → 无册不判（contractless 0 分 exit 0）', () => {
  const r = audit('clean-stream.jsonl', '--json')
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.contractless, true)
  assert.equal(s.calls, 4)
  assert.equal(s.items, 0)
  assert.equal(s.score.total, 0)
  assert.equal(s.band, '诚')
})

// ---- A3：跨项目互认 -------------------------------------------------------

const X = (name) => join(root, '..', name) // 跨项目夹具：newmind/<proj>/fixtures/…

test('A3：zhizhi sample-stream + 契册喂 kaocheng —— 8 调用、账上无末态 1、0 诚带 exit 0', () => {
  const r = run(['audit', X('zhizhi/fixtures/sample-stream.jsonl'), '--file', F('kaocheng-book-zhizhi.json'), '--json'])
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 8)
  assert.deepEqual(s.counts, { items: 1, cheng: 0, ci: 0, ke: 0, qi: 0, mie: 0, you: 0, unseen: 0, noend: 1 })
  assert.equal(s.score.total, 0)
  assert.equal(s.band, '诚')
})

test('A3：dingfen fenced-stream 无册喂 kaocheng —— 6 调用、无册不判 exit 0', () => {
  const r = run(['audit', X('dingfen/fixtures/fenced-stream.jsonl'), '--json'])
  const s = scoreOf(r)
  assert.equal(r.status, 0)
  assert.equal(s.calls, 6)
  assert.equal(s.contractless, true)
  assert.equal(s.score.total, 0)
})

// ---- A4：CLI 语义 ---------------------------------------------------------

test('audit：多流合审（拆两流的 miewu 合并审出灭物）；坏 JSON 行 / 流缺失 / 未知旗标 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaocheng-'))
  try {
    const s1 = join(dir, 's1.jsonl')
    const s2 = join(dir, 's2.jsonl')
    writeFileSync(s1, [
      '{"type":"tool_call","id":"a","name":"write","args":{"path":"docs/report.md","content":"一\\n二\\n三\\n结论\\n"}}',
      '{"type":"tool_result","id":"a","name":"write","isError":false}',
    ].join('\n'))
    writeFileSync(s2, [
      '{"type":"tool_call","id":"b","name":"bash","args":{"command":"rm docs/report.md"}}',
      '{"type":"tool_result","id":"b","name":"bash","isError":false}',
    ].join('\n'))
    const merged = run(['audit', s1, s2, '--file', F('kaocheng-book.json'), '--json'])
    assert.equal(merged.status, 1)
    const sm = JSON.parse(merged.stdout)
    assert.equal(sm.calls, 2)
    assert.equal(sm.counts.mie, 1)

    const bad = join(dir, 'bad.jsonl')
    writeFileSync(bad, '{"ok":1}\nnope\n')
    assert.equal(run(['audit', bad]).status, 2)
    assert.equal(run(['audit', join(dir, 'missing.jsonl')]).status, 2)
    assert.equal(run(['audit', F('clean-stream.jsonl'), '--wat']).status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('register：缺名/缺径/坏 form/坏 min-lines → exit 2；立契与同名 upsert', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaocheng-'))
  try {
    const book = join(dir, '.kaocheng.json')
    assert.equal(run(['register'], dir).status, 2)
    assert.equal(run(['register', '--name', '报告'], dir).status, 2)
    assert.equal(run(['register', '--name', '报告', '--path', 'docs/report.md', '--form', 'yaml', '--file', book], dir).status, 2)
    assert.equal(run(['register', '--name', '报告', '--path', 'docs/report.md', '--min-lines', '0', '--file', book], dir).status, 2)
    const ok = run(['register', '--name', '报告', '--path', 'docs/report.md', '--min-lines', '3', '--words', '结论', '--file', book], dir)
    assert.equal(ok.status, 0)
    assert.ok(existsSync(book))
    run(['register', '--name', '结果', '--path', 'out/result.json', '--form', 'json', '--fields', 'summary,count', '--file', book], dir)
    const listed = JSON.parse(run(['list', '--file', book]).stdout)
    assert.deepEqual(listed.entries, { items: 2, json: 1, text: 1 })
    // 同名 upsert：改契不是加契
    run(['register', '--name', '报告', '--path', 'docs/report2.md', '--file', book], dir)
    const listed2 = JSON.parse(run(['list', '--file', book]).stdout)
    assert.equal(listed2.entries.items, 2)
    assert.equal(listed2.book.items[0].path, 'docs/report2.md')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('revoke：缺名 / 无此名 → exit 2；销契生效；list 册缺失 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaocheng-'))
  try {
    const book = join(dir, '.kaocheng.json')
    run(['register', '--name', '报告', '--path', 'docs/report.md', '--file', book], dir)
    assert.equal(run(['revoke', '--file', book], dir).status, 2)
    assert.equal(run(['revoke', '--name', '无此物', '--file', book], dir).status, 2)
    assert.equal(run(['revoke', '--name', '报告', '--file', book], dir).status, 0)
    assert.equal(run(['list', '--file', join(dir, 'missing.json')]).status, 2)
    const listed = JSON.parse(run(['list', '--file', book]).stdout)
    assert.equal(listed.entries.items, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('audit + 坏册 → exit 2（坏 JSON / form 非法）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaocheng-'))
  try {
    const bad1 = join(dir, 'bad1.json')
    writeFileSync(bad1, 'not json')
    assert.equal(run(['audit', F('clean-stream.jsonl'), '--file', bad1]).status, 2)
    const bad2 = join(dir, 'bad2.json')
    writeFileSync(bad2, JSON.stringify({ version: 1, items: [{ name: 'a', path: 'p', form: 'yaml' }] }))
    assert.equal(run(['audit', F('clean-stream.jsonl'), '--file', bad2]).status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('gate：--value 按门判 0/1；缺 --value → exit 2', () => {
  assert.equal(run(['gate', '--value', '29']).status, 0)
  assert.equal(run(['gate', '--value', '30']).status, 1)
  const custom = run(['gate', '--value', '45', '--gate', '50'])
  assert.equal(custom.status, 0)
  const out = JSON.parse(run(['gate', '--value', '45', '--gate', '40']).stdout)
  assert.equal(out.verdict, 'fail')
  assert.equal(out.band, '欺')
  assert.equal(run(['gate']).status, 2)
})

test('--version 与 --help 正常', () => {
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/)
  assert.match(run(['--help']).stdout, /用法/)
})

// ---- A5：考牌块逐字节确定 ---------------------------------------------------

test('考牌块：同册两次 shasum 相同；增契后文本改变；无册出确定性文本', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaocheng-'))
  try {
    const book = join(dir, '.kaocheng.json')
    run(['register', '--name', '报告', '--path', 'docs/report.md', '--file', book], dir)
    const h = (args) => createHash('sha256').update(run(['block', ...args, '--file', book]).stdout).digest('hex')
    const before = h([])
    assert.equal(before, h([])) // 同册两次逐字节相同
    run(['register', '--name', '结果', '--path', 'out/result.json', '--form', 'json', '--file', book], dir)
    assert.notEqual(before, h([])) // 增一契后文本改变
    // 无册：block 是公示不是门禁——出确定性文本 exit 0
    const empty = run(['block', '--file', join(dir, 'missing.json')])
    assert.equal(empty.status, 0)
    assert.equal(empty.stdout, '【考诚 · 考牌】\n契册：未立（无契而工，考诚失据）\n')
    const empty2 = run(['block', '--file', join(dir, 'missing.json')])
    assert.equal(empty.stdout, empty2.stdout)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
