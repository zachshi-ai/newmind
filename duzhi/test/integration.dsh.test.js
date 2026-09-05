/**
 * 真实集成测试 —— 度支插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证四件事：
 *
 *  1. 零拦截是结构性的：探针（无论越线与否）无条件到达工具本体；
 *  2. 度支式插件在真实管道上正确工作（用账 / 制值 / 余量块 / 门禁）；
 *  3. 运行时账本与离线审计逐字一致（账实对账）；
 *  4. 观察永不反噬（异常吞掉，管道照常）。
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

async function mountDuzhi(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const duzhi = await import('../src/plugin/duzhi.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(duzhi, config)

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
  await waitFor(() => ctx.duzhi, 'ctx.duzhi')

  const { defineTool } = dshTools
  ctx.tools.register(
    defineTool({
      name: 'bash',
      description: 'shell 探针',
      parameters: { command: { type: 'string', required: true, description: 'command' } },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args) {
        return `ran:${args.command}`
      },
    }),
  )
  ctx.tools.register(
    defineTool({
      name: 'edit',
      description: '写探针',
      parameters: { path: { type: 'string', required: true, description: 'path' } },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args) {
        return `wrote:${args.path}`
      },
    }),
  )

  let seq = 0
  async function call(name, args) {
    return ctx.tools.execute({
      callId: `demo-${++seq}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })
  }

  async function settleTo(n) {
    for (let i = 0; i < 500; i++) {
      if (ctx.duzhi.report().totals.callsObserved >= n) return
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error(`等待观察结算到 ${n} 超时（实际 ${ctx.duzhi.report().totals.callsObserved}）`)
  }

  return { ctx, call, service: ctx.duzhi, settleTo }
}

maybe('集成: 插件源码无 pre-execute 监听（零拦截是结构性的）', () => {
  const src = readFileSync(join(here, '..', 'src', 'plugin', 'duzhi.js'), 'utf8')
  assert.ok(!src.includes("on('tools/pre-execute'"), '不得注册拦截监听器')
})

maybe('集成: 探针无条件到达工具本体，调用全数入账（含失败）', async () => {
  const { call, service, settleTo } = await mountDuzhi({ register: { id: '任一', maxCalls: 100 } })
  const r1 = await call('bash', { command: 'npm test' })
  const r2 = await call('edit', { path: 'src/app.js' })
  await settleTo(2)
  assert.match(r1.content[0].text, /ran:npm test/)
  assert.match(r2.content[0].text, /wrote:src\/app\.js/)
  const report = service.report()
  assert.equal(report.totals.callsObserved, 2)
  assert.equal(report.score.total, 0)
  assert.equal(report.band, '足')
})

maybe('集成: register 配置生效——cap 2 三调用，第 3 次起逾（6 → 门禁 fail）', async () => {
  const { call, service, settleTo } = await mountDuzhi({ register: { id: '任二', maxCalls: 2 } })
  await call('bash', { command: 'a' })
  await settleTo(1)
  assert.equal(service.report().score.total, 0)
  await call('bash', { command: 'b' })
  await settleTo(2)
  assert.equal(service.report().score.total, 0)
  await call('edit', { path: 'c' })
  await settleTo(3)
  const report = service.report()
  assert.equal(report.totals.overCalls, 1)
  assert.equal(report.score.total, 6)
  assert.equal(report.band, '足')
  assert.equal(service.gate().verdict, 'pass')
})

maybe('集成: 直配 maxCalls 等价生效，无册时无制 40（治理发现）', async () => {
  const direct = await mountDuzhi({ maxCalls: 1 })
  await direct.call('bash', { command: 'a' })
  await direct.settleTo(1)
  assert.equal(direct.service.report().score.total, 0)
  await direct.call('bash', { command: 'b' })
  await direct.settleTo(2)
  assert.equal(direct.service.report().score.total, 6)

  const unbounded = await mountDuzhi({})
  await unbounded.call('bash', { command: 'a' })
  await unbounded.settleTo(1)
  const report = unbounded.service.report()
  assert.equal(report.totals.wuzhi, true)
  assert.equal(report.score.total, 40)
  assert.equal(report.band, '非')
  assert.equal(unbounded.service.gate().verdict, 'fail')
})

maybe('集成: 余量块 #k 随渲染递增且仅首行不同；蓄支行随账步进', async () => {
  const { call, service, settleTo } = await mountDuzhi({ register: { id: '任三', maxCalls: 2 } })
  await call('bash', { command: 'a' })
  await settleTo(1)
  const s1 = service.yuliang()
  const s2 = service.yuliang()
  assert.equal(s1.k, 1)
  assert.equal(s2.k, 2)
  const l1 = s1.text.split('\n')
  const l2 = s2.text.split('\n')
  assert.equal(l1[0], '【度支 · 余量块 #1】')
  assert.equal(l2[0], '【度支 · 余量块 #2】')
  assert.deepEqual(l1.slice(1), l2.slice(1))
  assert.ok(s1.text.includes('蓄：调用 1 · 时程'))

  await call('edit', { path: 'b' })
  await settleTo(2)
  const s3 = service.yuliang()
  assert.equal(s3.k, 3)
  assert.ok(s3.text.includes('蓄：调用 0 · 时程'))
  assert.ok(s3.text.includes('逾：无'))
})

maybe('集成: exportStream 与离线 audit 账实对账（deepEqual 制值与案数）', async () => {
  const { auditStream } = await import('../src/core/audit.js')
  const { call, service, settleTo } = await mountDuzhi({ register: { id: '任四', maxCalls: 2 } })
  await call('bash', { command: 'a' })
  await settleTo(1)
  await call('bash', { command: 'b' })
  await settleTo(2)
  await call('edit', { path: 'c' })
  await settleTo(3)
  await call('bash', { command: 'd' })
  await settleTo(4)

  const lines = service.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const offline = auditStream(lines, { register: { version: 1, id: '任四', budget: { maxCalls: 2 } } })
  const online = service.report()

  assert.deepEqual(offline.score, online.score)
  assert.equal(offline.band, online.band)
  assert.equal(offline.counts.overCalls, online.totals.overCalls)
  assert.equal(offline.counts.callsObserved, online.totals.callsObserved)
  assert.deepEqual(offline.overCases, service.ledger().overCases)
})

maybe('集成: 观察异常不冒泡——null 结算事件吞掉，管道照常', async () => {
  const { ctx, call, service, settleTo } = await mountDuzhi({ register: { id: '任五', maxCalls: 100 } })
  ctx.emit('tools/result', undefined, undefined) // 监听器内部异常应被吞掉
  const r = await call('bash', { command: 'npm test' })
  await settleTo(1)
  assert.match(r.content[0].text, /ran:npm test/)
  assert.equal(service.report().score.total, 0) // 守界不虚报，管道未反噬
})

maybe('集成: setBudget 立/换册（换册=新账），坏册 valid:false 明说', async () => {
  const { call, service, settleTo } = await mountDuzhi({})
  await call('bash', { command: 'a' })
  await settleTo(1)
  assert.equal(service.report().totals.wuzhi, true)

  const bad = service.setBudget({ version: 1, id: 'a', budget: {} })
  assert.equal(bad.valid, false)
  assert.ok(bad.issues.length >= 1)
  assert.equal(service.report().totals.wuzhi, true) // 坏册不生效

  const good = service.setBudget({ version: 1, id: '任六', budget: { maxCalls: 1 } })
  assert.equal(good.valid, true)
  const report = service.report() // 换册=新账：旧观察不结转
  assert.equal(report.totals.callsObserved, 0)
  assert.equal(report.totals.wuzhi, false)
  assert.equal(report.id, '任六')
})

maybe('集成: register 配置里的坏线（0）被点名且不生效，无制 40 亮出来', async () => {
  const { call, service, settleTo } = await mountDuzhi({ register: { id: '任七', maxCalls: 0 } })
  await call('bash', { command: 'a' })
  await settleTo(1)
  const report = service.report()
  assert.equal(report.totals.wuzhi, true)
  assert.equal(report.score.total, 40)
  assert.ok(report.registerIssues.length >= 1)
  assert.match(JSON.stringify(report.registerIssues), /maxCalls/)
})
