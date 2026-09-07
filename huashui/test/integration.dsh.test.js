/**
 * 真实集成测试 —— 画水插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 写前重读探针（读 V1 写 V2 重读 V2 写 V2E）→ 0 过门；
 *  3. 凭陈落笔探针（读 V1 写 V2 写 V3）→ 覆己 15 滞过门；
 *  4. --gate 10 探针 → 15 红门翻；
 *  5. 失败 write 探针（isError）不入账 → 0；
 *  6. 许复径探针（vendor/*）→ 免账 0；
 *  7. edit 无文中变探针 → 陈改注记 0；
 *  8. exportStream() 导出流离线 audit 重放，案数与陈值与运行时账账实一致；
 *  9. 水牌块两次渲染逐字节相同且不含行原文；
 * 10. report/ledger 服务口径：失败调用计入观察数但不入据账。
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

const BOOK = { version: 1, excuse: ['vendor/*'] }

const V1 = 'const a = 1\nconst b = 2\nconst c = 3\n'
const V2 = 'const a = 1\nconst d = 4\n'
const V2E = 'const a = 1\nconst d = 4\nconst e = 5\n'
const V3 = 'const a = 1\nconst b = 2\nconst c = 3\nconst e = 5\n'

async function mountHuashui(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const huashui = await import('../src/plugin/huashui.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(huashui, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.huashui, 'ctx.huashui')

  const { defineTool } = dshTools
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
    name: 'edit',
    description: '无文之写探针（不携全文）',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `edited:${args.path}` },
  }))
  ctx.tools.register(defineTool({
    name: 'read',
    description: '读探针：返回内存册的内容（供读据）',
    parameters: {
      path: { type: 'string', required: true, description: 'path' },
      content: { type: 'string', description: '内存册正文（探针用）' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      return args.content ?? ''
    },
  }))
  ctx.tools.register(defineTool({
    name: 'probe',
    description: '必炸探针',
    parameters: { path: { type: 'string', required: true, description: 'p' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute() { throw new Error('boom') },
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
  const { ctx, call } = await mountHuashui({ book: BOOK })
  let reached = false
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  ctx.tools.register(defineTool({
    name: 'probe2',
    description: '必炸探针 2',
    parameters: { path: { type: 'string', required: true, description: 'p' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute() { reached = true; throw new Error('boom') },
  }))
  await call('probe2', { path: 'x.js' }).catch(() => {})
  assert.ok(reached, '工具本体必须被执行（观察不拦截）')
})

maybe('集成 2：写前重读探针——0 过门', async () => {
  const { ctx, call } = await mountHuashui({ book: BOOK })
  await call('read', { path: 'src/a.js', content: V1 })
  await call('write', { path: 'src/a.js', content: V2 })
  await call('read', { path: 'src/a.js', content: V2 })
  await call('write', { path: 'src/a.js', content: V2E })
  const r = ctx.huashui.report()
  assert.deepEqual(r.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.band, '活')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 3：凭陈落笔探针——覆己 15 滞过门', async () => {
  const { ctx, call } = await mountHuashui({ book: BOOK })
  await call('read', { path: 'src/a.js', content: V1 })
  await call('write', { path: 'src/a.js', content: V2 })
  await call('write', { path: 'src/a.js', content: V3 })
  const r = ctx.huashui.report()
  assert.deepEqual(r.cases, { shi: 0, ji: 1, xian: 0, gai: 0 })
  assert.equal(r.score.total, 15)
  assert.equal(r.band, '滞')
  assert.equal(r.verdict, 'pass')
  assert.match(ctx.huashui.ledger().issues[0], /覆己：src\/a\.js（seq 3 覆 seq 2——陈线 2 · 新线 1）/)
})

maybe('集成 4：--gate 10 探针——15 红门翻', async () => {
  const { ctx, call } = await mountHuashui({ book: BOOK, gate: 10 })
  await call('read', { path: 'src/a.js', content: V1 })
  await call('write', { path: 'src/a.js', content: V2 })
  await call('write', { path: 'src/a.js', content: V3 })
  const g = ctx.huashui.gate()
  assert.equal(g.score, 15)
  assert.equal(g.verdict, 'fail')
})

maybe('集成 5：失败 write 探针不入账——失败之写不是写', async () => {
  const { ctx, call } = await mountHuashui({ book: BOOK })
  await call('read', { path: 'src/a.js', content: V1 })
  await call('write', { path: 'cursed/src/a.js', content: V2 }).catch(() => {})
  await call('write', { path: 'src/a.js', content: V3 })
  const r = ctx.huashui.report()
  assert.equal(r.totals.callsObserved, 3) // 调用被观察到了
  assert.deepEqual(r.cases, { shi: 0, ji: 0, xian: 0, gai: 0 }) // 但失败之写不生据也不生痕
  assert.equal(r.verdict, 'pass')
})

maybe('集成 6：许复径探针——免账 0', async () => {
  const { ctx, call } = await mountHuashui({ book: BOOK })
  await call('read', { path: 'vendor/fix/a.js', content: V1 })
  await call('write', { path: 'vendor/fix/a.js', content: V2 })
  await call('write', { path: 'vendor/fix/a.js', content: V3 })
  const r = ctx.huashui.report()
  assert.deepEqual(r.cases, { shi: 0, ji: 0, xian: 0, gai: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 7：edit 无文中变探针——陈改注记 0', async () => {
  const { ctx, call } = await mountHuashui({ book: BOOK })
  await call('read', { path: 'src/a.js', content: V1 })
  await call('edit', { path: 'src/a.js' })
  await call('write', { path: 'src/a.js', content: V3 })
  const r = ctx.huashui.report()
  assert.deepEqual(r.cases, { shi: 0, ji: 0, xian: 0, gai: 1 })
  assert.match(ctx.huashui.ledger().issues[0], /陈改：src\/a\.js（最近文据后无文之写 1 笔，判定不及）/)
})

maybe('集成 8：exportStream 导出流离线 audit 重放——账实一致（覆己 15）', async () => {
  const { ctx, call } = await mountHuashui({ book: BOOK })
  await call('read', { path: 'src/a.js', content: V1 })
  await call('write', { path: 'src/a.js', content: V2 })
  await call('write', { path: 'src/a.js', content: V3 })
  const live = ctx.huashui.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.huashui.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: BOOK })

  assert.equal(replay.calls, live.totals.callsObserved)
  assert.deepEqual(replay.cases, live.cases)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 15)
})

maybe('集成 9：水牌块两次渲染逐字节相同且不含行原文', async () => {
  const { ctx, call } = await mountHuashui({ book: BOOK })
  await call('read', { path: 'src/a.js', content: V1 })
  await call('write', { path: 'src/a.js', content: V2 })
  await call('write', { path: 'src/a.js', content: V3 })
  const a = ctx.huashui.paizi().text
  const b = ctx.huashui.paizi().text
  assert.equal(a, b)
  assert.match(a, /【画水 · 水牌】/)
  assert.match(a, /水册：许复 1 处（vendor\/\*）/)
  assert.match(a, /覆己：src\/a\.js（seq 3 覆 seq 2——陈线 2 · 新线 1）/)
  assert.ok(!a.includes('const b = 2')) // 行原文不进水牌（掩码是结构性保证）
})

maybe('集成 10：report/ledger 服务口径——观察数含失败、据账不含', async () => {
  const { ctx, call } = await mountHuashui({ book: BOOK })
  await call('probe', { path: 'x.js' }).catch(() => {})
  await call('read', { path: 'src/a.js', content: V1 })
  const r = ctx.huashui.report()
  assert.equal(r.totals.callsObserved, 2)
  assert.equal(r.totals.paths, 1)
  const led = ctx.huashui.ledger()
  assert.equal(led.findings.length, 0)
  assert.equal(led.counts.ji, 0)
})
