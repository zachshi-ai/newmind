/**
 * 论世流解析 —— 兼容 zhizhi / jiebi / zhengnian / jiubian 的会话流格式，
 * 并扩展两个字段（docs/03 §2，向后兼容，老流按诚实边界退化为零内容观察）：
 *   - {"type":"principal","text":"..."}    主渠道文本（唯一发令资格）
 *   - tool_result 的 "content":"<字符串>"   物渠道内容（逐块入账）
 *
 * 每行一个 JSON 对象；`#` 与空行为注释；坏行报行号。
 * calls 归并规则（与 jiubian 的解析器一致，跨项目互审的前提）：
 *   - 带 id：call 建档（id 首见为准），result 按 id 回填 isError；
 *   - 无 id（zhizhi 旧格式）：result 并入紧邻其前的无 id call；
 *   - 孤儿 result 独立建档——不丢任何一次真实执行。
 * turn_start / turn_end / reanchor 不是内容也不是动作，跳过。
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
 * 记录阶段：从事件流登记三本原始账（裁决是纯函数，见 qudao.js）。
 * 返回 {
 *   principalText, principalBlocks,   // 主渠道：全部主文本（\n 拼接）与块数
 *   calls,                            // 己渠道：{ seq, pos, ref, name, args, isError, at }
 *   dataBlocks,                       // 物渠道：{ blockNo, pos, ref, tool, content, at }
 * }
 * pos 为事件序（时序保护的依据）：调用先于其结果的块，绝不构成本块的僭行。
 */
export function buildRaw(events) {
  const principalTexts = []
  const calls = []
  const dataBlocks = []
  const byId = new Map()
  let pending = null // 紧邻的无 id call（zhizhi 格式的配对锚点）
  let pos = 0

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue

    if (ev.type === 'principal') {
      if (typeof ev.text === 'string' && ev.text.length > 0) principalTexts.push(ev.text)
      continue
    }
    if (ev.type !== 'tool_call' && ev.type !== 'tool_result') continue

    const id = ev.id != null ? String(ev.id) : null

    // 已建档的 id：result 只回填 isError；content 是新到达的物块，照常入账
    if (id && byId.has(id)) {
      const rec = byId.get(id)
      if (ev.type === 'tool_result') {
        if (typeof ev.isError === 'boolean') rec.isError = ev.isError
        if (typeof ev.content === 'string' && ev.content.length > 0) {
          dataBlocks.push({
            blockNo: dataBlocks.length + 1,
            pos: pos++,
            ref: id,
            tool: ev.name,
            content: ev.content,
            at: ev.at ?? null,
          })
        }
      }
      continue
    }

    // 无 id 的 result 并入紧邻其前的无 id call
    if (!id && ev.type === 'tool_result' && pending) {
      if (typeof ev.isError === 'boolean') pending.isError = ev.isError
      if (typeof ev.content === 'string' && ev.content.length > 0) {
        dataBlocks.push({
          blockNo: dataBlocks.length + 1,
          pos: pos++,
          ref: pending.ref,
          tool: ev.name,
          content: ev.content,
          at: ev.at ?? null,
        })
      }
      pending = null
      continue
    }

    // 新 call（或孤儿 result 独立建档）
    const rec = {
      seq: calls.length + 1,
      pos: pos++,
      ref: id,
      name: ev.name,
      args: ev.args,
      isError: typeof ev.isError === 'boolean' ? ev.isError : null,
      at: ev.at ?? null,
    }
    calls.push(rec)
    pending = id ? null : rec
    if (id) byId.set(id, rec)

    // 工具执行内联携带 content 的 result（无独立 result 事件时）也入账
    if (ev.type === 'tool_result' && typeof ev.content === 'string' && ev.content.length > 0) {
      dataBlocks.push({
        blockNo: dataBlocks.length + 1,
        pos: pos++,
        ref: id,
        tool: ev.name,
        content: ev.content,
        at: ev.at ?? null,
      })
    }
  }

  return {
    principalText: principalTexts.join('\n'),
    principalBlocks: principalTexts.length,
    calls,
    dataBlocks,
  }
}
