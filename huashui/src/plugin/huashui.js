/**
 * 画水 · Huashui —— DeepSeek Harness 的落笔之鲜治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   知止拦动作，解蔽审判断，正念守意图，治未病体检开工，
 *   九变勘应变，有涯守会话见闻，论世审输入权威，定分定并发写域，
 *   不贰记跨会话之训，捭阖守出境，法仪护验收器，直笔保记录真实，
 *   豫立审行前退路，度支量投入花销，二柄审人机权柄，终始记众事始终，
 *   效验称成色，名实核写之名，立诚追承诺，稽疑稽动前之问，乡校听批评之默，
 *   知足量写之量，审曲审读入证据的残全，舍筏审落物之宿，渊鱼审入目之禁，
 *   水土审境变之复，考诚考交付之契，恒法审规矩源之名分，知行审会话之知行断层，
 *   防川审交付代码里的吞错之形，平准审依赖清单上的命脉四案，成事审已遂之施的再施；
 *   画水问「落笔之鲜在哪」：
 *   同径三序（旧据 → 变写 → 陈写）→ 行集差集 → 覆案（陈值）→ 水牌（供给）。
 *
 *   tools/result       emit    观察写面入据账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：画水式插件（第三十四个）。「我今画水作记，舍之而去后当取之」——
 * 它不假装能读懂「这次重写是不是有意复古」（语义判断是禁区），它的职责是让
 * 落笔对得起其时之世：以旧底覆掉其间之变的三序全在流内行集上，陈线重现 ∧
 * 新线再失即案；许复授权归任务方的水册明言，写前重读者行集含新线、谓词自白——
 * 水虽不别，汝昔失时乃在于彼，今在此觅何由可得。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 水册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（覆世之归并归离线合并审计）；
 *   - 三序判定以同径的带文读/写为文据、以无文之写为隔断之痕（考其行集，不探盘面）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/juzhang.js'
import { renderShuipai } from '../core/shuipai.js'

export const name = 'huashui'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 结果侧正文块的文本拼接（读据之文来源；非文本块忽略）。 */
function textOf(result) {
  const blocks = result?.content
  if (!Array.isArray(blocks)) return null
  const text = blocks
    .map((b) => (b && typeof b === 'object' && typeof b.text === 'string' ? b.text : ''))
    .join('\n')
  return text.length > 0 ? text : null
}

/**
 * 画水服务：据账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.huashui.report()` / `ctx.huashui.ledger()` / `ctx.huashui.paizi()` /
 * `ctx.huashui.gate()` / `ctx.huashui.exportStream()`。
 */
export class HuashuiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'huashui')
    this.sessionId = config?.sessionId ?? 'huashui-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、径数、陈值与分带（单会话视图）。 */
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

  /** 据账全文：逐径逐案（径/案别/seq/行数），判定细节离线对账可验。 */
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

  /** 水牌块：水册公示 + 案账清点 + 逐案点名（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderShuipai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即陈值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 与结果正文原样随流携带），供 `huashui audit` 离线重放对账。 */
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

  class WiredHuashuiService extends HuashuiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredHuashuiService, config)

  // ---- 结果结算后：据账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'huashui-session',
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
//   interface Context { huashui: HuashuiService }
// }
