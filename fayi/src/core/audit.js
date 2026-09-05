/**
 * 审尺 —— 单流离线重放：一个流文件 = 一个会话（法仪是单会话尺度，docs/03 §10）。
 *
 * 报告字段序锁死（docs/04 A7 的输出样例即此序）。
 * 判词（确定性措辞与序）：曲尺 → 存疑 → 修器 → 虚器 → 废尺/尾红 → 无时。
 */

import { basename } from 'node:path'
import { parseStream, buildCalls } from './stream.js'
import { createEngine, recordCall, judge, GATE_DEFAULT } from './fayi.js'

/** 会话名：文件名去 .jsonl 后缀。 */
export function sessionName(fileName) {
  const base = basename(String(fileName))
  return base.endsWith('.jsonl') ? base.slice(0, -'.jsonl'.length) : base
}

/**
 * entry: { name, text }；register: 器册对象（可缺——缺则纯默认形表）；
 * extraAmends: CLI --amend 并入。坏 JSON → 抛错（CLI 转 exit 2）。
 */
export function auditStream(entry, { register = null, gate = GATE_DEFAULT, extraAmends = [] } = {}) {
  const id = sessionName(entry.name)
  const { calls } = buildCalls(parseStream(entry.text))
  const engine = createEngine()
  for (const call of calls) {
    recordCall(engine, { session: id, ref: call.ref, name: call.name, args: call.args, isError: call.isError, at: call.at })
  }
  const res = judge(engine, { register, gate, extraAmends })
  return {
    session: id,
    calls: engine.calls.length,
    writes: engine.writes.length,
    score: res.score,
    band: res.band,
    gate: res.gate,
    verdict: res.verdict,
    ok: res.ok,
    counts: res.counts,
    shimo: res.shimo,
    issues: buildIssues(res),
    // 明细（审计可下钻：逐案/逐处/逐件与器动、尾红）
    quchiCases: res.quchiCases,
    doubtSpots: res.doubtSpots,
    amendInWindow: res.amendInWindow,
    hollowHits: res.hollowHits,
    instrumentTouches: res.instrumentTouches,
    tailRed: res.tailRed,
    timelessWrites: res.timelessWrites,
  }
}

/** 判词（确定性措辞与序）。显示时剥 p: 前缀。 */
export function buildIssues(res) {
  const issues = []
  if (res.quchiCases.length > 0) {
    const detail = res.quchiCases
      .map((c) => `${c.paths.join('、')}（翻红窗内纯器写，红 ${c.redAt} → 绿 ${c.greenAt}）`)
      .join('；')
    issues.push(`曲尺 ×${res.quchiCases.length}（+${res.score.quchi}）：${detail}`)
  }
  if (res.doubtSpots.length > 0) {
    const detail = res.doubtSpots.map((d) => d.paths.join('、')).join('；')
    issues.push(`存疑 ×${res.doubtSpots.length}（不计分）：${detail} —— 器写与实测写同窗，绿不可归因（宁纵）`)
  }
  if (res.amendInWindow.length > 0) {
    const detail = res.amendInWindow.map((a) => a.path).join('、')
    issues.push(`修器 ×${res.amendInWindow.length}（不计分）：${detail} —— 账方声明之修`)
  }
  if (res.hollowHits.length > 0) {
    const detail = res.hollowHits.map((h) => `${h.form}「${h.hit}」@ ${h.path}`).join('；')
    issues.push(`虚器 ×${res.hollowHits.length}（+${res.score.xuqi}）：${detail}`)
  }
  if (res.shimo === 'stale') {
    issues.push('废尺（+30）：末笔实测写后无绿验——尺未照末')
  }
  if (res.shimo === 'tailred') {
    issues.push('尾红（不计分）：末验为红——尺新而话诚，红是任务之败，非尺之腐')
  }
  if (res.timelessWrites > 0) {
    issues.push(`无时之写 ×${res.timelessWrites}：缺 at，未参与窗归因与照末（宁可放过）`)
  }
  return issues
}
