/**
 * CLI 测试 —— template / charter / exam / prescribe / lexicon 的退出码语义、
 * 选项生效性（--gate / --cwd / --lexicon / --json）与输出形态。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { validateCharter } from '../src/core/charter.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BIN = join(root, 'src', 'bin', 'weibing.js')
const fixtures = join(root, 'fixtures')

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: root, ...opts })
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' }
}

const jsonOut = (r) => JSON.parse(r.out)

test('CLI：--help 与 --version', () => {
  const h = run(['--help'])
  assert.equal(h.code, 0)
  assert.match(h.out, /用法/)
  assert.match(h.out, /weibing exam/)
  const v = run(['--version'])
  assert.equal(v.code, 0)
  assert.match(v.out, /weibing v/)
})

test('CLI：template 输出自洽的 charter 骨架', () => {
  const r = run(['template'])
  assert.equal(r.code, 0)
  const v = validateCharter(jsonOut(r))
  assert.equal(v.valid, true, JSON.stringify(v.issues))
})

test('CLI：charter 合法 → 0 并回显 id 与 brief 首行', () => {
  const r = run(['charter', join(fixtures, 'clean-charter.json')])
  assert.equal(r.code, 0)
  const j = jsonOut(r)
  assert.equal(j.valid, true)
  assert.equal(j.charter, 't-clean')
  assert.match(j.brief, /报告标题/)
})

test('CLI：charter 非法 schema / 坏 JSON / 缺文件 → 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weibing-cli-'))
  try {
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, JSON.stringify({ version: 9, id: 'x', brief: 'y' }))
    assert.equal(run(['charter', bad]).code, 2)
    const broken = join(dir, 'broken.json')
    writeFileSync(broken, '{ not json')
    assert.equal(run(['charter', broken]).code, 2)
    assert.equal(run(['charter', join(dir, 'nope.json')]).code, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI：exam 全清 charter → 0、病值 0（安）、探针全实测', () => {
  const r = run(['exam', join(fixtures, 'clean-charter.json'), '--cwd', fixtures])
  assert.equal(r.code, 0)
  const j = jsonOut(r)
  assert.equal(j.score, 0)
  assert.equal(j.band, '安')
  assert.equal(j.verdict, 'pass')
  assert.equal(j.ok, true)
  assert.equal(j.probes.unprobed, 0)
  assert.ok(j.probes.probed >= 4, `artifact+命令+文件+工具 四类探针，实际 ${j.probes.probed}`)
})

test('CLI：exam 重病 charter → 1、病值 100（病）；--gate 150 放行 → 0', () => {
  const r = run(['exam', join(fixtures, 'sick-charter.json')])
  assert.equal(r.code, 1)
  const j = jsonOut(r)
  assert.equal(j.score, 100)
  assert.equal(j.band, '病')
  assert.equal(j.verdict, 'fail')
  const relaxed = run(['exam', join(fixtures, 'sick-charter.json'), '--gate', '150'])
  assert.equal(relaxed.code, 0)
  assert.equal(jsonOut(relaxed).verdict, 'pass')
})

test('CLI：exam 萌级 charter → 0（诊而不拦）且险兆逐条在案', () => {
  const r = run(['exam', join(fixtures, 'warning-charter.json'), '--cwd', fixtures])
  assert.equal(r.code, 0)
  const j = jsonOut(r)
  assert.equal(j.score, 20)
  assert.equal(j.band, '萌')
  assert.deepEqual(j.omens.map((o) => o.token), ['彻底', '任何', '完善', '看看'], '险兆按词表内序，非 brief 出现序')
})

test('CLI：exam --json 紧凑输出可解析；非法输入 → 2', () => {
  const r = run(['exam', join(fixtures, 'clean-charter.json'), '--cwd', fixtures, '--json'])
  assert.equal(r.code, 0)
  const line = r.out.trim()
  assert.equal(line.includes('\n'), false, '紧凑输出应为单行')
  assert.equal(jsonOut({ out: line }).score, 0)
  assert.equal(run(['exam', join(fixtures, 'sick-charter.json'), '--unknown-flag']).code, 2)
  assert.equal(run(['exam']).code, 2)
})

test('CLI：exam --lexicon 追加词表生效（内置词表不受影响）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weibing-cli-'))
  try {
    const c = join(dir, 'c.json')
    writeFileSync(c, JSON.stringify({
      version: 1, id: 't-lex',
      brief: '帮我把这个模块打磨得更好，然后看看文档',
      scope: { allowRoots: ['src/'] },
      acceptance: [{ ref: 'a1', name: 'bash', argsContains: 'node --version' }],
      stop: { maxSteps: 10 },
    }))
    const r = run(['exam', c, '--lexicon', join(fixtures, 'custom-lexicon.json')])
    assert.equal(r.code, 0)
    const j = jsonOut(r)
    const tokens = j.omens.map((o) => o.token)
    assert.ok(tokens.includes('打磨'), '自定义词表命中')
    assert.ok(tokens.includes('看看'), '内置词表仍在')
    assert.equal(tokens.includes('一律'), false, 'brief 未含则不报')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI：prescribe 全清 → 纯文本以「未病。可以开工。」收尾；--json 包装', () => {
  const r = run(['prescribe', join(fixtures, 'clean-charter.json'), '--cwd', fixtures])
  assert.equal(r.code, 0)
  assert.match(r.out, /【治未病 · pre-flight】#t-clean/)
  assert.match(r.out, /未病。可以开工。/)
  const j = jsonOut(run(['prescribe', join(fixtures, 'clean-charter.json'), '--cwd', fixtures, '--json']))
  assert.equal(typeof j.text, 'string')
  assert.match(j.text, /未病。可以开工。/)
})

test('CLI：prescribe 重病逐字节确定（两次运行输出相同）', () => {
  const a = run(['prescribe', join(fixtures, 'sick-charter.json')]).out
  const b = run(['prescribe', join(fixtures, 'sick-charter.json')]).out
  assert.equal(a, b)
  assert.match(a, /W1 无验 \+45/)
  assert.match(a, /W2 无界 \+45/)
  assert.match(a, /W3 无止 \+30/)
  assert.match(a, /传变 3：/)
})

test('CLI：lexicon 输出生效词表，--lexicon 合并追加', () => {
  const base = jsonOut(run(['lexicon']))
  assert.ok(base.unbounded.includes('所有'))
  assert.ok(base.vague.includes('优化'))
  const merged = jsonOut(run(['lexicon', '--lexicon', join(fixtures, 'custom-lexicon.json')]))
  assert.ok(merged.unbounded.includes('一律'))
  assert.ok(merged.unbounded.includes('所有'))
  assert.ok(merged.vague.includes('打磨'))
  assert.equal(merged.unbounded.length, base.unbounded.length + 2)
})

test('CLI：未知命令与缺参数 → 2', () => {
  assert.equal(run(['flying']).code, 2)
  assert.equal(run([]).code, 2)
  assert.equal(run(['prescribe']).code, 2)
})
