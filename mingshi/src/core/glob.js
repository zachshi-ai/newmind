/**
 * 名实界语言 —— 最小 glob：字面段、段内 `*`（≥1 个非 `/` 字符）、独占一段的 `**`（跨零或多段）。
 *
 * 设计约束：
 *   - 路径先规范化（\ → /、并 //、去 ./、去尾 /），大小写敏感；
 *   - 匹配不触碰文件系统——离线流里的路径可以不存在，确定性优先于「真值」；
 *   - root glob 只作匹配（树界之保），无交运算需求——保留同规实现以便跨项目互审。
 *
 * 段内交用 NFA 积：字面迁移 ∪ 通配迁移（任意非 / 字符）。对可达性判定，探针字符集
 * 取「双方当前字面 ∪ {x}」是完备的：任何交中的串，通配位总可换成 x 或某方的必需字面。
 * 段间交按段对齐递归（`**` 可跨零段），(i, j) 记忆化防指数。
 */

const nfaCache = new Map()

/** 状态迁移表：模块级共享（compileSeg 构造与匹配器共用）。 */
const tr = (nfa, s) => nfa.trans.get(s)

export function normalizePath(p) {
  let s = String(p).replace(/\\/g, '/')
  s = s.replace(/\/{2,}/g, '/')
  while (s.startsWith('./')) s = s.slice(2)
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s
}

/** 段模式 → token 序列：{ c } 字面 | { any } 通配（≥1 个非 / 字符）。 */
function segTokens(seg) {
  const tokens = []
  const parts = seg.split('*')
  parts.forEach((part, i) => {
    for (const ch of part) tokens.push({ c: ch })
    if (i < parts.length - 1) tokens.push({ any: true })
  })
  return tokens
}

/** Thompson NFA：状态 0..n；any 用「进入必耗一字 + 自环 + ε 出」实现 ≥1 语义。 */
function compileSeg(seg) {
  const cached = nfaCache.get(seg)
  if (cached) return cached
  const tokens = segTokens(seg)
  let n = 0
  const trans = new Map()
  const state = () => {
    trans.set(n, { lit: new Map(), any: [], eps: [] })
    return n++
  }
  let cur = state()
  const start = cur
  for (const tok of tokens) {
    if (tok.c != null) {
      const nxt = state()
      const lit = trans.get(cur).lit
      if (!lit.has(tok.c)) lit.set(tok.c, [])
      lit.get(tok.c).push(nxt)
      cur = nxt
    } else {
      const mid = state()
      const nxt = state()
      trans.get(cur).any.push(mid)
      trans.get(mid).any.push(mid)
      trans.get(mid).eps.push(nxt)
      cur = nxt
    }
  }
  const nfa = { trans, start, accept: cur, size: n }
  if (nfaCache.size < 512) nfaCache.set(seg, nfa)
  return nfa
}

function closure(nfa, states) {
  const out = new Set(states)
  const stack = [...states]
  while (stack.length) {
    const s = stack.pop()
    for (const e of tr(nfa, s).eps) {
      if (!out.has(e)) {
        out.add(e)
        stack.push(e)
      }
    }
  }
  return out
}

function step(nfa, states, ch) {
  const out = new Set()
  for (const s of states) {
    const t = tr(nfa, s)
    const lit = t.lit.get(ch)
    if (lit) for (const e of lit) out.add(e)
    for (const e of t.any) out.add(e)
  }
  return closure(nfa, out)
}

function hasAnyEdge(nfa, states) {
  for (const s of states) if (tr(nfa, s).any.length) return true
  return false
}

/** 段级精确交：返回同时命中两段的非空 witness（不含 /），无交返回 null。 */
export function segWitness(seg1, seg2) {
  const A = compileSeg(seg1)
  const B = compileSeg(seg2)
  let frontier = [{ a: closure(A, new Set([A.start])), b: closure(B, new Set([B.start])), w: '' }]
  const seen = new Set()
  const PROBE = 'x'
  while (frontier.length) {
    const next = []
    for (const node of frontier) {
      if (node.a.has(A.accept) && node.b.has(B.accept)) return node.w
      const chars = new Set()
      for (const s of node.a) for (const c of tr(A, s).lit.keys()) chars.add(c)
      for (const s of node.b) for (const c of tr(B, s).lit.keys()) chars.add(c)
      if (hasAnyEdge(A, node.a) || hasAnyEdge(B, node.b)) chars.add(PROBE)
      for (const ch of [...chars].sort()) {
        const na = step(A, node.a, ch)
        const nb = step(B, node.b, ch)
        if (na.size === 0 || nb.size === 0) continue
        const key = `${[...na].sort((p, q) => p - q).join(',')}|${[...nb].sort((p, q) => p - q).join(',')}`
        if (seen.has(key)) continue
        seen.add(key)
        next.push({ a: na, b: nb, w: node.w + ch })
      }
    }
    frontier = next
  }
  return null
}

/** 单段自见证：字面照抄，通配填 x（≥1 语义成立）。 */
function selfWitness(seg) {
  return seg.split('*').join('x')
}

function allDoubleStar(segs, from) {
  for (let i = from; i < segs.length; i++) if (segs[i] !== '**') return false
  return true
}

/** 段间精确交：返回同时命中两界的见证径；无交返回 null。 */
export function globsIntersectWitness(g1, g2) {
  const p1 = normalizePath(g1).split('/')
  const p2 = normalizePath(g2).split('/')
  const memo = new Map()

  function rec(i, j) {
    const key = `${i}:${j}`
    if (memo.has(key)) return memo.get(key)
    memo.set(key, null) // 环守卫（本语言无环，防御性）
    let res
    const s1 = p1[i]
    const s2 = p2[j]
    if (s1 === undefined && s2 === undefined) res = []
    else if (s1 === undefined) res = allDoubleStar(p2, j) ? [] : null
    else if (s2 === undefined) res = allDoubleStar(p1, i) ? [] : null
    else if (s1 === '**' && s2 === '**') res = rec(i + 1, j)
    else if (s1 === '**') {
      // `**` 吞零段，或吞一整段（见证段只需命中 s2），仍留在 `**`
      res = rec(i + 1, j)
      if (res === null) {
        const rest = rec(i, j + 1)
        if (rest !== null) res = [selfWitness(s2), ...rest]
      }
    } else if (s2 === '**') {
      res = rec(i, j + 1)
      if (res === null) {
        const rest = rec(i + 1, j)
        if (rest !== null) res = [selfWitness(s1), ...rest]
      }
    } else {
      const w = segWitness(s1, s2)
      res = w === null ? null : rec(i + 1, j + 1)
      if (res !== null) res = [w, ...res]
    }
    memo.set(key, res)
    return res
  }

  const segs = rec(0, 0)
  return segs === null ? null : segs.join('/')
}

/** 界匹配：pattern 是否命中 path（规范化后，段级对齐，`**` 回溯）。 */
export function globMatches(pattern, path) {
  const p = normalizePath(pattern).split('/')
  const s = normalizePath(path).split('/')
  function align(i, j) {
    if (i === p.length) return j === s.length
    if (p[i] === '**') {
      for (let k = j; k <= s.length; k++) if (align(i + 1, k)) return true
      return false
    }
    if (j === s.length) return false
    const nfa = compileSeg(p[i])
    let set = closure(nfa, new Set([nfa.start]))
    for (const ch of s[j]) {
      set = step(nfa, set, ch)
      if (set.size === 0) return false
    }
    if (!set.has(nfa.accept)) return false
    return align(i + 1, j + 1)
  }
  return align(0, 0)
}
