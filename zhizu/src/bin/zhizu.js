#!/usr/bin/env node
/**
 * 知足 CLI —— 零依赖量出审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   zhizu audit <s1.jsonl> [s2.jsonl …] [--file <足册>] [--exempt w1,w2]
 *               [--huge-lines n] [--fan-dirs n] [--fan-files n] [--churn-free n]
 *               [--gate n] [--json]
 *   zhizu register --exempt <w1,w2> [--huge-lines n] [--fan-dirs n] [--fan-files n]
 *                  [--churn-free n] [--file <足册>]
 *   zhizu revoke --exempt <w> [--file <足册>]
 *   zhizu list [--file <足册>]
 *   zhizu block [--file <足册>]
 *   zhizu gate --value <n> [--gate n]
 *   zhizu --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册照判：audit 不带 --file 或默认册缺失时，默认阈值照常在岗。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT } from '../core/liangzhang.js'
import {
  emptyBook, parseBook, serializeBook, bookCount,
} from '../core/zuce.js'
import { renderLiangpai } from '../core/liangpai.js'

const VERSION = '0.1.0'

const USAGE = `知足 · zhizu —— DeepSeek Harness 变更规模层的离线 CLI（行少欲者，心则坦然）

用法:
  zhizu audit <s1.jsonl> [s2.jsonl …] [选项]      审量（巨写/蔓延/屡改 → 溢值 + 分带 + 门禁）
  zhizu register --exempt <w1,w2> [选项]          立册（登记豁免子串；可附 --huge-lines 等调阈）
  zhizu revoke --exempt <w> [选项]                销名
  zhizu list [选项]                               阅册（足册 JSON）
  zhizu block [选项]                              量牌块（足册公示，逐字节确定）
  zhizu gate --value <n> [选项]                   门禁裁决
  zhizu --help | --version

选项:
  --file <path>      足册文件（默认 ./.zhizu.json；缺失时默认阈值照常在岗）
  --exempt <w1,w2>   豁免子串（逗号分隔，与册 exempt 取并集；audit/register 可用）
  --huge-lines <n>   巨写行阈覆盖（audit/register 可用）
  --fan-dirs <n>     蔓延目录阈覆盖
  --fan-files <n>    蔓延文件阈覆盖
  --churn-free <n>   屡改免额覆盖
  --gate <n>         溢值阈门（默认 ${GATE_DEFAULT}：≥30 为「溢」，退出码 1）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`zhizu: ${message}`)
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

function registryPath(args) {
  const idx = args.indexOf('--file')
  if (idx === -1) return resolve(process.cwd(), '.zhizu.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadBook(args, { required }) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`足册不存在: ${path}`)
    return null
  }
  try {
    return parseBook(readText(path))
  } catch (error) {
    fail(`坏足册 ${path}: ${error.message}`)
  }
}

const THRESHOLD_FLAGS = [
  ['--huge-lines', 'hugeLines'],
  ['--fan-dirs', 'fanDirs'],
  ['--fan-files', 'fanFiles'],
  ['--churn-free', 'churnFree'],
]

function thresholdOverrides(args) {
  const out = {}
  for (const [flag, key] of THRESHOLD_FLAGS) {
    const idx = args.indexOf(flag)
    if (idx === -1) continue
    const v = Number(args[idx + 1])
    if (!args[idx + 1] || !Number.isInteger(v) || v < 1) fail(`${flag} 需要 ≥1 的整数`)
    out[key] = v
  }
  return out
}

function exemptWords(args) {
  const out = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--exempt') {
      const v = args[i + 1]
      if (!v || v.startsWith('--')) fail('--exempt 需要值')
      out.push(v)
    }
  }
  return out.flatMap((v) => v.split(',')).filter((w) => w.length > 0)
}

function hasFlag(args, flag) {
  return args.includes(flag)
}

// ---------------------------------------------------------------- commands

function cmdAudit(args) {
  const clean = []
  const skipWithValues = new Set(['--file', '--gate', '--exempt', ...THRESHOLD_FLAGS.map(([f]) => f)])
  for (let i = 0; i < args.length; i++) {
    if (skipWithValues.has(args[i])) {
      i++
      continue
    }
    if (args[i] === '--json') continue
    clean.push(args[i])
  }
  if (clean.length === 0) fail('audit 需要至少一个会话流')
  const book = loadBook(args, { required: hasFlag(args, '--file') })
  const overrides = { ...thresholdOverrides(args) }
  const exempt = exemptWords(args)
  if (exempt.length) overrides.exempt = exempt
  const gateIdx = args.indexOf('--gate')
  let gate
  if (gateIdx !== -1) {
    gate = Number(args[gateIdx + 1])
    if (!Number.isFinite(gate) || gate < 0) fail('--gate 需要非负数字')
  }
  const entries = clean.map((p) => ({ name: p, text: readText(p) }))
  let report
  try {
    report = auditStreams(entries, { book, overrides, gate })
  } catch (error) {
    fail(error.message)
  }
  emit(report, hasFlag(args, '--json'))
  process.exit(report.verdict === 'fail' ? 1 : 0)
}

function cmdRegister(args) {
  const exempt = exemptWords(args)
  const overrides = thresholdOverrides(args)
  const path = registryPath(args)
  let book = existsSync(path) ? parseBook(readText(path)) : emptyBook()
  if (exempt.length === 0 && Object.keys(overrides).length === 0) {
    fail('register 需要 --exempt / 阈值旗标之一')
  }
  try {
    if (exempt.length) book = { ...book, exempt: [...new Set([...book.exempt, ...exempt])] }
    for (const [flag, key] of THRESHOLD_FLAGS) {
      if (overrides[key] != null) book[key] = overrides[key]
    }
  } catch (error) {
    fail(error.message)
  }
  writeFileSync(path, serializeBook(book))
  emit({ ok: true, file: path, bookCount: bookCount(book), exempt: book.exempt, ...pickThresholds(book) }, hasFlag(args, '--json'))
}

function pickThresholds(book) {
  return {
    hugeLines: book.hugeLines, fanDirs: book.fanDirs, fanFiles: book.fanFiles, churnFree: book.churnFree,
  }
}

function cmdRevoke(args) {
  const exempt = exemptWords(args)
  const overrides = thresholdOverrides(args)
  if (exempt.length !== 1 || Object.keys(overrides).length !== 0) fail('revoke 需要 --exempt 恰一名')
  const book = loadBook(args, { required: true })
  if (!book.exempt.includes(exempt[0])) fail(`豁免子串未登记: ${exempt[0]}`)
  const next = { ...book, exempt: book.exempt.filter((w) => w !== exempt[0]) }
  const path = registryPath(args)
  writeFileSync(path, serializeBook(next))
  emit({ ok: true, file: path, bookCount: bookCount(next) }, hasFlag(args, '--json'))
}

function cmdList(args) {
  const book = loadBook(args, { required: true })
  emit(book, hasFlag(args, '--json'))
}

function cmdBlock(args) {
  const book = loadBook(args, { required: true })
  console.log(renderLiangpai(book))
}

function cmdGate(args) {
  const idx = args.indexOf('--value')
  if (idx === -1 || !args[idx + 1]) fail('gate 需要 --value <n>')
  const value = Number(args[idx + 1])
  if (!Number.isFinite(value)) fail('--value 需要数字')
  const gateIdx = args.indexOf('--gate')
  let gate = GATE_DEFAULT
  if (gateIdx !== -1) {
    gate = Number(args[gateIdx + 1])
    if (!Number.isFinite(gate)) fail('--gate 需要数字')
  }
  const verdict = value >= gate ? 'fail' : 'pass'
  emit({ value, gate, verdict, ok: verdict === 'pass', band: null }, hasFlag(args, '--json'))
  process.exit(verdict === 'fail' ? 1 : 0)
}

// ---------------------------------------------------------------- main

const argv = process.argv.slice(2)
const cmd = argv[0]
const rest = argv.slice(1)

if (cmd === '--version' || cmd === '-v') {
  console.log(VERSION)
} else if (cmd === '--help' || cmd === '-h' || !cmd) {
  console.log(USAGE)
} else if (cmd === 'audit') {
  cmdAudit(rest)
} else if (cmd === 'register') {
  cmdRegister(rest)
} else if (cmd === 'revoke') {
  cmdRevoke(rest)
} else if (cmd === 'list') {
  cmdList(rest)
} else if (cmd === 'block') {
  cmdBlock(rest)
} else if (cmd === 'gate') {
  cmdGate(rest)
} else {
  fail(`未知命令: ${cmd}`)
}
