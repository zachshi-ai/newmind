#!/usr/bin/env node
/**
 * lunshi CLI —— 零依赖渠道账审计器（契约无关，可验尸任何历史会话流）。
 *
 *   lunshi audit <stream.jsonl> [--gate n] [--words f] [--json]   渠道账审计（越权值 + 分带 + 门禁）
 *   lunshi gao <stream.jsonl> [--words f] [--json]                诫块（默认纯文本）
 *   lunshi gate --value <n> [--gate <n>]                          门禁裁决
 *   lunshi --help | --version
 *
 * 退出码：0 通过；1 门禁失败（越权值 ≥ 门）；2 用法/输入错误。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseStream, buildRaw } from '../core/stream.js'
import { computeAccount, GATE_DEFAULT } from '../core/qudao.js'
import { auditStream } from '../core/audit.js'
import { normalizeWords } from '../core/words.js'
import { renderGao } from '../core/gao.js'

const VERSION = '0.1.0'

const USAGE = `论世 · lunshi —— DeepSeek Harness 渠道权界层的离线 CLI

用法:
  lunshi audit <stream.jsonl> [选项]     渠道账审计（越权值 + 分带 + 门禁）
  lunshi gao <stream.jsonl> [选项]       诫块（涉命块的权界清单）
  lunshi gate --value <n> [选项]         门禁裁决
  lunshi --help | --version

选项:
  --gate <n>        越权值阈门（默认 ${GATE_DEFAULT}：≥30 为「僭」，退出码 1）
  --words <file>    追加越词表（JSON 字符串数组；与默认表取并集）
  --json            紧凑 JSON 输出（gao 时包装为 JSON）
  --value <n>       gate 子命令的待裁值
  --help            显示本帮助

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`lunshi: ${message}`)
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

/** 读取追加词表文件：JSON 字符串数组；坏文件 exit 2。 */
function readWords(path) {
  let parsed
  try {
    parsed = JSON.parse(readText(path))
  } catch (error) {
    fail(`词表 ${path} 不是合法 JSON: ${error.message}`)
  }
  if (!Array.isArray(parsed)) fail(`词表 ${path} 必须是字符串数组`)
  return normalizeWords(parsed)
}

/** 解析 --gate / --json / --words / --value 形式的选项。 */
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
    } else if (a === '--words') {
      const p = argv[++i]
      if (!p) fail('--words 需要文件路径')
      opts.wordsPath = p
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
    const words = opts.wordsPath ? readWords(opts.wordsPath) : undefined
    let report
    try {
      report = auditStream(readText(opts.stream), { gate: opts.gate, words })
    } catch (error) {
      fail(`流解析失败：${error.message}`)
    }
    emit(report, opts.json)
    return report.ok ? 0 : 1
  }
  if (cmd === 'gao') {
    const opts = parseOpts(argv.slice(1))
    if (opts.stream == null) fail('gao 需要会话流文件')
    const words = opts.wordsPath ? readWords(opts.wordsPath) : undefined
    let acc
    try {
      acc = computeAccount(buildRaw(parseStream(readText(opts.stream))), normalizeWords(words))
    } catch (error) {
      fail(`流解析失败：${error.message}`)
    }
    if (opts.json) {
      emit(
        {
          k: 1,
          tainted: acc.counts.tainted,
          usurped: acc.counts.usurped,
          text: renderGao(acc, 1),
        },
        true
      )
    } else {
      console.log(renderGao(acc, 1))
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
