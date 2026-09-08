/**
 * 真实集成测试 —— 市虎插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 守状探针（声明对象有作工）→ 0 过门；
 *  3. 虚功探针（声明对象查无）→ 虚功 30 虎红门；
 *  4. --gate 10 探针 → 30 红门翻；
 *  5. 掠据探针（引用署名）→ 0；
 *  6. 失败 exec 探针 → 仍入作工面（有据——试错也是始）；
 *  7. exempt 径探针 → 免账 0；
 *  8. exportStream() 导出流离线 audit 重放，案数与虎值与运行时账账实一致；
 *  9. 状牌块两次渲染逐字节相同且不含行原文；
 * 10. report/ledger 服务口径：失败调用计入观察数但虚功只对自态。
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

const BOOK = { version: 1, exempt: ['archive/*'] }

async function mountShihu(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const shihu = await import('../src/plugin/shihu.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(shihu, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.shihu, 'ctx.shihu')

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
    description: '读探针：返回内存册的内容',
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
    name: 'bash',
    description: '命令探针：含 boom 即失败',
    parameters: {
      command: { type: 'string', required: true, description: 'command' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (String(args.command).includes('boom')) throw new Error(`simulated failure: ${args.command}`)
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
  const { ctx, call } = await mountShihu({ book: BOOK })
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

maybe('集成 2：守状探针（声明对象有作工）——0 过门', async () => {
  const { ctx, call } = await mountShihu({ book: BOOK })
  await call('write', { path: 'src/a.js', content: 'fixed' })
  await call('bash', { command: 'npm test' })
  await call('write', { path: 'HANDOFF.md', content: '- [x] 修复 src/a.js 空指针\n- [x] npm test 全绿\n' })
  const r = ctx.shihu.report()
  assert.deepEqual(r.cases, { xu: 0, lue: 0, wu: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.band, '真')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 3：虚功探针（声明对象查无）——虚功 30 虎红门', async () => {
  const { ctx, call } = await mountShihu({ book: BOOK })
  await call('write', { path: 'src/a.js', content: 'fixed' })
  await call('write', { path: 'HANDOFF.md', content: '# HANDOFF\n\n- [x] 修复 src/b.js 空指针\n' })
  const r = ctx.shihu.report()
  assert.deepEqual(r.cases, { xu: 1, lue: 0, wu: 0 })
  assert.equal(r.score.total, 30)
  assert.equal(r.band, '虎')
  assert.equal(r.verdict, 'fail')
  assert.match(ctx.shihu.ledger().issues[0], /虚功：HANDOFF\.md:3（状键 src\/b\.js、空指针——本会话作工面查无）/)
})

maybe('集成 4：--gate 10 探针——30 红门翻', async () => {
  const { ctx, call } = await mountShihu({ book: BOOK, gate: 10 })
  await call('write', { path: 'src/a.js', content: 'fixed' })
  await call('write', { path: 'HANDOFF.md', content: '- [x] 修复 src/b.js 空指针\n' })
  const g = ctx.shihu.gate()
  assert.equal(g.score, 30)
  assert.equal(g.verdict, 'fail')
})

maybe('集成 5：掠据探针（引用署名）——0 分', async () => {
  const { ctx, call } = await mountShihu({ book: BOOK })
  await call('write', { path: 'HANDOFF.md', content: '- [x] 上游会话已完成 docs 迁移\n' })
  const r = ctx.shihu.report()
  assert.deepEqual(r.cases, { xu: 0, lue: 1, wu: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 6：失败 exec 探针——仍入作工面（试错也是始）', async () => {
  const { ctx, call } = await mountShihu({ book: BOOK })
  await call('bash', { command: 'npm install left-pad boom' }).catch(() => {})
  await call('write', { path: 'HANDOFF.md', content: '- [x] 安装 left-pad 依赖\n' })
  const r = ctx.shihu.report()
  assert.equal(r.totals.callsObserved, 2)
  assert.deepEqual(r.cases, { xu: 0, lue: 0, wu: 0 }) // 失败 exec 也是作工
  assert.equal(r.verdict, 'pass')
})

maybe('集成 7：exempt 径探针——免账 0', async () => {
  const { ctx, call } = await mountShihu({ book: BOOK })
  await call('write', { path: 'archive/HANDOFF.md', content: '- [x] 修复 src/b.js 空指针\n' })
  const r = ctx.shihu.report()
  assert.deepEqual(r.cases, { xu: 0, lue: 0, wu: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 8：exportStream 导出流离线 audit 重放——账实一致（虚功 30）', async () => {
  const { ctx, call } = await mountShihu({ book: BOOK })
  await call('write', { path: 'src/a.js', content: 'fixed' })
  await call('write', { path: 'HANDOFF.md', content: '- [x] 修复 src/b.js 空指针\n' })
  const live = ctx.shihu.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.shihu.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: BOOK })

  assert.equal(replay.calls, live.totals.callsObserved)
  assert.deepEqual(replay.cases, live.cases)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 30)
})

maybe('集成 9：状牌块两次渲染逐字节相同且不含行原文', async () => {
  const { ctx, call } = await mountShihu({ book: BOOK })
  await call('write', { path: 'src/a.js', content: 'fixed' })
  await call('write', { path: 'HANDOFF.md', content: '- [x] 修复 src/b.js 空指针\n' })
  const a = ctx.shihu.paizi().text
  const b = ctx.shihu.paizi().text
  assert.equal(a, b)
  assert.match(a, /【市虎 · 状牌】/)
  assert.match(a, /状册：豁免 1 处（archive\/\*）/)
  assert.match(a, /虚功：HANDOFF\.md:1（状键 src\/b\.js、空指针——本会话作工面查无）/)
  assert.ok(!a.includes('修复 src/b.js 空指针\n'.slice(0, 8))) // 行原文不进状牌（掩码是结构性保证）
})

maybe('集成 10：report/ledger 服务口径——观察数含失败、虚功只对自态', async () => {
  const { ctx, call } = await mountShihu({ book: BOOK })
  await call('probe', { path: 'x.js' }).catch(() => {})
  await call('write', { path: 'src/a.js', content: 'fixed' })
  const r = ctx.shihu.report()
  assert.equal(r.totals.callsObserved, 2)
  assert.equal(r.totals.paths, 0)
  const led = ctx.shihu.ledger()
  assert.equal(led.findings.length, 0)
  assert.equal(led.counts.xu, 0)
})
