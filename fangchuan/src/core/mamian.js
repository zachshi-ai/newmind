/**
 * 码面 —— 受扫之径的判定（docs/03 §2 锁死）：豁免形开箱在岗，豁免在立案前。
 *
 * 豁免是防诬卫生设施：文档与数据里的吞形是示例不是行为（「宣之使言」的讲堂）。
 */

import { normalizePath } from './object.js'

/** 后缀豁免 10：文档与数据之径不受扫。 */
export const EXEMPT_SUFFIXES = [
  '.md', '.mdx', '.txt', '.rst', '.adoc', '.json', '.yml', '.yaml', '.svg', '.csv',
]

/** 名形豁免：basename 含 `.min.`（压缩产物）。 */
export const MIN_MARKER = '.min.'

/** 段形豁免：径含 `__snapshots__/` 段（快照）。 */
export const SNAPSHOT_SEGMENT = '__snapshots__/'

/** 码面判定：不命中任何豁免形即受扫。径先规整。 */
export function isCodePath(p) {
  const path = normalizePath(p)
  const lower = path.toLowerCase()
  if (EXEMPT_SUFFIXES.some((sfx) => lower.endsWith(sfx))) return false
  const parts = path.split('/')
  const base = parts[parts.length - 1]
  if (base.toLowerCase().includes(MIN_MARKER)) return false
  if (path.includes(SNAPSHOT_SEGMENT)) return false
  return true
}
