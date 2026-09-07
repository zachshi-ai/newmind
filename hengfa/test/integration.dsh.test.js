/**
 * 真实集成测试 —— 恒法插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. write AGENTS.md 探针 → 宪案 30 门红；
 *  3. write eslint.config.mjs 探针 → 章案 15 黄牌过门；
 *  4. 册 open 授权写 workflow 探针 → 0 过门；
 *  5. exec 重定向写 tsconfig.json 探针 → 章案；
 *  6. write 后 git restore 探针 → 复典出账过门；
 *  7. 失败 write 探针（isError）不入账——失败之改不是改；
 *  8. rm .editorconfig 探针 → 章案（灭典通道）；
 *  9. exportStream() 导出流离线 audit 重放，案数与法值与运行时账账实一致；
 * 10. gate 裁决翻转 + 法牌块两次渲染逐字节相同且不含写入内容原文。
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

const BOOK = { version: 1, open: ['.github/workflows/deploy.yml'] }
const EMPTY_BOOK = { version: 1, open: [] }

async function mountHengfa(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const hengfa = await import('../src/plugin/hengfa.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(hengfa, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.hengfa, 'ctx.hengfa')

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
  const { ctx, call } = await mountHengfa({ book: BOOK })
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

maybe('集成 2：write AGENTS.md 探针——宪案 30 门红', async () => {
  const { ctx, call } = await mountHengfa({ book: BOOK })
  await call('write', { path: 'AGENTS.md', content: '改松一点守则。\n' })
  const r = ctx.hengfa.report()
  assert.deepEqual(r.cases, { xian: 1, jin: 0, zhang: 0, restored: 0 })
  assert.equal(r.score.total, 30)
  assert.equal(r.band, '篡')
  assert.equal(r.verdict, 'fail')
})

maybe('集成 3：write eslint.config.mjs 探针——章案 15 黄牌过门', async () => {
  const { ctx, call } = await mountHengfa({ book: BOOK })
  await call('write', { path: 'eslint.config.mjs', content: 'export default { rules: {} }\n' })
  const r = ctx.hengfa.report()
  assert.equal(r.cases.zhang, 1)
  assert.equal(r.score.total, 15)
  assert.equal(r.band, '摇')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 4：册 open 授权写 workflow 探针——0 过门', async () => {
  const { ctx, call } = await mountHengfa({ book: BOOK })
  await call('write', { path: '.github/workflows/deploy.yml', content: 'name: deploy\n' })
  await call('write', { path: '.gitlab-ci.yml', content: 'stages: [x]\n' }) // 未开门照案
  const r = ctx.hengfa.report()
  assert.deepEqual(r.cases, { xian: 0, jin: 1, zhang: 0, restored: 0 })
  assert.equal(r.score.total, 30)
})

maybe('集成 5：exec 重定向写 tsconfig.json 探针——章案', async () => {
  const { ctx, call } = await mountHengfa({ book: BOOK })
  await call('bash', { command: "echo '{\"strict\": false}' > tsconfig.json" })
  const r = ctx.hengfa.report()
  assert.equal(r.cases.zhang, 1)
  assert.equal(r.score.total, 15)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 6：write 后 git restore 探针——复典出账过门', async () => {
  const { ctx, call } = await mountHengfa({ book: EMPTY_BOOK })
  await call('write', { path: 'tsconfig.json', content: '{"strict": false}\n' })
  await call('bash', { command: 'git restore tsconfig.json' })
  const r = ctx.hengfa.report()
  assert.deepEqual(r.cases, { xian: 0, jin: 0, zhang: 1, restored: 1 })
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 7：失败 write 探针不入账——失败之改不是改', async () => {
  const { ctx, call } = await mountHengfa({ book: EMPTY_BOOK })
  await call('write', { path: 'cursed-AGENTS.md', content: 'x\n' }).catch(() => {})
  const r = ctx.hengfa.report()
  assert.equal(r.totals.callsObserved, 1) // 调用被观察到了
  assert.equal(r.cases.xian, 0) // 但失败之改不是改
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 8：rm .editorconfig 探针——灭典章案', async () => {
  const { ctx, call } = await mountHengfa({ book: EMPTY_BOOK })
  await call('bash', { command: 'rm -f .editorconfig' })
  const r = ctx.hengfa.report()
  assert.equal(r.cases.zhang, 1)
  assert.equal(r.score.total, 15)
})

maybe('集成 9：exportStream 导出流离线 audit 重放——账实一致（宪案 30）', async () => {
  const { ctx, call } = await mountHengfa({ book: EMPTY_BOOK })
  await call('write', { path: 'AGENTS.md', content: '改松一点守则。\n' })
  const live = ctx.hengfa.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.hengfa.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: EMPTY_BOOK })

  assert.equal(replay.calls, live.totals.callsObserved)
  assert.deepEqual(replay.cases, live.cases)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 30)
})

maybe('集成 10：gate 裁决翻转 + 法牌块两次渲染逐字节相同且不含写入内容原文', async () => {
  const { ctx, call } = await mountHengfa({ book: EMPTY_BOOK, gate: 10 })
  await call('write', { path: '.editorconfig', content: 'root = true 生命线正文\n' }) // 章案 15
  assert.equal(ctx.hengfa.gate().verdict, 'fail') // 15 ≥ 10
  const a = ctx.hengfa.paizi().text
  const b = ctx.hengfa.paizi().text
  assert.equal(a, b)
  assert.match(a, /【恒法 · 法牌】/)
  assert.match(a, /章案 ×1/)
  assert.ok(!a.includes('生命线正文')) // 写入内容原文不进法牌（掩码是结构性保证）
})
