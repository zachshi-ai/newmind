/**
 * 真实集成测试 —— 扫屋插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 净卷探针（写 V1）→ 0 过门；
 *  3. 遗针探针（写含 debugger）→ 遗针 30 垢红门；
 *  4. 遗屑探针（写含 console.log DEBUG）→ 遗屑 15 蒙过门；
 *  5. gate 10 探针 → 15 红门翻；
 *  6. 失败 write 探针（isError）不入账 → 0；
 *  7. 许留径探针（scripts/*）→ 免账 0；
 *  8. 已扫探针（先撒后净）→ 注记 0；
 *  9. exportStream() 导出流离线 audit 重放，案数与垢值与运行时账账实一致；
 * 10. 帚牌块两次渲染逐字节相同且不含行原文；report/ledger 口径：失败调用
 *     计入观察数但不入帚账。
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

const BOOK = { version: 1, retain: ['scripts/*'] }

const V1 = 'export function id(x) {\n  return x\n}\n'
const VZHEN = 'export function check(t) {\n  debugger;\n  return t\n}\n'
const VXIE = 'export function check(t) {\n  console.log("DEBUG: token =", t)\n  return t\n}\n'

async function mountSaowu(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const saowu = await import('../src/plugin/saowu.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(saowu, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.saowu, 'ctx.saowu')

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
  const { ctx, call } = await mountSaowu({ book: BOOK })
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

maybe('集成 2：净卷探针——0 过门', async () => {
  const { ctx, call } = await mountSaowu({ book: BOOK })
  await call('write', { path: 'src/a.js', content: V1 })
  const r = ctx.saowu.report()
  assert.equal(r.cases.zhen, 0)
  assert.equal(r.cases.xie, 0)
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 3：遗针探针——30 垢红门', async () => {
  const { ctx, call } = await mountSaowu({ book: BOOK })
  await call('write', { path: 'src/a.js', content: VZHEN })
  const r = ctx.saowu.report()
  assert.equal(r.cases.zhen, 1)
  assert.equal(r.score.total, 30)
  assert.equal(r.band, '垢')
  assert.equal(r.verdict, 'fail')
})

maybe('集成 4：遗屑探针——15 蒙过门', async () => {
  const { ctx, call } = await mountSaowu({ book: BOOK })
  await call('write', { path: 'src/a.js', content: VXIE })
  const r = ctx.saowu.report()
  assert.equal(r.cases.xie, 1)
  assert.equal(r.score.total, 15)
  assert.equal(r.band, '蒙')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 5：gate 10 探针——15 红门翻', async () => {
  const { ctx, call } = await mountSaowu({ book: BOOK, gate: 10 })
  await call('write', { path: 'src/a.js', content: VXIE })
  const g = ctx.saowu.gate()
  assert.equal(g.score, 15)
  assert.equal(g.gate, 10)
  assert.equal(g.verdict, 'fail')
})

maybe('集成 6：失败 write 探针（isError）不入账——0', async () => {
  const { ctx, call } = await mountSaowu({ book: BOOK })
  await call('write', { path: 'cursed/a.js', content: VZHEN }).catch(() => {})
  const r = ctx.saowu.report()
  assert.equal(r.totals.callsObserved, 1) // 观察数含失败
  assert.equal(r.totals.paths, 0) // 帚账不含失败
  assert.equal(r.score.total, 0)
})

maybe('集成 7：许留径探针（scripts/*）——免账 0', async () => {
  const { ctx, call } = await mountSaowu({ book: BOOK })
  await call('write', { path: 'scripts/dev.sh', content: 'set -x\necho "DEBUG: starting"\n' })
  const r = ctx.saowu.report()
  assert.equal(r.totals.paths, 0)
  assert.equal(r.score.total, 0)
})

maybe('集成 8：已扫探针（先撒后净）——注记 0', async () => {
  const { ctx, call } = await mountSaowu({ book: BOOK })
  await call('write', { path: 'src/calc.js', content: 'function f() {\n  breakpoint()\n}\n' })
  await call('write', { path: 'src/calc.js', content: 'function f() {\n  return 1\n}\n' })
  const r = ctx.saowu.report()
  assert.equal(r.cases.sao, 1)
  assert.equal(r.cases.zhen, 0)
  assert.equal(r.score.total, 0)
})

maybe('集成 9：exportStream 重放账实一致；帚牌两次渲染逐字节相同且不含行原文', async () => {
  const { createHash } = await import('node:crypto')
  const { ctx, call } = await mountSaowu({ book: BOOK })
  await call('write', { path: 'src/a.js', content: VZHEN })
  const runtime = ctx.saowu.report()
  const stream = ctx.saowu.exportStream()
  const { auditStreams } = await import('../src/core/audit.js')
  const offline = auditStreams([{ name: 'replay.jsonl', text: stream.map((e) => JSON.stringify(e)).join('\n') + '\n' }], { book: BOOK })
  assert.equal(offline.cases.zhen, runtime.cases.zhen)
  assert.equal(offline.score.total, runtime.score.total)
  assert.equal(offline.score.total, 30)
  const p1 = ctx.saowu.paizi().text
  const p2 = ctx.saowu.paizi().text
  assert.equal(createHash('sha256').update(p1).digest('hex'), createHash('sha256').update(p2).digest('hex'))
  assert.ok(!p1.includes('export function check'))
  assert.ok(p1.includes('遗针：src/a.js:2（debugger）'))
})

maybe('集成 10：ledger 全文与帚牌口径一致；edit 无文之痕出帚账不前注记', async () => {
  const { ctx, call } = await mountSaowu({ book: BOOK })
  await call('write', { path: 'src/a.js', content: VZHEN })
  await call('edit', { path: 'src/a.js' })
  const led = ctx.saowu.ledger()
  assert.equal(led.counts.zhen, 1)
  assert.equal(led.counts.qian, 1)
  assert.ok(led.issues.some((i) => i.startsWith('帚账不前：src/a.js')))
  assert.equal(led.score.total, 30)
})
