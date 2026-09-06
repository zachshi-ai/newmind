/**
 * 乡校 · Xiangxiao —— DeepSeek Harness 的谏诤通道插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）：
 *   zhizhi 拦动作，jiebi 审判断，zhengnian 守意图，weibing 体检开工，
 *   jiubian 勘应变，youya 守会话记忆，lunshi 审输入权威，dingfen 定并发写域，
 *   buer 记教训，baihe 守出境，fayi 护验收器，zhibi 保记录真实，
 *   yuli 审行前退路，duzhi 量资源总量，erbing 审人机权柄，zhongshi 记众事始终，
 *   xiaoyan 称成色，mingshi 核写之名，licheng 追承诺，jiyi 稽动前之问；
 *   乡校管「批评通道被静音」：默认形表（词法）→ 声账（首见定案）→ 壅值（门禁）→ 谏牌（供给）。
 *
 *   tools/result       emit    观察写/读/执行事件入账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：谏诤式插件。乡校不假装能读懂「这句注释是不是合理的权宜」——
 * 它的职责是让每一处无凭之默必须留痕上账；豁免归任务方的声册明言。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 声册持久化归 CLI（register/revoke），插件只吃注入的 registry 对象；
 *   - 单会话视图的读侧先见只采本会话（跨会话之先见归离线合并审计）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/shengzhang.js'
import { renderJianpai } from '../core/jianpai.js'

export const name = 'xiangxiao'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 从工具结果中提取正文（防御式：content 块数组 / 字符串 / 顶层 text）——读侧先见的证据源。 */
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
 * 乡校服务：声账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.xiangxiao.report()` / `ctx.xiangxiao.shengzhang()` / `ctx.xiangxiao.jianpai()` /
 * `ctx.xiangxiao.gate()` / `ctx.xiangxiao.exportStream()`。
 */
export class XiangxiaoService extends Service {
  constructor(ctx, config) {
    super(ctx, 'xiangxiao')
    this.sessionId = config?.sessionId ?? 'xiangxiao-session'
    this.registry = config?.registry ?? null
    this.extraMutes = Array.isArray(config?.mutes) ? config.mutes : []
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ registry: this.registry, extraMutes: this.extraMutes })
  }

  /** 汇总：观察数、写账数、案数、即壅值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, writes: this.engine.writes.length },
      cases: res.cases,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
      counts: res.counts,
    }
  }

  /** 声账全文：案与注记逐条（径:行/词形/会话），判定细节离线对账可验。 */
  shengzhang() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      cases: this.engine.cases.map((c) => ({ ...c })),
      notes: this.engine.notes.map((n) => ({ ...n })),
      score: res.score,
      band: res.band,
      counts: res.counts,
      issues: res.issues,
    }
  }

  /** 谏牌块：声册公示 + 声账计数（逐字节确定；空册出确定性空册文本）。 */
  jianpai() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      valid: true,
      text: renderJianpai(this.registry, res.counts),
    }
  }

  /** 门禁裁决：即壅值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 原样、读调用带 content——证据随流携带），供 `xiangxiao audit` 离线重放对账。 */
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

  class WiredXiangxiaoService extends XiangxiaoService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredXiangxiaoService, config)

  // ---- 结果结算后：声账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      let content = null
      const text = extractText(result)
      if (text.length > 0) content = text
      recordCall(engine, {
        session: config.sessionId ?? 'xiangxiao-session',
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
//   interface Context { xiangxiao: XiangxiaoService }
// }
