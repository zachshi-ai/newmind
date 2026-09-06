/**
 * 疑册 —— 任务方的必问清单（声明权在任务方，稽疑无册不判）。
 *
 * 疑册 { version: 1, asks: [{ path, on }], noDefaults }：
 *   - path：声明源路径（登记原样保存，判定时两侧 normalizePath 规整）；
 *   - on ∈ { write, exec, any }：触发域（首笔 write/exec/write∪exec 调用之前须有问凭据）；
 *   - noDefaults：true 时默认形表不并入。
 *
 * 默认形表（极保守）：AGENTS.md / CLAUDE.md / README.md → write——写代码之前该谋的
 * 三份协作文书。默认条环境里未必存在，故「未见不罚」；显式登记即任务方作保，独谋重罚。
 */

export const ONS = ['write', 'exec', 'any']

export const DEFAULT_ASKS = [
  { path: 'AGENTS.md', on: 'write' },
  { path: 'CLAUDE.md', on: 'write' },
  { path: 'README.md', on: 'write' },
]

export function emptyAskfile() {
  return { version: 1, asks: [], noDefaults: false }
}

export function parseAskfile(text) {
  let raw
  try {
    raw = JSON.parse(String(text))
  } catch (error) {
    throw new Error(`疑册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('疑册必须是对象')
  if (raw.version !== 1) throw new Error(`疑册 version 必须为 1，得 ${JSON.stringify(raw.version)}`)
  if (!Array.isArray(raw.asks)) throw new Error('疑册 asks 必须是数组')
  const asks = raw.asks.map((a, i) => {
    if (!a || typeof a !== 'object') throw new Error(`asks[${i}] 必须是对象`)
    if (typeof a.path !== 'string' || a.path.length === 0) throw new Error(`asks[${i}].path 必须是非空字符串`)
    if (!ONS.includes(a.on)) throw new Error(`asks[${i}].on 必须是 ${ONS.join('/')} 之一，得 ${JSON.stringify(a.on)}`)
    return { path: a.path, on: a.on }
  })
  return { version: 1, asks, noDefaults: raw.noDefaults === true }
}

export function serializeAskfile(askfile) {
  return JSON.stringify(askfile, null, 2) + '\n'
}

const keyOf = (ask) => `${ask.path}\u0000${ask.on}`

/**
 * 归并：显式 asks（显式档）∪ 默认形表（默认档，noDefaults 时不并）。
 * 按 (path, on) 去重，同键显式档优先；显式在前（登记序）、默认在后（形表序）。
 * `on: any` 与默认条 `(path, write)` 是不同键，不互并。
 */
export function mergeAsks(askfile) {
  if (!askfile || typeof askfile !== 'object') return []
  const explicit = []
  const seen = new Set()
  for (const a of askfile.asks ?? []) {
    const k = keyOf(a)
    if (seen.has(k)) continue
    seen.add(k)
    explicit.push({ path: a.path, on: a.on, tier: 'explicit' })
  }
  if (askfile.noDefaults === true) return explicit
  const merged = [...explicit]
  for (const d of DEFAULT_ASKS) {
    if (seen.has(keyOf(d))) continue
    seen.add(keyOf(d))
    merged.push({ path: d.path, on: d.on, tier: 'default' })
  }
  return merged
}

export function askCount(askfile) {
  return mergeAsks(askfile).length
}

/** 登记一条显式疑条（同 (path,on) 幂等）。 */
export function addAsk(askfile, path, on) {
  if (typeof path !== 'string' || path.length === 0) throw new Error('--ask 需要非空路径')
  if (!ONS.includes(on)) throw new Error(`--on 必须是 ${ONS.join('/')} 之一`)
  if (!askfile.asks.some((a) => a.path === path && a.on === on)) {
    askfile.asks.push({ path, on })
  }
  return askfile
}

export function setNoDefaults(askfile, flag) {
  askfile.noDefaults = flag === true
  return askfile
}

/** 销条：删该 path（可再限 on）的全部显式疑条。返回删除数。 */
export function revokeAsk(askfile, path, on = null) {
  const before = askfile.asks.length
  askfile.asks = askfile.asks.filter((a) => !(a.path === path && (on === null || a.on === on)))
  return before - askfile.asks.length
}
