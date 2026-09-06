/**
 * 稽疑 · Jiyi —— DeepSeek Harness 的稽问插件（Cordis 插件层）。
 *
 * 与前十九层的方向边界（结构性，不是纪律性）：
 *   zhizhi 在 tools/pre-execute 拦动作（手），jiebi 审判断账本（眼），zhengnian 守本愿（心），
 *   weibing 在 t=0 诊任务书（工），jiubian 勘势途（足），licheng 追承诺（诺），
 *   youya 守会话内记忆（薪），lunshi 审输入渠道权威（言），dingfen 定并发写域（封），
 *   buer 记跨会话教训（习），baihe 守信息出境（口），fayi 审验收尺自污染（尺），
 *   zhibi 保失败记录直笔（笔），yuli 审不可逆行前备（备），duzhi 量资源总量（量），
 *   erbing 审人机权柄（柄），zhongshi 记任务项终始（程），xiaoyan 称成功输出之实（效），
 *   mingshi 核写下的名有没有实（名）；
 *   稽疑管「首动之前问没问」：疑册（声明）→ 问凭据（豁免之形）→ 问账（对账）→ 门禁（裁决）。
 *
 *   tools/result       emit    观察调用事件，问账步进（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：稽问式插件。稽疑不假装能知道 Agent 心里有没有疑（那要语义），它的职责是
 * 让「首动之前问没问」成为流内可审的形——账实对账由离线 `jiyi audit` 重放。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 疑册持久化归 CLI（register/revoke），插件只吃注入的 askfile 对象；
 *   - 单会话视图的问凭据只采本会话（跨会话之问归离线合并审计）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/ji.js'
import { renderJice } from '../core/jice.js'

export const name = 'jiyi'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 稽疑服务：问账与稽块暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.jiyi.report()` / `ctx.jiyi.wenzhang()` / `ctx.jiyi.jice()` /
 * `ctx.jiyi.gate()` / `ctx.jiyi.exportStream()`。
 */
export class JiyiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'jiyi')
    this.engine = createEngine()
    this.sessionId = config?.sessionId ?? 'jiyi-session'
    this.askfile = config?.askfile ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.now = typeof config?.now === 'function' ? config.now : Date.now // 时钟注入口：测试用确定性时钟
  }

  /** 汇总：观察数、触发数、谋值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { askfile: this.askfile, gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length },
      score: res.score,
      band: res.band,
      gate: res.gate,
      counts: res.counts,
    }
  }

  /** 问账全文：逐疑条案别（谋及/空疑/迟问/独谋/未见），判定细节离线对账可验。 */
  wenzhang() {
    const res = judge(this.engine, { askfile: this.askfile, gate: this.gateValue })
    return {
      session: this.sessionId,
      asks: res.asks,
      score: res.score,
      band: res.band,
      counts: res.counts,
      issues: res.issues,
    }
  }

  /** 稽块：疑册公示与问况（逐字节确定；无册时出确定性空籍文本）。 */
  jice() {
    const res = judge(this.engine, { askfile: this.askfile, gate: this.gateValue })
    return {
      valid: true,
      text: renderJice(this.askfile, {
        fulfilled: res.counts.fulfilled,
        emptyAsk: res.counts.emptyAsk,
        late: res.counts.late,
        blind: res.counts.blind,
        unseen: res.counts.unseen,
        total: res.score.total,
        band: res.band,
      }),
    }
  }

  /** 门禁裁决：谋值对门。 */
  gate() {
    const res = judge(this.engine, { askfile: this.askfile, gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 原样），供 `jiyi audit` 离线重放对账。 */
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
        at: rec.at ?? undefined,
      })
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同仓惯例：避免"注入自己提供的子服务"形成等待环）。
  const ref = { engine: null, now: null }

  class WiredJiyiService extends JiyiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
      ref.now = this.now
    }
  }
  ctx.plugin(WiredJiyiService, config)

  // ---- 结果结算后：问账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'jiyi-session',
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
        at: ref.now ? ref.now() : Date.now(),
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { jiyi: JiyiService }
// }
