/**
 * 真实集成测试 —— 乡校插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证六件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 谏诤式插件在真实管道上正确工作（缄笔/避检/略测/有凭之默/保留/豁免）；
 *  3. 声账读侧先见靠真实读结果正文成立；
 *  4. 谏牌块两次渲染逐字节相同；
 *  5. 账实对账：exportStream() 导出流离线 audit 重放，案数与壅值与运行时账逐字一致；
 *  6. gate 裁决可调。
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

const REGISTRY = { version: 1, mute: [], forms: [], noDefaults: false, extraExts: [] }
const MUTED = { version: 1, mute: ['WPS-4119'], forms: [], noDefaults: false, extraExts: [] }

const OLD_FILE = 'export function stale() {\n  // @ts-ignore 旧债：上游类型未升级\n  return legacy()\n}\n'

async function mountXiangxiao(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const xiangxiao = await import('../src/plugin/xiangxiao.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(xiangxiao, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.xiangxiao, 'ctx.xiangxiao')

  const { defineTool } = dshTools
  const FILES = { 'src/old.js': OLD_FILE }
  ctx.tools.register(defineTool({
    name: 'edit',
    description: '写探针：path 含 cursed 时固定失败',
    parameters: {
      path: { type: 'string', required: true, description: 'path' },
      content: { type: 'string', description: '内容' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.path.includes('cursed')) throw new Error(`simulated failure: ${args.path}`)
      return `edited:${args.path}`
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
    description: '读探针：返回登记文件的正文（读侧先见的证据源）',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.path.includes('missing')) throw new Error(`simulated failure: ${args.path}`)
      return FILES[args.path] ?? `read:${args.path}`
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
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  const { ctx, call } = await mountXiangxiao({ registry: REGISTRY })
  let reached = false
  const probe = defineTool({
    name: 'probe',
    description: '必炸探针',
    parameters: { path: { type: 'string', required: true, description: 'p' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute() { reached = true; throw new Error('boom') },
  })
  ctx.tools.register(probe)
  await call('probe', { path: 'x.js' })
  assert.ok(reached, '工具本体必须被执行（观察不拦截）')
})

maybe('集成 2：缄笔写探针立案——壅值 30、带「毁」、门红', async () => {
  const { ctx, call } = await mountXiangxiao({ registry: REGISTRY })
  await call('edit', { path: 'src/api.js', content: "// @ts-ignore 请求体形状后面再说\nexport const f = 1\n" })
  const g = ctx.xiangxiao.gate()
  assert.equal(g.score, 30)
  assert.equal(g.band, '毁')
  assert.equal(g.verdict, 'fail')
})

maybe('集成 3：避检 exec 探针立案——成功侧 +30，失败侧不记', async () => {
  const m1 = await mountXiangxiao({ registry: REGISTRY })
  await m1.call('bash', { command: 'git commit --no-verify -m wip' })
  const r1 = m1.ctx.xiangxiao.report()
  assert.equal(r1.counts.bypassFlags, 1)
  assert.equal(r1.score.bypass, 30)

  const m2 = await mountXiangxiao({ registry: REGISTRY })
  await m2.call('bash', { command: 'git push --no-verify boom' }) // 探针失败 → 未遂免咎
  const r2 = m2.ctx.xiangxiao.report()
  assert.equal(r2.counts.bypassFlags, 0)
  assert.equal(r2.score.total, 0)
})

maybe('集成 4：略测探针——10 分点名不咬门（畅带）', async () => {
  const { ctx, call } = await mountXiangxiao({ registry: REGISTRY })
  await call('edit', { path: 'test/legacy.test.js', content: "it.skip('legacy flow', () => {})\n" })
  const r = ctx.xiangxiao.report()
  assert.equal(r.score.skip, 10)
  assert.equal(r.band, '畅')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 5：有凭之默——注记不计分', async () => {
  const { ctx, call } = await mountXiangxiao({ registry: REGISTRY })
  await call('edit', { path: 'src/parse.ts', content: '// @ts-expect-error 未知形状\nconst n = 1\n' })
  const r = ctx.xiangxiao.report()
  assert.equal(r.counts.justified, 1)
  assert.equal(r.score.total, 0)
  assert.ok(r.band === '畅')
})

maybe('集成 6：读探针带正文 → 写保留不计分（读侧先见）', async () => {
  const { ctx, call } = await mountXiangxiao({ registry: REGISTRY })
  await call('read', { path: 'src/old.js' }) // 返回 OLD_FILE 正文，含既有 @ts-ignore
  await call('edit', { path: 'src/old.js', content: OLD_FILE })
  const r = ctx.xiangxiao.report()
  assert.equal(r.counts.keptDirectives, 1)
  assert.equal(r.counts.mutedDirectives, 0)
  assert.equal(r.score.total, 0)
})

maybe('集成 7：config mute 豁免——行内工单号共现即免', async () => {
  const { ctx, call } = await mountXiangxiao({ registry: MUTED })
  await call('edit', { path: 'src/billing.js', content: '// @ts-ignore WPS-4119 上游 SDK 类型缺陷\nexport const c = 1\n' })
  const r = ctx.xiangxiao.report()
  assert.equal(r.counts.exempted, 1)
  assert.equal(r.score.total, 0)
})

maybe('集成 8：谏牌块两次渲染逐字节相同', async () => {
  const { ctx, call } = await mountXiangxiao({ registry: MUTED })
  await call('edit', { path: 'src/api.js', content: "// @ts-ignore SLX-01\nexport const x = 1\n" })
  const a = ctx.xiangxiao.jianpai().text
  const b = ctx.xiangxiao.jianpai().text
  assert.equal(a, b)
  assert.match(a, /【乡校 · 谏牌】/)
  assert.match(a, /WPS-4119/)
  assert.match(a, /缄笔 1/)
})

maybe('集成 9：exportStream 导出流离线 audit 重放——账实一致（90 = 缄笔 60 + 避检 30）', async () => {
  const { ctx, call } = await mountXiangxiao({ registry: REGISTRY })
  await call('edit', { path: 'src/auth.js', content: "/* eslint-disable @typescript-eslint/no-explicit-any */\nexport function signIn(raw) {\n  // @ts-ignore 请求体形状后面再说\n  return post(raw)\n}\n" })
  await call('edit', { path: 'src/utils.py', content: 'def fetch_all(url):\n    data = client.get(url)  # type: ignore\n    return data\n' })
  await call('bash', { command: 'git commit --no-verify -m "wip"' })
  const live = ctx.xiangxiao.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const offline = auditStreams(
    [{ name: 'exported.jsonl', text: ctx.xiangxiao.exportStream().map((e) => JSON.stringify(e)).join('\n') }],
    { registry: REGISTRY }
  )
  assert.equal(offline.cases, live.cases)
  assert.equal(offline.score.total, live.score.total)
  assert.equal(offline.score.total, 90) // 缄笔 60 + 避检 30
  assert.deepEqual(offline.counts, live.counts)
  assert.equal(offline.counts.mutedDirectives, 3)
  assert.equal(offline.counts.bypassFlags, 1)
})

maybe('集成 10：门禁裁决翻转——gate 阈可调', async () => {
  const { ctx, call } = await mountXiangxiao({ registry: REGISTRY, gate: 91 })
  await call('edit', { path: 'src/auth.js', content: "/* eslint-disable x */\n// @ts-ignore\n" }) // 缄笔 2 案 60
  await call('bash', { command: 'git commit --no-verify -m wip' }) // 避检 30
  const g = ctx.xiangxiao.gate()
  assert.equal(g.score, 90)
  assert.equal(g.verdict, 'pass') // 90 < 91
})
