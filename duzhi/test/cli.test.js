/**
 * 度支 CLI 单测 —— 退出码契约（0 守界 / 1 门禁失败 / 2 用法输入）与五夹具手算期望值。
 * 夹具期望值先于实现手算锁死（docs/04-acceptance.md），实现后未改动任何期望值。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'duzhi.js')
const FX = join(root, 'fixtures')

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? root,
  })
  let json = null
  try {
    json = JSON.parse(r.stdout)
  } catch {
    // 非 JSON 输出
  }
  return { code: r.status, out: r.stdout, err: r.stderr, json }
}

const reg = (name) => join(FX, `${name}-register.json`)
const stream = (name) => join(FX, `${name}-stream.jsonl`)

// ---------- 五夹具：手算期望 ----------

test('夹具 fenced: 有制不逾 → 0（足）exit 0，spanMs 180000', () => {
  const r = run(['audit', stream('fenced'), '--register', reg('fenced')])
  assert.equal(r.code, 0)
  assert.equal(r.json.score.total, 0)
  assert.equal(r.json.band, '足')
  assert.equal(r.json.counts.spanMs, 180000)
  assert.equal(r.json.counts.callsObserved, 4)
  assert.equal(r.json.counts.wuzhi, false)
})

test('夹具 overrun: cap 3 八调用 → 30（非）exit 1，逾 5 案皆 via calls', () => {
  const r = run(['audit', stream('overrun'), '--register', reg('overrun')])
  assert.equal(r.code, 1)
  assert.equal(r.json.score.total, 30)
  assert.equal(r.json.band, '非')
  assert.equal(r.json.counts.overCalls, 5)
  assert.ok(r.json.overCases.every((c) => c.via === 'calls'))
  assert.deepEqual(
    r.json.overCases.map((c) => c.seq),
    [4, 5, 6, 7, 8],
  )
})

test('夹具 overtime: cap 1 分钟 → 12（足）exit 0；--gate 10 → exit 1', () => {
  const r = run(['audit', stream('overtime'), '--register', reg('overtime')])
  assert.equal(r.code, 0)
  assert.equal(r.json.score.total, 12)
  assert.equal(r.json.band, '足')
  assert.ok(r.json.overCases.every((c) => c.via === 'time'))
  assert.deepEqual(r.json.overCases.map((c) => c.seq), [3, 4])

  const strict = run(['audit', stream('overtime'), '--register', reg('overtime'), '--gate', '10'])
  assert.equal(strict.code, 1)
  assert.equal(strict.json.score.total, 12)
})

test('夹具 unbounded: 无册 → 无制 40（非）exit 1；追认 --max-calls 4 → 12（足）exit 0；3 → 18（急）', () => {
  const r = run(['audit', stream('unbounded')])
  assert.equal(r.code, 1)
  assert.equal(r.json.score.total, 40)
  assert.equal(r.json.band, '非')
  assert.equal(r.json.counts.wuzhi, true)

  const retro4 = run(['audit', stream('unbounded'), '--max-calls', '4'])
  assert.equal(retro4.code, 0)
  assert.equal(retro4.json.score.total, 12)
  assert.equal(retro4.json.band, '足')

  const retro3 = run(['audit', stream('unbounded'), '--max-calls', '3'])
  assert.equal(retro3.code, 0)
  assert.equal(retro3.json.score.total, 18)
  assert.equal(retro3.json.band, '急')
})

test('夹具 untimed: 全流无 at → 时长退化 0（足）exit 0；--max-calls 2 → 12（足）', () => {
  const r = run(['audit', stream('untimed'), '--register', reg('untimed')])
  assert.equal(r.code, 0)
  assert.equal(r.json.score.total, 0)
  assert.equal(r.json.band, '足')
  assert.equal(r.json.counts.spanMs, null)

  const withCalls = run(['audit', stream('untimed'), '--register', reg('untimed'), '--max-calls', '2'])
  assert.equal(withCalls.code, 0)
  assert.equal(withCalls.json.score.total, 12)
  assert.deepEqual(withCalls.json.overCases.map((c) => c.seq), [3, 4])
})

// ---------- block / gate / declare / list ----------

test('block: 两跑逐字节相同（shasum 可证）', () => {
  const a = run(['block', stream('overrun'), '--register', reg('overrun')])
  const b = run(['block', stream('overrun'), '--register', reg('overrun')])
  assert.equal(a.code, 1)
  const h = (s) => createHash('sha256').update(s).digest('hex')
  assert.equal(h(a.out), h(b.out))
  assert.ok(a.out.includes('【度支 · 余量块 #1】'))
  assert.ok(a.out.includes('带：非'))
})

test('block --json: 包装为 {k, text}', () => {
  const r = run(['block', stream('fenced'), '--register', reg('fenced'), '--json'])
  assert.equal(r.code, 0)
  assert.equal(r.json.k, 1)
  assert.ok(r.json.text.includes('任：fix-login-bug'))
})

test('audit --json: 完整报告字段齐备', () => {
  const r = run(['audit', stream('overtime'), '--register', reg('overtime'), '--json'])
  assert.equal(r.code, 0)
  for (const key of ['score', 'band', 'counts', 'caps', 'id', 'gate', 'ok', 'overCases']) {
    assert.ok(key in r.json, `缺字段 ${key}`)
  }
  assert.equal(r.json.id, 'slow-migrate')
  assert.deepEqual(r.json.caps, { maxCalls: null, maxMinutes: 1 }) // 账内两线显式呈现，未设为 null
})

test('declare: 立册补丁语义——后补键保留旧键，未给 --id 保留旧 id', () => {
  const dir = join(root, 'tmp-cli-test')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const file = join(dir, '.duzhi.json')
  const first = run(['declare', '--max-calls', '9', '--id', '任甲', '--file', file])
  assert.equal(first.code, 0)
  const second = run(['declare', '--max-minutes', '7', '--file', file])
  assert.equal(second.code, 0)
  const onDisk = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(onDisk, { version: 1, id: '任甲', budget: { maxCalls: 9, maxMinutes: 7 } })
  rmSync(dir, { recursive: true, force: true })
})

test('declare: 无线拒立（exit 2）、fresh 无 id 拒立（exit 2）', () => {
  const dir = join(root, 'tmp-cli-test')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const file = join(dir, '.duzhi.json')
  assert.equal(run(['declare', '--file', file]).code, 2)
  assert.equal(run(['declare', '--max-calls', '5', '--file', file]).code, 2)
  assert.equal(existsSync(file), false)
  rmSync(dir, { recursive: true, force: true })
})

test('list: 生效之线 JSON（册与旗标合并后）与无制标记', () => {
  const r = run(['list', '--register', reg('fenced'), '--max-calls', '7'])
  assert.equal(r.code, 0)
  assert.deepEqual(r.json.budget, { maxCalls: 7, maxMinutes: 60 })
  assert.equal(r.json.bounded, true)
  assert.equal(r.json.id, 'fix-login-bug')

  const empty = run(['list'])
  assert.equal(empty.json.bounded, false)
})

test('gate: --value 29 pass / 30 fail，--gate 自定义', () => {
  assert.equal(run(['gate', '--value', '29']).code, 0)
  assert.equal(run(['gate', '--value', '30']).code, 1)
  assert.equal(run(['gate', '--value', '18', '--gate', '19']).code, 0)
  assert.equal(run(['gate', '--value', '18', '--gate', '18']).code, 1)
  assert.equal(run(['gate', '--value', '30', '--json']).json.verdict, 'fail')
})

// ---------- 用法与输入错误（exit 2） ----------

test('用法: 坏流报行号、坏文件、制册非法、未知命令/选项、缺流皆 exit 2', () => {
  const dir = join(root, 'tmp-cli-test')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'bad.jsonl'), '{"ok":1}\n不是JSON\n')
  const badStream = run(['audit', join(dir, 'bad.jsonl')])
  assert.equal(badStream.code, 2)
  assert.match(badStream.err, /第 2 行/)

  assert.equal(run(['audit', stream('fenced'), '--register', join(dir, '缺失.json')]).code, 2)

  writeFileSync(join(dir, 'empty-budget.json'), JSON.stringify({ version: 1, id: 'a', budget: {} }))
  assert.equal(run(['audit', stream('fenced'), '--register', join(dir, 'empty-budget.json')]).code, 2)

  assert.match(run(['audit', stream('fenced'), '--register', join(dir, 'bad.jsonl')]).err, /制册/)

  assert.equal(run(['frobnicate']).code, 2)
  assert.equal(run(['audit', stream('fenced'), '--register', reg('fenced'), '--wat']).code, 2)
  assert.equal(run(['audit']).code, 2)
  assert.equal(run(['audit', stream('fenced'), stream('overrun')]).code, 2)
  assert.equal(run(['audit', stream('fenced'), '--max-calls', '0', '--register', reg('fenced')]).code, 2)
  rmSync(dir, { recursive: true, force: true })
})

test('用法: --help 与 --version', () => {
  const help = run(['--help'])
  assert.equal(help.code, 0)
  assert.ok(help.out.includes('duzhi audit'))
  assert.equal(run(['--version']).out.trim(), '0.1.0')
})

// ---------- 跨项目互认 ----------

test('跨项目: zhizhi/zhibi 夹具流（无册）诚实报无制 40（非）exit 1', (t) => {
  // zhizhi 的样例流（8 调用，无 id 旧格式）与 zhibi 的 hollow 流（3 调用，带 id）各审一遍——
  // 同一份无册裁决对两种流形一致；单仓之外运行且夹具缺席时跳过。
  const cases = [
    { path: join(root, '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl'), calls: 8 },
    { path: join(root, '..', 'zhibi', 'fixtures', 'hollow-stream.jsonl'), calls: 3 },
  ].filter((c) => existsSync(c.path))
  if (cases.length === 0) return t.skip('跨项目夹具缺席（单仓之外运行）')
  for (const c of cases) {
    const r = run(['audit', c.path])
    assert.equal(r.code, 1, c.path)
    assert.equal(r.json.score.total, 40, c.path)
    assert.equal(r.json.band, '非', c.path)
    assert.equal(r.json.counts.callsObserved, c.calls, c.path)
    assert.equal(r.json.counts.wuzhi, true, c.path)
  }
})

test('门边界走 CLI: overtime 恰在门上即 fail、门上一格即 pass', () => {
  assert.equal(run(['audit', stream('overtime'), '--register', reg('overtime'), '--gate', '12']).code, 1)
  assert.equal(run(['audit', stream('overtime'), '--register', reg('overtime'), '--gate', '13']).code, 0)
})

test('block 无制流: 未立制册变体逐行落地', () => {
  const r = run(['block', stream('unbounded')])
  assert.equal(r.code, 1)
  assert.ok(r.out.includes('任：（未立制册）'))
  assert.ok(r.out.includes('入：未制——量入无从谈起，出已无界'))
  assert.ok(r.out.includes('蓄：——'))
  assert.ok(r.out.includes('带：非'))
  assert.ok(r.out.includes('逾：未制，逾无从判'))
})
