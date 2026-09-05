#!/usr/bin/env node
/**
 * 名实 CLI —— 零依赖核名审计器（多流离线重放，可验尸任何历史会话）。
 *
 *   mingshi audit <s1.jsonl> [s2.jsonl …] [--file <实册>] [--gate n] [--json]
 *   mingshi register --root <glob> […] --pkg <name> […] [--pkgfile <path>] [--strict-deps] [--file <实册>]
 *   mingshi revoke --root <glob> | --pkg <name> [--file <实册>]
 *   mingshi list [--file <实册>]
 *   mingshi block [--file <实册>]
 *   mingshi gate --value <n> [--gate n]
 *   mingshi --help | --version
 *
 * 退出码：0 通过；1 门禁失败；2 用法/输入错误。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditStreams } from '../core/audit.js'
import { GATE_DEFAULT } from '../core/he.js'
import {
  emptyRegistry, parseRegistry, serializeRegistry, registryCount,
  addRoots, addPackages, setStrictDeps, revoke,
} from '../core/shi.js'
import { renderMingce } from '../core/mingce.js'

const VERSION = '0.1.0'

const USAGE = `名实 · mingshi —— DeepSeek Harness 核名层的离线 CLI（夫名，实谓也：名下无实，账上见）

用法:
  mingshi audit <s1.jsonl> [s2.jsonl …] [选项]     核名（幻包/幻径/新装·犯装/试装 → 名值 + 分带 + 门禁）
  mingshi register --root <glob> […] --pkg <name> […] [选项]  立册（登记树界与包册）
  mingshi revoke --root <glob> | --pkg <name> [选项]          销名
  mingshi list [选项]                              阅册（实册 JSON）
  mingshi block [选项]                             名册块（实册公示，逐字节确定）
  mingshi gate --value <n> [选项]                  门禁裁决
  mingshi --help | --version

选项:
  --file <path>     实册文件（默认 ./.mingshi.json）
  --gate <n>        名值阈门（默认 ${GATE_DEFAULT}：≥30 为「妄」，退出码 1）
  --json            紧凑 JSON 输出
  --root <glob>     树界声明（可重复；register）
  --pkg <name>      包名声明（可重复；register）
  --pkgfile <path>  并入 package.json 的 dependencies + devDependencies（register）
  --strict-deps     开执法态：册外装成记犯装 +30（register）

退出码: 0 通过；1 门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`mingshi: ${message}`)
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
  if (idx === -1) return resolve(process.cwd(), '.mingshi.json')
  const v = args[idx + 1]
  if (!v || v.startsWith('--')) fail('--file 需要路径')
  return resolve(v)
}

function loadRegistry(args, { required }) {
  const path = registryPath(args)
  if (!existsSync(path)) {
    if (required) fail(`实册不存在: ${path}`)
    return null
  }
  try {
    return parseRegistry(readText(path))
  } catch (error) {
    fail(`坏实册 ${path}: ${error.message}`)
  }
}

function flagValues(args, flag) {
  const out = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      const v = args[i + 1]
      if (!v || v.startsWith('--')) fail(`${flag} 需要值`)
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
  // 位置参数 = 流文件；选项与选项值在此滤除
  const clean = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '--gate') {
      i++
      continue
    }
    if (args[i] === '--json') continue
    clean.push(args[i])
  }
  if (clean.length === 0) fail('audit 需要至少一个会话流')
  const registry = loadRegistry(args, { required: hasFlag(args, '--file') })
  const gateIdx = args.indexOf('--gate')
  let gate
  if (gateIdx !== -1) {
    gate = Number(args[gateIdx + 1])
    if (!Number.isFinite(gate) || gate < 0) fail('--gate 需要非负数字')
  }
  const entries = clean.map((p) => ({ name: p, text: readText(p) }))
  let report
  try {
    report = auditStreams(entries, { registry, gate })
  } catch (error) {
    fail(error.message)
  }
  emit(report, hasFlag(args, '--json'))
  process.exit(report.verdict === 'fail' ? 1 : 0)
}

function cmdRegister(args) {
  const roots = flagValues(args, '--root')
  const pkgs = flagValues(args, '--pkg')
  const pkgfiles = flagValues(args, '--pkgfile')
  const path = registryPath(args)
  let registry = existsSync(path) ? parseRegistry(readText(path)) : emptyRegistry()
  if (roots.length === 0 && pkgs.length === 0 && pkgfiles.length === 0 && !hasFlag(args, '--strict-deps')) {
    fail('register 需要 --root / --pkg / --pkgfile / --strict-deps 之一')
  }
  for (const pf of pkgfiles) {
    let pkgJson
    try {
      pkgJson = JSON.parse(readText(pf))
    } catch (error) {
      fail(`无法读取 --pkgfile ${pf}: ${error.message}`)
    }
    const names = [
      ...Object.keys(pkgJson.dependencies ?? {}),
      ...Object.keys(pkgJson.devDependencies ?? {}),
    ]
    if (names.length === 0) fail(`--pkgfile ${pf} 没有可并入的依赖`)
    try {
      registry = addPackages(registry, names)
    } catch (error) {
      fail(error.message)
    }
  }
  try {
    if (roots.length) registry = addRoots(registry, roots)
    if (pkgs.length) registry = addPackages(registry, pkgs)
    if (hasFlag(args, '--strict-deps')) registry = setStrictDeps(registry, true)
  } catch (error) {
    fail(error.message)
  }
  writeFileSync(path, serializeRegistry(registry))
  emit({ ok: true, file: path, registryCount: registryCount(registry), roots: registry.roots, packages: registry.packages, strictDeps: registry.strictDeps }, hasFlag(args, '--json'))
}

function cmdRevoke(args) {
  const roots = flagValues(args, '--root')
  const pkgs = flagValues(args, '--pkg')
  if (roots.length + pkgs.length !== 1) fail('revoke 需要 --root 或 --pkg 恰一')
  const registry = loadRegistry(args, { required: true })
  let next
  try {
    next = revoke(registry, roots.length ? { root: roots[0] } : { pkg: pkgs[0] })
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
  console.log(renderMingce(registry))
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
