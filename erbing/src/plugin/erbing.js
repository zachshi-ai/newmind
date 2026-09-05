/**
 * 二柄 · Erbing —— DeepSeek Harness 的审柄插件（Cordis 插件层）。
 *
 * 与前各层的方向边界（结构性，不是纪律性，见 docs/03 §13）：
 *   知止问行前这动作能不能做（拦），二柄问这决定你有没有资格自己做（账）；
 *   论世审谁有资格发令（下行冒充），二柄审须柄之事命出没出主渠道（上行缺请）；
 *   捭阖审出去的物（泄密），二柄审出去的话与版（授权）——无密物的对外发声，那边永远清白；
 *   豫立问行前有备乎，二柄问行前有命乎——备份不是授权，授权不是备份。
 *
 *   tools/result       emit    观察结算，柄账步进一格（唯一写入口）
 *   （无 pre-execute）          —— 零拦截是结构性的；动作治理是知止的地盘
 *
 * 新能力类型：审柄式插件。拦/审/供给/记取/诊断/勘流/巡忆/权界/封界/守境/保真/
 * 行前进退之后，二柄证明插件可以**审柄**：账上只记一件事——柄在行使的那一刻，
 * 在不在该在的手里。侵柄（无命自专）与渎请（已答重渎）同册，双向定罪。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程；
 *   - 契约无关：不需要任何开工契约，挂上即审——对历史会话同样可离线验尸；
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import {
  createBingzhangEngine,
  applyEvent,
  liveScore,
  GATE_DEFAULT,
} from '../core/bingzhang.js'
import { renderBingpai } from '../core/bingpai.js'

export const name = 'erbing'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 二柄服务：柄账与柄牌块暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.erbing.report()` / `ctx.erbing.cases()` /
 * `ctx.erbing.bingpai()` / `ctx.erbing.gate()` / `ctx.erbing.exportStream()`，
 * 主渠道文本经 `ctx.erbing.declare(text)` 入账（宿主转发用户话语时调用）。
 */
export class ErbingService extends Service {
  constructor(ctx, config) {
    super(ctx, 'erbing')
    this.engine = createBingzhangEngine({
      gate: config?.gate,
      handle: config?.handle,
      grant: config?.grant,
      noDefaults: config?.noDefaults,
    })
    // 主命可随配置注入（任务书原文即主渠道的第一段文本）
    if (typeof config?.principal === 'string' && config.principal) {
      this.declare(config.principal)
    }
  }

  /** 主渠道文本入账（pos 随到达序递增——先序即到达序）。 */
  declare(text) {
    this.engine.pos += 1
    applyEvent(this.engine, { kind: 'principal', pos: this.engine.pos, text: String(text) })
  }

  /** 汇总：受审数、决形命中数、即时柄值与分带。 */
  report() {
    const live = liveScore(this.engine)
    return {
      totals: live.counts,
      score: live.score,
      band: live.band,
      gate: this.engine.gate,
    }
  }

  /** 柄账全文：逐案清单（侵柄/渍请/有命/未遂/未判）。 */
  cases() {
    const live = liveScore(this.engine)
    return {
      caseList: this.engine.events.map((e) => ({
        seq: e.seq,
        pos: e.pos,
        ref: e.ref,
        at: e.at,
        tool: e.tool,
        kind: e.kind,
        familyLabel: e.familyLabel ?? null,
        formId: e.formId ?? null,
        scored: e.scored,
        declareItems: e.declareItems ?? 0,
        asked: e.asked ?? false,
        warrantPos: e.warrantPos ?? null,
        excerpt: e.excerpt,
      })),
      score: live.score,
      band: live.band,
      counts: live.counts,
    }
  }

  /** 柄牌块：逐字节确定的侵柄与渎请点名（#k 随渲染递增）。 */
  bingpai() {
    this.engine.renderCount++
    return {
      valid: true,
      k: this.engine.renderCount,
      text: renderBingpai(this.engine, this.engine.renderCount, this.engine.gate),
    }
  }

  /** 门禁裁决：即时柄值对门。 */
  gate() {
    const live = liveScore(this.engine)
    const ok = live.score.total < this.engine.gate
    return {
      score: live.score.total,
      qinCases: live.counts.qinCases,
      gate: this.engine.gate,
      verdict: ok ? 'pass' : 'fail',
      ok,
    }
  }

  /** 导出会话流（principal / appeal / call+result 成对，按真实到达序），供 `erbing audit` 离线重放对账。 */
  exportStream() {
    const out = []
    let seq = 0
    for (const entry of this.engine.log) {
      if (entry.type === 'principal') {
        out.push({ type: 'principal', text: entry.text, at: entry.at })
      } else if (entry.type === 'appeal') {
        out.push({ type: 'appeal', text: entry.text, at: entry.at })
      } else {
        const id = entry.ref ?? `e${++seq}`
        out.push({ type: 'tool_call', id, name: entry.name, args: entry.args, at: entry.at })
        out.push({
          type: 'tool_result',
          id,
          name: entry.name,
          args: entry.args,
          isError: entry.isError,
          at: entry.at,
        })
      }
    }
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同各前层：避免"注入自己提供的子服务"形成等待环
  // ——闭包是最诚实的通路）。
  const ref = { engine: null }

  class WiredErbingService extends ErbingService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredErbingService, config)

  // ---- 结果结算后：柄账唯一写入口 ------------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      engine.pos += 1
      applyEvent(engine, {
        kind: 'call',
        pos: engine.pos,
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
//   interface Context { erbing: ErbingService }
// }
