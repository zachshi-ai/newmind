#!/usr/bin/env node
/**
 * erbing CLI —— 零依赖柄账审计器（契约无关，可验尸任何历史会话流）。
 *
 *   erbing audit   <stream.jsonl> [选项]   柄账审计（柄值 + 分带 + 门禁）
 *   erbing cases   <stream.jsonl> [选项]   逐案清单（侵柄/渍请/有命/未遂/未判）
 *   erbing bingpai <stream.jsonl> [选项]   柄牌块（接缝处确定性供给件）
 *   erbing gate    --value <n> [--gate n]  门禁裁决
 *   erbing list    [选项]                  出册（文件册 ∪ CLI 词表的并集视图）
 *   erbing enroll  [选项]                  并集去重、只增不删地写册
 *   erbing --help | --version
 *
 * 选项：--gate <n>  --handle <词列表>  --grant <词列表>（@file 逐行一条）
 *       --register <path>（缺省 ./.erbing.json，存在即载）  --no-defaults  --json  --value
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 */

import { readFileSync, existsSync } from 'node:fs'
import { parseStream, buildRaw } from '../core/stream.js'
import { createBingzhangEngine, applyEvent, liveScore, GATE_DEFAULT } from '../core/bingzhang.js'
import { auditStream } from '../core/audit.js'
import { renderBingpai } from '../core/bingpai.js'
import { createRegister, mergeRegister, enrollRegister } from '../core/register.js'

const VERSION = '0.1.0'
const REGISTER_DEFAULT = './.erbing.json'

const USAGE = `二柄 · erbing —— DeepSeek Harness 审柄层的离线 CLI

用法:
  erbing audit <stream.jsonl> [选项]     柄账审计（柄值 + 分带 + 门禁）
  erbing cases <stream.jsonl> [选项]     逐案清单（侵柄/渍请/有命/未遂/未判）
  erbing bingpai <stream.jsonl> [选项]   柄牌块（接缝处确定性供给件）
  erbing gate --value <n> [选项]         门禁裁决
  erbing list [选项]                     出册（文件册 ∪ CLI 词表的并集视图）
  erbing enroll [选项]                   并集去重、只增不删地写 .erbing.json
  erbing --help | --version

选项:
  --gate <n>          柄值阈门（默认 ${GATE_DEFAULT}：≥30 为「倒持」，退出码 1）
  --handle <词列表>   显式登记柄事词（逗号分隔子串；@file 逐行一条）
  --grant <词列表>    显式登记授词（逗号分隔子串；@file 逐行一条）
  --register <path>   册文件路径（缺省 ./.erbing.json，存在即载）
  --no-defaults       关闭默认形表（纯显式册）
  --json              紧凑 JSON 输出（bingpai 时包装为 JSON）
  --value <n>         gate 子命令的待裁值
  --help              显示本帮助

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`erbing: ${message}`)
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

/** 解析词表：逗号分隔子串，@file 逐行一条（# 与空行跳过）。 */
function expandWords(raw) {
  const out = []
  for (const part of String(raw).split(',')) {
    const p = part.trim()
    if (!p) continue
    if (p.startsWith('@')) {
      const text = readText(p.slice(1))
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

function parseOpts(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') opts.json = true
    else if (a === '--no-defaults') opts.noDefaults = true
    else if (a === '--gate') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 0) fail('--gate 需要非负数字')
      opts.gate = n
    } else if (a === '--value') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n)) fail('--value 需要数字')
      opts.value = n
    } else if (a === '--handle') {
      const v = argv[++i]
      if (!v) fail('--handle 需要词列表')
      opts.handle = expandWords(v)
    } else if (a === '--grant') {
      const v = argv[++i]
      if (!v) fail('--grant 需要词列表')
      opts.grant = expandWords(v)
    } else if (a === '--register') {
      const v = argv[++i]
      if (!v) fail('--register 需要路径')
      opts.register = v
    } else if (!a.startsWith('--')) {
      if (opts.stream != null) fail(`多余的参数：${a}`)
      opts.stream = a
    } else {
      fail(`未知选项：${a}`)
    }
  }
  return opts
}

/** 合成生效柄册：册文件（存在时）∪ CLI 词表。 */
function effectiveRegister(opts) {
  const path = opts.register ?? REGISTER_DEFAULT
  const file = existsSync(path) ? (() => {
    try {
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      fail(`坏册 ${path}: ${error.message}`)
    }
  })() : {}
  const cli = createRegister({ handle: opts.handle, grant: opts.grant, noDefaults: opts.noDefaults })
  return mergeRegister(file, cli)
}

function coreOpts(opts) {
  const reg = effectiveRegister(opts)
  return { gate: opts.gate, handle: reg.handle, grant: reg.grant, noDefaults: reg.noDefaults }
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
    const reg = effectiveRegister(opts)
    emit(reg, opts.json)
    return
  }

  if (cmd === 'enroll') {
    const path = opts.register ?? REGISTER_DEFAULT
    const merged = enrollRegister(path, { handle: opts.handle, grant: opts.grant, noDefaults: opts.noDefaults })
    emit({ enrolled: path, register: merged }, opts.json)
    return
  }

  if (cmd !== 'audit' && cmd !== 'cases' && cmd !== 'bingpai') fail(`未知命令：${cmd}`)
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

  if (cmd === 'cases') {
    const by = (kind) => report.caseList.filter((c) => c.kind === kind)
    const payload = {
      score: report.score,
      band: report.band,
      gate: report.gate,
      qinCases: by('侵柄'),
      duCases: by('渍请'),
      warranted: by('有命'),
      feints: by('未遂'),
      undetermined: by('未判'),
    }
    if (opts.json) emit(payload, true)
    else {
      for (const c of payload.qinCases) {
        console.log(`#${c.seq} ${c.tool}｜${c.familyLabel}｜侵柄 +${c.scored}${c.declareItems > 0 ? `（显式 ${c.declareItems} 件）` : ''}${c.asked ? '｜请而未待命' : ''}｜${c.excerpt}`)
      }
      for (const c of payload.duCases) console.log(`#${c.seq}｜渍请 +${c.scored}｜已答重渎｜${c.excerpt}`)
      for (const c of payload.warranted) console.log(`#${c.seq} ${c.tool}｜${c.familyLabel}｜有命（先授之凭 @主文#${c.warrantPos}）｜${c.excerpt}`)
      for (const c of payload.feints) console.log(`#${c.seq} ${c.tool}｜${c.familyLabel}｜未遂（不计分）｜${c.excerpt}`)
      for (const c of payload.undetermined) console.log(`#${c.seq} ${c.tool}｜${c.familyLabel}｜未判（案前无主文，静默观察）｜${c.excerpt}`)
      if (report.caseList.length === 0) console.log('（无决形命中、无渎请——账面干净）')
    }
    process.exit(report.ok ? 0 : 1)
  }

  // bingpai：离线重放一次，用引擎状态渲染（#1 起）
  const reg = coreOpts(opts)
  const { items } = buildRaw(parseStream(streamText))
  const engine = createBingzhangEngine(reg)
  for (const item of items) applyEvent(engine, item)
  const text = renderBingpai(engine, 1, report.gate)
  if (opts.json) emit({ k: 1, text }, true)
  else console.log(text)
  process.exit(report.ok ? 0 : 1)
}

main()
