/**
 * 境账 —— 出境逐案记账的确定性引擎。
 *
 * 一案 = 一次出境调用（参数原文含 http(s)://，工具名无关）：
 *   泄物     成功 ∧ 外域 ∧ 命中阖籍 ≥1   —— 唯一计分案（+25/案，cap 60）
 *   试出     失败（isError === true）     —— 点名不计分（对端未确认收物，宁漏勿诬）
 *   内域档   回环 / 白名单                —— 本职行为，记档不计分
 *   合法出境 成功 ∧ 外域 ∧ 无命中         —— 出而不泄，0 分
 * isError 为 null（孤儿建档）时按成功侧口径落案（与 docs/03-design.md 案别字面一致）。
 */

import { createWuji, weigh } from './wuji.js'

export const GATE_DEFAULT = 30
const PER_CASE = 25
const CAP = 60

/** 分带：密(0–14) / 疏(15–29) / 溃(≥30)——阖贵密；疏者罅之始；溃者堤决、物出不可追。 */
export function bandName(total) {
  if (total >= 30) return '溃'
  if (total >= 15) return '疏'
  return '密'
}

/** 参数原文：递归收集 args 里的全部字符串值（不经 JSON 序列化，保留原文的引号结构）。 */
export function argsText(args) {
  const parts = []
  const walk = (v) => {
    if (typeof v === 'string') parts.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(args)
  return parts.join(' ')
}

const URL_RE = /https?:\/\/[^\s"'`<>\\]+/g

/** 提取参数中的全部 URL（原文词法，遇到空白/引号/反斜杠即止）。 */
export function extractUrls(text) {
  return String(text).match(URL_RE) ?? []
}

/** 从 URL 取 host（小写；去 userinfo 与端口；解析不了就用正则兜底）。 */
export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    const m = String(url).replace(/^https?:\/\//i, '').split(/[/?#]/)[0].split('@').pop()
    return (m.split(':')[0] || '').toLowerCase()
  }
}

const LOOPBACK = new Set(['localhost', '0.0.0.0', '::1', '[::1]'])

/** 域别裁决：回环五形恒为内域；显式 allow 域相等或紧贴点子域（不误配 evil-a.com 对 a.com）。 */
export function isInternal(host, allow) {
  const h = String(host || '').toLowerCase()
  if (!h) return false
  if (LOOPBACK.has(h)) return true
  if (h.startsWith('127.')) return true
  for (const d of allow) {
    const dom = String(d).toLowerCase()
    if (!dom) continue
    if (h === dom || h.endsWith('.' + dom)) return true
  }
  return false
}

/** 出境判定：参数原文含 http(s):// 即出境候选——工具名无关，URL 词法是唯一判据。 */
function isExit(text) {
  return /https?:\/\//.test(text)
}

/** 对单个调用落案。非出境不入账。 */
function judgeCase(wuji, allow, call, seq) {
  const text = argsText(call.args)
  if (!isExit(text)) return null
  const urls = extractUrls(text)
  const host = urls.length > 0 ? hostOf(urls[0]) : ''
  const internal = isInternal(host, allow)
  const hits = weigh(wuji, text)
  const failed = call.isError === true

  let kind
  if (internal) kind = '内域档'
  else if (failed) kind = '试出'
  else if (hits.length > 0) kind = '泄物'
  else kind = '合法出境'

  return {
    seq,
    ref: call.ref ?? null,
    at: call.at ?? null,
    tool: call.name,
    host,
    domain: internal ? '内域' : '外域',
    kind,
    scored: kind === '泄物' ? PER_CASE : 0,
    hits: hits.map((h) => ({ formId: h.formId, label: h.label, masked: h.masked, excerpt: h.excerpt })),
  }
}

function tally(state) {
  const exits = state.exits
  const leakCases = exits.filter((e) => e.kind === '泄物').length
  const total = Math.min(CAP, PER_CASE * leakCases)
  return {
    score: { total },
    band: bandName(total),
    counts: {
      callsObserved: state.callsObserved,
      exitsObserved: exits.length,
      internal: exits.filter((e) => e.kind === '内域档').length,
      external: exits.filter((e) => e.domain === '外域').length,
      leakCases,
      leakItems: exits.reduce((n, e) => n + (e.kind === '泄物' ? e.hits.length : 0), 0),
      shichu: exits.filter((e) => e.kind === '试出').length,
      lawful: exits.filter((e) => e.kind === '合法出境').length,
    },
  }
}

/** 即时汇总（与离线重放前缀一致：逐案判定互不依赖，天然满足）。 */
export function liveScore(state) {
  return tally(state)
}

/**
 * 在线引擎（插件侧）：唯一写入口 step()，从 tools/result 结算事件步进。
 * @param {{ allow?: string[], declare?: string[] }} opts
 */
export function createJingzhangEngine(opts = {}) {
  const engine = {
    wuji: createWuji(opts),
    allow: (opts.allow ?? []).map((s) => String(s).toLowerCase()).filter(Boolean),
    calls: [],
    exits: [],
    callsObserved: 0,
    renderCount: 0,
  }
  return engine
}

/** 唯一写入口：结算后步进一格。 */
export function step(engine, call) {
  engine.callsObserved++
  engine.calls.push(call)
  const kase = judgeCase(engine.wuji, engine.allow, call, engine.exits.length + 1)
  if (kase) engine.exits.push(kase)
}

/**
 * 离线分析（CLI 侧）：一次性对完整调用序列落案。
 * @param {Array} calls buildCalls 归并后的调用序列
 * @param {{ allow?: string[], declare?: string[] }} opts
 */
export function analyze(calls, opts = {}) {
  const engine = createJingzhangEngine(opts)
  for (const call of calls) step(engine, call)
  return engine
}
