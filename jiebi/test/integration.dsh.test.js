/**
 * 真实集成测试 —— 解蔽插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证两件事：
 *
 *  1. 零拦截是结构性的：所有调用无条件到达工具本体；
 *  2. 观察式判断账本在真实管道上正确工作（对比统计 / 服务蔽值 / 流导出对账）。
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

async function mountJiebi(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const jiebi = await import('../src/plugin/jiebi.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(jiebi, config)

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
  await waitFor(() => ctx.jiebi, 'ctx.jiebi')

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
      if (ctx.jiebi.report().totals.callsObserved >= n) return
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error(`等待观察结算到 ${n} 超时（实际 ${ctx.jiebi.report().totals.callsObserved}）`)
  }

  return { ctx, call, service: ctx.jiebi, settleTo }
}

maybe('集成：结构性零拦截 —— 连败探针也全部到达工具本体（对照组 6/6）', async () => {
  const { call, service, settleTo } = await mountJiebi()
  // 同一失败探针连续 4 次：zhizhi 在此拦截，jiebi 必须一次都不拦
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
})

maybe('集成：单候选连击在会话账本上现形（flag，但依然放行）', async () => {
  const { call, service, settleTo } = await mountJiebi({ streakThreshold: 4 })
  for (let i = 0; i < 4; i++) {
    await call('probe', { tag: 'same' })
    await settleTo(i + 1)
  }
  const report = service.report()
  assert.equal(report.totals.flags, 1)
  assert.equal(report.flags[0].type, 'monoculture')
  assert.equal(report.flags[0].signature, 'probe:{"tag":"same"}')
  assert.equal(report.flags[0].run, 4)
})

maybe('集成：回合边界（宿主显式声明）进入报告与导出流', async () => {
  const { call, service, settleTo } = await mountJiebi()
  service.beginTurn('t1')
  await call('read', { path: 'a.js' })
  await settleTo(1)
  service.endTurn()
  service.beginTurn('t2')
  await call('read', { path: 'b.js' })
  await settleTo(2)
  service.endTurn()

  const report = service.report()
  assert.equal(report.totals.turnsObserved, 2)
  const types = service.exportStream().map((e) => e.type)
  assert.ok(types.includes('turn_start'))
  assert.ok(types.includes('turn_end'))
})

maybe('集成：ctx.jiebi.check 同步蔽值（插件层服务即闸门）', async () => {
  const { service } = await mountJiebi()
  const biasedLedger = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'biased-ledger.json'), 'utf8'))
  const balancedLedger = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'balanced-ledger.json'), 'utf8'))

  const bad = service.check(biasedLedger)
  assert.equal(bad.valid, true)
  assert.equal(bad.score, 100)
  assert.equal(bad.band, '蔽')

  const good = service.check(balancedLedger)
  assert.equal(good.score, 0)
  assert.equal(good.band, '明')

  const broken = service.check({ version: 9 })
  assert.equal(broken.valid, false)
  assert.ok(broken.issues.length > 0)

  assert.equal(service.report().totals.ledgersChecked, 3)
})

maybe('集成：导出流可被离线 CLI 管道重放（observe × audit 对账一致）', async () => {
  const { call, service, settleTo } = await mountJiebi({ streakThreshold: 3 })
  for (let i = 0; i < 3; i++) {
    await call('probe', { tag: 'boom' })
    await settleTo(i + 1)
  }
  await call('read', { path: 'z.js' })
  await settleTo(4)

  const stream = service.exportStream()
  const text = stream.map((e) => JSON.stringify(e)).join('\n')
  const { parseStream } = await import('../src/core/stream.js')
  const { buildCalls } = await import('../src/core/stream.js')
  const { contrastAudit } = await import('../src/core/audit.js')
  const { calls } = buildCalls(parseStream(text))
  assert.equal(calls.length, service.report().totals.callsObserved, '导出流与观察账本逐条一致')

  const audit = contrastAudit(text, { streakThreshold: 3 })
  assert.equal(audit.verdict, 'flagged')
  assert.equal(audit.flags[0].signature, 'probe:{"tag":"boom"}')
})

maybe('集成：导出流引用可作为账本证据被 reconcile verified', async () => {
  const { call, service, settleTo } = await mountJiebi()
  await call('probe', { tag: 'boom' })
  await settleTo(1)

  const ref = service.exportStream()[0].id
  const ledger = {
    version: 1,
    id: 'd-int',
    kind: 'diagnosis',
    question: '探针为何失败？',
    alternatives: [
      { name: 'A', steelman: 's', killCondition: 'k', evidence: [{ ref, expect: 'fail' }] },
      { name: 'B', steelman: 's', killCondition: 'k' },
    ],
    disconfirming: [{ ref, note: '失败探针本身即与「一切正常」相左' }],
    verdict: { choice: 'A', weights: 'w', falsifiable: 'f' },
  }
  const { parseStream } = await import('../src/core/stream.js')
  const { reconcile } = await import('../src/core/reconcile.js')
  const report = reconcile(ledger, parseStream(service.exportStream().map((e) => JSON.stringify(e)).join('\n')))
  assert.equal(report.match, true)
  assert.deepEqual(report.refs.map((r) => r.status), ['verified', 'linked'])
})

maybe('集成：enabled=false 观察口关闸（服务仍在，check 仍可用）', async () => {
  const { call, service } = await mountJiebi({ enabled: false })
  await call('read', { path: 'a.js' })
  await new Promise((r) => setTimeout(r, 50)) // 给观察口时间（它应保持沉默）
  const report = service.report()
  assert.equal(report.totals.callsObserved, 0)
  assert.equal(report.totals.turnsObserved, 0)
  assert.equal(service.check({
    version: 1, id: 'd', kind: 'approach', question: 'q',
    alternatives: [{ name: 'A', steelman: 's', killCondition: 'k' }, { name: 'B', steelman: 's', killCondition: 'k' }],
    disconfirming: [{ ref: 'r' }],
    verdict: { choice: 'A', weights: 'w', falsifiable: 'f' },
  }).score, 0, '账本服务独立于观察口')
})

maybe('集成：结构性零拦截的源码证据 —— 插件不注册 pre-execute 监听器', async () => {
  const source = readFileSync(join(here, '..', 'src', 'plugin', 'jiebi.js'), 'utf8')
  assert.ok(!source.includes("ctx.on('tools/pre-execute'"), 'jiebi 的方向边界：不存在拦截监听器（结构性，不是纪律）')
  assert.ok(source.includes("ctx.on('tools/result'"), '只观察结果')
})

maybe('集成：插件形状（name/inject/apply）与服务声明', async () => {
  const jiebi = await import('../src/plugin/jiebi.js')
  assert.equal(jiebi.name, 'jiebi')
  assert.deepEqual(jiebi.inject, ['tools'])
  assert.equal(typeof jiebi.apply, 'function')
  assert.equal(typeof jiebi.JiebiService, 'function')
})
