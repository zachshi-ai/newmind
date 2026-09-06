/**
 * 会话流解析 —— 兼容 zhizhi / jiebi / zhengnian 的共享 stream 格式，
 * 另收集 speech 事件（漏账提示的原料，advisory）。
 *
 * 每行一个 JSON 对象；`#` 与空行为注释；坏行报行号。
 * calls 归并规则（与 zhengnian 同源）：
 *   - 带 id：call 建档（id 首见为准），result 按 id 回填 isError；
 *   - 无 id（zhizhi 格式）：result 并入紧邻其前的无 id call；
 *   - 孤儿 result 独立建档——不丢任何一次真实执行。
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

/**
 * 归并出调用序列（时间序）与 speech 话语。
 * 返回 { calls, speech }；call: { ref, name, args, isError, at }，
 * speech: { text, turn, at }（text 非空串才收）。
 */
export function buildCalls(events) {
  const calls = []
  const speech = []
  const byId = new Map()
  let pending = null // 紧邻的无 id call（zhizhi 格式的配对锚点）

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue
    if (ev.type === 'speech') {
      if (typeof ev.text === 'string' && ev.text.length > 0) {
        speech.push({ text: ev.text, turn: ev.turn != null ? String(ev.turn) : null, at: ev.at ?? null })
      }
      continue
    }
    if (ev.type !== 'tool_call' && ev.type !== 'tool_result') continue

    const id = ev.id != null ? String(ev.id) : null
    if (id && byId.has(id)) {
      const rec = byId.get(id)
      if (ev.type === 'tool_result' && typeof ev.isError === 'boolean') rec.isError = ev.isError
      continue
    }
    if (!id && ev.type === 'tool_result' && pending) {
      if (typeof ev.isError === 'boolean') pending.isError = ev.isError
      pending = null
      continue
    }

    const rec = {
      ref: id,
      name: ev.name,
      args: ev.args,
      isError: typeof ev.isError === 'boolean' ? ev.isError : null,
      at: ev.at ?? null,
    }
    calls.push(rec)
    pending = id ? null : rec
    if (id) byId.set(id, rec)
  }
  return { calls, speech }
}
