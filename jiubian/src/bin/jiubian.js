#!/usr/bin/env node
/**
 * jiubian CLI —— 零依赖势账审计器（契约无关，可验尸任何历史会话流）。
 *
 *   jiubian audit <stream.jsonl> [--gate n] [--json]   势账审计（失机值 + 分带 + 门禁）
 *   jiubian bianfang <stream.jsonl> [--json]           变方块（默认纯文本）
 *   jiubian gate --value <n> [--gate <n>]              门禁裁决
 *   jiubian --help | --version
 *
 * 退出码：0 通过；1 门禁失败（失机值 ≥ 门）；2 用法/输入错误。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseStream, buildCalls } from '../core/stream.js'
import { analyze, GATE_DEFAULT } from '../core/shi.js'
import { auditStream } from '../core/audit.js'
import { renderBianfang } from '../core/bianfang.js'

const VERSION = '0.1.0'

const USAGE = `九变 · jiubian —— DeepSeek Harness 勘流应变层的离线 CLI

用法:
  jiubian audit <stream.jsonl> [选项]     势账审计（失机值 + 分带 + 门禁）
  jiubian bianfang <stream.jsonl> [选项]  变方块（悬账的应变清单）
  jiubian gate --value <n> [选项]         门禁裁决
  jiubian --help | --version

选项:
  --gate <n>        失机值阈门（默认 ${GATE_DEFAULT}：≥30 为「胶」，退出码 1）
  --json            紧凑 JSON 输出（bianfang 时包装为 JSON）
  --value <n>       gate 子命令的待裁值
  --help            显示本帮助

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`jiubian: ${message}`)
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

/** 解析 --gate / --json / --value 形式的选项。 */
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
    } else if (!a.startsWith('--')) {
      if (opts.stream != null) fail(`多余的参数：${a}`)
      opts.stream = a
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
  if (cmd === 'audit') {
    const opts = parseOpts(argv.slice(1))
    if (opts.stream == null) fail('audit 需要会话流文件')
    let report
    try {
      report = auditStream(readText(opts.stream), { gate: opts.gate })
    } catch (error) {
      fail(`流解析失败：${error.message}`)
    }
    emit(report, opts.json)
    return report.ok ? 0 : 1
  }
  if (cmd === 'bianfang') {
    const opts = parseOpts(argv.slice(1))
    if (opts.stream == null) fail('bianfang 需要会话流文件')
    let state
    try {
      const { calls } = buildCalls(parseStream(readText(opts.stream)))
      state = analyze(calls)
    } catch (error) {
      fail(`流解析失败：${error.message}`)
    }
    state.verdictsSettled = true
    if (opts.json) {
      emit({ k: 1, openDebts: state.counts.orphan, text: renderBianfang(state, 1) }, true)
    } else {
      console.log(renderBianfang(state, 1))
    }
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
