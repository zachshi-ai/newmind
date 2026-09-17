/**
 * 真实集成测试 —— 察传插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十四件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 净稿探针 → 0 过门；
 *  3. 单幻言探针 → 30 诞门红；
 *  4. 目见在前探针（先读后言）→ 0 过门；
 *  5. 迟证探针（先言后读）→ 0 过门；
 *  6. 疑言探针 → 15 过门（黄牌不咬门）；
 *  7. 靶场探针 → 0；
 *  8. 证册免案探针 → 0；
 *  9. 基径探针 → 0；
 * 10. 失败 write 探针不入稿账；
 * 11. exportStream() 导出流离线 audit 重放账实一致；
 * 12. 证牌块两次渲染逐字节相同且不含行原文；
 * 13. gate 翻转 + report/ledger 服务口径；
 * 14. 末稿立撤探针（先幻言后净 → 0 过门）。
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

const BOOK = { version: 1, excuse: ['docs/reports/*'], grounds: [] }
const BOOK_G = { version: 1, excuse: [], grounds: ['src/config.js'] }

const CLAIM = '配置集中在 src/config.js，使用 CommonJS 导出。\n'

async function mountChachu(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const chachu = await import('../src/plugin/chachu.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(chachu, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.chachu, 'ctx.chachu')

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
    name: 'read',
    description: '读探针',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      return `content of ${args.path}`
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
  const { ctx, call } = await mountChachu({ book: BOOK })
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

maybe('集成 2：净稿探针——0 过门', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK })
  await call('write', { path: 'docs/notes.md', content: '重构说明：内部实现调整，详见 src/index.js。\n' })
  const r = ctx.chachu.report()
  assert.deepEqual(r.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
  assert.equal(r.band, '彰')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 3：单幻言探针——30 诞门红', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: CLAIM })
  const r = ctx.chachu.report()
  assert.equal(r.counts.hy, 1)
  assert.equal(r.score.total, 30)
  assert.equal(r.verdict, 'fail')
  assert.match(ctx.chachu.ledger().issues[0], /幻言：docs\/report\.md:1 指物 src\/config\.js（指纹 [0-9a-f]+）/)
})

maybe('集成 4：目见在前探针——0 过门', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK })
  await call('read', { path: 'src/config.js' })
  await call('write', { path: 'docs/report.md', content: CLAIM })
  const r = ctx.chachu.report()
  assert.equal(r.counts.hy, 0)
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 5：迟证探针——0 过门（后见补据，注记不判）', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: CLAIM })
  await call('read', { path: 'src/config.js' })
  const r = ctx.chachu.report()
  assert.equal(r.counts.cz, 1)
  assert.equal(r.counts.hy, 0)
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 6：疑言探针——15 过门（黄牌不咬门）', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: '测试位于 tests 目录。\n' })
  const r = ctx.chachu.report()
  assert.equal(r.counts.yy, 1)
  assert.equal(r.score.total, 15)
  assert.equal(r.verdict, 'pass')
  assert.equal(r.band, '疑')
})

maybe('集成 7：靶场探针——0（tests/ 径豁免，无册）', async () => {
  const { ctx, call } = await mountChachu({ book: null })
  await call('write', { path: 'tests/fixtures/handoff.md', content: CLAIM })
  const r = ctx.chachu.report()
  assert.deepEqual(r.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 8：证册免案探针——0', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK })
  await call('write', { path: 'docs/reports/audit.md', content: CLAIM })
  const r = ctx.chachu.report()
  assert.deepEqual(r.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 9：基径探针——0（grounds 在册明言）', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK_G })
  await call('write', { path: 'docs/report.md', content: CLAIM })
  const r = ctx.chachu.report()
  assert.deepEqual(r.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
  assert.equal(r.verdict, 'pass')
})

maybe('集成 10：失败 write 探针不入稿账——失败之写不是写', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK })
  await call('write', { path: 'cursed/report.md', content: CLAIM }).catch(() => {})
  const r = ctx.chachu.report()
  assert.equal(r.totals.callsObserved, 1) // 调用被观察到了
  assert.deepEqual(r.counts, { hy: 0, yy: 0, cz: 0, xz: 0 }) // 但失败之写不入稿账
  assert.equal(r.verdict, 'pass')
})

maybe('集成 11：exportStream 导出流离线 audit 重放——账实一致（幻言 30）', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: CLAIM })
  const live = ctx.chachu.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.chachu.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: BOOK })

  assert.equal(replay.calls, live.totals.callsObserved)
  assert.deepEqual(replay.counts, live.counts)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 30)
})

maybe('集成 12：证牌块两次渲染逐字节相同且不含行原文', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: CLAIM })
  const a = ctx.chachu.paizi().text
  const b = ctx.chachu.paizi().text
  assert.equal(a, b)
  assert.match(a, /【察传 · 证牌】/)
  assert.match(a, /证册：免审 1 处（docs\/reports\/\*）/)
  assert.match(a, /幻言：docs\/report\.md:1 指物 src\/config\.js（指纹 [0-9a-f]+）/)
  assert.ok(!a.includes('配置集中在')) // 行原文不进证牌（掩码是结构性保证）
})

maybe('集成 13：gate 翻转 + report/ledger 服务口径——疑言 15 在门 10 下翻红', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK, gate: 10 })
  await call('write', { path: 'docs/report.md', content: '测试位于 tests 目录。\n' })
  const r = ctx.chachu.report()
  assert.equal(r.totals.callsObserved, 1)
  const g = ctx.chachu.gate()
  assert.equal(g.score, 15)
  assert.equal(g.verdict, 'fail') // 15 ≥ 10 门翻
  const led = ctx.chachu.ledger()
  assert.equal(led.counts.yy, 1)
  assert.ok(led.cases[0].fp)
})

maybe('集成 14：末稿立撤探针——先幻言后净 0 过门', async () => {
  const { ctx, call } = await mountChachu({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: CLAIM })
  assert.equal(ctx.chachu.report().verdict, 'fail') // 前稿有案
  await call('write', { path: 'docs/report.md', content: '重构说明：内部实现调整。\n' })
  const r = ctx.chachu.report()
  assert.equal(r.counts.hy, 0) // 旧案随稿撤
  assert.equal(r.verdict, 'pass')
})
