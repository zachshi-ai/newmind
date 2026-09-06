/**
 * 水土 · Shuitu —— DeepSeek Harness 的环境水土插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   知止拦动作，解蔽审判断，正念守意图，治未病体检开工，
 *   九变勘应变，有涯守会话记忆，论世审输入权威，定分定并发写域，
 *   不贰记教训，捭阖守出境，法仪护验收器，直笔保记录真实，
 *   豫立审行前退路，度支量投入花销，二柄审人机权柄，终始记众事始终，
 *   效验称成色，名实核写之名，立诚追承诺，稽疑稽动前之问，乡校听批评之默，
 *   知足量写之量，审曲审读入证据的残全，舍筏审落物之宿，渊鱼审入目之禁；
 *   水土问「改过的常驻之境复位了没有」：改动通道（write 径形 ∪ exec 三族词法）
 *   → 改账 → 异值（门禁）→ 土牌（供给）。
 *
 *   tools/result       emit    观察改动/凭据事件入账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：察土式插件。水土不假装能读懂「这单活该不该装全局工具、该不该改全局配置」——
 * 它的职责是让每一笔未声明的常驻境变必须留痕上账；授权归任务方的土册明言。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 土册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案 key 与凭据只采本会话（跨会话之归并归离线合并审计）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, settleLines, GATE_DEFAULT } from '../core/gaizhang.js'
import { renderTupai } from '../core/tupai.js'

export const name = 'shuitu'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 从工具结果中提取正文（防御式：content 块数组 / 字符串 / 顶层 text）——本层判定不用，exportStream 携带。 */
function extractText(result) {
  const c = result?.content
  if (Array.isArray(c)) {
    return c.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('')
  }
  if (typeof c === 'string') return c
  if (typeof result?.text === 'string') return result.text
  return ''
}

/**
 * 水土服务：改账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.shuitu.report()` / `ctx.shuitu.gaizhang()` / `ctx.shuitu.tupai()` /
 * `ctx.shuitu.gate()` / `ctx.shuitu.exportStream()`。
 */
export class ShuituService extends Service {
  constructor(ctx, config) {
    super(ctx, 'shuitu')
    this.sessionId = config?.sessionId ?? 'shuitu-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、改动笔数、案数、异值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, events: res.events },
      cases: res.muts,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
      counts: res.counts,
      gauge: res.gauge,
    }
  }

  /** 改账全文：逐案清点（key/族/归宿/会话），判定细节离线对账可验。 */
  gaizhang() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      lines: settleLines(this.engine),
      exemptNotes: this.engine.exemptNotes.map((n) => ({ ...n })),
      score: res.score,
      band: res.band,
      counts: res.counts,
      issues: res.issues,
    }
  }

  /** 土牌块：土册公示 + 终局清点（逐字节确定；全缺省出确定性文本）。 */
  tupai() {
    const lines = settleLines(this.engine)
    return {
      valid: true,
      text: renderTupai(this.book, judge(this.engine, { gate: this.gateValue }), lines),
    }
  }

  /** 门禁裁决：异值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 原样——改动与凭据的词面证据随流携带），供 `shuitu audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `m${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: rec.at ?? undefined })
      out.push({
        type: 'tool_result',
        id,
        name: rec.name,
        args: rec.args,
        isError: rec.isError === true,
        content: rec.content ?? undefined,
        at: rec.at ?? undefined,
      })
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null }

  class WiredShuituService extends ShuituService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredShuituService, config)

  // ---- 结果结算后：改账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      const text = extractText(result)
      recordCall(engine, {
        session: config.sessionId ?? 'shuitu-session',
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
        content: text.length > 0 ? text : null,
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { shuitu: ShuituService }
// }
