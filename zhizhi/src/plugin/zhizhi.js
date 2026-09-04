/**
 * 知止 · Zhizhi —— DeepSeek Harness 的行为节制插件（Cordis 插件层）。
 *
 * 只用 DeepSeek Harness 的公开接缝，不 fork、不改源码：
 *
 *   tools/pre-execute  waterfall  动作发生前裁决（veto = 不调 next()）
 *   tools/result       emit       结果结算后更新账本（唯一写入口）
 *
 * 设计约束：
 *   - 模型无关（model-free）：纯确定性规则，零 LLM 调用，零提示词注入。
 *   - fail-open：约束门自身出错时放行并记录 —— 节制层绝不能成为
 *     新的单点故障。治大国若烹小鲜，约束层更不可乱作为。
 *   - 观察永不反噬：tools/result 里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import { createEngine } from '../core/engine.js'
import { callFingerprint } from '../core/fingerprint.js'

export const name = 'zhizhi'

/** 等待工具注册表就绪：约束门必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 知止服务：把账本暴露给同仓的其他插件 / UI / 命令。
 * 声明合并后即可用 `ctx.zhizhi.report()` / `ctx.zhizhi.exportStream()`。
 */
export class ZhizhiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'zhizhi')
    this.engine = createEngine(config)
  }

  /** 知止账本：本次会话行为的 JSON 快照。 */
  report() {
    return this.engine.report()
  }

  /** 导出事件流（zhizhi stream），供 `zhizhi audit` 离线重放对账。 */
  exportStream() {
    return this.engine.exportStream()
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器。不能在监听器里访问 ctx.zhizhi：
  // Cordis 的服务访问守卫要求按 inject 声明才能取服务属性，而
  // "注入自己提供的子服务"会形成等待环 —— 闭包是最诚实的通路。
  const ref = { engine: null }

  class WiredZhizhiService extends ZhizhiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.engine
    }
  }
  ctx.plugin(WiredZhizhiService, config)

  const getEngine = () => ref.engine

  // 被拦调用会"回声"：dsh 管道把 deny 物化为一次失败结果并发 tools/result。
  // 回声不是工具的真实执行，凭指纹识别并跳过结算，否则会重复计数。
  const pendingEchoes = new Set()

  // ---- 动作发生前：止损 + 先读后写 ---------------------------------------
  // waterfall 语义：返回而不调 next() = 否决（这是框架级的正式拦截接口）。
  // 管道执行对象（exec）的参数字段是 arguments；引擎统一用 { name, args }。
  const toCall = (exec) => ({ name: exec.name, args: exec.arguments })

  ctx.on('tools/pre-execute', async (exec, next) => {
    const engine = getEngine()
    if (!engine) return next()
    let verdict
    try {
      verdict = engine.guard(toCall(exec))
      if (process.env.ZHIZHI_DEBUG) {
        console.error(`[zhizhi-debug] guard ${exec.name} -> ${verdict.decision}${verdict.rule ? '/' + verdict.rule : ''}`)
      }
    } catch (error) {
      if (!engine.options.failOpen) throw error
      return next() // fail-open：门坏了不能把门外的世界一起锁死
    }
    if (verdict.decision === 'deny') {
      const call = toCall(exec)
      engine.noteDenied(call, verdict)
      pendingEchoes.add(callFingerprint(call.name, call.args))
      return { kind: 'deny', reason: verdict.reason }
    }
    return next()
  })

  // ---- 结果结算后：账本唯一写入口 ----------------------------------------
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = getEngine()
      if (!engine) return
      const fp = callFingerprint(exec.name, exec.arguments)
      if (pendingEchoes.has(fp)) {
        pendingEchoes.delete(fp)
        return
      }
      engine.observe({
        name: exec.name,
        args: exec.arguments,
        isError: result.isError === true,
        errorDigest: result.isError ? String(result.error?.message ?? result.error ?? '') : null,
      })
    } catch {
      // 观察永不反噬管道
    }
  })
}

// 让 TypeScript 消费者获得类型化的事件与服务（对 JS 无运行时影响）：
// declare module '@deepseek-ai/cordis' {
//   interface Context { zhizhi: ZhizhiService }
// }
