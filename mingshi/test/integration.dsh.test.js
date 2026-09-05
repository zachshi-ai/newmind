/**
 * 真实集成测试 —— 名实插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证五件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 核名式插件在真实管道上正确工作（提名 / 生实 / 新装·犯装 / 试装 / 名册块 / 门禁）；
 *  3. 实册两态可切（宽：新装 +6；严：犯装 +30）；
 *  4. 名册块两次渲染逐字节相同；
 *  5. 账实对账：exportStream() 导出流离线 audit 重放，案数与名值与运行时账逐字一致。
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

const REGISTRY = {
  version: 1,
  roots: ['src/**', 'test/**'],
  packages: ['lodash'],
  strictDeps: false,
  extraBuiltins: [],
  extraExts: [],
}
const STRICT = { ...REGISTRY, strictDeps: true }

async function mountMingshi(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const mingshi = await import('../src/plugin/mingshi.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(mingshi, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.mingshi, 'ctx.mingshi')

  const { defineTool } = dshTools
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
    description: '读探针',
    parameters: { path: { type: 'string', required: true, description: 'path' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `read:${args.path}` },
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
  const { Context } = await import('@deepseek-ai/cordis')
  void Context
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  const { ctx, call } = await mountMingshi({ registry: REGISTRY })
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

maybe('集成 2：幻包写探针立案——名值 30、带「妄」、门红', async () => {
  const { ctx, call } = await mountMingshi({ registry: REGISTRY })
  await call('edit', { path: 'src/api.js', content: "import parse from 'json-parser-pro'\n" })
  const g = ctx.mingshi.gate()
  assert.equal(g.score, 30)
  assert.equal(g.band, '妄')
  assert.equal(g.verdict, 'fail')
})

maybe('集成 3：生实探针——先写册外径再引之，免', async () => {
  const { ctx, call } = await mountMingshi({ registry: REGISTRY })
  await call('edit', { path: 'tools/clock.js', content: 'export const x = 1\n' })
  await call('read', { path: 'src/legacy.js' })
  await call('edit', { path: 'main.js', content: "import { x } from './tools/clock.js'\nimport { l } from './src/legacy.js'\n" })
  const r = ctx.mingshi.report()
  assert.equal(r.score.total, 0)
  assert.equal(r.counts.exemptImports, 2)
  assert.equal(r.band, '正')
})

maybe('集成 4：新装与犯装两态可切', async () => {
  const wide = await mountMingshi({ registry: REGISTRY })
  await wide.call('bash', { command: 'npm install left-pad' })
  const rw = wide.ctx.mingshi.report()
  assert.equal(rw.score.stray, 6)
  assert.equal(rw.counts.strayInstalls, 1)

  const strict = await mountMingshi({ registry: STRICT })
  await strict.call('bash', { command: 'npm install left-pad' })
  const rs = strict.ctx.mingshi.report()
  assert.equal(rs.score.stray, 30)
  assert.ok(rs.band === '妄')
})

maybe('集成 5：试装（失败安装）点名不计分、不生实', async () => {
  const m2 = await mountMingshi({ registry: REGISTRY })
  await m2.call('bash', { command: 'npm install boom' }) // 含 boom → 失败 → 试装
  const r = m2.ctx.mingshi.report()
  assert.equal(r.counts.trialInstalls, 1)
  assert.equal(r.score.stray, 0)
  assert.equal(r.score.total, 0)
})

maybe('集成 6：bash 黑盒写不提名（heredoc 之 import 不判）', async () => {
  const { ctx, call } = await mountMingshi({ registry: REGISTRY })
  await call('bash', { command: "cat > a.js <<EOF\nimport 'ghost'\nEOF" })
  const r = ctx.mingshi.report()
  assert.equal(r.totals.installs, 0)
  assert.equal(r.score.total, 0)
})

maybe('集成 7：名册块两次渲染逐字节相同', async () => {
  const { ctx, call } = await mountMingshi({ registry: REGISTRY })
  await call('edit', { path: 'src/api.js', content: "import parse from 'json-parser-pro'\n" })
  const a = ctx.mingshi.mingce().text
  const b = ctx.mingshi.mingce().text
  assert.equal(a, b)
  assert.match(a, /src\/\*\*/)
  assert.match(a, /夫名，实谓也/)
})

maybe('集成 8：exportStream 导出流离线 audit 重放——账实一致', async () => {
  const { ctx, call } = await mountMingshi({ registry: REGISTRY })
  await call('edit', { path: 'src/api.js', content: "import parse from 'json-parser-pro'\nimport _ from 'lodash'\n" })
  await call('bash', { command: 'npm install left-pad' })
  await call('bash', { command: 'npm install boom' }) // 试装
  const live = ctx.mingshi.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const offline = auditStreams(
    [{ name: 'exported.jsonl', text: ctx.mingshi.exportStream().map((e) => JSON.stringify(e)).join('\n') }],
    { registry: REGISTRY }
  )
  assert.equal(offline.imports, 2)
  assert.equal(offline.score.total, live.score.total)
  assert.equal(offline.score.total, 36) // 幻包 30 + 新装 6
  assert.deepEqual(offline.counts, live.counts)
  assert.equal(offline.counts.ghostPackages, 1)
  assert.equal(offline.counts.strayInstalls, 1)
  assert.equal(offline.counts.trialInstalls, 1)
})

maybe('集成 9：门禁裁决翻转——gate 阈可调', async () => {
  const { ctx, call } = await mountMingshi({ registry: REGISTRY, gate: 31 })
  await call('edit', { path: 'src/app.js', content: "import { c } from '../config/secrets.js'\n" }) // 幻径 15
  const g = ctx.mingshi.gate()
  assert.equal(g.score, 15)
  assert.equal(g.verdict, 'pass') // 15 < 31
})
