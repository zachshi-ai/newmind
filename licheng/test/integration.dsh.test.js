/**
 * 真实集成测试 —— 立诚插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证五件事：
 *
 *  1. 结构性零拦截：插件源码没有执行前拦截监听器（只有 tools/result 一个观察口）；
 *  2. 管道零反噬：穿过真实管道的所有调用（含失败探针）全部到达工具本体，
 *     且每次真实执行都被完整入账（含 isError）；
 *  3. 全链路记账：make / revise / abandon / declare / settle 可用，
 *     咎值、分带、悬结与核心引擎账实对账（deepEqual）；
 *  4. 诚实记账：形状/账序错误一律 valid:false + issues，绝不入坏账；
 *  5. 供给确定：block() 两次调用逐字节一致，且与核心渲染器逐字一致。
 *
 * 官方包在 devDependencies 里；未安装（离线/零依赖场景）时跳过本文件。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const cordisRoot = join(root, 'node_modules', '@deepseek-ai', 'cordis')

const available = existsSync(cordisRoot)
const maybe = available ? test : test.skip

async function mountLicheng(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const licheng = await import('../src/plugin/licheng.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(licheng.default ?? licheng, config)

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
  await waitFor(() => ctx.licheng, 'ctx.licheng')

  const { defineTool } = dshTools
  ctx.tools.register(
    defineTool({
      name: 'work',
      description: '干活探针：tag=boom 时固定失败',
      parameters: { tag: { type: 'string', required: true, description: 'tag' } },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args) {
        if (args.tag === 'boom') throw new Error(`simulated failure: ${args.tag}`)
        return `did:${args.tag}`
      },
    })
  )

  async function call(name, args) {
    return ctx.tools.execute({
      callId: `demo-${Math.random().toString(36).slice(2)}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })
  }

  return { ctx, call, service: ctx.licheng }
}

maybe('集成：插件挂上真实管道，服务就绪且空账状态诚实', async () => {
  const { service } = await mountLicheng({ gate: 30 })
  const r = service.report()
  assert.deepEqual(r, { ledgerSize: 0, openKnots: 0, gate: 30, zeroIntercept: true })
  const s = service.settle()
  assert.equal(s.score, 0)
  assert.equal(s.band, '无咎')
  assert.equal(s.verdict, 'pass')
  assert.deepEqual(s.speech, { events: 0, markerHits: 0, unaccounted: null })
})

maybe('集成：结构性零拦截——插件源码只有 tools/result 一个监听器，无执行前接缝', () => {
  const src = readFileSync(join(root, 'src', 'plugin', 'licheng.js'), 'utf8')
  assert.equal(src.includes('pre-execute'), false, '执行前拦截接缝上没有本插件的存在')
  assert.equal(src.split('ctx.on(').length - 1, 1, '唯一监听器就是结果观察口')
  assert.ok(src.includes("ctx.on('tools/result'"), '监听器挂在 tools/result 上')
  const coreSrc = readFileSync(join(root, 'src', 'core', 'settle.js'), 'utf8')
  assert.equal(coreSrc.includes('ctx.on('), false, '核心引擎不接触任何管道接缝')
})

maybe('集成：管道零反噬——连败探针全部到达工具本体，且每次执行都完整入账', async () => {
  const { call, service } = await mountLicheng({ gate: 30 })
  for (let i = 0; i < 4; i++) {
    const r = await call('work', { tag: 'boom' })
    assert.match(r.error.message, /simulated failure/, `第 ${i + 1} 次直达工具本体`)
  }
  const ok = await call('work', { tag: 'fine' })
  assert.match(ok.content[0].text, /did:fine/)

  const calls = service.exportCalls()
  assert.equal(calls.length, 5, '四次失败一次成功，一次不少')
  assert.equal(calls.filter((c) => c.isError === true).length, 4)
  assert.equal(calls.filter((c) => c.isError === false).length, 1)
  assert.deepEqual(calls[4].args, { tag: 'fine' })
})

maybe('集成：全链路——立结、兑现、改诺、弃约、宣告，咎值与核心引擎账实对账', async () => {
  const { call, service } = await mountLicheng({ gate: 30 })
  assert.equal(service.make({ id: 'p-001', what: '跑一遍 smoke', discharge: { tool: 'work', contains: 'smoke', ok: true } }).valid, true)
  assert.equal(service.make({ id: 'p-002', what: '同步 README 示例' }).valid, true, '无凭之诺也入账（凡诺必记）')
  await call('work', { tag: 'smoke' })

  const runtime = service.settle()
  assert.deepEqual(runtime.totals, { promised: 2, discharged: 1, revised: 0, abandoned: 0, breached: 1 })
  assert.equal(runtime.score, 40)
  assert.equal(runtime.band, '咎')

  // 账实对账：离线核心引擎对同一账 + 导出的调用流，逐字一致
  const { settleLedger } = await import('../src/core/settle.js')
  const offline = settleLedger(service.entries, service.exportCalls(), { gate: 30, speech: [] })
  assert.deepEqual(runtime, offline)
})

maybe('集成：改诺免咎——revise 合法关闭旧结，凭据与 what 全量继承后兑现', async () => {
  const { call, service } = await mountLicheng({ gate: 30 })
  service.make({ id: 'p-001', what: '跑全量回归', discharge: { tool: 'work', contains: 'full', ok: true } })
  assert.equal(service.revise({ id: 'p-001r', supersedes: 'p-001', reason: '范围与做法声明同步收窄' }).valid, true)
  await call('work', { tag: 'full' })

  const r = service.settle()
  assert.deepEqual(r.totals, { promised: 1, discharged: 1, revised: 1, abandoned: 0, breached: 0 })
  assert.equal(r.discharged[0].id, 'p-001r')
  assert.equal(r.discharged[0].dischargedAt, 0, '继承的凭据对新结依然对账')
})

maybe('集成：弃约与宣告——带凭弃约悔 0；宣告补凭命中翻兑现', async () => {
  const { call, service } = await mountLicheng({ gate: 30 })
  service.make({ id: 'p-001', what: '生成报告', discharge: { tool: 'work', contains: 'REPORT' } })
  assert.equal(service.abandon('p-001', '宿主指示作废').valid, true)
  service.make({ id: 'p-002', what: '随口一诺' })
  assert.equal(service.declare('p-002', { tool: 'work', contains: 'done' }).valid, true)
  await call('work', { tag: 'done' })

  const r = service.settle()
  assert.deepEqual(r.totals, { promised: 2, discharged: 1, revised: 0, abandoned: 1, breached: 0 })
  assert.equal(r.score, 0)
  assert.deepEqual(r.lenientAbandoned, [])
})

maybe('集成：诚实记账——形状错误、id 重复、目标不存在/已关闭一律拒绝且不入账', async () => {
  const { service } = await mountLicheng({ gate: 30 })
  assert.equal(service.make({ id: 'p-001' }).valid, false, '缺 what')
  assert.equal(service.make({ id: 'p-001', what: 'x', extra: 1 }).valid, false, '未知键')
  assert.equal(service.make({ id: 'p-001', what: 'x' }).valid, true)
  assert.equal(service.make({ id: 'p-001', what: 'y' }).valid, false, 'id 重复')
  assert.equal(service.revise({ id: 'p-9r', supersedes: 'p-9', reason: 'x' }).valid, false, '目标不存在')
  assert.equal(service.abandon('p-001', '弃').valid, true)
  assert.equal(service.revise({ id: 'p-001r', supersedes: 'p-001', reason: '改' }).valid, false, '目标已关闭')
  assert.equal(service.declare('p-001', { contains: 'x' }).valid, false, '宣告指向已关闭的结')
  assert.equal(service.report().ledgerSize, 2, '两次拒绝均未入账')
})

maybe('集成：供给确定——block 两次逐字节一致，且与核心渲染器逐字一致', async () => {
  const { call, service } = await mountLicheng({ gate: 30 })
  service.make({ id: 'p-001', what: '跑 smoke', discharge: { tool: 'work', contains: 'smoke', ok: true } })
  service.make({ id: 'p-002', what: '随口一诺' })
  await call('work', { tag: 'smoke' })

  const b1 = service.block()
  const b2 = service.block()
  assert.equal(b1.valid, true)
  assert.equal(b1.text, b2.text, '逐字节确定')
  const { renderBlock } = await import('../src/core/block.js')
  assert.equal(b1.text, renderBlock(service.settle()), '与核心渲染器一致')
  assert.match(b1.text, /悬结：p-002「随口一诺」咎\+30，轻诺\+10（整条链无凭据）/)
})
