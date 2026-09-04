/**
 * 治未病 · Weibing —— DeepSeek Harness 的开工体检插件（Cordis 插件层）。
 *
 * 与先例的姿态边界（结构性，不是纪律性）：
 *   zhizhi 在执行前拦动作，jiebi 在结果接缝观察判断账本，
 *   zhengnian 在结果接缝度量并供给拂拭，buer 把事故过账记习；
 *   weibing 零监听——本文件里没有任何事件监听器，不参与任何接缝，
 *   只在 t=0 被问时出诊：ctx.weibing.exam() / ctx.weibing.prescribe()。
 *
 * 新能力类型：诊断式插件。拦 / 审 / 供给 / 记习之外，插件可以只出诊——
 * 诊而不拦：门禁只是退出码与分带，物理上没有任何拦截能力，拦不拦由宿主/CI 决定。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程；
 *   - 无契约不出诊：charter 没立时 exam 诚实沉默（{valid:false,error:'no-charter'}）；
 *   - 诊断绝不反噬：exam 内部任何异常都吞掉并返回 {valid:false}。
 */

import { Service } from '@deepseek-ai/cordis'
import { validateCharter } from '../core/charter.js'
import { runExam, GATE_DEFAULT } from '../core/exam.js'
import { renderPrescribe } from '../core/prescribe.js'

export const name = 'weibing'

/**
 * 治未病服务：把体检能力暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.weibing.exam()` / `ctx.weibing.prescribe()` /
 * `ctx.weibing.setCharter()` / `ctx.weibing.report()`。
 */
export class WeibingService extends Service {
  constructor(ctx, config = {}) {
    super(ctx, 'weibing')
    this.config = config
    this.charter = config.charter ?? null
  }

  /** 立任务书 / 换任务书。数据问题不抛错（valid:false + issues）。 */
  setCharter(charter) {
    const v = validateCharter(charter)
    if (v.valid) this.charter = charter
    return v
  }

  /** 就绪状态：立没立 charter、门阈多少。 */
  report() {
    return {
      charterInstalled: this.charter !== null,
      charterId: this.charter?.id ?? null,
      gate: this.config.gate ?? GATE_DEFAULT,
      zeroListener: true,
    }
  }

  /**
   * 四诊体检。opts: { cwd, gate, lexicon }；config 里可带默认值。
   * 无 charter 时诚实沉默；任何内部异常吞掉并返回 { valid:false }。
   */
  exam(opts = {}) {
    if (!this.charter) return { valid: false, error: 'no-charter' }
    try {
      return runExam(this.charter, {
        cwd: opts.cwd ?? this.config.cwd ?? null,
        gate: opts.gate ?? this.config.gate ?? GATE_DEFAULT,
        lexicon: opts.lexicon ?? this.config.lexicon ?? null,
      })
    } catch {
      return { valid: false, error: 'exam-failed' }
    }
  }

  /** 医嘱块：逐字节确定的供给物。无 charter 时 { valid:false, error:'no-charter' }。 */
  prescribe(opts = {}) {
    if (!this.charter) return { valid: false, error: 'no-charter' }
    try {
      const exam = this.exam(opts)
      return { valid: true, text: renderPrescribe(this.charter, exam) }
    } catch {
      return { valid: false, error: 'prescribe-failed' }
    }
  }
}

export function apply(ctx, config = {}) {
  // weibing 不监听任何事件（结构性零监听），也不注入任何子服务——
  // 因此无需 zhengnian 式的闭包旁路：没有等待环，因为不存在等待。
  ctx.plugin(WeibingService, config)
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { weibing: WeibingService }
// }
