/**
 * 器册 —— 法仪的「法仪」本身：哪些径是量尺（持/修）、什么算一次验尺（词）。
 *
 * 分类序锁死（docs/03 §4）：amend > guard > 实测面。
 * 默认形表与显式登记取并集且只增不删；noDefaults 关闭默认形（纯显式册）。
 * 匹配全部确定性：glob（与定分同规）+ 子串/正则词表，零语义判断。
 */

import { normalizePath, globMatches } from './glob.js'

/** 持性器径默认形：测试/快照/测试配置/CI 工作流。 */
export const DEFAULT_GUARD_GLOBS = [
  '**/*.test.js', '**/*.test.ts', '**/*.test.jsx', '**/*.test.tsx', '**/*.test.mjs', '**/*.test.cjs',
  '**/*.spec.js', '**/*.spec.ts', '**/*.spec.jsx', '**/*.spec.tsx', '**/*.spec.mjs', '**/*.spec.cjs',
  '**/test/**', '**/tests/**', '**/__tests__/**', '**/__snapshots__/**',
  '**/jest.config.*', '**/vitest.config.*', '**/playwright.config.*', '**/karma.conf.*',
  '**/.github/workflows/*.yml', '**/.github/workflows/*.yaml',
]

/** 验尺词默认形（正则，命令串匹配）。 */
export const DEFAULT_VERIFY_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|check)\b/,
  /\b(vitest|jest|mocha|pytest|unittest)\b/,
  /\bgo\s+test\b/,
  /\bcargo\s+(test|check|clippy)\b/,
  /\bmake\b/,
  /\b(tsc|eslint|biome|oxlint|ruff|mypy|pyright)\b/,
  /\b(mvn|gradle)\b/,
  /\bctest\b/,
]

export function emptyRegister() {
  return { version: 1, guards: [], amends: [], verify: [], noDefaults: false }
}

export function parseRegister(text) {
  const raw = JSON.parse(text)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('器册必须是 JSON 对象')
  const reg = emptyRegister()
  for (const key of ['guards', 'amends', 'verify']) {
    if (raw[key] != null) {
      if (!Array.isArray(raw[key]) || raw[key].some((g) => typeof g !== 'string' || g.length === 0)) {
        throw new Error(`器册 ${key} 必须是非空字符串数组`)
      }
      reg[key] = [...raw[key]]
    }
  }
  if (raw.noDefaults != null) {
    if (typeof raw.noDefaults !== 'boolean') throw new Error('器册 noDefaults 必须是布尔')
    reg.noDefaults = raw.noDefaults
  }
  return reg
}

export function serializeRegister(reg) {
  return JSON.stringify(reg, null, 2) + '\n'
}

/** 并集去重只增不删；noDefaults 一旦为真不再回落（册上显式关闭默认形）。 */
export function mergeRegister(reg, { guards = [], amends = [], verify = [], noDefaults = null } = {}) {
  const next = {
    version: 1,
    guards: [...reg.guards],
    amends: [...reg.amends],
    verify: [...reg.verify],
    noDefaults: noDefaults === true ? true : reg.noDefaults === true,
  }
  for (const g of guards) if (!next.guards.includes(g)) next.guards.push(g)
  for (const a of amends) if (!next.amends.includes(a)) next.amends.push(a)
  for (const v of verify) if (!next.verify.includes(v)) next.verify.push(v)
  return next
}

/**
 * 器径分类：返回 'amend' | 'guard' | 'plain'。
 * amend 优先于 guard（账方显式声明优先于默认形）；规范化后匹配，不触碰文件系统。
 */
export function classifyPath(reg, path) {
  const norm = normalizePath(String(path ?? ''))
  for (const g of reg.amends) if (globMatches(g, norm)) return 'amend'
  if (reg.noDefaults !== true) {
    for (const g of DEFAULT_GUARD_GLOBS) if (globMatches(g, norm)) return 'guard'
  }
  for (const g of reg.guards) if (globMatches(g, norm)) return 'guard'
  return 'plain'
}

/** 验尺词判定：显式词子串命中，或（未关默认形时）默认正则命中。 */
export function isVerifyCommand(reg, command) {
  const cmd = String(command ?? '')
  if (cmd.length === 0) return false
  for (const v of reg.verify) if (cmd.includes(v)) return true
  if (reg.noDefaults !== true) {
    for (const re of DEFAULT_VERIFY_PATTERNS) if (re.test(cmd)) return true
  }
  return false
}
