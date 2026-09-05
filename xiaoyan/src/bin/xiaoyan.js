#!/usr/bin/env node
/**
 * 效验 CLI —— 零依赖（docs/03 §10）。
 *
 *   xiaoyan audit <stream.jsonl> [--gate <n>] [--words <file>] [--exempt <file>] [--json]
 *   xiaoyan zheng <stream.jsonl> [--words <file>] [--exempt <file>] [--json]
 *   xiaoyan gate --value <n> [--gate <n>]
 *   xiaoyan --help | --version
 *
 * exit：0 干净／未超门，1 超门（audit/gate），2 用法错误或坏流坏词表。
 */

import { readFileSync } from 'node:fs'
import { auditStream } from '../core/audit.js'
import { GATE_DEFAULT } from '../core/xiao.js'
import { renderZheng } from '../core/zheng.js'
import { normalizeWords } from '../core/words.js'

const VERSION = '0.1.0'

function fail(message) {
  console.error(`xiaoyan: ${message}`)
  process.exit(2)
}

function readStream(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    fail(`流文件不可读: ${path}`)
  }
  try {
    return auditStream(text, {})
  } catch (error) {
    fail(`${path}: ${error.message}`)
  }
}

function loadWords(path, what) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`坏${what}表 ${path}: ${error.message}`)
  }
  if (!Array.isArray(parsed) || !parsed.every((w) => typeof w === 'string')) {
    fail(`坏${what}表 ${path}: 须为字符串数组`)
  }
  return normalizeWords(parsed)
}

function usage() {
  console.log(`效验 xiaoyan —— DeepSeek Harness 的成色审计层（论衡疾虚妄 × Agent 空转成功）

用法:
  xiaoyan audit <stream.jsonl> [--gate <n>] [--words <file>] [--exempt <file>] [--json]
      效账审计：三问判定（空言/回令/离效/陈效）→ 效值 + 分带 + 门禁
  xiaoyan zheng <stream.jsonl> [--words <file>] [--exempt <file>] [--json]
      证块：接缝处的成色清单（默认纯文本，--json 包装）
  xiaoyan gate --value <n> [--gate <n>]
      门禁裁决（按效值对门判 0/1）
  xiaoyan --help | --version

exit: 0 干净 ｜ 1 超门 ｜ 2 坏流/坏词表/用法错误`)
}

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') flags.json = true
    else if (a === '--gate') flags.gate = Number(argv[++i])
    else if (a === '--words') flags.words = argv[++i]
    else if (a === '--exempt') flags.exempt = argv[++i]
    else if (a === '--value') flags.value = argv[++i]
    else if (a === '--help' || a === '-h') flags.help = true
    else if (a === '--version' || a === '-v') flags.version = true
    else positional.push(a)
  }
  return { positional, flags }
}

export function main(argv = process.argv.slice(2)) {
  const { positional, flags } = parseArgs(argv)

  if (flags.help) {
    usage()
    process.exit(0)
  }
  if (flags.version) {
    console.log(VERSION)
    process.exit(0)
  }

  const command = positional[0]

  if (command === 'gate') {
    if (flags.value === undefined) fail('gate 需要 --value <n>')
    const value = Number(flags.value)
    if (!Number.isFinite(value)) fail(`--value 不是数字: ${flags.value}`)
    const gate = Number.isFinite(flags.gate) ? flags.gate : GATE_DEFAULT
    const ok = value < gate
    const out = { value, gate, verdict: ok ? 'pass' : 'fail', ok }
    console.log(JSON.stringify(out, null, 2))
    process.exit(ok ? 0 : 1)
  }

  if (command === 'audit' || command === 'zheng') {
    const streamPath = positional[1]
    if (!streamPath) fail(`${command} 需要 <stream.jsonl>`)
    const words = flags.words ? loadWords(flags.words, '效词') : []
    const exempt = flags.exempt ? loadWords(flags.exempt, '免验') : []

    let text
    try {
      text = readFileSync(streamPath, 'utf8')
    } catch {
      fail(`流文件不可读: ${streamPath}`)
    }

    let account
    try {
      account = auditStream(text, { words, exempt, gate: flags.gate })
    } catch (error) {
      fail(`${streamPath}: ${error.message}`)
    }

    if (command === 'audit') {
      console.log(JSON.stringify(account, null, flags.json ? 0 : 2))
      process.exit(account.ok ? 0 : 1)
    }

    const block = {
      text: renderZheng(account, 1),
      k: 1,
      vacuous: account.counts.vacuous,
      echo: account.counts.echo,
      stray: account.counts.stray,
      stale: account.counts.stale,
    }
    if (flags.json) console.log(JSON.stringify(block, null, 0))
    else console.log(block.text)
    process.exit(0)
  }

  usage()
  process.exit(command === undefined ? 0 : 2)
}

main()
