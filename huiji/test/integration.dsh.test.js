/**
 * 真实集成测试 —— 讳疾插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十二件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 净稿探针 → 已痊 0 过门；
 *  3. 单讳案探针 → 30 疾门红；
 *  4. 扫痊探针 → 0 过门；
 *  5. 服药不复诊探针 → 30 红；
 *  6. 泛愈探针 → 0；
 *  7. 否定卫探针 → 0；
 *  8. 静养探针 → 0；
 *  9. 痊册免案探针 → 0；
 * 10. 失败 write 探针不入稿账；
 * 11. exportStream() 导出流离线 audit 重放账实一致；
 * 12. 疾牌块两次渲染逐字节相同且不含行原文与对象词元原文。
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

const BOOK = { version: 1, allow: ['docs/internal/*'] }

const CLAIM = '# 报告\n\nauth 模块测试通过，可以交付。'
const GUARDED = '# 报告\n\nauth 尚未全部通过，仍有失败。'

async function mountHuiji(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const huiji = await import('../src/plugin/huiji.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(huiji, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.huiji, 'ctx.huiji')

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
    name: 'bash',
    description: '执行探针（含 cursedfail 时固定失败）',
    parameters: { command: { type: 'string', required: true, description: 'command' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (String(args.command).includes('cursedfail')) throw new Error(`simulated failure: ${args.command}`)
      return `ran: ${args.command} (ok)`
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
  const { ctx, call } = await mountHuiji({ book: BOOK })
  let reached = false
  const dshTools = await import('@deepseek-ai/dsh-tools')
  ctx.tools.register(dshTools.defineTool({
    name: 'probe2',
    description: '必炸探针 2',
    parameters: { path: { type: 'string', required: true, description: 'p' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute() { reached = true; throw new Error('boom2') },
  }))
  await call('probe2', { path: 'x.js' }).catch(() => {})
  assert.ok(reached, '工具本体必须被执行（观察不拦截）')
})

maybe('集成 2：净稿探针 → 已痊 0 过门', async () => {
  const { ctx, call } = await mountHuiji({ book: BOOK })
  await call('bash', { command: 'npm test -- auth' })
  await call('write', { path: 'docs/report.md', content: CLAIM })
  const r = ctx.huiji.report()
  assert.equal(r.totals.paths, 1)
  assert.equal(r.counts.hui + r.counts.fy + r.counts.zhi, 0)
  assert.equal(r.counts.yu, 1)
  assert.equal(r.ok, true)
  assert.equal(r.band, '安')
})

maybe('集成 3：单讳案探针 → 30 疾门红', async () => {
  const { ctx, call } = await mountHuiji({ book: BOOK })
  await call('bash', { command: 'npm test -- auth && cursedfail' }).catch(() => {})
  await call('write', { path: 'docs/report.md', content: CLAIM })
  const g = ctx.huiji.gate()
  assert.equal(g.score, 30)
  assert.equal(g.band, '疾')
  assert.equal(g.verdict, 'fail')
  const led = ctx.huiji.ledger()
  assert.equal(led.cases.length, 1)
  assert.equal(led.cases[0].type, '讳案')
})

maybe('集成 4：扫痊探针 → 0 过门（全量复验洗全科）', async () => {
  const { ctx, call } = await mountHuiji({ book: BOOK })
  await call('bash', { command: 'npm test && cursedfail' }).catch(() => {})
  await call('bash', { command: 'npm test' })
  await call('write', { path: 'docs/report.md', content: CLAIM })
  const r = ctx.huiji.report()
  assert.equal(r.counts.hui, 0)
  assert.equal(r.ok, true)
})

maybe('集成 5：服药不复诊探针 → 30 红（write 永不生痊）', async () => {
  const { ctx, call } = await mountHuiji({ book: BOOK })
  await call('bash', { command: 'npm test -- auth && cursedfail' }).catch(() => {})
  await call('write', { path: 'src/auth.js', content: 'export const fix = 1\n' })
  await call('write', { path: 'docs/report.md', content: '# 报告\n\nauth 修复完成。' })
  const g = ctx.huiji.gate()
  assert.equal(g.score, 30)
  assert.equal(g.verdict, 'fail')
})

maybe('集成 6：泛愈探针 → 0', async () => {
  const { ctx, call } = await mountHuiji({ book: BOOK })
  await call('bash', { command: 'npm test -- auth && cursedfail' }).catch(() => {})
  await call('write', { path: 'docs/report.md', content: '# 报告\n\n本次任务全部完成，测试通过。' })
  const r = ctx.huiji.report()
  assert.equal(r.counts.fy, 1)
  assert.equal(r.score.total, 0)
})

maybe('集成 7：否定卫探针 → 0', async () => {
  const { ctx, call } = await mountHuiji({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: GUARDED })
  const r = ctx.huiji.report()
  assert.equal(r.totals.rows, 0)
  assert.equal(r.counts.hui, 0)
})

maybe('集成 8：静养探针 → 0', async () => {
  const { ctx, call } = await mountHuiji({ book: BOOK })
  await call('bash', { command: 'npm test -- auth && cursedfail' }).catch(() => {})
  await call('write', { path: 'drafts/report.md', content: CLAIM })
  const r = ctx.huiji.report()
  assert.equal(r.totals.paths, 0)
  assert.equal(r.counts.hui, 0)
})

maybe('集成 9：痊册免案探针 → 0', async () => {
  const { ctx, call } = await mountHuiji({ book: BOOK })
  await call('bash', { command: 'npm test -- auth && cursedfail' }).catch(() => {})
  await call('write', { path: 'docs/internal/report.md', content: CLAIM })
  const r = ctx.huiji.report()
  assert.equal(r.totals.paths, 0)
  assert.equal(r.counts.hui, 0)
})

maybe('集成 10：失败 write 探针不入稿账', async () => {
  const { ctx, call } = await mountHuiji({ book: BOOK })
  await call('write', { path: 'docs/cursed-report.md', content: CLAIM }).catch(() => {})
  const r = ctx.huiji.report()
  assert.equal(r.totals.paths, 0)
})

maybe('集成 11：exportStream() 导出流离线 audit 重放账实一致', async () => {
  const { ctx, call } = await mountHuiji({ book: BOOK })
  await call('bash', { command: 'npm test -- auth && cursedfail' }).catch(() => {})
  await call('write', { path: 'docs/report.md', content: CLAIM })
  const online = ctx.huiji.gate()
  const { auditStreams } = await import('../src/core/audit.js')
  const offline = auditStreams([{ name: 'export.jsonl', text: ctx.huiji.exportStream().map((e) => JSON.stringify(e)).join('\n') }], { book: BOOK })
  assert.equal(online.score, offline.score.total)
  assert.equal(offline.counts.hui, 1)
  assert.equal(offline.band, '疾')
})

maybe('集成 12：疾牌块两次渲染逐字节相同且不含行原文与对象词元原文', async () => {
  const { ctx, call } = await mountHuiji({ book: BOOK })
  await call('bash', { command: 'npm test -- auth && cursedfail' }).catch(() => {})
  await call('write', { path: 'docs/report.md', content: CLAIM })
  const t1 = ctx.huiji.paizi().text
  const t2 = ctx.huiji.paizi().text
  assert.equal(t1, t2)
  assert.equal(t1.includes('auth'), false)
  assert.equal(t1.includes('测试通过'), false)
  assert.match(t1, /讳案：docs\/report\.md:3（指纹 [0-9a-f]+）/)
  assert.match(t1, /痊册：免审 1 处/)
  const rep = ctx.huiji.report()
  assert.equal(rep.totals.callsObserved, 2)
})
