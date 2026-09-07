/**
 * CLI 语义测试（docs/04 A4）——audit 多流合审、--file/--gate/--json、register/revoke/list/block/gate、
 * 退出码 0/1/2、A2 夹具十二条复现、A3 跨项目互认、A5 准牌块确定性。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'pingzhun.js')
const FX = (name) => join(root, 'fixtures', name)
const BOOK = FX('pingzhun-book.json')

function run(args, cwd = root) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd })
  return { exit: r.status, out: r.stdout, err: r.stderr }
}

function auditJson(stream, extra = []) {
  const r = run(['audit', FX(stream), '--file', BOOK, '--json', ...extra])
  return { exit: r.exit, report: JSON.parse(r.out) }
}

// ---------- A2 夹具十二条复现 ----------

test('A2：clean——counts 全 0、平、exit 0', () => {
  const { exit, report } = auditJson('clean-stream.jsonl')
  assert.equal(exit, 0)
  assert.equal(report.calls, 2)
  assert.deepEqual(report.cases, { zeng: 0, suo: 0, yue: 0, gou: 0, an: 0, su: 0 })
  assert.deepEqual(report.score, { yue: 0, gou: 0, zeng: 0, suo: 0, total: 0 })
  assert.equal(report.band, '平')
})

test('A2：zengfu——增附 1（lodash）、15、偏、exit 0', () => {
  const { exit, report } = auditJson('zengfu-stream.jsonl')
  assert.equal(exit, 0)
  assert.deepEqual(report.cases, { zeng: 1, suo: 0, yue: 0, gou: 0, an: 0, su: 0 })
  assert.equal(report.score.total, 15)
  assert.equal(report.band, '偏')
  assert.ok(report.issues.includes('增附：package.json lodash'))
})

test('A2：shuangfu——增附 2、30、倾、exit 1', () => {
  const { exit, report } = auditJson('shuangfu-stream.jsonl')
  assert.equal(exit, 1)
  assert.equal(report.cases.zeng, 2)
  assert.equal(report.score.total, 30)
  assert.equal(report.band, '倾')
})

test('A2：qusuo——去锁 1、10、平、exit 0', () => {
  const { exit, report } = auditJson('qusuo-stream.jsonl')
  assert.equal(exit, 0)
  assert.deepEqual(report.cases, { zeng: 0, suo: 1, yue: 0, gou: 0, an: 0, su: 0 })
  assert.equal(report.score.total, 10)
  assert.equal(report.band, '平')
})

test('A2：yueyuan——越源 1、30、倾、exit 1＋籍无底本注记', () => {
  const { exit, report } = auditJson('yueyuan-stream.jsonl')
  assert.equal(exit, 1)
  assert.deepEqual(report.cases, { zeng: 0, suo: 0, yue: 1, gou: 0, an: 0, su: 0 })
  assert.equal(report.score.total, 30)
  assert.equal(report.band, '倾')
  assert.ok(report.issues.includes('越源：requirements.txt:1 mirror.corp.example'))
  assert.ok(report.issues.includes('注记：requirements.txt 籍无底本'))
})

test('A2：gouru——钩入 1、30、倾、exit 1', () => {
  const { exit, report } = auditJson('gouru-stream.jsonl')
  assert.equal(exit, 1)
  assert.deepEqual(report.cases, { zeng: 0, suo: 0, yue: 0, gou: 1, an: 0, su: 0 })
  assert.equal(report.score.total, 30)
  assert.ok(report.issues.includes('钩入：package.json postinstall'))
})

test('A2：hugou——旧本已有之钩不判，全 0、exit 0', () => {
  const { exit, report } = auditJson('hugou-stream.jsonl')
  assert.equal(exit, 0)
  assert.deepEqual(report.cases, { zeng: 0, suo: 0, yue: 0, gou: 0, an: 0, su: 0 })
  assert.equal(report.band, '平')
})

test('A2：naji（带册）——纳籍免账，paths 0、exit 0', () => {
  const { exit, report } = auditJson('naji-stream.jsonl')
  assert.equal(exit, 0)
  assert.equal(report.paths, 0)
  assert.deepEqual(report.cases, { zeng: 0, suo: 0, yue: 0, gou: 0, an: 0, su: 0 })
})

test('A2：wudi——递案无底本不判，exit 0＋注记', () => {
  const { exit, report } = auditJson('wudi-stream.jsonl')
  assert.equal(exit, 0)
  assert.deepEqual(report.cases, { zeng: 0, suo: 0, yue: 0, gou: 0, an: 0, su: 0 })
  assert.deepEqual(report.issues, ['注记：package.json 籍无底本'])
})

test('A2：anji——暗籍注记、exit 0', () => {
  const { exit, report } = auditJson('anji-stream.jsonl')
  assert.equal(exit, 0)
  assert.deepEqual(report.cases, { zeng: 0, suo: 0, yue: 0, gou: 0, an: 1, su: 0 })
  assert.ok(report.issues[0].includes('暗籍：package.json（seq 1 重定向）'))
})

test('A2 附加口径：shuangfu+--gate 40 过门；zengfu+--gate 10 红', () => {
  assert.equal(run(['audit', FX('shuangfu-stream.jsonl'), '--file', BOOK, '--gate', '40']).exit, 0)
  assert.equal(run(['audit', FX('zengfu-stream.jsonl'), '--file', BOOK, '--gate', '10']).exit, 1)
})

// ---------- A4 CLI 语义 ----------

test('A4：多流合审——shuangfu 拆两流合并审出 30 倾 exit 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pingzhun-'))
  try {
    const lines = readFileSync(FX('shuangfu-stream.jsonl'), 'utf8').split('\n').filter(Boolean)
    const a = join(dir, 'a.jsonl')
    const b = join(dir, 'b.jsonl')
    writeFileSync(a, lines.filter((l) => l.includes('"id":"c1"')).join('\n') + '\n')
    writeFileSync(b, lines.filter((l) => l.includes('"id":"c2"')).join('\n') + '\n')
    const { exit, out } = run(['audit', a, b, '--file', BOOK, '--json'])
    assert.equal(exit, 1)
    const report = JSON.parse(out)
    assert.equal(report.sessions, 2)
    assert.equal(report.cases.zeng, 2) // 旧本池跨流：write1 立底，write2 添 chalk 与 glob
    assert.equal(report.score.total, 30)
    assert.equal(report.band, '倾')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A4：多流合审——考其末文：后写覆盖前写，末文分析计案（30 倾）', () => {
  const { exit, out } = run(['audit', FX('zengfu-stream.jsonl'), FX('shuangfu-stream.jsonl'), '--file', BOOK, '--json'])
  assert.equal(exit, 1)
  const report = JSON.parse(out)
  assert.equal(report.cases.zeng, 2) // 末文 = shuangfu 末笔之写（shuangfu c1 整文件覆盖 zengfu 之附名）
  assert.deepEqual(report.issues, ['增附：package.json chalk', '增附：package.json glob'])
  assert.equal(report.score.total, 30)
})

test('A4：坏 JSON 行 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pingzhun-'))
  try {
    const bad = join(dir, 'bad.jsonl')
    writeFileSync(bad, '{"type":"tool_call","id":"1","name":"bash"}\nnot-json\n')
    assert.equal(run(['audit', bad]).exit, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A4：流缺失 → exit 2；未知旗标 → exit 2；audit 缺流文件 → exit 2', () => {
  assert.equal(run(['audit', FX('no-such-stream.jsonl')]).exit, 2)
  assert.equal(run(['audit', FX('clean-stream.jsonl'), '--wat']).exit, 2)
  assert.equal(run(['audit']).exit, 2)
})

test('A4：register --path 立纳籍（册缺失自动建册）、重复去重；--form 增形', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pingzhun-'))
  try {
    const book = join(dir, '.pingzhun.json')
    const r1 = run(['register', '--path', 'vendor/*', '--file', book])
    assert.equal(r1.exit, 0)
    assert.ok(r1.out.includes('立纳籍'))
    const r2 = run(['register', '--path', 'vendor/*', '--file', book])
    assert.ok(r2.out.includes('去重'))
    const r3 = run(['register', '--form', 'Makefile', '--file', book])
    assert.ok(r3.out.includes('增籍形'))
    const listed = JSON.parse(run(['list', '--file', book]).out)
    assert.deepEqual(listed.entries, { admit: 1, extra: 1 })
    assert.ok(existsSync(book))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A4：register 缺 --path 且缺 --form → exit 2；revoke 无此径 → exit 2；list 册缺失 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pingzhun-'))
  try {
    assert.equal(run(['register', '--file', join(dir, 'x.json')]).exit, 2)
    assert.equal(run(['revoke', '--path', 'nope/*', '--file', join(dir, '.pingzhun.json')]).exit, 2)
    assert.equal(run(['list', '--file', join(dir, 'missing.json')]).exit, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A4：revoke 销纳籍与增形', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pingzhun-'))
  try {
    const book = join(dir, '.pingzhun.json')
    run(['register', '--path', 'vendor/*', '--file', book])
    run(['register', '--form', 'Makefile', '--file', book])
    assert.equal(run(['revoke', '--form', 'Makefile', '--file', book]).exit, 0)
    assert.equal(run(['revoke', '--path', 'vendor/*', '--file', book]).exit, 0)
    const listed = JSON.parse(run(['list', '--file', book]).out)
    assert.deepEqual(listed.entries, { admit: 0, extra: 0 })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A5：block 无册确定性文本；同册两次逐字节相同；增纳籍改文', () => {
  const empty = run(['block']).out
  assert.equal(empty, '【平准 · 准牌】\n籍面：22 形（默认）\n命籍：未立（籍面全账）\n')
  const once = run(['block', '--file', BOOK]).out
  const twice = run(['block', '--file', BOOK]).out
  assert.equal(once, twice)
  const dir = mkdtempSync(join(tmpdir(), 'pingzhun-'))
  try {
    const book = join(dir, '.pingzhun.json')
    copyFileSync(BOOK, book)
    run(['register', '--path', 'third-party/*', '--file', book])
    const grown = run(['block', '--file', book]).out
    assert.notEqual(grown, once)
    assert.ok(grown.includes('third-party/*'))
    assert.ok(grown.includes('22 形'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('A4：gate --value 29 过 / 30 红 / --gate 50 时 45 过', () => {
  assert.equal(run(['gate', '--value', '29']).exit, 0)
  assert.equal(run(['gate', '--value', '30']).exit, 1)
  assert.equal(run(['gate', '--value', '45', '--gate', '50']).exit, 0)
  assert.equal(run(['gate']).exit, 2)
})

test('A4：--version 与 --help 正常', () => {
  assert.match(run(['--version']).out.trim(), /^\d+\.\d+\.\d+$/)
  assert.ok(run(['--help']).out.includes('audit'))
  assert.ok(run(['--help']).out.includes('纳籍'))
})

// ---------- A3 跨项目互认 ----------

test('A3：zhizhi sample 无册零误伤（8 调用全 0）', () => {
  const r = run(['audit', join(root, '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl'), '--json'])
  assert.equal(r.exit, 0)
  const report = JSON.parse(r.out)
  assert.equal(report.calls, 8)
  assert.deepEqual(report.cases, { zeng: 0, suo: 0, yue: 0, gou: 0, an: 0, su: 0 })
  assert.equal(report.band, '平')
})

test('A3：dingfen fenced 无册零误伤（6 调用全 0）', () => {
  const r = run(['audit', join(root, '..', 'dingfen', 'fixtures', 'fenced-stream.jsonl'), '--json'])
  assert.equal(r.exit, 0)
  assert.equal(JSON.parse(r.out).calls, 6)
  assert.equal(JSON.parse(r.out).score.total, 0)
})

test('A3：kaocheng mixed 无册零误伤（4 调用全 0）', () => {
  const r = run(['audit', join(root, '..', 'kaocheng', 'fixtures', 'mixed-stream.jsonl'), '--json'])
  assert.equal(r.exit, 0)
  assert.equal(JSON.parse(r.out).calls, 4)
  assert.equal(JSON.parse(r.out).score.total, 0)
})

test('A3：jiyi blind 无册零误伤（5 调用全 0——cat package.json 不生产暗籍）', () => {
  const r = run(['audit', join(root, '..', 'jiyi', 'fixtures', 'blind-stream.jsonl'), '--json'])
  assert.equal(r.exit, 0)
  const report = JSON.parse(r.out)
  assert.equal(report.calls, 5)
  assert.deepEqual(report.cases, { zeng: 0, suo: 0, yue: 0, gou: 0, an: 0, su: 0 })
})
