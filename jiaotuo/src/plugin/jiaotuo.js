/**
 * 矫托 · Jiaotuo —— DeepSeek Harness 的伪据虚引治理插件（Cordis 插件层）。
 *
 * 与既立各层的方向边界（结构性，不是纪律性）见 docs/03 §10——
 * 论世审输入侧的冒充（数据冒充主命），本层审输出侧的冒充（agent 冒充
 * 文书给世界立据）——一进一出互为镜像；知行审真章不被守，本层审假章
 * 被发明；交接之状对自流作工，本层之引对所托原文——一状一引，谓词正交。
 *
 *   tools/result       emit    观察托面入引账、文书正文入诏账（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：矫托式插件（第三十九个）。「矫者，托也」——它不假装能读懂
 * 「这次引用的动机善恶」（语义判断是禁区），它的职责是让落卷之引的每一笔
 * 伪托当众留痕：引语在不在原文里、改写式词元过没过半、所托文书有没有本
 * ——三问皆词面可证；免案授权归任务方的诏册明言，托主/阙据/泛引注记不判
 * ——账本只治「自称原文而原文查无」的矫引。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 诏册持久化归 CLI（register/revoke），插件只吃注入的 book 对象；
 *   - 单会话视图的案与值只采本会话（跨会话之归并归离线合并审计）；
 *   - 诏账先判后录：write 笔的引案用更新前的诏账判，本笔随后才入诏账（不以本笔自证）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/yinzhang.js'
import { renderJiaopai } from '../core/jiaopai.js'

export const name = 'jiaotuo'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 结果侧正文块的文本拼接（诏账与命令之文来源；非文本块忽略）。 */
function textOf(result) {
  const blocks = result?.content
  if (!Array.isArray(blocks)) return null
  const text = blocks
    .map((b) => (b && typeof b === 'object' && typeof b.text === 'string' ? b.text : ''))
    .join('\n')
  return text.length > 0 ? text : null
}

/**
 * 矫托服务：引账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.jiaotuo.report()` / `ctx.jiaotuo.ledger()` / `ctx.jiaotuo.paizi()` /
 * `ctx.jiaotuo.gate()` / `ctx.jiaotuo.exportStream()`。
 */
export class JiaotuoService extends Service {
  constructor(ctx, config) {
    super(ctx, 'jiaotuo')
    this.sessionId = config?.sessionId ?? 'jiaotuo-session'
    this.book = config?.book ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.engine = createEngine({ book: this.book })
  }

  /** 汇总：观察数、受审径、矫值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, paths: res.paths, rows: res.rows, execs: res.execs },
      counts: res.counts,
      score: res.score,
      band: res.band,
      gate: res.gate,
      verdict: res.verdict,
      ok: res.ok,
    }
  }

  /** 案账全文：逐案逐注记（径:行:案别 与托径指纹），判定细节离线对账可验。 */
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

  /** 矫牌块：诏册公示 + 引形公示 + 案账清点（逐字节确定；无册出确定性文本）。 */
  paizi() {
    return {
      valid: true,
      text: renderJiaopai(this.book, judge(this.engine, { gate: this.gateValue })),
    }
  }

  /** 门禁裁决：即矫值对门。 */
  gate() {
    const res = judge(this.engine, { gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 与结果正文原样随流携带），供 `jiaotuo audit` 离线重放对账。 */
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

  class WiredJiaotuoService extends JiaotuoService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredJiaotuoService, config)

  // ---- 结果结算后：托面与诏账唯一写入口 -----------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'jiaotuo-session',
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
//   interface Context { jiaotuo: JiaotuoService }
// }
