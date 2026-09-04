/**
 * 势账引擎 —— 勘势、裁决、计分（语义在 docs/03-design.md §4–§5 锁死）。
 *
 * 引擎是「单步状态机 + 终局定谳」：
 *   step(state, call)    每次调用推进一格（插件增量记账与离线重放共用同一步进语义）；
 *   finalize(state)      流结束时给未决势变定谳（悬 / 离）、闭合尾段、结算分数；
 *   analyze(calls)       一次性重放 = 逐步 step + finalize（离线审计入口）；
 *   liveScore(state)     未定谳时的即时分数（插件 report 用，只算已闭合的段与链）。
 *
 * 逐势变裁决（first-touch 决定）：
 *   p: 文件  首个观察→变 ｜ 首个同名重试（此前无观察）→盲捶 ｜ 流终两者皆无→悬
 *   c:/n:    同名重试前有异途动作→变 ｜ 紧邻同名重试→盲捶 ｜ 流终无重试→离
 *   （异途动作 = 该调用不是此势变的同名重试；失败后任何别的动作都算路径动过。）
 *
 * 计分常数（不得为实现缺口放宽）：
 *   盲捶 +12/记（相邻且同对象的盲捶连成一链，每链首记免分），cap 60；
 *   游骑 +20/轮（悬账未清时，≥3 个全流首现的非观察对象连续动作；观察或旧对象打断），cap 40；
 *   失机值 = min(100, 滞 + 妄)；分带 0–14 合 ｜ 15–29 钝 ｜ ≥30 胶；门默认 30。
 */

import { objectKey, familyOf } from './object.js'

export const BLIND_POINTS = 12
export const GRAZE_POINTS = 20
export const STALE_CAP = 60
export const RASH_CAP = 40
export const TOTAL_CAP = 100
export const GATE_DEFAULT = 30
export const GRAZE_MIN_RUN = 3

export function createShiEngine() {
  return {
    calls: [], // { ref, name, args, isError, at, object, family, fresh, idx }
    seen: new Set(), // 全流出现过的对象键
    events: [], // 势变：{ seq, ref, idx, tool, object, kind, verdict, twinRef, at, … }
    blindOrder: [], // 盲捶裁决的流序（链式免分的依据）
    grazeRuns: [], // 已闭合的游骑段 { start, end, objects }
    grazeRun: null, // 进行中的游骑段
    renderCount: 0, // 变方渲染序号
  }
}

export function step(state, call) {
  const object = objectKey(call.args, call.name)
  const family = familyOf(call.name)
  const fresh = !state.seen.has(object)
  state.seen.add(object)
  const idx = state.calls.length
  const rec = {
    ref: call.ref ?? null,
    name: call.name,
    args: call.args ?? {},
    isError: call.isError === true,
    at: call.at ?? null,
    object,
    family,
    fresh,
    idx,
  }
  state.calls.push(rec)

  // 悬账快照（游骑开段前提，先于本次触碰更新）
  const armed = state.events.some(
    (ev) => ev.kind === 'p' && ev.verdict === null && !ev.observed && !ev.touched,
  )

  // 1) 推进一切未决势变（本调用自己创建的不在此列）；已定谳者只补记观察事实
  for (const ev of state.events) {
    if (ev.idx >= idx) continue
    const isTwin = ev.object === object && rec.name === ev.tool
    if (ev.verdict !== null) {
      // 盲捶定谳后的再察不追溯赦免（docs/03 §4），但事实入账
      if (ev.object === object && family === 'observe') ev.observed = true
      continue
    }
    if (isTwin) {
      ev.touched = true
      if (ev.kind === 'p') {
        if (!ev.observed) {
          ev.verdict = '盲捶'
          ev.twinRef = rec.ref ?? `#${idx + 1}`
          state.blindOrder.push(ev)
        }
      } else {
        ev.verdict = ev.differentAction ? '变' : '盲捶'
        ev.twinRef = rec.ref ?? `#${idx + 1}`
        if (ev.verdict === '盲捶') state.blindOrder.push(ev)
      }
    } else if (ev.object === object) {
      // 同对象、不同名的触碰
      ev.touched = true
      if (family === 'observe') {
        ev.observed = true
        if (ev.kind === 'p') ev.verdict = '变' // 首个再察，归还悬账
      } else {
        ev.differentAction = true
      }
    } else if (ev.kind !== 'p') {
      // 不同对象的任何动作，对命令势变而言都是异途
      ev.differentAction = true
    }
  }

  // 2) 游骑段状态机（悬账未清 + 全流首现对象 + 非观察族；否则闭合当前段）
  if (armed && fresh && family !== 'observe') {
    if (!state.grazeRun) state.grazeRun = { start: idx, objects: [] }
    state.grazeRun.end = idx
    state.grazeRun.objects.push(object)
  } else {
    closeGrazeRun(state)
  }

  // 3) 本调用失败 → 开一条新势变
  if (rec.isError) {
    state.events.push({
      seq: state.events.length + 1,
      ref: rec.ref ?? `#${idx + 1}`,
      idx,
      tool: rec.name,
      object,
      kind: object.startsWith('p:') ? 'p' : object.startsWith('c:') ? 'c' : 'n',
      verdict: null,
      observed: false,
      touched: false,
      differentAction: false,
      twinRef: null,
      at: rec.at,
    })
  }
}

function closeGrazeRun(state) {
  if (state.grazeRun && state.grazeRun.objects.length >= GRAZE_MIN_RUN) {
    state.grazeRuns.push(state.grazeRun)
  }
  state.grazeRun = null
}

function chainStats(blindOrder) {
  let chains = 0
  let prev = null
  for (const ev of blindOrder) {
    if (!prev || prev.object !== ev.object) chains++
    prev = ev
  }
  const charged = Math.max(0, blindOrder.length - chains)
  return { chains, charged }
}

function scoreNow(state, grazeCount) {
  const { charged } = chainStats(state.blindOrder)
  const stale = Math.min(STALE_CAP, BLIND_POINTS * charged)
  const rash = Math.min(RASH_CAP, GRAZE_POINTS * grazeCount)
  const total = Math.min(TOTAL_CAP, stale + rash)
  const band = total <= 14 ? '合' : total <= 29 ? '钝' : '胶'
  return { score: { total, stale, rash }, band, blindCharged: charged }
}

/** 未定谳时的即时分数（插件 report / 变方前科行用）。进行中的游骑段若已满 3 同样入账——
 *  任何观察时刻的已见前缀都是完整事实，离线重放不得出现更大的数（前缀一致性）。 */
export function liveScore(state) {
  const openRun =
    state.grazeRun && state.grazeRun.objects.length >= GRAZE_MIN_RUN ? 1 : 0
  const { score, band, blindCharged } = scoreNow(state, state.grazeRuns.length + openRun)
  return {
    score,
    band,
    counts: {
      shiEvents: state.events.length,
      blind: state.blindOrder.length,
      blindCharged,
      graze: state.grazeRuns.length + openRun,
      adapted: state.events.filter((e) => e.verdict === '变').length,
      orphan: 0,
      pivot: 0,
    },
    blindCharged,
  }
}

/** 流终定谳：未决 p: → 悬（挂账点名）；未决 c:/n: → 离（正当改途）。 */
export function finalize(state) {
  closeGrazeRun(state)
  for (const ev of state.events) {
    if (ev.verdict !== null) continue
    ev.verdict = ev.kind === 'p' ? '悬' : '离'
  }
  const { score, band, blindCharged } = scoreNow(state, state.grazeRuns.length)
  state.score = score
  state.band = band
  state.counts = {
    shiEvents: state.events.length,
    blind: state.blindOrder.length,
    blindCharged,
    graze: state.grazeRuns.length,
    adapted: state.events.filter((e) => e.verdict === '变').length,
    orphan: state.events.filter((e) => e.verdict === '悬').length,
    pivot: state.events.filter((e) => e.verdict === '离').length,
  }
  return state
}

/** 未归还悬账（变方的供给对象）：文件势变，尚无定谳且从未被观察。 */
export function openDebts(state) {
  return state.events.filter((ev) => ev.kind === 'p' && ev.verdict === null && !ev.observed)
}

/** 已定谳的悬账（离线审计的点名对象）。 */
export function settledDebts(state) {
  return state.events.filter((ev) => ev.verdict === '悬')
}

/** 离线重放：calls 一次性过账并定谳。 */
export function analyze(calls) {
  const state = createShiEngine()
  for (const call of calls) step(state, call)
  return finalize(state)
}
