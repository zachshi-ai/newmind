/**
 * 效验 · Xiaoyan —— DeepSeek Harness 的成色审计插件（Cordis 插件层）。
 *
 * 与十七层的方向边界（结构性，不是纪律性）：
 *   zhizhi 在 tools/pre-execute 拦动作（手），jiebi 审判断账本（眼），zhengnian 守本愿并
 *   供给上下文（心），buer 记跨会话事故（习），weibing 在 t=0 诊任务书（工），licheng
 *   结承诺之绳（信），youya 巡会话之忆（记），jiubian 在 tools/result 勘势途（足），
 *   lunshi 审输入渠道权威（界），dingfen 裁跨会话写域（分），baihe 称量出境之物（阖），
 *   fayi 持验收之尺（尺），zhibi 秉记录之笔（笔），yuli 备行前退路（备），duzhi 记总量
 *   花销（支），erbing 审须柄授命（柄），zhongshi 记任务项终始（终）；
 *   效验审的是**成功信号自身的证据含量**（实）——事莫明于有效，论莫定于有证：
 *   尺直笔直而实空的绿，只有效验称得出「空言虚语」。
 *
 *   tools/result       emit    登记成报（name/args/isError/content），唯一写入口
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：称实式插件。拦/审/供给/记取/诊断/结绳/巡忆/勘流/守权界/封界/守境/
 *   持尺/秉笔/行前定/度支/审柄/行程之后，效验证明插件可以**称实**：给每声「成功」
 *   过三问（有实乎/所验乎/先例乎），合成效值，并在接缝处供给**证块**（逐字节确定）。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络；
 *   - 契约无关：不需要任何开工契约，挂上即记账——对历史会话同样可离线验尸；
 *   - 失败永不入账：isError=true 是九变的地盘；成败未知（isError 缺失）同样不入账；
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import { normalizeWords } from '../core/words.js'
import { computeAccount, GATE_DEFAULT } from '../core/xiao.js'
import { renderZheng } from '../core/zheng.js'

export const name = 'xiaoyan'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 从工具结果中提取 content 文本（防御式：content 块数组 / 字符串 / 顶层 text）。空串保留——空是本层的判定原料。 */
function extractText(result) {
  const c = result?.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c
      .map((b) => (b && typeof b?.text === 'string' ? b.text : ''))
      .filter((s) => s.length > 0)
      .join('\n')
  }
  if (typeof result?.text === 'string') return result.text
  return undefined
}

/**
 * 效验服务：效账与证块暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.xiaoyan.exempt()` / `ctx.xiaoyan.report()` /
 * `ctx.xiaoyan.xiaozhang()` / `ctx.xiaoyan.zheng()` / `ctx.xiaoyan.gate()` / `ctx.xiaoyan.exportStream()`。
 */
export class XiaoyanService extends Service {
  constructor(ctx, config) {
    super(ctx, 'xiaoyan')
    this.raw = { calls: [], pos: 0, principalBlocks: 0 }
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.extraWords = normalizeWords(config?.words)
    this.extraExempt = normalizeWords(config?.exempt)
    this.renderCount = 0
  }

  /** 免验词入账：运行中可持续声明（设计上静默的检查由使用方显式豁免）。 */
  exempt(words) {
    this.extraExempt = [...new Set([...this.extraExempt, ...normalizeWords(words)])]
    return this
  }

  /** 对账：与 CLI 共用同一 computeAccount 纯函数——账实对账由构造保证。 */
  account() {
    return computeAccount(
      { principalBlocks: this.raw.principalBlocks, calls: this.raw.calls },
      { words: this.extraWords, exempt: this.extraExempt, gate: this.gateValue }
    )
  }

  /** 汇总：观察数、成报、效类、免验、四发现、即时效值与分带。 */
  report() {
    const acc = this.account()
    return {
      totals: {
        callsObserved: acc.calls,
        successes: acc.counts.successes,
        verified: acc.counts.verified,
        exempted: acc.counts.exempted,
        vacuous: acc.counts.vacuous,
        echo: acc.counts.echo,
        stray: acc.counts.stray,
        stale: acc.counts.stale,
      },
      score: acc.score,
      band: acc.band,
      gate: this.gateValue,
    }
  }

  /** 效账全文：逐件三问判定与发现（干净成报不出现在 events 里）。 */
  xiaozhang() {
    const acc = this.account()
    return {
      events: acc.events,
      issues: acc.issues,
      score: acc.score,
      band: acc.band,
    }
  }

  /** 证块：逐字节确定的成色清单（#k 随渲染递增）。 */
  zheng() {
    this.renderCount++
    const acc = this.account()
    return {
      text: renderZheng(acc, this.renderCount),
      k: this.renderCount,
      vacuous: acc.counts.vacuous,
      echo: acc.counts.echo,
      stray: acc.counts.stray,
      stale: acc.counts.stale,
    }
  }

  /** 门禁裁决：即时效值对门。 */
  gate() {
    const acc = this.account()
    return {
      score: acc.score.total,
      vacuity: acc.score.vacuity,
      echo: acc.score.echo,
      gate: this.gateValue,
      verdict: acc.ok ? 'pass' : 'fail',
      ok: acc.ok,
    }
  }

  /** 导出会话流（call/result 成对，含 isError 与 content），供 `xiaoyan audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.raw.calls.forEach((rec) => {
      const id = rec.ref ?? `x${rec.seq}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: rec.at ?? undefined })
      const result = { type: 'tool_result', id, name: rec.name, args: rec.args, isError: rec.isError, at: rec.at ?? undefined }
      if (typeof rec.content === 'string') result.content = rec.content
      out.push(result)
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同 lunshi：避免「注入自己提供的子服务」形成等待环）。
  const ref = { service: null }

  class WiredXiaoyanService extends XiaoyanService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.service = this
    }
  }
  ctx.plugin(WiredXiaoyanService, config)

  // ---- 结果结算后：效账唯一写入口 -----------------------------------------
  // 成报逐件登记（isError 与 content 原样保留——空串与缺失是本层的判定原料）。
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const service = ref.service
      if (!service) return
      service.raw.calls.push({
        seq: service.raw.calls.length + 1,
        pos: service.raw.pos++,
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: typeof result?.isError === 'boolean' ? result.isError : null,
        content: extractText(result),
        at: Date.now(),
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { xiaoyan: XiaoyanService }
// }
