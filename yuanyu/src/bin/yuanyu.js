#!/usr/bin/env node
/**
 * 渊鱼 CLI —— 零依赖入目审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   yuanyu audit <s1.jsonl> [s2.jsonl …] [--file <礼册>] [--duty w1,w2] [--secrets w1,w2]
 *               [--peeks w1,w2] [--no-defaults] [--gate n] [--json]
 *   yuanyu register (--duty <w1,w2> | --secrets <w1,w2> | --peeks <w1,w2>) … [--file <礼册>]
 *   yuanyu revoke (--duty <w> | --secrets <w> | --peeks <w>) [--file <礼册>]
 *   yuanyu list [--file <礼册>]
 *   yuanyu block [--file <礼册>]
 *   yuanyu gate --value <n> [--gate n]
 *   yuanyu --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册照判：audit 不带 --file 或默认册缺失时，默认秘形表照常在岗。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT } from '../core/shizhang.js'
import { emptyBook, parseBook, serializeBook, bookCount } from '../core/zuce.js'
import { renderPaizi } from '../core/jianpai.js'

const VERSION = '0.1.0'

const USAGE = `渊鱼 · yuanyu —— DeepSeek Harness 入目之禁层的离线 CLI（察见渊鱼者不祥）

用法:
  yuanyu audit <s1.jsonl> [s2.jsonl …] [选项]     审目（装载/转运对账 → 渊值 + 分带 + 门禁）
  yuanyu register --duty <w1,w2> [--secrets <..>] [--peeks <..>] [选项]
                                                  立册（登记本职形/显式秘形/显式窥词）
  yuanyu revoke (--duty <w> | --secrets <w> | --peeks <w>) [选项]
                                                  销名
  yuanyu list [选项]                              阅册（礼册 JSON）
  yuanyu block [选项]                             鉴牌块（礼册公示，逐字节确定）
  yuanyu gate --value <n> [选项]                  门禁裁决
  yuanyu --help | --version

选项:
  --file <path>      礼册文件（默认 ./.yuanyu.json；缺失时默认秘形照常在岗）
  --duty <w1,w2>     本职形（逗号分隔，与册 duty 取并集；audit/register 可用）
  --secrets <w1,w2>  显式秘形（逗号分隔，与默认表∪册取并集；audit/register 可用）
  --peeks <w1,w2>    显式窥词（逗号分隔，与默认表∪册取并集；audit/register 可用）
  --no-defaults      关默认秘形表（只认显式 secrets；白形不关；audit 可用）
  --gate <n>         渊值阈门（默认 ${GATE_DEFAULT}：≥30 为「渍」，退出码 1）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`yuanyu: ${message}`)
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

function listArg(args, name) {
  const idx = args.indexOf(name)
  if (idx === -1) return undefined
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail(`${name} 需要逗号分隔的值`)
  const items = v.split(',').filter((w) => w.length > 0)
  if (!items.length) fail(`${name} 需要至少一个值`)
  return items
}

function registryPath(args) {
  const idx = args.indexOf('--file')
  if (idx === -1) return resolve(process.cwd(), '.yuanyu.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadBook(args, { required }) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`礼册不存在: ${path}（list/block 需要已立之册）`)
    return { path, book: null }
  }
  return { path, book: parseBook(readText(path)) }
}

function saveBook(path, book) {
  writeFileSync(path, serializeBook(book))
}

function gatherOverrides(args) {
  return {
    duty: listArg(args, '--duty'),
    secrets: listArg(args, '--secrets'),
    peeks: listArg(args, '--peeks'),
    noDefaults: args.includes('--no-defaults') ? true : undefined,
  }
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
    const flagsWithValues = new Set(['--file', '--duty', '--secrets', '--peeks', '--gate'])
    // 剔除旗标与其值，只留流文件（--file/--duty/--secrets/--peeks/--gate 的值在其后一位）
    const streams = []
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (a === '--no-defaults' || a === '--json') continue
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
    const report = auditStreams(entries, {
      book,
      overrides: gatherOverrides(args),
      gate: gateValue(args),
    })
    emit(report, json)
    process.exit(report.ok ? 0 : 1)
    return
  }

  if (command === 'register') {
    const overrides = gatherOverrides(args)
    if (!overrides.duty && !overrides.secrets && !overrides.peeks) {
      fail('register 需要 --duty / --secrets / --peeks 至少一项')
    }
    const { path, book } = loadBook(args, { required: false })
    const next = book ?? emptyBook()
    const merged = { ...next }
    for (const field of ['duty', 'secrets', 'peeks']) {
      if (overrides[field]) merged[field] = [...new Set([...(next[field] ?? []), ...overrides[field]])]
    }
    saveBook(path, merged)
    console.log(`礼册已更新: ${path}（duty ${(merged.duty ?? []).length} · secrets ${(merged.secrets ?? []).length} · peeks ${(merged.peeks ?? []).length}）`)
    return
  }

  if (command === 'revoke') {
    const { path, book } = loadBook(args, { required: true })
    const next = { ...book }
    let removed = 0
    for (const field of ['duty', 'secrets', 'peeks']) {
      const v = listArg(args, `--${field}`)
      if (v) {
        for (const w of v) {
          const list = next[field] ?? []
          const i = list.indexOf(w)
          if (i === -1) fail(`${field} 无此名: ${w}`)
          list.splice(i, 1)
          removed += 1
        }
      }
    }
    if (!removed) fail('revoke 需要 --duty / --secrets / --peeks 至少一项')
    saveBook(path, next)
    console.log(`礼册已更新: ${path}（销名 ${removed}）`)
    return
  }

  if (command === 'list') {
    const { path, book } = loadBook(args, { required: true })
    emit({ file: path, entries: bookCount(book), book }, json)
    return
  }

  if (command === 'block') {
    const { book } = loadBook(args, { required: true })
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
    emit({ value, gate, band: value < 15 ? '澄' : value < 30 ? '浊' : '渍', verdict, ok: verdict === 'pass' }, json)
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
