/**
 * 真实集成测试 —— 成事插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证九件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 同串双建（其间夹一笔 write）探针 → 重决 30 门红（线上无主文注记在案）；
 *  3. mail 失败探针（isError）不入账——失败不遂；
 *  4. 允列遂键探针（遂册 allow）→ 首笔初遂 + 再施豁施，0 过门；
 *  5. 首遂 + 消据 + 再施探针 → 已消 0 过门（成物之柄 × 消词）；
 *  6. exportStream() 导出流离线 audit 重放，案数与重值与运行时账账实一致；
 *  7. gate 裁决翻转（门 10 红 / 门 40 过）；
 *  8. 遂牌块两次渲染逐字节相同且不含命令原文；
 *  9. 变参异键不并案（改标题再建是两个键，不是重决）。
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

const EMPTY_BOOK = { version: 1, allow: [] }
const BEAT_BOOK = { version: 1, allow: ['curl -d*hooks.example/beat*'] }

const ISSUE_CREATE = 'gh issue create --title "Flaky test" --body "steps"'
const MAIL_SEND = 'mail -s "deploy ok" oncall@example.com'

async function mountChengshi(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const chengshi = await import('../src/plugin/chengshi.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(chengshi, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.chengshi, 'ctx.chengshi')

  const { defineTool } = dshTools
  const mockOutput = {
    schema: { type: 'string' },
    render: (_a, v) => [{ type: 'text', text: v }],
  }
  ctx.tools.register(defineTool({
    name: 'write',
    description: '写探针：cursed 径固定失败',
    parameters: {
      path: { type: 'string', required: true, description: 'path' },
      content: { type: 'string', description: '内容' },
    },
    output: mockOutput,
    async execute(args) {
      if (String(args.path).includes('cursed')) throw new Error(`simulated failure: ${args.path}`)
      return `wrote:${args.path}`
    },
  }))
  ctx.tools.register(defineTool({
    name: 'bash',
    description: '执行探针：命令含 boom 时固定失败',
    parameters: { command: { type: 'string', required: true, description: 'command' } },
    output: mockOutput,
    async execute(args) {
      const command = args.command
      if (command.includes('boom')) throw new Error(`simulated failure: ${command}`)
      if (command.includes('issue create')) {
        return `Created issue: https://github.com/acme/app/issues/7`
      }
      return `ran:${command}`
    },
  }))
  ctx.tools.register(defineTool({
    name: 'probe',
    description: '必炸探针',
    parameters: { path: { type: 'string', required: true, description: 'p' } },
    output: mockOutput,
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
  const { ctx, call } = await mountChengshi({ book: EMPTY_BOOK })
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

maybe('集成 2：同串双建探针（夹一笔 write）——重决 30 门红 + 线上无主文注记', async () => {
  const { ctx, call } = await mountChengshi({ book: EMPTY_BOOK })
  await call('bash', { command: ISSUE_CREATE })
  await call('write', { path: 'src/notify.js', content: 'notify()\n' })
  await call('bash', { command: ISSUE_CREATE })
  const r = ctx.chengshi.report()
  assert.deepEqual(r.cases, { chu: 1, chong: 1, xiao: 0, huo: 0, cheng: 0 })
  assert.equal(r.score.total, 30)
  assert.equal(r.band, '叠')
  assert.equal(r.verdict, 'fail')
  assert.equal(r.runtimeNote, true)
  assert.ok(ctx.chengshi.ledger().issues.includes('注记：线上无主文，承不判——终裁归线下'))
})

maybe('集成 3：mail 失败探针（isError）不入账——失败不遂', async () => {
  const { ctx, call } = await mountChengshi({ book: EMPTY_BOOK })
  await call('bash', { command: `boom ${MAIL_SEND}` }).catch(() => {})
  const r = ctx.chengshi.report()
  assert.equal(r.totals.callsObserved, 1)
  assert.deepEqual(r.cases, { chu: 0, chong: 0, xiao: 0, huo: 0, cheng: 0 })
  assert.equal(r.verdict, 'pass')
})

maybe('集成 4：允列遂键探针——首笔初遂 + 再施豁施，0 过门', async () => {
  const { ctx, call } = await mountChengshi({ book: BEAT_BOOK })
  await call('bash', { command: "curl -d '{\"beat\":1}' https://hooks.example/beat" })
  await call('bash', { command: "curl -d '{\"beat\":1}' https://hooks.example/beat" })
  const r = ctx.chengshi.report()
  assert.deepEqual(r.cases, { chu: 1, chong: 0, xiao: 0, huo: 1, cheng: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 5：首遂 + 消据 + 再施探针——已消 0 过门', async () => {
  const { ctx, call } = await mountChengshi({ book: EMPTY_BOOK })
  await call('bash', { command: ISSUE_CREATE }) // content 带成物之柄 issues/7
  await call('bash', { command: 'gh issue close 7 --reason completed' })
  await call('bash', { command: ISSUE_CREATE })
  const r = ctx.chengshi.report()
  assert.deepEqual(r.cases, { chu: 1, chong: 0, xiao: 1, huo: 0, cheng: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 6：exportStream 导出流离线 audit 重放——账实一致（双建 30）', async () => {
  const { ctx, call } = await mountChengshi({ book: EMPTY_BOOK })
  await call('bash', { command: ISSUE_CREATE })
  await call('write', { path: 'src/notify.js', content: 'notify()\n' })
  await call('bash', { command: ISSUE_CREATE })
  const live = ctx.chengshi.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.chengshi.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: EMPTY_BOOK })

  assert.deepEqual(replay.cases, live.cases)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 30)
})

maybe('集成 7：gate 裁决翻转（门 10 红 / 门 40 过）', async () => {
  const a = await mountChengshi({ book: EMPTY_BOOK, gate: 10 })
  await a.call('bash', { command: ISSUE_CREATE })
  await a.call('bash', { command: ISSUE_CREATE })
  assert.equal(a.ctx.chengshi.gate().verdict, 'fail') // 30 ≥ 10

  const b = await mountChengshi({ book: EMPTY_BOOK, gate: 40 })
  await b.call('bash', { command: ISSUE_CREATE })
  await b.call('bash', { command: ISSUE_CREATE })
  assert.equal(b.ctx.chengshi.gate().verdict, 'pass') // 30 < 40
})

maybe('集成 8：遂牌块两次渲染逐字节相同且不含命令原文', async () => {
  const { ctx, call } = await mountChengshi({ book: EMPTY_BOOK })
  await call('bash', { command: ISSUE_CREATE })
  await call('bash', { command: ISSUE_CREATE })
  const a = ctx.chengshi.paizi().text
  const b = ctx.chengshi.paizi().text
  assert.equal(a, b)
  assert.match(a, /【成事 · 遂牌】/)
  assert.match(a, /重决：gh·issue·create [0-9a-f]{8} ×1/)
  assert.ok(!a.includes('Flaky test') && !a.includes('gh issue create'), '命令原文与实参不进遂牌')
})

maybe('集成 9：变参异键不并案——改标题再建是两个键', async () => {
  const { ctx, call } = await mountChengshi({ book: EMPTY_BOOK })
  await call('bash', { command: ISSUE_CREATE })
  await call('bash', { command: 'gh issue create --title "Other flake" --body "steps"' })
  const r = ctx.chengshi.report()
  assert.deepEqual(r.cases, { chu: 2, chong: 0, xiao: 0, huo: 0, cheng: 0 })
  assert.equal(r.totals.keys, 2)
  assert.equal(r.verdict, 'pass')
})
