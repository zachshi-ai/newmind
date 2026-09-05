/**
 * 法仪 · Fayi —— DeepSeek Harness 的持尺插件（Cordis 插件层）。
 *
 * 与前十一层的方向边界（结构性，不是纪律性）：
 *   zhizhi 拦动作（知止数「验过没有」），jiebi 审判断账本，zhengnian 守本愿，
 *   weibing 诊任务书（t=0），jiubian 勘势途，youya 守见闻记忆，lunshi 审输入权威，
 *   dingfen 封写域（跨会话），buer 记教训，licheng 追承诺，baihe 守出境；
 *   法仪管「量尺本身信不信」：器册（立册）→ 翻红窗归因（曲尺）→ 虚器词表（虚器）→
 *   照末（废尺/尾红）→ 枉值门禁 → 绳墨块（供给）。
 *
 *   tools/result       emit    观察写与执行事件（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的：尺不拦手，尺只不弯
 *
 * 新能力类型：持尺式插件。拦/审/供给/记取/诊断/勘流/巡忆/权界/封界之后，
 * 法仪证明插件的判定对象可以不是事件本身，而是**事件之间的序与窗**——
 * 翻红窗是区间归因，照末是序比较；单会话自弯其尺，跨会话看不见，只能窗内看。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 器册持久化归 CLI（enroll/list），插件只吃注入的 register 对象。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/fayi.js'
import { renderShengmo } from '../core/block.js'

export const name = 'fayi'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 法仪服务：器账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.fayi.report()` / `ctx.fayi.qizhang()` / `ctx.fayi.shengmo()` /
 * `ctx.fayi.gate()` / `ctx.fayi.exportStream()`。
 */
export class FayiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'fayi')
    this.engine = createEngine()
    this.sessionId = config?.sessionId ?? 'fayi-session'
    this.register = config?.register ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.now = typeof config?.now === 'function' ? config.now : Date.now // 时钟注入口：测试用确定性时钟
  }

  _judge() {
    return judge(this.engine, { register: this.register, gate: this.gateValue })
  }

  /** 汇总：观察数、写账数、即时枉值与分带。 */
  report() {
    const res = this._judge()
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, writes: this.engine.writes.length, execs: this.engine.execs.length },
      score: res.score,
      band: res.band,
      gate: res.gate,
      counts: res.counts,
      shimo: res.shimo,
    }
  }

  /** 器账全文：器动、三宗明细、尾红。 */
  qizhang() {
    const res = this._judge()
    return {
      session: this.sessionId,
      instrumentTouches: res.instrumentTouches,
      quchiCases: res.quchiCases,
      doubtSpots: res.doubtSpots,
      amendInWindow: res.amendInWindow,
      hollowHits: res.hollowHits,
      tailRed: res.tailRed,
      shimo: res.shimo,
      score: res.score,
      band: res.band,
    }
  }

  /** 绳墨块：器册公示 + 尺况（逐字节确定）。 */
  shengmo() {
    return { valid: true, text: renderShengmo(this.register, this._judge()) }
  }

  /** 门禁裁决：即时枉值对门。 */
  gate() {
    const res = this._judge()
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对），供 `fayi audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `f${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: rec.at ?? undefined })
      out.push({
        type: 'tool_result',
        id,
        name: rec.name,
        args: rec.args,
        isError: rec.isError === true,
        at: rec.at ?? undefined,
      })
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null, now: null }

  class WiredFayiService extends FayiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
      ref.now = this.now
    }
  }
  ctx.plugin(WiredFayiService, config)

  // ---- 结果结算后：器账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'fayi-session',
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
        at: ref.now ? ref.now() : Date.now(),
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { fayi: FayiService }
// }
