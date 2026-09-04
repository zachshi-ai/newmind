/**
 * 解蔽 · Jiebi —— DeepSeek Harness 的判断校准插件（Cordis 插件层）。
 *
 * 与 zhizhi 的方向边界（结构性，不是纪律性）：
 *   jiebi 不挂 tools/pre-execute —— 源码里不存在拦截监听器，
 *   想拦动作也做不到。它只挂 tools/result，观察真实执行结果，
 *   维护"判断对比账本"，并提供账本校验服务。
 *
 *   tools/result       emit    观察结果，更新对比账本（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络。
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 *   - 服务即闸门：ctx.jiebi.check(ledger) 同步返回蔽值，供宿主
 *     在收尾/提交接缝处做确定性门禁（拦截动作的从来不是 jiebi，
 *     是拿着蔽值的宿主）。
 */

import { Service } from '@deepseek-ai/cordis'
import { createObserver } from '../core/observe.js'

export const name = 'jiebi'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 解蔽服务：把对比账本与蔽值服务暴露给同仓的其他插件 / UI / 命令。
 * 声明合并后即可用 `ctx.jiebi.report()` / `ctx.jiebi.exportStream()` /
 * `ctx.jiebi.check(ledger)` / `ctx.jiebi.beginTurn(id)`。
 */
export class JiebiService extends Service {
  constructor(ctx, config) {
    super(ctx, 'jiebi')
    this.observer = createObserver(config)
  }

  /** 会话判断账本：观察数、连击 flag、已核对账本的蔽值。 */
  report() {
    return this.observer.report()
  }

  /** 导出事件流（jiebi stream），供 `jiebi reconcile` / `jiebi audit` 离线对账。 */
  exportStream() {
    return this.observer.exportStream()
  }

  /** 账本注册 + 即时蔽值。数据问题不抛错（valid:false + issues）。 */
  check(ledger) {
    return this.observer.checkLedger(ledger, Date.now())
  }

  /** 可选回合边界：由宿主显式声明（docs/03-design.md）。 */
  beginTurn(id) {
    this.observer.beginTurn(id, Date.now())
  }

  endTurn() {
    this.observer.endTurn()
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同 zhizhi：避免"注入自己提供的子服务"
  // 形成等待环 —— 闭包是最诚实的通路）。
  const ref = { engine: null }

  class WiredJiebiService extends JiebiService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.observer
    }
  }
  ctx.plugin(WiredJiebiService, config)

  // ---- 结果结算后：对比账本唯一写入口 -------------------------------------
  // 观察永不反噬：任何异常吞掉，管道照常。
  ctx.on('tools/result', (exec, result) => {
    try {
      const engine = ref.engine
      if (!engine) return
      engine.observe({
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
//   interface Context { jiebi: JiebiService }
// }
