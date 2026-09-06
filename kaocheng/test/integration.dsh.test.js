/**
 * 真实集成测试 —— 考诚插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. write 契上物合格探针 → 诚物 2、0 分过门；
 *  3. write 缺域探针 → 疵物（缺域 10 黄牌）；
 *  4. 契上物全流无工 → 幽物 30 门红；
 *  5. write 伪 json 探针 → 畸物 30 门红；
 *  6. exec 重定向探针 → 工见未考（注记不计分过门）；
 *  7. write 后 rm 探针 → 灭物 30 门红；
 *  8. 失败 write 探针（isError）不入账——物不在场照判幽物（契约考果不考勉）；
 *  9. exportStream() 导出流离线 audit 重放，案数与诚值与运行时账账实一致；
 * 10. gate 裁决翻转 + 考牌块两次渲染逐字节相同且不含末据正文。
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

const BOOK = {
  version: 1,
  items: [
    { name: '报告', path: 'docs/report.md', form: 'text', minLines: 2, words: ['结论'] },
    { name: '结果', path: 'out/result.json', form: 'json', fields: ['summary', 'count'] },
  ],
}
const REPORT_BOOK = { version: 1, items: [{ name: '报告', path: 'docs/report.md', form: 'text', minLines: 2, words: ['结论'] }] }
const RESULT_BOOK = { version: 1, items: [{ name: '结果', path: 'out/result.json', form: 'json', fields: ['summary', 'count'] }] }

const GOOD_REPORT = '# 报告\n结论：全绿。\n'

async function mountKaocheng(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const kaocheng = await import('../src/plugin/kaocheng.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(kaocheng, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.kaocheng, 'ctx.kaocheng')

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
  const { ctx, call } = await mountKaocheng({ book: BOOK })
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

maybe('集成 2：write 契上物合格——诚物 2、0 分过门', async () => {
  const { ctx, call } = await mountKaocheng({ book: BOOK })
  await call('write', { path: 'docs/report.md', content: GOOD_REPORT })
  await call('write', { path: 'out/result.json', content: '{"summary":"ok","count":3}' })
  const r = ctx.kaocheng.report()
  assert.deepEqual(r.cases, { items: 2, cheng: 2, ci: 0, ke: 0, qi: 0, mie: 0, you: 0, unseen: 0, noend: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.band, '诚')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 3：write 缺域——疵物（缺域 10 黄牌不咬门）', async () => {
  const { ctx, call } = await mountKaocheng({ book: RESULT_BOOK })
  await call('write', { path: 'out/result.json', content: '{"summary":"ok"}' })
  const r = ctx.kaocheng.report()
  assert.equal(r.cases.ci, 1)
  assert.equal(r.score.fields, 10)
  assert.equal(r.score.total, 10)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 4：契上物全流无工——幽物 30 门红', async () => {
  const { ctx, call } = await mountKaocheng({ book: BOOK })
  await call('write', { path: 'src/other.js', content: 'x\n' })
  await call('bash', { command: 'npm test' })
  const g = ctx.kaocheng.gate()
  assert.equal(g.score, 60)
  assert.equal(g.band, '欺')
  assert.equal(g.verdict, 'fail')
})

maybe('集成 5：write 伪 json——畸物 30 门红', async () => {
  const { ctx, call } = await mountKaocheng({ book: RESULT_BOOK })
  await call('write', { path: 'out/result.json', content: '这里应当是 JSON，但它不是' })
  const r = ctx.kaocheng.report()
  assert.equal(r.cases.qi, 1)
  assert.equal(r.score.total, 30)
  assert.equal(r.verdict, 'fail')
})

maybe('集成 6：exec 重定向——工见未考（注记不计分过门）', async () => {
  const { ctx, call } = await mountKaocheng({ book: RESULT_BOOK })
  await call('bash', { command: 'node gen.js > out/result.json' })
  const r = ctx.kaocheng.report()
  assert.deepEqual(r.cases, { items: 1, cheng: 0, ci: 0, ke: 0, qi: 0, mie: 0, you: 0, unseen: 1, noend: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 7：write 后 rm——灭物 30 门红', async () => {
  const { ctx, call } = await mountKaocheng({ book: REPORT_BOOK })
  await call('write', { path: 'docs/report.md', content: GOOD_REPORT })
  await call('bash', { command: 'rm -f docs/report.md' })
  const g = ctx.kaocheng.gate()
  assert.equal(g.score, 30)
  assert.equal(g.verdict, 'fail')
})

maybe('集成 8：失败 write 探针不入账——物不在场照判幽物（契约考果不考勉）', async () => {
  const { ctx, call } = await mountKaocheng({ book: RESULT_BOOK })
  await call('write', { path: 'cursed-result.json', content: '{}' }).catch(() => {})
  const r = ctx.kaocheng.report()
  assert.equal(r.totals.callsObserved, 1) // 调用被观察到了
  assert.equal(r.cases.you, 1) // 但失败之写不是工——契上物照判幽物
  assert.equal(r.score.total, 30)
  assert.equal(r.verdict, 'fail')
})

maybe('集成 9：exportStream 导出流离线 audit 重放——账实一致（灭物 30）', async () => {
  const { ctx, call } = await mountKaocheng({ book: REPORT_BOOK })
  await call('write', { path: 'docs/report.md', content: GOOD_REPORT })
  await call('bash', { command: 'rm docs/report.md' })
  const live = ctx.kaocheng.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.kaocheng.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: REPORT_BOOK })

  assert.equal(replay.calls, live.totals.callsObserved)
  assert.deepEqual(replay.counts, live.cases)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 30)
})

maybe('集成 10：gate 裁决翻转 + 考牌块两次渲染逐字节相同且不含末据正文', async () => {
  const { ctx, call } = await mountKaocheng({ book: BOOK, gate: 70 })
  await call('write', { path: 'docs/report.md', content: GOOD_REPORT })
  await call('write', { path: 'out/result.json', content: '{"summary":"ok"}' }) // 缺域 10
  assert.equal(ctx.kaocheng.gate().verdict, 'pass') // 10 < 70
  const a = ctx.kaocheng.paizi().text
  const b = ctx.kaocheng.paizi().text
  assert.equal(a, b)
  assert.match(a, /【考诚 · 考牌】/)
  assert.match(a, /疵物 ×1/)
  assert.ok(!a.includes('{"summary":"ok"}')) // 末据正文不进考牌（掩码是结构性保证）
})
