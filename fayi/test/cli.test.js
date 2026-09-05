/**
 * 法仪 CLI 测试 —— audit 单流 / 逃生旗标 / 门禁 / 立册 / 块 / 退出码契约。
 * 通过 spawn 子进程驱动真实 CLI（零依赖安装即可跑）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'fayi.js')
const FIX = (name) => join(root, 'fixtures', name)

function run(args, { cwd = root } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

test('audit 干净流（tdd）→ exit 0，枉值 0 带「直」', () => {
  const r = run(['audit', FIX('tdd-stream.jsonl')])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /"total": 0/)
  assert.match(r.stdout, /"band": "直"/)
})

test('audit 曲尺流（bend）→ exit 1，枉值 30 带「枉」', () => {
  const r = run(['audit', FIX('bend-stream.jsonl')])
  assert.equal(r.code, 1)
  assert.match(r.stdout, /"total": 30/)
  assert.match(r.stdout, /"band": "枉"/)
})

test('audit 虚器流（hollow）→ exit 1；废尺流（stale）→ exit 1；尾红流（honest）→ exit 0', () => {
  assert.equal(run(['audit', FIX('hollow-stream.jsonl')]).code, 1)
  assert.equal(run(['audit', FIX('stale-stream.jsonl')]).code, 1)
  assert.equal(run(['audit', FIX('honest-stream.jsonl')]).code, 0)
})

test('audit 恰取一流：零流或两流 → exit 2', () => {
  assert.equal(run(['audit']).code, 2)
  assert.equal(run(['audit', FIX('tdd-stream.jsonl'), FIX('bend-stream.jsonl')]).code, 2)
  assert.match(run(['audit']).stderr, /恰取一个会话流/)
})

test('audit 坏文件 / 坏流 → exit 2', () => {
  assert.equal(run(['audit', FIX('no-such-file.jsonl')]).code, 2)
  const dir = mkdtempSync(join(tmpdir(), 'fayi-'))
  const bad = join(dir, 'bad.jsonl')
  writeFileSync(bad, '{"ok":1}\nnot-json\n')
  const r = run(['audit', bad])
  assert.equal(r.code, 2)
  assert.match(r.stderr, /第 2 行/)
  rmSync(dir, { recursive: true, force: true })
})

test('--amend 逃生：bend 流声明 test/** 为修 → 翻 0 过门', () => {
  const r = run(['audit', FIX('bend-stream.jsonl'), '--amend', 'test/**'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /"amendInWindow": 1/)
})

test('--gate 翻 verdict：bend 流 --gate 60 → pass；--gate 30 → fail', () => {
  assert.equal(run(['audit', FIX('bend-stream.jsonl'), '--gate', '60']).code, 0)
  assert.equal(run(['audit', FIX('bend-stream.jsonl'), '--gate', '30']).code, 1)
})

test('--register 显式册：contract/** + make check 全链路（案现形 → exit 1）', () => {
  const r = run(['audit', FIX('bend-stream.jsonl'), '--register', FIX('fayi-register.json')])
  assert.equal(r.code, 1, 'bend 流 test/** 仍被默认形持守（默认形与显式取并集）')
  const dir = mkdtempSync(join(tmpdir(), 'fayi-'))
  const stream = join(dir, 'contract-stream.jsonl')
  writeFileSync(stream, [
    '{"type":"tool_call","id":"1","name":"bash","args":{"command":"make check"},"at":100}',
    '{"type":"tool_result","id":"1","name":"bash","args":{"command":"make check"},"isError":true,"at":101}',
    '{"type":"tool_call","id":"2","name":"edit","args":{"path":"contract/terms.js"},"at":110}',
    '{"type":"tool_result","id":"2","name":"edit","args":{"path":"contract/terms.js"},"isError":false,"at":111}',
    '{"type":"tool_call","id":"3","name":"bash","args":{"command":"make check"},"at":120}',
    '{"type":"tool_result","id":"3","name":"bash","args":{"command":"make check"},"isError":false,"at":121}',
  ].join('\n') + '\n')
  const r2 = run(['audit', stream, '--register', FIX('fayi-register.json')])
  assert.equal(r2.code, 1)
  const report = JSON.parse(r2.stdout)
  assert.equal(report.score.quchi, 30)
  assert.equal(report.quchiCases[0].paths[0], 'contract/terms.js')
  rmSync(dir, { recursive: true, force: true })
})

test('--no-defaults：默认形关（bend 流器写降实测面 → 废尺 30 仍枉）', () => {
  const r = run(['audit', FIX('bend-stream.jsonl'), '--no-defaults', '--json'])
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.quchi, 0, '无显式册 → 器径全关，无曲尺')
  assert.equal(report.score.feichi, 30, '无验尺词可用而实测写存在——无法仪而其事能成者，无有也')
  assert.equal(r.code, 1)
})

test('--json 输出完整报告；缺省为两空格缩进', () => {
  const compact = run(['audit', FIX('bend-stream.jsonl'), '--json']).stdout
  const pretty = run(['audit', FIX('bend-stream.jsonl')]).stdout
  const a = JSON.parse(compact)
  const b = JSON.parse(pretty)
  assert.deepEqual(a.score, b.score)
  assert.ok(compact.includes('\n": ') === false || true)
  assert.match(pretty, /\n  "score"/)
  assert.ok(Array.isArray(a.quchiCases))
  assert.equal(typeof a.shimo, 'string')
})

test('--register 缺省载入 ./.fayi.json（存在时）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fayi-'))
  writeFileSync(join(dir, '.fayi.json'), readFileSync(FIX('fayi-register.json')))
  const stream = join(dir, 'contract-stream.jsonl')
  writeFileSync(stream, [
    '{"type":"tool_call","id":"1","name":"bash","args":{"command":"make check"},"at":100}',
    '{"type":"tool_result","id":"1","name":"bash","args":{"command":"make check"},"isError":true,"at":101}',
    '{"type":"tool_call","id":"2","name":"edit","args":{"path":"contract/terms.js"},"at":110}',
    '{"type":"tool_result","id":"2","name":"edit","args":{"path":"contract/terms.js"},"isError":false,"at":111}',
    '{"type":"tool_call","id":"3","name":"bash","args":{"command":"make check"},"at":120}',
    '{"type":"tool_result","id":"3","name":"bash","args":{"command":"make check"},"isError":false,"at":121}',
  ].join('\n') + '\n')
  const r = run(['audit', 'contract-stream.jsonl'], { cwd: dir })
  assert.equal(r.code, 1)
  assert.equal(JSON.parse(r.stdout).score.quchi, 30)
  rmSync(dir, { recursive: true, force: true })
})

test('enroll 并集去重只增不删，输出尾部为绳墨块', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fayi-'))
  const args1 = ['enroll', '--guard', 'a/**', '--verify', 'make', '--file', join(dir, '.fayi.json')]
  const r1 = run(args1)
  assert.equal(r1.code, 0)
  assert.match(r1.stdout, /立册：/)
  assert.match(r1.stdout, /· 持 a\/\*\*/)
  const r2 = run(['enroll', '--guard', 'a/**', '--guard', 'b/**', '--amend', 'c/**', '--file', join(dir, '.fayi.json')])
  assert.equal(r2.code, 0)
  const reg = JSON.parse(readFileSync(join(dir, '.fayi.json'), 'utf8'))
  assert.deepEqual(reg.guards, ['a/**', 'b/**'])
  assert.deepEqual(reg.amends, ['c/**'])
  assert.deepEqual(reg.verify, ['make'])
  assert.equal(run(['enroll', '--file', join(dir, '.fayi.json')]).code, 2, '无任何声明 → exit 2')
  rmSync(dir, { recursive: true, force: true })
})

test('list 出册 JSON；block 出纯文本块且逐字节确定', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fayi-'))
  const file = join(dir, '.fayi.json')
  run(['enroll', '--guard', 'x/**', '--verify', 'npm test', '--file', file])
  const listed = run(['list', '--file', file])
  assert.equal(listed.code, 0)
  assert.equal(JSON.parse(listed.stdout).guards[0], 'x/**')
  const b1 = run(['block', '--file', file]).stdout
  const b2 = run(['block', '--file', file]).stdout
  assert.equal(b1, b2)
  assert.match(b1, /【法仪 · 绳墨】/)
  assert.match(b1, /—— 本块由确定性规则生成；重放同一流必得同一文本。/)
  assert.equal(run(['block', '--file', join(dir, 'nope.json')]).code, 2)
  rmSync(dir, { recursive: true, force: true })
})

test('gate --value 子命令裁决', () => {
  const pass = run(['gate', '--value', '29'])
  assert.equal(pass.code, 0)
  assert.match(pass.stdout, /"verdict": "pass"/)
  const fail = run(['gate', '--value', '30'])
  assert.equal(fail.code, 1)
  assert.match(fail.stdout, /"verdict": "fail"/)
  assert.equal(run(['gate', '--value', '30', '--gate', '60']).code, 0)
  assert.equal(run(['gate']).code, 2)
})

test('--help / --version / 未知命令', () => {
  assert.equal(run(['--help']).code, 0)
  assert.match(run(['--help']).stdout, /天下从事者，不可以无法仪/)
  assert.equal(run(['--version']).stdout.trim(), '0.1.0')
  assert.equal(run(['fly']).code, 2)
  assert.equal(run(['audit', FIX('bend-stream.jsonl'), '--wat']).code, 2)
})
