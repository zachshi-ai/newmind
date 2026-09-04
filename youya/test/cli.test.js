/**
 * 有涯 CLI 测试 —— audit / yaoji / gate 三命令的语义与退出码。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bin = join(here, '..', 'src', 'bin', 'youya.js')
const fixture = (name) => join(here, '..', 'fixtures', name)

function runCli(args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' })
}

test('CLI audit：fresh 夹具 → exit 0，殆值 0 新硎', () => {
  const r = runCli(['audit', fixture('fresh-stream.jsonl')])
  assert.equal(r.status, 0)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.total, 0)
  assert.equal(report.band, '新硎')
  assert.equal(report.verdict, 'pass')
})

test('CLI audit：hazy 夹具 → exit 0，殆值 20 割', () => {
  const r = runCli(['audit', fixture('hazy-stream.jsonl')])
  assert.equal(r.status, 0)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.total, 20)
  assert.equal(report.band, '割')
})

test('CLI audit：amnesiac 夹具 → exit 1，殆值 32 折 fail', () => {
  const r = runCli(['audit', fixture('amnesiac-stream.jsonl')])
  assert.equal(r.status, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.score.total, 32)
  assert.equal(report.band, '折')
  assert.equal(report.verdict, 'fail')
})

test('CLI audit：--gate 可翻转 verdict（32 的流对门 40 过、对门 15 红灯；20 的流对门 15 红灯）', () => {
  const a = runCli(['audit', fixture('amnesiac-stream.jsonl'), '--gate', '40'])
  assert.equal(a.status, 0, '32 < 40 → pass')
  assert.equal(JSON.parse(a.stdout).verdict, 'pass')
  const b = runCli(['audit', fixture('amnesiac-stream.jsonl'), '--gate', '15'])
  assert.equal(b.status, 1, '32 ≥ 15 → fail')
  const c = runCli(['audit', fixture('hazy-stream.jsonl'), '--gate', '15'])
  assert.equal(c.status, 1, '20 ≥ 15 → fail')
})

test('CLI audit：--json 输出单行紧凑 JSON，字段齐全', () => {
  const r = runCli(['audit', fixture('amnesiac-stream.jsonl'), '--json'])
  assert.equal(r.status, 1)
  const lines = r.stdout.trim().split('\n')
  assert.equal(lines.length, 1, '紧凑输出单行')
  const report = JSON.parse(lines[0])
  assert.equal(report.score.total, 32)
  assert.equal(report.counts.fujianCases, 2)
  assert.equal(report.sinsList.length, 5)
  assert.ok(Array.isArray(report.issues) && report.issues.length >= 2)
})

test('CLI audit：不存在的文件 → exit 2 + stderr 诊断', () => {
  const r = runCli(['audit', '/nowhere/none.jsonl'])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /无法读取/)
})

test('CLI audit：坏流 → exit 2，报行号', () => {
  const dir = mkdtempSync(join(tmpdir(), 'youya-cli-'))
  const bad = join(dir, 'bad.jsonl')
  writeFileSync(bad, '{"ok":1}\nbroken-line\n')
  const r = runCli(['audit', bad])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /第 2 行/)
})

test('CLI audit：缺流参数 → exit 2；未知命令 → exit 2；未知选项 → exit 2', () => {
  assert.equal(runCli(['audit']).status, 2)
  assert.equal(runCli(['nonsense']).status, 2)
  assert.equal(runCli(['audit', fixture('fresh-stream.jsonl'), '--bogus']).status, 2)
})

test('CLI yaoji：默认纯文本，#1、无陈账行、殆值行齐备', () => {
  const r = runCli(['yaoji', fixture('amnesiac-stream.jsonl')])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /【有涯 · 要籍】见闻账 #1/)
  assert.match(r.stdout, /（无陈账：见闻皆鲜，游刃有余。）/)
  assert.match(r.stdout, /殆值：32（折）｜ 门 30/)
})

test('CLI yaoji：--json 包装 {k, chen, text}；两次运行文本逐字节一致（只 #k 恒 1）', () => {
  const j = runCli(['yaoji', fixture('amnesiac-stream.jsonl'), '--json'])
  assert.equal(j.status, 0)
  const parsed = JSON.parse(j.stdout)
  assert.equal(parsed.k, 1)
  assert.equal(parsed.chen, 0)
  const a = runCli(['yaoji', fixture('amnesiac-stream.jsonl')])
  const b = runCli(['yaoji', fixture('amnesiac-stream.jsonl')])
  assert.equal(a.stdout, b.stdout, '重放同一流必得同一文本')
})

test('CLI yaoji：陈账样例流列出账序行', () => {
  const dir = mkdtempSync(join(tmpdir(), 'youya-cli-'))
  const stream = join(dir, 'chen.jsonl')
  const lines = ['{"type":"tool_call","id":"c0","name":"read","args":{"path":"old.js"}}']
  lines.push('{"type":"tool_result","id":"c0","isError":false}')
  for (let i = 0; i < 40; i++) {
    lines.push(`{"type":"tool_call","id":"c${i + 1}","name":"read","args":{"path":"f${i}.js"}}`)
    lines.push(`{"type":"tool_result","id":"c${i + 1}","isError":false}`)
  }
  writeFileSync(stream, lines.join('\n') + '\n')
  const r = runCli(['yaoji', stream])
  assert.match(r.stdout, /1\. p:old\.js ｜ 末见闻第1调用 ｜ 已隔40调 ｜ 其间无写/)
})

test('CLI gate：--value 20 对默认门 30 → pass；30 → fail（边界逐点）', () => {
  const a = runCli(['gate', '--value', '20'])
  assert.equal(a.status, 0)
  assert.equal(JSON.parse(a.stdout).verdict, 'pass')
  const b = runCli(['gate', '--value', '30'])
  assert.equal(b.status, 1)
  assert.equal(JSON.parse(b.stdout).verdict, 'fail')
  const c = runCli(['gate', '--value', '29', '--gate', '30'])
  assert.equal(c.status, 0)
  const d = runCli(['gate', '--value', '30', '--gate', '30'])
  assert.equal(d.status, 1)
})

test('CLI yaoji：fresh 夹具 → 殆值 0（新硎）、路径与命令计数', () => {
  const r = runCli(['yaoji', fixture('fresh-stream.jsonl')])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /工作集：路径 3 ｜ 命令 1 ｜ 复见 0 案 ｜ 复命 0 案/)
  assert.match(r.stdout, /殆值：0（新硎）｜ 门 30/)
})

test('CLI gate：缺 --value → exit 2', () => {
  assert.equal(runCli(['gate']).status, 2)
})

test('CLI --help 显示用法；--version 输出版本', () => {
  const h = runCli(['--help'])
  assert.equal(h.status, 0)
  assert.match(h.stdout, /用法/)
  assert.match(h.stdout, /audit/)
  const v = runCli(['--version'])
  assert.equal(v.status, 0)
  assert.match(v.stdout.trim(), /^\d+\.\d+\.\d+$/)
})
