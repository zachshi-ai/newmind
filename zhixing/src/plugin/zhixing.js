/**
 * 知行 · Zhixing —— DeepSeek Harness 的知行断层插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   知止拦动作，解蔽审判断，正念守意图，治未病体检开工，
 *   不贰记跨会话之训，九变勘应变，有涯守会话见闻，论世审输入权威，定分定并发写域，
 *   捭阖守出境，法仪护验收器，直笔保记录真实，豫立审行前退路，度支量投入花销，
 *   二柄审人机权柄，终始记众事始终，效验称成色，名实核写之名，立诚追承诺，
 *   稽疑稽动前之问，乡校听批评之默，知足量写之量，审曲审读入证据的残全，
 *   舍筏审落物之宿，渊鱼审入目之禁，水土审境变之复，考诚考立下之契，
 *   恒法审立法之名分；知行问「已读之凭，行合不合」：
 *   知面（装载）→ 戒形（只生自知面）→ 行面对账 → 行值（门禁）→ 合牌（供给）。
 *
 *   tools/result       emit    观察知面与行面入账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：知行式插件（第三十个）。「知而不行，只是未知；一念发动处便即是行」——
 * 知行不假装能读懂章程的语义，它的职责是让已装载章程的显式戒形对着流中行为逐条对上、
 * 留痕有价；章程里写什么戒条、什么是必行之事，归任务方的凭册明言。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 凭册持久化归 CLI（rule），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话之归并归离线合并审计）；
 *   - 知面取文于管道：observe 族成功装载的正文取结果侧 content 文本块（知面取文于流）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/xingzhang.js'
import { renderPaizi } from '../core/hepai.js'

export const name = 'zhixing'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 结果侧正文块的文本拼接（知面取文之用；非文本块忽略）。 */
function textOf(result) {
  const blocks = result?.content
  if (!Array.isArray(blocks)) return null
  const text = blocks
    .map((b) => (b && typeof b === 'object' && typeof b.text === 'string' ? b.text : ''))
    .join('\n')
  return text.length > 0 ? text : null
}

/**
 * 知行服务：行账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.zhixing.report()` / `ctx.zhixing.ledger()` / `ctx.zhixing.paizi()` /
 * `ctx.zhixing.gate()` / `ctx.zhixing.exportStream()`。
 */
export class ZhixingService extends Service {
  constructor(ctx, config) {
    super(ctx, 'zhixing')
    this.sessionId = config?.sessionId ?? 'zhixing-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、案数、行值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, zhi: res.counts.zhi },
      cases: res.counts,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
    }
  }

  /** 行账全文：逐条清点（戒形/案别/撞点），判定细节离线对账可验。 */
  ledger() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      lines: res.lines,
      score: res.score,
      band: res.band,
      counts: res.counts,
      issues: res.issues,
    }
  }

  /** 合牌块：凭册公示 + 知面清单（逐字节确定；永不携带装载正文）。 */
  paizi() {
    return {
      valid: true,
      text: renderPaizi(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即行值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，observe 正文随 result 携带），供 `zhixing audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `m${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args })
      const result = { type: 'tool_result', id, name: rec.name, args: rec.args, isError: rec.isError === true }
      if (rec.content) result.content = rec.content
      out.push(result)
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null }

  class WiredZhixingService extends ZhixingService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredZhixingService, config)

  // ---- 结果结算后：知面与行面唯一写入口 -----------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'zhixing-session',
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
        content: textOf(result),
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { zhixing: ZhixingService }
// }
