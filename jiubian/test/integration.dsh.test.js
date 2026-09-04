/**
 * 真实集成测试 —— 九变插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证三件事：
 *
 *  1. 零拦截是结构性的：连败探针也无条件到达工具本体；
 *  2. 勘流式插件在真实管道上正确工作（势账 / 失机值 / 变方供给 / 门禁）；
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

async function mountJiubian(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const jiubian = await import('../src/plugin/jiubian.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(jiubian, config)

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
  await waitFor(() => ctx.jiubian, 'ctx.jiubian')

  const { defineTool } = dshTools
  ctx.tools.register(defineTool({
    name: 'bash',
    description: 'shell 探针：command 含 boom 时固定失败',
    parameters: { command: { type: 'string', required: true, description: 'command' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.command.includes('boom')) throw new Error(`simulated failure: ${args.command}`)
      return `ran:${args.command}`
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
    description: '写探针：path 含 cursed 时固定失败',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.path.includes('cursed')) throw new Error(`simulated failure: ${args.path}`)
      return `edited:${args.path}`
    },
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
      if (ctx.jiubian.report().totals.callsObserved >= n) return
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error(`等待观察结算到 ${n} 超时（实际 ${ctx.jiubian.report().totals.callsObserved}）`)
  }

  return { ctx, call, service: ctx.jiubian, settleTo }
}

maybe('集成：结构性零拦截 —— 连败探针也全部到达工具本体（6/6）', async () => {
  const { call, service, settleTo } = await mountJiubian()
  // 同一失败命令连续 4 次：zhizhi 在此拦截，九变必须一次都不拦
  for (let i = 0; i < 4; i++) {
    const r = await call('bash', { command: 'boom test' })
    await settleTo(i + 1)
    assert.equal(r.isError, true, `第 ${i + 1} 次直达工具本体并真实失败`)
  }
  const ok1 = await call('read', { path: 'a.js' })
  await settleTo(5)
  assert.match(ok1.content[0].text, /read:a\.js/)
  const ok2 = await call('bash', { command: 'boom test' })
  await settleTo(6)
  assert.equal(ok2.isError, true, '第 6 次同样直达（失败照常返回，绝不拦截）')

  const report = service.report()
  assert.equal(report.totals.callsObserved, 6, '六次调用全部被观察，无一被拦截')
})

maybe('集成：盲捶链在真实管道现形（4 连败 → 盲捶 3 免 1 计 2 = 24 钝）', async () => {
  const { call, service, settleTo } = await mountJiubian()
  for (let i = 1; i <= 4; i++) {
    await call('bash', { command: 'boom test' })
    await settleTo(i)
  }
  const report = service.report()
  assert.equal(report.totals.shiEvents, 4, '四条势变逐条入账')
  assert.equal(report.totals.blind, 3)
  assert.equal(report.score.stale, 24)
  assert.equal(report.band, '钝')
})

maybe('集成：变在真实管道记账（失败 → 再察 → 有据重试 → 变）', async () => {
  const { call, service, settleTo } = await mountJiubian()
  await call('edit', { path: 'cursed.js' })
  await settleTo(1)
  await call('read', { path: 'cursed.js' })
  await settleTo(2)
  const r = await call('edit', { path: 'cursed.js' })
  await settleTo(3)
  assert.equal(r.isError, true, 'cursed 探针永远失败——但势途对齐是对的')
  const shi = service.shi()
  assert.equal(shi.events[0].verdict, '变', '失败后先观察再重试 → 变')
  assert.equal(shi.score.total, 0)
  assert.equal(shi.band, '合')
})

maybe('集成：游骑在真实管道现形（悬账未清连开新文件 → +20）', async () => {
  const { call, service, settleTo } = await mountJiubian()
  await call('edit', { path: 'cursed.js' })
  await settleTo(1)
  for (const p of ['a.js', 'b.js', 'c.js']) {
    await call('edit', { path: p })
    await settleTo(2 + ['a.js', 'b.js', 'c.js'].indexOf(p))
  }
  const report = service.report()
  assert.equal(report.totals.graze, 1)
  assert.equal(report.score.rash, 20)
  assert.equal(report.totals.openDebts, 1, 'cursed.js 悬账未归还')
})

maybe('集成：变方供给——逐字节确定、#k 递增、悬账点名', async () => {
  const { call, service, settleTo } = await mountJiubian()
  const first = service.bianfang()
  assert.equal(first.k, 1)
  assert.match(first.text, /悬账：无——势途相合，续行。/)

  await call('edit', { path: 'cursed.js' })
  await settleTo(1)

  const second = service.bianfang()
  assert.equal(second.k, 2)
  assert.match(second.text, /【九变 · 变方】势账 #2/)
  assert.match(second.text, /1\. \[第1次动作\] edit p:cursed\.js/)
  assert.equal(second.openDebts, 1)

  const again = service.bianfang()
  assert.equal(again.k, 3)
  assert.equal(again.text, second.text.replace('#2', '#3'), '同状态文本逐字节一致（仅 #k 递增）')
})

maybe('集成：门禁裁决——即时失机值对门', async () => {
  const { call, service, settleTo } = await mountJiubian()
  assert.equal(service.gate().ok, true, '开局 0 分 → pass')
  for (let i = 1; i <= 5; i++) {
    await call('bash', { command: 'boom test' })
    await settleTo(i)
  }
  const g = service.gate()
  assert.equal(g.score, 36, '5 连败：盲捶 4 免 1 计 3')
  assert.equal(g.ok, false, '36 ≥ 门 30 → fail')
  assert.equal(g.verdict, 'fail')
})

maybe('集成：导出流可被离线 audit 重放（observe × audit 账实一致）', async () => {
  const { call, service, settleTo } = await mountJiubian()
  for (let i = 1; i <= 4; i++) {
    await call('bash', { command: 'boom test' })
    await settleTo(i)
  }
  await call('read', { path: 'a.js' })
  await settleTo(5)
  await call('edit', { path: 'cursed.js' })
  await settleTo(6)
  for (const p of ['x.js', 'y.js', 'z.js']) {
    await call('edit', { path: p })
    await settleTo(6 + ['x.js', 'y.js', 'z.js'].indexOf(p) + 1)
  }

  const runtime = service.report()
  const streamText = service
    .exportStream()
    .map((e) => JSON.stringify(e))
    .join('\n')
  const { auditStream } = await import('../src/core/audit.js')
  const offline = auditStream(streamText)

  assert.equal(offline.calls, runtime.totals.callsObserved, '导出流与观察账本逐条一致')
  assert.equal(offline.score.total, runtime.score.total, '离线失机值与运行时一致')
  assert.equal(offline.score.stale, runtime.score.stale)
  assert.equal(offline.score.rash, runtime.score.rash)
  assert.equal(offline.band, runtime.band)
  assert.equal(offline.verdict, 'fail', '盲捶链 + 游骑 → 审计红灯')
})

maybe('集成：结构性零拦截的源码证据 —— 插件不注册 pre-execute 监听器', () => {
  const source = readFileSync(join(here, '..', 'src', 'plugin', 'jiubian.js'), 'utf8')
  assert.ok(!source.includes("ctx.on('tools/pre-execute'"), '九变的方向边界：不存在拦截监听器（结构性，不是纪律）')
  assert.ok(source.includes("ctx.on('tools/result'"), '只勘流观察结果')
})

maybe('集成：插件形状（name/inject/apply）与服务声明', async () => {
  const jiubian = await import('../src/plugin/jiubian.js')
  assert.equal(jiubian.name, 'jiubian')
  assert.deepEqual(jiubian.inject, ['tools'])
  assert.equal(typeof jiubian.apply, 'function')
  assert.equal(typeof jiubian.JiubianService, 'function')
})

maybe('集成：自定义门进配置（gate: 20 → 更严的门禁）', async () => {
  const { call, service, settleTo } = await mountJiubian({ gate: 20 })
  assert.equal(service.gate().gate, 20)
  for (let i = 1; i <= 3; i++) {
    await call('bash', { command: 'boom test' })
    await settleTo(i)
  }
  assert.equal(service.gate().score, 12, '3 连败：盲捶 2 免 1 计 1')
  assert.equal(service.gate().ok, true, '12 < 门 20 → pass（自定义门生效但未越限）')
})
