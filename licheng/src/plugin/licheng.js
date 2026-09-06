/**
 * 立诚 · Licheng —— DeepSeek Harness 的承诺信用插件（Cordis 插件层）。
 *
 * 与先例的姿态边界（结构性，不是纪律性）：
 *   zhizhi 在动作发出前拦截，jiebi 在结果接缝观察判断账本，zhengnian
 *   度量意图在场并供给拂拭，buer 把事故过账记习，weibing 零监听只出诊；
 *   licheng 结绳——在结果接缝观察真实执行，维持一张在途绳账，
 *   宿主随叫随结。本文件只有 tools/result 一个监听器；执行前的拦截
 *   接缝上没有本插件的任何存在，想拦一个调用也做不到。
 *
 * 新能力类型：结绳式插件。拦 / 审 / 供给 / 记习 / 诊断之外，
 * 插件可以为"自己说出口的话"记账：诺言立结、兑现对账、改诺免咎、
 * 悬结记咎——账实对账由核心引擎完成，观察照旧永不反噬。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程；
 *   - 记账动作的数据问题不抛错（valid:false + issues）；
 *   - 结账不反噬：settle/block 内部异常吞掉并返回 { valid:false }。
 */

import { Service } from '@deepseek-ai/cordis'
import { validateEntryShape, openIdsOf } from '../core/ledger.js'
import { settleLedger, GATE_DEFAULT } from '../core/settle.js'
import { renderBlock } from '../core/block.js'

export const name = 'licheng'

/**
 * 立诚服务：绳账与结账能力暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.licheng.make()` / `revise()` / `abandon()` /
 * `declare()` / `settle()` / `block()` / `exportCalls()` / `report()`。
 */
export class LichengService extends Service {
  constructor(ctx, config = {}) {
    super(ctx, 'licheng')
    this.config = config
    this.entries = [] // 绳账条目（内存账，账序即入账序）
    this.calls = [] // 观察到的调用（结果接缝唯一写入口）
  }

  gate() {
    return Number.isInteger(this.config.gate) && this.config.gate >= 0
      ? this.config.gate
      : GATE_DEFAULT
  }

  /** 就绪状态：账上几条、几个开结、门阈多少、结构性零拦截。 */
  report() {
    return {
      ledgerSize: this.entries.length,
      openKnots: openIdsOf(this.entries).open.size,
      gate: this.gate(),
      zeroIntercept: true,
    }
  }

  /** 形状 + 账序状态双校验；通过则入账。数据问题不抛错。 */
  record(kind, entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { valid: false, issues: ['条目必须是对象'] }
    }
    if (entry.type !== undefined && entry.type !== kind) {
      return { valid: false, issues: [`type 与方法不符: ${entry.type} ≠ ${kind}`] }
    }
    const e = { ...entry, type: kind }
    const shape = validateEntryShape(e)
    if (!shape.valid) return shape
    const { open, seen } = openIdsOf(this.entries)
    if (kind === 'promise' || kind === 'revise') {
      if (seen.has(e.id)) return { valid: false, issues: [`id 重复: ${e.id}`] }
    }
    if (kind === 'revise' || kind === 'abandon' || kind === 'discharge') {
      const target = kind === 'discharge' ? e.settles : e.supersedes
      if (!open.has(target)) {
        const why = seen.has(target) ? '已关闭' : '不存在'
        return { valid: false, issues: [`${kind === 'discharge' ? 'settles' : 'supersedes'} 指向${why}的结: ${target}`] }
      }
    }
    this.entries.push(e)
    return { valid: true, issues: [] }
  }

  /** 立结。entry: { id, what, discharge? }（type 由方法名给定）。 */
  make(entry) {
    return this.record('promise', entry)
  }

  /** 改结。entry: { id, supersedes, reason, what?, discharge? }；旧结合法关闭。 */
  revise(entry) {
    return this.record('revise', entry)
  }

  /** 解约。abandon('p-001', '理由')——结目 id 由目标派生（p-001-a）。 */
  abandon(id, reason) {
    return this.record('abandon', { id: `${id}-a`, supersedes: id, reason })
  }

  /** 兑现宣告（补悔路径）。宣告的凭据同样要对账，口头兑现解不开结。 */
  declare(settles, discharge) {
    return this.record('discharge', { settles, discharge })
  }

  /**
   * 结账：绳账 × 观察到的调用 → 报告（咎值 / 分带 / 悬结）。
   * 运行时与离线 CLI 共用同一核心引擎，账实天然对得上。
   */
  settle(opts = {}) {
    try {
      return settleLedger(this.entries, this.calls, {
        gate: opts.gate ?? this.gate(),
        speech: [],
      })
    } catch {
      return { valid: false, error: 'settle-failed' }
    }
  }

  /** 结账块：逐字节确定的供给物，供宿主在收尾接缝注入上下文。 */
  block(opts = {}) {
    try {
      return { valid: true, text: renderBlock(this.settle(opts)) }
    } catch {
      return { valid: false, error: 'block-failed' }
    }
  }

  /** 导出观察到的调用流（账实对账：供离线引擎独立复算）。 */
  exportCalls() {
    return structuredClone(this.calls)
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同 jiebi/zhengnian：避免"注入自己
  // 提供的子服务"形成等待环——闭包是最诚实的通路）。
  const ref = { service: null }

  class WiredLichengService extends LichengService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.service = this
    }
  }
  ctx.plugin(WiredLichengService, config)

  // ---- 结果结算后：调用的唯一写入口 ---------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      ref.service?.calls.push({
        name: exec.name,
        args: exec.arguments,
        isError: result?.isError === true,
        at: Date.now(),
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { licheng: LichengService }
// }
