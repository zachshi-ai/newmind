/**
 * 法仪界语言 —— 与定分同规的最小 glob：字面段、段内 `*`（≥1 个非 `/` 字符）、独占一段的 `**`（跨零或多段）。
 *
 * 法仪只用「匹配」，不用定分的「见证交」：器径分类是单侧判定（这条径是不是器），
 * 无需两 glob 相交的见证径——故只保留规范化与匹配机器，见证函数不携入本层。
 *
 * 设计约束（承定分）：
 *   - 路径先规范化（\ → /、并 //、去 ./、去尾 /），大小写敏感；
 *   - 匹配不触碰文件系统——离线流里的路径可以不存在，确定性优先于「真值」。
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
