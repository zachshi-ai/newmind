#!/usr/bin/env node
/**
 * 安澜 CLI —— 零依赖响应性施治审计器（多流离线合审，可验尸任何历史会话）。
 *
 *   anlan audit <s1.jsonl> [s2.jsonl …] [--file <澜册>] [--gate n] [--json]
 *   anlan register --spare <对象> | --forms <形> | --no-defaults [--file <澜册>]
 *   anlan revoke --spare <对象> [--file <澜册>]
 *   anlan list [--file <澜册>]
 *   anlan block [--file <澜册>]
 *   anlan gate --value <n> [--gate n]
 *   anlan --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册照判：audit 不带 --file 或默认册缺失时 spare 为空——凡荡必审
 * （波动之验不挑对象；波不皆信号，治必对波——叠三搅二即荡，风浪还给系统）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT, bandOf } from '../core/bozhang.js'
import { emptyBook, parseBook, registerSpare, revokeSpare, registerForm, setNoDefaults, serializeBook, bookCount } from '../core/lance.js'
import { renderDangpai } from '../core/dangpai.js'

const VERSION = '0.1.0'

const USAGE = `安澜 · anlan —— DeepSeek Harness 响应性施治治理的离线 CLI（波不皆信号，治必对波）

用法:
  anlan audit <s1.jsonl> [s2.jsonl …] [选项]     审振荡（波账×搅笔×叠数搅窗 → 荡值 + 分带 + 门禁）
  anlan register --spare <对象> [选项]           豁对象（波动已知之名分，重复去重）
  anlan register --forms <形> [选项]             增诊形
  anlan register --no-defaults [选项]            关默认诊形表
  anlan revoke --spare <对象> [选项]
  anlan list [选项]                              阅册（澜册 JSON）
  anlan block [选项]                             荡牌块（澜册与词法公示，逐字节确定）
  anlan gate --value <n> [选项]                  门禁裁决
  anlan --help | --version

选项:
  --file <path>      澜册文件（默认 ./.anlan.json；缺失时 audit 无册全账）
  --spare <对象>     豁免对象词元（register/revoke 可用；小写全等）
  --forms <形>       增诊形（register 可用）
  --no-defaults      关默认诊形表（register 可用）
  --gate <n>         荡值阈门（默认 ${GATE_DEFAULT}：≥30 为「荡」，退出码 1）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`anlan: ${message}`)
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
  if (idx === -1) return resolve(process.cwd(), '.anlan.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要值')
  return resolve(process.cwd(), v)
}

function loadBook(args, { required = false } = {}) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`澜册不存在: ${path}`)
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
    emit({ calls: res.calls, sessions: res.sessions, objects: res.objects, counts: res.counts, score: res.score, band: res.band, gate: res.gate, verdict: res.verdict, issues: res.issues }, true)
  } else {
    console.log(`会话 ${res.sessions} · 调用 ${res.calls} · 在场对象 ${res.objects}（顺 ${res.counts.zhen} · 逆 ${res.counts.ni} · 搅 ${res.counts.jiao}）`)
    console.log(`案账：荡案 ${res.counts.dang} · 风浪 ${res.counts.feng}`)
    console.log(`荡值 ${res.score.total}（案 ${res.counts.dang}）· 带「${res.band}」· 门 ${res.gate} → ${res.verdict === 'pass' ? '过' : '红'}`)
    for (const issue of res.issues) console.log(issue)
  }
  process.exit(res.verdict === 'pass' ? 0 : 1)
}

function cmdRegister(args) {
  const spare = valueArg(args, ['--spare'])
  const form = valueArg(args, ['--forms'])
  const noDefaults = args.includes('--no-defaults')
  if (!spare && !form && !noDefaults) fail('register 需要 --spare <对象> / --forms <形> / --no-defaults 至少其一')
  const { path, book } = loadBook(args)
  const target = book ?? emptyBook()
  if (spare) registerSpare(target, spare.value)
  if (form) registerForm(target, form.value)
  if (noDefaults) setNoDefaults(target)
  writeFileSync(path, serializeBook(target))
  console.log(`澜册已立：${spare ? `豁免 ${spare.value} ` : ''}${form ? `增形 ${form.value} ` : ''}${noDefaults ? '默认诊形关 ' : ''}（${path}，共 ${bookCount(target)} 处）`)
}

function cmdRevoke(args) {
  const v = valueArg(args, ['--spare'])
  if (v === undefined) fail('revoke 需要 --spare <对象>')
  const { path, book } = loadBook(args, { required: true })
  try {
    revokeSpare(book, v.value)
  } catch (error) {
    fail(error.message)
  }
  writeFileSync(path, serializeBook(book))
  console.log(`豁免已撤：${v.value}（共 ${bookCount(book)} 处）`)
}

function cmdList(args) {
  const { book } = loadBook(args, { required: true })
  emit(book, args.includes('--json'))
}

function cmdBlock(args) {
  const { book } = loadBook(args)
  console.log(renderDangpai(book, { counts: { dang: 0, feng: 0, zhen: 0, ni: 0, jiao: 0 }, issues: ['波平浪静 ×0 对象 —— 凡荡必审，守准者无罪'] }))
}

function cmdGate(args) {
  const v = valueArg(args, ['--value'])
  if (v === undefined) fail('gate 需要 --value <n>')
  const value = Number(v.value)
  if (!Number.isFinite(value) || value < 0) fail(`--value 需要非负数字: ${v.value}`)
  const gate = gateValue(args) ?? GATE_DEFAULT
  const pass = value < gate
  console.log(`荡值 ${value} · 带「${bandOf(value)}」· 门 ${gate} → ${pass ? '过' : '红'}`)
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
