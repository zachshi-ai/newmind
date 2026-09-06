/**
 * 舍筏 · Shefa —— DeepSeek Harness 的作业遗物插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   知止拦动作，解蔽审判断，正念守意图，治未病体检开工，
 *   九变勘应变，有涯守会话记忆，论世审输入权威，定分定并发写域，
 *   不贰记教训，捭阖守出境，法仪护验收器，直笔保记录真实，
 *   豫立审行前退路，度支量投入花销，二柄审人机权柄，终始记众事始终，
 *   效验称成色，名实核写之名，立诚追承诺，稽疑稽动前之问，乡校听批评之默，
 *   知足量写之量，审曲审读入证据的残全；
 *   舍筏问「落下的物去哪了」：落物通道（词形与词法）→ 筏账 → 筏值（门禁）→ 舍牌（供给）。
 *
 *   tools/result       emit    观察落物/凭据事件入账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：敛迹式插件。舍筏不假装能读懂「这件散件到底该不该留」——
 * 它的职责是让每一件无归宿凭据的悬物必须留痕上账；交付径与域界归任务方的筏册明言。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 筏册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案径与凭据只采本会话（跨会话之归并归离线合并审计）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, settleLines, GATE_DEFAULT } from '../core/fazhang.js'
import { renderShepai } from '../core/shepai.js'

export const name = 'shefa'

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
 * 舍筏服务：筏账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.shefa.report()` / `ctx.shefa.fazhang()` / `ctx.shefa.shepai()` /
 * `ctx.shefa.gate()` / `ctx.shefa.exportStream()`。
 */
export class ShefaService extends Service {
  constructor(ctx, config) {
    super(ctx, 'shefa')
    this.sessionId = config?.sessionId ?? 'shefa-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、落物笔数、案数、即筏值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, rafts: res.rafts },
      cases: res.cases,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
      counts: res.counts,
      gauge: res.gauge,
    }
  }

  /** 筏账全文：逐案清点（径/形/归宿/会话），判定细节离线对账可验。 */
  fazhang() {
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

  /** 舍牌块：筏册公示 + 终局清点（逐字节确定；全缺省出确定性文本）。 */
  shepai() {
    const lines = settleLines(this.engine)
    return {
      valid: true,
      text: renderShepai(this.book, judge(this.engine, { gate: this.gateValue }).counts, lines),
    }
  }

  /** 门禁裁决：即筏值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 原样——落物与凭据的词面证据随流携带），供 `shefa audit` 离线重放对账。 */
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

  class WiredShefaService extends ShefaService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredShefaService, config)

  // ---- 结果结算后：筏账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      const text = extractText(result)
      recordCall(engine, {
        session: config.sessionId ?? 'shefa-session',
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
//   interface Context { shefa: ShefaService }
// }
