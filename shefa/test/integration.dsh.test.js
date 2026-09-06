/**
 * 真实集成测试 —— 舍筏插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证九件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. write 筏形探针立案（域内遗 15 滞带黄牌）；
 *  3. exec cp 筏形探针立案（词法落物）；
 *  4. rm 探针销案（舍）；
 *  5. git add+commit 探针销案（归）；
 *  6. keep 在册豁免（完全出账）；
 *  7. /tmp 写探针外逸即红（单案 30 积带）；
 *  8. exportStream() 导出流离线 audit 重放，案数与筏值与运行时账账实一致；
 *  9. gate 裁决翻转 + 舍牌块两次渲染逐字节相同。
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

const BOOK = { version: 1, keep: [], raft: [], roots: [], noDefaults: false }
const KEEP_BOOK = { version: 1, keep: ['vendor/'], raft: [], roots: [], noDefaults: false }

async function mountShefa(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const shefa = await import('../src/plugin/shefa.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(shefa, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.shefa, 'ctx.shefa')

  const { defineTool } = dshTools
  ctx.tools.register(defineTool({
    name: 'write',
    description: '写探针：path 含 cursed 时固定失败',
    parameters: {
      path: { type: 'string', required: true, description: 'path' },
      content: { type: 'string', description: '内容' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.path.includes('cursed')) throw new Error(`simulated failure: ${args.path}`)
      return `wrote:${args.path}`
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
  const { ctx, call } = await mountShefa({ book: BOOK })
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

maybe('集成 2：write 筏形探针立案——域内遗 15、带「滞」、门绿（黄牌点名）', async () => {
  const { ctx, call } = await mountShefa({ book: BOOK })
  await call('write', { path: 'scratch/repro.js', content: 'probe\n' })
  const r = ctx.shefa.report()
  assert.equal(r.counts.dropped, 1)
  assert.equal(r.counts.left, 1)
  assert.equal(r.score.total, 15)
  assert.equal(r.band, '滞')
  assert.equal(r.verdict, 'pass') // 单案域内遗黄牌不咬门
})

maybe('集成 3：exec cp 筏形探针立案——词法落物（.bak 域内遗）', async () => {
  const { ctx, call } = await mountShefa({ book: BOOK })
  await call('bash', { command: 'cp src/util.js src/util.js.bak' })
  const r = ctx.shefa.report()
  assert.equal(r.totals.rafts, 1)
  assert.equal(r.counts.left, 1)
  assert.equal(r.score.total, 15)
})

maybe('集成 4：rm 探针销案——舍后筏值 0', async () => {
  const { ctx, call } = await mountShefa({ book: BOOK })
  await call('write', { path: 'scratch/repro.js', content: 'probe\n' })
  await call('bash', { command: 'rm scratch/repro.js' })
  const r = ctx.shefa.report()
  assert.deepEqual(r.counts, { dropped: 1, removed: 1, adopted: 0, exempted: 0, left: 0, stray: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 5：git add+commit 探针销案——收编合法（归）', async () => {
  const { ctx, call } = await mountShefa({ book: BOOK })
  await call('write', { path: 'scratch/check.js', content: 'probe\n' })
  await call('bash', { command: 'git add scratch/check.js' })
  await call('bash', { command: "git commit -m 'adopt probe'" })
  const r = ctx.shefa.report()
  assert.equal(r.counts.adopted, 1)
  assert.equal(r.score.total, 0)
})

maybe('集成 6：keep 在册豁免——vendor/ 径完全出账；失败写不入账', async () => {
  const { ctx, call } = await mountShefa({ book: KEEP_BOOK })
  await call('write', { path: 'vendor/tmp.lib.js', content: 'probe\n' })
  await call('write', { path: 'scratch/cursed.js', content: 'probe\n' }) // 探针固定失败
  const r = ctx.shefa.report()
  assert.equal(r.counts.exempted, 1)
  assert.equal(r.totals.rafts, 0) // 豁免完全出账不占落物笔数、失败写不入——两笔都不进筏账
  assert.equal(r.counts.left, 0)
  assert.equal(r.score.total, 0)
})

maybe('集成 7：/tmp 写探针外逸即红——单案 30 积带、门红', async () => {
  const { ctx, call } = await mountShefa({ book: BOOK })
  await call('write', { path: '/tmp/shefa-probe.py', content: 'probe\n' })
  const g = ctx.shefa.gate()
  assert.equal(g.score, 30)
  assert.equal(g.band, '积')
  assert.equal(g.verdict, 'fail')
})

maybe('集成 8：exportStream 导出流离线 audit 重放——账实一致（45 = 遗 15 + 外逸 30）', async () => {
  const { ctx, call } = await mountShefa({ book: BOOK })
  await call('write', { path: 'scratch/repro.js', content: 'probe\n' })
  await call('bash', { command: 'rm scratch/repro.js' })
  await call('write', { path: 'scratch/left.js', content: 'probe\n' })
  await call('write', { path: '/tmp/probe-dump.json', content: 'probe\n' })
  const live = ctx.shefa.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.shefa.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: BOOK })

  assert.equal(replay.rafts, live.totals.rafts)
  assert.equal(replay.cases, live.cases)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 45)
  assert.deepEqual(replay.counts, live.counts)
})

maybe('集成 9：gate 裁决翻转 + 舍牌块两次渲染逐字节相同', async () => {
  const { ctx, call } = await mountShefa({ book: KEEP_BOOK })
  await call('write', { path: 'vendor/x.bak', content: 'probe\n' })
  assert.equal(ctx.shefa.gate({}).verdict, 'pass')
  const a = ctx.shefa.shepai().text
  const b = ctx.shefa.shepai().text
  assert.equal(a, b)
  assert.match(a, /【舍筏 · 舍牌】/)
  assert.match(a, /keep vendor\//)
})
