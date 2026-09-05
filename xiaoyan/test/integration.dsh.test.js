/**
 * 真实集成测试 —— 效验插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证四件事：
 *
 *  1. 零拦截是结构性的：失败探针与静默探针都无条件到达工具本体；
 *  2. 称实式插件在真实管道上正确工作（效账 / 效值 / 证块供给 / 门禁）；
 *  3. 免验词表（exempt）在真实管道上生效；
 *  4. 运行时账本与离线审计逐字一致（账实对账）。
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

async function mountXiaoyan(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const xiaoyan = await import('../src/plugin/xiaoyan.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(xiaoyan, config)

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
  await waitFor(() => ctx.xiaoyan, 'ctx.xiaoyan')

  const { defineTool } = dshTools
  ctx.tools.register(defineTool({
    name: 'runner',
    description: '验证探针：silent 返回空串（静默空转）、echo 返回命令原文（以令为证）、boom 固定失败',
    parameters: { command: { type: 'string', required: true, description: 'command' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.command.includes('boom')) throw new Error(`simulated failure: ${args.command}`)
      if (args.command.includes('silent')) return ''
      if (args.command.includes('echo')) return args.command
      return 'Tests: 5 passed, 5 total'
    },
  }))

  async function call(command) {
    return ctx.tools.execute({
      callId: `demo-${Math.random().toString(36).slice(2)}`,
      name: 'runner',
      arguments: { command },
      signal: new AbortController().signal,
    })
  }

  async function settleTo(n) {
    for (let i = 0; i < 500; i++) {
      if (ctx.xiaoyan.report().totals.callsObserved >= n) return
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error(`等待观察结算到 ${n} 超时（实际 ${ctx.xiaoyan.report().totals.callsObserved}）`)
  }

  return { ctx, call, service: ctx.xiaoyan, settleTo }
}

maybe('集成：结构性零拦截 —— 失败探针与静默探针都无条件到达工具本体', async () => {
  const { call, service, settleTo } = await mountXiaoyan()
  for (let i = 1; i <= 3; i++) {
    const r = await call('boom test')
    await settleTo(i)
    assert.equal(r.isError, true, `第 ${i} 次直达工具本体并真实失败`)
  }
  assert.equal(service.report().totals.callsObserved, 3, '三次调用全部被观察，无一被拦截')
  assert.equal(service.report().totals.successes, 0, '失败不入效账（九变地盘）')
  assert.equal(service.report().score.total, 0)
})

maybe('集成：真实输出的验证成功 → 0 分（证验在场）', async () => {
  const { call, service, settleTo } = await mountXiaoyan()
  const r = await call('npm test')
  await settleTo(1)
  assert.equal(r.isError, false)
  const report = service.report()
  assert.equal(report.totals.verified, 1)
  assert.deepEqual(report.score, { total: 0, vacuity: 0, echo: 0 })
  assert.equal(report.band, '明')
})

maybe('集成：静默空转成功 → 空言 25 分（疏带点名，门禁不咬）', async () => {
  const { call, service, settleTo } = await mountXiaoyan()
  const r = await call('npm test --silent')
  await settleTo(1)
  assert.equal(r.isError, false, '退出码报喜')
  const report = service.report()
  assert.equal(report.totals.vacuous, 1)
  assert.equal(report.score.total, 25)
  assert.equal(report.band, '疏')
  assert.equal(service.gate().ok, true, '单件空言不咬门')
})

maybe('集成：以令为证成功 → 回令 20 分；空言+回令合计 45 越门', async () => {
  const { call, service, settleTo } = await mountXiaoyan()
  await call('npm test --silent')
  await settleTo(1)
  await call('npm run echo-check')
  await settleTo(2)
  const report = service.report()
  assert.equal(report.totals.echo, 1)
  assert.equal(report.score.total, 45)
  assert.equal(service.gate().verdict, 'fail', '45 ≥ 门 30')
})

maybe('集成：免验词表（exempt）运行时声明即生效', async () => {
  const { call, service, settleTo } = await mountXiaoyan()
  service.exempt(['--silent'])
  await call('npm test --silent')
  await settleTo(1)
  const report = service.report()
  assert.equal(report.totals.exempted, 1)
  assert.equal(report.totals.vacuous, 0)
  assert.equal(report.score.total, 0)
})

maybe('集成：证块供给——逐字节确定、#k 递增、空言点名', async () => {
  const { call, service, settleTo } = await mountXiaoyan()
  const first = service.zheng()
  assert.equal(first.k, 1)
  assert.match(first.text, /证验在场——效类成功皆有可观。/)

  await call('npm test --silent')
  await settleTo(1)

  const second = service.zheng()
  assert.equal(second.k, 2)
  assert.match(second.text, /【效验 · 证块】效账 #2/)
  assert.match(second.text, /1\. \[调用1\] runner 空言: “\{"command":"npm test --silent"\}”→ 成功而耳目无实/)
  assert.equal(second.vacuous, 1)

  const again = service.zheng()
  assert.equal(again.k, 3)
  assert.equal(again.text, second.text.replace('#2', '#3'), '同状态文本逐字节一致（仅 #k 递增）')
})

maybe('集成：效账（xiaozhang）逐件三问判定', async () => {
  const { call, service, settleTo } = await mountXiaoyan()
  await call('npm test --silent')
  await settleTo(1)
  await call('npm run echo-check')
  await settleTo(2)
  const ledger = service.xiaozhang()
  assert.deepEqual(ledger.events.map((e) => e.kind), ['空言', '回令'])
  assert.match(ledger.issues[0], /^空言：调用1 runner /)
})

maybe('集成：导出流可被离线 audit 重放（observe × audit 账实一致）', async () => {
  const { call, service, settleTo } = await mountXiaoyan()
  await call('npm test --silent')
  await settleTo(1)
  await call('npm run echo-check')
  await settleTo(2)
  await call('npm test')
  await settleTo(3)

  const runtime = service.report()
  const streamText = service
    .exportStream()
    .map((e) => JSON.stringify(e))
    .join('\n')
  const { auditStream } = await import('../src/core/audit.js')
  const offline = auditStream(streamText)

  assert.equal(offline.calls, runtime.totals.callsObserved, '导出流与观察账本逐条一致')
  assert.equal(offline.counts.vacuous, runtime.totals.vacuous)
  assert.equal(offline.counts.echo, runtime.totals.echo)
  assert.equal(offline.score.total, runtime.score.total, '离线效值与运行时一致')
  assert.equal(offline.band, runtime.band)
  assert.equal(offline.verdict, 'fail', '空言 + 回令 → 审计红灯')
})

maybe('集成：结构性零拦截的源码证据 —— 插件不注册 pre-execute 监听器', () => {
  const source = readFileSync(join(here, '..', 'src', 'plugin', 'xiaoyan.js'), 'utf8')
  assert.ok(!source.includes("ctx.on('tools/pre-execute'"), '效验的方向边界：不存在拦截监听器（结构性，不是纪律）')
  assert.ok(source.includes("ctx.on('tools/result'"), '只登记成报（成败与内容原样入账）')
})

maybe('集成：插件形状（name/inject/apply）与服务声明', async () => {
  const xiaoyan = await import('../src/plugin/xiaoyan.js')
  assert.equal(xiaoyan.name, 'xiaoyan')
  assert.deepEqual(xiaoyan.inject, ['tools'])
  assert.equal(typeof xiaoyan.apply, 'function')
  assert.equal(typeof xiaoyan.XiaoyanService, 'function')
})
