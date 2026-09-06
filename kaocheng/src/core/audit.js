/**
 * 多流合审 —— 每个流文件是一个会话，合入同一引擎出统一判词。
 * 条目形如 { name, text }（文件由 CLI 读好，core 不触文件系统）；撞名报错（exit 2）。
 * 重放同一批流必得同一判词（置吏不收贿）。
 * 契径与时序全流全局：跨会话的工据与灭据同样归并（时序按参序拼接的流序）。
 */

import { basename } from 'node:path'
import { parseStream, buildCalls } from './stream.js'
import { createEngine, recordCall, judge } from './wuzhang.js'

export function sessionName(fileName) {
  return basename(String(fileName))
}

export function auditStreams(entries, { book = null, gate = undefined } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('audit 需要至少一个会话流')
  const engine = createEngine({ book })
  const ids = []
  for (const entry of entries) {
    const id = sessionName(entry.name)
    if (ids.includes(id)) throw new Error(`会话名撞名: ${id}`)
    ids.push(id)
    const { calls } = buildCalls(parseStream(entry.text))
    for (const call of calls) {
      recordCall(engine, {
        session: id,
        ref: call.ref,
        name: call.name,
        args: call.args,
        isError: call.isError,
      })
    }
  }
  const options = {}
  if (gate !== undefined) options.gate = gate
  return judge(engine, options)
}
