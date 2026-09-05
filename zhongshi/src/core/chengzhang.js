/**
 * 程账 —— 众事逐项记账的确定性引擎。
 *
 * 逐调用逐项分类（判定序锁死，docs/03 §5）：弃形 > 终形 > 作工；
 * 失败调用（isError=true）亦是作工之迹——试错也是始（宁纵方向：少记幽项）。
 * 案别末笔定（docs/03 §6）：幽项（无迹）/ 半途（末为 W）/ 有终（末为 T）/ 有弃（末为 A）；
 * 空终案 = 其后复有作工之 W 的 T，逐案计——末笔不影响空终计数。
 * 先后账（docs/03 §7）：order [A,B] 失序 ⟺ B 首个 W 早于 A 首个 T（两者皆在）；
 * A 无终不判——不让 B 代 A 受罚。
 * liveScore 与离线重放对同流前缀一致：判定只依赖在先调用。
 */

import { argsText, workFamilyOf } from './object.js'
import { normalizeItem } from './shice.js'

export const GATE_DEFAULT = 30

/** 分带：近道(0–14) / 鲜终(15–29) / 无终(≥30)——靡不有初，鲜克有终。 */
export function bandName(total) {
  if (total >= 30) return '无终'
  if (total >= 15) return '鲜终'
  return '近道'
}

/** 程值：幽 30/项 cap60 · 半 15/项 cap30 · 空 20/案 cap40 · 序 10/处 cap30，合计 cap100。 */
export function scoreOf(you, ban, kong, xu) {
  const y = Math.min(60, 30 * you)
  const b = Math.min(30, 15 * ban)
  const k = Math.min(40, 20 * kong)
  const x = Math.min(30, 10 * xu)
  return { total: Math.min(100, y + b + k + x), you: y, ban: b, kong: k, xu: x }
}

/** 在线引擎（插件侧）：唯一写入口 step()，从 tools/result 结算事件步进。items 收原始事册形状。 */
export function createChengzhangEngine(opts = {}) {
  const items = (opts.items ?? []).map((raw) => {
    const it = normalizeItem(raw)
    it.wordsL = it.words.map((w) => w.toLowerCase())
    it.terminalL = it.terminal.map((w) => w.toLowerCase())
    it.abandonL = it.abandon.map((w) => w.toLowerCase())
    return it
  })
  return {
    register: {
      version: 1,
      items,
      order: (opts.order ?? []).map((pair) => [String(pair[0]), String(pair[1])]),
    },
    gate: Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT,
    calls: [],
    events: [], // { seq, ref, at, tool, itemId, kind: 'W'|'T'|'A' }
    callsObserved: 0,
    renderCount: 0,
  }
}

/** 唯一写入口：结算后步进一格。 */
export function step(engine, call) {
  engine.callsObserved++
  engine.calls.push(call)
  if (workFamilyOf(call.name) === 'other') return

  const text = argsText(call.args).toLowerCase()
  const seq = engine.callsObserved
  for (const item of engine.register.items) {
    let kind = null
    if (item.abandonL.some((w) => text.includes(w))) kind = 'A'
    else if (item.terminalL.some((w) => text.includes(w))) kind = 'T'
    else if (item.wordsL.some((w) => text.includes(w))) kind = 'W'
    if (kind) {
      engine.events.push({
        seq,
        ref: call.ref ?? null,
        at: call.at ?? null,
        tool: call.name,
        itemId: item.id,
        kind,
      })
    }
  }
}

/** 逐事结案：末笔定案别 + 空终清点（引擎事件序 = 流序，天然全局有序）。 */
export function computeStates(engine) {
  const byItem = new Map()
  for (const item of engine.register.items) byItem.set(item.id, [])
  for (const ev of engine.events) {
    const list = byItem.get(ev.itemId)
    if (list) list.push(ev)
  }

  const states = []
  const kongList = [] // 空终案，按终言出现序（流序）
  for (const item of engine.register.items) {
    const evs = byItem.get(item.id)
    const state = {
      id: item.id,
      name: item.name,
      noTerminalDeclared: item.terminal.length === 0,
      startSeq: null,
      lastWorkSeq: null,
      terminalSeq: null,
      firstTerminalSeq: null,
      abandonSeq: null,
      status: '幽项',
      workSeen: false,
    }
    if (evs.length > 0) {
      state.startSeq = evs[0].seq
      const last = evs[evs.length - 1]
      state.status = last.kind === 'W' ? '半途' : last.kind === 'T' ? '有终' : '有弃'
      for (const ev of evs) {
        if (ev.kind === 'W') {
          state.workSeen = true
          state.lastWorkSeq = ev.seq
        } else if (ev.kind === 'T') {
          state.terminalSeq = ev.seq
          if (state.firstTerminalSeq == null) state.firstTerminalSeq = ev.seq
        } else {
          state.abandonSeq = ev.seq
        }
      }
    }
    states.push(state)

    // 空终：该事项每个「其后复有作工之 W」的 T 各一案
    const wSeqs = evs.filter((e) => e.kind === 'W').map((e) => e.seq)
    for (const ev of evs) {
      if (ev.kind !== 'T') continue
      const after = wSeqs.find((w) => w > ev.seq)
      if (after != null) {
        kongList.push({ itemId: item.id, name: item.name, terminalSeq: ev.seq, workSeq: after })
      }
    }
  }
  return { states, kongList }
}

/** 先后账：B 首个 W 早于 A 首个 T（两者皆在）→ 失序案。 */
export function computeOrderViolations(engine, states) {
  const byId = new Map(states.map((s) => [s.id, s]))
  const violations = []
  for (const [aId, bId] of engine.register.order) {
    const a = byId.get(aId)
    const b = byId.get(bId)
    if (!a || !b) continue // 册已校验，防御式跳过
    if (a.firstTerminalSeq == null || b.startSeq == null) continue // A 无终不判（宁纵）
    if (b.startSeq < a.firstTerminalSeq) {
      violations.push({ order: [aId, bId], bStartSeq: b.startSeq, aTerminalSeq: a.firstTerminalSeq })
    }
  }
  return violations
}

/** 即时汇总：程值、分带、逐事清单（与离线重放前缀一致）。 */
export function liveScore(engine) {
  const { states, kongList } = computeStates(engine)
  const violations = computeOrderViolations(engine, states)
  const counts = {
    callsObserved: engine.callsObserved,
    itemsDeclared: engine.register.items.length,
    youCount: states.filter((s) => s.status === '幽项').length,
    banCount: states.filter((s) => s.status === '半途').length,
    youZhong: states.filter((s) => s.status === '有终').length,
    youQi: states.filter((s) => s.status === '有弃').length,
    kongCount: kongList.length,
    xuCount: violations.length,
  }
  const score = scoreOf(counts.youCount, counts.banCount, counts.kongCount, counts.xuCount)
  return { score, band: bandName(score.total), states, kongList, violations, counts }
}

/** 离线分析（CLI 侧）：一次性对完整调用序列落账。 */
export function analyze(calls, opts = {}) {
  const engine = createChengzhangEngine(opts)
  for (const call of calls) step(engine, call)
  return engine
}
