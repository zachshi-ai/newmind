/**
 * 真实集成测试 —— 防川插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. write src 空捕探针 → 湮案 15 黄牌过门；
 *  3. write 双吞形（js + py）探针 → 30 塞门红；
 *  4. 导词在场探针 → 0 过门；
 *  5. 改净探针（写后重写）→ 已浚 0 过门；
 *  6. exec 重定向探针 → 沙川 0 过门；
 *  7. 失败 write 探针（isError）不入账；
 *  8. 川册纵列径探针 → 免扫 0；
 *  9. exportStream() 导出流离线 audit 重放，案数与塞值与运行时账账实一致；
 * 10. gate 裁决翻转 + 导牌块两次渲染逐字节相同且不含命中行原文。
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

const BOOK = { version: 1, indulge: ['src/best-effort/*'] }
const EMPTY_BOOK = { version: 1, indulge: [] }

const SWALLOW_JS = 'try {\n  load()\n} catch (e) {\n}\n'
const GOOD_JS = 'try {\n  load()\n} catch (e) {\n  throw e\n}\n'

async function mountFangchuan(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const fangchuan = await import('../src/plugin/fangchuan.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(fangchuan, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.fangchuan, 'ctx.fangchuan')

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
  const { ctx, call } = await mountFangchuan({ book: BOOK })
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

maybe('集成 2：write 空捕探针——湮案 15 黄牌过门', async () => {
  const { ctx, call } = await mountFangchuan({ book: BOOK })
  await call('write', { path: 'src/a.js', content: SWALLOW_JS })
  const r = ctx.fangchuan.report()
  assert.deepEqual(r.cases, { yan: 1, jun: 0, sha: 0, wu: 0 })
  assert.equal(r.score.total, 15)
  assert.equal(r.band, '淤')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 3：write 双吞形探针（js+py）——30 塞门红', async () => {
  const { ctx, call } = await mountFangchuan({ book: BOOK })
  await call('write', { path: 'src/a.js', content: SWALLOW_JS })
  await call('write', { path: 'src/b.py', content: 'try:\n    load()\nexcept Exception:\n    pass\n' })
  const g = ctx.fangchuan.gate()
  assert.equal(g.score, 30)
  assert.equal(g.band, '塞')
  assert.equal(g.verdict, 'fail')
})

maybe('集成 4：导词在场探针——0 过门（导不是湮）', async () => {
  const { ctx, call } = await mountFangchuan({ book: BOOK })
  await call('write', { path: 'src/h.js', content: 'try {\n  load()\n} catch (e) {\n  console.error(e)\n  throw e\n}\n' })
  await call('write', { path: 'src/p.js', content: 'fetch(u).catch(() => null)\n' })
  const r = ctx.fangchuan.report()
  assert.deepEqual(r.cases, { yan: 1, jun: 0, sha: 0, wu: 0 }) // p.js 空接 1 案；h.js 导词清白
})

maybe('集成 5：改净探针（写后重写）——已浚 0 过门', async () => {
  const { ctx, call } = await mountFangchuan({ book: EMPTY_BOOK })
  await call('write', { path: 'src/a.js', content: SWALLOW_JS })
  await call('write', { path: 'src/a.js', content: GOOD_JS })
  const r = ctx.fangchuan.report()
  assert.deepEqual(r.cases, { yan: 0, jun: 1, sha: 0, wu: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 6：exec 重定向探针——沙川 0 过门', async () => {
  const { ctx, call } = await mountFangchuan({ book: EMPTY_BOOK })
  await call('bash', { command: 'echo ok > src/a.js' })
  const r = ctx.fangchuan.report()
  assert.deepEqual(r.cases, { yan: 0, jun: 0, sha: 1, wu: 0 })
  assert.equal(r.verdict, 'pass')
})

maybe('集成 7：失败 write 探针不入账——失败之写不是写', async () => {
  const { ctx, call } = await mountFangchuan({ book: EMPTY_BOOK })
  await call('write', { path: 'cursed-a.js', content: SWALLOW_JS }).catch(() => {})
  const r = ctx.fangchuan.report()
  assert.equal(r.totals.callsObserved, 1) // 调用被观察到了
  assert.deepEqual(r.cases, { yan: 0, jun: 0, sha: 0, wu: 0 }) // 但失败之写不入账
  assert.equal(r.verdict, 'pass')
})

maybe('集成 8：川册纵列径探针——免扫 0', async () => {
  const { ctx, call } = await mountFangchuan({ book: BOOK })
  await call('write', { path: 'src/best-effort/cleanup.js', content: SWALLOW_JS })
  const r = ctx.fangchuan.report()
  assert.deepEqual(r.cases, { yan: 0, jun: 0, sha: 0, wu: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 9：exportStream 导出流离线 audit 重放——账实一致（双吞形 30）', async () => {
  const { ctx, call } = await mountFangchuan({ book: EMPTY_BOOK })
  await call('write', { path: 'src/a.js', content: SWALLOW_JS })
  await call('write', { path: 'src/b.py', content: 'try:\n    load()\nexcept Exception:\n    pass\n' })
  const live = ctx.fangchuan.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.fangchuan.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: EMPTY_BOOK })

  assert.equal(replay.calls, live.totals.callsObserved)
  assert.deepEqual(replay.cases, live.cases)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 30)
})

maybe('集成 10：gate 裁决翻转 + 导牌块两次渲染逐字节相同且不含命中行原文', async () => {
  const { ctx, call } = await mountFangchuan({ book: EMPTY_BOOK, gate: 10 })
  await call('write', { path: 'src/a.js', content: 'try {\n  涉密正文调用()\n} catch (e) {\n}\n' }) // 湮案 15
  assert.equal(ctx.fangchuan.gate().verdict, 'fail') // 15 ≥ 10
  const a = ctx.fangchuan.paizi().text
  const b = ctx.fangchuan.paizi().text
  assert.equal(a, b)
  assert.match(a, /【防川 · 导牌】/)
  assert.match(a, /湮案：src\/a\.js:3 空捕/)
  assert.ok(!a.includes('涉密正文调用')) // 命中行原文不进导牌（掩码是结构性保证）
})
