#!/usr/bin/env node
/**
 * 平准 CLI —— 零依赖命脉籍面审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   pingzhun audit <s1.jsonl> [s2.jsonl …] [--file <命籍>] [--gate n] [--json]
 *   pingzhun register --path <glob> [--file <命籍>]        立纳籍（重复去重）
 *   pingzhun register --form <basename> [--file <命籍>]    增籍形（重复去重）
 *   pingzhun revoke --path <glob> | --form <basename> [--file <命籍>]
 *   pingzhun list [--file <命籍>]
 *   pingzhun block [--file <命籍>]
 *   pingzhun gate --value <n> [--gate n]
 *   pingzhun --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册照判：audit 不带 --file 或默认册缺失时 admit 为空——无册 = 全账（籍面是
 * 仓库的公共命脉，纳籍授权只能来自册；平准则民不失职）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT, bandOf } from '../core/jizhang.js'
import { emptyBook, parseBook, registerEntry, revokeEntry, serializeBook, bookCount } from '../core/mingji.js'
import { renderZhunpai } from '../core/zhunpai.js'

const VERSION = '0.1.0'

const USAGE = `平准 · pingzhun —— DeepSeek Harness 命脉籍面治理的离线 CLI（平准则民不失职，非开利孔而为民罪梯）

用法:
  pingzhun audit <s1.jsonl> [s2.jsonl …] [选项]      审籍（籍面末文对旧本 → 准值 + 分带 + 门禁）
  pingzhun register --path <glob> [选项]             立纳籍（纳籍授权，重复去重）
  pingzhun register --form <basename> [选项]         增籍形（basename 全等，重复去重）
  pingzhun revoke --path <glob> | --form <basename> [选项]
  pingzhun list [选项]                               阅册（命籍 JSON）
  pingzhun block [选项]                              准牌块（籍形与命籍公示，逐字节确定）
  pingzhun gate --value <n> [选项]                   门禁裁决
  pingzhun --help | --version

选项:
  --file <path>      命籍文件（默认 ./.pingzhun.json；缺失时 audit 无册全账）
  --path <glob>      纳籍径（register/revoke 可用；* 跨目录）
  --form <basename>  增形名（register/revoke 可用；basename 全等）
  --gate <n>         准值阈门（默认 ${GATE_DEFAULT}：≥30 为「倾」，退出码 1）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`pingzhun: ${message}`)
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

function valueArg(args, names) {
  for (const name of names) {
    const idx = args.indexOf(name)
    if (idx === -1) continue
    const v = args[idx + 1]
    if (!v || v.startsWith('--')) fail(`${name} 需要值`)
    return { name, value: v }
  }
  return undefined
}

function registryPath(args) {
  const idx = args.indexOf('--file')
  if (idx === -1) return resolve(process.cwd(), '.pingzhun.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadBook(args, { required }) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`命籍不存在: ${path}（list 需要已立之册；audit 无册全账）`)
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
    const arg = valueArg(args, ['--path', '--form'])
    if (!arg) fail('register 需要 --path <glob>（立纳籍）或 --form <basename>（增籍形）')
    const column = arg.name === '--path' ? 'admit' : 'extra'
    const { path, book } = loadBook(args, { required: false })
    const next = book ?? emptyBook() // 纳籍是授权，空册 = 全账——册缺失自动建册
    const { added } = registerEntry(next, column, arg.value)
    saveBook(path, next)
    const counts = bookCount(next)
    const what = column === 'admit' ? '立纳籍' : '增籍形'
    console.log(`命籍已更新: ${path}（${added ? what : '已在册，去重'} ${arg.value}；纳籍 ${counts.admit} 径 · 增形 ${counts.extra} 形）`)
    return
  }

  if (command === 'revoke') {
    const arg = valueArg(args, ['--path', '--form'])
    if (!arg) fail('revoke 需要 --path <glob> 或 --form <basename>')
    const column = arg.name === '--path' ? 'admit' : 'extra'
    const { path, book } = loadBook(args, { required: true })
    const next = revokeEntry(book, column, arg.value)
    if (!next) fail(`命籍无此${column === 'admit' ? '纳籍' : '增形'}: ${arg.value}`)
    saveBook(path, next)
    const counts = bookCount(next)
    console.log(`命籍已更新: ${path}（销${column === 'admit' ? '纳籍' : '增形'} ${arg.value}；余纳籍 ${counts.admit} 径 · 增形 ${counts.extra} 形）`)
    return
  }

  if (command === 'list') {
    const { path, book } = loadBook(args, { required: true })
    emit({ file: path, entries: bookCount(book), book }, json)
    return
  }

  if (command === 'block') {
    const { book } = loadBook(args, { required: false })
    console.log(renderZhunpai(book))
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
