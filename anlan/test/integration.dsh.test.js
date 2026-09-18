/**
 * 真实集成测试 —— 安澜插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十二件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 守准探针 → 0 平过门；
 *  3. 最小荡案探针 → 30 荡门红；
 *  4. 风浪探针 → 0（零搅之交替，环境之波非人祸）；
 *  5. 未达门槛探针 → 0（叠 2 宁纵）；
 *  6. 迟搅探针 → 0（搅笔全在末状态笔后不入窗）；
 *  7. 澜册 spare 探针 → 0（豁免授权来自册）；
 *  8. 失败 write 探针不搅（没落盘不算搅）；
 *  9. observe 读探针不入账（看见失败输出不算自己的诊）；
 * 10. exportStream() 导出流离线 audit 重放账实一致；
 * 11. 荡牌块两次渲染逐字节相同且不含命令/输出/搅笔原文；
 * 12. gate 配置翻转（40 过 / 默认 30 红）。
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

const BOOK = { version: 1, spare: ['never-registered'] }

async function mountAnlan(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const anlan = await import('../src/plugin/anlan.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(anlan, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.anlan, 'ctx.anlan')

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

const FAILCMD = 'npm test -- auth --cursedfail'
const OKCMD = 'npm test -- auth'
const FIX = { path: 'src/auth.js', content: 'fix: guard null user\n' }

maybe('集成 1：结构性零拦截——失败探针也无条件到达工具本体', async () => {
  const { ctx, call } = await mountAnlan({ book: BOOK })
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

maybe('集成 2：守准探针 → 0 平过门（单轮修复收敛）', async () => {
  const { ctx, call } = await mountAnlan({ book: BOOK })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', FIX)
  await call('bash', { command: OKCMD })
  const r = ctx.anlan.report()
  assert.equal(r.totals.objects, 1)
  assert.equal(r.counts.dang + r.counts.feng, 0)
  assert.equal(r.counts.zhen, 1)
  assert.equal(r.counts.ni, 1)
  assert.equal(r.counts.jiao, 1)
  assert.equal(r.ok, true)
  assert.equal(r.band, '平')
})

maybe('集成 3：最小荡案探针 → 30 荡门红', async () => {
  const { ctx, call } = await mountAnlan({ book: BOOK })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', FIX)
  await call('bash', { command: OKCMD })
  await call('write', { path: 'src/auth.js', content: 'retry\n' })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', { path: 'src/auth.js', content: 'fix again\n' })
  await call('bash', { command: OKCMD })
  const g = ctx.anlan.gate()
  assert.equal(g.score, 30)
  assert.equal(g.band, '荡')
  assert.equal(g.verdict, 'fail')
  const led = ctx.anlan.ledger()
  assert.equal(led.cases.length, 1)
  assert.equal(led.cases[0].type, '荡案')
  assert.equal(led.cases[0].token, 'auth')
  assert.equal(led.cases[0].die, 3)
})

maybe('集成 4：风浪探针 → 0（零搅之交替）', async () => {
  const { ctx, call } = await mountAnlan({ book: BOOK })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('bash', { command: OKCMD })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('bash', { command: OKCMD })
  const r = ctx.anlan.report()
  assert.equal(r.counts.feng, 1)
  assert.equal(r.counts.jiao, 0)
  assert.equal(r.score.total, 0)
  assert.equal(r.ok, true)
})

maybe('集成 5：未达门槛探针 → 0（叠 2 宁纵）', async () => {
  const { ctx, call } = await mountAnlan({ book: BOOK })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', FIX)
  await call('bash', { command: OKCMD })
  await call('write', { path: 'src/auth.js', content: 'retry\n' })
  await call('bash', { command: FAILCMD }).catch(() => {})
  const r = ctx.anlan.report()
  assert.deepEqual([r.counts.dang, r.counts.feng], [0, 0])
  assert.equal(r.ok, true)
})

maybe('集成 6：迟搅探针 → 0（波定之后的改不入窗）', async () => {
  const { ctx, call } = await mountAnlan({ book: BOOK })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('bash', { command: OKCMD })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('bash', { command: OKCMD })
  await call('write', { path: 'src/auth.js', content: 'postscript 1\n' })
  await call('write', { path: 'src/auth.js', content: 'postscript 2\n' })
  const r = ctx.anlan.report()
  assert.equal(r.counts.feng, 1)
  assert.equal(r.counts.jiao, 2)
  assert.equal(r.ok, true)
})

maybe('集成 7：澜册 spare 探针 → 0（豁免授权来自册）', async () => {
  const { ctx, call } = await mountAnlan({ book: { version: 1, spare: ['auth'] } })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', FIX)
  await call('bash', { command: OKCMD })
  await call('write', { path: 'src/auth.js', content: 'retry\n' })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', { path: 'src/auth.js', content: 'fix\n' })
  await call('bash', { command: OKCMD })
  const r = ctx.anlan.report()
  assert.deepEqual(r.counts, { dang: 0, feng: 0, zhen: 0, ni: 0, jiao: 0 })
  assert.equal(r.ok, true)
})

maybe('集成 8：失败 write 探针不搅（没落盘不算搅——风浪 0 分）', async () => {
  const { ctx, call } = await mountAnlan({ book: BOOK })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', { path: 'src/cursed-auth.js', content: 'fix\n' }).catch(() => {})
  await call('bash', { command: OKCMD })
  await call('write', { path: 'src/cursed-auth.js', content: 'retry\n' }).catch(() => {})
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', { path: 'src/cursed-auth.js', content: 'fix again\n' }).catch(() => {})
  await call('bash', { command: OKCMD })
  const r = ctx.anlan.report()
  assert.equal(r.counts.feng, 1)
  assert.equal(r.counts.jiao, 0)
  assert.equal(r.score.total, 0)
})

maybe('集成 9：observe 读探针不入账——看见失败输出不算自己的诊', async () => {
  const { ctx, call } = await mountAnlan({ book: BOOK })
  await call('read', { path: 'logs/test.log' })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('read', { path: 'logs/test.log' })
  await call('bash', { command: OKCMD })
  const r = ctx.anlan.report()
  assert.deepEqual([r.counts.zhen, r.counts.ni, r.counts.jiao], [1, 1, 0])
  assert.equal(r.ok, true)
})

maybe('集成 10：exportStream() 导出流离线 audit 重放账实一致', async () => {
  const { ctx, call } = await mountAnlan({ book: BOOK })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', FIX)
  await call('bash', { command: OKCMD })
  await call('write', { path: 'src/auth.js', content: 'retry\n' })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', { path: 'src/auth.js', content: 'fix\n' })
  await call('bash', { command: OKCMD })
  const online = ctx.anlan.gate()
  const { auditStreams } = await import('../src/core/audit.js')
  const offline = auditStreams([{ name: 'export.jsonl', text: ctx.anlan.exportStream().map((e) => JSON.stringify(e)).join('\n') }], { book: BOOK })
  assert.equal(online.score, offline.score.total)
  assert.equal(offline.counts.dang, 1)
  assert.equal(offline.band, '荡')
})

maybe('集成 11：荡牌块两次渲染逐字节相同且不含命令/输出/搅笔原文', async () => {
  const { ctx, call } = await mountAnlan({ book: BOOK })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', FIX)
  await call('bash', { command: OKCMD })
  await call('write', { path: 'src/auth.js', content: 'retry\n' })
  await call('bash', { command: FAILCMD }).catch(() => {})
  await call('write', { path: 'src/auth.js', content: 'fix\n' })
  await call('bash', { command: OKCMD })
  const t1 = ctx.anlan.paizi().text
  const t2 = ctx.anlan.paizi().text
  assert.equal(t1, t2)
  assert.equal(t1.includes('auth'), true, '对象词元是点名切片（docs/03 §11——对象键进块）')
  assert.equal(t1.includes('npm test'), false, '命令原文不进块')
  assert.equal(t1.includes('FAIL'), false, '输出原文不进块')
  assert.equal(t1.includes('guard null'), false, '搅笔原文不进块')
  assert.match(t1, /荡案：auth（叠 3 · 搅 3）（指纹 [0-9a-f]+）/)
  assert.match(t1, /澜册：/)
  assert.match(t1, /案账：荡案 1 · 风浪 0/)
  const rep = ctx.anlan.report()
  assert.equal(rep.totals.callsObserved, 7)
})

maybe('集成 12：gate 配置翻转（40 过 / 默认 30 红）', async () => {
  const build = async (gate) => {
    const mounted = await mountAnlan({ book: BOOK, gate })
    for (const step of [
      ['bash', { command: FAILCMD }],
      ['write', FIX],
      ['bash', { command: OKCMD }],
      ['write', { path: 'src/auth.js', content: 'retry\n' }],
      ['bash', { command: FAILCMD }],
      ['write', { path: 'src/auth.js', content: 'fix\n' }],
      ['bash', { command: OKCMD }],
    ]) {
      await mounted.call(step[0], step[1]).catch(() => {})
    }
    return mounted
  }
  const loose = await build(40)
  assert.equal(loose.ctx.anlan.gate().verdict, 'pass')
  const tight = await build()
  assert.equal(tight.ctx.anlan.gate().verdict, 'fail')
  assert.equal(tight.ctx.anlan.gate().score, 30)
})
