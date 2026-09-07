/**
 * 知行流解析 —— 与全仓各层会话流格式同构（跨项目互审的前提）。
 *
 * 每行一个 JSON 对象；`#` 与空行为注释；坏行报行号。
 * calls 归并规则（与全仓各层解析器一致）：
 *   - 带 id：call 建档（id 首见为准），result 按 id 回填 isError 与 content；
 *   - 无 id（zhizhi 旧格式）：result 并入紧邻其前的无 id call；
 *   - 孤儿 result 独立建档——不丢任何一次真实执行。
 * 本层知面取文于流：装载正文取结果侧 content（知面取文于流，全账内生）；
 * 行面时序取结果侧 at（先知后悖的时序判据）。
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

/** 归并出调用序列（流序即序）。返回 { calls }，call: { ref, name, args, isError, content, at }。 */
export function buildCalls(events) {
  const calls = []
  const byId = new Map()
  let pending = null // 紧邻的无 id call（zhizhi 格式的配对锚点）

  const absorb = (rec, ev) => {
    if (ev.type !== 'tool_result') return
    if (typeof ev.isError === 'boolean') rec.isError = ev.isError
    if (typeof ev.content === 'string' && ev.content.length > 0) rec.content = ev.content
    if (typeof ev.at === 'number' && Number.isFinite(ev.at)) rec.at = ev.at
  }

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue
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
      ref: id,
      name: ev.name,
      args: ev.args,
      isError: typeof ev.isError === 'boolean' ? ev.isError : null,
      content: typeof ev.content === 'string' && ev.content.length > 0 ? ev.content : null,
      at: typeof ev.at === 'number' && Number.isFinite(ev.at) ? ev.at : null,
    }
    calls.push(rec)
    pending = id ? null : rec
    if (id) byId.set(id, rec)
  }
  return { calls }
}
