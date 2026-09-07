/**
 * 约法 · Yuefa —— DeepSeek Harness 的公面守约治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   知止拦动作，解蔽审判断，正念守意图，治未病体检开工，
 *   九变勘应变，有涯守会话见闻，论世审输入权威，定分定并发写域，
 *   不贰记跨会话之训，捭阖守出境，法仪护验收器，直笔保记录真实，
 *   豫立审行前退路，度支量投入花销，二柄审人机权柄，终始记众事始终，
 *   效验称成色，名实核写之名，立诚追承诺，稽疑稽动前之问，乡校听批评之默，
 *   知足量写之量，审曲审读入证据的残全，舍筏审落物之宿，渊鱼审入目之禁，
 *   水土审境变之复，考诚考交付之契，恒法审规矩源之名分，知行审会话之知行断层，
 *   防川审交付代码里的吞错之形，平准审依赖清单上的命脉四案，成事审已遂之施的再施，
 *   huashui 审同径三序的行集之鲜；
 *   约法问「公面之约守没守」：
 *   读时立约（约据唯读）→ 世据折旧 → 落笔对约 → 削案（削值）→ 约牌（供给）。
 *
 *   tools/result       emit    观察读面入约账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：约法式插件（第三十五个）。「与父老约，法三章耳：杀人者死，
 * 伤人及盗抵罪」——它不假装能读懂「这次删值不值」（语义判断是禁区），它的
 * 职责是让公面对得起读时之约：读时看见的名落笔后还在不在、削得有没有声，
 * 两序词法全在流内正文上；约册许削授权归任务方明言，弃词随削同落即明削免分——
 * 余悉除去秦法，吏民皆安堵如故。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 约册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（合审归并归离线合并审计）；
 *   - 约形是行首词法与花括号形（考其名集，不探盘面）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/yueyin.js'
import { renderYuepai } from '../core/yuepai.js'

export const name = 'yuefa'

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
 * 约法服务：约账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.yuefa.report()` / `ctx.yuefa.ledger()` / `ctx.yuefa.paizi()` /
 * `ctx.yuefa.gate()` / `ctx.yuefa.exportStream()`。
 */
export class YuefaService extends Service {
  constructor(ctx, config) {
    super(ctx, 'yuefa')
    this.sessionId = config?.sessionId ?? 'yuefa-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、径数、削值与分带（单会话视图）。 */
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

  /** 约账全文：逐径逐案（径/案别/seq/名），判定细节离线对账可验。 */
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

  /** 约牌块：约册公示 + 案账清点 + 逐案点名（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderYuepai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即削值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 与结果正文原样随流携带），供 `yuefa audit` 离线重放对账。 */
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

  class WiredYuefaService extends YuefaService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredYuefaService, config)

  // ---- 结果结算后：约账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'yuefa-session',
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
//   interface Context { yuefa: YuefaService }
// }
