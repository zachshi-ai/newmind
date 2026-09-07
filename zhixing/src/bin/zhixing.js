#!/usr/bin/env node
/**
 * 知行 CLI —— 零依赖知行对账审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   zhixing audit <s1.jsonl> [s2.jsonl …] [--file <凭册>] [--gate n] [--no-defaults] [--json]
 *   zhixing rule --ban <词> [--must <词>] [--exempt <词>] [--rule <径>] [--no-defaults] [--file <凭册>]
 *   zhixing show [--file <凭册>]
 *   zhixing block [--file <凭册>]
 *   zhixing gate --value <n> --score <n>
 *   zhixing --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无 --file 出默认册（知形 8 在岗、亲命空）——化知道开箱在岗，亲命无从判。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT } from '../core/xingzhang.js'
import { emptyBook, parseBook, serializeBook, addEntry } from '../core/rulebook.js'
import { renderPaizi } from '../core/hepai.js'

const VERSION = '0.1.0'

const USAGE = `知行 · zhixing —— DeepSeek Harness 知行断层层离线 CLI（知而不行，只是未知）

用法:
  zhixing audit <s1.jsonl> [s2.jsonl …] [选项]     对账（已读之凭对流中之行 → 行值 + 分带 + 门禁）
  zhixing rule --ban <词> [--must <词>] [--exempt <词>]
                 [--rule <径>] [--no-defaults] [选项]
                                                    立亲命（增条去重 upsert）
  zhixing show [选项]                              阅册（凭册 JSON）
  zhixing block [选项]                             合牌块（凭册公示 + 知面清单，逐字节确定）
  zhixing gate --value <n> --score <n>             门禁裁决
  zhixing --help | --version

选项:
  --file <path>      凭册文件（默认 ./.zhixing.json；audit 缺失时出默认册）
  --gate <n>         行值阈门（默认 ${GATE_DEFAULT}：≥30 为「悖」，退出码 1）
  --no-defaults      关默认知形 8（audit / rule 可用）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`zhixing: ${message}`)
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

function valueArg(args, name) {
  const idx = args.indexOf(name)
  if (idx === -1) return undefined
  const v = args[idx + 1]
  if (v === undefined || v.startsWith('--') || v.length === 0) fail(`${name} 需要非空值`)
  return v
}

function flagArg(args, name) {
  return args.includes(name)
}

function bookPath(args) {
  const idx = args.indexOf('--file')
  if (idx === -1) return resolve(process.cwd(), '.zhixing.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadBook(args, { required }) {
  const path = bookPath(args)
  if (!existsSync(path)) {
    if (required) fail(`凭册不存在: ${path}（show 需要已立之册；audit 无册出默认册）`)
    return { path, book: emptyBook() }
  }
  return { path, book: parseBook(readText(path)) }
}

function gateValue(args) {
  const idx = args.indexOf('--gate')
  if (idx === -1) return undefined
  const v = Number(args[idx + 1])
  if (!Number.isFinite(v) || v < 1) fail('--gate 需要 ≥1 的数字')
  return v
}

function renderReport(r, asJson) {
  if (asJson) {
    emit(
      {
        counts: r.counts,
        score: r.score,
        band: r.band,
        gate: r.gate,
        ok: r.ok,
        issues: r.issues,
        zhi: r.zhiByPath,
      },
      true,
    )
    return
  }
  const c = r.counts
  console.log(`调用 ${c.calls} · 装载 ${c.zhi} · 戒形 ${c.jie} · 降级 ${c.jiang}`)
  console.log(
    `违知 ${c.wei} · 缺行 ${c.que} · 宥 ${c.mian} · 试违 ${c.shi} · 先悖 ${c.xian}`,
  )
  for (const line of r.issues) console.log(`  · ${line}`)
  console.log(`行值 ${r.score.total} 带「${r.band}」· 门 ${r.gate} · ${r.ok ? '过门' : '门红'}`)
}

function main() {
  const argv = process.argv.slice(2)
  const command = argv[0]
  const args = argv.slice(1)

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE)
    return
  }
  if (command === '--version' || command === '-v') {
    console.log(VERSION)
    return
  }

  if (command === 'audit') {
    const streams = []
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (['--file', '--gate', '--json', '--no-defaults'].includes(a)) {
        if (a !== '--json' && a !== '--no-defaults') i++
        continue
      }
      if (a.startsWith('--')) fail(`未知旗标: ${a}`)
      streams.push(a)
    }
    if (!streams.length) fail('audit 需要至少一个会话流')
    const { book } = loadBook(args, { required: false })
    if (flagArg(args, '--no-defaults')) book.noDefaults = true
    const entries = streams.map((s) => ({ name: s, text: readText(s) }))
    const r = auditStreams(entries, { book, gate: gateValue(args) })
    renderReport(r, args.includes('--json'))
    if (!r.ok) process.exit(1)
    return
  }

  if (command === 'rule') {
    const ban = valueArg(args, '--ban')
    const must = valueArg(args, '--must')
    const exempt = valueArg(args, '--exempt')
    const rule = valueArg(args, '--rule')
    if (ban === undefined && must === undefined && exempt === undefined && rule === undefined && !flagArg(args, '--no-defaults')) {
      fail('rule 需要至少一个增条旗标（--ban/--must/--exempt/--rule/--no-defaults）')
    }
    const { path, book } = loadBook(args, { required: false })
    let next = book
    if (rule !== undefined) next = addEntry(next, 'rules', rule)
    if (ban !== undefined) next = addEntry(next, 'bans', ban)
    if (must !== undefined) next = addEntry(next, 'musts', must)
    if (exempt !== undefined) next = addEntry(next, 'exempts', exempt)
    if (flagArg(args, '--no-defaults')) next = { ...next, noDefaults: true }
    writeFileSync(path, serializeBook(next))
    console.log(`凭册已更新: ${path}`)
    return
  }

  if (command === 'show') {
    const { book } = loadBook(args, { required: true })
    emit(book, args.includes('--json'))
    return
  }

  if (command === 'block') {
    const { book } = loadBook(args, { required: false })
    console.log(renderPaizi(book, null))
    return
  }

  if (command === 'gate') {
    const value = Number(valueArg(args, '--value'))
    const score = Number(valueArg(args, '--score'))
    if (!Number.isFinite(value) || value < 1) fail('--value 需要 ≥1 的数字')
    if (!Number.isFinite(score) || score < 0) fail('--score 需要 ≥0 的数字')
    if (score >= value) {
      console.log(`行值 ${score} ≥ 门 ${value} —— 门红`)
      process.exit(1)
    }
    console.log(`行值 ${score} < 门 ${value} —— 过门`)
    return
  }

  fail(`未知命令: ${command}`)
}

main()
