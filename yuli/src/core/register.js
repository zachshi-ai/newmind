/**
 * 豫册 —— 任务方声明权（docs/03 §4）。
 *
 * risk：显式险词（比词表更懂自己环境的部分）；exempt：款词（豁免不是关闸，是落款）；
 * noDefaults：关闭默认形表（纯显式册）。enroll 与既有册取并集去重，只增不删。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

export function createRegister(opts = {}) {
  return {
    version: 1,
    risk: (opts.risk ?? []).map((s) => String(s)).filter((s) => s.length > 0),
    exempt: (opts.exempt ?? []).map((s) => String(s)).filter((s) => s.length > 0),
    noDefaults: opts.noDefaults === true,
  }
}

/** 载入册文件（缺文件 → 空册；坏 JSON → 抛错由调用方转退出码 2）。 */
export function loadRegister(path) {
  if (!path || !existsSync(path)) return createRegister()
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  return createRegister({
    risk: Array.isArray(parsed.risk) ? parsed.risk : [],
    exempt: Array.isArray(parsed.exempt) ? parsed.exempt : [],
    noDefaults: parsed.noDefaults === true,
  })
}

/** 并集去重（只增不删）：文件册 ∪ CLI 词表。 */
export function mergeRegister(file, cli) {
  return {
    version: 1,
    risk: [...new Set([...(file.risk ?? []), ...(cli.risk ?? [])])],
    exempt: [...new Set([...(file.exempt ?? []), ...(cli.exempt ?? [])])],
    noDefaults: file.noDefaults === true || cli.noDefaults === true,
  }
}

/** enroll：读既有册并集去重后写回（只增不删）。 */
export function enrollRegister(path, additions) {
  const existing = loadRegister(path)
  const merged = mergeRegister(existing, createRegister(additions))
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`)
  return merged
}
