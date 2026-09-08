/**
 * 真实集成测试 —— 矫托插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十二件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 净卷探针 → 0 过门；
 *  3. 伪托探针（读章程后写查无引语）→ 30 矫门红；
 *  4. 征引探针（引语原文征得）→ 0 过门；
 *  5. 托主探针 → 0 过门（主渠道无文，注记不判）；
 *  6. 阙据探针 → 0 过门（所托文书流内无本）；
 *  7. 诏册免案探针 → 0；
 *  8. 失败 write 探针不入账；
 *  9. exec 伪托探针（commit message 嵌套取内）→ 30 门红；
 * 10. exportStream() 导出流离线 audit 重放账实一致；
 * 11. 矫牌块两次渲染逐字节相同且不含引语原文；
 * 12. gate 翻转 + report/ledger 服务口径。
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

const BOOK = { version: 1, excuse: ['docs/reports/*'], words: [], noDefaults: false }

const CHARTER = '# 仓库章程\n\n所有提交前必须通过 lint 检查。\n禁止直接推送主分支。\n'

async function mountJiaotuo(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const jiaotuo = await import('../src/plugin/jiaotuo.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(jiaotuo, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.jiaotuo, 'ctx.jiaotuo')

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
    description: '读探针：返回内置章程正文',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (String(args.path) === 'AGENTS.md') return CHARTER
      return `content of ${args.path}`
    },
  }))
  ctx.tools.register(defineTool({
    name: 'bash',
    description: '执行探针：命令含 boom 固定失败',
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
  const { ctx, call } = await mountJiaotuo({ book: BOOK })
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
  const { ctx, call } = await mountJiaotuo({ book: BOOK })
  await call('write', { path: 'docs/notes.md', content: '重构说明：调整了内部实现。\n' })
  const r = ctx.jiaotuo.report()
  assert.deepEqual(r.counts, { zj: 0, yj: 0, zy: 0, zhu: 0, que: 0, fan: 0 })
  assert.equal(r.band, '信')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 3：伪托探针（读章程后写查无引语）——30 矫门红', async () => {
  const { ctx, call } = await mountJiaotuo({ book: BOOK })
  await call('read', { path: 'AGENTS.md' })
  await call('write', { path: 'docs/report.md', content: 'AGENTS.md 规定『提交前必须全部测试通过才能合并』。\n' })
  const r = ctx.jiaotuo.report()
  assert.equal(r.counts.zj, 1)
  assert.equal(r.score.total, 30)
  assert.equal(r.verdict, 'fail')
  assert.match(ctx.jiaotuo.ledger().issues[0], /矫引：docs\/report\.md:1 规定（托 AGENTS\.md 查无此语/)
})

maybe('集成 4：征引探针（引语原文征得）——0 过门', async () => {
  const { ctx, call } = await mountJiaotuo({ book: BOOK })
  await call('read', { path: 'AGENTS.md' })
  await call('write', { path: 'docs/report.md', content: 'AGENTS.md 规定『所有提交前必须通过 lint 检查』。\n' })
  const r = ctx.jiaotuo.report()
  assert.equal(r.counts.zy, 1)
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 5：托主探针——0 过门（主渠道无文，注记不判）', async () => {
  const { ctx, call } = await mountJiaotuo({ book: BOOK })
  await call('read', { path: 'AGENTS.md' })
  await call('write', { path: 'docs/handoff.md', content: '用户明确要求『删掉全部旧测试』，已执行。\n' })
  const r = ctx.jiaotuo.report()
  assert.equal(r.counts.zhu, 1)
  assert.equal(r.counts.zj, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 6：阙据探针——0 过门（所托文书流内无本）', async () => {
  const { ctx, call } = await mountJiaotuo({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: 'STYLE.md 规定『缩进一律用两个空格』。\n' })
  const r = ctx.jiaotuo.report()
  assert.equal(r.counts.que, 1)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 7：诏册免案探针——0', async () => {
  const { ctx, call } = await mountJiaotuo({ book: BOOK })
  await call('read', { path: 'AGENTS.md' })
  await call('write', { path: 'docs/reports/audit.md', content: 'AGENTS.md 规定『季度轮换全部访问凭据』。\n' })
  const r = ctx.jiaotuo.report()
  assert.deepEqual(r.counts, { zj: 0, yj: 0, zy: 0, zhu: 0, que: 0, fan: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 8：失败 write 探针不入账——失败之写不是写', async () => {
  const { ctx, call } = await mountJiaotuo({ book: BOOK })
  await call('read', { path: 'AGENTS.md' })
  await call('write', { path: 'cursed/report.md', content: 'AGENTS.md 规定『季度轮换全部访问凭据』。\n' }).catch(() => {})
  const r = ctx.jiaotuo.report()
  assert.equal(r.totals.callsObserved, 2) // 调用被观察到了
  assert.deepEqual(r.counts, { zj: 0, yj: 0, zy: 0, zhu: 0, que: 0, fan: 0 }) // 但失败之写不入账
  assert.equal(r.verdict, 'pass')
})

maybe('集成 9：exec 伪托探针（commit message 嵌套取内）——30 门红', async () => {
  const { ctx, call } = await mountJiaotuo({ book: BOOK })
  await call('read', { path: 'AGENTS.md' })
  await call('bash', { command: `git commit -m "per AGENTS.md: require 'all commits carry a DCO sign-off line'"` })
  const r = ctx.jiaotuo.report()
  assert.equal(r.totals.execs, 1)
  assert.equal(r.counts.zj, 1)
  assert.equal(r.verdict, 'fail')
})

maybe('集成 10：exportStream 导出流离线 audit 重放——账实一致（矫引 30）', async () => {
  const { ctx, call } = await mountJiaotuo({ book: BOOK })
  await call('read', { path: 'AGENTS.md' })
  await call('write', { path: 'docs/report.md', content: 'AGENTS.md 规定『提交前必须全部测试通过才能合并』。\n' })
  const live = ctx.jiaotuo.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.jiaotuo.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: BOOK })

  assert.equal(replay.calls, live.totals.callsObserved)
  assert.deepEqual(replay.counts, live.counts)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 30)
})

maybe('集成 11：矫牌块两次渲染逐字节相同且不含引语原文', async () => {
  const { ctx, call } = await mountJiaotuo({ book: BOOK })
  await call('read', { path: 'AGENTS.md' })
  await call('write', { path: 'docs/report.md', content: 'AGENTS.md 规定『提交前必须全部测试通过才能合并』。\n' })
  const a = ctx.jiaotuo.paizi().text
  const b = ctx.jiaotuo.paizi().text
  assert.equal(a, b)
  assert.match(a, /【矫托 · 矫牌】/)
  assert.match(a, /诏册：免案 1 处（docs\/reports\/\*）/)
  assert.match(a, /矫引：docs\/report\.md:1 规定（托 AGENTS\.md 查无此语 · 指纹 [0-9a-f]+）/)
  assert.ok(!a.includes('测试通过才能合并')) // 引语原文不进矫牌（掩码是结构性保证）
  assert.ok(!a.includes('仓库章程')) // 诏本正文不进矫牌
})

maybe('集成 12：gate 翻转 + report/ledger 服务口径——观察数含失败、案账不误记', async () => {
  const { ctx, call } = await mountJiaotuo({ book: BOOK, gate: 10 })
  await call('probe', { path: 'x.js' }).catch(() => {}) // 失败 exec：观察但不审
  await call('read', { path: 'AGENTS.md' })
  await call('write', { path: 'docs/report.md', content: 'AGENTS.md 规定『提交前必须全部测试通过才能合并』。\n' })
  const r = ctx.jiaotuo.report()
  assert.equal(r.totals.callsObserved, 3)
  const g = ctx.jiaotuo.gate()
  assert.equal(g.score, 30)
  assert.equal(g.verdict, 'fail') // 30 ≥ 10 门翻
  const led = ctx.jiaotuo.ledger()
  assert.equal(led.counts.zj, 1)
  assert.ok(led.cases[0].fp)
})
