/**
 * 论世 · Lunshi —— DeepSeek Harness 的渠道权界插件（Cordis 插件层）。
 *
 * 与前八层的方向边界（结构性，不是纪律性）：
 *   zhizhi 在 tools/pre-execute 拦动作（手），jiebi 审判断账本（眼），zhengnian 守本愿并
 *   供给上下文（心），buer 记跨会话事故（习），weibing 在 t=0 诊任务书（工），
 *   licheng 结承诺之绳（信），youya 巡会话之忆（记），jiubian 在 tools/result 勘势途（足）；
 *   论世审的是**内容的来源与其行使的权力**（权界）——物不僭主：读其书，先论其世。
 *
 *   tools/result       emit    登记己（exec.arguments）与物（result.content），唯一写入口
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：权界式插件。拦/审/供给/记取/诊断/结绳/巡忆/勘流之后，论世证明插件可以
 *   **守权界**：给每块内容打世牌（主/己/物），检出数据渠道里的涉命块，对账参数僭行，
 *   并在接缝处供给**诫块**（逐字节确定的权界清单，注入与否由宿主决定）。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络；
 *   - 契约无关：不需要任何开工契约，挂上即记账——对历史会话同样可离线验尸；
 *   - 主渠道永不审：论世不判断主命对错，只回答「非主来源的内容有没有行使主的权力」；
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import { normalizeWords } from '../core/words.js'
import { computeAccount, GATE_DEFAULT } from '../core/qudao.js'
import { renderGao } from '../core/gao.js'

export const name = 'lunshi'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/** 从工具结果中提取物渠道文本（防御式：content 块数组 / 字符串 / 顶层 text）。 */
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
  return ''
}

/**
 * 论世服务：渠道账与诫块暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.lunshi.declare()` / `ctx.lunshi.report()` /
 * `ctx.lunshi.qudao()` / `ctx.lunshi.gao()` / `ctx.lunshi.gate()` / `ctx.lunshi.exportStream()`。
 */
export class LunshiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'lunshi')
    this.raw = { principalTexts: [], calls: [], dataBlocks: [], pos: 0 }
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.words = normalizeWords(config?.words)
    this.renderCount = 0
    if (typeof config?.principal === 'string' && config.principal) {
      this.declare(config.principal)
    }
  }

  /** 主渠道入账：declare 的文本拥有发令资格（承判定的依据）。可多次调用。 */
  declare(text) {
    if (typeof text === 'string' && text.length > 0) {
      this.raw.principalTexts.push(text)
    }
    return this
  }

  get principalText() {
    return this.raw.principalTexts.join('\n')
  }

  /** 对账：与 CLI 共用同一 computeAccount 纯函数——账实对账由构造保证。 */
  account() {
    return computeAccount(
      {
        principalText: this.principalText,
        principalBlocks: this.raw.principalTexts.length,
        calls: this.raw.calls,
        dataBlocks: this.raw.dataBlocks,
      },
      this.words
    )
  }

  /** 汇总：观察数、涉命、僭行、即时越权值与分带。 */
  report() {
    const acc = this.account()
    return {
      totals: {
        callsObserved: acc.counts.calls,
        dataObserved: acc.counts.dataObserved,
        tainted: acc.counts.tainted,
        authorized: acc.authorized,
        usurped: acc.counts.usurped,
      },
      score: acc.score,
      band: acc.band,
      gate: this.gateValue,
    }
  }

  /** 渠道账全文：逐物块裁决与逐僭行（未涉命者 taintWords 为空）。 */
  qudao() {
    const acc = this.account()
    return {
      blocks: acc.blockRows.map((b) => ({
        blockNo: b.blockNo,
        ref: b.ref,
        tool: b.tool,
        words: b.hits,
        taintWords: b.taintWords,
        authorized: b.authorized,
      })),
      usurpRows: acc.usurpRows,
      score: acc.score,
      band: acc.band,
    }
  }

  /** 诫块：逐字节确定的权界清单（#k 随渲染递增）。 */
  gao() {
    this.renderCount++
    const acc = this.account()
    return {
      valid: true,
      k: this.renderCount,
      text: renderGao(acc, this.renderCount),
      tainted: acc.counts.tainted,
      usurped: acc.counts.usurped,
    }
  }

  /** 门禁裁决：即时越权值对门。 */
  gate() {
    const acc = this.account()
    const ok = acc.score.total < this.gateValue
    return {
      score: acc.score.total,
      taint: acc.score.taint,
      usurp: acc.score.usurp,
      gate: this.gateValue,
      verdict: ok ? 'pass' : 'fail',
      ok,
    }
  }

  /** 导出会话流（principal + call/result 成对，含 content），供 `lunshi audit` 离线重放对账。 */
  exportStream() {
    const out = this.raw.principalTexts.map((text) => ({ type: 'principal', text }))
    this.raw.calls.forEach((rec, i) => {
      const id = rec.ref ?? `l${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: rec.at ?? undefined })
      out.push({
        type: 'tool_result',
        id,
        name: rec.name,
        args: rec.args,
        isError: rec.isError,
        content: rec.content,
        at: rec.at ?? undefined,
      })
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同 zhizhi / jiebi / zhengnian / jiubian：避免
  // "注入自己提供的子服务"形成等待环——闭包是最诚实的通路）。
  const ref = { service: null }

  class WiredLunshiService extends LunshiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.service = this
    }
  }
  ctx.plugin(WiredLunshiService, config)

  // ---- 结果结算后：渠道账唯一写入口 -----------------------------------------
  // 先登记己（调用参数），再登记物（结果内容）——同一次结果事件里，调用先于
  // 它自己带回来的内容（pos 序），天然不构成本块的僭行。
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const service = ref.service
      if (!service) return
      const callRec = {
        seq: service.raw.calls.length + 1,
        pos: service.raw.pos++,
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
        content: undefined,
        at: Date.now(),
      }
      service.raw.calls.push(callRec)
      const content = extractText(result)
      if (content.length > 0) {
        callRec.content = content
        service.raw.dataBlocks.push({
          blockNo: service.raw.dataBlocks.length + 1,
          pos: service.raw.pos++,
          ref: exec.callId ?? null,
          tool: exec.name,
          content,
          at: Date.now(),
        })
      }
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { lunshi: LunshiService }
// }
