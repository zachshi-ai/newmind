/**
 * 体检引擎 —— 四诊遍历 + 病灶计分 + 传变预告警。
 *
 * 病灶表（FMEA 式，docs/03-design.md 第三节；每一项都可独立证伪）：
 *   W1 无验 45   acceptance 缺席或空
 *   W2 无界 45   scope 缺席 / allowRoots 缺席或空 / allowAll true
 *   W3 无止 30   stop 缺席或两项皆无
 *   W4 相克 40/条（上限 2）  终验 ref 重复 / artifact 路径重复 / 目标径在所有愿界之外
 *   W5 妄证 35/条（上限 2）  切诊落空：artifact 不在体检根 / 命令不在 PATH
 *   W6 缺资 35/条（上限 2）  切诊落空：requires 文件不在 / 工具不在 PATH
 * 险兆：5/去重 token，无边上限 10、无度上限 10。
 * 病值 = min(100, Σ病灶 + Σ险兆)；分带 安(0–15)/萌(16–39)/病(≥40)。
 *
 * 确定性：病灶按 W1→W6 码序，条内按收集序；险兆按词表内序；无时间戳、无随机。
 */

import { validateCharter } from './charter.js'
import { mergeLexicon, findOmens, omenScore, OMEN_WEIGHT, OMEN_CAP_PER_KIND } from './lexicon.js'
import { commandOnPath, pathExistsUnder, firstTokenOf } from './probes.js'
import { resolve } from 'node:path'

export const GATE_DEFAULT = 40
export const ILLNESS_CAP = 100

const W = {
  W1: { code: 'W1', name: '无验', weight: 45 },
  W2: { code: 'W2', name: '无界', weight: 45 },
  W3: { code: 'W3', name: '无止', weight: 30 },
  W4: { code: 'W4', name: '相克', weight: 40, cap: 2 },
  W5: { code: 'W5', name: '妄证', weight: 35, cap: 2 },
  W6: { code: 'W6', name: '缺资', weight: 35, cap: 2 },
}

const PRESCRIPTIONS = {
  W1: '声明终验（ref + bash 命令 / artifact 路径），供知止证据核对与正念终验门对账',
  W2: '立愿界 allowRoots，写入的根必须在开工时点名',
  W3: '立止法 maxSteps / maxMinutes，让「到哪儿算完」先于运行存在',
  W4: '收敛矛盾：目标径入愿界、终验引用唯一',
  W5: '修证：补建产物路径，或换一份存在的证据',
  W6: '备资：装上命令、补齐文件，或删掉这条依赖声明',
}

/** 传变（金匮：见肝之病，知肝传脾）——这个病灶会烧到哪一层。 */
export const TRANSMISSIONS = {
  W1: '无验 → 代偿完成无从对账：正念终验门将无事可对，zhizhi 证据核对将无据可核',
  W2: '无界 → 攀缘无从计分：愿界之外不存在，越界也就不存在（正念攀缘分结构性沉默）',
  W3: '无止 → 浪费只能靠运行时止损（知止层的账本事后入账），开工前无人问一句「到哪儿算完」',
  W4: '相克 → 中局爆雷：互斥的要求迟早同时到期，返工不可恢复',
  W5: '妄证 → 第一次对账即翻车：mid-run 才发现证据不存在，最贵的确诊方式',
  W6: '缺资 → 第一轮工具调用即报错：预算烧在发现自己没带工具上',
}

/** 目标径是否落在愿界内（前缀匹配，与正念 allowRoots 同一确定性运算）。 */
export function underRoot(rel, roots) {
  return roots.some((r) => rel.startsWith(r))
}

export function bandOf(score) {
  if (score < 16) return '安'
  if (score < GATE_DEFAULT) return '萌'
  return '病'
}

function lesion(w, kind, detail) {
  return { code: w.code, name: w.name, weight: w.weight, kind, detail, prescription: PRESCRIPTIONS[w.code] }
}

/**
 * 四诊体检。opts: { cwd, gate, lexicon }。
 * 返回可逐字重放的报告；charter 非法时 { valid:false, issues }。
 */
export function runExam(charter, opts = {}) {
  const validation = validateCharter(charter)
  if (!validation.valid) return { valid: false, issues: validation.issues }

  const cwd = opts.cwd ? resolve(opts.cwd) : null
  const gate = opts.gate ?? GATE_DEFAULT
  const lexicon = mergeLexicon(opts.lexicon)

  const lesions = []
  const transmissions = []
  let probed = 0
  let unprobed = 0
  const acc = Array.isArray(charter.acceptance) ? charter.acceptance : []
  const roots = charter.scope && Array.isArray(charter.scope.allowRoots) ? charter.scope.allowRoots : null
  const hasRoots = roots !== null && roots.length > 0
  const allowAll = charter.scope?.allowAll === true

  // ---- 望诊：该在的条款在不在 ------------------------------------------
  if (acc.length === 0) {
    lesions.push(lesion(W.W1, 'absent', '终验缺席，完成将对着空气宣布'))
  }
  if (!charter.scope || allowAll || !charter.scope.allowRoots || charter.scope.allowRoots.length === 0) {
    const kind = !charter.scope ? 'absent' : allowAll ? 'allow-all' : 'empty-roots'
    const detail = !charter.scope ? '愿界缺席' : allowAll ? 'allowAll 即无界' : 'allowRoots 为空'
    lesions.push(lesion(W.W2, kind, detail))
  }
  if (!charter.stop || (charter.stop.maxSteps === undefined && charter.stop.maxMinutes === undefined)) {
    lesions.push(lesion(W.W3, 'absent', '止法缺席：无人回答「到哪儿算完」'))
  }

  // ---- 问诊：条款之间的关系（相克，逐条计，上限 2） ----------------------
  {
    const clashes = []
    const refCount = new Map()
    for (const a of acc) refCount.set(a.ref, (refCount.get(a.ref) ?? 0) + 1)
    for (const [ref, count] of refCount) {
      if (count > 1) for (let k = 0; k < count - 1; k++) clashes.push(lesion(W.W4, 'dup-ref', `终验 ref「${ref}」重复声明`))
    }
    const artSeen = new Set()
    for (const a of acc) {
      if (a.artifact === undefined) continue
      if (artSeen.has(a.artifact)) clashes.push(lesion(W.W4, 'dup-artifact', `artifact 路径「${a.artifact}」被多条终验重复引用`))
      artSeen.add(a.artifact)
    }
    if (Array.isArray(charter.paths) && charter.paths.length > 0 && hasRoots) {
      for (const p of charter.paths) {
        if (!underRoot(p, roots)) clashes.push(lesion(W.W4, 'path-out-of-scope', `目标径「${p}」在所有愿界之外`))
      }
    }
    lesions.push(...clashes.slice(0, W.W4.cap))
  }

  // ---- 切诊：环境实测（只读；无 cwd 的文件探针诚实 unprobed） ------------
  const falseProof = []
  for (const a of acc) {
    if (a.artifact !== undefined) {
      const r = pathExistsUnder(cwd, a.artifact)
      if (r === null) unprobed++
      else { probed++; if (!r) falseProof.push(lesion(W.W5, 'artifact-missing', `终验 artifact「${a.artifact}」在体检根下不存在`)) }
    }
    if (a.argsContains !== undefined) {
      const cmd = firstTokenOf(a.argsContains)
      probed++
      if (!commandOnPath(cmd, cwd)) falseProof.push(lesion(W.W5, 'command-missing', `终验命令「${cmd}」不在 PATH 上`))
    }
  }
  const req = charter.requires ?? {}
  for (const f of req.files ?? []) {
    const r = pathExistsUnder(cwd, f)
    if (r === null) unprobed++
    else { probed++; if (!r) falseProof.push(lesion(W.W6, 'file-missing', `依赖文件「${f}」在体检根下不存在`)) }
  }
  for (const t of req.tools ?? []) {
    probed++
    if (!commandOnPath(t, cwd)) falseProof.push(lesion(W.W6, 'tool-missing', `依赖工具「${t}」不在 PATH 上`))
  }
  lesions.push(...falseProof.filter((l) => l.code === 'W5').slice(0, W.W5.cap))
  lesions.push(...falseProof.filter((l) => l.code === 'W6').slice(0, W.W6.cap))

  // ---- 闻诊：brief 的措辞信号（萌级） ------------------------------------
  const omens = findOmens(charter.brief, lexicon)

  // ---- 传变：报了哪个病灶，就预告下游哪一层将失守 -------------------------
  const fired = new Set(lesions.map((l) => l.code))
  for (const code of ['W1', 'W2', 'W3', 'W4', 'W5', 'W6']) {
    if (fired.has(code)) transmissions.push(TRANSMISSIONS[code])
  }

  const lesionScore = lesions.reduce((s, l) => s + l.weight, 0)
  const score = Math.min(ILLNESS_CAP, lesionScore + omenScore(omens))
  const band = bandOf(score)
  const verdict = score >= gate ? 'fail' : 'pass'

  const issues = [
    ...lesions.map((l) => `${l.name} +${l.weight}：${l.detail}`),
    ...omens.map((o) => `险兆「${o.token}」${o.label} +${o.weight}`),
  ]

  return {
    valid: true,
    charter: charter.id,
    cwd,
    gate,
    score,
    band,
    verdict,
    ok: verdict === 'pass',
    probes: { probed, unprobed },
    breakdown: { lesions: lesionScore, omens: omenScore(omens), omenCap: OMEN_CAP_PER_KIND, omenWeight: OMEN_WEIGHT },
    lesions,
    omens,
    transmissions,
    issues,
  }
}
