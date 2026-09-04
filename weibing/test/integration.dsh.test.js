/**
 * 真实集成测试 —— 治未病插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证五件事：
 *
 *  1. 结构性零监听：插件源码没有任何 ctx.on(...) / pre-execute；
 *  2. 管道零反噬：穿过真实管道的所有调用（含失败探针）全部到达工具本体；
 *  3. 零观察状态：体检结果在工具调用前后逐字一致（插件不在任何接缝上）；
 *  4. 账实对账：运行时 exam/prescribe 与核心引擎、CLI 输出逐字一致；
 *  5. 诚实沉默：无 charter 时出诊拒绝（no-charter），换约立即生效。
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

const CLEAN_CHARTER = JSON.parse(readFileSync(join(root, 'fixtures', 'clean-charter.json'), 'utf8'))
const SICK_CHARTER = JSON.parse(readFileSync(join(root, 'fixtures', 'sick-charter.json'), 'utf8'))

async function mountWeibing(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const weibing = await import('../src/plugin/weibing.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(weibing.default ?? weibing, config)

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
  await waitFor(() => ctx.weibing, 'ctx.weibing')

  const { defineTool } = dshTools
  ctx.tools.register(defineTool({
    name: 'probe',
    description: '探针：tag=boom 时固定失败',
    parameters: { tag: { type: 'string', required: true, description: 'tag' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.tag === 'boom') throw new Error(`simulated failure: ${args.tag}`)
      return `ok:${args.tag}`
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

  return { ctx, call, service: ctx.weibing }
}

maybe('集成：插件挂上真实管道，服务就绪且立约状态可查', async () => {
  const { service } = await mountWeibing({ charter: CLEAN_CHARTER, cwd: join(root, 'fixtures') })
  const r = service.report()
  assert.equal(r.charterInstalled, true)
  assert.equal(r.charterId, 't-clean')
})

maybe('集成：结构性零监听——插件源码没有任何 ctx.on( / pre-execute / 账本读写', async () => {
  const src = readFileSync(join(root, 'src', 'plugin', 'weibing.js'), 'utf8')
  assert.equal(src.includes('ctx.on('), false, '零监听是结构性的：源码里没有事件监听器')
  assert.equal(src.includes('pre-execute'), false)
  assert.equal(src.includes('tools/result'), false)
  const coreSrc = readFileSync(join(root, 'src', 'core', 'exam.js'), 'utf8')
  assert.equal(coreSrc.includes('jsonl'), false, '核心不解析任何会话流')
})

maybe('集成：管道零反噬——连败探针也全部到达工具本体；weibing 零观察状态', async () => {
  const { call, service } = await mountWeibing({ charter: CLEAN_CHARTER, cwd: join(root, 'fixtures') })
  const before = service.exam({ cwd: join(root, 'fixtures') })
  assert.equal(before.valid, true)

  for (let i = 0; i < 4; i++) {
    const r = await call('probe', { tag: 'boom' })
    assert.match(r.error.message, /simulated failure/, `第 ${i + 1} 次直达工具本体`)
  }
  const okCall = await call('probe', { tag: 'fine' })
  assert.match(okCall.content[0].text, /ok:fine/)
  const readCall = await call('read', { path: 'a.js' })
  assert.match(readCall.content[0].text, /read:a\.js/)

  const after = service.exam({ cwd: join(root, 'fixtures') })
  assert.deepEqual(after, before, '六次调用（含四次失败）后体检结果逐字一致——零观察状态')
  const report = service.report()
  assert.equal(report.charterInstalled, true)
})

maybe('集成：账实对账——运行时 exam 与核心引擎 deepEqual', async () => {
  const { runExam } = await import('../src/core/exam.js')
  const { service } = await mountWeibing({ charter: SICK_CHARTER })
  const runtime = service.exam({ cwd: join(root, 'fixtures') })
  const offline = runExam(SICK_CHARTER, { cwd: join(root, 'fixtures') })
  assert.deepEqual(runtime, offline)
  assert.equal(runtime.score, 100)
  assert.equal(runtime.band, '病')
})

maybe('集成：账实对账——运行时 prescribe 与核心渲染器逐字一致且逐字节确定', async () => {
  const { renderPrescribe } = await import('../src/core/prescribe.js')
  const { service } = await mountWeibing({ charter: SICK_CHARTER })
  const p1 = service.prescribe({ cwd: join(root, 'fixtures') })
  const p2 = service.prescribe({ cwd: join(root, 'fixtures') })
  assert.equal(p1.valid, true)
  assert.equal(p1.text, p2.text, '逐字节确定')
  assert.equal(p1.text, renderPrescribe(SICK_CHARTER, service.exam({ cwd: join(root, 'fixtures') })), '与核心渲染器一致')
  assert.match(p1.text, /W1 无验 \+45/)
})

maybe('集成：诚实沉默——无 charter 时出诊拒绝，setCharter 合法换约立即生效', async () => {
  const { service } = await mountWeibing()
  const silent = service.exam({ cwd: join(root, 'fixtures') })
  assert.equal(silent.valid, false)
  assert.equal(silent.error, 'no-charter')
  assert.equal(service.prescribe().error, 'no-charter')

  const rejected = service.setCharter({ version: 9 })
  assert.equal(rejected.valid, false)
  assert.ok(rejected.issues.length > 0)

  service.setCharter(SICK_CHARTER)
  const r = service.exam({ cwd: join(root, 'fixtures') })
  assert.equal(r.valid, true)
  assert.equal(r.charter, 't-sick')
  assert.equal(r.score, 100)
})

maybe('集成：config 立约 + config.cwd 供切诊——artifact 探针真实落盘核对', async () => {
  const { service } = await mountWeibing({ charter: CLEAN_CHARTER, cwd: join(root, 'fixtures') })
  const r = service.exam()
  assert.equal(r.valid, true)
  assert.equal(r.score, 0)
  assert.equal(r.band, '安')
  assert.ok(r.probes.probed >= 4, `切诊应覆盖 artifact/命令/文件/工具，实际 ${r.probes.probed}`)
  assert.equal(r.probes.unprobed, 0)
})

maybe('集成：换约立即翻盘——同一服务从安到病', async () => {
  const { service } = await mountWeibing({ charter: CLEAN_CHARTER, cwd: join(root, 'fixtures') })
  assert.equal(service.exam().score, 0)
  service.setCharter(SICK_CHARTER)
  const after = service.exam()
  assert.equal(after.score, 100)
  assert.equal(after.band, '病')
  assert.equal(service.report().charterId, 't-sick')
})
