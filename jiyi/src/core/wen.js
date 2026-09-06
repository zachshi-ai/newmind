/**
 * 问凭据与触发域 —— 谋及卿士的机器判据（全部词法与流序，零语义判断）。
 *
 * 问凭据两通道得一即免（docs/03 §3）：
 *   - 读取通道：成功（isError ≠ true）的 observe 族调用，对象键路径规整后与 ask.path 相等；
 *   - 命令通道：成功（isError ≠ true）的 exec 族调用，command 文本含 ask.path 原文子串
 *     （词法相交从宽——误认问属宁漏）。
 *
 * 空疑豁免：失败的 observe 族调用且对象键路径规整后与 ask.path 相等——问过了，环境答「没有」。
 * 痕迹：任何族的对象键路径规整后相等，或任何 exec 的命令文本含名——默认档「未见/独谋」之分野。
 */

import { objectKey, familyOf } from './object.js'
import { normalizePath } from './normalize.js'

function pathOf(call) {
  const key = objectKey(call.args, call.name)
  if (typeof key !== 'string' || !key.startsWith('p:')) return null
  return normalizePath(key.slice(2))
}

/** 问凭据：两通道得一即真（只认成功——isError === true 永不构成凭据）。 */
export function isFulfil(call, ask) {
  if (call.isError === true) return false
  const fam = familyOf(call.name)
  if (fam === 'observe') {
    const p = pathOf(call)
    return p !== null && p === normalizePath(ask.path)
  }
  if (fam === 'exec') {
    const cmd = call.args && typeof call.args.command === 'string' ? call.args.command : ''
    return cmd.includes(ask.path)
  }
  return false
}

/** 空疑豁免：失败读取（环境答「没有」）。 */
export function isEmptyAsk(call, ask) {
  if (call.isError !== true) return false
  if (familyOf(call.name) !== 'observe') return false
  const p = pathOf(call)
  return p !== null && p === normalizePath(ask.path)
}

/** 痕迹：任何族的对象路径相等，或任何族 exec 命令含名（成败不论）。 */
export function hasTrace(call, ask) {
  const fam = familyOf(call.name)
  const p = pathOf(call)
  if (p !== null && p === normalizePath(ask.path)) return true
  if (fam === 'exec') {
    const cmd = call.args && typeof call.args.command === 'string' ? call.args.command : ''
    if (cmd.includes(ask.path)) return true
  }
  return false
}

/** 触发域命中：write / exec / any（write ∪ exec）。 */
export function domainHit(call, on) {
  const fam = familyOf(call.name)
  if (on === 'write') return fam === 'write'
  if (on === 'exec') return fam === 'exec'
  if (on === 'any') return fam === 'write' || fam === 'exec'
  return false
}
