/**
 * 市虎 · Shihu —— DeepSeek Harness 的状态陈报治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   知止拦动作，解蔽审判断，正念守意图，治未病体检开工，
 *   九变勘应变，有涯守会话见闻，论世审输入权威，定分定并发写域，
 *   不贰记跨会话之训，捭阖守出境，法仪护验收器，直笔保记录真实，
 *   豫立审行前退路，度支量投入花销，二柄审人机权柄，终始记众事始终，
 *   效验称成色，名实核写之名，立诚追将来时之诺，稽疑稽动前之问，
 *   乡校听批评之默，知足量写之量，审曲审读入证据的残全，舍筏审落物之宿，
 *   渊鱼审入目之禁，水土审境变之复，考诚考交付之契，恒法审规矩源之名分，
 *   知行审会话之知行断层，防川审交付代码里的吞错之形，平准审依赖清单四案，
 *   chengshi 审外发世界的重复，huashui 审同径三序的行集之鲜，yuefa 审公共接口之收缩，
 *   saowu 审交付代码里的调试之垢；
 *   市虎问「自述之状有没有据」：
 *   状面唯写 → 状形提取 → 状键对账 → 虚功（虎值）→ 状牌（供给）。
 *
 *   tools/result       emit    观察写面入状账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：市虎式插件（第三十七个）。「夫市之无虎明矣，然而三人言而成虎」——
 * 它不假装能读懂「这条声明为什么虚」（幻觉与措辞归人裁决），它的职责是让
 * 陈报对得起自己的手：写下的完成态声明，对象词元在自己会话的作工面上
 * 一查便知；引用上游之功要署名（掠据白），虚报的每一条都在状牌上点名——
 * 邯郸去大梁也远于市，交接之后无从质证，账要落在收工那一刻。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 状册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 声明按其所在会话的作工面对账（自态自证——他会话的作工救不了本会话的虚报）；
 *   - 状面形是显式词法（考其状键，不探盘面）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/huyin.js'
import { renderHupai } from '../core/hupai.js'

export const name = 'shihu'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 结果侧正文块的文本拼接（状面正文来源；非文本块忽略）。 */
function textOf(result) {
  const blocks = result?.content
  if (!Array.isArray(blocks)) return null
  const text = blocks
    .map((b) => (b && typeof b === 'object' && typeof b.text === 'string' ? b.text : ''))
    .join('\n')
  return text.length > 0 ? text : null
}

/**
 * 市虎服务：状账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.shihu.report()` / `ctx.shihu.ledger()` / `ctx.shihu.paizi()` /
 * `ctx.shihu.gate()` / `ctx.shihu.exportStream()`。
 */
export class ShihuService extends Service {
  constructor(ctx, config) {
    super(ctx, 'shihu')
    this.sessionId = config?.sessionId ?? 'shihu-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、状面数、虎值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, paths: res.paths },
      cases: res.cases,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
    }
  }

  /** 状账全文：逐状面逐条（径/行号/案别/状键），判定细节离线对账可验。 */
  ledger() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      findings: res.findings,
      score: res.score,
      band: res.band,
      counts: res.cases,
      issues: res.issues,
    }
  }

  /** 状牌块：状册公示 + 案账清点 + 逐条点名（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderHupai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即虎值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 与结果正文原样随流携带），供 `shihu audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `m${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: undefined })
      const result = { type: 'tool_result', id, name: rec.name, args: rec.args, isError: rec.isError === true, at: undefined }
      if (rec.content) result.content = rec.content
      out.push(result)
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null }

  class WiredShihuService extends ShihuService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredShihuService, config)

  // ---- 结果结算后：状账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'shihu-session',
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
//   interface Context { shihu: ShihuService }
// }
