#!/usr/bin/env node
/**
 * 定分 CLI —— 零依赖权界审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   dingfen audit <s1.jsonl> [s2.jsonl …] [--file <分册>] [--gate n] [--json]
 *   dingfen claim --id <id> --fence <glob> […] [--file <分册>] [--at <ms>] [--strict]
 *   dingfen release --id <id> [--file <分册>] [--at <ms>]
 *   dingfen list [--file <分册>]
 *   dingfen block [--file <分册>]
 *   dingfen gate --value <n> [--gate n]
 *   dingfen --help | --version
 *
 * 退出码：0 通过；1 门禁失败（audit fail / --strict 争界）；2 用法/输入错误。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT } from '../core/zheng.js'
import { emptyRegistry, parseRegistry, serializeRegistry, claim, release, findOverlaps } from '../core/fence.js'
import { renderJiebei } from '../core/jiebei.js'

const VERSION = '0.1.0'

const USAGE = `定分 · dingfen —— DeepSeek Harness 封界层的离线 CLI（定分止争：一兔走百人逐之，由名分之未定也）

用法:
  dingfen audit <s1.jsonl> [s2.jsonl …] [选项]   审争（争写/侵入/越分 → 争值 + 分带 + 门禁）
  dingfen claim --id <id> --fence <glob> […] [选项]  领分（登记写域；争界告警附见证径）
  dingfen release --id <id> [选项]               销分（收工落账）
  dingfen list [选项]                            阅册（分册 JSON）
  dingfen block [选项]                           界碑块（分册公示，逐字节确定）
  dingfen gate --value <n> [选项]                门禁裁决
  dingfen --help | --version

选项:
  --file <path>     分册文件（默认 ./.dingfen.json）
  --gate <n>        争值阈门（默认 ${GATE_DEFAULT}：≥30 为「争」，退出码 1）
  --at <ms>         领分/销分时刻（默认当前时间）
  --strict          claim 时有争界 → exit 1
  --json            紧凑 JSON 输出
  --id <id>         会话 id
  --fence <glob>    写域声明（可重复）

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`dingfen: ${message}`)
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

function loadRegistry(path) {
  if (!existsSync(path)) return emptyRegistry()
  try {
    return parseRegistry(readText(path))
  } catch (error) {
    fail(`分册 ${path} 无法解析：${error.message}`)
  }
}

function saveRegistry(path, reg) {
  try {
    writeFileSync(path, serializeRegistry(reg))
  } catch (error) {
    fail(`无法写入分册 ${path}: ${error.message}`)
  }
}

function parseOpts(argv) {
  const opts = { fences: [], streams: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') opts.json = true
    else if (a === '--strict') opts.strict = true
    else if (a === '--file') opts.file = argv[++i]
    else if (a === '--id') {
      opts.id = argv[++i]
      if (!opts.id) fail('--id 需要非空值')
    } else if (a === '--fence') {
      const g = argv[++i]
      if (!g) fail('--fence 需要非空 glob')
      opts.fences.push(g)
    } else if (a === '--at') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n)) fail('--at 需要数字（毫秒时刻）')
      opts.at = n
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
  const file = () => resolve(process.cwd(), '.dingfen.json')

  if (cmd === 'audit') {
    const opts = parseOpts(argv.slice(1))
    if (opts.streams.length === 0) fail('audit 需要至少一个会话流文件')
    const registry = opts.file ? loadRegistry(opts.file) : null
    const entries = opts.streams.map((name) => ({ name, text: readText(name) }))
    let report
    try {
      report = auditStreams(entries, { registry, gate: opts.gate })
    } catch (error) {
      fail(`审计失败：${error.message}`)
    }
    emit(report, opts.json)
    return report.ok ? 0 : 1
  }

  if (cmd === 'claim') {
    const opts = parseOpts(argv.slice(1))
    if (!opts.id) fail('claim 需要 --id <会话 id>')
    if (opts.fences.length === 0) fail('claim 需要 --fence <glob>（至少一个）')
    const path = opts.file ?? file()
    const reg = loadRegistry(path)
    const at = opts.at ?? Date.now()
    const next = claim(reg, { id: opts.id, fences: opts.fences, at })
    const overlaps = findOverlaps(next, { id: opts.id, fences: opts.fences })
    saveRegistry(path, next)
    console.log(`领分：${opts.id} ── ${opts.fences.join(' ')}`)
    for (const o of overlaps) {
      console.log(`⚠ 争界：${o.a} × ${o.b} ── 见证径 ${o.witness}（${o.globA} × ${o.globB}）`)
    }
    console.log(renderJiebei(next).trimEnd())
    if (overlaps.length > 0 && opts.strict) return 1
    return 0
  }

  if (cmd === 'release') {
    const opts = parseOpts(argv.slice(1))
    if (!opts.id) fail('release 需要 --id <会话 id>')
    const path = opts.file ?? file()
    const reg = loadRegistry(path)
    let next
    try {
      next = release(reg, { id: opts.id, at: opts.at ?? Date.now() })
    } catch (error) {
      fail(error.message)
    }
    saveRegistry(path, next)
    console.log(`销分：${opts.id}（releasedAt=${opts.at ?? Date.now()}）`)
    return 0
  }

  if (cmd === 'list') {
    const opts = parseOpts(argv.slice(1))
    const path = opts.file ?? file()
    if (!existsSync(path)) fail(`分册 ${path} 不存在`)
    emit(parseRegistry(readText(path)), opts.json)
    return 0
  }

  if (cmd === 'block') {
    const opts = parseOpts(argv.slice(1))
    const path = opts.file ?? file()
    if (!existsSync(path)) fail(`分册 ${path} 不存在`)
    process.stdout.write(renderJiebei(parseRegistry(readText(path))))
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
