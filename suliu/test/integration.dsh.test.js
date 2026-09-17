/**
 * 真实集成测试 —— 溯流插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十四件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 净稿探针 → 0 过门；
 *  3. 单臆断探针 → 30 臆门红；
 *  4. 显疑探针 → 0 过门（推词门疑而后言不入罪）；
 *  5. 勘验望断探针 → 15 过门（黄牌不咬门）；
 *  6. 拔验探针 → 0 过门（动因验果皆在断言先）；
 *  7. 迟验探针 → 0 过门（拔验在后只留注记）；
 *  8. 演域探针 → 0；
 *  9. 臆册免案探针 → 0；
 * 10. 失败 write 探针不入因账；
 * 11. exportStream() 导出流离线 audit 重放账实一致；
 * 12. 溯牌块两次渲染逐字节相同且不含行原文与因面原文；
 * 13. gate 翻转 + report/ledger 服务口径；
 * 14. 新稿立撤探针（先臆断后净稿 → 0 过门）。
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

const BOOK = { version: 1, excuse: ['reports/internal/*'] }

const CLAIM = '根因是缓存过期导致的数据不一致。\n'
const CLAIM_EN = 'The root cause is a stale cache entry.\n'

async function mountSuliu(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const suliu = await import('../src/plugin/suliu.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(suliu, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.suliu, 'ctx.suliu')

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
    description: '读探针（正文固定含 cache——勘验之源）',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      return `cache miss storm · content of ${args.path}`
    },
  }))
  ctx.tools.register(defineTool({
    name: 'bash',
    description: '执行探针（成功即验果）',
    parameters: { command: { type: 'string', required: true, description: 'command' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      return `ran: ${args.command} (cache ok)`
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
  const { ctx, call } = await mountSuliu({ book: BOOK })
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
  const { ctx, call } = await mountSuliu({ book: BOOK })
  await call('write', { path: 'docs/postmortem.md', content: '服务已恢复，监控告警已解除。\n' })
  const r = ctx.suliu.report()
  assert.deepEqual(r.counts, { yd: 0, wd: 0, xy: 0, cy: 0, fy: 0 })
  assert.equal(r.band, '澈')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 3：单臆断探针——30 臆门红', async () => {
  const { ctx, call } = await mountSuliu({ book: BOOK })
  await call('write', { path: 'docs/postmortem.md', content: CLAIM })
  const r = ctx.suliu.report()
  assert.equal(r.counts.yd, 1)
  assert.equal(r.score.total, 30)
  assert.equal(r.verdict, 'fail')
  assert.match(ctx.suliu.ledger().issues[0], /臆断：docs\/postmortem\.md:1（指纹 [0-9a-f]+）/)
})

maybe('集成 4：显疑探针——0 过门（推词门疑而后言不入罪）', async () => {
  const { ctx, call } = await mountSuliu({ book: BOOK })
  await call('write', { path: 'docs/postmortem.md', content: '根因可能是缓存过期。\n' })
  const r = ctx.suliu.report()
  assert.equal(r.counts.xy, 1)
  assert.equal(r.counts.yd, 0)
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 5：勘验望断探针——15 过门（黄牌不咬门：看过≠验过）', async () => {
  const { ctx, call } = await mountSuliu({ book: BOOK })
  await call('read', { path: 'logs/app.log' }) // 正文含 cache → 勘验
  await call('write', { path: 'docs/postmortem.md', content: CLAIM_EN })
  const r = ctx.suliu.report()
  assert.equal(r.counts.wd, 1)
  assert.equal(r.score.total, 15)
  assert.equal(r.verdict, 'pass')
  assert.equal(r.band, '望')
})

maybe('集成 6：拔验探针——0 过门（动因 write 在先 ∧ 其后成功 bash 验果）', async () => {
  const { ctx, call } = await mountSuliu({ book: BOOK })
  await call('read', { path: 'config.json' })
  await call('write', { path: 'src/cache.js', content: '// fix cache expiry\n' })
  await call('bash', { command: 'node src/cache.js --verify' })
  await call('write', { path: 'docs/postmortem.md', content: CLAIM_EN })
  const r = ctx.suliu.report()
  assert.deepEqual(r.counts, { yd: 0, wd: 0, xy: 0, cy: 0, fy: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 7：迟验探针——0 过门（拔验对全在断言后，只留注记）', async () => {
  const { ctx, call } = await mountSuliu({ book: BOOK })
  await call('write', { path: 'docs/postmortem.md', content: CLAIM_EN })
  await call('write', { path: 'src/cache.js', content: '// fix cache expiry\n' })
  await call('bash', { command: 'node src/cache.js --verify' })
  const r = ctx.suliu.report()
  assert.equal(r.counts.cy, 1)
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 8：演域探针——0（tests/ 径豁免，无册）', async () => {
  const { ctx, call } = await mountSuliu({ book: null })
  await call('write', { path: 'tests/postmortem.spec.md', content: CLAIM })
  const r = ctx.suliu.report()
  assert.deepEqual(r.counts, { yd: 0, wd: 0, xy: 0, cy: 0, fy: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 9：臆册免案探针——0', async () => {
  const { ctx, call } = await mountSuliu({ book: BOOK })
  await call('write', { path: 'reports/internal/root-cause.md', content: CLAIM })
  const r = ctx.suliu.report()
  assert.deepEqual(r.counts, { yd: 0, wd: 0, xy: 0, cy: 0, fy: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 10：失败 write 探针不入因账——失败之写不是写', async () => {
  const { ctx, call } = await mountSuliu({ book: BOOK })
  await call('write', { path: 'cursed/postmortem.md', content: CLAIM }).catch(() => {})
  const r = ctx.suliu.report()
  assert.equal(r.totals.callsObserved, 1) // 调用被观察到了
  assert.deepEqual(r.counts, { yd: 0, wd: 0, xy: 0, cy: 0, fy: 0 }) // 但失败之写不入因账
  assert.equal(r.verdict, 'pass')
})

maybe('集成 11：exportStream 导出流离线 audit 重放——账实一致（臆断 30）', async () => {
  const { ctx, call } = await mountSuliu({ book: BOOK })
  await call('write', { path: 'docs/postmortem.md', content: CLAIM })
  const live = ctx.suliu.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.suliu.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: BOOK })

  assert.equal(replay.calls, live.totals.callsObserved)
  assert.deepEqual(replay.counts, live.counts)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 30)
})

maybe('集成 12：溯牌块两次渲染逐字节相同且不含行原文与因面原文', async () => {
  const { ctx, call } = await mountSuliu({ book: BOOK })
  await call('write', { path: 'docs/postmortem.md', content: CLAIM })
  const a = ctx.suliu.paizi().text
  const b = ctx.suliu.paizi().text
  assert.equal(a, b)
  assert.match(a, /【溯流 · 溯牌】/)
  assert.match(a, /臆册：免审 1 处（reports\/internal\/\*）/)
  assert.match(a, /臆断：docs\/postmortem\.md:1（指纹 [0-9a-f]+）/)
  assert.ok(!a.includes('缓存过期')) // 行原文与因面原文不进溯牌（掩码是结构性保证）
})

maybe('集成 13：gate 翻转 + report/ledger 服务口径——望断 15 在门 10 下翻红', async () => {
  const { ctx, call } = await mountSuliu({ book: BOOK, gate: 10 })
  await call('read', { path: 'logs/app.log' })
  await call('write', { path: 'docs/postmortem.md', content: CLAIM_EN })
  const r = ctx.suliu.report()
  assert.equal(r.totals.callsObserved, 2)
  const g = ctx.suliu.gate()
  assert.equal(g.score, 15)
  assert.equal(g.verdict, 'fail') // 15 ≥ 10 门翻
  const led = ctx.suliu.ledger()
  assert.equal(led.counts.wd, 1)
  assert.ok(led.cases[0].fp)
})

maybe('集成 14：新稿立撤探针——先臆断后净稿 0 过门', async () => {
  const { ctx, call } = await mountSuliu({ book: BOOK })
  await call('write', { path: 'docs/postmortem.md', content: CLAIM })
  assert.equal(ctx.suliu.report().verdict, 'fail') // 前稿有案
  await call('write', { path: 'docs/postmortem.md', content: '问题已定位，修复已上线。\n' })
  const r = ctx.suliu.report()
  assert.equal(r.counts.yd, 0) // 旧案随稿撤
  assert.equal(r.verdict, 'pass')
})
