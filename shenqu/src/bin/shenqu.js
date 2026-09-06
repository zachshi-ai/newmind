#!/usr/bin/env node
/**
 * 审曲 CLI —— 零依赖读据成色审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   shenqu audit <s1.jsonl> [s2.jsonl …] [--file <材册>] [--exempt w1,w2]
 *               [--markers m1,m2] [--window-fields f1,f2] [--frag-windows n]
 *               [--gate n] [--json]
 *   shenqu register --exempt <w1,w2> [--markers m1,m2] [--window-fields f1,f2]
 *                   [--frag-windows n] [--file <材册>]
 *   shenqu revoke --exempt <w> [--file <材册>]
 *   shenqu list [--file <材册>]
 *   shenqu block [--file <材册>]
 *   shenqu gate --value <n> [--gate n]
 *   shenqu --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册照判：audit 不带 --file 或默认册缺失时，默认表照常在岗。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT } from '../core/caizhang.js'
import {
  emptyBook, parseBook, serializeBook, bookCount,
} from '../core/caice.js'
import { renderCaipai } from '../core/caipai.js'

const VERSION = '0.1.0'

const USAGE = `审曲 · shenqu —— DeepSeek Harness 读据成色层的离线 CLI（审曲面势，以饬五材）

用法:
  shenqu audit <s1.jsonl> [s2.jsonl …] [选项]    审材（残见两通道 → 盲动/碎览 → 残值 + 分带 + 门禁）
  shenqu register --exempt <w1,w2> [选项]        立册（登记豁免子串；可附 --markers 等增词与调阈）
  shenqu revoke --exempt <w> [选项]              销名
  shenqu list [选项]                             阅册（材册 JSON）
  shenqu block [选项]                            材牌块（材册公示，逐字节确定）
  shenqu gate --value <n> [选项]                 门禁裁决
  shenqu --help | --version

选项:
  --file <path>          材册文件（默认 ./.shenqu.json；缺失时默认表照常在岗）
  --exempt <w1,w2>       豁免子串（逗号分隔，与册 exempt 取并集；audit/register 可用）
  --markers <m1,m2>      显式残记词（认全文，逗号分隔，与册 markers 取并集）
  --window-fields <f1,f2> 增补窗字段名（逗号分隔，与默认表取并集；noDefaults 时为全部）
  --frag-windows <n>     碎览窗数阈覆盖（≥1 整数）
  --gate <n>             残值阈门（默认 ${GATE_DEFAULT}：≥30 为「盲」，退出码 1）
  --json                 紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`shenqu: ${message}`)
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
  if (idx === -1) return resolve(process.cwd(), '.shenqu.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadBook(args, { required }) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`材册不存在: ${path}`)
    return null
  }
  try {
    return parseBook(readText(path))
  } catch (error) {
    fail(`坏材册 ${path}: ${error.message}`)
  }
}

const THRESHOLD_FLAGS = [
  ['--frag-windows', 'fragWindows'],
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

function wordLists(args) {
  const out = { exempt: [], markers: [], windowFields: [] }
  const spec = [
    ['--exempt', 'exempt'],
    ['--markers', 'markers'],
    ['--window-fields', 'windowFields'],
  ]
  for (const [flag, key] of spec) {
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== flag) continue
      const v = args[i + 1]
      if (!v || v.startsWith('--')) fail(`${flag} 需要值`)
      out[key].push(...v.split(',').filter((w) => w.length > 0))
    }
  }
  return out
}

function hasFlag(args, flag) {
  return args.includes(flag)
}

// ---------------------------------------------------------------- commands

function cmdAudit(args) {
  const clean = []
  const skipWithValues = new Set(['--file', '--gate', '--exempt', '--markers', '--window-fields', ...THRESHOLD_FLAGS.map(([f]) => f)])
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
  const words = wordLists(args)
  for (const key of ['exempt', 'markers', 'windowFields']) {
    if (words[key].length) overrides[key] = words[key]
  }
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
  const words = wordLists(args)
  const overrides = thresholdOverrides(args)
  const path = registryPath(args)
  let book = existsSync(path) ? parseBook(readText(path)) : emptyBook()
  const hasWords = words.exempt.length + words.markers.length + words.windowFields.length > 0
  if (!hasWords && Object.keys(overrides).length === 0) {
    fail('register 需要 --exempt / --markers / --window-fields / --frag-windows 之一')
  }
  try {
    if (words.exempt.length) book = { ...book, exempt: [...new Set([...book.exempt, ...words.exempt])] }
    if (words.markers.length) book = { ...book, markers: [...new Set([...book.markers, ...words.markers])] }
    if (words.windowFields.length) book = { ...book, windowFields: [...new Set([...book.windowFields, ...words.windowFields])] }
    for (const [flag, key] of THRESHOLD_FLAGS) {
      if (overrides[key] != null) book[key] = overrides[key]
    }
  } catch (error) {
    fail(error.message)
  }
  writeFileSync(path, serializeBook(book))
  emit({ ok: true, file: path, bookCount: bookCount(book), exempt: book.exempt, markers: book.markers, windowFields: book.windowFields, ...pickThresholds(book) }, hasFlag(args, '--json'))
}

function pickThresholds(book) {
  return { fragWindows: book.fragWindows }
}

function cmdRevoke(args) {
  const words = wordLists(args)
  const overrides = thresholdOverrides(args)
  if (words.exempt.length !== 1 || words.markers.length || words.windowFields.length || Object.keys(overrides).length !== 0) {
    fail('revoke 需要 --exempt 恰一名')
  }
  const book = loadBook(args, { required: true })
  if (!book.exempt.includes(words.exempt[0])) fail(`豁免子串未登记: ${words.exempt[0]}`)
  const next = { ...book, exempt: book.exempt.filter((w) => w !== words.exempt[0]) }
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
  console.log(renderCaipai(book))
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
