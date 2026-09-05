/**
 * 真实集成测试 —— 直笔插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证四件事：
 *
 *  1. 零拦截是结构性的：带讳形的探针也无条件到达工具本体；
 *  2. 秉笔式插件在真实管道上正确工作（笔账 / 讳值 / 实录块 / 门禁）；
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

const HOLLOW_CMD = 'npm test || true'
const CLEAN_CMD = 'npm test'
const DUAL_CMD = 'bash -c "set +e; make all; npm run test"'

async function mountZhibi(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const zhibi = await import('../src/plugin/zhibi.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(zhibi, config)

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
  await waitFor(() => ctx.zhibi, 'ctx.zhibi')

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
      description: '写探针',
      parameters: { path: { type: 'string', required: true, description: 'path' } },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args) {
        return `wrote:${args.path}`
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
      if (ctx.zhibi.report().totals.callsObserved >= n) return
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error(`等待观察结算到 ${n} 超时（实际 ${ctx.zhibi.report().totals.callsObserved}）`)
  }

  return { ctx, call, service: ctx.zhibi, settleTo }
}

maybe('集成: 插件源码无 pre-execute 监听（零拦截是结构性的）', () => {
  const src = readFileSync(join(here, '..', 'src', 'plugin', 'zhibi.js'), 'utf8')
  assert.ok(!src.includes("on('tools/pre-execute'"), '不得注册拦截监听器')
})

maybe('集成: 带讳形的探针无条件到达工具本体（管道零反噬）', async () => {
  const { call, service, settleTo } = await mountZhibi()
  const r = await call('bash', { command: HOLLOW_CMD })
  await settleTo(1)
  assert.match(r.content[0].text, /ran:npm test \|\| true/, '工具本体照常执行并返回')
  const report = service.report()
  assert.equal(report.totals.konglv, 1)
  assert.equal(report.score.total, 30)
  assert.equal(service.gate().verdict, 'fail')
})

maybe('集成: 笔账随结果结算步进，一案双族即 60', async () => {
  const { call, service, settleTo } = await mountZhibi()
  await call('bash', { command: DUAL_CMD })
  await settleTo(1)
  const report = service.report()
  assert.equal(report.totals.families, 2)
  assert.equal(report.totals.konglv, 2)
  assert.equal(report.score.total, 60)
  assert.equal(report.band, '诬')
})

maybe('集成: 真判还直——已赎讳笔 +10 不越默认门', async () => {
  const { call, service, settleTo } = await mountZhibi()
  await call('bash', { command: HOLLOW_CMD })
  await settleTo(1)
  await call('bash', { command: CLEAN_CMD })
  await settleTo(2)
  const report = service.report()
  assert.equal(report.totals.weibi, 1)
  assert.equal(report.totals.konglv, 0)
  assert.equal(report.score.total, 10)
  assert.equal(service.gate().verdict, 'pass')
})

maybe('集成: excuses 配置注入豁免词，豁笔不罪不触族末', async () => {
  const { call, service, settleTo } = await mountZhibi({ excuses: ['smoke-optional'] })
  await call('bash', { command: 'npm test || true # smoke-optional' })
  await settleTo(1)
  const report = service.report()
  assert.equal(report.totals.huibi, 1)
  assert.equal(report.totals.families, 0)
  assert.equal(report.score.total, 0)
})

maybe('集成: register 配置对象注入笔册（显式史词 + 显式讳形）', async () => {
  const { call, service, settleTo } = await mountZhibi({
    register: { words: ['\\bzdeploy\\b'], masks: ['--dry-run-nothing'], noDefaults: true },
  })
  await call('bash', { command: 'zdeploy ship --dry-run-nothing' })
  await settleTo(1)
  assert.equal(service.report().totals.konglv, 1)
})

maybe('集成: bizhang 逐案清单无命令全文，摘录经掩码自洁', async () => {
  const { call, service, settleTo } = await mountZhibi()
  await call('bash', { command: 'K=sk-live-abcdef0123456789 npm test || true' })
  await settleTo(1)
  const { cases } = service.bizhang()
  assert.equal(cases.length, 1)
  const dump = JSON.stringify(cases)
  assert.ok(!dump.includes('sk-live-abcdef0123456789'), '凭据原文不得入账面')
  assert.ok(cases[0].excerpt.includes('…'))
  assert.ok(cases[0].masks.includes('吞真形'))
})

maybe('集成: 实录块 #k 随渲染递增且仅此一处不同', async () => {
  const { call, service, settleTo } = await mountZhibi()
  await call('bash', { command: HOLLOW_CMD })
  await settleTo(1)
  const s1 = service.shilu()
  const s2 = service.shilu()
  assert.equal(s1.k, 1)
  assert.equal(s2.k, 2)
  const l1 = s1.text.split('\n')
  const l2 = s2.text.split('\n')
  assert.equal(l1[0], '【直笔 · 实录块 #1】')
  assert.equal(l2[0], '【直笔 · 实录块 #2】')
  assert.deepEqual(l1.slice(1), l2.slice(1))
  assert.ok(s1.text.includes('pkg-test：讳（空绿）'))
})

maybe('集成: exportStream 与离线 audit 账实对账（deepEqual 讳值与案数）', async () => {
  const { auditStream } = await import('../src/core/audit.js')
  const { call, service, settleTo } = await mountZhibi({ excuses: ['smoke-optional'] })
  await call('bash', { command: HOLLOW_CMD })
  await settleTo(1)
  await call('bash', { command: 'make all || true # smoke-optional' })
  await settleTo(2)

  const lines = service.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const offline = auditStream(lines, { excuses: ['smoke-optional'] })
  const online = service.report()

  assert.deepEqual(offline.score, online.score)
  assert.equal(offline.band, online.band)
  assert.equal(offline.counts.konglv, online.totals.konglv)
  assert.equal(offline.counts.huibi, online.totals.huibi)
})

maybe('集成: 观察异常不冒泡——null 结算事件吞掉，管道照常', async () => {
  const { ctx, call, service, settleTo } = await mountZhibi()
  ctx.emit('tools/result', undefined, undefined) // 监听器内部异常应被吞掉
  const r = await call('bash', { command: CLEAN_CMD })
  await settleTo(1)
  assert.match(r.content[0].text, /ran:npm test/)
  assert.equal(service.report().score.total, 0) // 真判不虚报，管道未反噬
})

maybe('集成: 非 exec 调用只计数不成史事', async () => {
  const { call, service, settleTo } = await mountZhibi()
  await call('edit', { path: 'src/app.js' })
  await settleTo(1)
  const report = service.report()
  assert.equal(report.totals.callsObserved, 1)
  assert.equal(report.totals.shishi, 0)
  assert.equal(report.score.total, 0)
})
