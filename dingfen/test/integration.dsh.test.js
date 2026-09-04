/**
 * 真实集成测试 —— 定分插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证四件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 封界式插件在真实管道上正确工作（写账 / 侵入 / 越分 / 界碑块 / 门禁）；
 *  3. 争写是流间事实：双引擎各自单侧视图恒 0，合并导出流离线重放后现形；
 *  4. 账实对账：离线审计的侵入/越分/争写与运行时账逐字一致。
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

const REGISTRY = {
  version: 1,
  claims: [
    { id: 'ra', fences: ['src/ra/**'], at: 0, releasedAt: null },
    { id: 'rb', fences: ['src/rb/**'], at: 0, releasedAt: null },
  ],
}

async function mountDingfen(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const dingfen = await import('../src/plugin/dingfen.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(dingfen, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.dingfen, 'ctx.dingfen')

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
      if (ctx.dingfen.report().totals.callsObserved >= n) return
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error(`等待观察结算到 ${n} 超时（实际 ${ctx.dingfen.report().totals.callsObserved}）`)
  }

  return { ctx, call, service: ctx.dingfen, settleTo }
}

maybe('集成：结构性零拦截 —— 失败探针也无条件到达工具本体', async () => {
  const { call, service, settleTo } = await mountDingfen({ sessionId: 'ra', registry: REGISTRY })
  const ok1 = await call('edit', { path: 'src/ra/a.js' })
  await settleTo(1)
  const bad = await call('edit', { path: 'cursed.js' })
  await settleTo(2)
  const ok2 = await call('edit', { path: 'src/ra/b.js' })
  await settleTo(3)
  assert.equal(ok1.isError ?? false, false)
  assert.equal(bad.isError, true, '失败照常返回，绝不拦截')
  assert.match(ok2.content[0].text, /edited:src\/ra\/b\.js/)
  assert.equal(service.report().totals.callsObserved, 3, '三次调用全部被观察，无一被拦截')
})

maybe('集成：写账只记成功的写（失败之写与读不入账）', async () => {
  const { call, service, settleTo } = await mountDingfen({ sessionId: 'ra', registry: REGISTRY })
  await call('edit', { path: 'src/ra/a.js' })
  await settleTo(1)
  await call('edit', { path: 'cursed.js' })
  await settleTo(2)
  await call('read', { path: 'src/ra/a.js' })
  await settleTo(3)
  const rep = service.report()
  assert.equal(rep.totals.callsObserved, 3)
  assert.equal(rep.totals.writes, 1, '仅一笔成功之写入账')
})

maybe('集成：侵入在真实管道现形（闯入他方开放之分 → +30 / 争）', async () => {
  const { call, service, settleTo } = await mountDingfen({ sessionId: 'rb', registry: REGISTRY })
  await call('edit', { path: 'src/ra/notes.md' })
  await settleTo(1)
  const rep = service.report()
  assert.equal(rep.score.trespass, 30)
  assert.equal(rep.score.total, 30)
  assert.equal(rep.band, '争')
  assert.equal(rep.counts.trespassPaths, 1)
})

maybe('集成：越分在真实管道现形（漂出自家分界 → +6 / 定）', async () => {
  const { call, service, settleTo } = await mountDingfen({ sessionId: 'ra', registry: REGISTRY })
  await call('edit', { path: 'wander/away.js' })
  await settleTo(1)
  const rep = service.report()
  assert.equal(rep.score.stray, 6)
  assert.equal(rep.score.total, 6)
  assert.equal(rep.band, '定')
  assert.equal(rep.counts.strayPaths, 1)
})

maybe('集成：未领分不计分（无自家之分 → 声明权在账方）', async () => {
  const { call, service, settleTo } = await mountDingfen({ sessionId: 'ghost', registry: REGISTRY })
  await call('edit', { path: 'anywhere/x.js' })
  await settleTo(1)
  const rep = service.report()
  assert.equal(rep.score.total, 0)
  assert.equal(rep.counts.unclaimed, 1)
})

maybe('集成：界碑块逐字节确定', async () => {
  const { service } = await mountDingfen({ sessionId: 'ra', registry: REGISTRY })
  const t1 = service.jiebei().text
  const t2 = service.jiebei().text
  assert.equal(t1, t2)
  assert.match(t1, /【定分 · 界碑】/)
  assert.match(t1, /· ra ── src\/ra\/\*\*/)
  assert.match(t1, /争界：无——分已定，行者不顾。/)
})

maybe('集成：单侧视图争写恒 0，导出流离线重放后现形（账实一致 72 = 6 + 36 + 30）', async () => {
  const clock = { t: 1000, now() { return ++this.t } }
  const a = await mountDingfen({ sessionId: 'ra', registry: REGISTRY, now: () => clock.now() })
  const b = await mountDingfen({ sessionId: 'rb', registry: REGISTRY, now: () => clock.now() })

  // 交错：A → B → A 同径；再让 B 侵入 ra 的分
  await a.call('edit', { path: 'src/shared.js' })
  await a.settleTo(1)
  await b.call('edit', { path: 'src/shared.js' })
  await b.settleTo(1)
  await a.call('edit', { path: 'src/shared.js' })
  await a.settleTo(2)
  await b.call('edit', { path: 'src/ra/notes.md' })
  await b.settleTo(2)

  // 单侧视图：争写恒 0（流间事实）；侵入/越分照判
  const ra = a.service.report()
  const rb = b.service.report()
  assert.equal(ra.score.strife, 0)
  assert.equal(rb.score.strife, 0)
  assert.equal(ra.score.stray, 6, 'ra 的 shared.js 漂出自家分界')
  assert.equal(rb.score.stray, 6, 'rb 的 shared.js 漂出自家分界')
  assert.equal(rb.score.trespass, 30, 'rb 闯入 ra 开放之分')

  // 导出双流 → 离线多流审计 → 争写现形
  const { auditStreams } = await import('../src/core/audit.js')
  const offline = auditStreams(
    [
      { name: 'ra', text: a.service.exportStream().map((e) => JSON.stringify(e)).join('\n') },
      { name: 'rb', text: b.service.exportStream().map((e) => JSON.stringify(e)).join('\n') },
    ],
    { registry: REGISTRY }
  )
  assert.equal(offline.score.strife, 30, '合并后争写 1 处现形')
  assert.equal(offline.counts.strifeSpots, 1)
  assert.equal(offline.score.trespass, rb.score.trespass, '侵入账实一致 30 = 30')
  assert.equal(offline.score.stray, ra.score.stray + rb.score.stray, '越分账实一致 12 = 6 + 6')
  assert.equal(offline.score.total, 72, '30 争写 + 30 侵入 + 12 越分')
  assert.equal(offline.score.total, ra.score.total + rb.score.total + offline.score.strife, '恒等式：离线总值 = 双侧运行时 + 争写')
  assert.equal(offline.band, '争')
  assert.equal(offline.ok, false)
})

maybe('集成：插件形状（name/inject/apply）与结构性零拦截源码证据', async () => {
  const dingfen = await import('../src/plugin/dingfen.js')
  assert.equal(dingfen.name, 'dingfen')
  assert.deepEqual(dingfen.inject, ['tools'])
  assert.equal(typeof dingfen.apply, 'function')
  assert.equal(typeof dingfen.DingfenService, 'function')

  const source = readFileSync(join(here, '..', 'src', 'plugin', 'dingfen.js'), 'utf8')
  assert.ok(!source.includes("ctx.on('tools/pre-execute'"), '定分的方向边界：不存在拦截监听器（结构性，不是纪律）')
  assert.ok(source.includes("ctx.on('tools/result'"), '只勘流观察结果')
})
