/**
 * 指瑕 · Zhixia —— DeepSeek Harness 的文书自洽治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）见 docs/03 §11——
 * 三十八层审的全是文书对世界：交接之状对自流作工、落卷之引对所托原文、
 * 交付之物对任务方之契——本层审文书对自己：稿面声明的数对身后的枚举、
 * 表的合计对它的整数列、起日对止日。一状一瑕、一托一瑕、一契一瑕，
 * 谓词正交——文书对世界的每一面都有层在审，文书对自己只有本层。
 *
 *   tools/result       emit    write 稿面入瑕账并判瑕（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：指瑕式插件（第四十个）。「虑动难圆，鲜无瑕病」——它不假装
 * 能读懂「数目为何错」（语义判断是禁区），它的职责是让卷内自相矛盾当众
 * 留痕：声明的数与枚举的实敷不敷、合计与整数列等不等、起止倒不倒——三问
 * 皆词法与算术可证；免审授权归任务方的瑕册明言，阙列/已磨注记不判——
 * 账本只治「言列不敷、总分不敷、起止倒置」的当众之瑕。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 瑕册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话之归并归离线合并审计）；
 *   - 末稿立撤：同径新稿落地即审，旧稿之案全数换下（先瑕今净只留已磨注记）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/xiuzhang.js'
import { renderXiapai } from '../core/xiapai.js'

export const name = 'zhixia'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 结果侧正文块的文本拼接（稿面之文来源；非文本块忽略）。 */
function textOf(result) {
  const blocks = result?.content
  if (!Array.isArray(blocks)) return null
  const text = blocks
    .map((b) => (b && typeof b === 'object' && typeof b.text === 'string' ? b.text : ''))
    .join('\n')
  return text.length > 0 ? text : null
}

/**
 * 指瑕服务：瑕账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.zhixia.report()` / `ctx.zhixia.ledger()` / `ctx.zhixia.paizi()` /
 * `ctx.zhixia.gate()` / `ctx.zhixia.exportStream()`。
 */
export class ZhixiaService extends Service {
  constructor(ctx, config) {
    super(ctx, 'zhixia')
    this.sessionId = config?.sessionId ?? 'zhixia-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、受审径、瑕值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, paths: res.paths, rows: res.rows },
      counts: res.counts,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
    }
  }

  /** 案账全文：逐案逐注记（径:行:案别 与断言数据、指纹），判定细节离线对账可验。 */
  ledger() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      cases: res.cases,
      notes: res.notes,
      score: res.score,
      band: res.band,
      counts: res.counts,
      issues: res.issues,
    }
  }

  /** 瑕牌块：瑕册公示 + 词法公示 + 案账清点（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderXiapai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即瑕值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 与结果正文原样随流携带），供 `zhixia audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.engine.calls.forEach((rec, i) => {
      const id = rec.ref ?? `m${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: undefined })
      const result = { type: 'tool_result', id, name: rec.name, args: rec.args, isError: rec.isError === true, at: undefined }
      if (rec.content) result.content = rec.content
      out.push(result)
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null }

  class WiredZhixiaService extends ZhixiaService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredZhixiaService, config)

  // ---- 结果结算后：稿面唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'zhixia-session',
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
        content: textOf(result),
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { zhixia: ZhixiaService }
// }
