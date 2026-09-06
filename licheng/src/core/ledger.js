/**
 * 绳账 schema —— 立诚的账面形状校验。
 *
 * 四种条目（JSONL，一行一结；`#` 与空行为注释）：
 *   promise   立结：type,id,what 必需；discharge 可选；禁止 supersedes/reason/settles
 *   revise    改结：type,id,supersedes,reason 必需；what/discharge 可选；禁止 settles
 *   abandon   解约：type,id,supersedes,reason 必需；禁止 what/discharge/settles
 *   discharge 兑现宣告：type,settles,discharge 必需；禁止 id/what/reason/supersedes
 *
 * schema 错误与计分无关：坏行（报行号）、缺必需键、空串、未知键、
 * id 重复、supersedes/settles 指向不存在的结或已关闭的结——都让整本账
 * 无法结账（exit 2），账目混乱不是过错，是账没立起来。
 */

const ENTRY_KINDS = ['promise', 'revise', 'abandon', 'discharge']

const REQUIRED = {
  promise: ['type', 'id', 'what'],
  revise: ['type', 'id', 'supersedes', 'reason'],
  abandon: ['type', 'id', 'supersedes', 'reason'],
  discharge: ['type', 'settles', 'discharge'],
}

const OPTIONAL = {
  promise: ['discharge'],
  revise: ['what', 'discharge'],
  abandon: [],
  discharge: [],
}

/** 凭据形状：contains 必需（非空串）；tool 可选非空串；ok 可选 boolean。 */
export function validateDischarge(d) {
  const issues = []
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    return { valid: false, issues: ['discharge 必须是对象'] }
  }
  for (const k of Object.keys(d)) {
    if (!['tool', 'contains', 'ok'].includes(k)) issues.push(`discharge 未知键 "${k}"`)
  }
  if (typeof d.contains !== 'string' || d.contains.length === 0) {
    issues.push('discharge.contains 必需且为非空串')
  }
  if (d.tool !== undefined && (typeof d.tool !== 'string' || d.tool.length === 0)) {
    issues.push('discharge.tool 必须是非空串')
  }
  if (d.ok !== undefined && typeof d.ok !== 'boolean') {
    issues.push('discharge.ok 必须是 boolean')
  }
  return { valid: issues.length === 0, issues }
}

/** 单条目的形状校验（不含账序/id 重复——那需要整本账的状态）。 */
export function validateEntryShape(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { valid: false, issues: ['条目必须是对象'] }
  }
  const kind = entry.type
  if (!ENTRY_KINDS.includes(kind)) {
    return { valid: false, issues: [`type 未知: ${JSON.stringify(kind ?? null)}`] }
  }
  const issues = []
  const allowed = [...REQUIRED[kind], ...OPTIONAL[kind]]
  for (const k of REQUIRED[kind]) {
    const v = entry[k]
    if (v === undefined || v === null) issues.push(`缺必需键 "${k}"`)
    else if (typeof v === 'string' && v.length === 0) issues.push(`键 "${k}" 是空串`)
  }
  for (const k of Object.keys(entry)) {
    if (!allowed.includes(k)) issues.push(`未知键 "${k}"`)
  }
  if (entry.discharge !== undefined) {
    const dv = validateDischarge(entry.discharge)
    if (!dv.valid) issues.push(...dv.issues)
  }
  return { valid: issues.length === 0, issues }
}

/**
 * 解析整本绳账。返回 { valid, issues, entries }：
 * valid 行进入 entries；任何一行有问题则 valid:false（账没立起来）。
 */
export function parseLedger(text) {
  const issues = []
  const entries = []
  const seenIds = new Set()
  const openIds = new Map()
  const lines = String(text).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim()
    if (!raw || raw.startsWith('#')) continue
    const row = i + 1
    let entry
    try {
      entry = JSON.parse(raw)
    } catch (error) {
      issues.push(`第 ${row} 行不是合法 JSON: ${error.message}`)
      continue
    }
    const shape = validateEntryShape(entry)
    if (!shape.valid) {
      issues.push(...shape.issues.map((m) => `第 ${row} 行 ${m}`))
      continue
    }
    const kind = entry.type
    if (kind === 'promise' || kind === 'revise') {
      if (seenIds.has(entry.id)) {
        issues.push(`第 ${row} 行 id 重复: ${entry.id}`)
        continue
      }
    }
    if (kind === 'revise' || kind === 'abandon' || kind === 'discharge') {
      const target = kind === 'discharge' ? entry.settles : entry.supersedes
      if (!openIds.has(target)) {
        const why = seenIds.has(target) ? '已关闭' : '不存在'
        issues.push(`第 ${row} 行 ${kind === 'discharge' ? 'settles' : 'supersedes'} 指向${why}的结: ${target}`)
        continue
      }
    }
    if (kind === 'promise') {
      openIds.set(entry.id, true)
      seenIds.add(entry.id)
    } else if (kind === 'revise') {
      openIds.delete(entry.supersedes)
      openIds.set(entry.id, true)
      seenIds.add(entry.id)
    } else if (kind === 'abandon') {
      openIds.delete(entry.supersedes)
    }
    entries.push(entry)
  }
  return { valid: issues.length === 0, issues, entries }
}

/** 账面状态：seen=出现过的 id；open=此刻仍开的结。供插件记账前的状态校验。 */
export function openIdsOf(entries) {
  const open = new Map()
  const seen = new Set()
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue
    if (e.type === 'promise') {
      if (seen.has(e.id)) continue
      open.set(e.id, true)
      seen.add(e.id)
    } else if (e.type === 'revise') {
      if (!open.has(e.supersedes) || seen.has(e.id)) continue
      open.delete(e.supersedes)
      open.set(e.id, true)
      seen.add(e.id)
    } else if (e.type === 'abandon') {
      open.delete(e.supersedes)
    }
  }
  return { open, seen }
}

/** 绳账骨架：可直接通过 parseLedger 校验。 */
export function templateLedger() {
  return [
    '# 绳账 · 立诚（一行一结；# 与空行为注释）',
    '# 立结：what 是诺言本身；discharge 是兑现凭据（拟之而后言——出口前先想好怎样算做到）',
    JSON.stringify({
      type: 'promise',
      id: 'p-001',
      what: '跑全量测试并贴出输出',
      discharge: { tool: 'bash', contains: 'npm test', ok: true },
    }),
    '# 改结：带理由显式登记，旧结合法关闭（悔，不记分）；未覆盖的字段从旧结继承',
    JSON.stringify({
      type: 'revise',
      id: 'p-001r',
      supersedes: 'p-001',
      reason: '范围收窄为 smoke 测试',
      what: '跑 smoke 并贴出输出',
    }),
    JSON.stringify({ type: 'promise', id: 'p-002', what: '优化热路径性能' }),
    '# 解约：带理由显式作废（不记分，入账可审计）',
    JSON.stringify({
      type: 'abandon',
      id: 'p-002a',
      supersedes: 'p-002',
      reason: '宿主 mid-run 指示改用方案 B，原优化作废',
    }),
    JSON.stringify({ type: 'promise', id: 'p-003', what: '同步 README 示例' }),
    '# 兑现宣告：忘记立凭时的补悔路径（凭据仍要对账，口头兑现解不开结）',
    JSON.stringify({
      type: 'discharge',
      settles: 'p-003',
      discharge: { tool: 'write', contains: 'README' },
    }),
    '',
  ].join('\n')
}
