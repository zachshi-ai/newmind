/**
 * 豫立 · Yuli —— DeepSeek Harness 的行前定插件（Cordis 插件层）。
 *
 * 与前各层的方向边界（结构性，不是纪律性，见 docs/03-design.md）：
 *   知止拦动作（行前拦截），豫立不拦——险行皆入账、无备才计分；
 *   捭阖审出境参数里的物（出去的），豫立审本地命令里的险（毁掉的）；
 *   直笔保记录之真（退出码被洗白），豫立以记录为信史、审记录里的事（事是无备的）；
 *   法仪审量具之弯，定分审写域之争，九变勘失败后的不改——豫立只问一件流里无人问的事：
 *   不可逆操作落地之前，退路在不在。
 *
 *   tools/result       emit    观察结算，险账步进一格（唯一写入口）
 *   （无 pre-execute）          —— 零拦截是结构性的；动作拦截是知止的地盘
 *
 * 新能力类型：行前定式插件。拦/审/供给/记取/诊断/勘流/巡忆/结绳/守境/保真之后，
 * 豫立证明插件可以**备案**：不拦行险，只问行前退路——审批制（拦下等人批）之外的
 * 备案制（行前留备即放行），有备者不疚，无备者入账。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程；
 *   - 契约无关：不需要任何开工契约，挂上即审——对历史会话同样可离线验尸；
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import {
  createYuzhangEngine,
  step,
  liveScore,
  GATE_DEFAULT,
} from '../core/yuzhang.js'
import { renderYupai } from '../core/yupai.js'

export const name = 'yuli'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 豫立服务：险账与豫牌块暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.yuli.report()` / `ctx.yuli.yuzhang()` /
 * `ctx.yuli.yupai()` / `ctx.yuli.gate()` / `ctx.yuli.exportStream()`。
 */
export class YuliService extends Service {
  constructor(ctx, config) {
    super(ctx, 'yuli')
    this.engine = createYuzhangEngine({
      gate: config?.gate,
      risk: config?.risk,
      exempt: config?.exempt,
      noDefaults: config?.noDefaults,
    })
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
  }

  /** 汇总：受审数、险形命中数、即时险值与分带。 */
  report() {
    const live = liveScore(this.engine)
    return {
      totals: {
        callsObserved: live.counts.callsObserved,
        execObserved: live.counts.execObserved,
        risksObserved: live.counts.risksObserved,
        nakedCases: live.counts.nakedCases,
        declareItems: live.counts.declareItems,
        nettedCases: live.counts.nettedCases,
        ganpao: live.counts.ganpao,
        feints: live.counts.feints,
        luokuan: live.counts.luokuan,
      },
      score: live.score,
      band: live.band,
      gate: this.gateValue,
    }
  }

  /** 险账全文：逐案清单（裸险/虚险/落款/有备/干跑）。 */
  yuzhang() {
    const live = liveScore(this.engine)
    return {
      cases: this.engine.events.map((e) => ({
        seq: e.seq,
        ref: e.ref,
        at: e.at,
        tool: e.tool,
        kind: e.kind,
        familyLabel: e.familyLabel,
        formId: e.formId,
        scored: e.scored,
        declareItems: e.declareItems ?? 0,
        excerpt: e.excerpt,
      })),
      score: live.score,
      band: live.band,
      counts: live.counts,
    }
  }

  /** 豫牌块：逐字节确定的裸险点名（#k 随渲染递增）。 */
  yupai() {
    this.engine.renderCount++
    return {
      valid: true,
      k: this.engine.renderCount,
      text: renderYupai(this.engine, this.engine.renderCount, this.gateValue),
    }
  }

  /** 门禁裁决：即时险值对门。 */
  gate() {
    const live = liveScore(this.engine)
    const ok = live.score.total < this.gateValue
    return {
      score: live.score.total,
      nakedCases: live.counts.nakedCases,
      gate: this.gateValue,
      verdict: ok ? 'pass' : 'fail',
      ok,
    }
  }

  /** 导出会话流（call/result 成对），供 `yuli audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `y${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: rec.at ?? undefined })
      out.push({
        type: 'tool_result',
        id,
        name: rec.name,
        args: rec.args,
        isError: rec.isError,
        at: rec.at ?? undefined,
      })
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同各前层：避免"注入自己提供的子服务"形成等待环
  // ——闭包是最诚实的通路）。
  const ref = { engine: null }

  class WiredYuliService extends YuliService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredYuliService, config)

  // ---- 结果结算后：险账唯一写入口 ------------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      step(engine, {
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: typeof result?.isError === 'boolean' ? result.isError : null,
        at: Date.now(),
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { yuli: YuliService }
// }
