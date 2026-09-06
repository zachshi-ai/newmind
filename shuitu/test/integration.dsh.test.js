/**
 * 真实集成测试 —— 水土插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证九件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. exec `npm install -g` 探针立案（装案，异值 15 移带黄牌）；
 *  3. exec `git config --global` 探针立案（改案）；
 *  4. exec `brew services start` 探针立案（驻案，单案即红）；
 *  5. write `~/.zshrc` 探针立案（改径形写案）；
 *  6. 配对卸词探针销案（复）；
 *  7. 土册豁免词生效（豁，完全出账）；
 *  8. exportStream() 导出流离线 audit 重放，案数与异值与运行时账账实一致；
 *  9. gate 裁决翻转 + 土牌块两次渲染逐字节相同。
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

const BOOK = { version: 1, install: [], config: [], reside: [] }
const EXEMPT_BOOK = { version: 1, install: ['npm'], config: [], reside: [] }

async function mountShuitu(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const shuitu = await import('../src/plugin/shuitu.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(shuitu, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.shuitu, 'ctx.shuitu')

  const { defineTool } = dshTools
  ctx.tools.register(defineTool({
    name: 'write',
    description: '写探针：path 含 cursed 时固定失败',
    parameters: {
      path: { type: 'string', required: true, description: 'path' },
      content: { type: 'string', description: '内容' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.path.includes('cursed')) throw new Error(`simulated failure: ${args.path}`)
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

maybe('集成：失败探针无条件到达工具本体（结构性零拦截）', async () => {
  const { ctx, call } = await mountShuitu({ sessionId: 's1', book: BOOK })
  const out = await call('bash', { command: 'boom npm install -g probe' })
  assert.match(JSON.stringify(out), /simulated failure/)
  const report = ctx.shuitu.report()
  assert.equal(report.totals.callsObserved, 1)
  assert.equal(report.cases, 0) // 失败不入账
})

maybe('集成：exec 装案与配对卸案——装 15 移带、卸后归淮', async () => {
  const { ctx, call } = await mountShuitu({ sessionId: 's1', book: BOOK })
  await call('bash', { command: 'npm install -g probe-cli' })
  let r = ctx.shuitu.report()
  assert.equal(r.cases, 1)
  assert.equal(r.score.total, 15)
  assert.equal(r.band, '移')
  await call('bash', { command: 'npm uninstall -g probe-cli' })
  r = ctx.shuitu.report()
  assert.equal(r.counts.restored, 1)
  assert.equal(r.score.total, 0)
  assert.equal(r.band, '淮')
})

maybe('集成：exec 改案（git config --global）与驻案（brew services start）', async () => {
  const { ctx, call } = await mountShuitu({ sessionId: 's1', book: BOOK })
  await call('bash', { command: 'git config --global user.email probe@x' })
  let r = ctx.shuitu.report()
  assert.equal(r.counts.leftConf, 1)
  assert.equal(r.score.total, 15)
  await call('bash', { command: 'brew services start probe-redis' })
  r = ctx.shuitu.report()
  assert.equal(r.counts.leftReside, 1)
  assert.equal(r.score.total, 45)
  assert.equal(r.band, '枳')
  assert.equal(r.verdict, 'fail') // 单驻案即红
})

maybe('集成：write 改径形写案——~/.zshrc 立案、src 沉默', async () => {
  const { ctx, call } = await mountShuitu({ sessionId: 's1', book: BOOK })
  await call('write', { path: 'src/plain.js', content: 'export {}\n' })
  let r = ctx.shuitu.report()
  assert.equal(r.cases, 0)
  await call('write', { path: '~/.zshrc', content: 'export PROBE=1\n' })
  r = ctx.shuitu.report()
  assert.equal(r.counts.leftConf, 1)
  assert.equal(r.score.conf, 15)
})

maybe('集成：土册豁免词生效——命中 install 豁免词的装案完全出账', async () => {
  const { ctx, call } = await mountShuitu({ sessionId: 's1', book: EXEMPT_BOOK })
  await call('bash', { command: 'npm install -g probe-cli' })
  const r = ctx.shuitu.report()
  assert.equal(r.cases, 0)
  assert.equal(r.counts.exempted, 1)
  assert.equal(r.score.total, 0)
})

maybe('集成：exportStream 离线重放账实一致（案数与异值）', async () => {
  const { ctx, call } = await mountShuitu({ sessionId: 's1', book: BOOK })
  await call('bash', { command: 'npm install -g probe-cli' })
  await call('bash', { command: 'git config --global user.email probe@x' })
  await call('bash', { command: 'brew services start probe-redis' })

  const runtime = ctx.shuitu.report()
  const stream = ctx.shuitu.exportStream()
  assert.ok(stream.length >= 6) // 三对 call/result

  const { auditStreams } = await import('../src/core/audit.js')
  const offline = auditStreams([{ name: 'replay.jsonl', text: stream.map((e) => JSON.stringify(e)).join('\n') + '\n' }])
  assert.equal(offline.muts, runtime.cases)
  assert.equal(offline.score.total, runtime.score.total)
  assert.equal(offline.band, runtime.band)
})

maybe('集成：gate 裁决翻转', async () => {
  const { ctx, call } = await mountShuitu({ sessionId: 's1', book: BOOK, gate: 45 })
  await call('bash', { command: 'npm install -g probe-cli' })
  let g = ctx.shuitu.gate()
  assert.equal(g.score, 15)
  assert.equal(g.verdict, 'pass')
  await call('bash', { command: 'git config --global user.email probe@x' })
  g = ctx.shuitu.gate()
  assert.equal(g.score, 30)
  assert.equal(g.verdict, 'pass') // 30 < 45
  await call('bash', { command: 'brew services start probe-redis' })
  g = ctx.shuitu.gate()
  assert.equal(g.score, 60)
  assert.equal(g.verdict, 'fail') // 60 ≥ 45
})

maybe('集成：土牌块两次渲染逐字节相同；改账全文可离线对账', async () => {
  const { ctx, call } = await mountShuitu({ sessionId: 's1', book: BOOK })
  await call('bash', { command: 'npm install -g probe-cli' })
  await call('bash', { command: 'git config --global user.email probe@x' })
  const t1 = ctx.shuitu.tupai()
  const t2 = ctx.shuitu.tupai()
  assert.equal(t1.valid, true)
  assert.equal(t1.text, t2.text)
  assert.match(t1.text, /装:npm:probe-cli（会话 s1）/)
  assert.match(t1.text, /改:gitconfig:user.email（会话 s1）/)
  const ledger = ctx.shuitu.gaizhang()
  assert.equal(ledger.lines.length, 2)
  assert.deepEqual(ledger.lines.map((l) => l.state), ['遗', '遗'])
})

maybe('集成：观察永不反噬——插件异常不影响工具管道照常返回', async () => {
  const { ctx, call } = await mountShuitu({ sessionId: 's1', book: null })
  const out = await call('write', { path: 'src/ok.js', content: 'x' })
  assert.ok(out)
  const r = ctx.shuitu.report()
  assert.equal(r.totals.callsObserved, 1)
})
