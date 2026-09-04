/**
 * 真实集成测试 —— 有涯插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证三件事：
 *
 *  1. 零拦截是结构性的：原样重读/重跑探针也无条件到达工具本体；
 *  2. 巡忆式插件在真实管道上正确工作（见闻账 / 殆值 / 要籍供给 / 门禁）；
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

async function mountYouya(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const youya = await import('../src/plugin/youya.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(youya, config)

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
  await waitFor(() => ctx.youya, 'ctx.youya')

  const { defineTool } = dshTools
  ctx.tools.register(defineTool({
    name: 'read',
    description: '读探针',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `read:${args.path}` },
  }))
  ctx.tools.register(defineTool({
    name: 'bash',
    description: 'shell 探针',
    parameters: { command: { type: 'string', required: true, description: 'command' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `ran:${args.command}` },
  }))
  ctx.tools.register(defineTool({
    name: 'edit',
    description: '写探针',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `edited:${args.path}` },
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
      if (ctx.youya.report().totals.callsObserved >= n) return
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error(`等待观察结算到 ${n} 超时（实际 ${ctx.youya.report().totals.callsObserved}）`)
  }

  return { ctx, call, service: ctx.youya, settleTo }
}

maybe('集成：结构性零拦截 —— 原样重读探针也全部到达工具本体（6/6）', async () => {
  const { call, service, settleTo } = await mountYouya()
  // 同一路径连续重读 4 次：知止在此拦截，有涯必须一次都不拦
  for (let i = 0; i < 4; i++) {
    const r = await call('read', { path: 'a.js' })
    await settleTo(i + 1)
    assert.match(r.content[0].text, /read:a\.js/, `第 ${i + 1} 次直达工具本体`)
  }
  const ok = await call('bash', { command: 'ls' })
  await settleTo(5)
  assert.match(ok.content[0].text, /ran:ls/)
  const ok2 = await call('read', { path: 'a.js' })
  await settleTo(6)
  assert.match(ok2.content[0].text, /read:a\.js/, '第 6 次同样直达（复见照记，绝不拦截）')
  assert.equal(service.report().totals.callsObserved, 6, '六次调用全部被观察，无一被拦截')
})

maybe('集成：复见在真实管道现形（读两次未变之读 → +12）', async () => {
  const { call, service, settleTo } = await mountYouya()
  await call('read', { path: 'a.js' })
  await settleTo(1)
  await call('read', { path: 'a.js' })
  await settleTo(2)
  const report = service.report()
  assert.equal(report.totals.sins, 1)
  assert.equal(report.totals.fujianCases, 1)
  assert.equal(report.score.fujian, 12)
  assert.equal(report.band, '新硎')
})

maybe('集成：三连原样读并一案（记 2 免 1）；写后重读是「鲜」', async () => {
  const { call, service, settleTo } = await mountYouya()
  for (let i = 1; i <= 3; i++) {
    await call('read', { path: 'a.js' })
    await settleTo(i)
  }
  let report = service.report()
  assert.equal(report.totals.sins, 2)
  assert.equal(report.totals.fujianCases, 1, '并案')
  await call('edit', { path: 'a.js' })
  await settleTo(4)
  await call('read', { path: 'a.js' })
  await settleTo(5)
  report = service.report()
  assert.equal(report.totals.sins, 2, '写后重读不入罪')
})

maybe('集成：复命在真实管道现形（同串重跑 +8；写入后重跑免记）', async () => {
  const { call, service, settleTo } = await mountYouya()
  await call('bash', { command: 'ls' })
  await settleTo(1)
  await call('bash', { command: 'ls' })
  await settleTo(2)
  assert.equal(service.report().totals.fumingCases, 1)
  await call('edit', { path: 'w.js' })
  await settleTo(3)
  await call('bash', { command: 'ls' })
  await settleTo(4)
  assert.equal(service.report().totals.fumingCases, 1, '全库重置——写后重跑是正当的')
})

maybe('集成：要籍供给——逐字节确定、#k 递增、无陈账行', async () => {
  const { call, service, settleTo } = await mountYouya()
  const first = service.yaoji()
  assert.equal(first.k, 1)
  assert.match(first.text, /【有涯 · 要籍】见闻账 #1/)
  assert.match(first.text, /（无陈账：见闻皆鲜，游刃有余。）/)

  await call('read', { path: 'a.js' })
  await settleTo(1)

  const second = service.yaoji()
  assert.equal(second.k, 2)
  assert.match(second.text, /【有涯 · 要籍】见闻账 #2/)

  const again = service.yaoji()
  assert.equal(again.k, 3)
  assert.equal(again.text, second.text.replace('#2', '#3'), '同状态文本逐字节一致（仅 #k 递增）')
})

maybe('集成：jianwen() 实时账本——罪记带位次与宗别', async () => {
  const { call, service, settleTo } = await mountYouya()
  await call('read', { path: 'a.js' })
  await settleTo(1)
  await call('read', { path: 'a.js' })
  await settleTo(2)
  const jw = service.jianwen()
  assert.equal(jw.sins.length, 1)
  assert.equal(jw.sins[0].kind, '复见')
  assert.equal(jw.sins[0].at, 2)
  assert.equal(jw.sins[0].object, 'p:a.js')
})

maybe('集成：门禁裁决——三复见案 36 越门 30 → fail', async () => {
  const { call, service, settleTo } = await mountYouya()
  assert.equal(service.gate().ok, true, '开局 0 分 → pass')
  const seq = ['a.js', 'b.js', 'a.js', 'c.js', 'a.js', 'd.js', 'a.js']
  for (let i = 0; i < seq.length; i++) {
    await call('read', { path: seq[i] })
    await settleTo(i + 1)
  }
  const g = service.gate()
  assert.equal(g.score, 36, '三个互不相邻的复见案')
  assert.equal(g.ok, false, '36 ≥ 门 30 → fail')
  assert.equal(g.verdict, 'fail')
})

maybe('集成：导出流可被离线 audit 重放（observe × audit 账实一致）', async () => {
  const { call, service, settleTo } = await mountYouya()
  const seq = ['a.js', 'b.js', 'a.js', 'c.js', 'a.js', 'd.js', 'a.js']
  for (let i = 0; i < seq.length; i++) {
    await call('read', { path: seq[i] })
    await settleTo(i + 1)
  }
  await call('bash', { command: 'ls' })
  await settleTo(8)

  const runtime = service.report()
  const streamText = service
    .exportStream()
    .map((e) => JSON.stringify(e))
    .join('\n')
  const { auditStream } = await import('../src/core/audit.js')
  const offline = auditStream(streamText)

  assert.equal(offline.calls, runtime.totals.callsObserved, '导出流与观察账本逐条一致')
  assert.equal(offline.sins, runtime.totals.sins)
  assert.deepEqual(offline.score, runtime.score, '离线殆值与运行时逐字一致')
  assert.equal(offline.band, runtime.band)
  assert.equal(offline.counts.fujianCases, runtime.totals.fujianCases)
  assert.equal(offline.verdict, 'fail', '三复见案 → 审计红灯')
})

maybe('集成：结构性零拦截的源码证据 —— 插件不注册 pre-execute 监听器', () => {
  const source = readFileSync(join(here, '..', 'src', 'plugin', 'youya.js'), 'utf8')
  assert.ok(!source.includes("ctx.on('tools/pre-execute'"), '有涯的方向边界：不存在拦截监听器（结构性，不是纪律）')
  assert.ok(source.includes("ctx.on('tools/result'"), '只巡忆观察结果')
})

maybe('集成：插件形状（name/inject/apply）与服务声明', async () => {
  const youya = await import('../src/plugin/youya.js')
  assert.equal(youya.name, 'youya')
  assert.deepEqual(youya.inject, ['tools'])
  assert.equal(typeof youya.apply, 'function')
  assert.equal(typeof youya.YouyaService, 'function')
})

maybe('集成：自定义门进配置（gate: 10 → 一案即红灯）', async () => {
  const { call, service, settleTo } = await mountYouya({ gate: 10 })
  assert.equal(service.gate().gate, 10)
  await call('read', { path: 'a.js' })
  await settleTo(1)
  await call('read', { path: 'a.js' })
  await settleTo(2)
  const g = service.gate()
  assert.equal(g.score, 12)
  assert.equal(g.ok, false, '12 ≥ 门 10 → fail（自定义门生效）')
})

maybe('集成：观察异常不冒泡 —— 畸形事件被吞掉，管道照常', async () => {
  const { ctx, call, service, settleTo } = await mountYouya()
  await call('read', { path: 'a.js' })
  await settleTo(1)
  // 直接向监听通道喂一个 null exec（模拟上游畸形），插件必须吞掉而不炸管道
  ctx.emit('tools/result', null, undefined)
  const r = await call('read', { path: 'b.js' })
  await settleTo(2)
  assert.match(r.content[0].text, /read:b\.js/, '管道照常')
  assert.equal(service.report().totals.callsObserved, 2, '畸形事件未入账，正常事件照常入账')
})
