#!/usr/bin/env node
/**
 * 溯流 CLI —— 零依赖因果臆断审计器（多流离线合审，可验尸任何历史会话）。
 *
 *   suliu audit <s1.jsonl> [s2.jsonl …] [--file <臆册>] [--gate n] [--json]
 *   suliu register --path <glob> [--file <臆册>]           立免审（重复去重）
 *   suliu revoke --path <glob> [--file <臆册>]
 *   suliu list [--file <臆册>]
 *   suliu block [--file <臆册>]
 *   suliu gate --value <n> [--gate n]
 *   suliu --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册照判：audit 不带 --file 或默认册缺失时 excuse 为空——凡因必验
 * （归因之责不挑文件；但知其一，不知其二，可据理臆断欤？）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT, bandOf } from '../core/yanyin.js'
import { emptyBook, parseBook, registerEntry, revokeEntry, serializeBook, bookCount } from '../core/yice.js'
import { renderSupai } from '../core/supai.js'

const VERSION = '0.1.0'

const USAGE = `溯流 · suliu —— DeepSeek Harness 因果断言治理的离线 CLI（凡河中失石，当求之于上流）

用法:
  suliu audit <s1.jsonl> [s2.jsonl …] [选项]     审归因（归因形×因面×验因三通道 → 臆值 + 分带 + 门禁）
  suliu register --path <glob> [选项]            立免审（推演/草稿性质之稿，重复去重）
  suliu revoke --path <glob> [选项]
  suliu list [选项]                              阅册（臆册 JSON）
  suliu block [选项]                             溯牌块（臆册与词法公示，逐字节确定）
  suliu gate --value <n> [选项]                  门禁裁决
  suliu --help | --version

选项:
  --file <path>      臆册文件（默认 ./.suliu.json；缺失时 audit 无册全账）
  --path <glob>      免审径（register/revoke 可用；* 跨目录）
  --gate <n>         臆值阈门（默认 ${GATE_DEFAULT}：≥30 为「臆」，退出码 1）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`suliu: ${message}`)
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
  if (idx === -1) return resolve(process.cwd(), '.suliu.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要值')
  return resolve(process.cwd(), v)
}

function loadBook(args, { required = false } = {}) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`臆册不存在: ${path}`)
    return { path, book: null }
  }
  return { path, book: parseBook(readText(path)) }
}

function gateValue(args) {
  const v = valueArg(args, ['--gate'])
  if (v === undefined) return undefined
  const n = Number(v.value)
  if (!Number.isFinite(n) || n < 0) fail(`--gate 需要非负数字: ${v.value}`)
  return n
}

function cmdAudit(args) {
  const known = ['--file', '--gate', '--json']
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && !known.includes(args[i])) fail(`未知旗标: ${args[i]}`)
  }
  const { book } = loadBook(args)
  const gate = gateValue(args)
  const compact = args.includes('--json')
  const streams = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') { i++; continue } // 跳过 --file 与其值
    if (args[i] === '--gate') { i++; continue }
    if (args[i].startsWith('--')) continue
    streams.push(args[i])
  }
  if (streams.length === 0) fail('audit 需要至少一个会话流文件')
  let entries
  try {
    entries = streams.map((f) => ({ name: f, text: readText(f) }))
  } catch (error) {
    fail(error.message)
  }
  let res
  try {
    res = auditStreams(entries, { book, gate })
  } catch (error) {
    fail(error.message)
  }
  if (compact) {
    emit({ calls: res.calls, sessions: res.sessions, paths: res.paths, counts: res.counts, score: res.score, band: res.band, gate: res.gate, verdict: res.verdict, issues: res.issues }, true)
  } else {
    console.log(`会话 ${res.sessions} · 调用 ${res.calls} · 受审稿 ${res.paths}（${res.rows} 行）`)
    console.log(`案账：臆断 ${res.counts.yd} · 望断 ${res.counts.wd} · 显疑 ${res.counts.xy} · 迟验 ${res.counts.cy} · 泛因 ${res.counts.fy}`)
    console.log(`臆值 ${res.score.total}（yi ${res.score.yi} + wang ${res.score.wang}）· 带「${res.band}」· 门 ${res.gate} → ${res.verdict === 'pass' ? '过' : '红'}`)
    for (const issue of res.issues) console.log(issue)
  }
  process.exit(res.verdict === 'pass' ? 0 : 1)
}

function cmdRegister(args) {
  const v = valueArg(args, ['--path'])
  if (v === undefined) fail('register 需要 --path <glob>')
  const { path, book } = loadBook(args)
  const target = book ?? emptyBook()
  registerEntry(target, v.value)
  writeFileSync(path, serializeBook(target))
  console.log(`免审已立：${v.value}（${path}，共 ${bookCount(target)} 处）`)
}

function cmdRevoke(args) {
  const v = valueArg(args, ['--path'])
  if (v === undefined) fail('revoke 需要 --path <glob>')
  const { path, book } = loadBook(args, { required: true })
  try {
    revokeEntry(book, v.value)
  } catch (error) {
    fail(error.message)
  }
  writeFileSync(path, serializeBook(book))
  console.log(`免审已撤：${v.value}（共 ${bookCount(book)} 处）`)
}

function cmdList(args) {
  const { book } = loadBook(args, { required: true })
  emit(book, args.includes('--json'))
}

function cmdBlock(args) {
  const { book } = loadBook(args)
  console.log(renderSupai(book, { counts: { yd: 0, wd: 0, xy: 0, cy: 0, fy: 0 }, issues: ['因皆有验 ×0 稿 0 行 —— 凡因必验，动因验果'] }))
}

function cmdGate(args) {
  const v = valueArg(args, ['--value'])
  if (v === undefined) fail('gate 需要 --value <n>')
  const value = Number(v.value)
  if (!Number.isFinite(value) || value < 0) fail(`--value 需要非负数字: ${v.value}`)
  const gate = gateValue(args) ?? GATE_DEFAULT
  const pass = value < gate
  console.log(`臆值 ${value} · 带「${bandOf(value)}」· 门 ${gate} → ${pass ? '过' : '红'}`)
  process.exit(pass ? 0 : 1)
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv.includes('--help')) {
    console.log(USAGE)
    process.exit(0)
  }
  if (argv.includes('--version')) {
    console.log(VERSION)
    process.exit(0)
  }
  const cmd = argv[0]
  const rest = argv.slice(1)
  if (cmd === 'audit') cmdAudit(rest)
  else if (cmd === 'register') cmdRegister(rest)
  else if (cmd === 'revoke') cmdRevoke(rest)
  else if (cmd === 'list') cmdList(rest)
  else if (cmd === 'block') cmdBlock(rest)
  else if (cmd === 'gate') cmdGate(rest)
  else fail(`未知命令: ${cmd}（--help 阅用法）`)
}

main()
