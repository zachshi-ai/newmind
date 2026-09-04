/**
 * 切诊探针 —— 只读的环境实测：PATH 扫描找命令、体检根下 stat 文件。
 *
 * 诚实条款：无 cwd 时文件类探针不执行（调用方记 unprobed，不计分不报警）；
 * PATH 探针不依赖 cwd，始终执行。全部探针零子进程（node:fs 直读）。
 */

import { existsSync, statSync, accessSync, constants as fsConstants } from 'node:fs'
import { resolve, join } from 'node:path'

function isExecutable(abs) {
  try {
    if (!existsSync(abs)) return false
    if (!statSync(abs).isFile()) return false
    accessSync(abs, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

/** 命令在 PATH 上吗？（含 '/' 时视作相对体检根的路径直接 stat）。 */
export function commandOnPath(cmd, cwd = null) {
  if (typeof cmd !== 'string' || cmd.trim().length === 0) return false
  const c = cmd.trim()
  if (c.includes('/')) {
    const base = cwd ?? process.cwd()
    return isExecutable(resolve(base, c))
  }
  const pathVar = process.env.PATH ?? ''
  for (const dir of pathVar.split(':')) {
    if (!dir) continue
    if (isExecutable(join(dir, c))) return true
  }
  return false
}

/** 文件/目录在体检根下存在吗？cwd 为 null 返回 null（诚实：未探）。 */
export function pathExistsUnder(cwd, rel) {
  if (!cwd) return null
  try {
    statSync(resolve(cwd, rel))
    return true
  } catch {
    return false
  }
}

/** argsContains 的首词（命令名）。 */
export function firstTokenOf(argsContains) {
  const t = String(argsContains ?? '').trim()
  return t.length > 0 ? t.split(/\s+/)[0] : ''
}
