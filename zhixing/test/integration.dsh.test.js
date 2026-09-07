/**
 * 真实集成测试 —— 知行插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证九件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 装载章程后撞戒探针 → 违知 30 门红；
 *  3. 装载前撞戒探针 → 先悖 0 过门；
 *  4. isError 撞戒探针 → 试违不入案、行值 0；
 *  5. write content 撞亲命戒词探针 → 违知 30（直令不问知）；
 *  6. 必行词查无探针 → 缺行 15 黄牌过门、gate 翻转转红；
 *  7. 宥词探针 → 0 过门；
 *  8. exportStream() 导出流离线 audit 重放，案数与行值与运行时账账实一致；
 *  9. 合牌块两次渲染逐字节相同且不含装载正文。
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

const CHARTER = '本季章程唯一句：禁止 git push --force。禁止 sudo 滥用。'
const EMPTY = { rules: [], bans: [], musts: [], exempts: [], noDefaults: false }

async function mountZhixing(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const zhixing = await import('../src/plugin/zhixing.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(zhixing, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.zhixing, 'ctx.zhixing')

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
    name: 'read',
    description: '读探针：读 AGENTS.md 返回章程正文',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (String(args.path) === 'AGENTS.md') return CHARTER
      return `empty:${args.path}`
    },
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
  const { ctx, call } = await mountZhixing({ book: EMPTY })
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

maybe('集成 2：装载章程后撞戒 → 违知 30 门红', async () => {
  const { ctx, call } = await mountZhixing({ book: EMPTY })
  await call('write', { path: 'AGENTS.md', content: CHARTER })
  await call('read', { path: 'AGENTS.md' })
  await call('bash', { command: 'git push --force origin main' })
  const r = ctx.zhixing.report()
  assert.equal(r.cases.wei, 1)
  assert.equal(r.score.total, 30)
  assert.equal(r.ok, false)
  assert.equal(r.band, '悖')
})

maybe('集成 3：装载前撞戒 → 先悖 0 过门（真实管道按流序轨）', async () => {
  const { ctx, call } = await mountZhixing({ book: EMPTY })
  await call('bash', { command: 'git push --force origin main' })
  await call('write', { path: 'AGENTS.md', content: CHARTER })
  await call('read', { path: 'AGENTS.md' })
  const r = ctx.zhixing.report()
  assert.equal(r.cases.xian, 1)
  assert.equal(r.cases.wei, 0)
  assert.equal(r.ok, true)
})

maybe('集成 4：isError 撞戒 → 试违不入案、行值 0', async () => {
  const { ctx, call } = await mountZhixing({ book: EMPTY })
  await call('write', { path: 'AGENTS.md', content: CHARTER })
  await call('read', { path: 'AGENTS.md' })
  await call('bash', { command: 'sudo rm x boom' }).catch(() => {})
  const r = ctx.zhixing.report()
  assert.equal(r.cases.shi, 1)
  assert.equal(r.cases.wei, 0)
  assert.equal(r.ok, true)
})

maybe('集成 5：write content 撞亲命戒词 → 违知 30（直令不问知）', async () => {
  const { ctx, call } = await mountZhixing({ book: { ...EMPTY, bans: ['TODO_FIXME'] } })
  await call('write', { path: 'src/a.js', content: 'let x = 1 // TODO_FIXME' })
  const r = ctx.zhixing.report()
  assert.equal(r.cases.wei, 1)
  assert.equal(r.score.total, 30)
  assert.equal(r.ok, false)
})

maybe('集成 6：必行词查无 → 缺行 15 黄牌过门；gate 翻转转红', async () => {
  const { ctx, call } = await mountZhixing({ book: { ...EMPTY, musts: ['npm run build'] }, gate: 10 })
  await call('bash', { command: 'npm run lint' })
  const r = ctx.zhixing.report()
  assert.equal(r.cases.que, 1)
  assert.equal(r.score.total, 15)
  assert.equal(r.ok, false, '门 10 时 15 ≥ 10 应红')
  assert.equal(r.gate, 10)
})

maybe('集成 7：宥词在册 → 撞戒宥 0 过门', async () => {
  const { ctx, call } = await mountZhixing({ book: { ...EMPTY, exempts: ['--force'] } })
  await call('write', { path: 'AGENTS.md', content: CHARTER })
  await call('read', { path: 'AGENTS.md' })
  await call('bash', { command: 'git push --force origin main' })
  const r = ctx.zhixing.report()
  assert.equal(r.cases.mian, 1)
  assert.equal(r.cases.wei, 0)
  assert.equal(r.ok, true)
})

maybe('集成 8：exportStream 离线重放与运行时账账实一致', async () => {
  const { ctx, call } = await mountZhixing({ book: EMPTY })
  await call('write', { path: 'AGENTS.md', content: CHARTER })
  await call('read', { path: 'AGENTS.md' })
  await call('bash', { command: 'git push --force origin main' })
  const runtime = ctx.zhixing.report()
  const stream = ctx.zhixing.exportStream()
  const text = stream.map((e) => JSON.stringify(e)).join('\n')
  const { auditStreams } = await import('../src/core/audit.js')
  const offline = auditStreams([{ name: 'replay.jsonl', text }], { book: EMPTY })
  assert.equal(offline.counts.wei, runtime.cases.wei)
  assert.equal(offline.counts.zhi, runtime.cases.zhi)
  assert.equal(offline.score.total, runtime.score.total)
  assert.equal(offline.ok, runtime.ok)
})

maybe('集成 9：合牌块两次渲染逐字节相同且不含装载正文', async () => {
  const { ctx, call } = await mountZhixing({ book: EMPTY })
  await call('write', { path: 'AGENTS.md', content: CHARTER })
  await call('read', { path: 'AGENTS.md' })
  await call('bash', { command: 'git push --force origin main' })
  const t1 = ctx.zhixing.paizi().text
  const t2 = ctx.zhixing.paizi().text
  assert.equal(t1, t2)
  assert.equal(t1.includes('本季章程唯一句'), false, '装载正文永不入块')
  assert.ok(t1.includes('违知'))
})
