#!/usr/bin/env node
/**
 * zhengnian CLI —— 零依赖本愿审计器。
 *
 *   zhengnian template                          输出契约骨架
 *   zhengnian contract <wish.json>              契约 schema 校验
 *   zhengnian reanchor <wish.json> [--stream s] 输出拂拭块（供给物是上下文，不是报告，故为纯文本）
 *   zhengnian audit <wish.json> <stream.jsonl>  尘值审计 [+ --acceptance 终验门]
 *
 * 输出：audit / contract / template 为 JSON（stdout），reanchor 为纯文本（--json 包装）。
 * 退出码：0 正常/通过；1 验收门失败（尘值超阈/终验未对账）；2 用法/输入错误。
 */

import { readFileSync } from 'node:fs'
import { validateContract, makeTemplate, MAX_STALE_DEFAULT } from '../core/contract.js'
import { auditStream } from '../core/audit.js'
import { renderReanchor } from '../core/reanchor.js'
import { dustScore, THRESHOLD_DEFAULT } from '../core/dust.js'
import { parseStream, buildCalls } from '../core/stream.js'

const VERSION = '0.1.0'

const USAGE = `正念 · zhengnian —— DeepSeek Harness 本愿守护层的离线 CLI

用法:
  zhengnian template                              输出本愿契约骨架
  zhengnian contract <wish.json>                  契约 schema 校验
  zhengnian reanchor <wish.json> [选项]            输出拂拭块（纯文本供给物）
  zhengnian audit <wish.json> <stream.jsonl> [选项] 尘值审计 + 终验门
  zhengnian --help | --version

选项:
  --gate <n>        audit 的尘值阈门（默认 ${THRESHOLD_DEFAULT}：≥30 为「蒙」，退出码 1）
  --acceptance      audit 开启终验门：契约终验未对账 → 退出码 1
  --cwd <dir>       artifact 类终验的文件系统核对根
  --max-stale <n>   息尘的拂拭间隔阈值（默认 ${MAX_STALE_DEFAULT}）
  --window <n>      失念窗口覆盖契约默认（默认 10）
  --stream <file>   reanchor 携带会话流（出现尘值行）
  --json            audit/contract 紧凑 JSON；reanchor 包装为 JSON
  --help            显示本帮助

退出码: 0 通过；1 验收门失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`zhengnian: ${message}`)
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

function readContract(path) {
  let obj
  try {
    obj = JSON.parse(readText(path))
  } catch (error) {
    fail(`${path} 不是合法 JSON: ${error.message}`)
  }
  const validation = validateContract(obj)
  if (!validation.valid) {
    fail(`${path} 不是合法的本愿契约（contract v1）:\n${validation.issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`)
  }
  return obj
}

function intOption(value, flag, min = 1) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min) fail(`${flag} 需要一个 ≥${min} 的整数`)
  return n
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    return 0
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`zhengnian v${VERSION}`)
    return 0
  }

  const [cmd, ...rest0] = argv
  const rest = []
  let compact = false
  let gate = THRESHOLD_DEFAULT
  let acceptance = false
  let cwd = null
  let maxStale = null
  let window = null
  let streamPath = null

  for (let i = 0; i < rest0.length; i++) {
    const a = rest0[i]
    if (a === '--json') compact = true
    else if (a === '--acceptance') acceptance = true
    else if (a === '--gate') gate = intOption(rest0[++i], '--gate', 0)
    else if (a === '--max-stale') maxStale = intOption(rest0[++i], '--max-stale')
    else if (a === '--window') window = intOption(rest0[++i], '--window')
    else if (a === '--cwd') {
      cwd = rest0[++i]
      if (!cwd) fail('--cwd 需要一个目录')
    } else if (a === '--stream') {
      streamPath = rest0[++i]
      if (!streamPath) fail('--stream 需要一个文件')
    } else if (a === '--') {
      rest.push(...rest0.slice(i + 1))
      break
    } else if (a.startsWith('--')) {
      fail(`未知选项: ${a}`)
    } else {
      rest.push(a)
    }
  }

  switch (cmd) {
    case 'template': {
      emit(makeTemplate(), compact)
      return 0
    }

    case 'contract': {
      if (rest.length !== 1) fail('用法: zhengnian contract <wish.json>')
      const contract = readContract(rest[0])
      emit({ contract: contract.id, valid: true, wish: contract.wish }, compact)
      return 0
    }

    case 'reanchor': {
      if (rest.length !== 1) fail('用法: zhengnian reanchor <wish.json> [--stream s.jsonl]')
      const contract = readContract(rest[0])
      if (!streamPath) {
        const text = renderReanchor(contract, null)
        if (compact) emit({ text }, true)
        else process.stdout.write(text)
        return 0
      }
      let calls
      let marks
      try {
        const { calls: c, marks: m } = buildCalls(parseStream(readText(streamPath)))
        calls = c
        marks = m
      } catch (error) {
        fail(error.message)
      }
      const dust = dustScore(contract, calls, marks, { window, maxStale })
      const text = renderReanchor(contract, {
        k: 1,
        score: dust.score,
        forget: dust.breakdown.forget,
        grasp: dust.breakdown.grasp,
        cadence: dust.breakdown.cadence,
      })
      if (compact) emit({ text }, true)
      else process.stdout.write(text)
      return 0
    }

    case 'audit': {
      if (rest.length !== 2) fail('用法: zhengnian audit <wish.json> <stream.jsonl> [选项]')
      const contract = readContract(rest[0])
      let report
      try {
        report = auditStream(contract, readText(rest[1]), {
          gate,
          acceptance,
          cwd,
          maxStale,
          window,
        })
      } catch (error) {
        fail(error.message)
      }
      emit(report, compact)
      return report.ok ? 0 : 1
    }

    default:
      fail(`未知命令: ${cmd ?? '(空)'}\n${USAGE}`)
  }
}

process.exitCode = main(process.argv.slice(2)) ?? 0
