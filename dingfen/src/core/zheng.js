/**
 * 定分引擎 —— 写账与三宗判定（争写 / 侵入 / 越分），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流审计把所有会话的调用记进同一引擎；
 * 插件只记本会话——争写是流间事实，单侧视图恒 0（docs/03 §10）。
 *
 * 判定序锁死：侵入 > 越分 > 未领分（同一写不双计）。
 * 分值锁死：争写 +30/处 cap 60；侵入 +30/（会话×径）cap 60；越分 +6/（会话×径）cap 30；
 *           total = min(100, 三者和)。分带：定 0–14 / 竞 15–29 / 争 ≥30。门默认 30。
 */

import { objectKey, familyOf } from './object.js'
import { normalizePath, globMatches } from './glob.js'
import { openDuring } from './fence.js'

export const GATE_DEFAULT = 30

export function createEngine() {
  return { calls: [], writes: [] }
}

/** 记一笔调用；write 族且 isError !== true 者入写账（失败之写未改变世界；缺结果视同已落）。 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, at = null }) {
  const rec = { session, ref, name, args, isError, at: at ?? null }
  engine.calls.push(rec)
  if (familyOf(name) === 'write' && isError !== true) {
    engine.writes.push({ session, key: objectKey(args, name), at: rec.at, idx: engine.writes.length })
  }
  return engine
}

export function bandOf(total) {
  if (total < 15) return '定'
  if (total < 30) return '竞'
  return '争'
}

function cmpWrite(a, b) {
  return a.at - b.at || (a.session < b.session ? -1 : a.session > b.session ? 1 : a.idx - b.idx)
}

/**
 * 三宗判定。registry（分册）可缺——缺则只判流间事实（争写/共写）。
 * 返回 { score, band, verdict, ok, gate, counts, strifeSpots, coWriteKeys,
 *        trespassEntries, strayEntries, unclaimed, unclaimedSessions, timelessWrites }
 */
export function judge(engine, { registry = null, gate = GATE_DEFAULT } = {}) {
  // ---- 流间：争写交错窗口（docs/03 §6）-------------------------------------
  const byKey = new Map()
  for (const w of engine.writes) {
    if (!byKey.has(w.key)) byKey.set(w.key, [])
    byKey.get(w.key).push(w)
  }
  const strifeSpots = []
  const timelessKeys = new Set()
  const noTimeCount = engine.writes.filter((w) => w.at == null).length
  for (const [key, ws] of byKey) {
    const sessions = new Set(ws.map((w) => w.session))
    if (sessions.size < 2) continue
    if (ws.some((w) => w.at == null)) {
      timelessKeys.add(key) // 组内有无时之写：整组不判交错（宁可放过）
      continue
    }
    const seq = [...ws].sort(cmpWrite)
    const bySession = new Map()
    seq.forEach((w, i) => {
      if (!bySession.has(w.session)) bySession.set(w.session, [])
      bySession.get(w.session).push(i)
    })
    for (const [sx, idxs] of bySession) {
      if (idxs.length < 2) continue
      for (const [sy, idys] of bySession) {
        if (sy === sx) continue
        let spotted = false
        for (let k = 0; k + 1 < idxs.length && !spotted; k++) {
          const lo = idxs[k]
          const hi = idxs[k + 1]
          if (idys.some((y) => y > lo && y < hi)) {
            strifeSpots.push({ key, a: sx, b: sy })
            spotted = true
          }
        }
      }
    }
  }
  const strifeKeys = new Set(strifeSpots.map((s) => s.key))
  const coWriteKeys = [...byKey.keys()].filter(
    (key) => !strifeKeys.has(key) && !timelessKeys.has(key) && new Set(byKey.get(key).map((w) => w.session)).size >= 2
  )

  // ---- 权界：侵入 > 越分 > 未领分（docs/03 §5）------------------------------
  const trespassEntries = new Map() // `${session}\u0000${norm}` -> { session, path, owner, glob }
  const strayEntries = new Map() // `${session}\u0000${norm}` -> { session, path, own }
  let unclaimed = 0
  const unclaimedSessions = new Set()
  if (registry) {
    for (const w of engine.writes) {
      if (!w.key.startsWith('p:')) continue // c:/n: 是黑盒，不判
      if (w.at == null) continue // 时段不可考，宁可放过
      const norm = normalizePath(w.key.slice(2))
      let hit = null
      for (const c of registry.claims) {
        if (c.id === w.session || !openDuring(c, w.at)) continue
        const glob = c.fences.find((g) => globMatches(g, norm))
        if (glob) {
          hit = { owner: c.id, glob }
          break
        }
      }
      if (hit) {
        trespassEntries.set(`${w.session}\u0000${norm}`, { session: w.session, path: norm, owner: hit.owner, glob: hit.glob })
        continue // 判定序：侵入吃掉越分
      }
      const own = registry.claims.filter((c) => c.id === w.session && openDuring(c, w.at))
      if (own.length === 0) {
        unclaimed++
        unclaimedSessions.add(w.session)
        continue // 声明权在账方，不计分
      }
      const covered = own.some((c) => c.fences.some((g) => globMatches(g, norm)))
      if (!covered) {
        const ownFences = [...new Set(own.flatMap((c) => c.fences))].join(' ')
        strayEntries.set(`${w.session}\u0000${norm}`, { session: w.session, path: norm, own: ownFences })
      }
    }
  }

  // ---- 争值与分带（docs/03 §7，先于实现锁死）--------------------------------
  const strifeScore = Math.min(60, 30 * strifeSpots.length)
  const trespassScore = Math.min(60, 30 * trespassEntries.size)
  const strayScore = Math.min(30, 6 * strayEntries.size)
  const total = Math.min(100, strifeScore + trespassScore + strayScore)
  const band = bandOf(total)
  return {
    score: { total, strife: strifeScore, trespass: trespassScore, stray: strayScore },
    band,
    gate,
    verdict: total >= gate ? 'fail' : 'pass',
    ok: total < gate,
    counts: {
      strifeSpots: strifeSpots.length,
      coWrites: coWriteKeys.length,
      trespassPaths: trespassEntries.size,
      strayPaths: strayEntries.size,
      unclaimed,
    },
    strifeSpots,
    coWriteKeys,
    timelessKeys: [...timelessKeys],
    timelessWrites: noTimeCount,
    unclaimedSessions: [...unclaimedSessions],
    trespassEntries: [...trespassEntries.values()],
    strayEntries: [...strayEntries.values()],
  }
}
