#!/usr/bin/env node
/**
 * 立诚 CLI —— 零依赖。
 *
 *   licheng template                                绳账骨架
 *   licheng ledger <账.jsonl>                       校验（0 合法 / 2 非法）
 *   licheng settle <账.jsonl> <流.jsonl> [选项]      结账（1 超门 / 0 过门 / 2 坏输入）
 *   licheng block  <账.jsonl> <流.jsonl> [选项]      结账块（供给物，恒 0）
 *   licheng lexicon [--lexicon <词表.json>]          生效的诺言词表
 *
 * 选项：--gate N（结账门，默认 30）、--json（完整报告）、--lexicon <文件>（诺言词表替换）
 */

import { readFileSync } from 'node:fs'
import { parseLedger, templateLedger } from '../core/ledger.js'
import { parseStream, buildCalls } from '../core/stream.js'
import { settleLedger, GATE_DEFAULT } from '../core/settle.js'
import { renderBlock } from '../core/block.js'
import { normalizeMarkers } from '../core/lexicon.js'

const USAGE = `立诚 · 结绳而治 —— DeepSeek Harness 的承诺信用层

用法：
  licheng template
  licheng ledger <账.jsonl>
  licheng settle <账.jsonl> <流.jsonl> [--gate N] [--json] [--lexicon 词表.json]
  licheng block  <账.jsonl> <流.jsonl> [--gate N] [--json] [--lexicon 词表.json]
  licheng lexicon [--lexicon 词表.json]

退出码：0 过门 / 1 超门（仅 settle）/ 2 坏输入或用法错误`

function die(code, message) {
  console.error(message)
  process.exit(code)
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    die(2, `读不到文件 ${file}: ${error.message}`)
  }
}

function readJson(file) {
  const text = readText(file)
  try {
    return JSON.parse(text)
  } catch (error) {
    die(2, `${file} 不是合法 JSON: ${error.message}`)
  }
}

/** 把参数列表切成位置参数与选项。 */
function splitArgs(argv) {
  const positional = []
  const flags = { gate: GATE_DEFAULT, json: false, lexicon: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') flags.json = true
    else if (a === '--gate') {
      const v = Number(argv[++i])
      if (!Number.isInteger(v) || v < 0) die(2, `--gate 需要非负整数，得到 ${argv[i]}`)
      flags.gate = v
    } else if (a === '--lexicon') {
      const v = argv[++i]
      if (!v) die(2, '--lexicon 需要一个文件参数')
      flags.lexicon = v
    } else if (a.startsWith('--')) {
      die(2, `未知选项 ${a}`)
    } else positional.push(a)
  }
  return { positional, flags }
}

function loadLedger(file) {
  const parsed = parseLedger(readText(file))
  if (!parsed.valid) {
    console.log(JSON.stringify({ valid: false, issues: parsed.issues }, null, 2))
    process.exit(2)
  }
  return parsed.entries
}

function loadStreamCalls(file) {
  let events
  try {
    events = parseStream(readText(file))
  } catch (error) {
    die(2, `${file}: ${error.message}`)
  }
  return buildCalls(events)
}

const [command, ...rest] = process.argv.slice(2)

if (!command || command === '-h' || command === '--help') {
  console.log(USAGE)
  process.exit(command ? 0 : 2)
}

if (command === 'template') {
  process.stdout.write(templateLedger())
  process.exit(0)
}

if (command === 'ledger') {
  const [file] = rest
  if (!file) die(2, '用法：licheng ledger <账.jsonl>')
  const entries = loadLedger(file)
  console.log(JSON.stringify({ valid: true, entries: entries.length }, null, 2))
  process.exit(0)
}

if (command === 'settle' || command === 'block') {
  const { positional, flags } = splitArgs(rest)
  const [ledgerFile, streamFile] = positional
  if (!ledgerFile || !streamFile) {
    die(2, `用法：licheng ${command} <账.jsonl> <流.jsonl> [选项]`)
  }
  const entries = loadLedger(ledgerFile)
  const { calls, speech } = loadStreamCalls(streamFile)
  let lexicon = null
  if (flags.lexicon) {
    lexicon = readJson(flags.lexicon)
    try {
      normalizeMarkers(lexicon)
    } catch (error) {
      die(2, `${flags.lexicon}: ${error.message}`)
    }
  }
  const report = settleLedger(entries, calls, { gate: flags.gate, speech, lexicon })
  if (flags.json) console.log(JSON.stringify(report, null, 2))
  else console.log(renderBlock(report))
  process.exit(command === 'settle' && report.verdict === 'fail' ? 1 : 0)
}

if (command === 'lexicon') {
  const { flags } = splitArgs(rest)
  let lexicon = null
  if (flags.lexicon) {
    lexicon = readJson(flags.lexicon)
    try {
      normalizeMarkers(lexicon)
    } catch (error) {
      die(2, `${flags.lexicon}: ${error.message}`)
    }
  }
  console.log(JSON.stringify({ markers: normalizeMarkers(lexicon) }, null, 2))
  process.exit(0)
}

die(2, `未知命令 ${command}\n\n${USAGE}`)
