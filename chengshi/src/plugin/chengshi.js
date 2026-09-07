/**
 * 成事 · Chengshi —— DeepSeek Harness 的已遂重施治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   知止拦动作，解蔽审判断，正念守意图，治未病体检开工，九变勘应变，有涯守会话见闻，
 *   论世审输入权威，定分定并发写域，不贰记跨会话之训，捭阖守出境之物，法仪护验收器，
 *   直笔保记录真实，豫立审行前退路，度支量投入花销，二柄审人机权柄，终始记众事始终，
 *   效验称成色，名实核写之名，立诚追承诺，稽疑稽动前之问，乡校听批评之默，
 *   知足量写之量，审曲审读入证据的残全，舍筏审落物之宿，渊鱼审入目之禁，
 *   水土审境变之复，考诚考交付之契，恒法审规矩源之名分，知行审会话之知行断层，
 *   防川审交付代码里的吞错之形，平准审依赖清单之附；
 *   成事问「已遂之施做成了几次」：
 *   遂面（词面）→ 遂账（同键并案）→ 重值（门禁）→ 遂牌（供给）。
 *
 *   tools/result       emit    观察施面入遂账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：成事式插件（第三十三个）。「成事不说，遂事不谏，既往不咎」——
 * 它不假装能读懂「这次重施是不是有意的」（语义判断是禁区），它的职责是让已遂之施
 * 入账可查：哪件事做成了、做成了几次、第二次何以又施、善后了没有——四问皆词面可证；
 * 再施授权归任务方的遂册明言，主渠道再命归线下全流审计终裁（运行时无主文，
 * 照判重决出注记）。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 遂册持久化归 CLI（allow/disallow），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话之归并归离线合并审计）；
 *   - 报告与遂牌永不携带命令原文与实参（遂名 = 形词 + djb2 指纹，掩码是结构性保证）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, settleKeys, GATE_DEFAULT } from '../core/suizhang.js'
import { renderSuipaiWithLedger } from '../core/suipai.js'

export const name = 'chengshi'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 成事服务：遂账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.chengshi.report()` / `ctx.chengshi.ledger()` / `ctx.chengshi.paizi()` /
 * `ctx.chengshi.gate()` / `ctx.chengshi.exportStream()`。
 */
export class ChengshiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'chengshi')
    this.sessionId = config?.sessionId ?? 'chengshi-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book, runtime: true })
  }

  /** 汇总：观察数、遂键数、重值与分带（单会话视图；重决案附线上无主文注记）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls, keys: res.keys },
      cases: res.cases,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
      runtimeNote: res.runtimeNote,
    }
  }

  /** 遂账全文：逐键逐笔（遂名掩码，不含命令原文），判定细节离线对账可验。 */
  ledger() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      lines: settleKeys(this.engine),
      score: res.score,
      band: res.band,
      counts: res.cases,
      issues: res.issues,
    }
  }

  /** 遂牌块：遂形公示 + 遂册公示 + 遂账清点（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderSuipaiWithLedger(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即重值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（成功 exec 逐笔，段以「; 」重建——重放分段等价；不含 principal——
   *  运行时本就未见；消据命令随流携带，重放「已消」不误判），
   *  供 `chengshi audit` 离线重放对账。 */
  exportStream() {
    const out = []
    let ord = 0
    for (const e of this.engine.execs) {
      const id = `m${++ord}`
      const command = e.segs.map((s) => s.raw).join('; ')
      const deed = this.engine.deeds.find((d) => d.ord === e.ord)
      out.push({ type: 'tool_call', id, name: 'bash', args: { command } })
      const rec = { type: 'tool_result', id, name: 'bash', args: { command }, isError: false }
      if (deed?.content) rec.content = deed.content
      out.push(rec)
    }
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null }

  class WiredChengshiService extends ChengshiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredChengshiService, config)

  // ---- 结果结算后：遂账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      // result.content 是 render 后的投影（块数组或字符串）——成物之柄取其文本
      const raw = result?.content
      const text = typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('\n')
          : null
      recordCall(engine, {
        session: config.sessionId ?? 'chengshi-session',
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
        content: text,
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { chengshi: ChengshiService }
// }
