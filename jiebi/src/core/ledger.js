/**
 * 解蔽账本 —— schema 校验与蔽值评分。
 *
 * 职责严格分离：
 *   validateLedger  schema 层：字段类型与取值域（非法 → CLI 退出码 2）
 *   scoreLedger     蔽值层：结构完备性（分高 → CLI 退出码 1）
 *
 * 零语义判断：不读任何字段的"意思"，只看"有没有、够不够"。
 * 蔽值七项全部来自《荀子·解蔽》原文条款，无一凭感觉设定（docs/03-design.md 评分表）。
 */

export const KINDS = ['diagnosis', 'approach', 'conclusion']
export const EXPECTS = ['fail', 'success']
export const STATUS = ['open', 'settled']

/** 蔽值分带：0–14 明，15–29 半蔽，≥30 蔽。 */
export const THRESHOLD_DEFAULT = 30

export function bandOf(score) {
  if (score <= 14) return '明'
  if (score <= 29) return '半蔽'
  return '蔽'
}

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0

/** schema 校验。返回 { valid, issues: [{ code:'schema', path, message }] }。 */
export function validateLedger(obj) {
  const issues = []
  const bad = (path, message) => issues.push({ code: 'schema', path, message })

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, issues: [{ code: 'schema', path: '$', message: '账本必须是一个 JSON 对象' }] }
  }
  if (obj.version !== 1) bad('version', '必须是 1（当前仅支持 ledger v1）')
  if (!isNonEmpty(obj.id)) bad('id', '必须是非空字符串')
  if (!KINDS.includes(obj.kind)) bad('kind', `必须是 ${KINDS.join(' | ')} 之一`)
  if (!isNonEmpty(obj.question)) bad('question', '必须是非空字符串')

  if (!Array.isArray(obj.alternatives)) {
    bad('alternatives', '必须是数组（允许为空数组，蔽值会记 +40）')
  } else {
    obj.alternatives.forEach((alt, i) => {
      const at = `alternatives[${i}]`
      if (!alt || typeof alt !== 'object' || Array.isArray(alt)) {
        bad(at, '必须是对象')
        return
      }
      if (!isNonEmpty(alt.name)) bad(`${at}.name`, '必须是非空字符串')
      for (const field of ['steelman', 'killCondition']) {
        const v = alt[field]
        if (v !== undefined && v !== null && !isNonEmpty(v)) {
          bad(`${at}.${field}`, '存在但为空串/空白 —— 与缺失同罪，请直接删掉或写满')
        }
      }
      if (alt.evidence !== undefined && !Array.isArray(alt.evidence)) {
        bad(`${at}.evidence`, '必须是数组')
      } else if (Array.isArray(alt.evidence)) {
        alt.evidence.forEach((ev, j) => {
          const eat = `${at}.evidence[${j}]`
          if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return bad(eat, '必须是对象')
          if (!isNonEmpty(ev.ref)) bad(`${eat}.ref`, '必须是非空字符串（指向会话流里的调用 id）')
          if (ev.expect !== undefined && !EXPECTS.includes(ev.expect)) {
            bad(`${eat}.expect`, `必须是 ${EXPECTS.join(' | ')} 之一`)
          }
        })
      }
    })
  }

  if (!Array.isArray(obj.disconfirming)) {
    bad('disconfirming', '必须是数组（允许为空数组，蔽值会记 +15）')
  } else {
    obj.disconfirming.forEach((d, i) => {
      const at = `disconfirming[${i}]`
      if (!d || typeof d !== 'object' || Array.isArray(d)) return bad(at, '必须是对象')
      if (!isNonEmpty(d.ref)) bad(`${at}.ref`, '必须是非空字符串')
    })
  }

  if (!obj.verdict || typeof obj.verdict !== 'object' || Array.isArray(obj.verdict)) {
    bad('verdict', '必须是对象（choice/weights/falsifiable 可缺，蔽值各自记分）')
  } else {
    for (const field of ['choice', 'weights', 'falsifiable']) {
      const v = obj.verdict[field]
      if (v !== undefined && v !== null && !isNonEmpty(v)) {
        bad(`verdict.${field}`, '存在但为空串/空白 —— 与缺失同罪')
      }
    }
  }

  if (obj.status !== undefined && !STATUS.includes(obj.status)) {
    bad('status', `必须是 ${STATUS.join(' | ')} 之一或缺省`)
  }

  return { valid: issues.length === 0, issues }
}

/**
 * 蔽值评分（只对 schema 合法的账本调用；七项条款见 docs/03-design.md）。
 * 返回 { score, band, issues: [{ code, points, message }] }，score 封顶 100。
 */
export function scoreLedger(ledger) {
  const issues = []
  const add = (code, points, message) => {
    if (points > 0) issues.push({ code, points, message })
    return points
  }

  const alternatives = Array.isArray(ledger.alternatives) ? ledger.alternatives : []
  const disconfirming = Array.isArray(ledger.disconfirming) ? ledger.disconfirming : []
  const verdict = ledger.verdict && typeof ledger.verdict === 'object' ? ledger.verdict : {}

  let score = 0

  // 壹门 · 蔽于一曲，而闇于大理：兼陈万物，候选 < 2 直记大分
  if (alternatives.length < 2) score += add('few_alternatives', 40, '候选少于 2 个（蔽于一曲）')

  // 兼陈万物：没摆出最强形式的不算兼陈
  const noSteelman = alternatives.filter((a) => !isNonEmpty(a?.steelman))
  score += add('missing_steelman', Math.min(16, noSteelman.length * 8),
    noSteelman.length ? `${noSteelman.length} 个候选缺 steelman（最强形式）` : '')

  // premortem：结论要自带验尸条款，候选要自带死亡条款
  const noKill = alternatives.filter((a) => !isNonEmpty(a?.killCondition))
  score += add('missing_kill', Math.min(16, noKill.length * 8),
    noKill.length ? `${noKill.length} 个候选缺 killCondition（死亡条款）` : '')

  // 虚门 · 不以所已臧害所将受谓之虚：零反证 = 旧判断还在锁死新证据
  if (disconfirming.length === 0) score += add('no_disconfirming', 15, '零反证登记（虚门未过）')

  // 静门 · 不以梦剧乱知谓之静：结论必须可证伪
  if (!isNonEmpty(verdict.falsifiable)) score += add('no_falsifiable', 15, '结论无可证伪条件（静门未过）')

  // 县衡 · 兼陈万物而中县衡焉：裁决必须带显式的秤
  if (!isNonEmpty(verdict.weights)) score += add('no_weights', 10, '裁决无显式权重（县衡未悬）')

  // 众异不得相蔽以乱其伦：裁决必须命中已兼陈的候选
  const names = new Set(alternatives.map((a) => a?.name))
  if (!names.has(verdict.choice)) score += add('dangling_choice', 20, '裁决悬空：choice 未命中任何候选名')

  score = Math.min(100, score)
  return { score, band: bandOf(score), issues }
}

/** 生成一份账本骨架（占位文本即填写指南）。 */
export function makeTemplate(kind = 'diagnosis') {
  if (!KINDS.includes(kind)) throw new Error(`kind 必须是 ${KINDS.join(' | ')} 之一`)
  const questionHint = {
    diagnosis: '问题的根因是什么？',
    approach: 'A 还是 B（还是 C）？选哪个、为什么？',
    conclusion: '本次调研要下的结论是什么？',
  }[kind]
  return {
    version: 1,
    id: 'd-000',
    kind,
    question: questionHint,
    alternatives: [
      {
        name: '候选一（先写你最怀疑的那个）',
        steelman: '它为什么可能是对的？写出最强辩护，不是稻草人。',
        killCondition: '出现什么证据时此案作废？写可判定的条件。',
        evidence: [{ ref: '指向会话流里的调用 id，如 t2-c1', expect: 'fail', note: '这条证据说明了什么' }],
      },
      {
        name: '候选二（诚实地写一个你不想选的）',
        steelman: '同上。',
        killCondition: '同上。',
        evidence: [],
      },
    ],
    disconfirming: [
      { ref: '指向与你的首选相左的那条证据', note: '它为什么相左、你怎么回应它' },
    ],
    verdict: {
      choice: '必须与某个 alternatives[].name 逐字一致',
      weights: '秤为什么倾向它？显式写出比较理由。',
      falsifiable: '什么证据出现时，本结论作废、账本重开？',
    },
  }
}
