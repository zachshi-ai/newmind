/**
 * 波账引擎 —— 状态笔、搅笔、叠数搅窗判定、荡值门禁（docs/03 §4–§10 锁死），
 * 全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流合审把所有会话的调用记进同一引擎（归并序见 audit.js）；
 * 插件只记本会话——单会话视图（跨会话波账归并归离线合并审计）。
 *
 * 通道（docs/03 §2）：波账收全流——胜负只认 exec（诊形），搅动只认成功之写
 * （write 族含 edit/patch/apply）；observe/other 永不入账（读取不记波、不动手
 * 不算搅）。本层零稿面——无稿面宣称词法无径门，全流 exec/write 皆入账，豁免唯对象
 * （澜册 spare）。
 *
 * 状态笔（docs/03 §4）：顺=isError===false ∧ 诊形；逆=isError===true ∧ 诊形；
 * null 不记（老流诚实退化）。点笔=非全量形——命令余文切词注册+挂账，再对已注册
 * 词元做词面命中挂账（输出点名也挂）；全科笔=全量形——顺记全部在场对象、逆只挂
 * 输出词元命中的已注册对象（无矢之红不挂——红不诬未点名对象）。
 *
 * 搅笔（docs/03 §5）：write 族 ∧ isError !== true ∧（径 ∪ content）小写词面含
 * 已注册对象词元 → 该对象一笔搅笔；isError===true 之写不入（没落盘不算搅）；
 * null 按已发生；observe/other 永不搅。
 *
 * 判定（docs/03 §7）：每对象独立——叠数（相邻异极对数）≥3 ∧ 搅窗（夹于首末状态
 * 笔之间的搅笔数）≥2 → 荡案 +30 单案即红；叠 ≥3 ∧ 搅窗 <2 → 风浪注记 0 分（环境
 * 之波非人祸）；叠 ≤2 → 静默（守准之德不入罪）。案序=对象词元字典序；一对象至多
 * 一案；中途收敛不撤案。
 *
 * 荡值（docs/03 §10）：dang 值=min(60,30×荡案)，total=min(100)；分带 平 0–14 /
 * 漾 15–29 / 荡 ≥30；门默认 30。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import { hitsZhenxing, isSweeping, commandTokens, tokensOf, djb2 } from './zhenxing.js'

export const GATE_DEFAULT = 30

export function bandOf(total) {
  if (total < 15) return '平'
  if (total < 30) return '漾'
  return '荡'
}

/** 引擎装配：澜册（spare 豁对象）→ 波账。无册（null）→ spare 为空——无册照判（凡荡必审）。 */
export function createEngine({ book = null } = {}) {
  return {
    cfg: {
      spare: (book?.spare ?? []).map((t) => String(t).toLowerCase()),
      forms: (book?.forms ?? []).map((f) => String(f)),
      noDefaults: book?.noDefaults === true,
    },
    calls: [], // 全流调用（状态笔与搅笔之源），record 序即流序
  }
}

/** 记一笔调用（唯一写入口）。判定全部在 judge 现算——重放同流必得同判词。 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, content = null }) {
  engine.calls.push({ session, ref, name, args, isError, content })
  return engine
}

/**
 * 波账现算（docs/03 §4/§5）：单次在线遍历——exec 诊形记状态笔（点笔注册+挂账；
 * 全科笔挂已注册对象），write 成功对已注册对象挂搅笔（未验先改时注册表空——
 * 双重不入窗，宁纵方向一致）。
 */
function ledgerOf(engine) {
  const registered = new Map() // 小写词元 → { states: [{k, side}], stirs: [k] }
  const ensure = (t) => {
    if (!registered.has(t)) registered.set(t, { states: [], stirs: [] })
    return registered.get(t)
  }
  engine.calls.forEach((c, k) => {
    const fam = familyOf(c.name)
    if (fam === 'exec') {
      const key = objectKey(c.args, c.name)
      if (!key.startsWith('c:')) return
      const command = key.slice(2)
      if (!hitsZhenxing(command, engine.cfg)) return
      if (c.isError !== true && c.isError !== false) return // null 不记——成败未知不诬波
      const side = c.isError === false ? 'zhen' : 'ni'
      const contentLower = typeof c.content === 'string' ? c.content.toLowerCase() : ''
      if (isSweeping(command, engine.cfg)) {
        if (side === 'zhen') {
          // 全科顺：全部在场对象各记一笔顺（全科复验通过——据多则案少）
          for (const rec of registered.values()) rec.states.push({ k, side })
        } else if (contentLower.length > 0) {
          // 全科逆：只挂输出词元命中的已注册对象（无矢之红不挂）
          for (const tok of tokensOf(contentLower)) {
            const rec = registered.get(tok)
            if (rec) rec.states.push({ k, side })
          }
        }
      } else {
        // 点笔：命令余文词元注册+挂账
        const face = (command.toLowerCase() + '\n' + contentLower)
        const hit = new Set()
        for (const tok of commandTokens(command, engine.cfg)) {
          ensure(tok).states.push({ k, side })
          hit.add(tok)
        }
        // 已注册词元被本笔词面点名（命令∪输出）也挂——一笔一对象至多一笔
        for (const [t, rec] of registered) {
          if (!hit.has(t) && face.includes(t)) rec.states.push({ k, side })
        }
      }
    } else if (fam === 'write') {
      if (c.isError === true) return // 失败的写没落盘——不算搅
      const key = objectKey(c.args, c.name)
      const pathPart = key.startsWith('p:') ? normalizePath(key.slice(2)) : ''
      const contentPart = typeof c.args?.content === 'string' ? c.args.content : (typeof c.content === 'string' ? c.content : '')
      const face = (pathPart + '\n' + contentPart).toLowerCase()
      if (face.trim().length === 0) return
      for (const [t, rec] of registered) {
        if (face.includes(t)) rec.stirs.push(k)
      }
    }
  })
  return registered
}

/** 单判引擎判定（docs/03 §7/§9/§10）。judge 纯函数——不改引擎。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const registered = ledgerOf(engine)
  const spareSet = new Set(engine.cfg.spare)
  const counts = { dang: 0, feng: 0, zhen: 0, ni: 0, jiao: 0 }
  const cases = []
  const notes = []
  let objects = 0
  for (const t of [...registered.keys()].sort()) {
    const rec = registered.get(t)
    if (spareSet.has(t)) continue // 澜册 spare：整线免审不记（counts 亦不计）
    if (rec.states.length === 0) continue
    objects += 1
    for (const s of rec.states) {
      if (s.side === 'zhen') counts.zhen += 1
      else counts.ni += 1
    }
    counts.jiao += rec.stirs.length
    if (rec.states.length < 2) continue // 单帧无所谓振荡
    let die = 0
    for (let i = 1; i < rec.states.length; i++) {
      if (rec.states[i].side !== rec.states[i - 1].side) die += 1
    }
    const firstK = rec.states[0].k
    const lastK = rec.states[rec.states.length - 1].k
    const window = rec.stirs.filter((k) => k > firstK && k < lastK).length
    if (die >= 3 && window >= 2) {
      counts.dang += 1
      cases.push({ type: '荡案', token: t, die, window, fp: djb2(t) })
    } else if (die >= 3) {
      counts.feng += 1
      notes.push({ type: '风浪', token: t, die, window })
    }
  }
  const score = {
    dang: Math.min(60, 30 * counts.dang),
  }
  score.total = Math.min(100, score.dang)
  const band = bandOf(score.total)
  const verdict = score.total >= gate ? 'fail' : 'pass'
  const issues = []
  for (const c of cases) {
    issues.push(`荡案：${c.token}（叠 ${c.die} · 搅 ${c.window}）（指纹 ${c.fp}）`)
  }
  for (const n of notes) {
    issues.push(`注记：${n.token} 风浪（叠 ${n.die} · 搅 ${n.window}）——波自翻转而手未动，环境之波非人祸`)
  }
  if (issues.length === 0) {
    issues.push(`波平浪静 ×${objects} 对象 —— 凡荡必审，守准者无罪`)
  }
  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    objects,
    counts,
    score,
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    issues,
    cases,
    notes,
  }
}

/** 导出会话流（call/result 成对，args 与结果正文原样随流携带）——插件 exportStream 的核。 */
export function exportCalls(calls) {
  const out = []
  calls.forEach((rec, i) => {
    const id = rec.ref ?? `m${i + 1}`
    out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: undefined })
    const result = { type: 'tool_result', id, name: rec.name, args: rec.args, isError: rec.isError === true, at: undefined }
    if (rec.content) result.content = rec.content
    out.push(result)
  })
  return out
}
