#!/usr/bin/env node
/**
 * zhizhi CLI —— 零依赖审计器。
 *
 *   zhizhi audit <stream.jsonl>                  what-if 审计：当时装了知止会拦几次？
 *   zhizhi audit --gated <stream.jsonl>          对运行时导出的事件流对账
 *   zhizhi audit --fail-on-unverified <file>     CI 门：存在"无验证证据的 turn"则退出码 1
 *
 * 输出一律是 JSON（stdout），人读可用 `| jq`。
 * 退出码：0 正常；1 验收门失败；2 用法/输入错误。
 */

import { readFileSync } from 'node:fs'
import { auditStream, parseStream } from '../core/audit.js'

const USAGE = `知止 · zhizhi —— DeepSeek Harness 行为节制层的离线审计器

用法:
  zhizhi audit [选项] <stream.jsonl>
  zhizhi --help | --version

选项:
  --gated                输入是知止运行时导出的事件流（默认 whatif 模式）
  --fail-on-unverified   存在没有任何验证证据的 turn 时，verdict=fail、退出码 1
  --threshold <n>        止损阈值（默认 3：连续失败 3 次后拦第 4 次）
  --json                 与默认输出相同（始终为 JSON）；为脚本可读性保留
  --help                 显示本帮助

事件流格式: JSONL，每行一个事件对象（见 docs/03-design.md）。`

function fail(message, code = 2) {
  console.error(`zhizhi: ${message}`)
  process.exit(code)
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    return 0
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log('zhizhi v0.1.0')
    return 0
  }

  const [cmd, ...args] = argv
  const rest = []
  let gated = false
  let failOnUnverified = false
  let threshold = null

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--gated') gated = true
    else if (a === '--fail-on-unverified') failOnUnverified = true
    else if (a === '--json') { /* 输出本来就是 JSON */ }
    else if (a === '--threshold') {
      threshold = Number(args[++i])
      if (!Number.isInteger(threshold) || threshold < 1) fail('--threshold 需要一个正整数')
    } else if (a === '--') {
      rest.push(...args.slice(i + 1))
      break
    } else if (a.startsWith('--')) {
      fail(`未知选项: ${a}`)
    } else {
      rest.push(a)
    }
  }

  if (cmd !== 'audit') fail(`未知命令: ${cmd ?? '(空)'}\n${USAGE}`)
  if (rest.length === 0) fail('缺少输入文件（zhizhi audit <stream.jsonl>）')
  if (rest.length > 1) fail(`只接受一个输入文件，得到 ${rest.length} 个`)

  let text
  try {
    text = readFileSync(rest[0], 'utf8')
  } catch (error) {
    fail(`无法读取 ${rest[0]}: ${error.message}`)
  }

  let report
  try {
    report = auditStream(text, {
      mode: gated ? 'gated' : 'whatif',
      failOnUnverified,
      ...(threshold ? { stopLoss: { threshold } } : {}),
    })
  } catch (error) {
    fail(error.message)
  }

  console.log(JSON.stringify(report, null, 2))
  return report.verdict === 'fail' ? 1 : 0
}

process.exit(main(process.argv.slice(2)))
