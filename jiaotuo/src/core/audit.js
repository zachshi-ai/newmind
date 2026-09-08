/**
 * 多流合审 —— 每个流文件是一个会话，合入同一引擎出统一判词。
 * 条目形如 { name, text }（文件由 CLI 读好，core 不触文件系统）；撞名报错（exit 2）。
 * 重放同一批流必得同一判词（置吏不收贿）。
 *
 * 合审序（docs/03 §2 锁死）：若各流**全部**调用的 at 皆为有限数 → 全局稳定排序键
 * (at, 流序, 流内序)；否则按参序拼接（审计方须自证流序）。诏册全局：跨会话的
 * 诏账与托面同样归并（甲会话装载的章程可供乙会话的引案对账——合审即全库）。
 */

import { basename } from 'node:path'
import { parseStream, buildCalls } from './stream.js'
import { createEngine, recordCall, judge } from './yinzhang.js'

export function sessionName(fileName) {
  return basename(String(fileName))
}

export function auditStreams(entries, { book = null, gate = undefined } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('audit 需要至少一个会话流')
  const engine = createEngine({ book })

  const perStream = []
  const ids = []
  for (const entry of entries) {
    const id = sessionName(entry.name)
    if (ids.includes(id)) throw new Error(`会话名撞名: ${id}`)
    ids.push(id)
    const { calls } = buildCalls(parseStream(entry.text))
    perStream.push(calls)
  }

  const allAt = perStream.every((calls) => calls.every((c) => typeof c.at === 'number' && Number.isFinite(c.at)))
  const plan = []
  perStream.forEach((calls, si) => {
    calls.forEach((call, ci) => plan.push({ call, si, ci }))
  })
  if (allAt) {
    plan.sort((a, b) => {
      if (a.call.at !== b.call.at) return a.call.at - b.call.at
      if (a.si !== b.si) return a.si - b.si
      return a.ci - b.ci
    })
  } // 否则保持参序拼接

  for (const { call, si } of plan) {
    recordCall(engine, {
      session: ids[si],
      ref: call.ref,
      name: call.name,
      args: call.args,
      isError: call.isError,
      content: call.content,
    })
  }

  const options = {}
  if (gate !== undefined) options.gate = gate
  return judge(engine, options)
}
