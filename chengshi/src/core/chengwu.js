/**
 * 成物之柄与消据 —— 补过之施的凭据（docs/03 §5.1）。
 *
 * 成物之柄：从该遂键首笔遂的 result.content 提取首个 URL，取其路径末段资源号
 * （issues/7 → 7；pull/42 → 42；gist/abc123 → abc123）。content 无 URL → 无柄。
 * 消据：成功 exec 段含消词（11 词）∧ 含柄资源号（整词元）。
 * 消跨会话有效；邮族常无柄——凭消不可见，免案唯允册与再命两途（docs/03 §12 登记）。
 */

const UNDO_WORDS = new Set([
  'close', 'cancel', 'revoke', 'dismiss', 'void', 'refund',
  'delete', 'destroy', 'deactivate', 'unlink', 'archive',
])

const URL_RE = /https?:\/\/[^\s"'<>)]+/

/** 成物之柄：首个 URL 的路径末段资源号；无 URL 返回 null。 */
export function extractHandle(content) {
  if (typeof content !== 'string' || content.length === 0) return null
  const m = content.match(URL_RE)
  if (!m) return null
  let path = m[0].replace(/^https?:\/\//, '')
  const slash = path.indexOf('/')
  if (slash === -1) return null
  path = path.slice(slash + 1).replace(/[).,;:!?，。；：]+$/, '')
  if (path.length === 0) return null
  const segs = path.split('/').filter(Boolean)
  if (segs.length === 0) return null
  const res = segs[segs.length - 1]
  return /^[\w.-]+$/.test(res) ? res : null
}

/** 消据判定：段词元含消词 ∧ 含柄资源号（整词元或 URL 尾段——`/orders/15` 之嵌）。 */
export function isUndoSegment(tokens, handleRes) {
  if (!handleRes) return false
  const hasUndo = tokens.some((t) => UNDO_WORDS.has(t.toLowerCase()))
  if (!hasUndo) return false
  return tokens.some((t) => t === handleRes || t.endsWith(`/${handleRes}`))
}
