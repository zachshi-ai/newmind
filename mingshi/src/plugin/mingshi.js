/**
 * 名实 · Mingshi —— DeepSeek Harness 的核名插件（Cordis 插件层）。
 *
 * 与前十八层的方向边界（结构性，不是纪律性）：
 *   zhizhi 在 tools/pre-execute 拦动作（手），jiebi 审判断账本（眼），zhengnian 守本愿（心），
 *   weibing 在 t=0 诊任务书（工），jiubian 勘势途（足），licheng 追承诺（诺），
 *   youya 守会话内记忆（薪），lunshi 审输入渠道权威（言），dingfen 定并发写域（封），
 *   buer 记跨会话教训（习），baihe 守信息出境（口），fayi 审验收尺自污染（尺），
 *   zhibi 保失败记录直笔（笔），yuli 审不可逆行前备（备），duzhi 量资源总量（量），
 *   erbing 审人机权柄（柄），zhongshi 记任务项终始（程），xiaoyan 称成功输出之实（效）；
 *   名实管「写下的名有没有实」：实册（声明）→ 名账（提名）→ 核名（对账）→ 门禁（裁决）。
 *
 *   tools/result       emit    观察写与执行事件，名账步进（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：核名式插件。名实不假装能区分「真包」与「抢注的幻包」（那是注册表的
 * 职责），它的职责是让每个册外之名必须留痕——账实对账由离线 `mingshi audit` 重放。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；
 *   - 结构性零拦截：源码里不存在 pre-execute 监听器，观察永不反噬（异常吞掉，管道照常）；
 *   - 实册持久化归 CLI（register/revoke），插件只吃注入的 registry 对象；
 *   - 单会话视图的生实只采本会话（跨会话之实归离线合并审计）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine, recordCall, judge, GATE_DEFAULT } from '../core/he.js'
import { renderMingce } from '../core/mingce.js'

export const name = 'mingshi'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 名实服务：名账与判词暴露给同仓的其他插件 / 宿主 / UI。
 * 可用 `ctx.mingshi.report()` / `ctx.mingshi.mingzhang()` / `ctx.mingshi.mingce()` /
 * `ctx.mingshi.gate()` / `ctx.mingshi.exportStream()`。
 */
export class MingshiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'mingshi')
    this.engine = createEngine()
    this.sessionId = config?.sessionId ?? 'mingshi-session'
    this.registry = config?.registry ?? null
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.now = typeof config?.now === 'function' ? config.now : Date.now // 时钟注入口：测试用确定性时钟
  }

  /** 汇总：观察数、写账数、提名数、即名值与分带（单会话视图）。 */
  report() {
    const res = judge(this.engine, { registry: this.registry, gate: this.gateValue })
    return {
      session: this.sessionId,
      totals: { callsObserved: this.engine.calls.length, writes: this.engine.writes.length, installs: this.engine.installs.length },
      score: res.score,
      band: res.band,
      gate: res.gate,
      counts: res.counts,
    }
  }

  /** 名账全文：逐名逐装（会话、对象、案由），判定细节离线对账可验。 */
  mingzhang() {
    const res = judge(this.engine, { registry: this.registry, gate: this.gateValue })
    return {
      session: this.sessionId,
      imports: res.imports,
      installs: this.engine.installs.map((i) => ({ session: i.session, pkg: i.pkg, ok: i.ok })),
      score: res.score,
      band: res.band,
      counts: res.counts,
      issues: res.issues,
    }
  }

  /** 名册块：实册公示（逐字节确定；无实册时出确定性空籍文本）。 */
  mingce() {
    const res = judge(this.engine, { registry: this.registry, gate: this.gateValue })
    return {
      valid: true,
      text: renderMingce(this.registry, {
        ghostPackages: res.counts.ghostPackages,
        ghostRelatives: res.counts.ghostRelatives,
        strayInstalls: res.counts.strayInstalls,
        trialInstalls: res.counts.trialInstalls,
        exemptImports: res.counts.exemptImports,
      }),
    }
  }

  /** 门禁裁决：即名值对门。 */
  gate() {
    const res = judge(this.engine, { registry: this.registry, gate: this.gateValue })
    return { score: res.score.total, gate: res.gate, verdict: res.verdict, ok: res.ok, band: res.band }
  }

  /** 导出会话流（call/result 成对，args 原样——内容证据随流携带），供 `mingshi audit` 离线重放对账。 */
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

  class WiredMingshiService extends MingshiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
      ref.now = this.now
    }
  }
  ctx.plugin(WiredMingshiService, config)

  // ---- 结果结算后：名账唯一写入口 -----------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      recordCall(engine, {
        session: config.sessionId ?? 'mingshi-session',
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
//   interface Context { mingshi: MingshiService }
// }
