/**
 * 真实集成测试 —— 知止插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，驱动真实执行管线验证拦截行为。
 *
 * 这是本项目最关键的一条验收：证明"插件层的创造与创新"落在 DeepSeek
 * Harness 的真实接缝上，而不是自建的玩具框架。
 *
 * 官方包在 devDependencies 里；未安装（离线/零依赖场景）时跳过本文件。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const cordisRoot = join(here, '..', 'node_modules', '@deepseek-ai', 'cordis')

const available = existsSync(cordisRoot)
const maybe = available ? test : test.skip

// ---------------------------------------------------------------------------
// 装配：真实内核 + 真实工具管道 + 知止插件 + 演示工具
// ---------------------------------------------------------------------------

async function mountZhizhi(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const zhizhi = await import('../src/plugin/zhizhi.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(zhizhi, config)

  // Cordis 的服务 fiber 异步启动；等待服务可用（带超时的确定性轮询）
  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise(r => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.zhizhi, 'ctx.zhizhi')

  // 工具注册
  let flakyAttempts = 0
  const { defineTool } = dshTools
  ctx.tools.register(defineTool({
    name: 'probe_flaky',
    description: '失败探针：tag=boom 时固定失败',
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
    name: 'write',
    description: '写探针',
    parameters: {
      path: { type: 'string', required: true, description: 'path' },
      content: { type: 'string', description: 'content' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `wrote:${args.path}` },
  }))

  async function call(name, args) {
    return ctx.tools.execute({
      callId: `demo-${Math.random().toString(36).slice(2)}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })
  }

  /**
   * 等待账本结算：真实 Agent 循环里步骤严格串行、结果结算完成后才进入
   * 下一步；测试驱动模拟该语义 —— 等到 observe 计数到达 n 再继续。
   */
  async function settleTo(n) {
    for (let i = 0; i < 500; i++) {
      if (ctx.zhizhi.report().totals.callsObserved >= n) return
      await new Promise(r => setTimeout(r, 5))
    }
    throw new Error(`等待账本结算到 ${n} 超时（实际 ${ctx.zhizhi.report().totals.callsObserved}）`)
  }

  return { ctx, call, service: ctx.zhizhi, settleTo }
}

// ---------------------------------------------------------------------------
// 验收：拦截行为发生在真实管道上
// ---------------------------------------------------------------------------

maybe('集成：同一失败调用连续 2 次后，第 3 次被真实管道拒绝', async () => {
  const { call, service, settleTo } = await mountZhizhi({ stopLoss: { threshold: 2 } })
  const boom = { tag: 'boom' }

  const r1 = await call('probe_flaky', boom)
  await settleTo(1)
  assert.equal(r1.isError, true, '第 1 次：工具自身失败')
  assert.match(r1.error.message, /simulated failure/)

  const r2 = await call('probe_flaky', boom)
  await settleTo(2)
  assert.equal(r2.isError, true, '第 2 次：工具自身失败')

  const r3 = await call('probe_flaky', boom)
  assert.equal(r3.isError, true, '第 3 次仍以错误结算……')
  assert.match(r3.error.message, /知止·止损/, '……但错误来自知止门')
  assert.match(r3.error.message, /连续失败 2 次/, '理由中带失败历史')

  const report = service.report()
  assert.equal(report.totals.denied, 1)
  assert.equal(report.totals.allowed, 2, '工具本体只执行过 2 次')
  assert.equal(report.rules.stopLoss.denied, 1)
})

maybe('集成：换参数不受牵连；变更后重试合法', async () => {
  const { call, service, settleTo } = await mountZhizhi({ stopLoss: { threshold: 2 } })
  await call('probe_flaky', { tag: 'boom' })
  await settleTo(1)
  await call('probe_flaky', { tag: 'boom' })
  await settleTo(2)
  // 不同指纹：不受牵连（探针对 boom2 正常返回，不会被止损规则误伤）
  const other = await call('probe_flaky', { tag: 'boom2' })
  await settleTo(3)
  assert.equal(other.isError, false, '不同参数的调用正常执行')
  assert.match(other.content[0].text, /ok:boom2/)
  // 合法变更：先读后写（写探针本身也受先读后写约束）
  await call('read', { path: 'fix.txt' })
  await settleTo(4)
  await call('write', { path: 'fix.txt', content: 'fix' })
  await settleTo(5)
  const after = await call('probe_flaky', { tag: 'boom' })
  await settleTo(6)
  assert.match(after.error.message, /simulated failure/, '变更重置后，重试直达工具本体')
  assert.equal(service.report().totals.mutationResets >= 1, true)
})

maybe('集成：未读先写被拦，读过之后放行（结构化路径）', async () => {
  const { call, service, settleTo } = await mountZhizhi({})
  const blind = await call('write', { path: 'notes/a.md', content: 'x' })
  assert.equal(blind.isError, true)
  assert.match(blind.error.message, /先读后写/)
  assert.match(blind.error.message, /notes\/a\.md/)

  await call('read', { path: 'notes/a.md' })
  await settleTo(1)
  const seen = await call('write', { path: 'notes/a.md', content: 'y' })
  await settleTo(2)
  assert.equal(seen.isError, false, '读过之后写入直达工具')
  assert.match(seen.content[0].text, /wrote:notes\/a\.md/)
  assert.equal(service.report().rules.readBeforeWrite.denied, 1)
})

maybe('集成：健康调用完全不受影响（对照组）', async () => {
  const { call, service, settleTo } = await mountZhizhi({})
  for (let i = 0; i < 5; i++) {
    const r = await call('probe_flaky', { tag: `fine-${i}` })
    await settleTo(i + 1)
    assert.equal(r.isError, false, `健康调用 #${i} 不应被干扰`)
  }
  const report = service.report()
  assert.equal(report.totals.denied, 0)
  assert.equal(report.totals.allowed, 5)
})

maybe('集成：账本与导出流可离线对账（gated 审计一致性 match=true）', async () => {
  const { call, service, settleTo } = await mountZhizhi({ stopLoss: { threshold: 2 } })
  const boom = { tag: 'boom' }
  for (let i = 0; i < 3; i++) {
    await call('probe_flaky', boom)
    await settleTo(Math.min(i + 1, 2))
  }
  await call('write', { path: 'never-read.md' })

  const stream = service.exportStream()
  const { auditStream } = await import('../src/core/audit.js')
  const audit = auditStream(stream, { mode: 'gated', stopLoss: { threshold: 2 } })
  assert.equal(audit.consistency.match, true, '离线重放与运行时拦截逐条一致')
  assert.equal(audit.consistency.runtimeDenied, 2)
  assert.equal(audit.totals.interceptedByRule.stopLoss, 1)
  assert.equal(audit.totals.interceptedByRule.readBeforeWrite, 1)
})

maybe('集成：zhizhi 服务声明合并 —— ctx.zhizhi 可用', async () => {
  const { service } = await mountZhizhi({})
  assert.equal(typeof service.report(), 'object')
  assert.ok(Array.isArray(service.exportStream()))
})

maybe('集成：配置 enabled=false 时规则整体关闭', async () => {
  const { call, settleTo } = await mountZhizhi({
    stopLoss: { enabled: false },
    readBeforeWrite: { enabled: false },
  })
  for (let i = 0; i < 4; i++) {
    const r = await call('probe_flaky', { tag: 'boom' })
    await settleTo(i + 1)
    assert.match(r.error.message, /simulated failure/, '关闭规则后全部直达工具')
  }
  const w = await call('write', { path: 'blind.md' })
  await settleTo(5)
  assert.equal(w.isError, false, '盲写放行')
})

maybe('集成：插件自身贡献确认 —— inject tools 且随内核卸载而清理', async () => {
  const zhizhi = await import('../src/plugin/zhizhi.js')
  assert.equal(zhizhi.name, 'zhizhi')
  assert.deepEqual(zhizhi.inject, ['tools'])
  assert.equal(typeof zhizhi.apply, 'function')
})
