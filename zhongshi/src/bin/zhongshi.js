#!/usr/bin/env node
/**
 * zhongshi CLI —— 零依赖程账审计器（契约无关，可验尸任何历史会话流）。
 *
 *   zhongshi audit  <stream.jsonl>… [选项]   逐项审计（程值 + 分带 + 门禁；多流按参序拼接）
 *   zhongshi ledger <stream.jsonl>… [选项]   逐事清单（案别/始末序号/空终/失序）
 *   zhongshi kuai   <stream.jsonl>… [选项]   程账块（续跑图；--json 包装）
 *   zhongshi gate   --value <n> [--gate n]   门禁裁决
 *   zhongshi list   [选项]                   出册
 *   zhongshi enroll --item '<json>' [选项]   立事（按 id 并集去重，只增不删）
 *   zhongshi --help | --version
 *
 * 选项：--gate <n>  --register <path>（缺省 ./.zhongshi.json）  --item '<json>'
 *       --json  --value <n>
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误（含无册不判）。
 */

import { readFileSync, existsSync } from 'node:fs'
import { parseStream, buildCalls } from '../core/stream.js'
import { analyze, liveScore, GATE_DEFAULT } from '../core/chengzhang.js'
import { auditStream } from '../core/audit.js'
import { renderChengkuai } from '../core/chengkuai.js'
import {
  loadRegister,
  validateRegister,
  enrollRegister,
  createRegister,
  normalizeItem,
} from '../core/shice.js'

const VERSION = '0.1.0'
const REGISTER_DEFAULT = './.zhongshi.json'

const USAGE = `终始 · zhongshi —— DeepSeek Harness 记程层的离线 CLI

用法:
  zhongshi audit <stream.jsonl>… [选项]     逐项审计（程值 + 分带 + 门禁；多流按参序拼接）
  zhongshi ledger <stream.jsonl>… [选项]    逐事清单（案别/始末序号/空终/失序）
  zhongshi kuai <stream.jsonl>… [选项]      程账块（中断续跑的交接班记录）
  zhongshi gate --value <n> [选项]          门禁裁决
  zhongshi list [选项]                      出册（items ∪ order 视图）
  zhongshi enroll --item '<json>' [选项]    立事（按 id 并集去重，只增不删）
  zhongshi --help | --version

选项:
  --gate <n>          程值阈门（默认 ${GATE_DEFAULT}：≥30 为「无终」，退出码 1）
  --register <path>   事册路径（缺省 ./.zhongshi.json；审计时无册不判 → 退出码 2）
  --item '<json>'     enroll 的立事条目（{"id":"T5","name":"…","aliases":[…],"terminal":[…]}）
  --json              紧凑 JSON 输出（kuai 时包装为 JSON）
  --value <n>         gate 子命令的待裁值
  --help              显示本帮助

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`zhongshi: ${message}`)
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

function parseOpts(argv) {
  const opts = { streams: [] }
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
    } else if (a === '--register') {
      const v = argv[++i]
      if (!v) fail('--register 需要路径')
      opts.register = v
    } else if (a === '--item') {
      const v = argv[++i]
      if (!v) fail('--item 需要 JSON 条目')
      opts.item = v
    } else if (!a.startsWith('--')) {
      opts.streams.push(a)
    } else {
      fail(`未知选项：${a}`)
    }
  }
  return opts
}

/** 载入并校验事册：审计类命令要求册在且立事——无册不判（声明权在任务方）。 */
function effectiveRegister(opts, { required }) {
  const path = opts.register ?? REGISTER_DEFAULT
  if (!existsSync(path)) {
    if (required) fail(`事册缺席（${path}）：终始审的是显式立事，无册不判——先 enroll 或写 .zhongshi.json`)
    return createRegister()
  }
  try {
    const reg = loadRegister(path)
    if (required) validateRegister(reg)
    if (required && reg.items.length === 0) fail(`事册无立事（${path}）：无册不判`)
    return reg
  } catch (error) {
    fail(`坏册 ${path}: ${error.message}`)
  }
}

function coreOpts(opts, reg) {
  return { gate: opts.gate, items: reg.items, order: reg.order }
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

  if (cmd === 'list') {
    const reg = effectiveRegister(opts, { required: false })
    emit(reg, opts.json)
    return
  }

  if (cmd === 'enroll') {
    if (!opts.item) fail('enroll 需要 --item \'<json>\'')
    let raw
    try {
      raw = JSON.parse(opts.item)
    } catch (error) {
      fail(`--item 不是合法 JSON: ${error.message}`)
    }
    try {
      normalizeItem(raw)
    } catch (error) {
      fail(`--item 条目不合法: ${error.message}`)
    }
    const path = opts.register ?? REGISTER_DEFAULT
    try {
      const merged = enrollRegister(path, { items: [raw] })
      emit({ enrolled: path, register: merged }, opts.json)
    } catch (error) {
      fail(`写册失败: ${error.message}`)
    }
    return
  }

  if (cmd !== 'audit' && cmd !== 'ledger' && cmd !== 'kuai') fail(`未知命令：${cmd}`)
  if (opts.streams.length === 0) fail(`${cmd} 子命令至少需要一个会话流路径`)

  const reg = effectiveRegister(opts, { required: true })
  const streamTexts = opts.streams.map(readText)
  let report
  try {
    report = auditStream(streamTexts, coreOpts(opts, reg))
  } catch (error) {
    fail(`坏流：${error.message}`)
  }

  if (cmd === 'audit') {
    emit(report, opts.json)
    process.exit(report.ok ? 0 : 1)
  }

  if (cmd === 'ledger') {
    if (opts.json) {
      emit(
        {
          score: report.score,
          band: report.band,
          gate: report.gate,
          items: report.items,
          kongList: report.kongList,
          violations: report.violations,
        },
        true,
      )
    } else {
      for (const s of report.items) {
        const trail =
          s.status === '幽项'
            ? '全流无作工'
            : s.status === '有终'
              ? `始#${s.startSeq} 终#${s.terminalSeq}`
              : s.status === '半途'
                ? `始#${s.startSeq} 末作#${s.lastWorkSeq}`
                : `弃#${s.abandonSeq}`
        const note = s.status === '半途' && s.noTerminalDeclared ? '（未宣终形）' : ''
        console.log(`${s.id} ${s.name}｜${s.status}｜${trail}${note}`)
      }
      for (const c of report.kongList) {
        console.log(`${c.itemId} ${c.name}｜空终｜终#${c.terminalSeq} 后复作于#${c.workSeq}`)
      }
      for (const v of report.violations) {
        console.log(`失序｜立序 ${v.order[0]}→${v.order[1]}｜${v.order[1]} 始#${v.bStartSeq} 早于 ${v.order[0]} 终#${v.aTerminalSeq}`)
      }
      if (report.items.length === 0) console.log('（册上无立事）')
      console.log(`程值 ${report.score.total}（${report.band}），门 ${report.gate}，判 ${report.verdict}`)
    }
    process.exit(report.ok ? 0 : 1)
  }

  // kuai：离线重放一次，用引擎状态渲染（#1 起）
  const { calls } = buildCalls(parseStream(streamTexts.join('\n')))
  const engine = analyze(calls, coreOpts(opts, reg))
  const text = renderChengkuai(engine, 1, report.gate)
  if (opts.json) emit({ k: 1, text }, true)
  else console.log(text)
  process.exit(report.ok ? 0 : 1)
}

main()
