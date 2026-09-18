/**
 * 安澜 · Anlan —— DeepSeek Harness 的响应性施治治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）见 docs/03 §12——
 * 每一层都审一帧的成色：证据之有无（zhizhi）、败后行为之重复（jiubian）、痊愈
 * 宣称对流内红（huiji）、单次写入之量（zhizu）——本层是第一层审**序列净效果**：
 * 同一验证对象的胜负序列对搅动序列。每一帧施治皆有据（上帧确实红），序列上
 * 叠三搅二即荡——单帧皆真，序列皆妄。
 *
 *   tools/result       emit    波账收全流（exec 成败旗标 × 诊形 + write 搅迹），
 *   （无 pre-execute）         judge 时按当时全流现算 —— 零拦截是结构性的
 *
 * 新能力类型：安澜式插件（第四十六个）。「若过程稳定，对它施治只会放大变异」
 * （戴明漏斗实验，大意）——它不假装能读出施治的动机（语义判断是禁区），它的
 * 职责是让修复乒乓当众留痕：波必有对象、对象必有诊、叠必过三、叠间必有搅、
 * 搅必过二、过则立案；波自翻转而手未动（风浪）0 分留痕——红珠实验，波动来自
 * 系统，flaky 之名的正式归宿是还给任务方。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 澜册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话波账归并归离线合并审计）；
 *   - 判词在 judge 时按当时全流现算（record 只记账——judge 幂等）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, exportCalls, GATE_DEFAULT } from '../core/bozhang.js'
import { renderDangpai } from '../core/dangpai.js'

export const name = 'anlan'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 结果侧正文块的文本拼接（结果正文来源；非文本块忽略）。 */
function textOf(result) {
  const blocks = result?.content
  if (!Array.isArray(blocks)) return null
  const text = blocks
    .map((b) => (b && typeof b === 'object' && typeof b.text === 'string' ? b.text : ''))
    .join('\n')
  return text.length > 0 ? text : null
}

/**
 * 安澜服务：波账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.anlan.report()` / `ctx.anlan.ledger()` / `ctx.anlan.paizi()` /
 * `ctx.anlan.gate()` / `ctx.anlan.exportStream()`。
 */
export class AnlanService extends Service {
  constructor(ctx, config) {
    super(ctx, 'anlan')
    this.sessionId = config?.sessionId ?? 'anlan-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、在场对象、荡值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, objects: res.objects },
      counts: res.counts,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
    }
  }

  /** 案账全文：逐案逐注记（对象词元:案别 与指纹），判定细节离线对账可验。 */
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

  /** 荡牌块：澜册公示 + 词法公示 + 案账清点（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderDangpai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即荡值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 与结果正文原样随流携带），供 `anlan audit` 离线重放对账。 */
  exportStream() {
    return exportCalls(this.engine.calls)
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null }

  class WiredAnlanService extends AnlanService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredAnlanService, config)

  // ---- 结果结算后：波账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'anlan-session',
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
//   interface Context { anlan: AnlanService }
// }
