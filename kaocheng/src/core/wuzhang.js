/**
 * 物账引擎 —— 工据/灭据登记与契约判定（docs/03 §2/§4/§5/§7 锁死），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流审计把所有会话的调用记进同一引擎（契径全局、时序按参序拼接的流序）；
 * 插件只记本会话——单会话视图（跨会话之归并归离线合并审计）。
 *
 * 入口滤（先于一切，docs/03 §2）：isError === true 一律不入账——失败之写不是工（物不在场照判幽物，
 * 契约考果不考勉）；isError 未知（null，老流）按已发生入账（未知不是失败）。
 *
 * 工据唯二（docs/03 §2）：
 *   write 族 p: 径命中契径 → 一笔工（content 取 args.content，可为 null——无据之写）；
 *   exec 族生产词法：cp/mv 末个非旗标词元 ∪ tee/touch 任一非旗标词元 ∪ 重定向目标 → 工见一笔。
 * 观察不是工：observe 族永不生工据。write/other 族不生 exec 工见。
 *
 * 灭据：段内任一词元命中灭词表（rm/unlink/rmdir/del/erase/trash/shred）且任一非旗标词元与契径匹配
 *   （规整逐字相等 ∪ 宽 glob）；破坏段内不再计工见（rm 不生产）。
 *
 * 判定序锁死（docs/03 §4，逐件恰好一态）：
 *   幽物（全流无工 +30）> 工见未考（exec 工据，结形黑盒沉默 0）> 灭物（末笔写之后遭毁灭 +30）
 *   > 账上无末态（有写而无据，老流 0）> 壳物（末据空白 +20）> 畸物（声 json 而不可解析 +30）
 *   > 疵物（域/词/卷条款有缺）> 诚物（全条款过 0）。
 *   末据=末笔带 content 之成功写；无据之改不改末据；写间灭据不判灭（考其末）。
 *
 * 诚值锁死（docs/03 §5）：you=min(60,30×幽) mie=min(60,30×灭) ke=min(40,20×壳) qi=min(60,30×畸)
 *   fields=min(30,10×缺域) words=min(15,5×缺词) lines=min(20,10×短卷) total=min(100,和)；
 *   分带 诚 0–14 / 欠 15–29 / 欺 ≥30；门默认 30——单幽/灭/畸即红、单壳黄牌不咬门。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import {
  RM_WORDS, COPY_VERBS, TOUCH_VERBS,
  segments, tokenize, argTokens, redirectTargets, tokenMatchesPath,
} from './lexicon.js'

export const GATE_DEFAULT = 30

const PER_YOU = 30
const CAP_YOU = 60
const PER_MIE = 30
const CAP_MIE = 60
const PER_KE = 20
const CAP_KE = 40
const PER_QI = 30
const CAP_QI = 60
const PER_FIELD = 10
const CAP_FIELD = 30
const PER_WORD = 5
const CAP_WORD = 15
const PER_LINE = 10
const CAP_LINE = 20

export function bandOf(total) {
  if (total < 15) return '诚'
  if (total < 30) return '欠'
  return '欺'
}

/** 引擎装配：契册 → 判定对象（path 规整）。无册（null）→ contractless——无册不判。 */
export function createEngine({ book = null } = {}) {
  const items = (book?.items ?? []).map((it) => ({ ...it, path: normalizePath(it.path) }))
  const byPath = new Map(items.map((it) => [it.path, it]))
  return {
    cfg: { items, byPath, contractless: items.length === 0 },
    calls: [],
    seq: 0,
    writes: new Map(), // 规整径 → [{seq, session, ref, content}]（seq 递增序）
    prods: new Map(),  // 规整径 → [{seq, session, ref, how}]（exec 工见）
    kills: new Map(),  // 规整径 → [{seq, session, ref}]
  }
}

/** 真实行数：按内容真实换行切分、末尾换行不计（同 zhizu 行数口径）。 */
export function lineCount(content) {
  const ls = String(content ?? '').split(/\r?\n/)
  if (ls.length > 1 && ls[ls.length - 1] === '') ls.pop()
  return ls.length
}

/** 末据条款逐条考（docs/03 §4 第 7 序）：域/词/卷可叠加。
 *  parsed 传 undefined 表示 text 通道——域条仅 json 有义，text 契不考域；
 *  parsed 传 null（json 声明但解析失败）不会到这里——畸物在先，不双罚。 */
function judgeClauses(item, content, parsed) {
  const missing = { fields: [], words: [], lines: null }
  if (parsed !== undefined) {
    const isObj = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    for (const f of item.fields ?? []) {
      if (!isObj || !Object.prototype.hasOwnProperty.call(parsed, f)) missing.fields.push(f)
    }
  }
  for (const w of item.words ?? []) {
    if (!content.includes(w)) missing.words.push(w)
  }
  if (item.minLines != null) {
    const have = lineCount(content)
    if (have < item.minLines) missing.lines = { have, need: item.minLines }
  }
  return missing
}

/** 逐件判定（唯一判定点）：judge 与考牌块共用；按契册声明序。 */
export function settleLines(engine) {
  return engine.cfg.items.map((item) => {
    const writes = engine.writes.get(item.path) ?? []
    const prods = engine.prods.get(item.path) ?? []
    const kills = engine.kills.get(item.path) ?? []
    const lastWrite = writes.length ? writes[writes.length - 1] : null
    const lastKnown = [...writes].reverse().find((w) => w.content !== null) ?? null
    const killed = lastWrite ? kills.some((k) => k.seq > lastWrite.seq) : false

    let state
    let missing = { fields: [], words: [], lines: null }
    let parsed = null
    if (!lastWrite && prods.length === 0) {
      state = '幽物'
    } else if (!lastWrite) {
      state = '工见未考'
    } else if (killed) {
      state = '灭物'
    } else if (!lastKnown) {
      state = '账上无末态'
    } else {
      const content = lastKnown.content
      if (content.trim() === '') {
        state = '壳物'
      } else if (item.form === 'json') {
        let ok = true
        try {
          parsed = JSON.parse(content)
        } catch {
          ok = false
        }
        if (!ok) state = '畸物' // 畸物不双罚域条：解析不成，域条必全缺
        else {
          missing = judgeClauses(item, content, parsed)
          state = missing.fields.length || missing.words.length || missing.lines ? '疵物' : '诚物'
        }
      } else {
        missing = judgeClauses(item, content, undefined) // text 通道：域条仅 json 有义
        state = missing.fields.length || missing.words.length || missing.lines ? '疵物' : '诚物'
      }
    }

    const rawScore =
      state === '幽物' ? PER_YOU
      : state === '灭物' ? PER_MIE
      : state === '壳物' ? PER_KE
      : state === '畸物' ? PER_QI
      : state === '疵物'
        ? missing.fields.length * PER_FIELD + missing.words.length * PER_WORD + (missing.lines ? PER_LINE : 0)
        : 0

    return {
      name: item.name,
      path: item.path,
      form: item.form,
      state,
      writes: writes.length,
      seen: prods.length,
      killed,
      lastWrite: lastWrite ? { seq: lastWrite.seq, session: lastWrite.session, ref: lastWrite.ref } : null,
      lastKnown: lastKnown ? { seq: lastKnown.seq, session: lastKnown.session, ref: lastKnown.ref } : null,
      missing,
      score: rawScore,
    }
  })
}

/** issues 行序锁死（docs/03 §7）：幽 → 灭 → 畸 → 壳 → 疵 → 工见未考 → 无末态 → 全诚。 */
export function issuesOf(settled) {
  const issues = []
  const you = settled.filter((l) => l.state === '幽物')
  if (you.length) {
    issues.push(`幽物 ×${you.length}（+30/件）：${you.map((l) => l.path).join('、')} —— 契上之物，全流无工`)
  }
  const mie = settled.filter((l) => l.state === '灭物')
  if (mie.length) {
    issues.push(
      `灭物 ×${mie.length}（+30/件）：${mie.map((l) => `${l.path}（末笔 seq ${l.lastWrite.seq}，${l.lastWrite.session}）`).join('、')} —— 工成而毁，物终不存`,
    )
  }
  const qi = settled.filter((l) => l.state === '畸物')
  if (qi.length) {
    issues.push(`畸物 ×${qi.length}（+30/件）：${qi.map((l) => `${l.path}（声 ${l.form}，末据不可解析）`).join('、')} —— 以形许人而形不成`)
  }
  const ke = settled.filter((l) => l.state === '壳物')
  if (ke.length) {
    issues.push(`壳物 ×${ke.length}（+20/件）：${ke.map((l) => l.path).join('、')} —— 有其名无其实`)
  }
  const ci = settled.filter((l) => l.state === '疵物')
  if (ci.length) {
    const detail = ci
      .map((l) => {
        const parts = []
        if (l.missing.fields.length) parts.push(`缺域 ${l.missing.fields.join('、')}`)
        if (l.missing.words.length) parts.push(`缺词 ${l.missing.words.join('、')}`)
        if (l.missing.lines) parts.push(`短卷 ${l.missing.lines.have}/${l.missing.lines.need} 行`)
        return `${l.path}（${parts.join('；')}）`
      })
      .join('；')
    issues.push(`疵物 ×${ci.length}：${detail} —— 功有不当`)
  }
  const unseen = settled.filter((l) => l.state === '工见未考')
  if (unseen.length) {
    issues.push(`工见未考 ×${unseen.length}（不计分）：${unseen.map((l) => l.path).join('、')} —— 物由命令生成，末态不在流内`)
  }
  const noend = settled.filter((l) => l.state === '账上无末态')
  if (noend.length) {
    issues.push(`账上无末态 ×${noend.length}（不计分）：${noend.map((l) => l.path).join('、')} —— 有工之笔未携内容，诚实沉默`)
  }
  const cheng = settled.filter((l) => l.state === '诚物')
  if (cheng.length === settled.length && settled.length) {
    issues.push(`物皆诚 ×${cheng.length} —— 必功致为上`)
  }
  return issues
}

/**
 * 记一笔调用（唯一写入口）。段内先判破坏（rm 族）后判生产（cp/mv/tee/touch/重定向）；
 * 破坏段不再计工见（rm 不生产）。
 */
export function recordCall(engine, { session, ref = null, name, args, isError = null }) {
  const rec = { session, ref, name, args, isError }
  engine.calls.push(rec)
  if (isError === true) return engine // 入口滤：失败之写不是工
  const seq = ++engine.seq
  const fam = familyOf(name)
  const key = objectKey(args, name)

  if (fam === 'write' && key.startsWith('p:')) {
    const path = normalizePath(key.slice(2))
    if (engine.cfg.byPath.has(path)) {
      const content = typeof args?.content === 'string' ? args.content : null
      const list = engine.writes.get(path) ?? []
      list.push({ seq, session, ref, content })
      engine.writes.set(path, list)
    }
    return engine
  }

  if (fam === 'exec' && key.startsWith('c:')) {
    const command = key.slice(2)
    for (const seg of segments(command)) {
      const tokens = tokenize(seg)
      if (!tokens.length) continue
      const destructive = tokens.some((t) => RM_WORDS.includes(t.toLowerCase()))
      for (const path of engine.cfg.byPath.keys()) {
        if (destructive) {
          for (const t of tokens) {
            if (RM_WORDS.includes(t.toLowerCase()) || t.startsWith('-')) continue
            if (tokenMatchesPath(t, path)) {
              const list = engine.kills.get(path) ?? []
              list.push({ seq, session, ref })
              engine.kills.set(path, list)
              break // 每段每径一笔灭据
            }
          }
        } else {
          const head = tokens[0].split(/[/\\]/).pop().toLowerCase()
          const words = argTokens(tokens)
          if (COPY_VERBS.includes(head) && words.length >= 2) {
            if (tokenMatchesPath(words[words.length - 1], path)) {
              const list = engine.prods.get(path) ?? []
              list.push({ seq, session, ref, how: 'cp/mv 末词元' })
              engine.prods.set(path, list)
            }
          } else if (TOUCH_VERBS.includes(head)) {
            for (const t of words.slice(1)) {
              if (tokenMatchesPath(t, path)) {
                const list = engine.prods.get(path) ?? []
                list.push({ seq, session, ref, how: 'tee/touch 词元' })
                engine.prods.set(path, list)
                break
              }
            }
          }
          for (const target of redirectTargets(seg)) {
            if (tokenMatchesPath(target, path)) {
              const list = engine.prods.get(path) ?? []
              list.push({ seq, session, ref, how: '重定向目标' })
              engine.prods.set(path, list)
              break
            }
          }
        }
      }
    }
    return engine
  }

  return engine // observe / other：观察不是工
}

/** 判定：诚值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const settled = settleLines(engine)
  const countBy = (s) => settled.filter((l) => l.state === s).length
  const cheng = countBy('诚物')
  const ci = countBy('疵物')
  const ke = countBy('壳物')
  const qi = countBy('畸物')
  const mie = countBy('灭物')
  const you = countBy('幽物')
  const unseen = countBy('工见未考')
  const noend = countBy('账上无末态')

  const missingFields = settled.reduce((n, l) => n + l.missing.fields.length, 0)
  const missingWords = settled.reduce((n, l) => n + l.missing.words.length, 0)
  const shortLines = settled.filter((l) => l.missing.lines).length

  const score = {
    you: Math.min(CAP_YOU, PER_YOU * you),
    mie: Math.min(CAP_MIE, PER_MIE * mie),
    ke: Math.min(CAP_KE, PER_KE * ke),
    qi: Math.min(CAP_QI, PER_QI * qi),
    fields: Math.min(CAP_FIELD, PER_FIELD * missingFields),
    words: Math.min(CAP_WORD, PER_WORD * missingWords),
    lines: Math.min(CAP_LINE, PER_LINE * shortLines),
  }
  score.total = Math.min(100, score.you + score.mie + score.ke + score.qi + score.fields + score.words + score.lines)

  const contractless = engine.cfg.contractless
  const band = bandOf(score.total)
  const verdict = score.total >= gate ? 'fail' : 'pass'

  const issues = contractless
    ? ['无契而工：契册未立，考诚失据（契约声明权在任务方）']
    : issuesOf(settled)

  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    items: engine.cfg.items.length,
    contractless,
    counts: { items: engine.cfg.items.length, cheng, ci, ke, qi, mie, you, unseen, noend },
    score,
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    issues,
  }
}
