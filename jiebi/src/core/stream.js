/**
 * jiebi stream —— 解析与调用配对。
 *
 * 事件格式（每行一个 JSON 对象，兼容 zhizhi stream）：
 *   { type:'turn_start'|'turn_end', id, at }
 *   { type:'tool_call',   id?, name, args, at }
 *   { type:'tool_result', id?, name, args, isError, errorDigest?, at }
 *   { type:'tool_denied', name, args, rule, at }   // zhizhi 兼容：视为一次失败探针
 *
 * 配对规则：
 *   - result 带 id → 与同 id 的 call 配对；同 id 出现多条以首条 isError 为准，记 ambiguous；
 *   - result 不带 id（zhizhi 裸流）→ 与最近一条同名、尚未配到结果的 call 配对；
 *   - turn_start 之前的调用归入隐式回合 "(no turn)"。
 */

export function parseStream(text) {
  const events = []
  for (const [i, raw] of String(text ?? '').split('\n').entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    let ev
    try {
      ev = JSON.parse(line)
    } catch (error) {
      throw new Error(`第 ${i + 1} 行解析失败: ${error.message}`)
    }
    if (!ev || typeof ev !== 'object' || typeof ev.type !== 'string') {
      throw new Error(`第 ${i + 1} 行事件缺少 type 字段: ${line.slice(0, 80)}`)
    }
    events.push(ev)
  }
  return events
}

/**
 * 把事件流配对成调用清单 + 回合清单。
 *
 * calls:  { ref, name, args, isError(true/false/null), turnId, at }
 * turns:  { id, callRefs, calls }
 */
export function buildCalls(events) {
  const calls = []
  const turns = []
  const byRef = new Map()
  const pendingByName = new Map() // 不带 id 的 result 按名配对：名 → [call]
  const duplicatedRefs = new Set()

  let currentTurnId = null
  let counter = 0

  const ensureTurn = (id) => {
    let turn = turns.find((t) => t.id === id)
    if (!turn) {
      turn = { id, callRefs: [], calls: 0 }
      turns.push(turn)
    }
    return turn
  }

  for (const ev of events) {
    if (ev.type === 'turn_start') {
      currentTurnId = typeof ev.id === 'string' && ev.id ? ev.id : `turn-${turns.length + 1}`
      ensureTurn(currentTurnId)
      continue
    }
    if (ev.type === 'turn_end') {
      currentTurnId = null
      continue
    }

    const isCall = ev.type === 'tool_call' || ev.type === 'tool_denied'
    const isResult = ev.type === 'tool_result'
    if (!isCall && !isResult) continue

    const turnId = currentTurnId ?? '(no turn)'
    const turn = ensureTurn(turnId)

    if (isCall) {
      counter += 1
      const ref = typeof ev.id === 'string' && ev.id ? ev.id : `${turnId}-c${counter}`
      const call = {
        ref,
        name: String(ev.name ?? ''),
        args: ev.args ?? null,
        isError: ev.type === 'tool_denied' ? true : null,
        turnId,
        at: ev.at ?? null,
      }
      calls.push(call)
      turn.callRefs.push(ref)
      turn.calls += 1
      if (byRef.has(ref)) duplicatedRefs.add(ref)
      else byRef.set(ref, call)
      if (ev.type !== 'tool_denied') {
        const queue = pendingByName.get(call.name) ?? []
        queue.push(call)
        pendingByName.set(call.name, queue)
      }
      continue
    }

    // tool_result：先按 id 配，配不到按名配
    let target = null
    if (typeof ev.id === 'string' && ev.id && byRef.has(ev.id)) {
      target = byRef.get(ev.id)
      // 按 id 配对成功就把调用挪出按名队列，防止后续同名 result 错配
      const queue = pendingByName.get(target.name)
      if (queue) {
        const idx = queue.indexOf(target)
        if (idx >= 0) queue.splice(idx, 1)
      }
    } else if (typeof ev.name === 'string') {
      const queue = pendingByName.get(ev.name) ?? []
      target = queue.shift() ?? null
      pendingByName.set(ev.name, queue)
    }
    if (target && target.isError === null) {
      target.isError = ev.isError === true
    }
  }

  return { calls, turns, duplicatedRefs: [...duplicatedRefs] }
}
