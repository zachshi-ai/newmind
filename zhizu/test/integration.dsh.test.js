/**
 * 真实集成测试 —— 知足插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证六件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 量出式插件在真实管道上正确工作（巨写/创笔/屡改/蔓延/豁免/失败写不入账）；
 *  3. 量牌块两次渲染逐字节相同；
 *  4. 账实对账：exportStream() 导出流离线 audit 重放，案数与溢值与运行时账逐字一致；
 *  5. gate 裁决可调；
 *  6. 读探针的先见与写探针的改笔判定在真实结果流上成立。
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

const BOOK = { version: 1, exempt: [], hugeLines: 400, fanDirs: 6, fanFiles: 20, churnFree: 3 }
const EXEMPT_BOOK = { version: 1, exempt: ['vendor/'], hugeLines: 400, fanDirs: 6, fanFiles: 20, churnFree: 3 }

const N = (n, tag = 'x') => Array.from({ length: n }, (_, i) => `${tag} ${i}`).join('\n')

async function mountZhizu(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const zhizu = await import('../src/plugin/zhizu.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(zhizu, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.zhizu, 'ctx.zhizu')

  const { defineTool } = dshTools
  ctx.tools.register(defineTool({
    name: 'edit',
    description: '写探针：path 含 cursed 时固定失败',
    parameters: {
      path: { type: 'string', required: true, description: 'path' },
      content: { type: 'string', description: '内容' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.path.includes('cursed')) throw new Error(`simulated failure: ${args.path}`)
      return `edited:${args.path}`
    },
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
    description: '读探针：path 含 missing 时固定失败',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.path.includes('missing')) throw new Error(`simulated failure: ${args.path}`)
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
  const { ctx, call } = await mountZhizu({ book: BOOK })
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

maybe('集成 2：先读后巨写探针立案——溢值 30、带「溢」、门红', async () => {
  const { ctx, call } = await mountZhizu({ book: BOOK })
  await call('read', { path: 'src/api.js' })
  await call('edit', { path: 'src/api.js', content: N(450, 'api') })
  const g = ctx.zhizu.gate()
  assert.equal(g.score, 30)
  assert.equal(g.band, '溢')
  assert.equal(g.verdict, 'fail')
})

maybe('集成 3：创笔大写免记——新文件脚手架 0 分、注记 1', async () => {
  const { ctx, call } = await mountZhizu({ book: BOOK })
  await call('edit', { path: 'src/generated/schema.js', content: N(401, 'schema') })
  const r = ctx.zhizu.report()
  assert.equal(r.counts.freshNotes, 1)
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 4：同径反复写探针——屡改 1 案 10 分俭带', async () => {
  const { ctx, call } = await mountZhizu({ book: BOOK })
  for (let i = 0; i < 6; i++) await call('edit', { path: 'src/loop.js', content: `v${i}\n` })
  const r = ctx.zhizu.report()
  assert.equal(r.counts.churns, 1)
  assert.equal(r.score.total, 10)
  assert.equal(r.band, '俭')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 5：多目录写探针——蔓延 1 案 20 分盈带', async () => {
  const { ctx, call } = await mountZhizu({ book: BOOK })
  for (const d of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) await call('edit', { path: `${d}/f.js`, content: 'x\n' })
  const r = ctx.zhizu.report()
  assert.equal(r.counts.fanouts, 1)
  assert.equal(r.score.total, 20)
  assert.equal(r.band, '盈')
})

maybe('集成 6：失败写不入账——探针失败后溢值 0', async () => {
  const { ctx, call } = await mountZhizu({ book: BOOK })
  await call('read', { path: 'src/api.js' })
  await call('edit', { path: 'src/cursed.js', content: N(450, 'api') }) // 探针固定失败
  const r = ctx.zhizu.report()
  assert.equal(r.counts.hugeWrites, 0)
  assert.equal(r.score.total, 0)
})

maybe('集成 7：足册豁免——vendor/ 径全免出账', async () => {
  const { ctx, call } = await mountZhizu({ book: EXEMPT_BOOK })
  await call('read', { path: 'vendor/lib.js' })
  await call('edit', { path: 'vendor/lib.js', content: N(450, 'v') })
  const r = ctx.zhizu.report()
  assert.equal(r.counts.exempted, 1)
  assert.equal(r.counts.hugeWrites, 0)
  assert.equal(r.score.total, 0)
})

maybe('集成 8：量牌块两次渲染逐字节相同', async () => {
  const { ctx, call } = await mountZhizu({ book: EXEMPT_BOOK })
  await call('edit', { path: 'vendor/lib.js', content: N(3, 'v') })
  const a = ctx.zhizu.liangpai().text
  const b = ctx.zhizu.liangpai().text
  assert.equal(a, b)
  assert.match(a, /【知足 · 量牌】/)
  assert.match(a, /vendor\//)
})

maybe('集成 9：exportStream 导出流离线 audit 重放——账实一致（50 = 巨写 30 + 蔓延 20）', async () => {
  const { ctx, call } = await mountZhizu({ book: BOOK })
  await call('read', { path: 'src/big.js' })
  await call('edit', { path: 'src/big.js', content: N(450, 'big') })
  for (const d of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) await call('edit', { path: `${d}/f.js`, content: 'x\n' })
  const live = ctx.zhizu.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const offline = auditStreams(
    [{ name: 'exported.jsonl', text: ctx.zhizu.exportStream().map((e) => JSON.stringify(e)).join('\n') }],
    { book: BOOK },
  )
  assert.equal(offline.cases, live.cases)
  assert.equal(offline.score.total, live.score.total)
  assert.equal(offline.score.total, 50) // 巨写 30 + 蔓延 20
  assert.deepEqual(offline.counts, live.counts)
  assert.equal(offline.counts.hugeWrites, 1)
  assert.equal(offline.counts.fanouts, 1)
})

maybe('集成 10：门禁裁决翻转——gate 阈可调', async () => {
  const { ctx, call } = await mountZhizu({ book: BOOK, gate: 21 })
  for (const d of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) await call('edit', { path: `${d}/f.js`, content: 'x\n' })
  const g = ctx.zhizu.gate()
  assert.equal(g.score, 20)
  assert.equal(g.verdict, 'pass') // 20 < 21
})
