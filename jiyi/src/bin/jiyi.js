#!/usr/bin/env node
/**
 * 稽疑 CLI —— 零依赖稽问审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   jiyi audit <s1.jsonl> [s2.jsonl …] [--file <疑册>] [--gate n] [--json]
 *   jiyi register --ask <path> --on <write|exec|any> […] [--no-defaults|--defaults] [--file <疑册>]
 *   jiyi revoke --ask <path> [--on <write|exec|any>] [--file <疑册>]
 *   jiyi list [--file <疑册>]
 *   jiyi block [--file <疑册>]
 *   jiyi gate --value <n> [--gate n]
 *   jiyi --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT } from '../core/ji.js'
import { renderJice } from '../core/jice.js'
import {
  emptyAskfile, parseAskfile, serializeAskfile, askCount,
  addAsk, setNoDefaults, revokeAsk, ONS,
} from '../core/askfile.js'

const VERSION = '0.1.0'

const USAGE = `稽疑 · jiyi —— DeepSeek Harness 稽问层的离线 CLI（汝则有大疑，谋及乃心，谋及卿士——乃心从不单独定案）

用法:
  jiyi audit <s1.jsonl> [s2.jsonl …] [选项]      稽问（谋及/空疑/迟问/独谋/未见 → 谋值 + 分带 + 门禁）
  jiyi register --ask <path> --on <域> […] [选项]  立册（登记必问之疑；--on ∈ write/exec/any）
  jiyi revoke --ask <path> [--on <域>] [选项]      销条
  jiyi list [选项]                               阅册（疑册 JSON）
  jiyi block [选项]                              稽块（疑册公示，逐字节确定）
  jiyi gate --value <n> [选项]                    门禁裁决
  jiyi --help | --version

选项:
  --file <path>      疑册文件（默认 ./.jiyi.json）
  --gate <n>         谋值阈门（默认 ${GATE_DEFAULT}：≥30 为「独」，退出码 1）
  --json             紧凑 JSON 输出
  --ask <path>       疑条声明源（register 可与 --on 成对重复；revoke 按此销条）
  --on <write|exec|any>  触发域（register 与 --ask 成对；revoke 可选，缺省销该 path 全部条）
  --no-defaults      关默认形表（register）；--defaults 开默认形表
  --allow-defaults   同 --defaults

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`jiyi: ${message}`)
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

function askfilePath(args) {
  const idx = args.indexOf('--file')
  if (idx === -1) return resolve(process.cwd(), '.jiyi.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadAskfile(args, { required }) {
  const path = askfilePath(args)
  if (!existsSync(path)) {
    if (required) fail(`疑册不存在: ${path}`)
    return null
  }
  try {
    return parseAskfile(readText(path))
  } catch (error) {
    fail(`坏疑册 ${path}: ${error.message}`)
  }
}

function flagValues(args, flag) {
  const out = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      const v = args[i + 1]
      if (!v || v.startsWith('--')) fail(`${flag} 需要值`)
      out.push(v)
    }
  }
  return out
}

function hasFlag(args, flag) {
  return args.includes(flag)
}

// ---------------------------------------------------------------- commands

function cmdAudit(args) {
  // 位置参数 = 流文件；选项与选项值在此滤除
  const clean = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '--gate') {
      i++
      continue
    }
    if (args[i] === '--json') continue
    clean.push(args[i])
  }
  if (clean.length === 0) fail('audit 需要至少一个会话流')
  const askfile = loadAskfile(args, { required: hasFlag(args, '--file') })
  const gateIdx = args.indexOf('--gate')
  let gate
  if (gateIdx !== -1) {
    gate = Number(args[gateIdx + 1])
    if (!Number.isFinite(gate) || gate < 0) fail('--gate 需要非负数字')
  }
  const entries = clean.map((p) => ({ name: p, text: readText(p) }))
  let report
  try {
    report = auditStreams(entries, { askfile, gate })
  } catch (error) {
    fail(error.message)
  }
  emit(report, hasFlag(args, '--json'))
  process.exit(report.verdict === 'fail' ? 1 : 0)
}

function cmdRegister(args) {
  const paths = flagValues(args, '--ask')
  const ons = flagValues(args, '--on')
  const path = askfilePath(args)
  if (paths.length === 0) fail('register 需要 --ask <path> --on <域> 至少一对')
  if (ons.length !== paths.length) fail('register 的 --ask 与 --on 必须成对')
  let askfile = existsSync(path) ? parseAskfile(readText(path)) : emptyAskfile()
  for (let i = 0; i < paths.length; i++) {
    try {
      addAsk(askfile, paths[i], ons[i])
    } catch (error) {
      fail(error.message)
    }
  }
  if (hasFlag(args, '--no-defaults')) setNoDefaults(askfile, true)
  if (hasFlag(args, '--defaults') || hasFlag(args, '--allow-defaults')) setNoDefaults(askfile, false)
  writeFileSync(path, serializeAskfile(askfile))
  emit({ ok: true, file: path, askCount: askCount(askfile), asks: askfile.asks, noDefaults: askfile.noDefaults }, hasFlag(args, '--json'))
}

function cmdRevoke(args) {
  const paths = flagValues(args, '--ask')
  const ons = flagValues(args, '--on')
  if (paths.length !== 1) fail('revoke 需要恰一 --ask')
  if (ons.length > 1) fail('revoke 的 --on 至多一个')
  if (ons.length === 1 && !ONS.includes(ons[0])) fail(`--on 必须是 ${ONS.join('/')} 之一`)
  const askfile = loadAskfile(args, { required: true })
  const removed = revokeAsk(askfile, paths[0], ons.length ? ons[0] : null)
  if (removed === 0) fail(`疑册无此条: ${paths[0]}${ons.length ? `（${ons[0]}）` : ''}`)
  const path = askfilePath(args)
  writeFileSync(path, serializeAskfile(askfile))
  emit({ ok: true, file: path, askCount: askCount(askfile), removed }, hasFlag(args, '--json'))
}

function cmdList(args) {
  const askfile = loadAskfile(args, { required: true })
  emit(askfile, hasFlag(args, '--json'))
}

function cmdBlock(args) {
  const askfile = loadAskfile(args, { required: true })
  console.log(renderJice(askfile))
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
