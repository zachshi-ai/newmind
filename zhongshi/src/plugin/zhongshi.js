/**
 * 终始 · Zhongshi —— DeepSeek Harness 的记程插件（Cordis 插件层）。
 *
 * 与前各层的方向边界（结构性，不是纪律性，见 docs/03-design.md）：
 *   知止拦动作（行前拦截），终始不拦——每笔调用皆入账、案别末笔定；
 *   正念守一愿（意图在场、范围不失），终始记众事（立了几件事、各自走到哪）；
 *   立诚追自己说出口的诺（话语负债），终始记任务方册上立下的事（主命分工）；
 *   度支量总量（花销多少），终始记分项（每事到哪）——总账不分项，分项不计总。
 *   本层只问一件流里无人问的事：册上立的那几件事，各自有始乎？有终乎？
 *
 *   tools/result       emit    观察结算，程账步进一格（唯一写入口）
 *   （无 pre-execute）          —— 零拦截是结构性的；动作拦截是知止的地盘
 *
 * 新能力类型：记程式插件。拦/审/供给/记取/诊断/勘流/巡忆/结绳/守境/保真/备案/计账/
 * 审柄/持尺之后，终始证明插件可以**记程**：立册、行程、结案、供图——
 * 程账块就是中断续跑的交接班记录。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程；
 *   - 契约无关：不需要任何开工契约，挂上即审（事册随配置注入或文件载入）——
 *     对历史会话同样可离线验尸；
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import {
  createChengzhangEngine,
  step,
  liveScore,
  GATE_DEFAULT,
} from '../core/chengzhang.js'
import { renderChengkuai } from '../core/chengkuai.js'

export const name = 'zhongshi'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 终始服务：程账与程账块暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.zhongshi.report()` / `ctx.zhongshi.chengzhang()` /
 * `ctx.zhongshi.chengkuai()` / `ctx.zhongshi.gate()` / `ctx.zhongshi.exportStream()`。
 */
export class ZhongshiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'zhongshi')
    this.engine = createChengzhangEngine({
      gate: config?.gate,
      items: config?.items,
      order: config?.order,
    })
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
  }

  /** 汇总：立事数、案数、即时程值与分带。 */
  report() {
    const live = liveScore(this.engine)
    return {
      totals: {
        callsObserved: live.counts.callsObserved,
        itemsDeclared: live.counts.itemsDeclared,
        youZhong: live.counts.youZhong,
        youQi: live.counts.youQi,
        banCount: live.counts.banCount,
        youCount: live.counts.youCount,
        kongCount: live.counts.kongCount,
        xuCount: live.counts.xuCount,
      },
      score: live.score,
      band: live.band,
      gate: this.gateValue,
    }
  }

  /** 程账全文：逐事清单（幽项/半途/有终/有弃 + 空终 + 失序）。 */
  chengzhang() {
    const live = liveScore(this.engine)
    return {
      items: live.states,
      kongList: live.kongList,
      violations: live.violations,
      score: live.score,
      band: live.band,
      counts: live.counts,
    }
  }

  /** 程账块：逐字节确定的续跑图（#k 随渲染递增）。 */
  chengkuai() {
    this.engine.renderCount++
    return {
      valid: true,
      k: this.engine.renderCount,
      text: renderChengkuai(this.engine, this.engine.renderCount, this.gateValue),
    }
  }

  /** 门禁裁决：即时程值对门。 */
  gate() {
    const live = liveScore(this.engine)
    const ok = live.score.total < this.gateValue
    return {
      score: live.score.total,
      youCount: live.counts.youCount,
      gate: this.gateValue,
      verdict: ok ? 'pass' : 'fail',
      ok,
    }
  }

  /** 导出会话流（call/result 成对），供 `zhongshi audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `z${i + 1}`
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

  class WiredZhongshiService extends ZhongshiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredZhongshiService, config)

  // ---- 结果结算后：程账唯一写入口 ------------------------------------------
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
//   interface Context { zhongshi: ZhongshiService }
// }
