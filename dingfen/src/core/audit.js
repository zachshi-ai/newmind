/**
 * 审争 —— 多流离线重放：N 个流文件合入同一引擎，出统一判词。
 *
 * 一个流文件 = 一个会话；会话 id = 文件名去 .jsonl 后缀（撞名报错）。
 * 报告字段序锁死（docs/04 A4 的输出样例即此序）。
 */

import { basename } from 'node:path'
import { parseStream, buildCalls } from './stream.js'
import { createEngine, recordCall, judge, GATE_DEFAULT } from './zheng.js'

/** 会话名：文件名去 .jsonl 后缀。 */
export function sessionName(fileName) {
  const base = basename(String(fileName))
  return base.endsWith('.jsonl') ? base.slice(0, -'.jsonl'.length) : base
}

/**
 * entries: [{ name, text }]；registry: 分册对象（可缺）；gate: 门。
 * 坏 JSON / 会话 id 撞名 → 抛错（CLI 转 exit 2）。
 */
export function auditStreams(entries, { registry = null, gate = GATE_DEFAULT } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('audit 需要至少一个会话流')
  const engine = createEngine()
  const ids = []
  for (const entry of entries) {
    const id = sessionName(entry.name)
    if (ids.includes(id)) throw new Error(`会话 id 撞名：${id}`)
    ids.push(id)
    const { calls } = buildCalls(parseStream(entry.text))
    for (const call of calls) {
      recordCall(engine, { session: id, ref: call.ref, name: call.name, args: call.args, isError: call.isError, at: call.at })
    }
  }
  const res = judge(engine, { registry, gate })
  return {
    sessions: ids.length,
    calls: engine.calls.length,
    writes: engine.writes.length,
    score: res.score,
    band: res.band,
    gate: res.gate,
    verdict: res.verdict,
    ok: res.ok,
    counts: res.counts,
    issues: buildIssues(res),
    // 明细（审计可下钻：逐条争写/共写/侵入/越分与无时、未领名单）
    strifeSpots: res.strifeSpots,
    coWriteKeys: res.coWriteKeys,
    trespassEntries: res.trespassEntries,
    strayEntries: res.strayEntries,
    timelessKeys: res.timelessKeys,
    unclaimedSessions: res.unclaimedSessions,
  }
}

/** 判词（确定性措辞与序：争写 → 共写 → 侵入 → 越分 → 未领分 → 无时）。显示时剥 p: 前缀。 */
export function buildIssues(res) {
  const display = (key) => (key.startsWith('p:') ? key.slice(2) : key)
  const issues = []
  if (res.strifeSpots.length > 0) {
    const byKey = new Map()
    for (const s of res.strifeSpots) {
      if (!byKey.has(s.key)) byKey.set(s.key, [])
      byKey.get(s.key).push(`${s.a} × ${s.b}`)
    }
    const detail = [...byKey.entries()].map(([key, pairs]) => `${display(key)}（${pairs.join('、')}）`).join('、')
    issues.push(`争写 ×${res.strifeSpots.length}：${detail}——交错覆盖，后者闭眼`)
  }
  if (res.coWriteKeys.length > 0) {
    issues.push(`共写 ×${res.coWriteKeys.length}（不计分）：${res.coWriteKeys.map(display).join('、')} —— 先后接手，非相争`)
  }
  if (res.trespassEntries.length > 0) {
    const detail = res.trespassEntries.map((e) => `${e.path} —— 落入 ${e.owner} 开放之分（${e.glob}）`).join('；')
    issues.push(`侵入 ×${res.trespassEntries.length}（+${res.score.trespass}）：${detail}`)
  }
  if (res.strayEntries.length > 0) {
    const detail = res.strayEntries.map((e) => `${e.path} —— 漂出自家分界（${e.own}）`).join('；')
    issues.push(`越分 ×${res.strayEntries.length}（+${res.score.stray}）：${detail}`)
  }
  if (res.unclaimed > 0) {
    issues.push(`未领分 ×${res.unclaimed}（不计分）：${res.unclaimedSessions.join('、')} 无开放之分——声明权在账方`)
  }
  if (res.timelessKeys.length > 0 || res.timelessWrites > 0) {
    issues.push(`无时之写 ×${res.timelessWrites}：缺 at，未参与交错判定与时段判定（宁可放过）`)
  }
  return issues
}
