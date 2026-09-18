/**
 * 讳疾 · Huiji —— DeepSeek Harness 的红上宣绿治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）见 docs/03 §11——
 * 每一层都审一句话的成色或一句话对世界：证据之有无（zhizhi）、工作宣言对作工
 * （shihu）、成功信号之成色（xiaoyan）、卸责之辞对流内红（zizhao）、归因之言对
 * 验因形迹（suliu）——本层审一句话对流内胜负的极性：痊愈态宣称出口时，其对象
 * 在流内的未决账上是红是绿。诊断（失败的验证）在流里，宣称在稿里——
 * 疾不言，愈不立。
 *
 *   tools/result       emit    疾账收全流（exec 成败旗标 + 稿面愈行），judge 时按
 *   （无 pre-execute）         当时全流现算 —— 零拦截是结构性的
 *
 * 新能力类型：讳疾式插件（第四十五个）。「君有疾在腠理，不治将恐深」——桓侯
 * 曰「寡人无疾」。它不假装能读出宣称的动机（语义判断是禁区），它的职责是让
 * 红上之绿当众留痕：愈必有对象、对象必有诊断、诊断必在其红、其红必未决、
 * 未决才立案；先痊后言（已痊）0 分留痕——汤熨之所及，复验而后言。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 痊册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话疾账互认归离线合并审计）；
 *   - 新稿立撤：同径新稿落地换下旧稿；判词在 judge 时按当时全流现算。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, exportCalls, GATE_DEFAULT } from '../core/jizhang.js'
import { renderJipai } from '../core/jipai.js'

export const name = 'huiji'

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
 * 讳疾服务：疾账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.huiji.report()` / `ctx.huiji.ledger()` / `ctx.huiji.paizi()` /
 * `ctx.huiji.gate()` / `ctx.huiji.exportStream()`。
 */
export class HuijiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'huiji')
    this.sessionId = config?.sessionId ?? 'huiji-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、受审稿、疾值与分带（单会话视图）。 */
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

  /** 案账全文：逐案逐注记（稿径:行:案别 与指纹），判定细节离线对账可验。 */
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

  /** 疾牌块：痊册公示 + 词法公示 + 案账清点（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderJipai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即疾值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 与结果正文原样随流携带），供 `huiji audit` 离线重放对账。 */
  exportStream() {
    return exportCalls(this.engine.calls)
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null }

  class WiredHuijiService extends HuijiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredHuijiService, config)

  // ---- 结果结算后：疾账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'huiji-session',
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
//   interface Context { huiji: HuijiService }
// }
