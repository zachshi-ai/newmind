/**
 * 离线审计 —— 对一份事件流做确定性重放，产出知止报告。
 *
 * 两种模式：
 *
 *   whatif（默认）  输入是"裸"会话流（每次调用都有结果，调用真的发生过）。
 *                   审计逐条重放 guard()，回答"如果当时装了知止，
 *                   哪些调用会被拦截"——一次拦截 = 省下一轮完整模型往返。
 *                   被判拦截的调用，其结果不再进入引擎（模拟调用没发生）。
 *
 *   gated           输入是知止运行时导出的事件流（被拦调用无结果，
 *                   且带 tool_denied 事件）。审计重放 guard() 并与运行时
 *                   的拦截决定逐条对账 —— 运行时与离线必须完全一致，
 *                   这是对"确定性"承诺本身的检验。
 *
 * 单遍重放：guard 的拦截理由在重放现场原样捕获，不做事后重建 ——
 * 报告里的每一个字都与运行时逐字一致。
 *
 * 事件格式（每行一个 JSON 对象，即 zhizhi stream）：
 *   { type:'turn_start'|'turn_end', id, at }
 *   { type:'tool_call',   name, args, at }
 *   { type:'tool_result', name, args, isError, errorDigest, at }
 *   { type:'tool_denied', name, args, rule, at }
 */

import { createEngine, normalizeOptions } from './engine.js'
import { isVerificationCommand } from './fingerprint.js'

function parseLine(raw) {
  const line = String(raw ?? '').trim()
  if (!line || line.startsWith('#') || line.startsWith('//')) return null
  const ev = JSON.parse(line)
  if (!ev || typeof ev !== 'object' || typeof ev.type !== 'string') {
    throw new Error(`事件缺少 type 字段: ${line.slice(0, 80)}`)
  }
  return ev
}

/** 从文本解析事件流（JSONL；容忍注释与空行）。 */
export function parseStream(text) {
  const events = []
  for (const [i, raw] of String(text ?? '').split('\n').entries()) {
    try {
      const ev = parseLine(raw)
      if (ev) events.push(ev)
    } catch (error) {
      throw new Error(`第 ${i + 1} 行解析失败: ${error.message}`)
    }
  }
  return events
}

/** 命令提取：与引擎 observe 一致的 args 约定。 */
function commandOf(args) {
  if (!args || typeof args !== 'object') return ''
  const cmd = args.command ?? args.cmd ?? args.script ?? ''
  return typeof cmd === 'string' ? cmd : ''
}

/**
 * 重放事件流并产出审计报告。
 * @param {Array|object} input - 事件数组，或 JSONL 文本
 * @param {object} options - 引擎配置 + { mode?: 'whatif'|'gated', failOnUnverified?: boolean }
 */
export function auditStream(input, options = {}) {
  const { mode = 'whatif', failOnUnverified = false, ...engineOptions } = options
  const events = Array.isArray(input) ? input : parseStream(input)
  const opts = normalizeOptions(engineOptions)
  const engine = createEngine(engineOptions)

  let current = null
  let skipNextResult = false
  let callsTotal = 0
  const turns = []
  const interceptedCalls = []
  const runtimeDenials = [] // gated 流中运行时的拦截序列

  const openTurn = (id, at) => {
    current = { id: id ?? turns.length + 1, calls: 0, intercepted: 0, evidence: 0, startedAt: at ?? null, endedAt: null }
  }
  const closeTurn = () => {
    if (!current) return
    current.verified = current.calls > 0 && current.evidence > 0
    turns.push(current)
    current = null
  }

  for (const ev of events) {
    if (ev.type === 'turn_start') {
      closeTurn()
      openTurn(ev.id, ev.at)
      engine.markTurn('start', ev.id, ev.at)
      continue
    }
    if (ev.type === 'turn_end') {
      if (current) current.endedAt = ev.at ?? null
      closeTurn()
      engine.markTurn('end', ev.id, ev.at)
      continue
    }
    if (ev.type === 'tool_denied') {
      if (mode === 'gated') runtimeDenials.push({ name: ev.name, rule: ev.rule ?? null })
      continue
    }
    if (ev.type === 'tool_call') {
      if (!current) openTurn(undefined, ev.at)
      current.calls++
      callsTotal++
      const verdict = engine.guard(ev)
      if (verdict.decision === 'deny') {
        current.intercepted++
        interceptedCalls.push({
          turn: current.id,
          name: ev.name,
          rule: verdict.rule,
          reason: verdict.reason,
          at: ev.at ?? null,
        })
        if (mode === 'whatif') skipNextResult = true
      }
      continue
    }
    if (ev.type === 'tool_result') {
      if (skipNextResult) {
        skipNextResult = false
        continue
      }
      engine.observe(ev)
      if (!ev.isError && ev.name === opts.verify.bashTool &&
          isVerificationCommand(commandOf(ev.args), opts.verify.patterns)) {
        if (current) current.evidence++
      }
    }
  }
  closeTurn()

  const unverified = turns.filter(t => t.calls > 0 && !t.verified)
  const report = {
    mode,
    totals: {
      calls: callsTotal,
      intercepted: interceptedCalls.length,
      interceptedByRule: interceptedCalls.reduce((acc, i) => {
        acc[i.rule] = (acc[i.rule] ?? 0) + 1
        return acc
      }, {}),
      turns: turns.length,
      evidence: turns.reduce((sum, t) => sum + t.evidence, 0),
    },
    turns,
    unverifiedTurns: unverified.map(t => ({ id: t.id, calls: t.calls })),
    interceptedCalls,
    waste: {
      // 一轮被拦截的调用 = 省下一次完整的模型往返（请求 + 响应 + 上下文重算）
      savedRoundTrips: interceptedCalls.length,
      humanUnit: `${interceptedCalls.length} 轮模型往返`,
    },
  }

  if (mode === 'gated') {
    report.consistency = {
      runtimeDenied: runtimeDenials.length,
      replayDenied: interceptedCalls.length,
      match:
        runtimeDenials.length === interceptedCalls.length &&
        runtimeDenials.every((d, i) => d.name === interceptedCalls[i].name && d.rule === interceptedCalls[i].rule),
    }
  }

  report.verdict = failOnUnverified && unverified.length > 0 ? 'fail' : 'pass'
  return report
}
