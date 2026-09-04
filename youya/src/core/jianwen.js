/**
 * 见闻账引擎 —— 巡忆、定罪、计分（语义在 docs/03-design.md §4–§6 锁死）。
 *
 * 引擎是「单步状态机 + 终局收刀」：
 *   step(state, call)    每次调用推进一格（插件增量记账与离线重放共用同一步进语义）；
 *   finalize(state)      流终收刀（善刀而藏之），结算分数；
 *   analyze(calls)       一次性重放 = 逐步 step + finalize（离线审计入口）；
 *   liveScore(state)     未收刀时的即时分数——罪记当步即立、当步即计，
 *                        任何观察时刻的已见前缀都是完整事实（前缀一致性）。
 *
 * 判定规则（docs/03 §4–§5，常数不得为实现缺口放宽）：
 *   复见（世未变而原样重装载）：基线只认装载类成功调用；同路径成功写入后再读是「鲜」；
 *   基线之后夹有失败装载（设瑕）免记；检索类与 n: 对象永不入罪、不设基线。
 *   复命（世未变而原样重执行）：基线只认 exec 族同串成功调用；其间任意对象成功写入
 *   全库重置；同命令失败执行设瑕免记（夹有失败是势变之地，归九变）。
 *   并案：同对象紧邻罪记并一案，夹任何其他调用即分案。
 *
 * 计分常数：
 *   复见 +12/案 cap 60；复命 +8/案 cap 40；殆值 = min(100, 复见分 + 复命分)；
 *   分带 0–14 新硎 ｜ 15–29 割 ｜ ≥30 折；门默认 30。
 */

import { objectKey, familyOf, observeClass } from './object.js'

export const FUJIAN_POINTS = 12
export const FUJIAN_CAP = 60
export const FUMING_POINTS = 8
export const FUMING_CAP = 40
export const TOTAL_CAP = 100
export const GATE_DEFAULT = 30
export const CHEN_GAP_DEFAULT = 40

const FUJIAN = '复见'
const FUMING = '复命'

export function bandOf(total) {
  return total <= 14 ? '新硎' : total <= 29 ? '割' : '折'
}

export function createJianwenEngine(chenGap = CHEN_GAP_DEFAULT) {
  return {
    calls: [], // { ref, name, args, isError, at, object, family, cls, idx, sin }
    paths: new Map(), // p:X → { firstIdx, lastLoad, taintLoad, lastWrite, writeSinceLoad }
    commands: new Map(), // c:K → { firstIdx, lastRun, taintExec }
    sins: [], // { seq, ref, idx, object, kind, caseId }
    cases: { [FUJIAN]: new Set(), [FUMING]: new Set() }, // 案号集合（案数 = 集合大小）
    nextCase: { [FUJIAN]: 0, [FUMING]: 0 },
    lastGlobalWrite: null, // 任意对象上末次成功写族调用的位次（复命的全库重置凭据）
    chenGap: Number.isFinite(chenGap) && chenGap >= 0 ? chenGap : CHEN_GAP_DEFAULT,
    renderCount: 0,
  }
}

/** 同对象紧邻罪记并一案：上一笔罪记是否与本笔同对象同宗且中间零调用。 */
function joinsPreviousCase(state, object, kind, idx) {
  const prev = state.calls[idx - 1]
  return Boolean(prev && prev.sin && prev.sin.kind === kind && prev.object === object)
}

export function step(state, call) {
  const object = objectKey(call.args, call.name)
  const family = familyOf(call.name)
  const cls = family === 'observe' ? observeClass(call.name) : null
  const idx = state.calls.length
  const ok = call.isError === false // 无凭不记功过：null 既不作基线也不作重置

  let sin = null // { kind, caseId }

  // ---- 复见判定（装载类成功调用） ------------------------------------------
  if (ok && cls === 'load' && object.startsWith('p:')) {
    let p = state.paths.get(object)
    if (!p) {
      p = { firstIdx: idx, lastLoad: null, taintLoad: -1, lastWrite: null, writeSinceLoad: false }
      state.paths.set(object, p)
    }
    const base = p.lastLoad
    if (base != null && base > p.taintLoad && !p.writeSinceLoad) {
      const kind = FUJIAN
      const sameCase = joinsPreviousCase(state, object, kind, idx)
      const caseId = sameCase
        ? state.sins[state.sins.length - 1].caseId
        : ++state.nextCase[kind]
      sin = { kind, caseId }
    }
    p.lastLoad = idx
    p.writeSinceLoad = false
  } else if (call.isError === true && cls === 'load' && object.startsWith('p:')) {
    // 失败装载设瑕：此后到下次成功装载前一律免记（它在应对，不是它忘了）
    let p = state.paths.get(object)
    if (!p) {
      p = { firstIdx: idx, lastLoad: null, taintLoad: -1, lastWrite: null, writeSinceLoad: false }
      state.paths.set(object, p)
    }
    p.taintLoad = idx
  }

  // ---- 复命判定（exec 族成功调用，同串命令） -------------------------------
  if (ok && family === 'exec' && object.startsWith('c:')) {
    let c = state.commands.get(object)
    if (!c) {
      c = { firstIdx: idx, lastRun: null, taintExec: -1 }
      state.commands.set(object, c)
    }
    const base = c.lastRun
    const noWriteSince =
      state.lastGlobalWrite == null || base == null || state.lastGlobalWrite <= base
    if (base != null && base > c.taintExec && noWriteSince) {
      const kind = FUMING
      const sameCase = joinsPreviousCase(state, object, kind, idx)
      const caseId = sameCase
        ? state.sins[state.sins.length - 1].caseId
        : ++state.nextCase[kind]
      sin = sin ?? { kind, caseId } // 一调用至多一罪：装载判定已定罪则不复命（工具名互斥，此为守恒）
    }
    c.lastRun = idx
  } else if (call.isError === true && family === 'exec' && object.startsWith('c:')) {
    let c = state.commands.get(object)
    if (!c) {
      c = { firstIdx: idx, lastRun: null, taintExec: -1 }
      state.commands.set(object, c)
    }
    c.taintExec = idx
  }

  // ---- 入账 ----------------------------------------------------------------
  const rec = {
    ref: call.ref ?? null,
    name: call.name,
    args: call.args ?? {},
    isError: call.isError === true ? true : call.isError === false ? false : null,
    at: call.at ?? null,
    object,
    family,
    cls,
    idx,
    sin,
  }
  state.calls.push(rec)
  if (sin) {
    state.sins.push({
      seq: state.sins.length + 1,
      ref: rec.ref ?? `#${idx + 1}`,
      idx,
      object,
      kind: sin.kind,
      caseId: sin.caseId,
    })
    state.cases[sin.kind].add(sin.caseId)
  }

  // ---- 写族成功：全库重置凭据 + 路径「鲜」标记（工作集只收 p: 路径对象） ----
  if (ok && family === 'write') {
    state.lastGlobalWrite = idx
    if (object.startsWith('p:')) {
      let p = state.paths.get(object)
      if (!p) {
        p = { firstIdx: idx, lastLoad: null, taintLoad: -1, lastWrite: null, writeSinceLoad: false }
        state.paths.set(object, p)
      }
      p.lastWrite = idx
      p.writeSinceLoad = true
    }
  }
}

/** 流终收刀：结算最终分数与计数。 */
export function finalize(state) {
  const live = liveScore(state)
  state.score = live.score
  state.band = live.band
  state.counts = live.counts
  return state
}

/** 即时分数（未收刀时亦可用）。罪记当步即立、当步即计——前缀一致性。 */
export function liveScore(state) {
  const fujianCases = state.cases[FUJIAN].size
  const fumingCases = state.cases[FUMING].size
  const fujian = Math.min(FUJIAN_CAP, FUJIAN_POINTS * fujianCases)
  const fuming = Math.min(FUMING_CAP, FUMING_POINTS * fumingCases)
  const total = Math.min(TOTAL_CAP, fujian + fuming)
  return {
    score: { total, fujian, fuming },
    band: bandOf(total),
    counts: {
      callsObserved: state.calls.length,
      sins: state.sins.length,
      fujianRecords: state.sins.filter((s) => s.kind === FUJIAN).length,
      fujianCases,
      fumingRecords: state.sins.filter((s) => s.kind === FUMING).length,
      fumingCases,
      paths: state.paths.size,
      commands: state.commands.size,
    },
  }
}

/**
 * 陈账（要籍块的供给对象）：工作集内路径，末次内容触碰（成功装载或成功写入取较晚）
 * 距今 ≥ chenGap 次调用。按末次触碰位次升序（账序）。
 */
export function chenAccounts(state) {
  const n = state.calls.length
  const rows = []
  for (const [object, p] of state.paths) {
    const lastLoad = p.lastLoad ?? -1
    const lastWrite = p.lastWrite ?? -1
    const lastTouch = Math.max(lastLoad, lastWrite)
    if (lastTouch < 0) continue
    const gap = n - 1 - lastTouch
    if (gap < state.chenGap) continue
    rows.push({
      object,
      lastTouch,
      at: lastTouch + 1,
      gap,
      kind: lastWrite > lastLoad ? 'write' : 'load',
    })
  }
  rows.sort((a, b) => a.lastTouch - b.lastTouch)
  return rows
}

/** 离线重放：calls 一次性重放并收刀。 */
export function analyze(calls, chenGap) {
  const state = createJianwenEngine(chenGap)
  for (const call of calls) step(state, call)
  return finalize(state)
}
