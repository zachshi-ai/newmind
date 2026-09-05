/**
 * 真实集成测试 —— 法仪插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证五件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 持尺式插件在真实管道上正确工作（器动 / 曲尺 / 废尺 / 绳墨块 / 门禁）；
 *  3. 修性器径逃生在真实管道生效（账方声明之修 → 0 分）；
 *  4. liveScore 与离线重放前缀一致（中途快照 = 同刻导出流的离线判词，账实对账）；
 *  5. 插件形状与结构性零拦截源码证据。
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

const REG = { version: 1, guards: ['contract/check.list'], amends: [], verify: ['make check'], noDefaults: true }
const REG_AMEND = { version: 1, guards: [], amends: ['contract/**'], verify: ['make check'], noDefaults: true }

async function mountFayi(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const fayi = await import('../src/plugin/fayi.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(fayi, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.fayi, 'ctx.fayi')

  const { defineTool } = dshTools
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
  ctx.tools.register(defineTool({
    name: 'bash',
    description: '执行探针：command 含 boom 时固定失败',
    parameters: { command: { type: 'string', required: true, description: 'command' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.command.includes('boom')) throw new Error(`simulated failure: ${args.command}`)
      return `ran:${args.command}`
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
      if (ctx.fayi.report().totals.callsObserved >= n) return
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error(`等待观察结算到 ${n} 超时（实际 ${ctx.fayi.report().totals.callsObserved}）`)
  }

  return { ctx, call, service: ctx.fayi, settleTo }
}

maybe('集成：结构性零拦截 —— 失败探针也无条件到达工具本体', async () => {
  const { call, service, settleTo } = await mountFayi({ sessionId: 'ra', register: REG })
  const ok1 = await call('edit', { path: 'src/a.js' })
  await settleTo(1)
  const bad = await call('edit', { path: 'cursed.js' })
  await settleTo(2)
  const ok2 = await call('bash', { command: 'make check' })
  await settleTo(3)
  assert.equal(ok1.isError ?? false, false)
  assert.equal(bad.isError, true, '失败照常返回，绝不拦截')
  assert.match(ok2.content[0].text, /ran:make check/)
  assert.equal(service.report().totals.callsObserved, 3, '三次调用全部被观察，无一被拦截')
})

maybe('集成：器动只记成功的写（失败之写与执行不入器动）', async () => {
  const { call, service, settleTo } = await mountFayi({ sessionId: 'ra', register: REG })
  await call('edit', { path: 'contract/check.list' })
  await settleTo(1)
  await call('edit', { path: 'cursed.js' })
  await settleTo(2)
  await call('bash', { command: 'make check' })
  await settleTo(3)
  const rep = service.report()
  assert.equal(rep.totals.callsObserved, 3)
  assert.equal(rep.counts.instrumentTouches, 1, '仅一笔成功器写入器动')
})

maybe('集成：曲尺在真实管道现形（翻红窗内纯器写 → +30 / 枉）', async () => {
  const clock = { t: 1000, now() { return ++this.t } }
  const { call, service, settleTo } = await mountFayi({ sessionId: 'ra', register: REG, now: () => clock.now() })
  await call('bash', { command: 'make check boom' })  // 红（boom 探针固定失败）
  await settleTo(1)
  await call('edit', { path: 'contract/check.list' })      // 窗内纯器写
  await settleTo(2)
  await call('bash', { command: 'make check' })            // 绿
  await settleTo(3)
  const rep = service.report()
  assert.equal(rep.score.quchi, 30)
  assert.equal(rep.score.total, 30)
  assert.equal(rep.band, '枉')
  assert.equal(rep.counts.quchiCases, 1)
  assert.equal(service.gate().verdict, 'fail')
  assert.equal(service.gate().band, '枉')
})

maybe('集成：修性器径逃生（账方声明之修 → 0 分，注记现形）', async () => {
  const clock = { t: 2000, now() { return ++this.t } }
  const { call, service, settleTo } = await mountFayi({ sessionId: 'ra', register: REG_AMEND, now: () => clock.now() })
  await call('bash', { command: 'make check boom' })       // 红
  await settleTo(1)
  await call('edit', { path: 'contract/check.list' })
  await settleTo(2)
  await call('bash', { command: 'make check' })
  await settleTo(3)
  const rep = service.report()
  assert.equal(rep.score.total, 0)
  assert.equal(rep.counts.amendInWindow, 1)
})

maybe('集成：废尺在真实管道现形（末笔实测写后无绿验 → +30）', async () => {
  const clock = { t: 3000, now() { return ++this.t } }
  const { call, service, settleTo } = await mountFayi({ sessionId: 'ra', register: REG, now: () => clock.now() })
  await call('bash', { command: 'make check' })            // 绿
  await settleTo(1)
  await call('edit', { path: 'src/a.js' })                 // 实测写
  await settleTo(2)
  const rep = service.report()
  assert.equal(rep.shimo, 'stale')
  assert.equal(rep.score.feichi, 30)
  assert.equal(rep.band, '枉')
})

maybe('集成：绳墨块逐字节确定且含尺况', async () => {
  const clock = { t: 4000, now() { return ++this.t } }
  const { call, service, settleTo } = await mountFayi({ sessionId: 'ra', register: REG, now: () => clock.now() })
  await call('bash', { command: 'make check boom' })       // 红
  await settleTo(1)
  await call('edit', { path: 'contract/check.list' })
  await settleTo(2)
  await call('bash', { command: 'make check' })
  await settleTo(3)
  const t1 = service.shengmo().text
  const t2 = service.shengmo().text
  assert.equal(t1, t2)
  assert.match(t1, /【法仪 · 绳墨】/)
  assert.match(t1, /· 持 contract\/check\.list/)
  assert.match(t1, /· make check/)
  assert.match(t1, /曲尺 1 案：/)
  assert.match(t1, /—— 本块由确定性规则生成；重放同一流必得同一文本。/)
})

maybe('集成：liveScore 与离线重放前缀一致（账实对账，两刻快照）', async () => {
  const clock = { t: 1000, now() { return ++this.t } }
  const { call, service, settleTo } = await mountFayi({ sessionId: 'ra', register: REG, now: () => clock.now() })
  const { auditStream } = await import('../src/core/audit.js')

  await call('bash', { command: 'make check boom' })       // 红
  await settleTo(1)
  await call('edit', { path: 'contract/check.list' })
  await settleTo(2)

  // 第一刻：红验 + 器写（尚无绿验——无翻红窗，曲尺未现形）
  const live1 = service.report()
  const offline1 = auditStream({ name: 'ra', text: service.exportStream().map((e) => JSON.stringify(e)).join('\n') }, { register: REG })
  assert.deepEqual(offline1.score, live1.score, '第一刻：离线 = 运行时')
  assert.deepEqual(offline1.counts, live1.counts)

  await call('bash', { command: 'make check' })
  await settleTo(3)
  await call('edit', { path: 'src/plain.js' })
  await settleTo(4)

  // 第二刻：绿验（曲尺现形）+ 实测写（照末失守）
  const live2 = service.report()
  const offline2 = auditStream({ name: 'ra', text: service.exportStream().map((e) => JSON.stringify(e)).join('\n') }, { register: REG })
  assert.deepEqual(offline2.score, live2.score, '第二刻：离线 = 运行时')
  assert.deepEqual(offline2.counts, live2.counts)
  assert.equal(offline2.score.quchi, 30)
  assert.equal(offline2.score.feichi, 30)
  assert.equal(offline2.score.total, 60)
  assert.equal(live2.score.total >= live1.score.total, true, '枉值随流单调不减（前缀性）')
})

maybe('集成：插件形状（name/inject/apply）与结构性零拦截源码证据', async () => {
  const fayi = await import('../src/plugin/fayi.js')
  assert.equal(fayi.name, 'fayi')
  assert.deepEqual(fayi.inject, ['tools'])
  assert.equal(typeof fayi.apply, 'function')
  assert.equal(typeof fayi.FayiService, 'function')

  const source = readFileSync(join(here, '..', 'src', 'plugin', 'fayi.js'), 'utf8')
  assert.ok(!source.includes("ctx.on('tools/pre-execute'"), '法仪的方向边界：不存在拦截监听器（结构性，不是纪律）')
  assert.ok(source.includes("ctx.on('tools/result'"), '只观察结果结算')
})
