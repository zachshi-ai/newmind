#!/usr/bin/env node
/**
 * youya CLI —— 零依赖见闻账审计器（契约无关，可验尸任何历史会话流）。
 *
 *   youya audit <stream.jsonl> [--gate n] [--json]   见闻账审计（殆值 + 分带 + 门禁）
 *   youya yaoji <stream.jsonl> [--json]              要籍块（默认纯文本）
 *   youya gate --value <n> [--gate <n>]              门禁裁决
 *   youya --help | --version
 *
 * 退出码：0 通过；1 门禁失败（殆值 ≥ 门）；2 用法/输入错误。
 */

import { readFileSync } from 'node:fs'
import { parseStream, buildCalls } from '../core/stream.js'
import { analyze, chenAccounts, GATE_DEFAULT } from '../core/jianwen.js'
import { auditStream } from '../core/audit.js'
import { renderYaoji } from '../core/yaoji.js'

const VERSION = '0.1.0'

const USAGE = `有涯 · youya —— DeepSeek Harness 见闻记忆层的离线 CLI

用法:
  youya audit <stream.jsonl> [选项]     见闻账审计（殆值 + 分带 + 门禁）
  youya yaoji <stream.jsonl> [选项]     要籍块（账内工作集地图）
  youya gate --value <n> [选项]         门禁裁决
  youya --help | --version

选项:
  --gate <n>        殆值阈门（默认 ${GATE_DEFAULT}：≥30 为「折」，退出码 1）
  --json            紧凑 JSON 输出（yaoji 时包装为 JSON）
  --value <n>       gate 子命令的待裁值
  --help            显示本帮助

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`youya: ${message}`)
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
  if (cmd === 'yaoji') {
    const opts = parseOpts(argv.slice(1))
    if (opts.stream == null) fail('yaoji 需要会话流文件')
    let state
    try {
      const { calls } = buildCalls(parseStream(readText(opts.stream)))
      state = analyze(calls)
    } catch (error) {
      fail(`流解析失败：${error.message}`)
    }
    if (opts.json) {
      emit({ k: 1, chen: chenAccounts(state).length, text: renderYaoji(state, 1) }, true)
    } else {
      console.log(renderYaoji(state, 1))
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
