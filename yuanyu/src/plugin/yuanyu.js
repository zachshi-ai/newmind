/**
 * 渊鱼 · Yuanyu —— DeepSeek Harness 的入目之禁插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   知止拦动作，解蔽审判断，正念守意图，治未病体检开工，
 *   九变勘应变，有涯守会话见闻，论世审输入权威，定分定并发写域，
 *   不贰记跨会话之训，捭阖守出境，法仪护验收器，直笔保记录真实，
 *   豫立审行前退路，度支量投入花销，二柄审人机权柄，终始记众事始终，
 *   效验称成色，名实核写之名，立诚追承诺，稽疑稽动前之问，乡校听批评之默，
 *   知足量写之量，审曲审读入证据的残全，舍筏审落物之宿；
 *   渊鱼问「该不该看」：装载通道（词形与词法）→ 视账 → 渊值（门禁）→ 鉴牌（供给）。
 *
 *   tools/result       emit    观察装载与转运事件入账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：察渊式插件。「察见渊鱼者不祥，智料隐匿者有殃」——渊鱼不假装能读懂
 * 「这一眼出于什么动机」，它的职责是让每一眼看进隐匿都留痕上账；什么算暗处、
 * 哪些是本职，归任务方的礼册明言。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 礼册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话之归并归离线合并审计）；
 *   - 值原文只活在引擎内存里供转运比照，任何报告结构只携带指纹（结构性掩码）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, settleLines, GATE_DEFAULT } from '../core/shizhang.js'
import { renderPaizi } from '../core/jianpai.js'

export const name = 'yuanyu'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 从工具结果中提取正文（防御式：content 块数组 / 字符串 / 顶层 text）——转运提取与装载入册要用。 */
function extractText(result) {
  const c = result?.content
  if (Array.isArray(c)) {
    return c.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('')
  }
  if (typeof c === 'string') return c
  if (typeof result?.text === 'string') return result.text
  return ''
}

/**
 * 渊鱼服务：视账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.yuanyu.report()` / `ctx.yuanyu.ledger()` / `ctx.yuanyu.paizi()` /
 * `ctx.yuanyu.gate()` / `ctx.yuanyu.exportStream()`。
 */
export class YuanyuService extends Service {
  constructor(ctx, config) {
    super(ctx, 'yuanyu')
    this.sessionId = config?.sessionId ?? 'yuanyu-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、装载笔数、案数、即渊值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, loads: res.loads },
      cases: res.cases,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
      counts: res.counts,
      gauge: res.gauge,
    }
  }

  /** 视账全文：逐案清点（径/形/案别/转运指纹/会话），判定细节离线对账可验。 */
  ledger() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      lines: settleLines(this.engine),
      score: res.score,
      band: res.band,
      counts: res.counts,
      issues: res.issues,
    }
  }

  /** 鉴牌块：礼册公示 + 视账清点（逐字节确定；全缺省出确定性文本）。 */
  paizi() {
    const lines = settleLines(this.engine)
    return {
      valid: true,
      text: renderPaizi(this.book, judge(this.engine, { gate: this.gateValue }), lines),
    }
  }

  /** 门禁裁决：即渊值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 原样、content 随行——装载与转运的词面证据随流携带），供 `yuanyu audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `m${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: rec.at ?? undefined })
      out.push({
        type: 'tool_result',
        id,
        name: rec.name,
        args: rec.args,
        isError: rec.isError === true,
        content: rec.content ?? undefined,
        at: rec.at ?? undefined,
      })
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null }

  class WiredYuanyuService extends YuanyuService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredYuanyuService, config)

  // ---- 结果结算后：视账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      const text = extractText(result)
      recordCall(engine, {
        session: config.sessionId ?? 'yuanyu-session',
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
        content: text.length > 0 ? text : null,
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { yuanyu: YuanyuService }
// }
