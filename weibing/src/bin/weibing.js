#!/usr/bin/env node
/**
 * weibing CLI —— 零依赖开工体检器。
 *
 *   weibing template                            输出任务书契约骨架
 *   weibing charter <charter.json>              契约 schema 校验
 *   weibing exam <charter.json> [选项]           四诊体检 [+ 病值门禁]
 *   weibing prescribe <charter.json> [选项]      医嘱块（纯文本供给物）
 *   weibing lexicon [选项]                       输出生效词表（含 --lexicon 扩展）
 *
 * 输出：template / charter / exam / lexicon 为 JSON（stdout），prescribe 为纯文本（--json 包装）。
 * 退出码：0 通过/正常；1 病值门禁失败；2 用法/输入错误。
 */

import { readFileSync } from 'node:fs'
import { validateCharter, makeTemplate } from '../core/charter.js'
import { runExam, GATE_DEFAULT } from '../core/exam.js'
import { renderPrescribe } from '../core/prescribe.js'
import { mergeLexicon, DEFAULT_UNBOUNDED, DEFAULT_VAGUE } from '../core/lexicon.js'

const VERSION = '0.1.0'

const USAGE = `治未病 · weibing —— DeepSeek Harness 开工体检层的离线 CLI

用法:
  weibing template                        输出任务书契约骨架
  weibing charter <charter.json>          契约 schema 校验
  weibing exam <charter.json> [选项]       四诊体检 + 病值门禁
  weibing prescribe <charter.json> [选项]  医嘱块（纯文本供给物）
  weibing lexicon [选项]                   输出生效词表
  weibing --help | --version

选项:
  --gate <n>        exam 的病值门（默认 ${GATE_DEFAULT}：≥40 为「病」，退出码 1）
  --cwd <dir>       切诊的体检根（文件/产物探针的基准；不设则文件探针诚实 unprobed）
  --lexicon <file>  追加险兆词表（{unbounded:[], vague:[]}）
  --json            紧凑 JSON；prescribe 包装为 JSON
  --help            显示本帮助

退出码: 0 通过/正常；1 病值门禁失败；2 用法/输入错误。`

function fail(message, code = 2) {
  console.error(`weibing: ${message}`)
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

function readCharter(path) {
  let obj
  try {
    obj = JSON.parse(readText(path))
  } catch (error) {
    fail(`${path} 不是合法 JSON: ${error.message}`)
  }
  const validation = validateCharter(obj)
  if (!validation.valid) {
    fail(`${path} 不是合法的任务书契约（charter v1）:\n${validation.issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`)
  }
  return obj
}

function readLexicon(path) {
  let obj
  try {
    obj = JSON.parse(readText(path))
  } catch (error) {
    fail(`${path} 不是合法 JSON: ${error.message}`)
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    fail(`${path} 不是合法词表：应为 {"unbounded":[],"vague":[]}`)
  }
  return obj
}

function intOption(value, flag, min = 0) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min) fail(`${flag} 需要一个 ≥${min} 的整数`)
  return n
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    return 0
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`weibing v${VERSION}`)
    return 0
  }

  const [cmd, ...rest0] = argv
  const rest = []
  let compact = false
  let gate = GATE_DEFAULT
  let cwd = null
  let lexiconPath = null

  for (let i = 0; i < rest0.length; i++) {
    const a = rest0[i]
    if (a === '--json') compact = true
    else if (a === '--gate') gate = intOption(rest0[++i], '--gate')
    else if (a === '--cwd') {
      cwd = rest0[++i]
      if (!cwd) fail('--cwd 需要一个目录')
    } else if (a === '--lexicon') {
      lexiconPath = rest0[++i]
      if (!lexiconPath) fail('--lexicon 需要一个文件')
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
    case 'template': {
      emit(makeTemplate(), compact)
      return 0
    }

    case 'charter': {
      if (rest.length !== 1) fail('用法: weibing charter <charter.json>')
      const charter = readCharter(rest[0])
      emit({ charter: charter.id, valid: true, brief: String(charter.brief).trim().split('\n')[0] }, compact)
      return 0
    }

    case 'exam': {
      if (rest.length !== 1) fail('用法: weibing exam <charter.json> [选项]')
      const charter = readCharter(rest[0])
      const lexicon = lexiconPath ? readLexicon(lexiconPath) : null
      let report
      try {
        report = runExam(charter, { cwd, gate, lexicon })
      } catch (error) {
        fail(`体检失败: ${error.message}`)
      }
      emit(report, compact)
      return report.ok ? 0 : 1
    }

    case 'prescribe': {
      if (rest.length !== 1) fail('用法: weibing prescribe <charter.json> [选项]')
      const charter = readCharter(rest[0])
      const lexicon = lexiconPath ? readLexicon(lexiconPath) : null
      let text
      try {
        text = renderPrescribe(charter, runExam(charter, { cwd, gate, lexicon }))
      } catch (error) {
        fail(`处方笺渲染失败: ${error.message}`)
      }
      if (compact) emit({ text }, true)
      else process.stdout.write(text)
      return 0
    }

    case 'lexicon': {
      emit(lexiconPath ? mergeLexicon(readLexicon(lexiconPath)) : { unbounded: DEFAULT_UNBOUNDED, vague: DEFAULT_VAGUE }, compact)
      return 0
    }

    default:
      fail(`未知命令: ${cmd ?? '(空)'}\n${USAGE}`)
  }
}

process.exitCode = main(process.argv.slice(2)) ?? 0
