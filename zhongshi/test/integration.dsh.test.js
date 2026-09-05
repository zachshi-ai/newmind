/**
 * 真实集成测试 —— 终始插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证四件事：
 *
 *  1. 零拦截是结构性的：幽项探针也无条件到达工具本体；
 *  2. 记程式插件在真实管道上正确工作（程账 / 程值 / 程账块 / 门禁）；
 *  3. 运行时账本与离线审计逐字一致（账实对账）；
 *  4. 观察永不反噬（异常吞掉，管道照常）。
 *
 * 官方包在 devDependencies 里；未安装（离线/零依赖场景）时跳过本文件。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const cordisRoot = join(here, '..', 'node_modules', '@deepseek-ai', 'cordis')

const available = existsSync(cordisRoot)
const maybe = available ? test : test.skip

const ITEMS = [
  { id: 'T1', name: '断连修复', aliases: ['flink-reconnect'], terminal: ['test flink'], abandon: [] },
  { id: 'T2', name: '清单更新', aliases: ['manifest.yml'], terminal: ['manifest check'], abandon: ['放弃清单'] },
]

async function mountZhongshi(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const zhongshi = await import('../src/plugin/zhongshi.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(zhongshi, config)

  // Cordis 的服务 fiber 异步启动；等待服务可用（带超时的确定性轮询）
  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.zhongshi, 'ctx.zhongshi')

  const { defineTool } = dshTools
  ctx.tools.register(
    defineTool({
      name: 'bash',
      description: 'shell 探针',
      parameters: { command: { type: 'string', required: true, description: 'command' } },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args) {
        return `ran:${args.command}`
      },
    }),
  )
  ctx.tools.register(
    defineTool({
      name: 'edit',
      description: '写族探针',
      parameters: { path: { type: 'string', required: true, description: 'path' } },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args) {
        return `edited:${args.path}`
      },
    }),
  )
  ctx.tools.register(
    defineTool({
      name: 'todo_write',
      description: 'todo 探针（作工面收窄的验证对象）',
      parameters: { todos: { type: 'string', required: true, description: 'todos' } },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args) {
        return `todos:${args.todos ?? ''}`
      },
    }),
  )

  let seq = 0
  async function call(name, args) {
    return ctx.tools.execute({
      callId: `demo-${++seq}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })
  }

  async function settleTo(n) {
    for (let i = 0; i < 500; i++) {
      if (ctx.zhongshi.report().totals.callsObserved >= n) return
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error(`等待观察结算到 ${n} 超时（实际 ${ctx.zhongshi.report().totals.callsObserved}）`)
  }

  return { ctx, call, service: ctx.zhongshi, settleTo }
}

maybe('集成: 插件源码无 pre-execute 监听（零拦截是结构性的）', () => {
  const src = readFileSync(join(here, '..', 'src', 'plugin', 'zhongshi.js'), 'utf8')
  assert.ok(!src.includes("on('tools/pre-execute'"), '不得注册拦截监听器')
})

maybe('集成: 幽项探针无条件到达工具本体（管道零反噬），单幽项即红', async () => {
  const { call, service, settleTo } = await mountZhongshi({ items: ITEMS })
  const r = await call('bash', { command: 'echo unrelated' })
  await settleTo(1)
  assert.match(r.content[0].text, /ran:echo unrelated/, '工具本体照常执行并返回')
  assert.equal(service.report().totals.youCount, 2) // 两事皆未作工
  assert.equal(service.gate().verdict, 'fail')
})

maybe('集成: 程账随结果结算步进——作工至终言则账平过门', async () => {
  const { call, service, settleTo } = await mountZhongshi({
    items: [ITEMS[0]],
  })
  await call('edit', { path: 'net/flink-reconnect.js' })
  await settleTo(1)
  assert.equal(service.report().totals.banCount, 1)
  await call('bash', { command: 'npm run test flink' })
  await settleTo(2)
  const report = service.report()
  assert.equal(report.totals.youZhong, 1)
  assert.equal(report.score.total, 0)
  assert.equal(report.band, '近道')
  assert.equal(service.gate().verdict, 'pass')
})

maybe('集成: 空终在真实管道上逐案入账', async () => {
  const { call, service, settleTo } = await mountZhongshi({ items: [ITEMS[0]] })
  await call('bash', { command: 'npm run test flink' })
  await settleTo(1)
  await call('edit', { path: 'net/flink-reconnect.js' })
  await settleTo(2)
  const report = service.report()
  assert.equal(report.totals.banCount, 1)
  assert.equal(report.totals.kongCount, 1)
  assert.equal(report.score.total, 35) // 半途 15 + 空终 20
})

maybe('集成: 弃言在流中词面即生效（提交信息里的显式弃）', async () => {
  const { call, service, settleTo } = await mountZhongshi({ items: [ITEMS[1]] })
  await call('bash', { command: 'git commit -m "放弃清单：上游已合并"' })
  await settleTo(1)
  const report = service.report()
  assert.equal(report.totals.youQi, 1)
  assert.equal(report.score.total, 0)
})

maybe('集成: todo_write 的参数全是项词也不计作工', async () => {
  const { call, service, settleTo } = await mountZhongshi({ items: ITEMS })
  await call('todo_write', { todos: 'T1 断连修复 in_progress；T2 清单更新 pending' })
  await settleTo(1)
  const report = service.report()
  assert.equal(report.totals.callsObserved, 1)
  assert.equal(report.totals.youCount, 2) // 两事仍全流无作工
})

maybe('集成: 写族调用计入作工；观察族亦然', async () => {
  const { call, service, settleTo } = await mountZhongshi({ items: [ITEMS[0]] })
  await call('edit', { path: 'net/flink-reconnect.js' })
  await settleTo(1)
  assert.equal(service.report().totals.banCount, 1)
})

maybe('集成: 程账块 #k 随渲染递增且仅此一处不同', async () => {
  const { call, service, settleTo } = await mountZhongshi({ items: ITEMS })
  await call('bash', { command: 'npm run test flink' })
  await settleTo(1)
  const k1 = service.chengkuai()
  const k2 = service.chengkuai()
  assert.equal(k1.k, 1)
  assert.equal(k2.k, 2)
  const l1 = k1.text.split('\n')
  const l2 = k2.text.split('\n')
  assert.equal(l1[0], '【终始 · 程账块 #1】')
  assert.equal(l2[0], '【终始 · 程账块 #2】')
  assert.deepEqual(l1.slice(1), l2.slice(1))
  assert.ok(k1.text.includes('T1 断连修复｜有终｜始#1 终#1'))
  assert.ok(k1.text.includes('T2 清单更新｜幽项｜全流无作工'))
})

maybe('集成: exportStream 与离线 audit 账实对账（deepEqual 程值与案数）', async () => {
  const { auditStream } = await import('../src/core/audit.js')
  const { call, service, settleTo } = await mountZhongshi({ items: ITEMS })
  await call('bash', { command: 'npm run test flink' })
  await settleTo(1)
  await call('edit', { path: 'net/flink-reconnect.js' })
  await settleTo(2)

  const lines = service.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const offline = auditStream(lines, { items: ITEMS })
  const online = service.report()

  assert.deepEqual(offline.score, online.score)
  assert.equal(offline.band, online.band)
  assert.equal(offline.counts.youCount, online.totals.youCount)
  assert.equal(offline.counts.kongCount, online.totals.kongCount)
})

maybe('集成: 观察异常不冒泡——null 结算事件吞掉，管道照常', async () => {
  const { ctx, call, service, settleTo } = await mountZhongshi({ items: ITEMS })
  ctx.emit('tools/result', undefined, undefined) // 监听器内部异常应被吞掉
  const r = await call('bash', { command: 'git status' })
  await settleTo(1)
  assert.match(r.content[0].text, /ran:git status/)
  assert.equal(service.report().score.total, 60) // 两事皆幽项 30×2——账照记，管道未反噬
})
