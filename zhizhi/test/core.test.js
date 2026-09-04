/**
 * 核心引擎测试 —— 指纹、三条规则、账本、离线审计。
 * 零依赖：node:test + node:assert，不需要安装任何包即可运行。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fnv1a32,
  stableStringify,
  callFingerprint,
  truncate,
  argPreview,
  normalizeCommand,
  normalizePath,
  pathIsCovered,
  bashWrittenPaths,
  bashReadPaths,
  structuredPaths,
  isVerificationCommand,
} from '../src/core/fingerprint.js'

import { createEngine, normalizeOptions, DEFAULTS } from '../src/core/engine.js'
import { auditStream, parseStream } from '../src/core/audit.js'

// ---------------------------------------------------------------------------
// 指纹层
// ---------------------------------------------------------------------------

test('fnv1a32：确定性且区分度高', () => {
  assert.equal(fnv1a32('hello'), fnv1a32('hello'))
  assert.notEqual(fnv1a32('hello'), fnv1a32('hellp'))
  assert.match(fnv1a32(''), /^[0-9a-f]{8}$/)
})

test('stableStringify：键序无关，数组序有关', () => {
  assert.equal(stableStringify({ a: 1, b: 2 }), stableStringify({ b: 2, a: 1 }))
  assert.notEqual(stableStringify([1, 2]), stableStringify([2, 1]))
  assert.equal(stableStringify({ x: { y: [1, { z: 3 }] } }), stableStringify({ x: { y: [1, { z: 3 }] } }))
})

test('callFingerprint：同名同参同指纹，异参异指纹', () => {
  const a = callFingerprint('bash', { command: 'npm test' })
  const b = callFingerprint('bash', { command: 'npm test' })
  const c = callFingerprint('bash', { command: 'npm run test' })
  const d = callFingerprint('read', { command: 'npm test' })
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.notEqual(a, d)
})

test('callFingerprint：参数为 undefined/null 时稳定', () => {
  assert.equal(callFingerprint('x', undefined), callFingerprint('x', null))
})

test('truncate / argPreview：超长截断且不抛错', () => {
  assert.equal(truncate('abcdef', 3), 'abc…')
  assert.equal(truncate('abc', 5), 'abc')
  assert.equal(argPreview({ a: 'x'.repeat(500) }).length <= 241, true)
  assert.equal(argPreview(BigInt(1)), '(unserializable args)')
})

test('normalizeCommand：压缩空白', () => {
  assert.equal(normalizeCommand('  npm    test\n'), 'npm test')
})

test('normalizePath：去 ./、折叠 //、去尾 /、剥引号', () => {
  assert.equal(normalizePath('./src/a.js'), 'src/a.js')
  assert.equal(normalizePath('src//b//'), 'src/b')
  assert.equal(normalizePath('"src/c.js"'), 'src/c.js')
  assert.equal(normalizePath('/'), '/')
})

test('pathIsCovered：相等、目录前缀、. 与 /', () => {
  assert.equal(pathIsCovered('src/a.js', 'src/a.js'), true)
  assert.equal(pathIsCovered('src', 'src/a.js'), true)
  assert.equal(pathIsCovered('src/a.js', 'src/b.js'), false)
  assert.equal(pathIsCovered('srcx', 'srcx/a.js'), true)
  assert.equal(pathIsCovered('src', 'srcother/a.js'), false)
  assert.equal(pathIsCovered('.', 'relative/x.js'), true)
  assert.equal(pathIsCovered('.', '/abs/x.js'), false)
  assert.equal(pathIsCovered('/', '/abs/x.js'), true)
})

test('bashWrittenPaths：重定向（排除 fd 重定向与 /dev/null）', () => {
  assert.deepEqual(bashWrittenPaths('echo hi > out.txt'), ['out.txt'])
  assert.deepEqual(bashWrittenPaths('echo hi >> log.txt'), ['log.txt'])
  assert.deepEqual(bashWrittenPaths('npm test 2>/dev/null'), [])
  assert.deepEqual(bashWrittenPaths('cmd &>all.txt'), [])
  assert.deepEqual(bashWrittenPaths('echo x > /dev/null'), [])
  assert.deepEqual(bashWrittenPaths('cat a > b'), ['b'])
})

test('bashWrittenPaths：tee / dd / sed -i', () => {
  assert.deepEqual(bashWrittenPaths('echo x | tee out.txt'), ['out.txt'])
  assert.deepEqual(bashWrittenPaths('echo x | tee -a out.txt'), ['out.txt'])
  assert.deepEqual(bashWrittenPaths('dd if=a of=b.img'), ['b.img'])
  assert.deepEqual(bashWrittenPaths("sed -i 's/a/b/' file.txt"), ['file.txt'])
  assert.deepEqual(bashWrittenPaths("sed -n '1p' file.txt"), []) // 非 -i 的 sed 不写
})

test('bashWrittenPaths：touch/rm/mkdir 全部写入；cp/mv 取目标', () => {
  assert.deepEqual(bashWrittenPaths('mkdir -p a/b'), ['a/b'])
  assert.deepEqual(bashWrittenPaths('rm -rf build'), ['build'])
  assert.deepEqual(bashWrittenPaths('cp -r src dist'), ['dist'])
  assert.deepEqual(bashWrittenPaths('mv old.txt new.txt'), ['new.txt'])
})

test('bashWrittenPaths：复合命令分段', () => {
  assert.deepEqual(bashWrittenPaths('npm test && echo done > flag'), ['flag'])
  assert.deepEqual(bashWrittenPaths('cat a > x; cat b > y'), ['x', 'y'])
})

test('bashReadPaths：cat/grep/ls/find/sed', () => {
  assert.deepEqual(bashReadPaths('cat src/a.js'), ['src/a.js'])
  assert.deepEqual(bashReadPaths('head -5 tail.log'), ['tail.log'])
  assert.deepEqual(bashReadPaths('grep -rn foo src/'), ['src'])
  assert.deepEqual(bashReadPaths('rg pattern file1 file2'), ['file1', 'file2'])
  assert.deepEqual(bashReadPaths('ls dist'), ['dist'])
  assert.deepEqual(bashReadPaths('find . -name x'), ['.'])
  assert.deepEqual(bashReadPaths("sed 's/a/b/' in.txt"), ['in.txt'])
})

test('bashReadPaths：写命令不算读', () => {
  assert.deepEqual(bashReadPaths('rm -rf build'), [])
  assert.deepEqual(bashReadPaths('echo x > out'), [])
})

test('structuredPaths：键名提取与数组', () => {
  assert.deepEqual(structuredPaths({ path: 'a.js' }, ['path']), ['a.js'])
  assert.deepEqual(structuredPaths({ file_path: 'b.js', other: 1 }, ['path', 'file_path']), ['b.js'])
  assert.deepEqual(structuredPaths({ path: ['c.js', 'd.js'] }, ['path']), ['c.js', 'd.js'])
  assert.deepEqual(structuredPaths({}, ['path']), [])
  assert.deepEqual(structuredPaths(null, ['path']), [])
})

test('isVerificationCommand：默认模式表', () => {
  const p = DEFAULTS.verify.patterns
  assert.equal(isVerificationCommand('npm test', p), true)
  assert.equal(isVerificationCommand('pnpm run test --filter web', p), true)
  assert.equal(isVerificationCommand('npx vitest run', p), true)
  assert.equal(isVerificationCommand('pytest -q', p), true)
  assert.equal(isVerificationCommand('go test ./...', p), true)
  assert.equal(isVerificationCommand('cargo check', p), true)
  assert.equal(isVerificationCommand('npx tsc --noEmit', p), true)
  assert.equal(isVerificationCommand('npm run build', p), false) // build 不在默认表
  assert.equal(isVerificationCommand('cat file', p), false)
})

// ---------------------------------------------------------------------------
// 引擎：止损
// ---------------------------------------------------------------------------

function failCall(name, args, digest = 'boom') {
  return { name, args, isError: true, errorDigest: digest }
}

test('止损：连续失败 3 次后第 4 次同指纹调用被拦', () => {
  const e = createEngine()
  const call = { name: 'bash', args: { command: 'npm test' } }
  assert.equal(e.guard(call).decision, 'allow')
  e.observe(failCall('bash', { command: 'npm test' }, 'err1'))
  e.observe(failCall('bash', { command: 'npm test' }, 'err1'))
  e.observe(failCall('bash', { command: 'npm test' }, 'err1'))
  const v = e.guard(call)
  assert.equal(v.decision, 'deny')
  assert.equal(v.rule, 'stopLoss')
  assert.match(v.reason, /知止·止损/)
  assert.match(v.reason, /连续失败 3 次/)
  assert.match(v.reason, /err1/)
})

test('止损：成功一次即重置计数', () => {
  const e = createEngine({ stopLoss: { threshold: 2 } })
  for (let i = 0; i < 2; i++) e.observe(failCall('bash', { command: 'npm test' }))
  assert.equal(e.guard({ name: 'bash', args: { command: 'npm test' } }).decision, 'deny')
  // 换一个成功的调用重置
  e.observe({ name: 'bash', args: { command: 'npm test' }, isError: false })
  assert.equal(e.guard({ name: 'bash', args: { command: 'npm test' } }).decision, 'allow')
})

test('止损：参数不同即指纹不同，不连坐', () => {
  const e = createEngine({ stopLoss: { threshold: 2 } })
  e.observe(failCall('bash', { command: 'npm test' }))
  e.observe(failCall('bash', { command: 'npm test' }))
  assert.equal(e.guard({ name: 'bash', args: { command: 'npm test --filter a' } }).decision, 'allow')
})

test('止损：阈值可配置', () => {
  const e = createEngine({ stopLoss: { threshold: 1 } })
  e.observe(failCall('bash', { command: 'x' }))
  assert.equal(e.guard({ name: 'bash', args: { command: 'x' } }).decision, 'deny')
})

test('止损：enabled=false 时放行', () => {
  const e = createEngine({ stopLoss: { enabled: false, threshold: 1 } })
  e.observe(failCall('bash', { command: 'x' }))
  assert.equal(e.guard({ name: 'bash', args: { command: 'x' } }).decision, 'allow')
})

test('变更重置：成功的写入清空止损连败 —— 改完代码再跑测试是合法的', () => {
  const e = createEngine({ stopLoss: { threshold: 2 } })
  e.observe(failCall('bash', { command: 'npm test' }))
  e.observe(failCall('bash', { command: 'npm test' }))
  assert.equal(e.guard({ name: 'bash', args: { command: 'npm test' } }).decision, 'deny')
  // Agent 改了代码：世界变了
  e.observe({ name: 'edit', args: { path: 'src/user.js' }, isError: false })
  assert.equal(e.guard({ name: 'bash', args: { command: 'npm test' } }).decision, 'allow')
  assert.equal(e.report().totals.mutationResets, 1)
})

test('变更重置：无活跃连败时不计数；bash 变更性命令同样触发', () => {
  const e = createEngine()
  e.observe({ name: 'write', args: { path: 'a.js' }, isError: false })
  assert.equal(e.report().totals.mutationResets, 0)
  // bash 重定向写也算变更
  const e2 = createEngine({ stopLoss: { threshold: 1 } })
  e2.observe(failCall('bash', { command: 'x' }))
  e2.observe({ name: 'bash', args: { command: 'echo hi > patch.txt' }, isError: false })
  assert.equal(e2.guard({ name: 'bash', args: { command: 'x' } }).decision, 'allow')
  assert.equal(e2.report().totals.mutationResets, 1)
})

test('止损：en 语言理由', () => {
  const e = createEngine({ locale: 'en', stopLoss: { threshold: 1 } })
  e.observe(failCall('bash', { command: 'x' }, 'ECONNREFUSED'))
  const v = e.guard({ name: 'bash', args: { command: 'x' } })
  assert.match(v.reason, /zhizhi:stop-loss/)
  assert.match(v.reason, /ECONNREFUSED/)
})

// ---------------------------------------------------------------------------
// 引擎：先读后写
// ---------------------------------------------------------------------------

test('先读后写：结构化写工具未读先写被拦', () => {
  const e = createEngine()
  const v = e.guard({ name: 'edit', args: { path: 'src/a.js', old: 'x', new: 'y' } })
  assert.equal(v.decision, 'deny')
  assert.equal(v.rule, 'readBeforeWrite')
  assert.match(v.reason, /先读后写/)
  assert.match(v.reason, /src\/a\.js/)
})

test('先读后写：读过即可写（结构化读工具）', () => {
  const e = createEngine()
  e.observe({ name: 'read', args: { path: 'src/a.js' }, isError: false })
  assert.equal(e.guard({ name: 'write', args: { path: 'src/a.js' } }).decision, 'allow')
})

test('先读后写：读取失败不算读过', () => {
  const e = createEngine()
  e.observe({ name: 'read', args: { path: 'src/a.js' }, isError: true, errorDigest: 'ENOENT' })
  assert.equal(e.guard({ name: 'write', args: { path: 'src/a.js' } }).decision, 'deny')
})

test('先读后写：bash 重定向写同样受管', () => {
  const e = createEngine()
  const v = e.guard({ name: 'bash', args: { command: 'echo hi > out.txt' } })
  assert.equal(v.decision, 'deny')
  // 读过之后再放行
  e.observe({ name: 'bash', args: { command: 'cat out.txt' }, isError: false })
  assert.equal(e.guard({ name: 'bash', args: { command: 'echo hi > out.txt' } }).decision, 'allow')
})

test('先读后写：读过目录覆盖目录下文件', () => {
  const e = createEngine()
  e.observe({ name: 'bash', args: { command: 'grep -rn foo src/' }, isError: false })
  assert.equal(e.guard({ name: 'write', args: { path: 'src/deep/b.js' } }).decision, 'allow')
  assert.equal(e.guard({ name: 'write', args: { path: 'docs/c.md' } }).decision, 'deny')
})

test('先读后写：非写工具完全不管', () => {
  const e = createEngine()
  assert.equal(e.guard({ name: 'bash', args: { command: 'npm test' } }).decision, 'allow')
  assert.equal(e.guard({ name: 'read', args: { path: 'x' } }).decision, 'allow')
})

test('先读后写：writeTools 可配置（自定义工具名）', () => {
  const e = createEngine({ readBeforeWrite: { writeTools: ['save_thing'], readTools: ['load_thing'] } })
  assert.equal(e.guard({ name: 'save_thing', args: { path: 'a.json' } }).decision, 'deny')
  e.observe({ name: 'load_thing', args: { path: 'a.json' }, isError: false })
  assert.equal(e.guard({ name: 'save_thing', args: { path: 'a.json' } }).decision, 'allow')
})

test('先读后写：多路径部分未读 → 只报未读的', () => {
  const e = createEngine()
  e.observe({ name: 'read', args: { path: 'a.js' }, isError: false })
  const v = e.guard({ name: 'write', args: { path: ['a.js', 'b.js'] } })
  assert.equal(v.decision, 'deny')
  assert.match(v.reason, /b\.js/)
  assert.doesNotMatch(v.reason, /a\.js/)
})

// ---------------------------------------------------------------------------
// 引擎：完成核验（证据账本）
// ---------------------------------------------------------------------------

test('证据：成功的验证命令计入账本', () => {
  const e = createEngine()
  e.observe({ name: 'bash', args: { command: 'npm test' }, isError: false })
  const r = e.report()
  assert.equal(r.totals.evidence, 1)
  assert.ok(r.totals.lastEvidenceAt !== undefined)
})

test('证据：失败或非验证命令不计入', () => {
  const e = createEngine()
  e.observe({ name: 'bash', args: { command: 'npm test' }, isError: true, errorDigest: 'x' })
  e.observe({ name: 'bash', args: { command: 'ls' }, isError: false })
  assert.equal(e.report().totals.evidence, 0)
})

test('证据：callsSinceEvidence 随非证据调用增长', () => {
  const e = createEngine()
  e.observe({ name: 'bash', args: { command: 'npm test' }, isError: false })
  e.observe({ name: 'read', args: { path: 'a' }, isError: false })
  e.observe({ name: 'read', args: { path: 'b' }, isError: false })
  assert.equal(e.report().totals.callsSinceEvidence, 3)
})

// ---------------------------------------------------------------------------
// 引擎：guard 只读性 / noteDenied / 账本
// ---------------------------------------------------------------------------

test('guard 是只读的：重复裁决不改变状态', () => {
  const e = createEngine({ stopLoss: { threshold: 1 } })
  e.observe(failCall('bash', { command: 'x' }))
  const v1 = e.guard({ name: 'bash', args: { command: 'x' } })
  const v2 = e.guard({ name: 'bash', args: { command: 'x' } })
  assert.equal(v1.decision, 'deny')
  assert.equal(v2.decision, 'deny')
  assert.equal(e.report().totals.denied, 0) // 未 noteDenied 前，账本不记拦截
})

test('noteDenied 记账；拦后原样重试计入 redennied', () => {
  const e = createEngine({ stopLoss: { threshold: 1 } })
  e.observe(failCall('bash', { command: 'x' }))
  const call = { name: 'bash', args: { command: 'x' } }
  const v1 = e.guard(call)
  e.noteDenied(call, v1)
  const v2 = e.guard(call)
  e.noteDenied(call, v2)
  const r = e.report()
  assert.equal(r.totals.denied, 2)
  assert.equal(r.totals.redennied, 1)
  assert.equal(r.rules.stopLoss.denied, 2)
})

test('report.activeFailures 按失败次数排序', () => {
  const e = createEngine()
  e.observe(failCall('bash', { command: 'a' }))
  e.observe(failCall('bash', { command: 'a' }))
  e.observe(failCall('bash', { command: 'b' }))
  const active = e.report().activeFailures
  assert.equal(active[0].count, 2)
  assert.equal(active[1].count, 1)
  assert.match(active[0].fingerprint, /^bash#/)
})

test('exportStream 含完整调用对（call→result / call→denied）与 turn 标记', () => {
  const e = createEngine({ stopLoss: { threshold: 1 } })
  e.markTurn('start', 't1')
  e.observe(failCall('bash', { command: 'x' }))
  const call = { name: 'bash', args: { command: 'x' } }
  e.noteDenied(call, e.guard(call))
  e.markTurn('end', 't1')
  const types = e.exportStream().map(s => s.type)
  assert.deepEqual(types, ['turn_start', 'tool_call', 'tool_result', 'tool_call', 'tool_denied', 'turn_end'])
})

// ---------------------------------------------------------------------------
// 引擎：fail-open 语义与配置
// ---------------------------------------------------------------------------

test('normalizeOptions：部分覆盖 + 默认值保留', () => {
  const o = normalizeOptions({ stopLoss: { threshold: 5 } })
  assert.equal(o.stopLoss.threshold, 5)
  assert.equal(o.stopLoss.enabled, true)
  assert.equal(o.locale, 'zh')
  assert.equal(o.readBeforeWrite.writeTools.includes('edit'), true)
})

test('normalizeOptions：非对象输入回退默认', () => {
  assert.equal(normalizeOptions(null).locale, 'zh')
  assert.equal(normalizeOptions('x').failOpen, true)
})

test('guard 抛错 → 插件层 fail-open（在插件测试中验证），引擎本身允许配置 failOpen=false', () => {
  const e = createEngine({ failOpen: false })
  assert.equal(e.options.failOpen, false)
})

// ---------------------------------------------------------------------------
// 离线审计
// ---------------------------------------------------------------------------

const RAW_STREAM = [
  { type: 'turn_start', id: 't1' },
  { type: 'tool_call', name: 'bash', args: { command: 'npm test' } },
  { type: 'tool_result', name: 'bash', args: { command: 'npm test' }, isError: true, errorDigest: 'e1' },
  { type: 'tool_call', name: 'bash', args: { command: 'npm test' } },
  { type: 'tool_result', name: 'bash', args: { command: 'npm test' }, isError: true, errorDigest: 'e1' },
  { type: 'tool_call', name: 'bash', args: { command: 'npm test' } },
  { type: 'tool_result', name: 'bash', args: { command: 'npm test' }, isError: true, errorDigest: 'e1' },
  { type: 'tool_call', name: 'bash', args: { command: 'npm test' } }, // 第 4 次：会被拦
  { type: 'tool_result', name: 'bash', args: { command: 'npm test' }, isError: true, errorDigest: 'e1' },
  { type: 'turn_end', id: 't1' },
]

test('audit whatif：第 4 次重复失败被拦截，浪费省 1 轮往返', () => {
  const r = auditStream(RAW_STREAM)
  assert.equal(r.mode, 'whatif')
  assert.equal(r.totals.calls, 4)
  assert.equal(r.totals.intercepted, 1)
  assert.equal(r.waste.savedRoundTrips, 1)
  assert.equal(r.interceptedCalls[0].rule, 'stopLoss')
  assert.match(r.interceptedCalls[0].reason, /知止·止损/)
  assert.equal(r.verdict, 'pass')
})

test('audit whatif：拦截后的结果不进入引擎（模拟调用未发生）', () => {
  // 若结果进入了引擎，后续同指纹拦截会因为计数到达 4 而发生两次 —— 不可能：
  // 第 4 次是最后一个调用。用更长流验证：第 4、5 次都该被拦（计数停在 3）。
  const stream = [...RAW_STREAM.slice(0, -2)]
  stream.push(
    { type: 'tool_call', name: 'bash', args: { command: 'npm test' } },
    { type: 'tool_result', name: 'bash', args: { command: 'npm test' }, isError: true, errorDigest: 'e1' },
  )
  const r = auditStream(stream)
  assert.equal(r.totals.intercepted, 2)
})

test('audit whatif：盲写也被拦（先读后写）', () => {
  const stream = [
    { type: 'turn_start', id: 't1' },
    { type: 'tool_call', name: 'write', args: { path: 'a.js' } },
    { type: 'tool_result', name: 'write', args: { path: 'a.js' }, isError: false },
    { type: 'turn_end', id: 't1' },
  ]
  const r = auditStream(stream)
  assert.equal(r.totals.intercepted, 1)
  assert.equal(r.totals.interceptedByRule.readBeforeWrite, 1)
})

test('audit whatif：无验证证据的 turn 被标记', () => {
  const r = auditStream(RAW_STREAM, { failOnUnverified: true })
  assert.equal(r.unverifiedTurns.length, 1)
  assert.equal(r.verdict, 'fail')
})

test('audit whatif：有证据的 turn 通过验收门', () => {
  const stream = [
    { type: 'turn_start', id: 't1' },
    { type: 'tool_call', name: 'bash', args: { command: 'npm test' } },
    { type: 'tool_result', name: 'bash', args: { command: 'npm test' }, isError: false },
    { type: 'tool_call', name: 'edit', args: { path: 'a.js' } },
    { type: 'tool_result', name: 'edit', args: { path: 'a.js' }, isError: false },
    { type: 'turn_end', id: 't1' },
  ]
  const r = auditStream(stream, { failOnUnverified: true })
  assert.equal(r.turns[0].verified, true)
  assert.equal(r.verdict, 'pass')
})

test('audit gated：运行时拦截与重放逐条对账一致', () => {
  // 构造 gated 流：zhizhi 运行时导出的形态 —— 被拦调用没有 result，带 tool_denied
  const e = createEngine({ stopLoss: { threshold: 2 } })
  const gated = [{ type: 'turn_start', id: 't1' }]
  for (let i = 0; i < 3; i++) {
    const call = { name: 'bash', args: { command: 'npm test' } }
    gated.push({ type: 'tool_call', name: call.name, args: call.args })
    const verdict = e.guard(call)
    if (verdict.decision === 'deny') {
      e.noteDenied(call, verdict)
      gated.push({ type: 'tool_denied', name: call.name, rule: verdict.rule })
    } else {
      gated.push({ type: 'tool_result', name: call.name, args: call.args, isError: true, errorDigest: 'e' })
      e.observe({ ...call, isError: true, errorDigest: 'e' })
    }
  }
  gated.push({ type: 'turn_end', id: 't1' })

  const r = auditStream(gated, { mode: 'gated', stopLoss: { threshold: 2 } })
  assert.equal(r.consistency.match, true)
  assert.equal(r.consistency.runtimeDenied, 1)
  assert.equal(r.consistency.replayDenied, 1)
})

test('audit gated：不一致会被暴露（对账机制可证伪）', () => {
  // 运行时声称拦了 2 次，重放只该拦 1 次 —— match 必须为 false
  const gated = [
    { type: 'turn_start', id: 't1' },
    { type: 'tool_call', name: 'bash', args: { command: 'npm test' } },
    { type: 'tool_denied', name: 'bash', rule: 'stopLoss' },
    { type: 'tool_call', name: 'bash', args: { command: 'npm test' } },
    { type: 'tool_denied', name: 'bash', rule: 'stopLoss' },
    { type: 'tool_result', name: 'bash', args: { command: 'npm test' }, isError: true, errorDigest: 'e' },
    { type: 'turn_end', id: 't1' },
  ]
  const r = auditStream(gated, { mode: 'gated' })
  assert.equal(r.consistency.match, false)
})

test('parseStream：容忍注释与空行，报错带行号', () => {
  const events = parseStream('# 注释\n\n{"type":"turn_start","id":"t1"}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"type":"turn_start"}\nnot json\n'), /第 2 行/)
  assert.throws(() => parseStream('{"noType":1}\n'), /type/)
})
