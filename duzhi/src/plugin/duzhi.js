/**
 * 度支 · Duzhi —— DeepSeek Harness 的量纲治理插件（Cordis 插件层）。
 *
 * 与前各层的方向边界（结构性，不是纪律性，见 docs/03-design.md §10）：
 *   知止拦动作，解蔽审判断，正念守本愿，治未病诊开工，九变勘应变，有涯巡见闻，
 *   论世审输入权威，并发写域与跨会话教训另有其主，立诚结言约之账，捭阖守出境，
 *   验收器之脏净与行前退路亦另有其主；度支审**总量**——这一任花掉的调用与时程，
 *   有没有越过任务方立的线（或从未立线这件事本身）。闸与账分治：闸是知止的地盘。
 *
 *   tools/result       emit    观察结算，用账步进一格（唯一写入口）
 *   （无 pre-execute）          —— 零拦截是结构性的；动作之闸不是本层地盘
 *
 * 新能力类型：度支式（计账式）插件。在先各层证明了拦/审/供给/记取/诊断/勘流/
 * 巡忆/权界/封界/守境/秉笔/行前进退之后，度支证明插件可以**计账**：对总量逐案对账，
 * 在接缝处供给**余量块**（蓄支图，逐字节确定，注入与否由宿主决定）——运行中的
 * Agent 第一次能看见「还剩多少」。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络、零子进程；
 *   - 契约无关：不需要任何开工契约，挂上即审——对历史会话同样可离线验尸；
 *   - 无制要明说：一条线都没有时制值 40、带「非」——治理发现，不是诬告；
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import {
  createLedger,
  step,
  liveScore,
  GATE_DEFAULT,
} from '../core/ledger.js'
import { validateRegister, validateCaps, resolveCaps } from '../core/register.js'
import { renderYuliang } from '../core/block.js'

export const name = 'duzhi'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 度支服务：用账与余量块暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.duzhi.report()` / `ctx.duzhi.ledger()` /
 * `ctx.duzhi.yuliang()` / `ctx.duzhi.gate()` / `ctx.duzhi.setBudget()` /
 * `ctx.duzhi.exportStream()`。
 */
export class DuzhiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'duzhi')
    const reg = config?.register ?? null
    this.registerIssues = []
    if (reg != null) {
      const looksLikeFile = reg.version !== undefined || reg.budget !== undefined
      const v = looksLikeFile ? validateRegister(reg) : { valid: true, issues: [] }
      if (!v.valid) this.registerIssues = v.issues
      const capCheck = validateCaps({ maxCalls: reg.maxCalls, maxMinutes: reg.maxMinutes })
      if (!capCheck.valid) this.registerIssues = [...this.registerIssues, ...capCheck.issues]
    }
    const flagCheck = validateCaps({ maxCalls: config?.maxCalls, maxMinutes: config?.maxMinutes })
    if (!flagCheck.valid) this.registerIssues = [...this.registerIssues, ...flagCheck.issues]

    const { caps, id } = resolveCaps({
      register: reg,
      maxCalls: config?.maxCalls,
      maxMinutes: config?.maxMinutes,
      id: config?.id,
    })
    this.gateValue = Number.isFinite(config?.gate) ? config.gate : GATE_DEFAULT
    this.led = createLedger({ caps, id, gate: this.gateValue })
  }

  /** 汇总：观察数、逾案数、即时制值与分带（册有问题随报告明说）。 */
  report() {
    const live = liveScore(this.led)
    return {
      totals: live.counts,
      score: live.score,
      band: live.band,
      gate: this.gateValue,
      id: live.id,
      caps: live.caps,
      registerIssues: this.registerIssues,
    }
  }

  /** 用账全目：逐案逾案（序号/引用/时刻/经由）。 */
  ledger() {
    const live = liveScore(this.led)
    return {
      overCases: live.overCases,
      score: live.score,
      band: live.band,
      counts: live.counts,
    }
  }

  /** 余量块：逐字节确定的蓄支图（#k 随渲染递增）。 */
  yuliang() {
    this.led.renderCount++
    return {
      valid: true,
      k: this.led.renderCount,
      text: renderYuliang(this.led, this.led.renderCount),
    }
  }

  /** 门禁裁决：即时制值对门。 */
  gate() {
    const live = liveScore(this.led)
    const ok = live.score.total < this.gateValue
    return {
      score: live.score.total,
      overCalls: live.counts.overCalls,
      wuzhi: live.counts.wuzhi,
      gate: this.gateValue,
      verdict: ok ? 'pass' : 'fail',
      ok,
    }
  }

  /** 立/换册（换册＝新账）。数据问题不抛错（valid:false + issues）。 */
  setBudget(register) {
    const v = validateRegister(register)
    if (!v.valid) return { valid: false, issues: v.issues }
    this.registerIssues = []
    this.led = createLedger({
      caps: { ...register.budget },
      id: register.id,
      gate: this.gateValue,
    })
    return { valid: true, issues: [] }
  }

  /** 导出会话流（call/result 成对），供 `duzhi audit` 离线重放对账。 */
  exportStream() {
    const out = []
    this.led.calls.forEach((rec, i) => {
      const id = rec.ref ?? `d${i + 1}`
      out.push({ type: 'tool_call', id, name: rec.name, args: rec.args, at: rec.at ?? undefined })
      out.push({
        type: 'tool_result',
        id,
        name: rec.name,
        args: rec.args,
        isError: rec.isError,
        at: rec.at ?? undefined,
      })
    })
    return out
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同各前层：避免"注入自己提供的子服务"形成等待环
  // ——闭包是最诚实的通路）。
  const ref = { ledger: null }

  class WiredDuzhiService extends DuzhiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.ledger = this.led
    }
  }
  ctx.plugin(WiredDuzhiService, config)

  // ---- 结果结算后：用账唯一写入口 ------------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const led = ref.ledger
      if (!led) return
      step(led, {
        ref: exec.callId ?? null,
        name: exec.name,
        args: exec.arguments,
        isError: typeof result?.isError === 'boolean' ? result.isError : null,
        at: Date.now(),
      })
    } catch {
      // 静默：观察层绝不干扰管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { duzhi: DuzhiService }
// }
