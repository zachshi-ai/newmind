/**
 * 察传 · Chachu —— DeepSeek Harness 的无见立言治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）见 docs/03 §11——
 * 文书对世界的每一面都有层在审：交接之状对自流作工（shihu）、落卷之引对所托
 * 原文（jiaotuo）、交付之物对任务方之契（kaocheng）——本层审言对所见：平铺
 * 断言的所指之物进没进过流。一状一证、一托一证、一契一证——无引号的断言、
 * 不对应契约的平铺事实，只有本层过堂。
 *
 *   tools/result       emit    见据记流内之见；write 稿面入传账判言（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：察传式插件（第四十一个）。「得言不可以不察；闻而不审，不若无闻」
 * ——它不假装能判断言内容的真伪（语义判断是禁区），它的职责是让无见立言
 * 当众留痕：言有所指、指有所见、见在言先——三问皆词法与流内事件可证；
 * 免审与基径归任务方的证册明言，迟证/虚指注记不判——账本只治「得言 ∧ 指物
 * ∧ 流内无见据」的当众之案。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 证册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话见据互证归离线合并审计）；
 *   - 新稿立撤：同径新稿落地换下旧稿；判词在 judge 时按当时全流见据现算。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/shenyan.js'
import { renderZhengpai } from '../core/zhengpai.js'

export const name = 'chachu'

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
 * 察传服务：传账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.chachu.report()` / `ctx.chachu.ledger()` / `ctx.chachu.paizi()` /
 * `ctx.chachu.gate()` / `ctx.chachu.exportStream()`。
 */
export class ChachuService extends Service {
  constructor(ctx, config) {
    super(ctx, 'chachu')
    this.sessionId = config?.sessionId ?? 'chachu-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、受审稿、幻值与分带（单会话视图）。 */
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

  /** 案账全文：逐案逐注记（稿径:行:案别 与指物、指纹），判定细节离线对账可验。 */
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

  /** 证牌块：证册公示 + 词法公示 + 案账清点（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderZhengpai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即幻值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 与结果正文原样随流携带），供 `chachu audit` 离线重放对账。 */
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

  class WiredChachuService extends ChachuService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredChachuService, config)

  // ---- 结果结算后：见据与稿面唯一写入口 -----------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'chachu-session',
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
//   interface Context { chachu: ChachuService }
// }
