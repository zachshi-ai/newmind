/**
 * 真实集成测试 —— 揖盗插件挂载在 npm 官方包 @deepseek-ai/cordis 内核
 * 与 @deepseek-ai/dsh-tools 工具管道上，验证十二件事：
 *
 *  1. 零拦截是结构性的：失败探针也无条件到达工具本体；
 *  2. 净卷探针 → 0 过门；
 *  3. 素拆探针（写 verify=False）→ 15 倚过门；
 *  4. 遇阻探针（SSL 败相后写）→ 30 洞门红；
 *  5. --gate 10 探针 → 15 红门翻；
 *  6. 复锁探针（先拆后合）→ 0 过门；
 *  7. 校场探针（tests 径）→ 免账 0；
 *  8. 锁册免拆探针 → 0；
 *  9. 失败 write 探针不入账；
 * 10. exportStream() 导出流离线 audit 重放账实一致；
 * 11. 锁牌块两次渲染逐字节相同且不含尾文行原文；
 * 12. report/ledger 服务口径：失败调用计入观察数但 exec 阻账供窗归因。
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

const BOOK = { version: 1, excuse: ['local-dev/*'] }

const TLS_ERR = 'curl: (60) SSL certificate problem: self-signed certificate'
const V_LOCK = 'import requests\nresp = requests.get(url, verify=False)\n'
const V_CLEAN = 'import requests\nresp = requests.get(url)\n'

async function mountYidao(config = {}) {
  const { Context } = await import('@deepseek-ai/cordis')
  const sysPrompt = await import('@deepseek-ai/dsh-system-prompt')
  const dshTools = await import('@deepseek-ai/dsh-tools')
  const yidao = await import('../src/plugin/yidao.js')

  const ctx = new Context()
  ctx.plugin(sysPrompt.default ?? sysPrompt)
  ctx.plugin(dshTools.default ?? dshTools)
  ctx.plugin(yidao, config)

  async function waitFor(getter, what) {
    for (let i = 0; i < 500; i++) {
      const v = getter()
      if (v) return v
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${what} 超时`)
  }
  await waitFor(() => ctx.tools, 'ctx.tools')
  await waitFor(() => ctx.yidao, 'ctx.yidao')

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
    name: 'bash',
    description: '执行探针：命令含 boom 固定失败；含 ssl-fail 回显败相正文（败相在文不在旗）',
    parameters: { command: { type: 'string', required: true, description: 'command' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.command.includes('boom')) throw new Error(`simulated failure: ${args.command}`)
      if (args.command.includes('ssl-fail')) return TLS_ERR
      return `ran:${args.command}`
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

maybe('集成 1：结构性零拦截——失败探针也无条件到达工具本体', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK })
  let reached = false
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  ctx.tools.register(defineTool({
    name: 'probe2',
    description: '必炸探针 2',
    parameters: { path: { type: 'string', required: true, description: 'p' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute() { reached = true; throw new Error('boom') },
  }))
  await call('probe2', { path: 'x.js' }).catch(() => {})
  assert.ok(reached, '工具本体必须被执行（观察不拦截）')
})

maybe('集成 2：净卷探针——0 过门', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK })
  await call('write', { path: 'src/api.js', content: V_CLEAN })
  const r = ctx.yidao.report()
  assert.deepEqual(r.counts, { yu: 0, su: 0, fu: 0, wu: 0 })
  assert.equal(r.band, '扃')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 3：素拆探针——15 倚过门', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK })
  await call('write', { path: 'src/client.js', content: V_LOCK })
  const r = ctx.yidao.report()
  assert.deepEqual(r.counts, { yu: 0, su: 1, fu: 0, wu: 0 })
  assert.equal(r.score.total, 15)
  assert.equal(r.band, '倚')
  assert.equal(r.verdict, 'pass')
})

maybe('集成 4：遇阻探针（SSL 败相后写）——30 洞门红', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK })
  await call('bash', { command: 'curl -s ssl-fail https://x.example' })
  await call('write', { path: 'src/client.js', content: V_LOCK })
  const r = ctx.yidao.report()
  assert.deepEqual(r.counts, { yu: 1, su: 0, fu: 0, wu: 0 })
  assert.equal(r.score.total, 30)
  assert.equal(r.verdict, 'fail')
  assert.match(ctx.yidao.ledger().issues[0], /遇阻：src\/client\.js:2 verify=False（窗内阻词 certificate @ seq 1）/)
})

maybe('集成 5：--gate 10 探针——15 红门翻', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK, gate: 10 })
  await call('write', { path: 'src/client.js', content: V_LOCK })
  const g = ctx.yidao.gate()
  assert.equal(g.score, 15)
  assert.equal(g.verdict, 'fail')
})

maybe('集成 6：复锁探针（先拆后合）——0 过门', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK })
  await call('write', { path: 'src/client.js', content: V_LOCK })
  await call('write', { path: 'src/client.js', content: V_CLEAN })
  const r = ctx.yidao.report()
  assert.deepEqual(r.counts, { yu: 0, su: 0, fu: 1, wu: 0 })
  assert.equal(r.verdict, 'pass')
})

maybe('集成 7：校场探针（tests 径）——免账 0', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK })
  await call('write', { path: 'tests/client.test.js', content: V_LOCK })
  const r = ctx.yidao.report()
  assert.deepEqual(r.counts, { yu: 0, su: 0, fu: 0, wu: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 8：锁册免拆探针——0', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK })
  await call('write', { path: 'local-dev/proxy.js', content: V_LOCK })
  const r = ctx.yidao.report()
  assert.deepEqual(r.counts, { yu: 0, su: 0, fu: 0, wu: 0 })
  assert.equal(r.totals.paths, 0)
})

maybe('集成 9：失败 write 探针不入账——失败之写不是写', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK })
  await call('write', { path: 'cursed/client.js', content: V_LOCK }).catch(() => {})
  const r = ctx.yidao.report()
  assert.equal(r.totals.callsObserved, 1) // 调用被观察到了
  assert.deepEqual(r.counts, { yu: 0, su: 0, fu: 0, wu: 0 }) // 但失败之写不入账
  assert.equal(r.verdict, 'pass')
})

maybe('集成 10：exportStream 导出流离线 audit 重放——账实一致（遇阻 30）', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK })
  await call('bash', { command: 'curl -s ssl-fail https://x.example' })
  await call('write', { path: 'src/client.js', content: V_LOCK })
  const live = ctx.yidao.report()

  const { auditStreams } = await import('../src/core/audit.js')
  const lines = ctx.yidao.exportStream().map((e) => JSON.stringify(e)).join('\n')
  const replay = auditStreams([{ name: 'replayed.jsonl', text: lines }], { book: BOOK })

  assert.equal(replay.calls, live.totals.callsObserved)
  assert.deepEqual(replay.counts, live.counts)
  assert.deepEqual(replay.score, live.score)
  assert.equal(replay.score.total, 30)
})

maybe('集成 11：锁牌块两次渲染逐字节相同且不含尾文行原文', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK })
  await call('bash', { command: 'curl -s ssl-fail https://x.example' })
  await call('write', { path: 'src/client.js', content: V_LOCK })
  const a = ctx.yidao.paizi().text
  const b = ctx.yidao.paizi().text
  assert.equal(a, b)
  assert.match(a, /【揖盗 · 锁牌】/)
  assert.match(a, /锁册：免拆 1 处（local-dev\/\*）/)
  assert.match(a, /遇阻：src\/client\.js:2 verify=False（窗内阻词 certificate @ seq 1）/)
  assert.ok(!a.includes('requests.get')) // 尾文行原文不进锁牌（掩码是结构性保证）
})

maybe('集成 12：report/ledger 服务口径——观察数含失败、exec 阻账供窗归因', async () => {
  const { ctx, call } = await mountYidao({ book: BOOK })
  await call('probe', { path: 'x.js' }).catch(() => {}) // 失败 exec：计入观察与阻账（正文可能为空）
  await call('bash', { command: 'curl -s ssl-fail https://x.example' }) // 成功 exec：正文含败相
  const r = ctx.yidao.report()
  assert.equal(r.totals.callsObserved, 2)
  const led = ctx.yidao.ledger()
  assert.equal(led.counts.yu, 0) // 只有败相没有拆锁——无案
  assert.equal(led.counts.su, 0)
})
