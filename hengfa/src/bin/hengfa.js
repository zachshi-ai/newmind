#!/usr/bin/env node
/**
 * 恒法 CLI —— 零依赖规矩源审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   hengfa audit <s1.jsonl> [s2.jsonl …] [--file <典册>] [--gate n] [--json]
 *   hengfa register --path <glob> [--file <典册>]      立门（开门授权，重复去重）
 *   hengfa revoke --path <glob> [--file <典册>]        销门
 *   hengfa list [--file <典册>]
 *   hengfa block [--file <典册>]
 *   hengfa gate --value <n> [--gate n]
 *   hengfa --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册照判：audit 不带 --file 或默认册缺失时 open 为空——无册 = 全护（规矩是仓库的公共物，
 * 授权只能来自册；生法者君）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT, bandOf } from '../core/anjuan.js'
import { emptyBook, parseBook, registerPath, revokePath, serializeBook, bookCount } from '../core/diance.js'
import { renderFabai } from '../core/fabai.js'

const VERSION = '0.1.0'

const USAGE = `恒法 · hengfa —— DeepSeek Harness 规矩源恒典层的离线 CLI（法者不可不恒，生法者君）

用法:
  hengfa audit <s1.jsonl> [s2.jsonl …] [选项]     审法（典形改典 → 法值 + 分带 + 门禁）
  hengfa register --path <glob> [选项]            立门（开门授权，重复去重）
  hengfa revoke --path <glob> [选项]              销门
  hengfa list [选项]                              阅册（典册 JSON）
  hengfa block [选项]                             法牌块（典形与典册公示，逐字节确定）
  hengfa gate --value <n> [选项]                  门禁裁决
  hengfa --help | --version

选项:
  --file <path>      典册文件（默认 ./.hengfa.json；缺失时 audit 无册全护）
  --path <glob>      开门径（register/revoke 可用；* 跨目录）
  --gate <n>         法值阈门（默认 ${GATE_DEFAULT}：≥30 为「篡」，退出码 1）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`hengfa: ${message}`)
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
  if (idx === -1) return resolve(process.cwd(), '.hengfa.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadBook(args, { required }) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`典册不存在: ${path}（list 需要已立之册；audit 无册全护）`)
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

  if (command === 'register') {
    const glob = valueArg(args, '--path')
    if (!glob) fail('register 需要 --path <glob>')
    const { path, book } = loadBook(args, { required: false })
    const next = book ?? emptyBook() // 开门是授权，空册 = 全护——册缺失自动建册
    const { added } = registerPath(next, glob)
    saveBook(path, next)
    console.log(`典册已更新: ${path}（${added ? '立门' : '已门，去重'} ${glob}；开门 ${next.open.length} 径）`)
    return
  }

  if (command === 'revoke') {
    const glob = valueArg(args, '--path')
    if (!glob) fail('revoke 需要 --path <glob>')
    const { path, book } = loadBook(args, { required: true })
    const next = revokePath(book, glob)
    if (!next) fail(`典册无此门: ${glob}`)
    saveBook(path, next)
    console.log(`典册已更新: ${path}（销门 ${glob}；余开门 ${next.open.length} 径）`)
    return
  }

  if (command === 'list') {
    const { path, book } = loadBook(args, { required: true })
    emit({ file: path, entries: bookCount(book), book }, json)
    return
  }

  if (command === 'block') {
    const { book } = loadBook(args, { required: false })
    console.log(renderFabai(book))
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
