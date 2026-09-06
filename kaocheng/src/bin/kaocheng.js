#!/usr/bin/env node
/**
 * 考诚 CLI —— 零依赖交付契约审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   kaocheng audit <s1.jsonl> [s2.jsonl …] [--file <契册>] [--gate n] [--json]
 *   kaocheng register --name <名> --path <径> [--form json|text] [--fields f1,f2]
 *                     [--words w1,w2] [--min-lines n] [--file <契册>]
 *   kaocheng revoke --name <名> [--file <契册>]
 *   kaocheng list [--file <契册>]
 *   kaocheng block [--file <契册>]
 *   kaocheng gate --value <n> [--gate n]
 *   kaocheng --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册不判：audit 不带 --file 或默认册缺失时出 contractless 报告（0 分诚带 exit 0 + 治理发现注记）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT, bandOf } from '../core/wuzhang.js'
import { emptyBook, parseBook, parseItem, serializeBook, bookCount } from '../core/qice.js'
import { renderPaizi } from '../core/kaopai.js'

const VERSION = '0.1.0'

const USAGE = `考诚 · kaocheng —— DeepSeek Harness 交付契约层的离线 CLI（物勒工名，以考其诚）

用法:
  kaocheng audit <s1.jsonl> [s2.jsonl …] [选项]     考物（契约对物之末据 → 诚值 + 分带 + 门禁）
  kaocheng register --name <名> --path <径> [--form json|text]
                    [--fields f1,f2] [--words w1,w2] [--min-lines n] [选项]
                                                    立契（同名 upsert——显式改契）
  kaocheng revoke --name <名> [选项]                销契
  kaocheng list [选项]                              阅册（契册 JSON）
  kaocheng block [选项]                             考牌块（契册公示，逐字节确定；无册出确定性文本）
  kaocheng gate --value <n> [选项]                  门禁裁决
  kaocheng --help | --version

选项:
  --file <path>      契册文件（默认 ./.kaocheng.json；缺失时 audit 无册不判）
  --form <json|text> 结形（register 可用；缺省 text）
  --fields <f1,f2>   域条（json 顶层必含之键，逗号分隔）
  --words <w1,w2>    词条（末据必含之子串，逗号分隔）
  --min-lines <n>    卷条（末据真实行数下限，正整数）
  --gate <n>         诚值阈门（默认 ${GATE_DEFAULT}：≥30 为「欺」，退出码 1）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`kaocheng: ${message}`)
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
  if (!v || v.startsWith('--')) fail(`${name} 需要值`)
  return v
}

function listArg(args, name) {
  const v = valueArg(args, name)
  if (v === undefined) return undefined
  const items = v.split(',').filter((w) => w.length > 0)
  if (!items.length) fail(`${name} 需要至少一个值`)
  return items
}

function registryPath(args) {
  const idx = args.indexOf('--file')
  if (idx === -1) return resolve(process.cwd(), '.kaocheng.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadBook(args, { required }) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`契册不存在: ${path}（list 需要已立之册；audit 无册不判）`)
    return { path, book: null }
  }
  return { path, book: parseBook(readText(path)) }
}

function saveBook(path, book) {
  writeFileSync(path, serializeBook(book))
}

function gateValue(args) {
  const idx = args.indexOf('--gate')
  if (idx === -1) return undefined
  const v = Number(args[idx + 1])
  if (!Number.isFinite(v) || v < 1) fail('--gate 需要 ≥1 的数字')
  return v
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

  const json = args.includes('--json')

  if (command === 'audit') {
    const flagsWithValues = new Set(['--file', '--gate'])
    // 剔除旗标与其值，只留流文件（--file/--gate 的值在其后一位）
    const streams = []
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (a === '--json') continue
      if (flagsWithValues.has(a)) {
        i++
        continue
      }
      if (a.startsWith('--')) fail(`未知旗标: ${a}`)
      streams.push(a)
    }
    if (!streams.length) fail('audit 需要至少一个会话流文件')
    const { book } = loadBook(args, { required: false })
    const entries = streams.map((f) => ({ name: f, text: readText(f) }))
    const report = auditStreams(entries, { book, gate: gateValue(args) })
    emit(report, json)
    process.exit(report.ok ? 0 : 1)
    return
  }

  if (command === 'register') {
    const raw = {
      name: valueArg(args, '--name'),
      path: valueArg(args, '--path'),
    }
    if (!raw.name) fail('register 需要 --name <名>')
    if (!raw.path) fail('register 需要 --path <径>')
    const form = valueArg(args, '--form')
    if (form !== undefined) raw.form = form
    const fields = listArg(args, '--fields')
    if (fields !== undefined) raw.fields = fields
    const words = listArg(args, '--words')
    if (words !== undefined) raw.words = words
    const ml = valueArg(args, '--min-lines')
    if (ml !== undefined) {
      const n = Number(ml)
      if (!Number.isInteger(n) || n < 1) fail('--min-lines 需要正整数')
      raw.minLines = n
    }
    const item = parseItem(raw) // 形校验复用（form/minLines/fields/words 违者抛错 → exit 2）
    const { path, book } = loadBook(args, { required: false })
    const next = book ?? emptyBook()
    const idx = next.items.findIndex((it) => it.name === item.name)
    if (idx === -1) next.items.push(item)
    else next.items[idx] = item // 同名 upsert——显式改契
    saveBook(path, next)
    console.log(`契册已更新: ${path}（物 ${next.items.length} 件）`)
    return
  }

  if (command === 'revoke') {
    const name = valueArg(args, '--name')
    if (!name) fail('revoke 需要 --name <名>')
    const { path, book } = loadBook(args, { required: true })
    const idx = book.items.findIndex((it) => it.name === name)
    if (idx === -1) fail(`契册无此名: ${name}`)
    book.items.splice(idx, 1)
    saveBook(path, book)
    console.log(`契册已更新: ${path}（销契 ${name}，余 ${book.items.length} 件）`)
    return
  }

  if (command === 'list') {
    const { path, book } = loadBook(args, { required: true })
    emit({ file: path, entries: bookCount(book), book }, json)
    return
  }

  if (command === 'block') {
    const { book } = loadBook(args, { required: false })
    console.log(renderPaizi(book))
    return
  }

  if (command === 'gate') {
    const idx = args.indexOf('--value')
    if (idx === -1) fail('gate 需要 --value <n>')
    const value = Number(args[idx + 1])
    if (!Number.isFinite(value)) fail('--value 需要数字')
    const gate = gateValue(args) ?? GATE_DEFAULT
    const verdict = value >= gate ? 'fail' : 'pass'
    emit({ value, gate, band: bandOf(value), verdict, ok: verdict === 'pass' }, json)
    process.exit(verdict === 'pass' ? 0 : 1)
    return
  }

  fail(`未知命令: ${command}（--help 查看用法）`)
}

try {
  main()
} catch (error) {
  fail(error?.message ?? String(error), 2) // 坏 JSON 行 / 坏册等输入错误 → exit 2
}
