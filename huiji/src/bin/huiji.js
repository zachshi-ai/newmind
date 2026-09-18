#!/usr/bin/env node
/**
 * 讳疾 CLI —— 零依赖红上宣绿审计器（多流离线合审，可验尸任何历史会话）。
 *
 *   huiji audit <s1.jsonl> [s2.jsonl …] [--file <痊册>] [--gate n] [--json]
 *   huiji register --path <glob> [--file <痊册>]           立免审（重复去重）
 *   huiji revoke --path <glob> [--file <痊册>]
 *   huiji list [--file <痊册>]
 *   huiji block [--file <痊册>]
 *   huiji gate --value <n> [--gate n]
 *   huiji --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册照判：audit 不带 --file 或默认册缺失时 allow 为空——凡愈必痊
 * （痊愈之验不挑文件；君有疾在腠理，不治将恐深——桓侯曰：寡人无疾）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT, bandOf } from '../core/jizhang.js'
import { emptyBook, parseBook, registerEntry, revokeEntry, serializeBook, bookCount } from '../core/quance.js'
import { renderJipai } from '../core/jipai.js'

const VERSION = '0.1.0'

const USAGE = `讳疾 · huiji —— DeepSeek Harness 红上宣绿治理的离线 CLI（君有疾在腠理，不治将恐深）

用法:
  huiji audit <s1.jsonl> [s2.jsonl …] [选项]     审痊愈（愈形×检形×疾痊两通道 → 疾值 + 分带 + 门禁）
  huiji register --path <glob> [选项]            立免审（推演/草稿性质之稿，重复去重）
  huiji revoke --path <glob> [选项]
  huiji list [选项]                              阅册（痊册 JSON）
  huiji block [选项]                             疾牌块（痊册与词法公示，逐字节确定）
  huiji gate --value <n> [选项]                  门禁裁决
  huiji --help | --version

选项:
  --file <path>      痊册文件（默认 ./.huiji.json；缺失时 audit 无册全账）
  --path <glob>      免审径（register/revoke 可用；* 跨目录）
  --gate <n>         疾值阈门（默认 ${GATE_DEFAULT}：≥30 为「疾」，退出码 1）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`huiji: ${message}`)
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
  if (idx === -1) return resolve(process.cwd(), '.huiji.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要值')
  return resolve(process.cwd(), v)
}

function loadBook(args, { required = false } = {}) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`痊册不存在: ${path}`)
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
    console.log(`会话 ${res.sessions} · 调用 ${res.calls} · 受审稿 ${res.paths}（${res.rows} 愈行）`)
    console.log(`案账：讳案 ${res.counts.hui} · 已痊 ${res.counts.yu} · 泛愈 ${res.counts.fy} · 迟痊 ${res.counts.zhi}`)
    console.log(`疾值 ${res.score.total}（ji ${res.score.ji}）· 带「${res.band}」· 门 ${res.gate} → ${res.verdict === 'pass' ? '过' : '红'}`)
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
  console.log(renderJipai(book, { counts: { hui: 0, yu: 0, fy: 0, zhi: 0 }, issues: ['痊愈有据 ×0 稿 0 愈行 —— 凡愈必痊，汤熨之所及'] }))
}

function cmdGate(args) {
  const v = valueArg(args, ['--value'])
  if (v === undefined) fail('gate 需要 --value <n>')
  const value = Number(v.value)
  if (!Number.isFinite(value) || value < 0) fail(`--value 需要非负数字: ${v.value}`)
  const gate = gateValue(args) ?? GATE_DEFAULT
  const pass = value < gate
  console.log(`疾值 ${value} · 带「${bandOf(value)}」· 门 ${gate} → ${pass ? '过' : '红'}`)
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
