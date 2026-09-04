/**
 * 真实集成测试 —— 正念插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证三件事：
 *
 *  1. 零拦截是结构性的：所有调用无条件到达工具本体；
 *  2. 供给式插件在真实管道上正确工作（尘值账本 / 拂拭块供给 / 终验门 / 流导出）；
 *  3. 运行时账本与离线审计逐字一致（账实对账）。
 *
 * 官方包在 devDependencies 里；未安装（离线/零依赖场景）时跳过本文件。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const cordisRoot = join(here, '..', 'node_modules', '@deepseek-ai', 'cordis')

const available = existsSync(cordisRoot)
const maybe = available ? test : test.skip

const CONTRACT = {
  version: 1,
  id: 'w-int',
  wish: '修复 payments 模块的重复扣款，并让回归测试全绿',
  anchors: { keywords: ['payment', 'test'], paths: ['src/payments/'] },
  scope: { allowRoots: ['src/payments/'] },
  acceptance: [{ ref: 'a1', name: 'bash', argsContains: 'npm test' }],
  window: 10,
}

async function mountZhengnian(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const zhengnian = await import('../src/plugin/zhengnian.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(zhengnian, config)

  // Cordis 的服务 fiber 异步启动；等待服务可用（带超时的确定性轮询）
  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.zhengnian, 'ctx.zhengnian')

  const { defineTool } = dshTools
  ctx.tools.register(defineTool({
    name: 'probe',
    description: '探针：tag=boom 时固定失败',
    parameters: { tag: { type: 'string', required: true, description: 'tag' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.tag === 'boom') throw new Error(`simulated failure: ${args.tag}`)
      return `ok:${args.tag}`
    },
  }))
  ctx.tools.register(defineTool({
    name: 'read',
    description: '读探针',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `read:${args.path}` },
  }))
  ctx.tools.register(defineTool({
    name: 'edit',
    description: '写探针（写类动作，用于攀缘度量）',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `edited:${args.path}` },
  }))
  ctx.tools.register(defineTool({
    name: 'bash',
    description: 'shell 探针',
    parameters: { command: { type: 'string', required: true, description: 'command' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `ran:${args.command}` },
  }))

  async function call(name, args) {
    return ctx.tools.execute({
      callId: `demo-${Math.random().toString(36).slice(2)}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })
  }

  async function settleTo(n) {
    for (let i = 0; i < 500; i++) {
      if (ctx.zhengnian.report().totals.callsObserved >= n) return
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error(`等待观察结算到 ${n} 超时（实际 ${ctx.zhengnian.report().totals.callsObserved}）`)
  }

  return { ctx, call, service: ctx.zhengnian, settleTo }
}

maybe('集成：结构性零拦截 —— 连败探针也全部到达工具本体（对照组 6/6）', async () => {
  const { call, service, settleTo } = await mountZhengnian({ contract: CONTRACT })
  // 同一失败探针连续 4 次：zhizhi 在此拦截，正念必须一次都不拦
  for (let i = 0; i < 4; i++) {
    const r = await call('probe', { tag: 'boom' })
    await settleTo(i + 1)
    assert.match(r.error.message, /simulated failure/, `第 ${i + 1} 次直达工具本体`)
  }
  const varied = await call('probe', { tag: 'fine' })
  await settleTo(5)
  assert.match(varied.content[0].text, /ok:fine/)
  const read = await call('read', { path: 'a.js' })
  await settleTo(6)
  assert.match(read.content[0].text, /read:a\.js/)

  const report = service.report()
  assert.equal(report.totals.callsObserved, 6, '六次调用全部被观察，无一被拦截')
  assert.equal(report.totals.contractInstalled, true)
})

maybe('集成：无契约不度量——setContract 非法诚实拒绝，合法后尘值开始工作', async () => {
  const { call, service, settleTo } = await mountZhengnian()
  assert.equal(service.report().totals.contractInstalled, false)
  const silent = service.dust()
  assert.equal(silent.contractInstalled, false, '尘值沉默并明说')

  const rejected = service.setContract({ version: 9 })
  assert.equal(rejected.valid, false)
  assert.ok(rejected.issues.length > 0)

  await call('read', { path: 'x.md' })
  await settleTo(1)

  const installed = service.setContract(CONTRACT)
  assert.equal(installed.valid, true)
  const report = service.report()
  assert.equal(report.totals.contractInstalled, true)
  assert.equal(report.totals.callsObserved, 0, '换愿＝新账：旧观察不计入新契约的尘值')
})

maybe('集成：失念在真实管道上现形（尾部 3 次无关读 → 24 分）', async () => {
  const { call, service, settleTo } = await mountZhengnian({ contract: CONTRACT })
  await call('read', { path: 'src/payments/charge.js' })
  await settleTo(1)
  await call('bash', { command: 'npm test' })
  await settleTo(2)
  for (const p of ['README.md', 'CHANGELOG.md', 'docs/style.md']) {
    await call('read', { path: p })
    await settleTo(2 + ['README.md', 'CHANGELOG.md', 'docs/style.md'].indexOf(p) + 1)
  }
  const dust = service.dust()
  assert.equal(dust.contractInstalled, true)
  assert.equal(dust.breakdown.forget, 24)
  assert.equal(dust.details.anchorMissStreak, 3)
  assert.equal(dust.score, 24)
  assert.equal(dust.band, '浮')
})

maybe('集成：攀缘在真实管道上现形（越界写入 → +12，路径落账）', async () => {
  const { call, service, settleTo } = await mountZhengnian({ contract: CONTRACT })
  await call('edit', { path: 'docs/api.md' })
  await settleTo(1)
  const dust = service.dust()
  assert.equal(dust.breakdown.grasp, 12)
  assert.deepEqual(dust.details.outOfScopeWrites.map((o) => o.path), ['docs/api.md'])

  await call('edit', { path: 'src/payments/charge.js' })
  await settleTo(2)
  assert.equal(service.dust().breakdown.grasp, 12, '愿内写入不计攀缘')
})

maybe('集成：拂拭块供给——逐字节确定、#k 递增、事件入流', async () => {
  const { call, service, settleTo } = await mountZhengnian()
  const nothing = service.reanchor()
  assert.equal(nothing.valid, false, '无契约时拂拭沉默并明说')
  assert.equal(nothing.error, 'no-contract')
  service.setContract(CONTRACT)

  await call('read', { path: 'src/payments/charge.js' })
  await settleTo(1)

  const first = service.reanchor()
  assert.equal(first.valid, true)
  assert.equal(first.k, 1)
  assert.match(first.text, /【拂拭 · re-anchor】#1/)
  assert.match(first.text, /本愿：修复 payments 模块的重复扣款，并让回归测试全绿/)
  assert.match(first.text, /尘值：0（失念 0 · 攀缘 0 · 息尘 0）/)

  const again = service.reanchor()
  assert.equal(again.k, 2)
  assert.match(again.text, /#2/)

  const types = service.exportStream().map((e) => e.type)
  assert.equal(types.filter((t) => t === 'reanchor').length, 2, '拂拭事件入流（息尘切段的依据）')
})

maybe('集成：终验门——口念心行（a1 探针真实发生后 fulfilled）', async () => {
  const { call, service, settleTo } = await mountZhengnian({ contract: CONTRACT })
  await call('read', { path: 'src/payments/charge.js' })
  await settleTo(1)
  assert.equal(service.acceptance().verdict, 'unfulfilled')

  await call('bash', { command: 'npm test' })
  await settleTo(2)
  const acc = service.acceptance()
  assert.equal(acc.verdict, 'fulfilled')
  assert.deepEqual(acc.refs[0], { ref: 'a1', kind: 'probe', status: 'verified', via: 'stream' })
})

maybe('集成：导出流可被离线 CLI 管道重放（observe × audit 账实一致）', async () => {
  const { call, service, settleTo } = await mountZhengnian({ contract: CONTRACT })
  await call('read', { path: 'src/payments/charge.js' })
  await settleTo(1)
  await call('edit', { path: 'docs/api.md' })
  await settleTo(2)
  for (const p of ['a.md', 'b.md', 'c.md']) {
    await call('read', { path: p })
    await settleTo(2 + ['a.md', 'b.md', 'c.md'].indexOf(p) + 1)
  }

  const runtime = service.report()
  const streamText = service.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const { auditStream } = await import('../src/core/audit.js')
  const offline = auditStream(CONTRACT, streamText)

  assert.equal(offline.calls, runtime.totals.callsObserved, '导出流与观察账本逐条一致')
  assert.equal(offline.score, runtime.dust.score, '离线尘值与运行时尘值一致')
  assert.deepEqual(offline.breakdown, runtime.dust.breakdown)
  assert.equal(offline.verdict, 'fail', '失念 3 连 + 越界写入 → 审计红灯')
})

maybe('集成：enabled=false 观察口关闸（服务仍在，契约与拂拭仍可用）', async () => {
  const { call, service } = await mountZhengnian({ contract: CONTRACT, enabled: false })
  await call('read', { path: 'src/payments/charge.js' })
  await new Promise((r) => setTimeout(r, 50)) // 给观察口时间（它应保持沉默）
  const report = service.report()
  assert.equal(report.totals.callsObserved, 0)
  assert.equal(report.totals.turnsObserved, 0)
  const wipe = service.reanchor()
  assert.equal(wipe.valid, true, '拂拭供给独立于观察口')
  assert.match(wipe.text, /#1/)
})

maybe('集成：回合边界（宿主显式声明）进入报告与导出流', async () => {
  const { call, service, settleTo } = await mountZhengnian({ contract: CONTRACT })
  service.beginTurn('t1')
  await call('read', { path: 'src/payments/a.js' })
  await settleTo(1)
  service.endTurn()
  service.beginTurn('t2')
  await call('read', { path: 'src/payments/b.js' })
  await settleTo(2)
  service.endTurn()

  const report = service.report()
  assert.equal(report.totals.turnsObserved, 2)
  const types = service.exportStream().map((e) => e.type)
  assert.ok(types.includes('turn_start'))
  assert.ok(types.includes('turn_end'))
})

maybe('集成：结构性零拦截的源码证据 —— 插件不注册 pre-execute 监听器', () => {
  const source = readFileSync(join(here, '..', 'src', 'plugin', 'zhengnian.js'), 'utf8')
  assert.ok(!source.includes("ctx.on('tools/pre-execute'"), '正念的方向边界：不存在拦截监听器（结构性，不是纪律）')
  assert.ok(source.includes("ctx.on('tools/result'"), '只观察结果')
})

maybe('集成：插件形状（name/inject/apply）与服务声明', async () => {
  const zhengnian = await import('../src/plugin/zhengnian.js')
  assert.equal(zhengnian.name, 'zhengnian')
  assert.deepEqual(zhengnian.inject, ['tools'])
  assert.equal(typeof zhengnian.apply, 'function')
  assert.equal(typeof zhengnian.ZhengnianService, 'function')
})
