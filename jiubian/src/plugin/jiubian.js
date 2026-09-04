/**
 * 九变 · Jiubian —— DeepSeek Harness 的勘流应变插件（Cordis 插件层）。
 *
 * 与前五层的方向边界（结构性，不是纪律性）：
 *   zhizhi 在 tools/pre-execute 拦动作（手），jiebi 审判断账本（眼），zhengnian 守本愿并
 *   供给上下文（心），buer 记跨会话事故（习），weibing 在 t=0 诊任务书（工）；
 *   九变在 tools/result 持续勘势记账（足）——势已变途不变是滞，途在动势无凭是妄。
 *
 *   tools/result       emit    观察结果，势账步进一格（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：勘流式插件。拦/审/供给/记取/诊断之后，九变证明插件可以**勘流**：
 *   从结果流里持续提取势变并裁决势途对齐，在悬账出现时于接缝处供给**变方**
 *   （逐字节确定的应变清单，注入与否由宿主决定，就像拿着拂拭块的是宿主）。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络；
 *   - 契约无关：不需要任何开工契约，挂上即勘——对历史会话同样可离线验尸；
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import { createShiEngine, step, openDebts, liveScore, GATE_DEFAULT } from '../core/shi.js'
import { renderBianfang } from '../core/bianfang.js'

export const name = 'jiubian'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 九变服务：势账与变方暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.jiubian.report()` / `ctx.jiubian.shi()` /
 * `ctx.jiubian.bianfang()` / `ctx.jiubian.gate()` / `ctx.jiubian.exportStream()`。
 */
export class JiubianService extends Service {
  constructor(ctx, config) {
    super(ctx, 'jiubian')
    this.engine = createShiEngine()
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
  }

  /** 汇总：观察数、势变数、前科、即时失机值与分带。 */
  report() {
    const live = liveScore(this.engine)
    return {
      totals: {
        callsObserved: this.engine.calls.length,
        shiEvents: live.counts.shiEvents,
        blind: live.counts.blind,
        graze: live.counts.graze,
        adapted: live.counts.adapted,
        openDebts: openDebts(this.engine).length,
      },
      score: live.score,
      band: live.band,
      gate: this.gateValue,
    }
  }

  /** 势账全文：逐条势变与裁决（未决者 verdict 为 null）。 */
  shi() {
    const live = liveScore(this.engine)
    return {
      events: this.engine.events.map((ev) => ({
        seq: ev.seq,
        ref: ev.ref,
        tool: ev.tool,
        object: ev.object,
        verdict: ev.verdict,
      })),
      score: live.score,
      band: live.band,
      openDebts: openDebts(this.engine).map((ev) => ({
        seq: ev.seq,
        tool: ev.tool,
        object: ev.object,
      })),
    }
  }

  /** 变方：逐字节确定的应变清单（#k 随渲染递增）。 */
  bianfang() {
    this.engine.renderCount++
    const debts = openDebts(this.engine)
    return {
      valid: true,
      k: this.engine.renderCount,
      text: renderBianfang(this.engine, this.engine.renderCount),
      openDebts: debts.length,
    }
  }

  /** 门禁裁决：即时失机值对门。 */
  gate() {
    const live = liveScore(this.engine)
    const ok = live.score.total < this.gateValue
    return { score: live.score.total, stale: live.score.stale, rash: live.score.rash, gate: this.gateValue, verdict: ok ? 'pass' : 'fail', ok }
  }

  /** 导出会话流（call/result 成对），供 `jiubian audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `j${i + 1}`
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
  // 引擎经闭包引用交付给监听器（同 zhizhi / jiebi / zhengnian：避免"注入自己
  // 提供的子服务"形成等待环——闭包是最诚实的通路）。
  const ref = { engine: null }

  class WiredJiubianService extends JiubianService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredJiubianService, config)

  // ---- 结果结算后：势账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      step(engine, {
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
        at: Date.now(),
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { jiubian: JiubianService }
// }
