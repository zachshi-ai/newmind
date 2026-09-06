/**
 * 考诚 · Kaocheng —— DeepSeek Harness 的交付契约插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   知止拦动作，解蔽审判断，正念守意图，治未病体检开工，
 *   九变勘应变，有涯守会话见闻，论世审输入权威，定分定并发写域，
 *   不贰记跨会话之训，捭阖守出境，法仪护验收器，直笔保记录真实，
 *   豫立审行前退路，度支量投入花销，二柄审人机权柄，终始记众事始终，
 *   效验称成色，名实核写之名，立诚追承诺，稽疑稽动前之问，乡校听批评之默，
 *   知足量写之量，审曲审读入证据的残全，舍筏审落物之宿，渊鱼审入目之禁，
 *   水土审境变之复；考诚问「立下的契，物成没成」：
 *   契册（径/结形/域/词/卷）→ 物账 → 诚值（门禁）→ 考牌（供给）。
 *
 *   tools/result       emit    观察工据与灭据入账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：考诚式插件（第二十八个）。「物勒工名，以考其诚；工有不当，必行其罪」——
 * 考诚不假装能读懂「这份交付物够不够好」，它的职责是让任务方立的契约对着流内物之末据
 * 逐条考过、留痕有价；契上要什么物、什么结形，归任务方的契册明言。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 契册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话之归并归离线合并审计）；
 *   - 写族交付内容取自 args.content（随流携带），结果侧正文不参与判定（观察不是工）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, settleLines, GATE_DEFAULT } from '../core/wuzhang.js'
import { renderPaizi } from '../core/kaopai.js'

export const name = 'kaocheng'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 考诚服务：物账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.kaocheng.report()` / `ctx.kaocheng.ledger()` / `ctx.kaocheng.paizi()` /
 * `ctx.kaocheng.gate()` / `ctx.kaocheng.exportStream()`。
 */
export class KaochengService extends Service {
  constructor(ctx, config) {
    super(ctx, 'kaocheng')
    this.sessionId = config?.sessionId ?? 'kaocheng-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、案数、诚值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, items: res.items },
      contractless: res.contractless,
      cases: res.counts,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
    }
  }

  /** 物账全文：逐件清点（契名/径/案别/缺什么/末据凭据），判定细节离线对账可验。 */
  ledger() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      lines: settleLines(this.engine),
      score: res.score,
      band: res.band,
      counts: res.counts,
      issues: res.issues,
    }
  }

  /** 考牌块：契册公示 + 物账清点（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderPaizi(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即诚值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 原样——写族 content 在 args 里随流携带），供 `kaocheng audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `m${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: undefined })
      out.push({ type: 'tool_result', id, name: rec.name, args: rec.args, isError: rec.isError === true, at: undefined })
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null }

  class WiredKaochengService extends KaochengService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredKaochengService, config)

  // ---- 结果结算后：物账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'kaocheng-session',
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { kaocheng: KaochengService }
// }
