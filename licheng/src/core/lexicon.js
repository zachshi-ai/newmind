/**
 * 诺言词表 —— 漏账提示（advisory，永不计分）。
 *
 * 默认词表覆盖口语承诺的常见起手式；声明权在使用方：
 * --lexicon 传 {"markers":[...]} 可整体替换。计数按事件级去重——
 * 一条 speech 含任一标记词只记一次。
 */

export const DEFAULT_MARKERS = [
  '接下来',
  '稍后',
  '回头',
  '待会儿',
  '然后我',
  '我会',
  '我将',
  '我打算',
  '随后',
  '接着',
]

export function normalizeMarkers(lexicon) {
  if (lexicon == null) return [...DEFAULT_MARKERS]
  const arr = lexicon?.markers
  if (!Array.isArray(arr) || arr.some((m) => typeof m !== 'string' || m.length === 0)) {
    throw new TypeError('lexicon.markers 必须是非空字符串数组')
  }
  return [...arr]
}

export function countMarkerHits(speech, markers) {
  let hits = 0
  for (const s of speech ?? []) {
    const text = typeof s?.text === 'string' ? s.text : ''
    if (markers.some((m) => text.includes(m))) hits += 1
  }
  return hits
}
