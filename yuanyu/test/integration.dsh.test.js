/**
 * 真实集成测试 —— 渊鱼插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证九件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. read .env 探针立案（涉视 15、浊带黄牌不咬门）；
 *  3. 礼册 duty 注入后同探针本职 0 分；
 *  4. read 后 write 含值探针转运立案（45 渍门红）；
 *  5. 失败读探针不入账（未得）；
 *  6. exec cat 窥词法探针立案；
 *  7. exportStream() 导出流离线 audit 重放，案数与渊值与运行时账账实一致；
 *  8. gate 裁决翻转 + 鉴牌块两次渲染逐字节相同；
 *  9. 鉴牌块不含值原文（结构性掩码）。
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

const BOOK = { version: 1, duty: [], secrets: [], peeks: [], noDefaults: false }
const DUTY_BOOK = { version: 1, duty: ['.env'], secrets: [], peeks: [], noDefaults: false }
const SECRET = 'xoxb-1234567890abcdef'

const FILES = {
  '.env': `SLACK_TOKEN=${SECRET}\nLOG_LEVEL=debug\n`,
  '~/work/.npmrc': '//registry.npmjs.org/:_authToken=npm_xxx\n',
}

async function mountYuanyu(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const yuanyu = await import('../src/plugin/yuanyu.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(yuanyu, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.yuanyu, 'ctx.yuanyu')

  const { defineTool } = dshTools
  ctx.tools.register(defineTool({
    name: 'read',
    description: '读探针：cursed 径固定失败；其余按 FILES 表回正文',
    parameters: {
      path: { type: 'string', required: true, description: 'path' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (String(args.path).includes('cursed')) throw new Error(`simulated failure: ${args.path}`)
      return FILES[args.path] ?? `content of ${args.path}`
    },
  }))
  ctx.tools.register(defineTool({
    name: 'write',
    description: '写探针：cursed 径固定失败',
    parameters: {
      path: { type: 'string', required: true, description: 'path' },
      content: { type: 'string', description: '内容' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (String(args.path).includes('cursed')) throw new Error(`simulated failure: ${args.path}`)
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
  const { ctx, call } = await mountYuanyu({ book: BOOK })
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

maybe('集成 2：read .env 探针立案——涉视 15、浊带、门绿（黄牌点名）', async () => {
  const { ctx, call } = await mountYuanyu({ book: BOOK })
  await call('read', { path: '.env' })
  const r = ctx.yuanyu.report()
  assert.equal(r.counts.loads, 1)
  assert.equal(r.counts.sight, 1)
  assert.equal(r.score.total, 15)
  assert.equal(r.band, '浊')
  assert.equal(r.verdict, 'pass') // 单涉视黄牌不咬门
})

maybe('集成 3：礼册 duty 注入——同探针本职 0 分', async () => {
  const { ctx, call } = await mountYuanyu({ book: DUTY_BOOK })
  await call('read', { path: '.env' })
  const r = ctx.yuanyu.report()
  assert.deepEqual(r.counts, { loads: 1, duty: 1, sight: 0, spread: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.band, '澄')
})

maybe('集成 4：read 后 write 含值——转运立案 45 渍门红', async () => {
  const { ctx, call } = await mountYuanyu({ book: BOOK })
  await call('read', { path: '.env' })
  await call('write', { path: 'test/fixtures/token.txt', content: `captured: ${SECRET}\n` })
  const g = ctx.yuanyu.gate()
  assert.equal(g.score, 45)
  assert.equal(g.band, '渍')
  assert.equal(g.verdict, 'fail')
})

maybe('集成 5：失败读探针不入账——未得', async () => {
  const { ctx, call } = await mountYuanyu({ book: BOOK })
  await call('read', { path: 'cursed.env' })
  const r = ctx.yuanyu.report()
  assert.equal(r.totals.loads, 0)
  assert.equal(r.score.total, 0)
})

maybe('集成 6：exec cat 窥词法探针立案', async () => {
  const { ctx, call } = await mountYuanyu({ book: BOOK })
  await call('bash', { command: 'cat ~/work/.npmrc' })
  const r = ctx.yuanyu.report()
  assert.deepEqual(r.counts, { loads: 1, duty: 0, sight: 1, spread: 0 })
  assert.equal(r.score.total, 15)
})

maybe('集成 7：exportStream 导出流离线 audit 重放——账实一致（45 = 涉视 15 + 转运 30）', async () => {
  const { ctx, call } = await mountYuanyu({ book: BOOK })
  await call('read', { path: '.env' })
  await call('write', { path: 'out.txt', content: `token ${SECRET}` })
  const live = ctx.yuanyu.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.yuanyu.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: BOOK })

  assert.equal(replay.loads, live.totals.loads)
  assert.equal(replay.cases, live.cases)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 45)
  assert.deepEqual(replay.counts, live.counts)
})

maybe('集成 8：gate 裁决翻转 + 鉴牌块两次渲染逐字节相同', async () => {
  const { ctx, call } = await mountYuanyu({ book: BOOK, gate: 50 })
  await call('read', { path: '.env' })
  await call('bash', { command: 'cat ~/work/.npmrc' })
  assert.equal(ctx.yuanyu.gate({}).verdict, 'pass') // 30 < 50
  const a = ctx.yuanyu.paizi().text
  const b = ctx.yuanyu.paizi().text
  assert.equal(a, b)
  assert.match(a, /【渊鱼 · 鉴牌】/)
  assert.match(a, /涉视 ×2/)
})

maybe('集成 9：鉴牌块不含值原文——结构性掩码', async () => {
  const { ctx, call } = await mountYuanyu({ book: BOOK })
  await call('read', { path: '.env' })
  await call('write', { path: 'out.txt', content: SECRET })
  const text = ctx.yuanyu.paizi().text
  assert.ok(!text.includes(SECRET))
  assert.match(text, /fp:[0-9a-f]{16}\(len 21\)/)
  assert.match(text, /转运 ×1/)
})
