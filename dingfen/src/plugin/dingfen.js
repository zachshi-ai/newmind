/**
 * 定分 · Dingfen —— DeepSeek Harness 的封界插件（Cordis 插件层）。
 *
 * 与前九层的方向边界（结构性，不是纪律性）：
 *   zhizhi 在 tools/pre-execute 拦动作（手），jiebi 审判断账本（眼），zhengnian 守本愿（心），
 *   buer 记跨会话事故（习），weibing 在 t=0 诊任务书（工），jiubian 勘势途（足），
 *   lunshi 审输入渠道权威，licheng 追承诺，youya 守会话内记忆；
 *   定分管「谁有资格写哪里」：领分（声明）→ 界碑（供给）→ 审争（对账）→ 门禁（裁决）。
 *
 *   tools/result       emit    观察写事件，写账步进一格（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：封界式插件。拦/审/供给/记取/诊断/勘流之后，定分证明插件的账本可以
 * **跨会话**：运行时单侧视图只判侵入/越分（分册注入），争写是流间事实，由
 * exportStream() 交给离线多流审计——每只手只看得见自己，所以需要置吏。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 分册持久化归 CLI（claim/release/list），插件只吃注入的 registry 对象。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/zheng.js'
import { renderJiebei } from '../core/jiebei.js'

export const name = 'dingfen'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 定分服务：写账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.dingfen.report()` / `ctx.dingfen.zheng()` / `ctx.dingfen.jiebei()` /
 * `ctx.dingfen.gate()` / `ctx.dingfen.exportStream()`。
 */
export class DingfenService extends Service {
  constructor(ctx, config) {
    super(ctx, 'dingfen')
    this.engine = createEngine()
    this.sessionId = config?.sessionId ?? 'dingfen-session'
    this.registry = config?.registry ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.now = typeof config?.now === 'function' ? config.now : Date.now // 时钟注入口：测试用确定性时钟
  }

  /** 汇总：观察数、写账数、即时争值与分带（单侧视图：争写恒 0）。 */
  report() {
    const res = judge(this.engine, { registry: this.registry, gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, writes: this.engine.writes.length },
      score: res.score,
      band: res.band,
      gate: res.gate,
      counts: res.counts,
    }
  }

  /** 写账全文：逐条写事件（会话、对象、时刻）。 */
  zheng() {
    const res = judge(this.engine, { registry: this.registry, gate: this.gateValue })
    return {
      session: this.sessionId,
      writes: this.engine.writes.map((w) => ({ session: w.session, key: w.key, at: w.at })),
      score: res.score,
      band: res.band,
      trespassEntries: res.trespassEntries,
      strayEntries: res.strayEntries,
    }
  }

  /** 界碑块：分册公示（逐字节确定；注入的 registry 为空时出确定性空册文本）。 */
  jiebei() {
    return { valid: true, text: renderJiebei(this.registry) }
  }

  /** 门禁裁决：即时争值对门。 */
  gate() {
    const res = judge(this.engine, { registry: this.registry, gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对），供 `dingfen audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `d${i + 1}`
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

  class WiredDingfenService extends DingfenService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
      ref.now = this.now
    }
  }
  ctx.plugin(WiredDingfenService, config)

  // ---- 结果结算后：写账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'dingfen-session',
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
//   interface Context { dingfen: DingfenService }
// }
