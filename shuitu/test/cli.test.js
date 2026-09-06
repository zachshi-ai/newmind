/**
 * CLI 语义测试 —— audit/register/revoke/list/block/gate 全子命令与退出码（docs/04 的 A4/A5）。
 * 临时土册写进 os.tmpdir 的 mkdtemp，用后即清（不在仓库留任何测试遗物）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const bin = join(root, 'src', 'bin', 'shuitu.js')
const fx = (f) => join(root, 'fixtures', f)

const scratch = mkdtempSync(join(tmpdir(), 'shuitu-test-'))
const bookPath = join(scratch, '.shuitu.json')

test.after(() => {
  rmSync(scratch, { recursive: true, force: true })
})

function run(args, cwd = root) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })
}

// ---- 基础 ------------------------------------------------------------------

test('--help 打印用法退出 0；--version 打印 0.1.0', () => {
  const h = run(['--help'])
  assert.equal(h.status, 0)
  assert.match(h.stdout, /用法/)
  assert.match(h.stdout, /audit/)
  const v = run(['--version'])
  assert.equal(v.status, 0)
  assert.equal(v.stdout.trim(), '0.1.0')
})

// ---- audit -----------------------------------------------------------------

test('audit clean-stream：exit 0、淮、total 0', () => {
  const r = run(['audit', fx('clean-stream.jsonl')])
  assert.equal(r.status, 0)
  const report = JSON.parse(r.stdout)
  assert.equal(report.band, '淮')
  assert.equal(report.score.total, 0)
})

test('audit drift-stream：exit 1、枳、60 分、三族各一遗', () => {
  const r = run(['audit', fx('drift-stream.jsonl')])
  assert.equal(r.status, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.band, '枳')
  assert.equal(report.score.total, 60)
  assert.deepEqual(report.counts, { mutated: 3, restored: 0, exempted: 0, leftReside: 1, leftInst: 1, leftConf: 1 })
})

test('audit restored-stream：exit 0、三案全复', () => {
  const r = run(['audit', fx('restored-stream.jsonl'), '--json'])
  assert.equal(r.status, 0)
  const report = JSON.parse(r.stdout)
  assert.equal(report.counts.restored, 3)
  assert.equal(report.score.total, 0)
})

test('audit declared-stream 带 --file：册赦装驻、改 30 分 exit 1', () => {
  const r = run(['audit', fx('declared-stream.jsonl'), '--file', fx('shuitu-book.json')])
  assert.equal(r.status, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.total, 30)
  assert.equal(report.counts.exempted, 3)
})

test('audit declared-stream 无册照判：90 分 exit 1', () => {
  const r = run(['audit', fx('declared-stream.jsonl')])
  assert.equal(r.status, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.total, 90)
})

test('audit 旗标豁免与门禁翻转：--install npm → 45；--gate 70 → exit 0', () => {
  const a = run(['audit', fx('drift-stream.jsonl'), '--install', 'npm'])
  assert.equal(a.status, 1)
  assert.equal(JSON.parse(a.stdout).score.total, 45)
  const b = run(['audit', fx('drift-stream.jsonl'), '--gate', '70'])
  assert.equal(b.status, 0)
  assert.equal(JSON.parse(b.stdout).verdict, 'pass')
})

test('audit 中带可达：mixed --reside redis,nohup --install npm → 15 移 exit 0', () => {
  const r = run(['audit', fx('mixed-stream.jsonl'), '--reside', 'redis,nohup', '--install', 'npm'])
  assert.equal(r.status, 0)
  const report = JSON.parse(r.stdout)
  assert.equal(report.band, '移')
  assert.equal(report.score.total, 15)
})

test('audit 多流合审：漂移流 + 复位流 → 全复 0 分', () => {
  const drift = readFileSync(fx('drift-stream.jsonl'), 'utf8')
  const restore = '{"type":"tool_call","id":"x1","name":"bash","args":{"command":"brew services stop redis"}}\n' +
    '{"type":"tool_result","id":"x1","isError":false}\n' +
    '{"type":"tool_call","id":"x2","name":"bash","args":{"command":"npm uninstall -g nodemon"}}\n' +
    '{"type":"tool_result","id":"x2","isError":false}\n' +
    '{"type":"tool_call","id":"x3","name":"bash","args":{"command":"git config --global --unset user.email"}}\n' +
    '{"type":"tool_result","id":"x3","isError":false}\n'
  const a = join(scratch, 'drift.jsonl')
  const b = join(scratch, 'heal.jsonl')
  writeFileSync(a, drift)
  writeFileSync(b, restore)
  const r = run(['audit', a, b])
  assert.equal(r.status, 0)
  const report = JSON.parse(r.stdout)
  assert.equal(report.counts.restored, 3)
  assert.equal(report.score.total, 0)
})

test('audit 输入错误：流缺失 / 坏 JSON 行 / 无流文件 / 未知旗标 → exit 2', () => {
  assert.equal(run(['audit', join(scratch, 'missing.jsonl')]).status, 2)
  const bad = join(scratch, 'bad.jsonl')
  writeFileSync(bad, '{"type":"tool_call"}\n不是json\n')
  assert.equal(run(['audit', bad]).status, 2)
  assert.equal(run(['audit']).status, 2)
  assert.equal(run(['audit', fx('clean-stream.jsonl'), '--bogus']).status, 2)
})

// ---- register / revoke / list ---------------------------------------------

test('register 立册、list 阅册、revoke 销名', () => {
  const reg = run(['register', '--install', 'npm,brew', '--reside', 'redis', '--file', bookPath])
  assert.equal(reg.status, 0)
  assert.match(reg.stdout, /土册已更新/)
  const list = run(['list', '--file', bookPath])
  assert.equal(list.status, 0)
  const { book, entries } = JSON.parse(list.stdout)
  assert.equal(entries, 3)
  assert.deepEqual(book.install, ['npm', 'brew'])
  const rev = run(['revoke', '--install', 'npm', '--file', bookPath])
  assert.equal(rev.status, 0)
  const after = JSON.parse(run(['list', '--file', bookPath]).stdout)
  assert.deepEqual(after.book.install, ['brew'])
})

test('register 全空参 / revoke 无此名 / list 与 block 册缺失 → exit 2', () => {
  assert.equal(run(['register', '--file', join(scratch, 'x.json')]).status, 2)
  assert.equal(run(['revoke', '--install', 'nope', '--file', bookPath]).status, 2)
  assert.equal(run(['list', '--file', join(scratch, 'none.json')]).status, 2)
  assert.equal(run(['block', '--file', join(scratch, 'none.json')]).status, 2)
})

// ---- block（A5：逐字节确定） ----------------------------------------------

test('block：同一土册两次渲染逐字节相同；增 reside 豁免词后文本改变；全缺省确定性文本', () => {
  const reg = run(['register', '--config', 'user.email', '--file', bookPath])
  assert.equal(reg.status, 0)
  const b1 = run(['block', '--file', bookPath])
  assert.equal(b1.status, 0)
  const b2 = run(['block', '--file', bookPath])
  assert.equal(b1.stdout, b2.stdout)
  assert.match(b1.stdout, /【水土 · 土牌】/)
  assert.match(b1.stdout, /本块由确定性规则生成/)
  const reg2 = run(['register', '--reside', 'crontab', '--file', bookPath])
  assert.equal(reg2.status, 0)
  const b3 = run(['block', '--file', bookPath])
  assert.notEqual(b1.stdout, b3.stdout)
  assert.match(b3.stdout, /reside crontab/)
  const bare1 = run(['block', '--file', join(scratch, 'bare1.json')])
  assert.equal(bare1.status, 2) // block 需要已立之册
  const emptyBook = join(scratch, 'empty.json')
  writeFileSync(emptyBook, '{ "version": 1, "install": [], "config": [], "reside": [] }')
  const bare = run(['block', '--file', emptyBook])
  assert.equal(bare.status, 0)
  assert.match(bare.stdout, /土册：install 0 条 · config 0 条 · reside 0 条/)
})

// ---- gate ------------------------------------------------------------------

test('gate：--value 30 ≥ 默认门 exit 1；--value 29 exit 0；--value 45 --gate 50 exit 0', () => {
  const a = run(['gate', '--value', '30'])
  assert.equal(a.status, 1)
  assert.equal(JSON.parse(a.stdout).band, '枳')
  const b = run(['gate', '--value', '29'])
  assert.equal(b.status, 0)
  assert.equal(JSON.parse(b.stdout).band, '移')
  const c = run(['gate', '--value', '45', '--gate', '50'])
  assert.equal(c.status, 0)
  const d = run(['gate'])
  assert.equal(d.status, 2)
})
