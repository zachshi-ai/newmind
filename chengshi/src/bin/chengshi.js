#!/usr/bin/env node
/**
 * 成事 CLI —— 零依赖已遂重施审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   chengshi audit <s1.jsonl> [s2.jsonl …] [--file <遂册>] [--gate n] [--json]
 *   chengshi allow --key <glob> [--file <遂册>]     立允（允列授权，重复去重）
 *   chengshi disallow --key <glob> [--file <遂册>]  销允
 *   chengshi list [--file <遂册>]
 *   chengshi block [--file <遂册>]
 *   chengshi gate --value <n> [--gate n]
 *   chengshi --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册照判：audit 不带 --file 或默认册缺失时 allow 为空——无册照判（已遂是世界的
 * 公共事实，允列授权只能来自册；成事不说，遂事不谏）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT, bandOf } from '../core/suizhang.js'
import { emptyBook, parseBook, allowKey, disallowKey, serializeBook, bookCount } from '../core/suice.js'
import { renderSuipai } from '../core/suipai.js'

const VERSION = '0.1.0'

const USAGE = `成事 · chengshi —— DeepSeek Harness 已遂重施治理的离线 CLI（成事不说，遂事不谏）

用法:
  chengshi audit <s1.jsonl> [s2.jsonl …] [选项]     审遂（已遂之施 → 重值 + 分带 + 门禁）
  chengshi allow --key <glob> [选项]                立允（允列授权，重复去重）
  chengshi disallow --key <glob> [选项]             销允
  chengshi list [选项]                              阅册（遂册 JSON）
  chengshi block [选项]                             遂牌块（遂形与遂册公示，逐字节确定）
  chengshi gate --value <n> [选项]                  门禁裁决
  chengshi --help | --version

选项:
  --file <path>      遂册文件（默认 ./.chengshi.json；缺失时 audit 无册照判）
  --key <glob>       允列键（allow/disallow 可用；* 跨任意字符）
  --gate <n>         重值阈门（默认 ${GATE_DEFAULT}：≥30 为「叠」，退出码 1）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`chengshi: ${message}`)
  process.exit(code)
}

function emit(obj, compact) {
  console.log(JSON.stringify(obj, null, compact ? 0 : 2))
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    fail(`无法读取 ${path}: ${error.message}`)
  }
}

function valueArg(args, name) {
  const idx = args.indexOf(name)
  if (idx === -1) return undefined
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail(`${name} 需要值`)
  return v
}

function registryPath(args) {
  const idx = args.indexOf('--file')
  if (idx === -1) return resolve(process.cwd(), '.chengshi.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadBook(args, { required }) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`遂册不存在: ${path}（list 需要已立之册；audit 无册照判）`)
    return { path, book: null }
  }
  return { path, book: parseBook(readText(path)) }
}

function saveBook(path, book) {
  writeFileSync(path, serializeBook(book))
}

function gateValue(args) {
  const idx = args.indexOf('--gate')
  if (idx === -1) return undefined
  const v = Number(args[idx + 1])
  if (!Number.isFinite(v) || v < 1) fail('--gate 需要 ≥1 的数字')
  return v
}

function main() {
  const argv = process.argv.slice(2)
  const command = argv[0]
  const args = argv.slice(1)

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE)
    return
  }
  if (command === '--version' || command === '-v') {
    console.log(VERSION)
    return
  }

  const json = args.includes('--json')

  if (command === 'audit') {
    const flagsWithValues = new Set(['--file', '--gate'])
    // 剔除旗标与其值，只留流文件（--file/--gate 的值在其后一位）
    const streams = []
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (a === '--json') continue
      if (flagsWithValues.has(a)) {
        i++
        continue
      }
      if (a.startsWith('--')) fail(`未知旗标: ${a}`)
      streams.push(a)
    }
    if (!streams.length) fail('audit 需要至少一个会话流文件')
    const { book } = loadBook(args, { required: false })
    const entries = streams.map((f) => ({ name: f, text: readText(f) }))
    const report = auditStreams(entries, { book, gate: gateValue(args) })
    emit(report, json)
    process.exit(report.ok ? 0 : 1)
    return
  }

  if (command === 'allow') {
    const glob = valueArg(args, '--key')
    if (!glob) fail('allow 需要 --key <glob>')
    const { path, book } = loadBook(args, { required: false })
    const next = book ?? emptyBook() // 允列是授权，空册 = 全账——册缺失自动建册
    const { added } = allowKey(next, glob)
    saveBook(path, next)
    console.log(`遂册已更新: ${path}（${added ? '立允' : '已允，去重'} ${glob}；允列 ${next.allow.length} 键）`)
    return
  }

  if (command === 'disallow') {
    const glob = valueArg(args, '--key')
    if (!glob) fail('disallow 需要 --key <glob>')
    const { path, book } = loadBook(args, { required: true })
    const next = disallowKey(book, glob)
    if (!next) fail(`遂册无此允: ${glob}`)
    saveBook(path, next)
    console.log(`遂册已更新: ${path}（销允 ${glob}；余允列 ${next.allow.length} 键）`)
    return
  }

  if (command === 'list') {
    const { path, book } = loadBook(args, { required: true })
    emit({ file: path, entries: bookCount(book), book }, json)
    return
  }

  if (command === 'block') {
    const { book } = loadBook(args, { required: false })
    console.log(renderSuipai(book))
    return
  }

  if (command === 'gate') {
    const idx = args.indexOf('--value')
    if (idx === -1) fail('gate 需要 --value <n>')
    const value = Number(args[idx + 1])
    if (!Number.isFinite(value)) fail('--value 需要数字')
    const gate = gateValue(args) ?? GATE_DEFAULT
    const verdict = value >= gate ? 'fail' : 'pass'
    emit({ value, gate, band: bandOf(value), verdict, ok: verdict === 'pass' }, json)
    process.exit(verdict === 'pass' ? 0 : 1)
    return
  }

  fail(`未知命令: ${command}（--help 查看用法）`)
}

try {
  main()
} catch (error) {
  fail(error?.message ?? String(error), 2) // 坏 JSON 行 / 坏册等输入错误 → exit 2
}
