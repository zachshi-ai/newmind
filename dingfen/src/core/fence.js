/**
 * 分册 —— 权界登记（机器可读的地契）。
 *
 * 册形：{ version: 1, claims: [{ id, fences, at, releasedAt }] }
 *   - 领分 claim：同 id 已有开放之分 → 原位更新；否则追加；
 *   - 销分 release：该 id 最近一条开放之分置 releasedAt；
 *   - 开放时段 = [at, releasedAt ?? ∞)；写事件落在时段内，该分才对它有效。
 * 形状校验从紧：坏册抛错（审计宁报错不出假判词）。
 */

import { globsIntersectWitness, globMatches, normalizePath } from './glob.js'

export function emptyRegistry() {
  return { version: 1, claims: [] }
}

export function parseRegistry(text) {
  let raw
  try {
    raw = JSON.parse(String(text))
  } catch (error) {
    throw new Error(`分册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.claims)) {
    throw new Error('分册形状不对：需要 { version, claims: [...] }')
  }
  raw.claims.forEach((c, i) => {
    if (!c || typeof c.id !== 'string' || c.id.length === 0) throw new Error(`分册第 ${i + 1} 条缺 id`)
    if (!Array.isArray(c.fences) || c.fences.some((g) => typeof g !== 'string' || g.length === 0)) {
      throw new Error(`分册第 ${i + 1} 条（${c.id}）fences 必须是非空字符串数组`)
    }
    if (typeof c.at !== 'number' || !Number.isFinite(c.at)) throw new Error(`分册第 ${i + 1} 条（${c.id}）at 必须是数字`)
    if (c.releasedAt !== null && c.releasedAt !== undefined && (typeof c.releasedAt !== 'number' || !Number.isFinite(c.releasedAt))) {
      throw new Error(`分册第 ${i + 1} 条（${c.id}）releasedAt 必须是 null 或数字`)
    }
  })
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    claims: raw.claims.map((c) => ({ id: c.id, fences: [...c.fences], at: c.at, releasedAt: c.releasedAt ?? null })),
  }
}

export function serializeRegistry(reg) {
  return JSON.stringify({ version: 1, claims: reg.claims }, null, 2) + '\n'
}

export function isOpen(claim) {
  return claim.releasedAt == null
}

export function openDuring(claim, at) {
  return claim.at <= at && (claim.releasedAt == null || at <= claim.releasedAt)
}

/** 领分：同 id 开放之分原位更新，否则追加。返回新数组（不改入参）。 */
export function claim(reg, { id, fences, at }) {
  const claims = reg.claims.map((c) => ({ ...c, fences: [...c.fences] }))
  const existing = claims.find((c) => c.id === id && isOpen(c))
  if (existing) {
    existing.fences = [...fences]
    existing.at = at
  } else {
    claims.push({ id, fences: [...fences], at, releasedAt: null })
  }
  return { version: 1, claims }
}

/** 销分：该 id 最近一条开放之分置 releasedAt。无开放之分 → 抛错。 */
export function release(reg, { id, at }) {
  const claims = reg.claims.map((c) => ({ ...c, fences: [...c.fences] }))
  let hit = null
  for (const c of claims) if (c.id === id && isOpen(c)) hit = c
  if (!hit) throw new Error(`账上没有 ${id} 的开放之分`)
  hit.releasedAt = at
  return { version: 1, claims }
}

/** 争界：新分的任一界与他方开放之分的任一界有共同命中径。每处附见证径（见证自证）。 */
export function findOverlaps(reg, { id, fences }) {
  const overlaps = []
  for (const c of reg.claims) {
    if (c.id === id || !isOpen(c)) continue
    for (const g1 of fences) {
      for (const g2 of c.fences) {
        const witness = overlapWitness(g1, g2)
        if (witness) overlaps.push({ a: id, b: c.id, globA: g1, globB: g2, witness })
      }
    }
  }
  return overlaps
}

function overlapWitness(g1, g2) {
  const w = globsIntersectWitness(g1, g2)
  if (w === null) return null
  // 见证自证：交运算的输出必须真实命中双方，否则宁可漏告警不出假证。
  const n = normalizePath(w)
  return globMatches(g1, n) && globMatches(g2, n) ? w : null
}
