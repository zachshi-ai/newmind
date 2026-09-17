/**
 * 溯流 · Suliu —— DeepSeek Harness 的因果臆断治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）见 docs/03 §13——
 * 断言对世界的每一面都有层在审：断言之物对自流之见（chachu）、交接之状对
 * 自流作工（shihu）、落卷之引对所托原文（jiaotuo）、成功信号对流内证据
 * （xiaoyan）——本层审归因之验：哪一句「根因是 X」的流里，从未有过动 X
 * 之因、验 X 之果的形迹。「看过」是 chachu 的清白线，是本层的黄牌线。
 *
 *   tools/result       emit    验因三通道记流内之验；write 诊面稿入因账判归因（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：溯流式插件（第四十二个）。「然则天下之事，但知其一，不知其二
 * 者多矣，可据理臆断欤？」——它不假装能判断因果的真伪（语义判断是禁区），
 * 它的职责是让臆断当众留痕：断必有因、因必有所动、动必有所验、验在断言先
 * ——四问皆词法与流内事件可证；免审归任务方的臆册明言，显疑/迟验/泛因
 * 注记不判——账本只治「归因形 ∧ 因面有物 ∧ 流内无验因形迹」的当众之案。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 臆册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话验因证据互认归离线合并审计）；
 *   - 新稿立撤：同径新稿落地换下旧稿；判词在 judge 时按当时全流验因现算。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/yanyin.js'
import { renderSupai } from '../core/supai.js'

export const name = 'suliu'

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
 * 溯流服务：因账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.suliu.report()` / `ctx.suliu.ledger()` / `ctx.suliu.paizi()` /
 * `ctx.suliu.gate()` / `ctx.suliu.exportStream()`。
 */
export class SuliuService extends Service {
  constructor(ctx, config) {
    super(ctx, 'suliu')
    this.sessionId = config?.sessionId ?? 'suliu-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、受审稿、臆值与分带（单会话视图）。 */
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

  /** 案账全文：逐案逐注记（诊径:行:案别 与指纹），判定细节离线对账可验。 */
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

  /** 溯牌块：臆册公示 + 词法公示 + 案账清点（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderSupai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即臆值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 与结果正文原样随流携带），供 `suliu audit` 离线重放对账。 */
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

  class WiredSuliuService extends SuliuService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredSuliuService, config)

  // ---- 结果结算后：验因与稿面唯一写入口 -----------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'suliu-session',
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
//   interface Context { suliu: SuliuService }
// }
