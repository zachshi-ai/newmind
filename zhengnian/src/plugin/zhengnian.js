/**
 * 正念 · Zhengnian —— DeepSeek Harness 的本愿守护插件（Cordis 插件层）。
 *
 * 与前两层的方向边界（结构性，不是纪律性）：
 *   zhizhi 在 tools/pre-execute 拦动作（手），jiebi 在 tools/result 审判断账本（眼），
 *   正念在 tools/result 度量本愿在场（心）——并对外"供给"上下文。
 *
 *   tools/result       emit    观察结果，更新尘值账本（唯一写入口）
 *   （无 pre-execute）           —— 零拦截是结构性的
 *
 * 新能力类型：供给式插件。zhizhi 证明插件可以拦，jiebi 证明插件可以审，
 * 正念证明插件可以供给——ctx.zhengnian.reanchor() 在接缝处产出逐字节
 * 确定的拂拭块，供宿主在压缩/回合/收尾时注入（注入与否由宿主决定，
 * 拿着拂拭块的是宿主，就像拿着蔽值的是宿主）。
 *
 * 设计约束：
 *   - 模型无关（model-free）：零 LLM 调用、零提示词注入、零网络；
 *   - 无契约不度量：契约没立时尘值沉默并明说，绝不假装量了；
 *   - 观察永不反噬：监听器里的任何异常都被吞掉，管道照常。
 */

import { Service } from '@deepseek-ai/cordis'
import { createPresence } from '../core/presence.js'

export const name = 'zhengnian'

/** 等待工具注册表就绪：观察口必须挂在真实管道上，不悬挂在半空。 */
export const inject = ['tools']

/**
 * 正念服务：把尘值账本与拂拭供给暴露给同仓的其他插件 / 宿主 / UI。
 * 声明合并后即可用 `ctx.zhengnian.report()` / `ctx.zhengnian.reanchor()` /
 * `ctx.zhengnian.dust()` / `ctx.zhengnian.acceptance()` / `ctx.zhengnian.exportStream()`。
 */
export class ZhengnianService extends Service {
  constructor(ctx, config) {
    super(ctx, 'zhengnian')
    this.presence = createPresence(config)
  }

  /** 正念账本：观察数、拂拭数、尘值。 */
  report() {
    return this.presence.report()
  }

  /** 尘值：无契约时诚实沉默（contractInstalled:false）。 */
  dust() {
    return this.presence.dust()
  }

  /** 立契约 / 换愿（换愿＝新账）。数据问题不抛错（valid:false + issues）。 */
  setContract(contract) {
    return this.presence.setContract(contract)
  }

  /** 拂拭块：逐字节确定的供给物。无契约时 { valid:false, error:'no-contract' }。 */
  reanchor() {
    return this.presence.reanchor()
  }

  /** 终验核对：契约的终验在动作流里有没有行为痕迹。 */
  acceptance(cwd = null) {
    return this.presence.acceptance(cwd)
  }

  /** 导出事件流（正念流），供 `zhengnian audit` 离线重放。 */
  exportStream() {
    return this.presence.exportStream()
  }

  /** 可选回合边界：由宿主显式声明（docs/03-design.md）。 */
  beginTurn(id) {
    this.presence.beginTurn(id)
  }

  endTurn() {
    this.presence.endTurn()
  }
}

export function apply(ctx, config = {}) {
  // 引擎经闭包引用交付给监听器（同 zhizhi / jiebi：避免"注入自己提供的
  // 子服务"形成等待环——闭包是最诚实的通路）。
  const ref = { engine: null }

  class WiredZhengnianService extends ZhengnianService {
    constructor(ctx, config) {
      super(ctx, config)
      ref.engine = this.presence
    }
  }
  ctx.plugin(WiredZhengnianService, config)

  // ---- 结果结算后：尘值账本唯一写入口 -------------------------------------
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
//   interface Context { zhengnian: ZhengnianService }
// }
