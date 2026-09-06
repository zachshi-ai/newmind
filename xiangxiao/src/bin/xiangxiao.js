#!/usr/bin/env node
/**
 * 乡校 CLI —— 零依赖谏诤审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   xiangxiao audit <s1.jsonl> [s2.jsonl …] [--file <声册>] [--mute w1,w2] [--gate n] [--json]
 *   xiangxiao register --mute <word> [--form <re>] [--file <声册>]
 *   xiangxiao revoke --mute <word> | --form <re> [--file <声册>]
 *   xiangxiao list [--file <声册>]
 *   xiangxiao block [--file <声册>]
 *   xiangxiao gate --value <n> [--gate n]
 *   xiangxiao --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 * 无册照判：audit 不带 --file 或默认册缺失时，默认形表照常在岗。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT } from '../core/shengzhang.js'
import {
  emptyRegistry, parseRegistry, serializeRegistry, registryCount,
  addMutes, addForms, revoke,
} from '../core/shengce.js'
import { renderJianpai } from '../core/jianpai.js'

const VERSION = '0.1.0'

const USAGE = `乡校 · xiangxiao —— DeepSeek Harness 谏诤通道层的离线 CLI（是吾师也，若之何毁之）

用法:
  xiangxiao audit <s1.jsonl> [s2.jsonl …] [选项]    审声（缄笔/避检/略测 → 壅值 + 分带 + 门禁）
  xiangxiao register --mute <word> [--form <re>] [选项]  立册（登记豁免词与显式形）
  xiangxiao revoke --mute <word> | --form <re> [选项]    销名
  xiangxiao list [选项]                             阅册（声册 JSON）
  xiangxiao block [选项]                            谏牌块（声册公示，逐字节确定）
  xiangxiao gate --value <n> [选项]                 门禁裁决
  xiangxiao --help | --version

选项:
  --file <path>     声册文件（默认 ./.xiangxiao.json；缺失时默认形照常在岗）
  --mute <w1,w2>    豁免词（逗号分隔，与声册 mute 取并集；audit 可用）
  --form <re>       显式形（正则源字符串；register 可用，可重复）
  --gate <n>        壅值阈门（默认 ${GATE_DEFAULT}：≥30 为「毁」，退出码 1）
  --json            紧凑 JSON 输出

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`xiangxiao: ${message}`)
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

function registryPath(args) {
  const idx = args.indexOf('--file')
  if (idx === -1) return resolve(process.cwd(), '.xiangxiao.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadRegistry(args, { required }) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`声册不存在: ${path}`)
    return null
  }
  try {
    return parseRegistry(readText(path))
  } catch (error) {
    fail(`坏声册 ${path}: ${error.message}`)
  }
}

function flagValues(args, flag, { dashOk = false } = {}) {
  const out = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      const v = args[i + 1]
      // dashOk：--form 的值合法地以 -- 开头（如 --no-verify 词形），不视为缺值
      if (!v || (!dashOk && v.startsWith('--'))) fail(`${flag} 需要值`)
      out.push(v)
    }
  }
  return out
}

function hasFlag(args, flag) {
  return args.includes(flag)
}

// ---------------------------------------------------------------- commands

function cmdAudit(args) {
  const clean = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '--gate' || args[i] === '--mute') {
      i++
      continue
    }
    if (args[i] === '--json') continue
    clean.push(args[i])
  }
  if (clean.length === 0) fail('audit 需要至少一个会话流')
  const registry = loadRegistry(args, { required: hasFlag(args, '--file') })
  const mutes = flagValues(args, '--mute').flatMap((v) => v.split(',')).filter((w) => w.length > 0)
  const gateIdx = args.indexOf('--gate')
  let gate
  if (gateIdx !== -1) {
    gate = Number(args[gateIdx + 1])
    if (!Number.isFinite(gate) || gate < 0) fail('--gate 需要非负数字')
  }
  const entries = clean.map((p) => ({ name: p, text: readText(p) }))
  let report
  try {
    report = auditStreams(entries, { registry, mutes, gate })
  } catch (error) {
    fail(error.message)
  }
  emit(report, hasFlag(args, '--json'))
  process.exit(report.verdict === 'fail' ? 1 : 0)
}

function cmdRegister(args) {
  const mutes = flagValues(args, '--mute').flatMap((v) => v.split(',')).filter((w) => w.length > 0)
  const forms = flagValues(args, '--form', { dashOk: true })
  const path = registryPath(args)
  let registry = existsSync(path) ? parseRegistry(readText(path)) : emptyRegistry()
  if (mutes.length === 0 && forms.length === 0) {
    fail('register 需要 --mute / --form 之一')
  }
  try {
    if (mutes.length) registry = addMutes(registry, mutes)
    if (forms.length) registry = addForms(registry, forms)
  } catch (error) {
    fail(error.message)
  }
  writeFileSync(path, serializeRegistry(registry))
  emit({ ok: true, file: path, registryCount: registryCount(registry), mute: registry.mute, forms: registry.forms, noDefaults: registry.noDefaults }, hasFlag(args, '--json'))
}

function cmdRevoke(args) {
  const mutes = flagValues(args, '--mute').flatMap((v) => v.split(',')).filter((w) => w.length > 0)
  const forms = flagValues(args, '--form', { dashOk: true })
  if (mutes.length + forms.length !== 1) fail('revoke 需要 --mute 或 --form 恰一')
  const registry = loadRegistry(args, { required: true })
  let next
  try {
    next = revoke(registry, mutes.length ? { mute: mutes[0] } : { form: forms[0] })
  } catch (error) {
    fail(error.message)
  }
  const path = registryPath(args)
  writeFileSync(path, serializeRegistry(next))
  emit({ ok: true, file: path, registryCount: registryCount(next) }, hasFlag(args, '--json'))
}

function cmdList(args) {
  const registry = loadRegistry(args, { required: true })
  emit(registry, hasFlag(args, '--json'))
}

function cmdBlock(args) {
  const registry = loadRegistry(args, { required: true })
  console.log(renderJianpai(registry))
}

function cmdGate(args) {
  const idx = args.indexOf('--value')
  if (idx === -1 || !args[idx + 1]) fail('gate 需要 --value <n>')
  const value = Number(args[idx + 1])
  if (!Number.isFinite(value)) fail('--value 需要数字')
  const gateIdx = args.indexOf('--gate')
  let gate = GATE_DEFAULT
  if (gateIdx !== -1) {
    gate = Number(args[gateIdx + 1])
    if (!Number.isFinite(gate)) fail('--gate 需要数字')
  }
  const verdict = value >= gate ? 'fail' : 'pass'
  emit({ value, gate, verdict, ok: verdict === 'pass', band: null }, hasFlag(args, '--json'))
  process.exit(verdict === 'fail' ? 1 : 0)
}

// ---------------------------------------------------------------- main

const argv = process.argv.slice(2)
const cmd = argv[0]
const rest = argv.slice(1)

if (cmd === '--version' || cmd === '-v') {
  console.log(VERSION)
} else if (cmd === '--help' || cmd === '-h' || !cmd) {
  console.log(USAGE)
} else if (cmd === 'audit') {
  cmdAudit(rest)
} else if (cmd === 'register') {
  cmdRegister(rest)
} else if (cmd === 'revoke') {
  cmdRevoke(rest)
} else if (cmd === 'list') {
  cmdList(rest)
} else if (cmd === 'block') {
  cmdBlock(rest)
} else if (cmd === 'gate') {
  cmdGate(rest)
} else {
  fail(`未知命令: ${cmd}`)
}
