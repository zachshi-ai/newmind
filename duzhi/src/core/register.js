/**
 * 制册 —— 预算声明的 schema 校验与两条线（调用 / 时长）的解析。
 *
 * 冢宰制国用：线由任务方在用之前立好；声明权在任务方，Agent 无从自我发额度。
 * 两种形状同构生效：
 *   - 册形（.duzhi.json 文件）：{ version:1, id, budget:{ maxCalls?, maxMinutes? } }
 *   - 简形（插件 config.register）：{ id?, maxCalls?, maxMinutes? }
 * CLI 旗标 --max-calls / --max-minutes 与册互补、同键覆盖。
 * 零语义判断：不读字段的「意思」，只看「有没有、够不够」。
 */

export const GATE_DEFAULT = 30

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0
const isUnit = (v) => Number.isInteger(v) && v >= 1

/** 册形 schema 校验。返回 { valid, issues: [{ code:'schema', path, message }] }。 */
export function validateRegister(obj) {
  const issues = []
  const bad = (path, message) => issues.push({ code: 'schema', path, message })

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, issues: [{ code: 'schema', path: '$', message: '制册必须是一个 JSON 对象' }] }
  }
  if (obj.version !== 1) bad('version', '必须是 1（当前仅支持制册 v1）')
  if (!isNonEmpty(obj.id)) bad('id', '必须是非空字符串（任无名则账无所系）')

  if (!obj.budget || typeof obj.budget !== 'object' || Array.isArray(obj.budget)) {
    bad('budget', '必须是对象（maxCalls 与 maxMinutes 至少立一条线——无量纲之册非法）')
  } else {
    const hasCalls = obj.budget.maxCalls !== undefined
    const hasMinutes = obj.budget.maxMinutes !== undefined
    if (!hasCalls && !hasMinutes) bad('budget', '至少要立一条线（maxCalls / maxMinutes）')
    if (hasCalls && !isUnit(obj.budget.maxCalls)) bad('budget.maxCalls', '存在时必须是 ≥1 的整数')
    if (hasMinutes && !isUnit(obj.budget.maxMinutes)) bad('budget.maxMinutes', '存在时必须是 ≥1 的整数')
  }
  return { valid: issues.length === 0, issues }
}

/**
 * 两条线的解析：册形/简形 register ∪ CLI 旗标（同键旗标覆盖）。
 * 返回 { caps: { maxCalls?, maxMinutes? }, id, issues }——caps 里缺键 = 该维度未设线。
 */
export function resolveCaps({ register, maxCalls, maxMinutes, id } = {}) {
  const reg = register && typeof register === 'object' && !Array.isArray(register) ? register : {}
  const fromReg = reg.budget && typeof reg.budget === 'object' ? reg.budget : reg
  const pick = (flag, regVal) => {
    if (flag !== undefined && flag !== null) return isUnit(flag) ? flag : undefined
    return isUnit(regVal) ? regVal : undefined
  }
  const caps = {
    maxCalls: pick(maxCalls, fromReg.maxCalls),
    maxMinutes: pick(maxMinutes, fromReg.maxMinutes),
  }
  if (caps.maxCalls === undefined) delete caps.maxCalls
  if (caps.maxMinutes === undefined) delete caps.maxMinutes
  return { caps, id: isNonEmpty(id) ? id : isNonEmpty(reg.id) ? reg.id : null }
}

/** 简形两线的独立校验（旗标与 config 直配共用）。 */
export function validateCaps({ maxCalls, maxMinutes } = {}) {
  const issues = []
  if (maxCalls !== undefined && maxCalls !== null && !isUnit(maxCalls)) {
    issues.push({ code: 'schema', path: 'maxCalls', message: '存在时必须是 ≥1 的整数' })
  }
  if (maxMinutes !== undefined && maxMinutes !== null && !isUnit(maxMinutes)) {
    issues.push({ code: 'schema', path: 'maxMinutes', message: '存在时必须是 ≥1 的整数' })
  }
  return { valid: issues.length === 0, issues }
}

/** 有没有立过至少一条线——一条都没有即无制。 */
export function hasCaps(caps) {
  return caps != null && (caps.maxCalls != null || caps.maxMinutes != null)
}
