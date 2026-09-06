/**
 * 审曲 · Shenqu —— DeepSeek Harness 的读据成色插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   zhizhi 拦动作，jiebi 审判断，zhengnian 守意图，weibing 体检开工，
 *   jiubian 勘应变，youya 守会话记忆，lunshi 审输入权威，dingfen 定并发写域，
 *   buer 记教训，baihe 守出境，fayi 护验收器，zhibi 保记录真实，
 *   yuli 审行前退路，duzhi 量投入花销，erbing 审人机权柄，zhongshi 记众事始终，
 *   xiaoyan 称成色，mingshi 核写之名，licheng 追承诺，jiyi 稽动前之问，
 *   xiangxiao 听批评之默，zhizu 量落笔规模；
 *   审曲称读据的残全：残见两通道（词法与结构信号）→ 材账 → 残值（门禁）→ 材牌（供给）。
 *
 *   tools/result       emit    观察读/写事件入账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：审材式插件。审曲不假装能读懂「这次改坏是不是因为没看全」——
 * 它的职责是让每一份残卷必须留痕上账：取窗者自证其全（回程短于窗），
 * 显残者留痕在卷尾；豁免与增词归任务方的材册明言。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 材册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 据证链按会话分账：单会话视图，跨会话互不赦免（合并审计归离线，判定仍按会话键）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/caizhang.js'
import { renderCaipai } from '../core/caipai.js'

export const name = 'shenqu'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 从工具结果中提取正文（防御式：content 块数组 / 字符串 / 顶层 text）——显残通道的证据源。 */
function extractText(result) {
  const c = result?.content
  if (Array.isArray(c)) {
    return c.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('')
  }
  if (typeof c === 'string') return c
  if (typeof result?.text === 'string') return result.text
  return ''
}

/**
 * 审曲服务：材账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.shenqu.report()` / `ctx.shenqu.caizhang()` / `ctx.shenqu.caipai()` /
 * `ctx.shenqu.gate()` / `ctx.shenqu.exportStream()`。
 */
export class ShenquService extends Service {
  constructor(ctx, config) {
    super(ctx, 'shenqu')
    this.sessionId = config?.sessionId ?? 'shenqu-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、见闻数、案数、即残值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, views: res.views, writes: res.writes },
      cases: res.cases,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
      counts: res.counts,
      gauge: res.gauge,
    }
  }

  /** 材账全文：案与注记逐条（径/会话），判定细节离线对账可验。 */
  caizhang() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      cases: this.engine.cases.map((c) => ({ ...c })),
      notes: this.engine.notes.map((n) => ({ ...n })),
      score: res.score,
      band: res.band,
      counts: res.counts,
      gauge: res.gauge,
      issues: res.issues,
    }
  }

  /** 材牌块：材册公示 + 材账计数（逐字节确定；全缺省出确定性文本）。 */
  caipai() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      valid: true,
      text: renderCaipai(this.book, res.counts),
    }
  }

  /** 门禁裁决：即残值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 原样、读调用带 content——证据随流携带），供 `shenqu audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `m${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: rec.at ?? undefined })
      out.push({
        type: 'tool_result',
        id,
        name: rec.name,
        args: rec.args,
        isError: rec.isError === true,
        content: rec.content ?? undefined,
        at: rec.at ?? undefined,
      })
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null }

  class WiredShenquService extends ShenquService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredShenquService, config)

  // ---- 结果结算后：材账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      let content = null
      const text = extractText(result)
      if (text.length > 0) content = text
      recordCall(engine, {
        session: config.sessionId ?? 'shenqu-session',
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
        content,
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { shenqu: ShenquService }
// }
