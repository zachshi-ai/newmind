#!/usr/bin/env node
/**
 * baihe CLI —— 零依赖境账审计器（契约无关，可验尸任何历史会话流）。
 *
 *   baihe audit  <stream.jsonl> [选项]   境账审计（溃值 + 分带 + 门禁）
 *   baihe leaks  <stream.jsonl> [选项]   逐案泄物清单（掩码）
 *   baihe hemen  <stream.jsonl> [选项]   阖门块（默认纯文本，--json 包装）
 *   baihe gate   --value <n> [--gate n]  门禁裁决
 *   baihe --help | --version
 *
 * 退出码：0 通过；1 门禁失败（溃值 ≥ 门）；2 用法/输入错误。
 */

import { readFileSync } from 'node:fs'
import { parseStream, buildCalls } from '../core/stream.js'
import { analyze, liveScore, GATE_DEFAULT } from '../core/jingzhang.js'
import { auditStream } from '../core/audit.js'
import { renderHemen } from '../core/hemen.js'

const VERSION = '0.1.0'

const USAGE = `捭阖 · baihe —— DeepSeek Harness 出域权界层的离线 CLI

用法:
  baihe audit <stream.jsonl> [选项]     境账审计（溃值 + 分带 + 门禁）
  baihe leaks <stream.jsonl> [选项]     逐案泄物清单（掩码）
  baihe hemen <stream.jsonl> [选项]     阖门块（接缝处确定性供给件）
  baihe gate --value <n> [选项]         门禁裁决
  baihe --help | --version

选项:
  --gate <n>        溃值阈门（默认 ${GATE_DEFAULT}：≥30 为「溃」，退出码 1）
  --allow <域列表>  内域白名单（逗号分隔，如 api.internal.corp；回环恒为内域）
  --declare <清单>  显式登记敏感物（逗号分隔子串；@file 逐行一条）
  --json            紧凑 JSON 输出（hemen 时包装为 JSON）
  --value <n>       gate 子命令的待裁值
  --help            显示本帮助

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`baihe: ${message}`)
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

/** 解析 --declare 清单：逗号分隔子串，@file 逐行一条。 */
function expandDeclare(raw) {
  const out = []
  for (const part of String(raw).split(',')) {
    const p = part.trim()
    if (!p) continue
    if (p.startsWith('@')) {
      const file = p.slice(1)
      const text = readText(file)
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim()
        if (t && !t.startsWith('#')) out.push(t)
      }
    } else {
      out.push(p)
    }
  }
  return out
}

/** 解析 --gate / --allow / --declare / --json / --value 形式的选项。 */
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
    } else if (a === '--allow') {
      const v = argv[++i]
      if (!v) fail('--allow 需要域列表')
      opts.allow = v.split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a === '--declare') {
      const v = argv[++i]
      if (!v) fail('--declare 需要登记清单')
      opts.declare = expandDeclare(v)
    } else if (!a.startsWith('--')) {
      if (opts.stream != null) fail(`多余的参数：${a}`)
      opts.stream = a
    } else {
      fail(`未知选项：${a}`)
    }
  }
  return opts
}

function coreOpts(opts) {
  return { gate: opts.gate, allow: opts.allow, declare: opts.declare }
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

  if (cmd !== 'audit' && cmd !== 'leaks' && cmd !== 'hemen') fail(`未知命令：${cmd}`)
  if (opts.stream == null) fail(`${cmd} 子命令需要会话流路径`)

  const streamText = readText(opts.stream)
  let report
  try {
    report = auditStream(streamText, coreOpts(opts))
  } catch (error) {
    fail(`坏流：${error.message}`)
  }

  if (cmd === 'audit') {
    emit(report, opts.json)
    process.exit(report.ok ? 0 : 1)
  }

  if (cmd === 'leaks') {
    const leaks = report.caseList.filter((c) => c.kind === '泄物')
    const shichu = report.caseList.filter((c) => c.kind === '试出')
    const payload = {
      score: report.score,
      band: report.band,
      gate: report.gate,
      leakCases: leaks,
      shichuCases: shichu,
    }
    if (opts.json) emit(payload, true)
    else {
      for (const c of leaks) {
        console.log(`#${c.seq} ${c.tool} → ${c.host}（+${c.scored}）`)
        for (const h of c.hits) console.log(`  - ${h.label}｜${h.excerpt}`)
      }
      for (const c of shichu) {
        console.log(`#${c.seq} ${c.tool} → ${c.host}（试出，不计分）`)
        for (const h of c.hits) console.log(`  - ${h.label}｜${h.excerpt}`)
      }
      if (leaks.length === 0 && shichu.length === 0) console.log('（无泄物案、无试出案）')
    }
    process.exit(report.ok ? 0 : 1)
  }

  // hemen：离线重放一次，用引擎状态渲染（#1 起）
  const { calls } = buildCalls(parseStream(streamText))
  const state = analyze(calls, coreOpts(opts))
  state.renderCount = 1
  const text = renderHemen(state, 1, report.gate)
  if (opts.json) emit({ k: 1, text }, true)
  else console.log(text)
  process.exit(report.ok ? 0 : 1)
}

main()
