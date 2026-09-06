/**
 * 声册 —— 豁免与增词之册（.xiangxiao.json）。
 *
 * mute：豁免词表（命中行的子串共现即豁免——声明权在任务方，词级粗粒度，宁可放过）；
 * forms：显式形表（正则源字符串，写侧扫描用，与默认形取并集、只增不删）；
 * noDefaults：true 时默认缄/略形表全部关闭，只剩显式形；
 * extraExts：代码后缀增词。
 *
 * 本层无册照判（默认形开箱在岗）——册只管豁免与增词，与 mingshi 的「无册不判」是两种声明权。
 * 校验失败抛 Error（CLI 转 exit 2）。
 */

import { compileForms } from './cixing.js'

export function emptyRegistry() {
  return { version: 1, mute: [], forms: [], noDefaults: false, extraExts: [] }
}

function strArray(v, what) {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new Error(`${what} 必须是字符串数组`)
  }
  return v
}

/** 解析声册 JSON 文本；坏籍抛 Error。显式形当场试编译（坏正则即坏册）。 */
export function parseRegistry(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error(`声册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('声册必须是 JSON 对象')
  if (typeof raw.version !== 'number' || !(raw.version >= 1)) throw new Error('声册 version 必须 ≥ 1')
  const mute = strArray(raw.mute, 'mute')
  const forms = strArray(raw.forms, 'forms')
  const noDefaults = raw.noDefaults === undefined ? false : raw.noDefaults
  if (typeof noDefaults !== 'boolean') throw new Error('noDefaults 必须是布尔')
  const extraExts = strArray(raw.extraExts, 'extraExts')
  try {
    compileForms(forms)
  } catch (error) {
    throw new Error(`显式形无法编译为正则: ${error.message}`)
  }
  return { version: raw.version, mute, forms, noDefaults, extraExts }
}

export function serializeRegistry(registry) {
  return `${JSON.stringify(registry, null, 2)}\n`
}

export function registryCount(registry) {
  return registry.mute.length + registry.forms.length
}

/** 登记豁免词/显式形；重复登记抛 Error（CLI 转 exit 2）。返回新册（不可变风格）。 */
export function addMutes(registry, mutes) {
  for (const w of mutes) {
    if (registry.mute.includes(w)) throw new Error(`豁免词已在册: ${w}`)
  }
  return { ...registry, mute: [...registry.mute, ...mutes] }
}

export function addForms(registry, forms) {
  for (const f of forms) {
    if (registry.forms.includes(f)) throw new Error(`显式形已在册: ${f}`)
  }
  return { ...registry, forms: [...registry.forms, ...forms] }
}

/** 销名：mute 与 form 二选一；无名可销抛 Error。 */
export function revoke(registry, { mute, form }) {
  if (mute != null) {
    if (!registry.mute.includes(mute)) throw new Error(`无此豁免词: ${mute}`)
    return { ...registry, mute: registry.mute.filter((x) => x !== mute) }
  }
  if (!registry.forms.includes(form)) throw new Error(`无此显式形: ${form}`)
  return { ...registry, forms: registry.forms.filter((x) => x !== form) }
}
