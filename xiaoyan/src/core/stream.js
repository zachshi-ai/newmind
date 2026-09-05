/**
 * 效验流解析 —— 兼容 zhizhi / jiebi / zhengnian / jiubian / lunshi / zhibi 的会话流格式。
 *
 * 与论世解析器的差异（docs/03 §2，本层必须**记住空**）：
 *   tool_result 的 content 字段原样保留（含缺失与空串）——空言的判定原料就是
 *   「没有内容」这件事本身，所以 content:"" 也要入账，content 缺失则保持 undefined。
 *
 * 每行一个 JSON 对象；`#` 与空行为注释；坏行报行号。
 * calls 归并规则（与论世的解析器一致，跨项目互审的前提）：
 *   - 带 id：call 建档（id 首见为准），result 按 id 回填 isError 与 content；
 *   - 无 id（zhizhi 旧格式）：result 并入紧邻其前的无 id call；
 *   - 孤儿 result 独立建档——不丢任何一次真实执行。
 * turn_start / turn_end / reanchor 不是内容也不是动作，跳过；principal 只计数。
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
 * 记录阶段：从事件流登记原始账（裁决是纯函数，见 xiao.js）。
 * 返回 {
 *   principalBlocks,  // 主渠道只计数（本层不审主渠道）
 *   calls,            // { seq, pos, ref, name, args, isError, content, at }
 * }
 * isError ∈ { true, false, null }（缺失记 null——成败未知，不入效账）；
 * content ∈ { string, undefined }（空串保留，缺失保持 undefined）。
 */
export function buildRaw(events) {
  const calls = []
  const byId = new Map()
  let pending = null // 紧邻的无 id call（zhizhi 格式的配对锚点）
  let principalBlocks = 0
  let pos = 0

  const applyResult = (rec, ev) => {
    if (typeof ev.isError === 'boolean') rec.isError = ev.isError
    if (typeof ev.content === 'string') rec.content = ev.content
  }

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue

    if (ev.type === 'principal') {
      if (typeof ev.text === 'string' && ev.text.length > 0) principalBlocks++
      continue
    }
    if (ev.type !== 'tool_call' && ev.type !== 'tool_result') continue

    const id = ev.id != null ? String(ev.id) : null

    // 已建档的 id：result 回填 isError 与 content
    if (id && byId.has(id)) {
      if (ev.type === 'tool_result') applyResult(byId.get(id), ev)
      continue
    }

    // 无 id 的 result 并入紧邻其前的无 id call
    if (!id && ev.type === 'tool_result' && pending) {
      applyResult(pending, ev)
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
      content: undefined,
      at: ev.at ?? null,
    }
    if (ev.type === 'tool_result') applyResult(rec, ev)
    calls.push(rec)
    pending = id ? null : rec
    if (id) byId.set(id, rec)
  }

  return { principalBlocks, calls }
}
