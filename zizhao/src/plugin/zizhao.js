/**
 * 自照 · Zizhao —— DeepSeek Harness 的失败弃责治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）见 docs/03 §12——
 * 责任光谱的正半轴层层有账：完成态宣言对自流作工（shihu）、话语承诺对兑现
 * （licheng）、归因断言对流内验迹（suliu）、成功信号对流内证据（xiaoyan）——
 * 本层审负半轴的弃责之凭：哪一句「X 是历史遗留 / pre-existing」的流里，
 * 红明明在场（失败 exec 历历可查），却无基线对照（镜）、无名分（册）、弃后
 * 无更。「看过」救不了它，只有照过镜（stash 基线对照）或册上有名才清白。
 *
 *   tools/result       emit    红账/镜凭/思短三通道记流内之红与凭；write 责面稿
 *   （无 pre-execute）           入责账判弃责（唯一写入口）—— 零拦截是结构性的
 *
 * 新能力类型：自照式插件（第四十三个）。「人欲自照，必须明镜」「明主思短而
 * 益善，暗主护短而永愚」——它不假装能判弃责的真假（语义判断是禁区），它的
 * 职责是让护短当众留痕：弃必有对象、对象必有红在场、红在场必有镜凭或名分、
 * 弃后更则清白——四问皆词法与流内事件可证；免审归任务方的照册明言，镜凭/
 * 思短/泛弃/虚弃注记不判——账本只治「弃责形 ∧ 对象有物 ∧ 红账在场 ∧ 凭据
 * 全无」的当众之案。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 照册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话红账与镜凭互认归离线合并审计）；
 *   - 新稿立撤：同径新稿落地换下旧稿；判词在 judge 时按当时全流红账现算。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/hongzhang.js'
import { renderZhaopai } from '../core/zhaopai.js'

export const name = 'zizhao'

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
 * 自照服务：责账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.zizhao.report()` / `ctx.zizhao.ledger()` / `ctx.zizhao.paizi()` /
 * `ctx.zizhao.gate()` / `ctx.zizhao.exportStream()`。
 */
export class ZizhaoService extends Service {
  constructor(ctx, config) {
    super(ctx, 'zizhao')
    this.sessionId = config?.sessionId ?? 'zizhao-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、受审稿、照值与分带（单会话视图）。 */
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

  /** 案账全文：逐案逐注记（责径:行:案别 与指纹），判定细节离线对账可验。 */
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

  /** 照牌块：照册公示 + 词法公示 + 案账清点（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderZhaopai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即照值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 与结果正文原样随流携带），供 `zizhao audit` 离线重放对账。 */
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

  class WiredZizhaoService extends ZizhaoService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredZizhaoService, config)

  // ---- 结果结算后：红账与稿面唯一写入口 -----------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'zizhao-session',
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
//   interface Context { zizhao: ZizhaoService }
// }
