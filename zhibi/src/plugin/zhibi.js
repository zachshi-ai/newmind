/**
 * 直笔 · Zhibi —— DeepSeek Harness 的记录保真插件（Cordis 插件层）。
 *
 * 与前各层的方向边界（结构性，不是纪律性，见 docs/03-design.md §11）：
 *   知止拦动作，解蔽审判断，正念守本愿，治未病诊开工，九变勘应变，有涯巡见闻，
 *   论世审输入权威，并发写域与跨会话教训另有其主，立诚结言约之账，捭阖守出境，
 *   验收器之脏净亦另有其主；直笔审**记录的笔直**——失败性命令上的讳形与族末空绿。
 *   尺直笔曲，绿照样是假的：下游各层信的退出码，由本层先验明正身。
 *
 *   tools/result       emit    观察结算，笔账步进一格（唯一写入口）
 *   （无 pre-execute）          —— 零拦截是结构性的；动作拦截不是本层地盘
 *
 * 新能力类型：秉笔式插件。拦/审/供给/记取/诊断/勘流/巡忆/权界/封界/守境/持尺之后，
 * 直笔证明插件可以**秉笔**：对史事逐案判讳笔/空绿/诚红/试笔/豁笔，在接缝处供给
 * **实录块**（族末状态 + 讳笔点名，逐字节确定，注入与否由宿主决定）。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程；
 *   - 契约无关：不需要任何开工契约，挂上即审——对历史会话同样可离线验尸；
 *   - 时序无关：族内先后只用流内序列，不依赖时间戳，无时之流全判；
 *   - 报告不泄原文：账面只留掩码摘录，不留命令全文；
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import {
  createBizhangEngine,
  step,
  liveScore,
  GATE_DEFAULT,
} from '../core/bizhang.js'
import { renderShilu } from '../core/shilu.js'

export const name = 'zhibi'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 直笔服务：笔账与实录块暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.zhibi.report()` / `ctx.zhibi.bizhang()` /
 * `ctx.zhibi.shilu()` / `ctx.zhibi.gate()` / `ctx.zhibi.exportStream()`。
 */
export class ZhibiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'zhibi')
    const reg = config?.register ?? {}
    this.engine = createBizhangEngine({
      words: [...(reg.words ?? []), ...(config?.words ?? [])],
      masks: [...(reg.masks ?? []), ...(config?.masks ?? [])],
      excuses: [...(reg.excuses ?? []), ...(config?.excuses ?? [])],
      noDefaults: reg.noDefaults === true || config?.noDefaults === true,
    })
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
  }

  /** 汇总：观察数、史事概数、即时讳值与分带。 */
  report() {
    const live = liveScore(this.engine)
    return {
      totals: {
        callsObserved: live.counts.callsObserved,
        shishi: live.counts.shishi,
        families: live.counts.families,
        weibi: live.counts.weibi,
        konglv: live.counts.konglv,
        chenghong: live.counts.chenghong,
        shibi: live.counts.shibi,
        huibi: live.counts.huibi,
      },
      score: live.score,
      band: live.band,
      gate: this.gateValue,
    }
  }

  /** 笔账全目：逐案讳笔 + 逐注记 + 族末清单。 */
  bizhang() {
    const live = liveScore(this.engine)
    return {
      cases: this.engine.cases.map((k) => ({
        seq: k.seq,
        ref: k.ref,
        tool: k.tool,
        families: k.words.map((w) => w.label),
        masks: k.maskHits.map((m) => m.label),
        excerpt: k.excerpt,
      })),
      notes: this.engine.notes.map((n) => ({
        kind: n.kind,
        seq: n.seq,
        tool: n.tool,
        families: n.words.map((w) => w.label),
        excuse: n.excuse,
      })),
      familyList: live.familyList,
      score: live.score,
      band: live.band,
      counts: live.counts,
    }
  }

  /** 实录块：逐字节确定的族末清单与讳笔点名（#k 随渲染递增）。 */
  shilu() {
    this.engine.renderCount++
    return {
      valid: true,
      k: this.engine.renderCount,
      text: renderShilu(this.engine, this.engine.renderCount, this.gateValue),
    }
  }

  /** 门禁裁决：即时讳值对门。 */
  gate() {
    const live = liveScore(this.engine)
    const ok = live.score.total < this.gateValue
    return {
      score: live.score.total,
      konglv: live.counts.konglv,
      gate: this.gateValue,
      verdict: ok ? 'pass' : 'fail',
      ok,
    }
  }

  /** 导出会话流（call/result 成对），供 `zhibi audit` 离线重放对账。 */
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

  class WiredZhibiService extends ZhibiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredZhibiService, config)

  // ---- 结果结算后：笔账唯一写入口 ------------------------------------------
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
//   interface Context { zhibi: ZhibiService }
// }
