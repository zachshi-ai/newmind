#!/usr/bin/env node
/**
 * 法仪 CLI —— 零依赖持尺审计器（单流离线重放，可验尸任何历史会话）。
 *
 *   fayi audit <s.jsonl> [--register <file>] [--amend <glob>…] [--no-defaults] [--gate n] [--json]
 *   fayi enroll --guard <glob>… [--amend <glob>…] [--verify <词>…] [--no-defaults] [--file <path>]
 *   fayi list   [--file <path>]
 *   fayi block  [--file <path>]
 *   fayi gate   --value <n> [--gate n]
 *   fayi --help | --version
 *
 * 退出码：0 通过；1 枉值 ≥ 门（audit fail）；2 用法/输入错误。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStream } from '../core/audit.js'
import { GATE_DEFAULT } from '../core/fayi.js'
import { emptyRegister, parseRegister, serializeRegister, mergeRegister } from '../core/qice.js'
import { renderShengmo } from '../core/block.js'

const VERSION = '0.1.0'

const USAGE = `法仪 · fayi —— DeepSeek Harness 持尺层的离线 CLI（天下从事者，不可以无法仪）

用法:
  fayi audit <s.jsonl> [选项]          审尺（曲尺/虚器/废尺 → 枉值 + 分带 + 门禁；恰取一流）
  fayi enroll --guard <glob> […] [选项]  立册（持性器径；--amend 修性器径；--verify 验尺词；并集只增不删）
  fayi list [选项]                     阅册（器册 JSON）
  fayi block [选项]                    绳墨块（器册公示，逐字节确定）
  fayi gate --value <n> [选项]         门禁裁决
  fayi --help | --version

选项:
  --register <path>  器册文件（audit 缺省时若 ./.fayi.json 存在则载入，否则纯默认形）
  --amend <glob>     修性器径（审计侧并入：账方声明为本轮交付的验收路径；可重复）
  --no-defaults      关闭默认形表（纯显式册）
  --gate <n>         枉值阈门（默认 ${GATE_DEFAULT}：≥30 为「枉」，退出码 1）
  --file <path>      enroll/list/block 的器册文件（默认 ./.fayi.json）
  --guard <glob>     持性器径声明（可重复）
  --verify <词>      验尺词声明（命令串子串匹配；可重复）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`fayi: ${message}`)
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

function loadRegister(path, { required = false } = {}) {
  if (!existsSync(path)) {
    if (required) fail(`器册 ${path} 不存在`)
    return null
  }
  try {
    return parseRegister(readText(path))
  } catch (error) {
    fail(`器册 ${path} 无法解析：${error.message}`)
  }
}

function saveRegister(path, reg) {
  try {
    writeFileSync(path, serializeRegister(reg))
  } catch (error) {
    fail(`无法写入器册 ${path}: ${error.message}`)
  }
}

function parseOpts(argv) {
  const opts = { guards: [], amends: [], verifies: [], streams: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') opts.json = true
    else if (a === '--no-defaults') opts.noDefaults = true
    else if (a === '--register') opts.register = argv[++i]
    else if (a === '--file') opts.file = argv[++i]
    else if (a === '--amend') {
      const g = argv[++i]
      if (!g) fail('--amend 需要非空 glob')
      opts.amends.push(g)
    } else if (a === '--guard') {
      const g = argv[++i]
      if (!g) fail('--guard 需要非空 glob')
      opts.guards.push(g)
    } else if (a === '--verify') {
      const v = argv[++i]
      if (!v) fail('--verify 需要非空词')
      opts.verifies.push(v)
    } else if (a === '--gate') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 0) fail('--gate 需要非负数字')
      opts.gate = n
    } else if (a === '--value') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n)) fail('--value 需要数字')
      opts.value = n
    } else if (!a.startsWith('--')) {
      opts.streams.push(a)
    } else {
      fail(`未知选项：${a}`)
    }
  }
  return opts
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv.includes('--help')) {
    console.log(USAGE)
    return 0
  }
  if (argv.includes('--version')) {
    console.log(VERSION)
    return 0
  }
  const cmd = argv[0]
  const defaultFile = () => resolve(process.cwd(), '.fayi.json')

  if (cmd === 'audit') {
    const opts = parseOpts(argv.slice(1))
    if (opts.streams.length !== 1) fail('audit 恰取一个会话流文件（法仪是单会话尺度；跨会话归属是定分地盘）')
    let register = opts.register
      ? loadRegister(opts.register, { required: true })
      : loadRegister(defaultFile())
    if (register == null && opts.noDefaults) register = emptyRegister()
    if (register != null && opts.noDefaults) register = { ...register, noDefaults: true }
    let report
    try {
      report = auditStream({ name: opts.streams[0], text: readText(opts.streams[0]) }, {
        register,
        gate: opts.gate,
        extraAmends: opts.amends,
      })
    } catch (error) {
      fail(`审计失败：${error.message}`)
    }
    emit(report, opts.json)
    return report.ok ? 0 : 1
  }

  if (cmd === 'enroll') {
    const opts = parseOpts(argv.slice(1))
    if (opts.guards.length + opts.amends.length + opts.verifies.length === 0) {
      fail('enroll 需要 --guard/--amend/--verify 至少一项')
    }
    const path = opts.file ?? defaultFile()
    const reg = loadRegister(path) ?? emptyRegister()
    const next = mergeRegister(reg, {
      guards: opts.guards,
      amends: opts.amends,
      verify: opts.verifies,
      noDefaults: opts.noDefaults === true ? true : null,
    })
    saveRegister(path, next)
    console.log(`立册：${path}（持 ${next.guards.length} / 修 ${next.amends.length} / 验尺词 ${next.verify.length}${next.noDefaults ? ' / 无默认形' : ''}）`)
    process.stdout.write(renderShengmo(next))
    return 0
  }

  if (cmd === 'list') {
    const opts = parseOpts(argv.slice(1))
    const path = opts.file ?? defaultFile()
    if (!existsSync(path)) fail(`器册 ${path} 不存在`)
    emit(parseRegister(readText(path)), opts.json)
    return 0
  }

  if (cmd === 'block') {
    const opts = parseOpts(argv.slice(1))
    const path = opts.file ?? defaultFile()
    if (!existsSync(path)) fail(`器册 ${path} 不存在`)
    process.stdout.write(renderShengmo(parseRegister(readText(path))))
    return 0
  }

  if (cmd === 'gate') {
    const opts = parseOpts(argv.slice(1))
    if (opts.value == null) fail('gate 需要 --value <n>')
    const gate = opts.gate ?? GATE_DEFAULT
    const ok = opts.value < gate
    emit({ value: opts.value, gate, verdict: ok ? 'pass' : 'fail', ok }, opts.json)
    return ok ? 0 : 1
  }

  fail(`未知命令：${cmd}`)
}

process.exitCode = main() ?? 0
