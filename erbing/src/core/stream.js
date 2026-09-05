/**
 * 二柄流解析 —— 兼容全仓共享会话流格式，并向后兼容地扩展两类非工具事件（docs/03 §2）：
 *   - {"type":"principal","text":"..."}   主渠道文本（论世已引入，本层沿用）
 *   - {"type":"appeal","text":"..."}      请言（器的请示话语，本层新增）
 *
 * 每行一个 JSON 对象；`#` 与空行为注释；坏行报行号。
 * calls 归并规则（与全仓解析器一致，跨项目互审的前提）：
 *   - 带 id：call 建档（id 首见为准），result 按 id 回填 isError；
 *   - 无 id（zhizhi 旧格式）：result 并入紧邻其前的无 id call；
 *   - 孤儿 result 独立建档——不丢任何一次真实执行。
 * 非工具事件里 turn_start / turn_end / reanchor 跳过。
 * pos 为事件序（主文、请言、调用混排统一编号）：判定全部只看 pos 先后，
 * 时序以流序为准——at 原样保留、缺时记 null，任何判定都不依赖时间戳。
 */

export function parseStream(text) {
  const events = []
  const lines = String(text).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    try {
      events.push(JSON.parse(line))
    } catch (error) {
      throw new Error(`第 ${i + 1} 行不是合法 JSON: ${error.message}`)
    }
  }
  return events
}

const SKIPPED = new Set(['turn_start', 'turn_end', 'reanchor'])

/**
 * 记录阶段：从事件流登记三本原始账（裁决在 bingzhang.js，见 docs/03 §3）。
 * 返回 { items }——按事件序（pos）混排的原始事件：
 *   { kind: 'principal', pos, text }
 *   { kind: 'appeal',    pos, text }
 *   { kind: 'call',      pos, ref, name, args, isError, at }
 */
export function buildRaw(events) {
  const items = []
  const byId = new Map()
  let pending = null // 紧邻的无 id call（zhizhi 格式的配对锚点）
  let pos = 0

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue
    if (SKIPPED.has(ev.type)) continue

    if (ev.type === 'principal') {
      if (typeof ev.text === 'string' && ev.text.length > 0) {
        items.push({ kind: 'principal', pos: pos++, text: ev.text, at: ev.at ?? null })
      }
      continue
    }
    if (ev.type === 'appeal') {
      if (typeof ev.text === 'string' && ev.text.length > 0) {
        items.push({ kind: 'appeal', pos: pos++, text: ev.text, at: ev.at ?? null })
      }
      continue
    }
    if (ev.type !== 'tool_call' && ev.type !== 'tool_result') continue

    const id = ev.id != null ? String(ev.id) : null

    // 已建档的 id：result 只回填 isError（pos 不变——同一行使不因结果而换位）
    if (id && byId.has(id)) {
      const rec = byId.get(id)
      if (ev.type === 'tool_result' && typeof ev.isError === 'boolean') rec.isError = ev.isError
      continue
    }
    // 无 id 的 result 并入紧邻其前的无 id call
    if (!id && ev.type === 'tool_result' && pending) {
      if (typeof ev.isError === 'boolean') pending.isError = ev.isError
      pending = null
      continue
    }

    const rec = {
      kind: 'call',
      pos: pos++,
      ref: id,
      name: ev.name,
      args: ev.args,
      isError: typeof ev.isError === 'boolean' ? ev.isError : null,
      at: ev.at ?? null,
    }
    items.push(rec)
    pending = id ? null : rec
    if (id) byId.set(id, rec)
  }

  items.sort((a, b) => a.pos - b.pos)
  return { items }
}
