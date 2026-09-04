/**
 * 捭阖 · Baihe —— DeepSeek Harness 的出域权界插件（Cordis 插件层）。
 *
 * 与前各层的方向边界（结构性，不是纪律性，见 docs/03-design.md）：
 *   知止拦动作，解蔽审判断，正念守本愿，治未病诊开工，不贰记跨会话教训，
 *   九变勘势变应变，有涯巡见闻连续性，论世审输入渠道发令资格，立诚结承诺之账，
 *   并发资源之争另有其主；捭阖审输出侧的出域权界——物在手不罚，物出境才罚。
 *   论世是镜子里的对面：它管「进来的内容有没有资格发令」，本层管「出去的参数
 *   里有没有不该出的物」；一进一出，互不引词。
 *
 *   tools/result       emit    观察结算，境账步进一格（唯一写入口）
 *   （无 pre-execute）          —— 零拦截是结构性的；出境拦截是知止的地盘
 *
 * 新能力类型：权界式插件。拦/审/供给/记取/诊断/勘流/巡忆/结绳之后，捭阖证明
 * 插件可以**守境**：对出境类调用逐案称量（阖籍）与记账（境账），在接缝处供给
 * **阖门块**（泄物点名，逐字节确定，注入与否由宿主决定）。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程；
 *   - 契约无关：不需要任何开工契约，挂上即守——对历史会话同样可离线验尸；
 *   - 报告不泄原物：境内只有掩码与掩码摘录，数据结构里没有原文；
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import {
  createJingzhangEngine,
  step,
  liveScore,
  GATE_DEFAULT,
} from '../core/jingzhang.js'
import { renderHemen } from '../core/hemen.js'

export const name = 'baihe'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 捭阖服务：境账与阖门块暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.baihe.report()` / `ctx.baihe.jingzhang()` /
 * `ctx.baihe.hemen()` / `ctx.baihe.gate()` / `ctx.baihe.exportStream()`。
 */
export class BaiheService extends Service {
  constructor(ctx, config) {
    super(ctx, 'baihe')
    this.engine = createJingzhangEngine({
      allow: config?.allow,
      declare: config?.declare,
    })
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
  }

  /** 汇总：观察数、出境账概数、即时溃值与分带。 */
  report() {
    const live = liveScore(this.engine)
    return {
      totals: {
        callsObserved: live.counts.callsObserved,
        exitsObserved: live.counts.exitsObserved,
        leakCases: live.counts.leakCases,
        shichu: live.counts.shichu,
        internal: live.counts.internal,
        lawful: live.counts.lawful,
      },
      score: live.score,
      band: live.band,
      gate: this.gateValue,
    }
  }

  /** 境账全文：逐案清单（泄物/试出/内域档/合法出境，掩码命中）。 */
  jingzhang() {
    const live = liveScore(this.engine)
    return {
      cases: this.engine.exits.map((e) => ({
        seq: e.seq,
        ref: e.ref,
        at: e.at,
        tool: e.tool,
        host: e.host,
        domain: e.domain,
        kind: e.kind,
        scored: e.scored,
        hits: e.hits,
      })),
      score: live.score,
      band: live.band,
      counts: live.counts,
    }
  }

  /** 阖门块：逐字节确定的泄物点名（#k 随渲染递增）。 */
  hemen() {
    this.engine.renderCount++
    return {
      valid: true,
      k: this.engine.renderCount,
      text: renderHemen(this.engine, this.engine.renderCount, this.gateValue),
    }
  }

  /** 门禁裁决：即时溃值对门。 */
  gate() {
    const live = liveScore(this.engine)
    const ok = live.score.total < this.gateValue
    return {
      score: live.score.total,
      leakCases: live.counts.leakCases,
      gate: this.gateValue,
      verdict: ok ? 'pass' : 'fail',
      ok,
    }
  }

  /** 导出会话流（call/result 成对），供 `baihe audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `b${i + 1}`
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

  class WiredBaiheService extends BaiheService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredBaiheService, config)

  // ---- 结果结算后：境账唯一写入口 ------------------------------------------
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
//   interface Context { baihe: BaiheService }
// }
