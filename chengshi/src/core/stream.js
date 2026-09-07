/**
 * 成事流解析 —— 兼容全仓共享会话流格式，并向后兼容地扩展一类非工具事件（docs/03 §2）：
 *   - {"type":"principal","text":"..."}   主渠道文本（论世/二柄已引入，本层沿用，只用于承施判定）
 *
 * 每行一个 JSON 对象；`#` 与空行为注释；坏行报行号。
 * 归并规则（与全仓解析器一致，跨项目互审的前提）：
 *   - 带 id：call 建档（id 首见为准），result 按 id 回填 isError/content；
 *   - 无 id（zhizhi 旧格式）：result 并入紧邻其前的无 id call；
 *   - 孤儿 result 独立建档——不丢任何一次真实执行。
 * 非工具事件里 turn_start / turn_end / reanchor / appeal 跳过。
 * ord 为事件序（主文、调用混排统一编号）：判定全部只看 ord 先后，时序以流序为准——
 * at 原样保留、缺时记 null，任何判定都不依赖时间戳。
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

const SKIPPED = new Set(['turn_start', 'turn_end', 'reanchor', 'appeal'])

/**
 * 归并出混排事件序列。返回 { items }——按 ord 升序：
 *   { kind: 'principal', ord, session, text, at }
 *   { kind: 'call',      ord, session, ref, name, args, isError, content, at }
 * call 的 content 取 result 正文（成物之柄的提取源），无正文为 null。
 */
export function buildItems(events, session) {
  const items = []
  const byId = new Map()
  let pending = null // 紧邻的无 id call（zhizhi 格式的配对锚点）
  let ord = 0

  const absorb = (rec, ev) => {
    if (ev.type !== 'tool_result') return
    if (typeof ev.isError === 'boolean') rec.isError = ev.isError
    if (typeof ev.content === 'string' && ev.content.length > 0) rec.content = ev.content
  }

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue
    if (SKIPPED.has(ev.type)) continue

    if (ev.type === 'principal') {
      if (typeof ev.text === 'string' && ev.text.length > 0) {
        items.push({ kind: 'principal', ord: ord++, session, text: ev.text, at: ev.at ?? null })
      }
      continue
    }
    if (ev.type !== 'tool_call' && ev.type !== 'tool_result') continue

    const id = ev.id != null ? String(ev.id) : null
    if (id && byId.has(id)) {
      absorb(byId.get(id), ev)
      continue
    }
    if (!id && ev.type === 'tool_result' && pending) {
      absorb(pending, ev)
      pending = null
      continue
    }

    const rec = {
      kind: 'call',
      ord: ord++,
      session,
      ref: id,
      name: ev.name,
      args: ev.args,
      isError: typeof ev.isError === 'boolean' ? ev.isError : null,
      content: typeof ev.content === 'string' && ev.content.length > 0 ? ev.content : null,
      at: typeof ev.at === 'number' && Number.isFinite(ev.at) ? ev.at : null,
    }
    items.push(rec)
    pending = id ? null : rec
    if (id) byId.set(id, rec)
  }

  items.sort((a, b) => a.ord - b.ord)
  return { items }
}
