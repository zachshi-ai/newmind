/**
 * 真实集成测试 —— 指瑕插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十四件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 净稿探针 → 0 过门；
 *  3. 乖列探针（言 5 列实 3）→ 30 疵门红；
 *  4. 言列相敷探针 → 0 过门；
 *  5. 倒期探针 → 15 过门（黄牌不咬门）；
 *  6. 阙列探针 → 0 过门；
 *  7. 试场探针 → 0；
 *  8. 瑕册免案探针 → 0；
 *  9. 失败 write 探针不入账；
 * 10. exportStream() 导出流离线 audit 重放账实一致；
 * 11. 瑕牌块两次渲染逐字节相同且不含行原文；
 * 12. gate 翻转 + report/ledger 服务口径；
 * 13. 乖总探针（真实管道写表格）→ 30 门红；
 * 14. 末稿立撤探针（先瑕后净 → 已磨 0 过门）。
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

const BOOK = { version: 1, excuse: ['docs/reports/*'] }

async function mountZhixia(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const zhixia = await import('../src/plugin/zhixia.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(zhixia, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.zhixia, 'ctx.zhixia')

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
  const { ctx, call } = await mountZhixia({ book: BOOK })
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
  const { ctx, call } = await mountZhixia({ book: BOOK })
  await call('write', { path: 'docs/notes.md', content: '重构说明：调整了内部实现。\n' })
  const r = ctx.zhixia.report()
  assert.deepEqual(r.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 })
  assert.equal(r.band, '净')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 3：乖列探针（言 5 列实 3）——30 疵门红', async () => {
  const { ctx, call } = await mountZhixia({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: '本次共 5 项：\n- 空指针防护\n- 越界检查\n- 内存泄漏修复\n' })
  const r = ctx.zhixia.report()
  assert.equal(r.counts.gl, 1)
  assert.equal(r.score.total, 30)
  assert.equal(r.verdict, 'fail')
  assert.match(ctx.zhixia.ledger().issues[0], /乖列：docs\/report\.md:1 言 5 实 3（指纹 [0-9a-f]+）/)
})

maybe('集成 4：言列相敷探针——0 过门', async () => {
  const { ctx, call } = await mountZhixia({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: '本次共 3 项：\n- 空指针防护\n- 越界检查\n- 内存泄漏修复\n' })
  const r = ctx.zhixia.report()
  assert.equal(r.counts.gl, 0)
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 5：倒期探针——15 过门（黄牌不咬门）', async () => {
  const { ctx, call } = await mountZhixia({ book: BOOK })
  await call('write', { path: 'docs/schedule.md', content: '开发窗口：2026-09-10 至 2026-09-05。\n' })
  const r = ctx.zhixia.report()
  assert.equal(r.counts.dq, 1)
  assert.equal(r.score.total, 15)
  assert.equal(r.verdict, 'pass')
  assert.equal(r.band, '瑕')
})

maybe('集成 6：阙列探针——0 过门（言而无列，注记不判）', async () => {
  const { ctx, call } = await mountZhixia({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: '本次共 3 个遗留问题。\n部署已完成。\n' })
  const r = ctx.zhixia.report()
  assert.equal(r.counts.que, 1)
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 7：试场探针——0（tests/ 径豁免，无册）', async () => {
  const { ctx, call } = await mountZhixia({ book: null })
  await call('write', { path: 'tests/fixtures/handoff.md', content: '本次共 4 项：\n- 甲\n- 乙\n- 丙\n' })
  const r = ctx.zhixia.report()
  assert.deepEqual(r.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 8：瑕册免案探针——0', async () => {
  const { ctx, call } = await mountZhixia({ book: BOOK })
  await call('write', { path: 'docs/reports/audit.md', content: '本次共 5 项：\n- 凭据轮换\n- 端口收敛\n- 日志脱敏\n' })
  const r = ctx.zhixia.report()
  assert.deepEqual(r.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 9：失败 write 探针不入账——失败之写不是写', async () => {
  const { ctx, call } = await mountZhixia({ book: BOOK })
  await call('write', { path: 'cursed/report.md', content: '本次共 5 项：\n- 甲\n- 乙\n' }).catch(() => {})
  const r = ctx.zhixia.report()
  assert.equal(r.totals.callsObserved, 1) // 调用被观察到了
  assert.deepEqual(r.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 }) // 但失败之写不入账
  assert.equal(r.verdict, 'pass')
})

maybe('集成 10：exportStream 导出流离线 audit 重放——账实一致（乖列 30）', async () => {
  const { ctx, call } = await mountZhixia({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: '本次共 5 项：\n- 空指针防护\n- 越界检查\n- 内存泄漏修复\n' })
  const live = ctx.zhixia.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.zhixia.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: BOOK })

  assert.equal(replay.calls, live.totals.callsObserved)
  assert.deepEqual(replay.counts, live.counts)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 30)
})

maybe('集成 11：瑕牌块两次渲染逐字节相同且不含行原文', async () => {
  const { ctx, call } = await mountZhixia({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: '本次共 5 项：\n- 空指针防护\n- 越界检查\n- 内存泄漏修复\n' })
  const a = ctx.zhixia.paizi().text
  const b = ctx.zhixia.paizi().text
  assert.equal(a, b)
  assert.match(a, /【指瑕 · 瑕牌】/)
  assert.match(a, /瑕册：免审 1 处（docs\/reports\/\*）/)
  assert.match(a, /乖列：docs\/report\.md:1 言 5 实 3（指纹 [0-9a-f]+）/)
  assert.ok(!a.includes('空指针')) // 行原文不进瑕牌（掩码是结构性保证）
})

maybe('集成 12：gate 翻转 + report/ledger 服务口径——倒期 15 在门 10 下翻红', async () => {
  const { ctx, call } = await mountZhixia({ book: BOOK, gate: 10 })
  await call('write', { path: 'docs/schedule.md', content: '开发窗口：2026-09-10 至 2026-09-05。\n' })
  const r = ctx.zhixia.report()
  assert.equal(r.totals.callsObserved, 1)
  const g = ctx.zhixia.gate()
  assert.equal(g.score, 15)
  assert.equal(g.verdict, 'fail') // 15 ≥ 10 门翻
  const led = ctx.zhixia.ledger()
  assert.equal(led.counts.dq, 1)
  assert.ok(led.cases[0].fp)
})

maybe('集成 13：乖总探针（真实管道写表格）——30 门红', async () => {
  const { ctx, call } = await mountZhixia({ book: BOOK })
  await call('write', {
    path: 'docs/budget.md',
    content: '## 支出表\n\n| 项目 | 金额 |\n|---|---|\n| 服务器 | 40 |\n| 带宽 | 30 |\n| 人力 | 20 |\n| 合计 | 100 |\n',
  })
  const r = ctx.zhixia.report()
  assert.equal(r.counts.gz, 1)
  assert.equal(r.score.total, 30)
  assert.equal(r.verdict, 'fail')
  assert.match(ctx.zhixia.ledger().issues[0], /乖总：docs\/budget\.md:8 表第 2 列 言 100 和 90/)
})

maybe('集成 14：末稿立撤探针——先瑕后净已磨 0 过门', async () => {
  const { ctx, call } = await mountZhixia({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: '本次共 5 项：\n- 甲\n- 乙\n' })
  assert.equal(ctx.zhixia.report().verdict, 'fail') // 前稿有案
  await call('write', { path: 'docs/report.md', content: '本次共 2 项：\n- 甲\n- 乙\n' })
  const r = ctx.zhixia.report()
  assert.equal(r.counts.gl, 0) // 旧案全撤
  assert.equal(r.counts.mo, 1) // 已磨注记
  assert.equal(r.verdict, 'pass')
})
