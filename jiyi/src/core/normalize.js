/**
 * 稽疑路径规整 —— 与 mingshi/jiubian 同规（跨项目互审的前提）。
 *
 * `\` → `/`、并 `//`、去 `./` 前缀、去尾 `/`；大小写敏感、不解析 `..`。
 * 问凭据的读取通道两侧都过此规整：`./AGENTS.md` 与 `AGENTS.md` 是同一份声明文书，
 * 不许因写法之异而出两样判词（宁可放过，不可错罚）。
 */

export function normalizePath(p) {
  let s = String(p).replace(/\\/g, '/')
  s = s.replace(/\/{2,}/g, '/')
  while (s.startsWith('./')) s = s.slice(2)
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s
}
