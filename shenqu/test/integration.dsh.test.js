/**
 * 真实集成测试 —— 审曲插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 审材式插件在真实管道上正确工作（取窗→盲动 / 显残→盲动 / 取窗认全 / 补览赦免 /
 *     碎览 / 豁免 / 失败写不入账）；
 *  3. 材牌块两次渲染逐字节相同；
 *  4. 账实对账：exportStream() 导出流离线 audit 重放，案数与残值与运行时账逐字一致；
 *  5. gate 裁决可调。
 *
 * 读探针带 limit/offset 窗参数、超限截断并在尾部接 [truncated] 残记——真实 harness
 * 读工具的通行形态（结构化取窗 + 尾部标记）。
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

const BOOK = { version: 1, exempt: [], markers: [], windowFields: [], fragWindows: 3, noDefaults: false }
const EXEMPT_BOOK = { version: 1, exempt: ['vendor/'], markers: [], windowFields: [], fragWindows: 3, noDefaults: false }

/** 内存小文件系统：写探针存行数组，读探针按 offset/limit 取窗、超限尾部接残记。 */
function createMiniFs() {
  const store = new Map()
  return {
    write(path, content) { store.set(path, String(content).split('\n')) },
    read(path, { limit = null, offset = 0 } = {}) {
      const HARD_CAP = 100 // harness 输出上限的通行形态：无窗参数也硬截断
      const lines = store.get(path) ?? []
      const skip = offset > 0 ? offset : 0
      let out = lines.slice(skip)
      if (limit != null && limit > 0) out = out.slice(0, limit)
      let clipped = out.length > 0 && skip + out.length < lines.length // 窗未到底
      if (out.length > HARD_CAP) {
        out = out.slice(0, HARD_CAP)
        clipped = true
      }
      let text = out.join('\n')
      if (clipped) text += '\n[truncated]'
      return text
    },
    size(path) { return (store.get(path) ?? []).length },
  }
}

const L = (tag, n) => Array.from({ length: n }, (_, i) => `${tag} line ${i + 1}`).join('\n')

async function mountShenqu(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const shenqu = await import('../src/plugin/shenqu.js')

  const fs = createMiniFs()
  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(shenqu, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.shenqu, 'ctx.shenqu')

  const { defineTool } = dshTools
  const probe = (name, description, parameters, execute) => defineTool({
    name, description, parameters,
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    execute,
  })

  ctx.tools.register(probe('write', '写探针', {
    path: { type: 'string', required: true, description: 'path' },
    content: { type: 'string', required: true, description: 'content' },
  }, async (args) => {
    fs.write(args.path, args.content)
    return `wrote:${args.path}`
  }))
  ctx.tools.register(probe('edit', '改写探针：path 含 cursed 时固定失败', {
    path: { type: 'string', required: true, description: 'path' },
    content: { type: 'string', description: 'content' },
  }, async (args) => {
    if (args.path.includes('cursed')) throw new Error(`simulated failure: ${args.path}`)
    fs.write(args.path, args.content)
    return `edited:${args.path}`
  }))
  ctx.tools.register(probe('read', '读探针：path 含 missing 时固定失败；limit/offset 取窗、超限尾部带残记', {
    path: { type: 'string', required: true, description: 'path' },
    limit: { type: 'number', description: '窗口行数' },
    offset: { type: 'number', description: '跳过行数' },
  }, async (args) => {
    if (args.path.includes('missing')) throw new Error(`simulated failure: ${args.path}`)
    return fs.read(args.path, { limit: args.limit ?? null, offset: args.offset ?? 0 })
  }))

  async function call(name, args) {
    return ctx.tools.execute({
      callId: `demo-${Math.random().toString(36).slice(2)}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })
  }

  return { ctx, call, fs }
}

maybe('集成 1：结构性零拦截——失败探针也无条件到达工具本体', async () => {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  const { ctx, call } = await mountShenqu({ book: BOOK })
  let reached = false
  const p = defineTool({
    name: 'probe', description: '必炸探针',
    parameters: { path: { type: 'string', required: true, description: 'p' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute() { reached = true; throw new Error('boom') },
  })
  ctx.tools.register(p)
  await call('probe', { path: 'x.js' })
  assert.ok(reached, '工具本体必须被执行（观察不拦截）')
})

maybe('集成 2：取窗后动刀探针立案——残值 30、带「盲」、门红', async () => {
  const { ctx, call, fs } = await mountShenqu({ book: BOOK })
  fs.write('src/api.js', L('api', 200))
  await call('read', { path: 'src/api.js', limit: 40 }) // 回程 40 ≥ 窗值 40 → 残见（取窗）
  await call('edit', { path: 'src/api.js', content: 'patch' })
  const g = ctx.shenqu.gate()
  assert.equal(g.score, 30)
  assert.equal(g.band, '盲')
  assert.equal(g.verdict, 'fail')
})

maybe('集成 3：显残探针立案——无窗参数、卷尾残记（harness 硬截断形态）', async () => {
  const { ctx, call, fs } = await mountShenqu({ book: BOOK })
  fs.write('docs/report.md', L('doc', 200))
  const text = (await call('read', { path: 'docs/report.md' })).content[0].text
  assert.ok(text.endsWith('[truncated]'), '读探针超限应截断并带残记')
  await call('edit', { path: 'docs/report.md', content: 'patch' })
  const g = ctx.shenqu.gate()
  assert.equal(g.score, 30)
  assert.equal(g.verdict, 'fail')
})

maybe('集成 4：取窗认全——限窗内回程短于窗值 → 全览清白', async () => {
  const { ctx, call, fs } = await mountShenqu({ book: BOOK })
  fs.write('src/small.js', L('s', 3))
  await call('read', { path: 'src/small.js', limit: 100 })
  await call('edit', { path: 'src/small.js', content: 'patch' })
  const r = ctx.shenqu.report()
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
  assert.equal(r.gauge.windowReads, 1)
  assert.equal(r.counts.fullViews, 1)
})

maybe('集成 5：补览赦免——残见后全览再动刀清白', async () => {
  const { ctx, call, fs } = await mountShenqu({ book: BOOK })
  fs.write('src/mid.js', L('m', 60))
  await call('read', { path: 'src/mid.js', limit: 40 }) // 残见
  await call('read', { path: 'src/mid.js' }) // 全览（60 ≤ 100 不截断）
  await call('edit', { path: 'src/mid.js', content: 'patch' })
  const r = ctx.shenqu.report()
  assert.equal(r.score.total, 0)
  assert.equal(r.counts.partialViews, 1)
  assert.equal(r.counts.fullViews, 1)
})

maybe('集成 6：三窗不读全 → 碎览 1 案 10 分、点名不咬门', async () => {
  const { ctx, call, fs } = await mountShenqu({ book: BOOK })
  fs.write('logs/a.log', L('a', 30))
  await call('read', { path: 'logs/a.log', limit: 10 })
  await call('read', { path: 'logs/a.log', offset: 10 })
  await call('read', { path: 'logs/a.log', limit: 5 })
  const r = ctx.shenqu.report()
  assert.deepEqual(r.score, { total: 10, blind: 0, crawl: 10 })
  assert.equal(r.band, '全')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 7：豁免径在册全免——vendor/ 见写全免出账', async () => {
  const { ctx, call, fs } = await mountShenqu({ book: EXEMPT_BOOK })
  fs.write('vendor/lib.js', L('v', 200))
  await call('read', { path: 'vendor/lib.js', limit: 40 })
  await call('edit', { path: 'vendor/lib.js', content: 'patch' })
  const r = ctx.shenqu.report()
  assert.equal(r.counts.exempted, 1)
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

maybe('集成 8：失败写不入账——探针失败后残值 0', async () => {
  const { ctx, call, fs } = await mountShenqu({ book: BOOK })
  fs.write('src/api.js', L('api', 200))
  await call('read', { path: 'src/api.js', limit: 40 })
  await call('edit', { path: 'src/cursed.js', content: 'patch' }) // 探针固定失败
  const r = ctx.shenqu.report()
  assert.equal(r.counts.blindActs, 0)
  assert.equal(r.score.total, 0)
})

maybe('集成 9：材牌块两次渲染逐字节相同', async () => {
  const { ctx, call, fs } = await mountShenqu({ book: EXEMPT_BOOK })
  fs.write('vendor/lib.js', L('v', 3))
  await call('read', { path: 'vendor/lib.js', limit: 2 })
  const a = ctx.shenqu.caipai().text
  const b = ctx.shenqu.caipai().text
  assert.equal(a, b)
  assert.match(a, /【审曲 · 材牌】/)
  assert.match(a, /vendor\//)
})

maybe('集成 10：exportStream 导出流离线 audit 重放——账实一致（40 = 盲动 30 + 碎览 10）', async () => {
  const { ctx, call, fs } = await mountShenqu({ book: BOOK })
  fs.write('src/big.js', L('b', 200))
  fs.write('logs/x.log', L('x', 30))
  await call('read', { path: 'src/big.js', limit: 40 }) // 残见（取窗）
  await call('edit', { path: 'src/big.js', content: 'patch' }) // 盲动 30
  await call('read', { path: 'logs/x.log', limit: 10 }) // 碎览三窗
  await call('read', { path: 'logs/x.log', limit: 10 })
  await call('read', { path: 'logs/x.log', limit: 10 })
  const live = ctx.shenqu.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const offline = auditStreams(
    [{ name: 'exported.jsonl', text: ctx.shenqu.exportStream().map((e) => JSON.stringify(e)).join('\n') }],
    { book: BOOK },
  )
  assert.equal(offline.score.total, live.score.total)
  assert.equal(offline.score.total, 40) // 盲动 30 + 碎览 10
  assert.deepEqual(offline.counts, live.counts)
  assert.equal(offline.counts.blindActs, 1)
  assert.equal(offline.counts.crawls, 1)
})

maybe('集成 11：门禁裁决翻转——gate 阈可调', async () => {
  const { ctx, call, fs } = await mountShenqu({ book: BOOK, gate: 50 })
  fs.write('src/big.js', L('b', 200))
  fs.write('logs/y.log', L('y', 30))
  await call('read', { path: 'src/big.js', limit: 40 })
  await call('edit', { path: 'src/big.js', content: 'patch' })
  await call('read', { path: 'logs/y.log', limit: 10 })
  await call('read', { path: 'logs/y.log', limit: 10 })
  await call('read', { path: 'logs/y.log', limit: 10 })
  const g = ctx.shenqu.gate()
  assert.equal(g.score, 40)
  assert.equal(g.verdict, 'pass') // 40 < 50
})
