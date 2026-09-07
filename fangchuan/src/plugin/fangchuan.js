/**
 * 防川 · Fangchuan —— DeepSeek Harness 的吞错形治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   知止拦动作，解蔽审判断，正念守意图，治未病体检开工，
 *   九变勘应变，有涯守会话见闻，论世审输入权威，定分定并发写域，
 *   不贰记跨会话之训，捭阖守出境，法仪护验收器，直笔保记录真实，
 *   豫立审行前退路，度支量投入花销，二柄审人机权柄，终始记众事始终，
 *   效验称成色，名实核写之名，立诚追承诺，稽疑稽动前之问，乡校听批评之默，
 *   知足量写之量，审曲审读入证据的残全，舍筏审落物之宿，渊鱼审入目之禁，
 *   水土审境变之复，考诚考交付之契，恒法审规矩源之名分，知行审会话之知行断层；
 *   防川问「交付代码里的报错之口被堵在哪里」：
 *   码面（词面）→ 文账（末文）→ 塞值（门禁）→ 导牌（供给）。
 *
 *   tools/result       emit    观察写面入文账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：防川式插件（第三十一个）。「防民之口，甚于防川；川壅而溃，伤人必多」——
 * 它不假装能读懂「这次吞错值不值」（语义判断是禁区），它的职责是让交付代码里的吞错之形
 * 留痕有价：湮形在不在、几处、哪一行、改净了没有——四问皆词面可证；
 * 纵列豁免归任务方的川册明言，为川者决之使导，为民者宣之使言。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 川册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话之归并归离线合并审计）；
 *   - 判定以末笔带 content 之写为末文（考其末文，历史在已浚注记里可见）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, settleLines, GATE_DEFAULT } from '../core/wenzhang.js'
import { renderDaopai } from '../core/daopai.js'

export const name = 'fangchuan'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 防川服务：文账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.fangchuan.report()` / `ctx.fangchuan.ledger()` / `ctx.fangchuan.paizi()` /
 * `ctx.fangchuan.gate()` / `ctx.fangchuan.exportStream()`。
 */
export class FangchuanService extends Service {
  constructor(ctx, config) {
    super(ctx, 'fangchuan')
    this.sessionId = config?.sessionId ?? 'fangchuan-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、径数、塞值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, paths: res.paths },
      cases: res.cases,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
    }
  }

  /** 文账全文：逐径逐案（径/行/形/案别/判语），判定细节离线对账可验。 */
  ledger() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      lines: settleLines(this.engine),
      score: res.score,
      band: res.band,
      counts: res.cases,
      issues: res.issues,
    }
  }

  /** 导牌块：湮形公示 + 川册公示 + 案账清点（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderDaopai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即塞值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 原样——写族的 content 在 args 里随流携带），供 `fangchuan audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `m${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: undefined })
      out.push({ type: 'tool_result', id, name: rec.name, args: rec.args, isError: rec.isError === true, at: undefined })
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null }

  class WiredFangchuanService extends FangchuanService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredFangchuanService, config)

  // ---- 结果结算后：文账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'fangchuan-session',
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { fangchuan: FangchuanService }
// }
