#!/usr/bin/env node
/**
 * 水土 CLI —— 零依赖察土审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   shuitu audit <s1.jsonl> [s2.jsonl …] [--file <土册>] [--install w1,w2]
 *               [--config w1,w2] [--reside w1,w2] [--gate n] [--json]
 *   shuitu register (--install <w1,w2> | --config <w1,w2> | --reside <w1,w2>) … [--file <土册>]
 *   shuitu revoke (--install <w> | --config <w> | --reside <w>) [--file <土册>]
 *   shuitu list [--file <土册>]
 *   shuitu block [--file <土册>]
 *   shuitu gate --value <n> [--gate n]
 *   shuitu --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册照判：audit 不带 --file 或默认册缺失时，默认形表照常在岗。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT, bandOf } from '../core/gaizhang.js'
import { emptyBook, parseBook, serializeBook, bookCount } from '../core/tuce.js'
import { renderTupai } from '../core/tupai.js'

const VERSION = '0.1.0'

const USAGE = `水土 · shuitu —— DeepSeek Harness 环境水土层的离线 CLI（橘生淮南则为橘，生于淮北则为枳）

用法:
  shuitu audit <s1.jsonl> [s2.jsonl …] [选项]     审土（改动/复位对账 → 异值 + 分带 + 门禁）
  shuitu register (--install <w1,w2> | --config <w1,w2> | --reside <w1,w2>) … [选项]
                                                  立册（登记三族豁免词）
  shuitu revoke (--install <w> | --config <w> | --reside <w>) [选项]
                                                  销名
  shuitu list [选项]                              阅册（土册 JSON）
  shuitu block [选项]                             土牌块（土册公示，逐字节确定）
  shuitu gate --value <n> [选项]                  门禁裁决
  shuitu --help | --version

选项:
  --file <path>      土册文件（默认 ./.shuitu.json；缺失时默认形表照常在岗）
  --install <w1,w2>  装族豁免词（逗号分隔，与册 install 取并集）
  --config <w1,w2>   改族豁免词（逗号分隔，与册 config 取并集）
  --reside <w1,w2>   驻族豁免词（逗号分隔，与册 reside 取并集）
  --gate <n>         异值阈门（默认 ${GATE_DEFAULT}：≥30 为「枳」，退出码 1）
  --json             紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`shuitu: ${message}`)
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
  if (idx === -1) return resolve(process.cwd(), '.shuitu.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadBook(args, { required }) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`土册不存在: ${path}（list/block 需要已立之册）`)
    return { path, book: null }
  }
  return { path, book: parseBook(readText(path)) }
}

function saveBook(path, book) {
  writeFileSync(path, serializeBook(book))
}

function gatherOverrides(args) {
  return {
    install: listArg(args, '--install'),
    config: listArg(args, '--config'),
    reside: listArg(args, '--reside'),
  }
}

function gateValue(args) {
  const idx = args.indexOf('--gate')
  if (idx === -1) return undefined
  const v = Number(args[idx + 1])
  if (!Number.isFinite(v) || v < 1) fail('--gate 需要 ≥1 的数字')
  return v
}

const FIELDS = ['install', 'config', 'reside']

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
    const flagsWithValues = new Set(['--file', '--install', '--config', '--reside', '--gate'])
    // 剔除旗标与其值，只留流文件
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
    if (!overrides.install && !overrides.config && !overrides.reside) {
      fail('register 需要 --install / --config / --reside 至少一项')
    }
    const { path, book } = loadBook(args, { required: false })
    const next = book ?? emptyBook()
    const merged = { ...next }
    for (const field of FIELDS) {
      if (overrides[field]) merged[field] = [...new Set([...(next[field] ?? []), ...overrides[field]])]
    }
    saveBook(path, merged)
    console.log(`土册已更新: ${path}（install ${(merged.install ?? []).length} · config ${(merged.config ?? []).length} · reside ${(merged.reside ?? []).length}）`)
    return
  }

  if (command === 'revoke') {
    const { path, book } = loadBook(args, { required: true })
    const next = { ...book }
    let removed = 0
    for (const field of FIELDS) {
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
    if (!removed) fail('revoke 需要 --install / --config / --reside 至少一项')
    saveBook(path, next)
    console.log(`土册已更新: ${path}（销名 ${removed}）`)
    return
  }

  if (command === 'list') {
    const { path, book } = loadBook(args, { required: true })
    emit({ file: path, entries: bookCount(book), book }, json)
    return
  }

  if (command === 'block') {
    const { book } = loadBook(args, { required: true })
    console.log(renderTupai(book))
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
