/**
 * 知止引擎 —— DeepSeek Harness 行为节制层的确定性核心。
 *
 * 三条规则，各对应《道德经》的一条机制：
 *
 *   止损（stopLoss）      ← 「知止可以不殆」：同一动作连续失败到阈值，
 *                            第 N+1 次重试被拦截。重复同一动作不会产生新结果。
 *   先读后写（readBeforeWrite）← 「为之于未有，治之于未乱」：写入从未读过的
 *                            路径被拦截。盲写是猜测，在动作发生前拦住它。
 *   完成核验（verify）     ← 「轻诺必寡信」：记录验证性动作（测试/构建/lint）
 *                            的证据，账本暴露"没有证据的完成"。
 *
 * 引擎是纯同步、零依赖、无 IO 的状态机：
 *   guard()   在动作发生前给出 allow/deny（只读，不改账本）
 *   observe() 在结果结算后更新状态（唯一的写入口）
 *   noteDenied() 记录一次拦截（含"拦后又重试同一调用"的计数）
 *
 * 语义承诺：guard 绝不抛出即可安全调用；observe 对未知形态宽容；
 * 所有输出 JSON 可序列化 —— 离线审计（audit.js）能从事件流逐字重放
 * 出与运行时完全一致的决策。
 */

import {
  callFingerprint,
  argPreview,
  truncate,
  normalizeCommand,
  bashWrittenPaths,
  bashReadPaths,
  structuredPaths,
  isVerificationCommand,
  pathIsCovered,
} from './fingerprint.js'

// ---------------------------------------------------------------------------
// 默认配置 —— 对准 DeepSeek Harness 的真实内置工具名
// （dsh tool-fs 的 read / write / edit，shell 工具为 bash）。
// ---------------------------------------------------------------------------

export const DEFAULT_WRITE_TOOLS = ['write', 'edit', 'write_file', 'create_file', 'str_replace', 'str_replace_editor', 'multiedit', 'notebook_edit']
export const DEFAULT_READ_TOOLS = ['read', 'read_file', 'view', 'open', 'cat', 'read_image', 'read_target', 'read_render']
export const DEFAULT_PATH_ARG_KEYS = ['path', 'file_path', 'filePath', 'target', 'target_file', 'filename', 'notebook_path']
export const DEFAULT_BASH_TOOL = 'bash'

export const DEFAULT_VERIFY_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|check)\b/,
  /\b(vitest|jest|mocha|pytest|pytest|unittest|gotest)\b/,
  /\bgo\s+test\b/,
  /\bcargo\s+(test|check|clippy)\b/,
  /\bmake\b/,
  /\b(tsc|eslint|biome|oxlint|ruff|mypy|pyright)\b/,
  /\bmvn\b|\bgradle\b/,
  /\bctest\b|\bctest\b/,
]

export const DEFAULTS = {
  locale: 'zh',
  failOpen: true,
  stopLoss: {
    enabled: true,
    threshold: 3, // 连续失败 threshold 次后，下一次同指纹调用被拦截
    maxHistoryInReason: 3,
  },
  readBeforeWrite: {
    enabled: true,
    writeTools: DEFAULT_WRITE_TOOLS,
    readTools: DEFAULT_READ_TOOLS,
    pathArgKeys: DEFAULT_PATH_ARG_KEYS,
    bashTool: DEFAULT_BASH_TOOL,
  },
  verify: {
    enabled: true,
    bashTool: DEFAULT_BASH_TOOL,
    patterns: DEFAULT_VERIFY_PATTERNS,
  },
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** 深合并用户配置到默认值（数组与标量整体替换）。 */
export function normalizeOptions(options = {}) {
  const o = isPlainObject(options) ? options : {}
  const merged = structuredClone(DEFAULTS)
  if (o.locale) merged.locale = o.locale
  if (typeof o.failOpen === 'boolean') merged.failOpen = o.failOpen
  for (const section of ['stopLoss', 'readBeforeWrite', 'verify']) {
    const u = o[section]
    if (!isPlainObject(u)) continue
    for (const [k, v] of Object.entries(u)) {
      if (v === undefined) continue
      if (k === 'enabled' || k === 'threshold' || k === 'maxHistoryInReason' || k === 'bashTool') merged[section][k] = v
      else if (Array.isArray(v)) merged[section][k] = [...v]
    }
  }
  if (!['zh', 'en'].includes(merged.locale)) merged.locale = 'zh'
  return merged
}

// ---------------------------------------------------------------------------
// 拦截理由 —— 拒绝不是终点，是教学：告诉模型已经发生了什么、该做什么。
// ---------------------------------------------------------------------------

const REASONS = {
  zh: {
    stopLoss({ tool, count, threshold, history, preview }) {
      const recent = history.slice(-threshold)
      const hist = recent
        .map((h, i) => `  第${count - recent.length + i + 1}次失败: ${truncate(h.digest || '(无错误信息)', 120)}`)
        .join('\n')
      return [
        `[知止·止损] 调用 ${tool}（参数 ${preview}）已连续失败 ${count} 次，本次重试被确定性规则拦截。`,
        '重复同一动作不会产生新结果（知止可以不殆）。请停止原样重试：',
        '重新阅读上一次的完整错误、修改参数或方法、或换一条路径。',
        hist ? `失败历史（最近 ${Math.min(count, threshold)} 次）：\n${hist}` : '',
      ].filter(Boolean).join('\n')
    },
    readBeforeWrite({ paths }) {
      return [
        `[知止·先读后写] 以下路径在本次会话中从未被读取过，写入已被拦截：${paths.join('、')}`,
        '对没读过的文件做写入是猜测，不是编辑。请先用读取工具查看该文件，再执行写入。',
      ].join('\n')
    },
  },
  en: {
    stopLoss({ tool, count, threshold, history, preview }) {
      const recent = history.slice(-threshold)
      const hist = recent
        .map((h, i) => `  attempt ${count - recent.length + i + 1}: ${truncate(h.digest || '(no error message)', 120)}`)
        .join('\n')
      return [
        `[zhizhi:stop-loss] ${tool} (args ${preview}) has failed ${count} consecutive times; this retry is denied by a deterministic rule.`,
        'Repeating the identical action cannot produce a new result. Read the last full error, change the arguments or the approach.',
        hist ? `Failure history (last ${Math.min(count, threshold)}):\n${hist}` : '',
      ].filter(Boolean).join('\n')
    },
    readBeforeWrite({ paths }) {
      return [
        `[zhizhi:read-before-write] These paths were never read in this session; the write is denied: ${paths.join(', ')}`,
        'Writing to a file you never read is guessing, not editing. Read it first, then write.',
      ].join('\n')
    },
  },
}

// ---------------------------------------------------------------------------
// 引擎
// ---------------------------------------------------------------------------

export function createEngine(options = {}) {
  const opts = normalizeOptions(options)
  const say = REASONS[opts.locale]

  /** 指纹 -> { tool, preview, count, history: [{at, digest}], deniedOnce } */
  const failures = new Map()
  /** 已读取的归一化路径集合 */
  const reads = new Set()

  let callsObserved = 0
  let guardedCalls = 0
  let allowed = 0
  let denied = 0
  let redennied = 0
  let deniedByRule = { stopLoss: 0, readBeforeWrite: 0 }
  let readsMarked = 0
  let evidenceCount = 0
  let lastEvidenceAt = null
  let callsSinceEvidence = 0
  let mutationResets = 0
  const stream = []

  // ---- 规则一：止损 -------------------------------------------------------

  function guardStopLoss(name, args) {
    if (!opts.stopLoss.enabled) return null
    const fp = callFingerprint(name, args)
    const entry = failures.get(fp)
    if (!entry || entry.count < opts.stopLoss.threshold) return null
    return {
      decision: 'deny',
      rule: 'stopLoss',
      reason: say.stopLoss({
        tool: name,
        count: entry.count,
        threshold: opts.stopLoss.threshold,
        history: entry.history,
        preview: argPreview(args),
      }),
    }
  }

  // ---- 规则二：先读后写 ---------------------------------------------------

  function writtenPathsOf(name, args) {
    const rbw = opts.readBeforeWrite
    if (rbw.writeTools.includes(name)) return structuredPaths(args, rbw.pathArgKeys)
    if (name === rbw.bashTool) {
      const cmd = typeof args === 'object' && args !== null
        ? (args.command ?? args.cmd ?? args.script ?? '')
        : ''
      return bashWrittenPaths(normalizeCommand(cmd))
    }
    return []
  }

  function guardReadBeforeWrite(name, args) {
    if (!opts.readBeforeWrite.enabled) return null
    const paths = writtenPathsOf(name, args)
    if (paths.length === 0) return null
    const uncovered = paths.filter(p => ![...reads].some(r => pathIsCovered(r, p)))
    if (uncovered.length === 0) return null
    return {
      decision: 'deny',
      rule: 'readBeforeWrite',
      reason: say.readBeforeWrite({ paths: uncovered }),
    }
  }

  // ---- 公开状态机 ---------------------------------------------------------

  /**
   * 动作发生前的裁决。只读：绝不改变引擎状态。
   * @returns {{decision:'allow'}|{decision:'deny', rule:string, reason:string}}
   */
  function guard(call) {
    guardedCalls++
    const { name, args } = call ?? {}
    const verdict = guardStopLoss(name, args) ?? guardReadBeforeWrite(name, args)
    if (verdict) return verdict
    allowed++
    return { decision: 'allow' }
  }

  /**
   * 记录一次拦截（由管道在返回 deny 前调用）。
   * 同一指纹被拦后模型原样重试会再次被拦 —— 计入 redennied。
   */
  function noteDenied(call, verdict, at) {
    denied++
    if (verdict && verdict.rule) deniedByRule[verdict.rule] = (deniedByRule[verdict.rule] ?? 0) + 1
    const fp = callFingerprint(call?.name, call?.args)
    const entry = failures.get(fp)
    if (entry && entry.deniedOnce) redennied++
    if (entry) entry.deniedOnce = true
    stream.push({ type: 'tool_call', at: at ?? null, name: call?.name, args: call?.args ?? null })
    stream.push({
      type: 'tool_denied',
      at: at ?? null,
      name: call?.name,
      args: call?.args ?? null,
      rule: verdict?.rule ?? null,
    })
  }

  /**
   * 结果结算后的唯一写入口。
   * @param {object} e - { name, args, isError, errorDigest?, at? }
   */
  function observe(e) {
    const { name, args } = e ?? {}
    const isError = e?.isError === true
    const at = e?.at ?? null
    callsObserved++
    callsSinceEvidence++
    stream.push({ type: 'tool_call', at, name, args: args ?? null })
    stream.push({
      type: 'tool_result',
      at,
      name,
      args: args ?? null,
      isError,
      errorDigest: isError ? truncate(String(e?.errorDigest ?? ''), 160) : null,
    })

    const fp = callFingerprint(name, args)

    if (isError) {
      const entry = failures.get(fp) ?? { tool: name, preview: argPreview(args), count: 0, history: [], deniedOnce: false }
      entry.count++
      entry.history.push({ at, digest: truncate(String(e?.errorDigest ?? ''), 160) })
      if (entry.history.length > 32) entry.history.shift()
      failures.set(fp, entry)
      return
    }

    // 成功：重置该指纹的连续失败计数（知止只惩罚"连续"失败）
    const entry = failures.get(fp)
    if (entry) {
      entry.count = 0
      entry.history = []
      entry.deniedOnce = false
    }

    // 变更重置：一次成功的变更性动作（写文件 / 改代码）意味着世界已经变了，
    // 之前所有连败所立足的地面不复存在 —— 全部止损连败清零，重试重新合法。
    // 代价与诚实性：这也意味着"插一个无意义写入来洗白连败"在机制上可行，
    // 所以账本必须暴露 mutationResets 计数，让这种模式对人可见。知止不假装
    // 能读懂意图，只保证每一个可被利用的缝隙都被记录在案。
    if (writtenPathsOf(name, args).length > 0 && failures.size > 0) {
      let hadActive = false
      for (const entry of failures.values()) {
        if (entry.count > 0) hadActive = true
        entry.count = 0
        entry.history = []
        entry.deniedOnce = false
      }
      if (hadActive) mutationResets++
    }

    // 记录读取（只有成功读取才算读过）
    const rbw = opts.readBeforeWrite
    let newReads = []
    if (rbw.enabled) {
      if (rbw.readTools.includes(name)) {
        newReads = structuredPaths(args, rbw.pathArgKeys)
      } else if (name === rbw.bashTool) {
        const cmd = typeof args === 'object' && args !== null ? (args.command ?? args.cmd ?? args.script ?? '') : ''
        newReads = bashReadPaths(normalizeCommand(cmd))
      }
    }
    for (const p of newReads) {
      if (!reads.has(p)) {
        reads.add(p)
        readsMarked++
      }
    }

    // 记录验证证据
    const verify = opts.verify
    if (verify.enabled && name === verify.bashTool) {
      const cmd = typeof args === 'object' && args !== null ? (args.command ?? args.cmd ?? args.script ?? '') : ''
      if (cmd && isVerificationCommand(cmd, verify.patterns)) {
        evidenceCount++
        lastEvidenceAt = at
      }
    }
  }

  /** 事件流标记：turn 边界（供离线审计按 turn 切分；运行时管道可选调用）。 */
  function markTurn(kind, id, at) {
    if (kind !== 'start' && kind !== 'end') return
    stream.push({ type: `turn_${kind}`, at: at ?? null, id: id ?? null })
  }

  /** 知止账本：本次会话行为的一次 JSON 快照。 */
  function report() {
    const active = [...failures.entries()]
      .filter(([, e]) => e.count > 0)
      .map(([fp, e]) => ({ fingerprint: fp, tool: e.tool, count: e.count }))
      .sort((a, b) => b.count - a.count)
    return {
      totals: {
        callsObserved,
        guardedCalls,
        allowed,
        denied,
        redennied,
        readsMarked,
        evidence: evidenceCount,
        lastEvidenceAt,
        callsSinceEvidence,
        mutationResets,
      },
      rules: {
        stopLoss: { enabled: opts.stopLoss.enabled, threshold: opts.stopLoss.threshold, denied: deniedByRule.stopLoss },
        readBeforeWrite: { enabled: opts.readBeforeWrite.enabled, denied: deniedByRule.readBeforeWrite },
        verify: { enabled: opts.verify.enabled, evidence: evidenceCount },
      },
      activeFailures: active,
    }
  }

  /** 导出事件流（tool_result / tool_denied / turn_*），供 zhizhi audit 离线重放。 */
  function exportStream() {
    return stream.map(e => ({ ...e }))
  }

  return {
    options: opts,
    guard,
    noteDenied,
    observe,
    markTurn,
    report,
    exportStream,
  }
}
