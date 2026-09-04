/**
 * 有涯 · Youya —— DeepSeek Harness 的见闻记忆插件（Cordis 插件层）。
 *
 * 与前七层的方向边界（结构性，不是纪律性，见 docs/03-design.md §9）：
 *   知止拦动作（手），解蔽审判断（眼），正念守本愿（心），治未病诊开工（工），
 *   不贰记跨会话教训（习），九变勘势变应变（足），立诚结承诺之账（言）；
 *   有涯巡见闻连续性（薪）——世未变而它忘了是复见复命，世已变而它在应对归九变。
 *
 *   tools/result       emit    观察结果，见闻账步进一格（唯一写入口）
 *   （无 pre-execute）          —— 零拦截是结构性的
 *
 * 新能力类型：巡忆式插件。拦/审/供给/记取/诊断/勘流之后，有涯证明插件可以**巡忆**：
 *   从结果流里持续核对见闻的连续性（装载基线 / 执行基线 / 设瑕 / 并案），
 *   在接缝处供给**要籍**（账内工作集地图，逐字节确定，注入与否由宿主决定）。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程；
 *   - 契约无关：不需要任何开工契约，挂上即巡——对历史会话同样可离线验尸；
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import {
  createJianwenEngine,
  step,
  liveScore,
  chenAccounts,
  GATE_DEFAULT,
} from '../core/jianwen.js'
import { renderYaoji } from '../core/yaoji.js'

export const name = 'youya'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 有涯服务：见闻账与要籍暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.youya.report()` / `ctx.youya.jianwen()` /
 * `ctx.youya.yaoji()` / `ctx.youya.gate()` / `ctx.youya.exportStream()`。
 */
export class YouyaService extends Service {
  constructor(ctx, config) {
    super(ctx, 'youya')
    this.engine = createJianwenEngine(config?.chenGap)
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
  }

  /** 汇总：观察数、罪记与案数、即时殆值与分带。 */
  report() {
    const live = liveScore(this.engine)
    return {
      totals: {
        callsObserved: live.counts.callsObserved,
        sins: live.counts.sins,
        fujianCases: live.counts.fujianCases,
        fumingCases: live.counts.fumingCases,
        paths: live.counts.paths,
        commands: live.counts.commands,
      },
      score: live.score,
      band: live.band,
      gate: this.gateValue,
    }
  }

  /** 见闻账全文：逐条罪记（复见/复命）与分数。 */
  jianwen() {
    const live = liveScore(this.engine)
    return {
      sins: this.engine.sins.map((s) => ({
        seq: s.seq,
        ref: s.ref,
        at: s.idx + 1,
        object: s.object,
        kind: s.kind,
      })),
      score: live.score,
      band: live.band,
      counts: live.counts,
    }
  }

  /** 要籍：逐字节确定的账内工作集地图（#k 随渲染递增）。 */
  yaoji() {
    this.engine.renderCount++
    const chen = chenAccounts(this.engine)
    return {
      valid: true,
      k: this.engine.renderCount,
      text: renderYaoji(this.engine, this.engine.renderCount, this.gateValue),
      chen: chen.length,
    }
  }

  /** 门禁裁决：即时殆值对门。 */
  gate() {
    const live = liveScore(this.engine)
    const ok = live.score.total < this.gateValue
    return {
      score: live.score.total,
      fujian: live.score.fujian,
      fuming: live.score.fuming,
      gate: this.gateValue,
      verdict: ok ? 'pass' : 'fail',
      ok,
    }
  }

  /** 导出会话流（call/result 成对），供 `youya audit` 离线重放对账。 */
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
  // 引擎经闭包引用交付给监听器（同前七层：避免"注入自己提供的子服务"形成等待环
  // ——闭包是最诚实的通路）。
  const ref = { engine: null }

  class WiredYouyaService extends YouyaService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredYouyaService, config)

  // ---- 结果结算后：见闻账唯一写入口 ----------------------------------------
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
//   interface Context { youya: YouyaService }
// }
