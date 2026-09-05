#!/usr/bin/env node
/**
 * zhibi CLI —— 零依赖笔账审计器（契约无关，可验尸任何历史会话流）。
 *
 *   zhibi audit  <stream.jsonl> [选项]   笔账审计（讳值 + 分带 + 门禁）
 *   zhibi block  <stream.jsonl> [选项]   实录块（接缝处确定性供给件）
 *   zhibi list   [选项]                  生效笔册全文
 *   zhibi enroll [选项]                  显式登记并入册（并集去重，只增不删）
 *   zhibi gate   --value <n> [--gate n]  门禁裁决
 *   zhibi --help | --version
 *
 * 退出码：0 通过；1 门禁失败（讳值 ≥ 门）；2 用法/输入错误。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parseStream, buildCalls } from '../core/stream.js'
import { analyze, liveScore, GATE_DEFAULT } from '../core/bizhang.js'
import { createBice, DEFAULT_WORDS, DEFAULT_MASKS } from '../core/bice.js'
import { auditStream } from '../core/audit.js'
import { renderShilu } from '../core/shilu.js'

const VERSION = '0.1.0'
const REGISTER_DEFAULT = '.zhibi.json'

const USAGE = `直笔 · zhibi —— DeepSeek Harness 记录保真层的离线 CLI

用法:
  zhibi audit <stream.jsonl> [选项]     笔账审计（讳值 + 分带 + 门禁）
  zhibi block <stream.jsonl> [选项]     实录块（接缝处确定性供给件）
  zhibi list  [选项]                    生效笔册全文（JSON）
  zhibi enroll [选项]                   显式登记入册（并集去重，只增不删）
  zhibi gate --value <n> [--gate <n>]   门禁裁决
  zhibi --help | --version

选项:
  --gate <n>          讳值阈门（默认 ${GATE_DEFAULT}：≥30 为「诬」，退出码 1）
  --register <file>   笔册文件（JSON；缺省时若 ./${REGISTER_DEFAULT} 存在则载入）
  --word <正则>       显式史词（可重复；@file 逐行一条）
  --mask <正则>       显式讳形（可重复；@file 逐行一条）
  --excuse <子串>     豁免词（可重复；@file 逐行一条）
  --no-defaults       关闭默认史词/讳形两张表（豁免词本无默认）
  --json              紧凑 JSON 输出（block 时包装为 JSON）
  --value <n>         gate 子命令的待裁值
  --file <path>       enroll 的目标册文件（默认 ./${REGISTER_DEFAULT}）
  --help              显示本帮助

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`zhibi: ${message}`)
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

/** 解析 @file（逐行一条，# 注释）或单值。 */
function expandOne(v, what) {
  const out = []
  for (const part of String(v).split(',')) {
    const p = part.trim()
    if (!p) continue
    if (p.startsWith('@')) {
      const text = readText(p.slice(1))
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim()
        if (t && !t.startsWith('#')) out.push(t)
      }
    } else {
      out.push(p)
    }
  }
  if (out.length === 0) fail(`${what} 需要至少一项`)
  return out
}

function loadRegister(opts) {
  const path = opts.register ?? (existsSync(REGISTER_DEFAULT) ? REGISTER_DEFAULT : null)
  if (!path) return {}
  try {
    const obj = JSON.parse(readFileSync(path, 'utf8'))
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail(`笔册文件 ${path} 不是 JSON 对象`)
    return obj
  } catch (error) {
    fail(`笔册文件 ${path} 无法解析: ${error.message}`)
  }
}

/** 解析选项。 */
function parseOpts(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') opts.json = true
    else if (a === '--no-defaults') opts.noDefaults = true
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
    } else if (a === '--word') {
      opts.words = [...(opts.words ?? []), ...expandOne(argv[++i], '--word')]
    } else if (a === '--mask') {
      opts.masks = [...(opts.masks ?? []), ...expandOne(argv[++i], '--mask')]
    } else if (a === '--excuse') {
      opts.excuses = [...(opts.excuses ?? []), ...expandOne(argv[++i], '--excuse')]
    } else if (!a.startsWith('--')) {
      if (opts.stream != null) fail(`多余的参数：${a}（audit 恰取一流）`)
      opts.stream = a
    } else {
      fail(`未知选项：${a}`)
    }
  }
  return opts
}

/** 合并笔册文件与 CLI 选项（册为基、CLI 只增）。 */
function coreOpts(opts) {
  const reg = loadRegister(opts)
  return {
    words: [...(reg.words ?? []), ...(opts.words ?? [])].map(String),
    masks: [...(reg.masks ?? []), ...(opts.masks ?? [])].map(String),
    excuses: [...(reg.excuses ?? []), ...(opts.excuses ?? [])].map(String),
    noDefaults: reg.noDefaults === true || opts.noDefaults === true,
    gate: opts.gate,
  }
}

function effectiveRegister(copts) {
  const bice = createBice(copts)
  return {
    version: 1,
    words: bice.words.map((w) => w.re),
    masks: bice.masks.map((m) => m.re),
    excuses: bice.excuses,
    noDefaults: bice.noDefaults,
    counts: { words: bice.words.length, masks: bice.masks.length },
    defaults: { words: DEFAULT_WORDS.length, masks: DEFAULT_MASKS.length },
  }
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

  if (cmd === 'enroll') {
    if (!opts.words && !opts.masks && !opts.excuses) fail('enroll 需要 --word / --mask / --excuse 至少一项')
    const path = opts.file ?? REGISTER_DEFAULT
    let base = { version: 1, words: [], masks: [], excuses: [], noDefaults: false }
    if (existsSync(path)) {
      try {
        base = { ...base, ...JSON.parse(readFileSync(path, 'utf8')) }
      } catch (error) {
        fail(`既有册 ${path} 无法解析: ${error.message}`)
      }
    }
    const union = (a, b) => [...new Set([...(a ?? []).map(String), ...(b ?? []).map(String)])]
    const merged = {
      version: 1,
      words: union(base.words, opts.words),
      masks: union(base.masks, opts.masks),
      excuses: union(base.excuses, opts.excuses),
      noDefaults: base.noDefaults === true,
    }
    writeFileSync(path, JSON.stringify(merged, null, 2) + '\n')
    emit({ ok: true, file: path, ...merged }, opts.json)
    return
  }

  if (cmd === 'list') {
    emit(effectiveRegister(coreOpts(opts)), opts.json)
    return
  }

  if (cmd !== 'audit' && cmd !== 'block') fail(`未知命令：${cmd}`)
  if (opts.stream == null) fail(`${cmd} 子命令需要会话流路径`)

  const streamText = readText(opts.stream)
  const copts = coreOpts(opts)
  let report
  try {
    report = auditStream(streamText, copts)
  } catch (error) {
    fail(`坏流：${error.message}`)
  }

  if (cmd === 'audit') {
    emit(report, opts.json)
    process.exit(report.ok ? 0 : 1)
  }

  // block：离线重放一次，用引擎状态渲染（#1 起）
  const { calls } = buildCalls(parseStream(streamText))
  const state = analyze(calls, copts)
  state.renderCount = 1
  const text = renderShilu(state, 1, report.gate)
  if (opts.json) emit({ k: 1, text }, true)
  else console.log(text)
  process.exit(report.ok ? 0 : 1)
}

main()
