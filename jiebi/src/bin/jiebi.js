#!/usr/bin/env node
/**
 * jiebi CLI —— 零依赖判断校准器。
 *
 *   jiebi check <ledger.json>                    账本校验 + 蔽值（CI 门：超阈退出码 1）
 *   jiebi score <ledger.json>                    只算分，不设门（恒退出码 0）
 *   jiebi template [--kind diagnosis]            输出账本骨架
 *   jiebi reconcile <ledger.json> <stream.jsonl> 账实对账：宣称的证据必须真实发生过
 *   jiebi audit <stream.jsonl> [--streak N]      对比审计：单候选连击检测
 *
 * 输出一律是 JSON（stdout），人读可用 `| jq`。
 * 退出码：0 正常/通过；1 验收门失败（蔽值超阈/对账不符/有 flag）；2 用法/输入错误。
 */

import { readFileSync } from 'node:fs'
import { validateLedger, scoreLedger, makeTemplate, THRESHOLD_DEFAULT } from '../core/ledger.js'
import { parseStream } from '../core/stream.js'
import { reconcile } from '../core/reconcile.js'
import { contrastAudit } from '../core/audit.js'

const VERSION = '0.1.0'

const USAGE = `解蔽 · jiebi —— DeepSeek Harness 判断校准层的离线 CLI

用法:
  jiebi check <ledger.json> [选项]              校验账本结构并计算蔽值
  jiebi score <ledger.json>                     只输出蔽值分项，不设门
  jiebi template [--kind <k>]                   输出账本骨架（diagnosis|approach|conclusion）
  jiebi reconcile <ledger.json> <stream.jsonl>  账实对账
  jiebi audit <stream.jsonl> [选项]             对比审计（单候选连击检测）
  jiebi --help | --version

选项:
  --fail-over <n>     check 的蔽值阈门（默认 ${THRESHOLD_DEFAULT}：≥30 为「蔽」，退出码 1）
  --streak <n>        audit 的单候选连击阈值（默认 4）
  --json              紧凑 JSON（默认是缩进 JSON）
  --help              显示本帮助

退出码: 0 通过；1 验收门失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`jiebi: ${message}`)
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

function readLedger(path) {
  let obj
  try {
    obj = JSON.parse(readText(path))
  } catch (error) {
    fail(`${path} 不是合法 JSON: ${error.message}`)
  }
  const validation = validateLedger(obj)
  if (!validation.valid) {
    fail(`${path} 不是合法的解蔽账本（ledger v1）:\n${validation.issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`)
  }
  return obj
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    return 0
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`jiebi v${VERSION}`)
    return 0
  }

  const [cmd, ...rest0] = argv
  const rest = []
  let compact = false
  let failOver = THRESHOLD_DEFAULT
  let streak = null
  let kind = 'diagnosis'

  for (let i = 0; i < rest0.length; i++) {
    const a = rest0[i]
    if (a === '--json') compact = true
    else if (a === '--fail-over') {
      failOver = Number(rest0[++i])
      if (!Number.isInteger(failOver) || failOver < 0 || failOver > 100) fail('--fail-over 需要 0–100 的整数')
    } else if (a === '--streak') {
      streak = Number(rest0[++i])
      if (!Number.isInteger(streak) || streak < 1) fail('--streak 需要一个正整数')
    } else if (a === '--kind') {
      kind = rest0[++i]
      if (!kind) fail('--kind 需要一个值（diagnosis | approach | conclusion）')
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
    case 'check': {
      if (rest.length !== 1) fail('用法: jiebi check <ledger.json> [--fail-over n]')
      const ledger = readLedger(rest[0])
      const { score, band, issues } = scoreLedger(ledger)
      const pass = score < failOver
      emit(
        {
          ledger: ledger.id,
          score,
          band,
          verdict: pass ? 'pass' : 'fail',
          gate: failOver,
          issues: issues.map((i) => `${i.message} (+${i.points})`),
        },
        compact,
      )
      return pass ? 0 : 1
    }

    case 'score': {
      if (rest.length !== 1) fail('用法: jiebi score <ledger.json>')
      const ledger = readLedger(rest[0])
      emit({ ledger: ledger.id, ...scoreLedger(ledger) }, compact)
      return 0
    }

    case 'template': {
      let template
      try {
        template = makeTemplate(kind)
      } catch (error) {
        fail(error.message)
      }
      emit(template, compact)
      return 0
    }

    case 'reconcile': {
      if (rest.length !== 2) fail('用法: jiebi reconcile <ledger.json> <stream.jsonl>')
      const ledger = readLedger(rest[0])
      let events
      try {
        events = parseStream(readText(rest[1]))
      } catch (error) {
        fail(error.message)
      }
      const report = reconcile(ledger, events)
      emit(report, compact)
      return report.match ? 0 : 1
    }

    case 'audit': {
      if (rest.length !== 1) fail('用法: jiebi audit <stream.jsonl> [--streak n]')
      let report
      try {
        report = contrastAudit(readText(rest[0]), { streakThreshold: streak ?? undefined })
      } catch (error) {
        fail(error.message)
      }
      emit(report, compact)
      return report.verdict === 'flagged' ? 1 : 0
    }

    default:
      fail(`未知命令: ${cmd ?? '(空)'}\n${USAGE}`)
  }
}

process.exitCode = main(process.argv.slice(2)) ?? 0
