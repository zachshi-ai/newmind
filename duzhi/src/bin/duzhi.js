#!/usr/bin/env node
/**
 * duzhi CLI —— 零依赖用账审计器（契约无关，可验尸任何历史会话流）。
 *
 *   duzhi audit   <stream.jsonl> [选项]   用账审计（制值 + 分带 + 门禁）
 *   duzhi block   <stream.jsonl> [选项]   余量块（接缝处确定性供给件）
 *   duzhi declare [选项]                  写制册（补丁语义：给的键更新，未给的保留）
 *   duzhi list    [选项]                  生效之线（JSON）
 *   duzhi gate    --value <n> [--gate n]  门禁裁决
 *   duzhi --help | --version
 *
 * 退出码：0 守界（制值 < 门）；1 门禁失败（≥门）；2 用法/输入错误。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parseStream, buildCalls } from '../core/stream.js'
import { validateRegister, validateCaps, resolveCaps } from '../core/register.js'
import { analyze, liveScore, GATE_DEFAULT } from '../core/ledger.js'
import { auditStream } from '../core/audit.js'
import { renderYuliang } from '../core/block.js'

const VERSION = '0.1.0'
const REGISTER_DEFAULT = '.duzhi.json'

const USAGE = `度支 · duzhi —— DeepSeek Harness 量纲治理层的离线 CLI

用法:
  duzhi audit <stream.jsonl> [选项]      用账审计（制值 + 分带 + 门禁）
  duzhi block <stream.jsonl> [选项]      余量块（接缝处确定性供给件）
  duzhi declare [选项]                   写制册（补丁语义）
  duzhi list [选项]                      生效之线（JSON）
  duzhi gate --value <n> [--gate <n>]    门禁裁决
  duzhi --help | --version

选项:
  --gate <n>          制值阈门（默认 ${GATE_DEFAULT}：≥30 为「非」，退出码 1）
  --register <file>   制册文件（JSON；缺省时若 ./${REGISTER_DEFAULT} 存在则载入）
  --max-calls <n>     调用线（≥1 整数；与册互补，同键覆盖）
  --max-minutes <m>   时长线（≥1 整数，分钟）
  --id <s>            任名（账目所系）
  --file <path>       declare 的目标册文件（默认 ./${REGISTER_DEFAULT}）
  --json              紧凑 JSON 输出（block 时包装为 JSON）
  --value <n>         gate 子命令的待裁值
  --help              显示本帮助

退出码: 0 守界；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`duzhi: ${message}`)
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

function parseOpts(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') opts.json = true
    else if (a === '--gate') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 0) fail('--gate 需要非负数字')
      opts.gate = n
    } else if (a === '--value') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n)) fail('--value 需要数字')
      opts.value = n
    } else if (a === '--register') {
      const v = argv[++i]
      if (!v) fail('--register 需要文件路径')
      opts.register = v
    } else if (a === '--file') {
      const v = argv[++i]
      if (!v) fail('--file 需要文件路径')
      opts.file = v
    } else if (a === '--max-calls') {
      const n = Number(argv[++i])
      if (!Number.isInteger(n) || n < 1) fail('--max-calls 需要 ≥1 的整数')
      opts.maxCalls = n
    } else if (a === '--max-minutes') {
      const n = Number(argv[++i])
      if (!Number.isInteger(n) || n < 1) fail('--max-minutes 需要 ≥1 的整数')
      opts.maxMinutes = n
    } else if (a === '--id') {
      const v = argv[++i]
      if (!v || !v.trim()) fail('--id 需要非空字符串')
      opts.id = v
    } else if (!a.startsWith('--')) {
      if (opts.stream != null) fail(`多余的参数：${a}（audit 恰取一流）`)
      opts.stream = a
    } else {
      fail(`未知选项：${a}`)
    }
  }
  return opts
}

/** 载入并校验制册：显式 --register 必须存在；缺省载入 ./.duzhi.json（存在时）。 */
function loadRegister(opts) {
  const path = opts.register ?? (existsSync(REGISTER_DEFAULT) ? REGISTER_DEFAULT : null)
  if (!path) return null
  let obj
  try {
    obj = JSON.parse(readText(path))
  } catch (error) {
    fail(`制册文件 ${path} 无法解析: ${error.message}`)
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail(`制册文件 ${path} 不是 JSON 对象`)
  const v = validateRegister(obj)
  if (!v.valid) fail(`制册文件 ${path} 非法:\n${v.issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`)
  return obj
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv.includes('--help')) {
    console.log(USAGE)
    return
  }
  if (argv.includes('--version')) {
    console.log(VERSION)
    return
  }

  const cmd = argv[0]
  const opts = parseOpts(argv.slice(1))

  if (cmd === 'gate') {
    if (!Number.isFinite(opts.value)) fail('gate 子命令需要 --value <n>')
    const gate = Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT
    const ok = opts.value < gate
    if (opts.json) emit({ value: opts.value, gate, verdict: ok ? 'pass' : 'fail', ok }, true)
    else console.log(ok ? 'pass' : 'fail')
    process.exit(ok ? 0 : 1)
  }

  if (cmd === 'declare') {
    if (opts.maxCalls === undefined && opts.maxMinutes === undefined) {
      fail('declare 需要 --max-calls / --max-minutes 至少一项（无量纲之册非法）')
    }
    const path = opts.file ?? REGISTER_DEFAULT
    let base = null
    if (existsSync(path)) {
      try {
        base = JSON.parse(readFileSync(path))
      } catch (error) {
        fail(`既有册 ${path} 无法解析: ${error.message}`)
      }
      if (!base || typeof base !== 'object' || Array.isArray(base)) fail(`既有册 ${path} 不是 JSON 对象`)
    }
    const id = opts.id ?? base?.id
    if (!id || !String(id).trim()) fail('立册需要任名：给 --id（或既有册中已有 id）')
    const budget = {
      ...(base?.budget && typeof base.budget === 'object' ? base.budget : {}),
      ...(opts.maxCalls !== undefined ? { maxCalls: opts.maxCalls } : {}),
      ...(opts.maxMinutes !== undefined ? { maxMinutes: opts.maxMinutes } : {}),
    }
    const merged = { version: 1, id: String(id), budget }
    const v = validateRegister(merged)
    if (!v.valid) fail(`合并后的制册非法:\n${v.issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`)
    writeFileSync(path, JSON.stringify(merged, null, 2) + '\n')
    emit({ ok: true, file: path, ...merged }, opts.json)
    return
  }

  if (cmd === 'list') {
    const register = loadRegister(opts)
    const { caps, id } = resolveCaps({
      register,
      maxCalls: opts.maxCalls,
      maxMinutes: opts.maxMinutes,
      id: opts.id,
    })
    emit(
      {
        version: 1,
        id,
        budget: caps,
        gate: Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT,
        bounded: caps.maxCalls != null || caps.maxMinutes != null,
      },
      opts.json,
    )
    return
  }

  if (cmd !== 'audit' && cmd !== 'block') fail(`未知命令：${cmd}`)
  if (opts.stream == null) fail(`${cmd} 子命令需要会话流路径`)

  const streamText = readText(opts.stream)
  const register = loadRegister(opts)
  const auditOpts = {
    register,
    maxCalls: opts.maxCalls,
    maxMinutes: opts.maxMinutes,
    id: opts.id,
    gate: opts.gate,
  }

  let report
  try {
    report = auditStream(streamText, auditOpts)
  } catch (error) {
    fail(`坏流：${error.message}`)
  }

  if (cmd === 'audit') {
    emit(report, opts.json)
    process.exit(report.ok ? 0 : 1)
  }

  // block：离线重放一次，用账本状态渲染（#1 起）
  const { calls } = buildCalls(parseStream(streamText))
  const { caps, id } = resolveCaps(auditOpts)
  const state = analyze(calls, { caps, id, gate: opts.gate })
  state.renderCount = 1
  const text = renderYuliang(state, 1)
  if (opts.json) emit({ k: 1, text }, true)
  else console.log(text)
  process.exit(report.ok ? 0 : 1)
}

main()
