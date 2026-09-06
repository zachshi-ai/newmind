/**
 * 真实集成测试 —— 稽疑插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证五件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 稽问式插件在真实管道上正确工作（独谋门红 / 谋及豁免 / 迟问 / 空疑 / 未见 / 命令通道认问）；
 *  3. 稽块两次渲染逐字节相同；
 *  4. 账实对账：exportStream() 导出流离线 audit 重放，案数与谋值与运行时账逐字一致；
 *  5. 门禁裁决可调。
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

const ASKFILE = {
  version: 1,
  asks: [
    { path: 'AGENTS.md', on: 'write' },
    { path: 'Makefile', on: 'exec' },
  ],
  noDefaults: true,
}
const ASKFILE_DEFAULTS = { version: 1, asks: [], noDefaults: false }

async function mountJiyi(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const jiyi = await import('../src/plugin/jiyi.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(jiyi, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.jiyi, 'ctx.jiyi')

  const { defineTool } = dshTools
  ctx.tools.register(defineTool({
    name: 'edit',
    description: '写探针',
    parameters: {
      path: { type: 'string', required: true, description: 'path' },
      content: { type: 'string', description: '内容' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `edited:${args.path}` },
  }))
  ctx.tools.register(defineTool({
    name: 'bash',
    description: '执行探针：命令含 boom 时固定失败',
    parameters: { command: { type: 'string', required: true, description: 'command' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.command.includes('boom')) throw new Error(`simulated failure: ${args.command}`)
      return `ran:${args.command}`
    },
  }))
  ctx.tools.register(defineTool({
    name: 'read',
    description: '读探针：path 含 404 时固定失败',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.path.includes('404') || args.path === 'GONE.md') throw new Error(`simulated failure: ${args.path}`)
      return `read:${args.path}`
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

  return { ctx, call }
}

maybe('集成 1：结构性零拦截——失败探针也无条件到达工具本体', async () => {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  const { ctx, call } = await mountJiyi({ askfile: ASKFILE })
  let reached = false
  const probe = defineTool({
    name: 'probe',
    description: '必炸探针',
    parameters: { path: { type: 'string', required: true, description: 'p' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute() { reached = true; throw new Error('boom') },
  })
  ctx.tools.register(probe)
  await call('probe', { path: 'x.js' })
  assert.ok(reached, '工具本体必须被执行（观察不拦截）')
})

maybe('集成 2：双疑条独谋探针立案——谋值 30、带「独」、门红', async () => {
  const { ctx, call } = await mountJiyi({ askfile: ASKFILE })
  await call('edit', { path: 'src/api.js', content: 'export const x = 1\n' })
  await call('bash', { command: 'make build' })
  const g = ctx.jiyi.gate()
  assert.equal(g.score, 30)
  assert.equal(g.band, '独')
  assert.equal(g.verdict, 'fail')
})

maybe('集成 3：谋及豁免探针——先读 AGENTS.md 再写，免', async () => {
  const { ctx, call } = await mountJiyi({ askfile: ASKFILE })
  await call('read', { path: 'AGENTS.md' })
  await call('edit', { path: 'src/api.js', content: 'export const x = 1\n' })
  const r = ctx.jiyi.report()
  assert.equal(r.score.total, 0)
  assert.equal(r.counts.fulfilled, 1)
  assert.equal(r.band, '谋')
})

maybe('集成 4：迟问探针——先写后读，+5', async () => {
  const { ctx, call } = await mountJiyi({ askfile: ASKFILE })
  await call('edit', { path: 'src/api.js', content: 'export const x = 1\n' })
  await call('read', { path: 'AGENTS.md' })
  const r = ctx.jiyi.report()
  assert.deepEqual(r.score, { total: 5, late: 5, blind: 0 })
  assert.equal(r.counts.late, 1)
})

maybe('集成 5：空疑探针——在册之疑读取失败即环境答无，免', async () => {
  const { ctx, call } = await mountJiyi({
    askfile: { version: 1, asks: [{ path: 'GONE.md', on: 'write' }], noDefaults: true },
  })
  await call('read', { path: 'GONE.md' }) // 404 探针 → 空疑豁免
  await call('edit', { path: 'src/api.js', content: 'x\n' })
  const r = ctx.jiyi.report()
  assert.equal(r.score.total, 0)
  assert.equal(r.counts.emptyAsk, 1)
  assert.equal(r.band, '谋')
})

maybe('集成 6：未见不罚——默认条全流无踪，0 分', async () => {
  const { ctx, call } = await mountJiyi({ askfile: ASKFILE_DEFAULTS })
  await call('edit', { path: 'src/api.js', content: 'export const x = 1\n' })
  const r = ctx.jiyi.report()
  assert.equal(r.score.total, 0)
  assert.equal(r.counts.unseen, 3)
  assert.equal(r.counts.triggered, 3)
})

maybe('集成 7：命令通道认问——bash cat AGENTS.md 先于写，谋及', async () => {
  const { ctx, call } = await mountJiyi({
    askfile: { version: 1, asks: [{ path: 'AGENTS.md', on: 'write' }], noDefaults: true },
  })
  await call('bash', { command: 'cat AGENTS.md | head -20' })
  await call('edit', { path: 'src/api.js', content: 'export const x = 1\n' })
  const r = ctx.jiyi.report()
  assert.equal(r.score.total, 0)
  assert.equal(r.counts.fulfilled, 1)
})

maybe('集成 8：稽块两次渲染逐字节相同', async () => {
  const { ctx, call } = await mountJiyi({ askfile: ASKFILE })
  await call('edit', { path: 'src/api.js', content: 'export const x = 1\n' })
  const a = ctx.jiyi.jice().text
  const b = ctx.jiyi.jice().text
  assert.equal(a, b)
  assert.match(a, /【稽疑 · 疑册】/)
  assert.match(a, /汝则有大疑，谋及乃心，谋及卿士/)
})

maybe('集成 9：exportStream 导出流离线 audit 重放——账实一致', async () => {
  const { ctx, call } = await mountJiyi({ askfile: ASKFILE })
  await call('edit', { path: 'src/api.js', content: 'export const x = 1\n' })
  await call('read', { path: 'AGENTS.md' })
  await call('bash', { command: 'make build' })
  const live = ctx.jiyi.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const offline = auditStreams(
    [{ name: 'exported.jsonl', text: ctx.jiyi.exportStream().map((e) => JSON.stringify(e)).join('\n') }],
    { askfile: ASKFILE }
  )
  assert.equal(offline.calls, live.totals.callsObserved)
  assert.deepEqual(offline.score, live.score)
  assert.deepEqual(offline.counts, live.counts)
  // 手算：AGENTS.md 迟问 +5（读在写后）；Makefile 独谋显式 +15 → total 20
  assert.equal(offline.score.total, 20)
})

maybe('集成 10：门禁裁决翻转——gate 阈可调', async () => {
  const { ctx, call } = await mountJiyi({ askfile: ASKFILE, gate: 10 })
  await call('edit', { path: 'src/api.js', content: 'export const x = 1\n' })
  await call('bash', { command: 'ls' })
  const g = ctx.jiyi.gate()
  // AGENTS.md 独谋显式 15；Makefile 独谋显式 15 → 30
  assert.equal(g.score, 30)
  assert.equal(g.verdict, 'fail')
})
