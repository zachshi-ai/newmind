/**
 * 窥镜 · Kuijing —— DeepSeek Harness 的立场迎附治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）见 docs/03 §13——
 * 每一层都审一句话对世界：断言之物对自流之见（chachu）、交接之状对自流作工
 * （shihu）、落卷之引对所托原文（jiaotuo）、成功信号对流内证据（xiaoyan）、
 * 归因之言对流内之验（suliu）、卸责宣告对流内之责（zizhao）——本层审两句话
 * 对彼此：同一对象的立场从 A 翻到 −A 之间，流里动没动过。压力在会话语语里，
 * 流里永远看不见；据窗逐字可见——动机不可审，据窗可审。
 *
 *   tools/result       emit    判账收全流（判行 + 据件候选），judge 时按当时全流现算
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：窥镜式插件（第四十四个）。「吾妻之美我者，私我也；妾之美我者，
 * 畏我也；客之美我者，欲有求于我也」——它不假装能读出翻转的动机（语义判断
 * 是禁区），它的职责是让无据之翻当众留痕：翻必有对象、对象必有先判、先判
 * 必反极性、反极性必查据窗、据窗空才立案；有据之更（鉴更）0 分留痕——虽欲
 * 言，无可进者。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 赏册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话判账与据件互认归离线合并审计）；
 *   - 新稿立撤：同径新稿落地换下旧稿；判词在 judge 时按当时全流现算（判账历史全保）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/panzhang.js'
import { renderCaipai } from '../core/caipai.js'

export const name = 'kuijing'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 结果侧正文块的文本拼接（稿面之文来源；非文本块忽略）。 */
function textOf(result) {
  const blocks = result?.content
  if (!Array.isArray(blocks)) return null
  const text = blocks
    .map((b) => (b && typeof b === 'object' && typeof b.text === 'string' ? b.text : ''))
    .join('\n')
  return text.length > 0 ? text : null
}

/**
 * 窥镜服务：判账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.kuijing.report()` / `ctx.kuijing.ledger()` / `ctx.kuijing.paizi()` /
 * `ctx.kuijing.gate()` / `ctx.kuijing.exportStream()`。
 */
export class KuijingService extends Service {
  constructor(ctx, config) {
    super(ctx, 'kuijing')
    this.sessionId = config?.sessionId ?? 'kuijing-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、受审稿、谀值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, paths: res.paths, rows: res.rows },
      counts: res.counts,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
    }
  }

  /** 案账全文：逐案逐注记（判径:行:案别 与指纹），判定细节离线对账可验。 */
  ledger() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      cases: res.cases,
      notes: res.notes,
      score: res.score,
      band: res.band,
      counts: res.counts,
      issues: res.issues,
    }
  }

  /** 刺牌块：赏册公示 + 词法公示 + 案账清点（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderCaipai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即谀值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 与结果正文原样随流携带），供 `kuijing audit` 离线重放对账。 */
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

  class WiredKuijingService extends KuijingService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredKuijingService, config)

  // ---- 结果结算后：判行与据件唯一写入口 -----------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'kuijing-session',
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
//   interface Context { kuijing: KuijingService }
// }
