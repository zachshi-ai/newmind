/**
 * 三序判定 —— 旧据 → 变写 → 陈写 的行集差集判定（docs/03 §3 锁死），全部确定性，零 LLM。
 *
 * 对同径的每笔带文写据（陈写候选 j）按且仅按最近一对判定：
 *   变写 m = j 前最近的行集不同的写据（任何会话；等文重写不取——世未变）；
 *   旧据 k = m 前最近的行集不同的文据（读据或写据皆可——上下文里的旧副本多来自一次读取）；
 *   陈线 = L(k)\L(m) 之中在 L(j) 重现的行数；新线 = L(m)\L(k) 之中在 L(j) 再失的行数。
 * 隔断（陈改不判）：有变写看 m→j 窗、无变写看最后文据→j 窗——无文之写夹在其中，
 * 其间之变不可见，判定不得（等文的写据不隔断——世未变）。
 * 阈值锁死：陈线 ≥2 ∧ 新线 ≥1 成案（覆世/覆己）；陈线 =1 ∧ 新线 ≥1 失鲜注记；
 * 保新线不罚（新线 =0 恒静默——并集式重写非覆，纯增/纯删之中变皆净向）。
 */

/** 行集：切行、trim、弃空行、去重。 */
export function lineSet(text) {
  const lines = String(text).split(/\r?\n/)
  const out = new Set()
  for (const l of lines) {
    const t = l.trim()
    if (t.length > 0) out.add(t)
  }
  return out
}

function differs(a, b) {
  if (a.size !== b.size) return true
  for (const l of a) if (!b.has(l)) return true
  return false
}

/** 窗 (lo, hi) 内的无文之痕数（seq 严格介于其间，不含端点）。 */
function marksIn(marks, lo, hi) {
  let n = 0
  for (const mk of marks) if (mk.seq > lo && mk.seq < hi) n++
  return n
}

/** 窗 (lo, hi) 内是否存在读据（案前曾重读之证）。 */
function readIn(grips, lo, hi) {
  return grips.some((g) => g.kind === 'read' && g.seq > lo && g.seq < hi)
}

/**
 * 对单径逐笔判定。grips 按序（seq 递增），marks 为该径无文之痕。
 * 返回 findings：{ seq, mSeq, chen, xin, type: '覆世'|'覆己'|'失鲜'|'陈改'|null, reread, gap }
 */
export function settlePath(grips, marks) {
  const findings = []
  for (let i = 0; i < grips.length; i++) {
    const j = grips[i]
    if (j.kind !== 'write') continue // 唯写据受判——读取永不判案

    // 变写：j 前最近异文写据
    let mi = -1
    for (let t = i - 1; t >= 0; t--) {
      if (grips[t].kind === 'write' && differs(grips[t].lines, j.lines)) { mi = t; break }
    }

    // 隔断：有变写看 m→j 窗，无变写看最后文据→j 窗
    const anchor = mi >= 0 ? grips[mi].seq : (i > 0 ? grips[i - 1].seq : null)
    if (anchor !== null) {
      const gap = marksIn(marks, anchor, j.seq)
      if (gap > 0) {
        findings.push({ seq: j.seq, mSeq: mi >= 0 ? grips[mi].seq : null, type: '陈改', gap })
        continue
      }
    }

    if (mi < 0) continue // 无变写，静默
    const m = grips[mi]

    // 旧据：m 前最近异文文据（读写皆可）
    let ki = -1
    for (let t = mi - 1; t >= 0; t--) {
      if (differs(grips[t].lines, m.lines)) { ki = t; break }
    }
    if (ki < 0) continue // 变写之前别无他据，无从谓陈
    const k = grips[ki]

    let chen = 0
    for (const l of k.lines) if (!m.lines.has(l) && j.lines.has(l)) chen++
    let xin = 0
    for (const l of m.lines) if (!k.lines.has(l) && !j.lines.has(l)) xin++

    if (chen >= 2 && xin >= 1) {
      findings.push({
        seq: j.seq,
        mSeq: m.seq,
        chen,
        xin,
        type: m.session !== j.session ? '覆世' : '覆己',
        reread: readIn(grips, m.seq, j.seq),
      })
    } else if (chen === 1 && xin >= 1) {
      findings.push({ seq: j.seq, mSeq: m.seq, chen, xin, type: '失鲜' })
    }
    // 其余（含保新线）静默
  }
  return findings
}

/** 宽 glob 命中：词元含 * 时按通配全匹配（* 跨目录），否则规整逐字相等（同全仓既例）。 */
export function globMatch(path, pattern) {
  const p = String(pattern ?? '')
  if (!p.includes('*')) return path === p
  const re = new RegExp(
    p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*') + '$'
  )
  return re.test(path)
}
