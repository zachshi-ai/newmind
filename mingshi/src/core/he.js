/**
 * 核名引擎 —— 名账与案由判定（幻包 / 幻径 / 新装·犯装 / 试装），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流审计把所有会话的调用记进同一引擎（生实证据全流皆采）；
 * 插件只记本会话——单会话视图的生实只采本会话（跨会话之实归离线合并审计）。
 *
 * 判定序锁死（docs/03 §7）：
 *   无册不判 → 内建免 → 册内免 → 流内生实免 → 幻径/幻包；
 *   装所册免 → 册外装成（strictDeps ? 犯装 +30 : 新装 +6）→ 试装不计分。
 * 分值锁死：幻包 +30/名 cap 60；幻径 +15/名 cap 30；
 *           新装 +6/次 cap 30 / 犯装 +30/次 cap 60；total = min(100, ghost + stray)。
 * 分带：正 0–14 / 疑 15–29 / 妄 ≥30。门默认 30——单幻包即红。
 */

import { objectKey, familyOf } from './object.js'
import { normalizePath, globMatches } from './glob.js'
import {
  contentOf, isCodePath, extractSpecs, classifySpec, resolveRelative,
  extractInstalls, isBuiltin,
} from './ming.js'
import { registryCount } from './shi.js'

export const GATE_DEFAULT = 30

export function bandOf(total) {
  if (total < 15) return '正'
  if (total < 30) return '疑'
  return '妄'
}

export function createEngine() {
  return { calls: [], writes: [], installs: [], imports: new Map() }
}

/**
 * 记一笔调用。write 族成功之写入写账（提名的载体）；
 * exec 族当场提安装令（与实册无关，提取归流）；imports 由 judge 时统一提名。
 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, at = null }) {
  const rec = { session, ref, name, args, isError, at: at ?? null }
  engine.calls.push(rec)
  const fam = familyOf(name)
  if (fam === 'write' && isError !== true) engine.writes.push(rec)
  if (fam === 'exec' && args && typeof args.command === 'string') {
    for (const pkg of extractInstalls(args.command)) {
      engine.installs.push({ session, pkg, ok: isError !== true, ref })
    }
  }
  return engine
}

/**
 * 收工总核。registry 为 null 或空册（roots+packages 全空）→ 无册不判，counts 全零。
 * 返回报告对象（字段序锁死，docs/03 §9）。
 */
export function judge(engine, { registry = null, gate = GATE_DEFAULT } = {}) {
  const declared = registry ? registryCount(registry) : 0
  const empty = { total: 0, ghost: 0, stray: 0 }

  if (!registry || (declared === 0 && !registry.strictDeps)) {
    return {
      sessions: new Set(engine.calls.map((c) => c.session)).size,
      calls: engine.calls.length,
      writes: engine.writes.length,
      imports: 0,
      score: empty,
      band: bandOf(0),
      gate,
      verdict: 'pass',
      ok: true,
      counts: {
        ghostPackages: 0, ghostRelatives: 0, strayInstalls: 0, trialInstalls: 0,
        exemptImports: 0, exemptInstalls: 0, registryCount: 0,
      },
      issues: ['无实册——声明权在任务方，先立册再审计'],
    }
  }

  const exts = registry.extraExts
  const extraBuiltins = registry.extraBuiltins

  // ---- 流内生实（全流证据，先后皆采）---------------------------------------
  const provenPaths = new Set()
  for (const rec of engine.calls) {
    if (rec.isError === true) continue
    const fam = familyOf(rec.name)
    if (fam !== 'observe' && fam !== 'write') continue
    const key = objectKey(rec.args, rec.name)
    if (typeof key === 'string' && key.startsWith('p:')) provenPaths.add(normalizePath(key.slice(2)))
  }
  const provenPkgs = new Set()
  for (const ins of engine.installs) {
    if (ins.ok) provenPkgs.add(ins.pkg)
  }

  // ---- 提名（写账 → 名账，kind+名 全局去重）--------------------------------
  for (const rec of engine.writes) {
    const key = objectKey(rec.args, rec.name)
    if (typeof key !== 'string' || !key.startsWith('p:')) continue
    const path = normalizePath(key.slice(2))
    if (!isCodePath(path, exts)) continue
    const content = contentOf(rec.args)
    if (!content) continue
    for (const spec of extractSpecs(content)) {
      const cls = classifySpec(spec)
      if (cls.kind === 'skip') continue
      let entry
      if (cls.kind === 'builtin') {
        entry = { kind: 'builtin', name: spec, resolved: null, session: rec.session, ref: rec.ref }
      } else if (cls.kind === 'relative') {
        const resolved = resolveRelative(spec, path)
        entry = { kind: 'relative', name: spec, resolved, session: rec.session, ref: rec.ref }
      } else {
        entry = { kind: 'bare', name: cls.pkg, resolved: null, session: rec.session, ref: rec.ref }
      }
      const id = `${entry.kind}:${entry.kind === 'relative' ? entry.resolved : entry.name}`
      if (!engine.imports.has(id)) engine.imports.set(id, entry)
    }
  }

  // ---- 引之名：内建 → 册内 → 生实 → 妄 --------------------------------------
  let exemptImports = 0
  let exemptInRegistry = 0
  let exemptGenerated = 0
  let exemptBuiltin = 0
  const ghostPackages = []
  const ghostRelatives = []
  for (const entry of engine.imports.values()) {
    if (entry.kind === 'builtin') {
      exemptImports += 1
      exemptBuiltin += 1
      continue
    }
    if (entry.kind === 'relative') {
      const inRoot = registry.roots.some((r) => globMatches(r, entry.resolved))
      if (inRoot || provenPaths.has(entry.resolved)) {
        exemptImports += 1
        if (inRoot) exemptInRegistry += 1
        else exemptGenerated += 1
      } else {
        ghostRelatives.push(entry)
      }
      continue
    }
    // bare
    const inRegistry = registry.packages.includes(entry.name)
    if (inRegistry || provenPkgs.has(entry.name)) {
      exemptImports += 1
      if (inRegistry) exemptInRegistry += 1
      else exemptGenerated += 1
    } else {
      ghostPackages.push(entry)
    }
  }

  // ---- 装之名：装所册免 → 新装/犯装 → 试装 ---------------------------------
  let exemptInstalls = 0
  let strayInstalls = 0
  let trialInstalls = 0
  const strayNames = []
  const trialNames = []
  for (const ins of engine.installs) {
    if (!ins.ok) {
      trialInstalls += 1
      trialNames.push(ins.pkg)
      continue
    }
    if (registry.packages.includes(ins.pkg)) {
      exemptInstalls += 1
      continue
    }
    strayInstalls += 1
    strayNames.push(ins.pkg)
  }

  // ---- 分值（先于实现锁死）---------------------------------------------------
  const ghost = Math.min(60, 30 * ghostPackages.length) + Math.min(30, 15 * ghostRelatives.length)
  const stray = registry.strictDeps
    ? Math.min(60, 30 * strayInstalls)
    : Math.min(30, 6 * strayInstalls)
  const total = Math.min(100, ghost + stray)
  const band = bandOf(total)
  const verdict = total >= gate ? 'fail' : 'pass'

  // ---- issues 行序：幻包 → 幻径 → 新装/犯装 → 试装 → 实名 --------------------
  const issues = []
  if (ghostPackages.length) {
    issues.push(
      `幻包 ×${ghostPackages.length}（+30/名）：${ghostPackages.map((e) => e.name).join('、')} —— 名下无实：册外且全流无装成`
    )
  }
  if (ghostRelatives.length) {
    issues.push(
      `幻径 ×${ghostRelatives.length}（+15/名）：${ghostRelatives.map((e) => `${e.name} → ${e.resolved}`).join('、')} —— 名下无实：册外且全流无读写`
    )
  }
  if (strayInstalls) {
    issues.push(
      registry.strictDeps
        ? `犯装 ×${strayInstalls}（+30/次）：${strayNames.join('、')} —— 册外装成（strictDeps 执法态）`
        : `新装 ×${strayInstalls}（+6/次）：${strayNames.join('、')} —— 册外装成，留痕可见`
    )
  }
  if (trialInstalls) {
    issues.push(`试装 ×${trialInstalls}（不计分）：${trialNames.join('、')} —— 装而未成，不生实`)
  }
  if (exemptImports) {
    issues.push(
      `实名 ×${exemptImports}：册内 ${exemptInRegistry} + 生实 ${exemptGenerated} + 内建 ${exemptBuiltin} —— 夫名，实谓也`
    )
  }

  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    writes: engine.writes.length,
    imports: engine.imports.size,
    score: { total, ghost, stray },
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    counts: {
      ghostPackages: ghostPackages.length,
      ghostRelatives: ghostRelatives.length,
      strayInstalls,
      trialInstalls,
      exemptImports,
      exemptInstalls,
      registryCount: declared,
    },
    issues,
  }
}
