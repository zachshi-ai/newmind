/**
 * 核心单测 —— 契约 schema / 感知层 / 尘值评分 / 流解析 / 拂拭渲染 / 离线审计。
 *
 * 评分用例全部断言"恰好该分值"：每项尘值条款都可独立证伪（docs/04-acceptance.md A1）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { validateContract, makeTemplate, allowRootsOf } from '../src/core/contract.js'
import { isWriteCall, primaryPathOf, inScope, underRoot, isRelevant } from '../src/core/sense.js'
import { dustScore, bandOf, THRESHOLD_DEFAULT } from '../src/core/dust.js'
import { parseStream, buildCalls } from '../src/core/stream.js'
import { renderReanchor } from '../src/core/reanchor.js'
import { auditStream, checkAcceptanceRef } from '../src/core/audit.js'
import { createPresence } from '../src/core/presence.js'

const here = dirname(fileURLToPath(import.meta.url))
const readFixture = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8')
const readJSON = (name) => JSON.parse(readFixture(name))

/** 测试用契约骨架。 */
const wish = (over = {}) => ({
  version: 1,
  id: 'w-t',
  wish: '修复 payments 的重复扣款',
  anchors: { keywords: ['payment', 'test'], paths: ['src/payments/'] },
  scope: { allowRoots: ['src/payments/'] },
  acceptance: [{ ref: 'a1', name: 'bash', argsContains: 'npm test' }],
  window: 10,
  ...over,
})

const call = (name, args) => ({ name, args })
const onGoal = () => call('read', { path: 'src/payments/charge.js' })
const offGoal = () => call('read', { path: 'README.md' })

// ---------------------------------------------------------------------------
// 契约 schema
// ---------------------------------------------------------------------------

test('契约：骨架必须通过 schema 校验（template 自洽）', () => {
  const validation = validateContract(makeTemplate())
  assert.equal(validation.valid, true, JSON.stringify(validation.issues))
})

test('契约：version 必须为 1', () => {
  assert.equal(validateContract(wish({ version: 2 })).valid, false)
  assert.ok(validateContract(wish({ version: 2 })).issues.some((i) => i.path === 'version'))
})

test('契约：id 与 wish 必须非空', () => {
  assert.equal(validateContract(wish({ id: '' })).valid, false)
  assert.equal(validateContract(wish({ wish: '   ' })).valid, false)
})

test('契约：anchors 缺失非法（keywords ≥1 是失念可测的前提）', () => {
  const c = wish()
  delete c.anchors
  assert.equal(validateContract(c).valid, false)
  assert.equal(validateContract(wish({ anchors: { keywords: [] } })).valid, false)
  assert.equal(validateContract(wish({ anchors: { keywords: ['ok', ' '] } })).valid, false)
})

test('契约：anchors.paths 可省略；存在则每个非空', () => {
  assert.equal(validateContract(wish({ anchors: { keywords: ['x'] } })).valid, true)
  assert.equal(validateContract(wish({ anchors: { keywords: ['x'], paths: [''] } })).valid, false)
})

test('契约：scope 恰好其一 —— allowRoots 与 allowAll 不可并存', () => {
  assert.equal(validateContract(wish({ scope: { allowRoots: ['a/'], allowAll: true } })).valid, false)
})

test('契约：scope 不可皆无，allowRoots 不可为空数组', () => {
  assert.equal(validateContract(wish({ scope: {} })).valid, false)
  assert.equal(validateContract(wish({ scope: { allowRoots: [] } })).valid, false)
})

test('契约：allowAll 单独成立（无界之愿是显式选择，不是缺省）', () => {
  assert.equal(validateContract(wish({ scope: { allowAll: true } })).valid, true)
  assert.equal(allowRootsOf(wish({ scope: { allowAll: true } })), null)
})

test('契约：acceptance 必须 ≥1 条（本愿必须自带终验）', () => {
  assert.equal(validateContract(wish({ acceptance: [] })).valid, false)
  const c = wish()
  delete c.acceptance
  assert.equal(validateContract(c).valid, false)
})

test('契约：acceptance 条目必须带 ref 且探针/工件二选一', () => {
  assert.equal(validateContract(wish({ acceptance: [{ ref: 'a1' }] })).valid, false)
  assert.equal(validateContract(wish({ acceptance: [{ name: 'bash', argsContains: 'x' }] })).valid, false)
  assert.equal(validateContract(wish({ acceptance: [{ ref: 'a1', artifact: 'r.txt' }] })).valid, true)
  assert.equal(validateContract(wish({ acceptance: [{ ref: 'a1', name: 'bash', argsContains: 'x' }] })).valid, true)
})

test('契约：window 可省略（默认 10），存在则必须正整数', () => {
  assert.equal(validateContract(wish({ window: 0 })).valid, false)
  assert.equal(validateContract(wish({ window: 3 })).valid, true)
  const c = wish()
  delete c.window
  assert.equal(validateContract(c).valid, true)
})

// ---------------------------------------------------------------------------
// 感知层
// ---------------------------------------------------------------------------

test('写检测：结构化写工具（大小写不敏感），读工具不是写', () => {
  assert.equal(isWriteCall(call('edit', { path: 'a.js' })), true)
  assert.equal(isWriteCall(call('Write', { path: 'a.js' })), true)
  assert.equal(isWriteCall(call('str_replace', { path: 'a.js' })), true)
  assert.equal(isWriteCall(call('read', { path: 'a.js' })), false)
  assert.equal(isWriteCall(call('bash', { command: 'npm test' })), false)
})

test('写检测：shell 变更模式', () => {
  assert.equal(isWriteCall(call('bash', { command: 'echo hi > f.txt' })), true)
  assert.equal(isWriteCall(call('bash', { command: 'cat a >> b.log' })), true)
  assert.equal(isWriteCall(call('bash', { command: 'tee out.txt' })), true)
  assert.equal(isWriteCall(call('bash', { command: "sed -i 's/a/b/' f.js" })), true)
  assert.equal(isWriteCall(call('bash', { command: 'cp a b' })), true)
  assert.equal(isWriteCall(call('bash', { command: 'mv a b' })), true)
  assert.equal(isWriteCall(call('bash', { command: 'rm -rf build' })), true)
  assert.equal(isWriteCall(call('bash', { command: "git commit -m 'x'" })), true)
})

test('写检测：引号内的 > 不是重定向；只读 git 不是写', () => {
  assert.equal(isWriteCall(call('bash', { command: 'echo "a > b"' })), false)
  assert.equal(isWriteCall(call('bash', { command: 'git status' })), false)
  assert.equal(isWriteCall(call('bash', { command: 'git diff src/' })), false)
})

test('主路径：结构化工具按 path/file_path/file/target/filename 取首个', () => {
  assert.equal(primaryPathOf(call('edit', { path: 'a.js' })), 'a.js')
  assert.equal(primaryPathOf(call('write', { file_path: 'b.ts', path: 'a.js' })), 'a.js')
  assert.equal(primaryPathOf(call('write', { file_path: 'b.ts' })), 'b.ts')
  assert.equal(primaryPathOf(call('write', {})), null)
})

test('主路径：shell 重定向取目标；cp/mv 取目的端；sed -i 取行尾文件', () => {
  assert.equal(primaryPathOf(call('bash', { command: 'echo hi > out.txt' })), 'out.txt')
  assert.equal(primaryPathOf(call('bash', { command: 'cp src/a.js dist/a.js' })), 'dist/a.js')
  assert.equal(primaryPathOf(call('bash', { command: "sed -i 's/a/b/' scripts/ci.sh" })), 'scripts/ci.sh')
})

test('主路径：提取失败返回 null（宁漏勿错，上层计入 unparsedWrites）', () => {
  assert.equal(primaryPathOf(call('bash', { command: "git commit -m 'x'" })), null)
  assert.equal(primaryPathOf(call('bash', { command: 'echo "a > b"' })), null)
})

test('愿界：前缀匹配、./ 归一化、绝对路径出界', () => {
  assert.equal(underRoot('src/payments/charge.js', 'src/payments/'), true)
  assert.equal(underRoot('src/payments.js', 'src/payments/'), false)
  assert.equal(underRoot('./src/payments/x.js', 'src/payments/'), true)
  assert.equal(underRoot('/abs/x.js', 'src/payments/'), false)
  assert.equal(inScope('src/payments/x.js', ['src/payments/']), true)
  assert.equal(inScope('docs/api.md', ['src/payments/']), false)
  assert.equal(inScope('anything', null), true, 'allowAll：无界，一律视为界内')
})

test('相关性：关键词（大小写不敏感）命中 name+args 序列化', () => {
  assert.equal(isRelevant(call('bash', { command: 'npm test' }), wish()), true)
  assert.equal(isRelevant(call('read', { path: 'x' }), wish({ anchors: { keywords: ['PAYMENT'] } })), false)
  assert.equal(isRelevant(call('read', { path: 'PAYMENT_X' }), wish({ anchors: { keywords: ['payment'] } })), true)
})

test('相关性：锚点路径前缀命中（读动作也算）', () => {
  const c = wish({ anchors: { keywords: ['zzz'], paths: ['src/payments/'] } })
  assert.equal(isRelevant(call('read', { path: 'src/payments/charge.js' }), c), true)
  assert.equal(isRelevant(call('read', { path: 'docs/api.md' }), c), false)
})

test('相关性：有界之愿里，愿内写动作＝念在（规则 3）；allowAll 时该规则关闭', () => {
  const bounded = wish({ anchors: { keywords: ['zzz'], paths: [] } })
  assert.equal(isRelevant(call('edit', { path: 'src/payments/a.js' }), bounded), true)
  const unbounded = wish({ anchors: { keywords: ['zzz'], paths: [] }, scope: { allowAll: true } })
  assert.equal(isRelevant(call('edit', { path: 'src/payments/a.js' }), unbounded), false)
})

// ---------------------------------------------------------------------------
// 尘值评分
// ---------------------------------------------------------------------------

test('尘值：空流与全程在场 → 0（净）', () => {
  const empty = dustScore(wish(), [])
  assert.equal(empty.score, 0)
  assert.equal(empty.band, '净')
  assert.deepEqual(empty.breakdown, { forget: 0, grasp: 0, cadence: 0 })
  assert.deepEqual(empty.issues, [])
  const s = dustScore(wish(), Array.from({ length: 10 }, onGoal))
  assert.equal(s.score, 0)
  assert.equal(s.issues.length, 0)
})

test('尘值·失念：尾部连击逐项断言（+8/次，cap 40）', () => {
  const scoreOf = (n) => dustScore(wish(), [...Array.from({ length: 8 }, onGoal), ...Array.from({ length: n }, offGoal)])
  assert.equal(scoreOf(1).breakdown.forget, 8)
  assert.equal(scoreOf(3).breakdown.forget, 24)
  assert.equal(scoreOf(5).breakdown.forget, 40)
  assert.equal(scoreOf(9).breakdown.forget, 40, 'cap 40')
})

test('尘值·失念：只计"从最新往回"的连击——中间走神、后来归位不算（不怕念起，只怕觉迟）', () => {
  const s = dustScore(wish(), [onGoal(), offGoal(), onGoal(), onGoal()])
  assert.equal(s.breakdown.forget, 0)
})

test('尘值·失念：window 覆盖生效（契约 window 与 options.window）', () => {
  const ten = Array.from({ length: 10 }, offGoal)
  assert.equal(dustScore(wish({ window: 3 }), ten).breakdown.forget, 24, '窗口 3 → 最多计 3 次')
  assert.equal(dustScore(wish(), ten, [], { window: 2 }).breakdown.forget, 16, 'options.window 覆盖契约')
})

test('尘值·攀缘：越界写入 +12/次，cap 40', () => {
  const drift = (n) => dustScore(wish(), [...Array.from({ length: n }, () => call('edit', { path: 'docs/api.md' }))])
  assert.equal(drift(1).breakdown.grasp, 12)
  assert.equal(drift(3).breakdown.grasp, 36)
  assert.equal(drift(4).breakdown.grasp, 40, 'cap 40')
})

test('尘值·攀缘：愿内写入与无界之愿都不计；提取失败进 unparsedWrites', () => {
  const s1 = dustScore(wish(), [call('edit', { path: 'src/payments/a.js' })])
  assert.equal(s1.breakdown.grasp, 0)
  const s2 = dustScore(wish({ scope: { allowAll: true } }), [call('edit', { path: 'docs/api.md' })])
  assert.equal(s2.breakdown.grasp, 0, '无界之愿：攀缘之门结构性沉默')
  assert.equal(s2.details.unbounded, true)
  const s3 = dustScore(wish(), [call('bash', { command: "git commit -m 'x'" })])
  assert.equal(s3.breakdown.grasp, 0, '提取失败不罚')
  assert.equal(s3.details.unparsedWrites, 1, '但诚实计数')
})

test('尘值·息尘：段长 > maxStale 每段 +10，cap 20；无拂拭只算一段', () => {
  const n = (k) => Array.from({ length: k }, offGoal)
  assert.equal(dustScore(wish(), n(30)).breakdown.cadence, 0, '30 次未超默认阈')
  assert.equal(dustScore(wish(), n(31)).breakdown.cadence, 10)
  assert.equal(dustScore(wish(), n(61)).breakdown.cadence, 10, '全流无拂拭只记一段')
  assert.equal(dustScore(wish(), n(70), [31, 62]).breakdown.cadence, 20, '两段违例 → cap 20')
  assert.equal(dustScore(wish(), n(70), [10], { maxStale: 5 }).breakdown.cadence, 20, 'maxStale 可调')
})

test('尘值：分带边界（0–14 净 / 15–29 浮 / ≥30 蒙）与总 cap 100', () => {
  assert.deepEqual([0, 14, 15, 29, 30].map(bandOf), ['净', '净', '浮', '浮', '蒙'])
  const calls = [
    ...Array.from({ length: 4 }, () => call('edit', { path: 'docs/api.md' })),
    ...Array.from({ length: 5 }, offGoal),
  ]
  const s = dustScore(wish(), calls, [10, 20], { maxStale: 5 })
  assert.equal(s.breakdown.forget, 40)
  assert.equal(s.breakdown.grasp, 40)
  assert.equal(s.breakdown.cadence, 20)
  assert.equal(s.score, 100, '40+40+20 封顶 100')
  assert.equal(s.band, '蒙')
})

test('尘值：THRESHOLD_DEFAULT 为 30（CI 门默认阈）', () => {
  assert.equal(THRESHOLD_DEFAULT, 30)
})

// ---------------------------------------------------------------------------
// 流解析
// ---------------------------------------------------------------------------

test('流解析：注释与空行跳过；坏行报行号', () => {
  const events = parseStream('# 注释\n\n{"type":"turn_start","id":"t1","at":1}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"ok":1}\nnot-json\n'), /第 2 行/)
})

test('流解析：tool_call/tool_result 归并为一次调用，reanchor 记为标记', () => {
  const events = parseStream(readFixture('clean-stream.jsonl'))
  const { calls, marks, turns } = buildCalls(events)
  assert.equal(calls.length, 8)
  assert.deepEqual(marks, [4, 8], '两次拂拭：第 4 次调用后与第 8 次调用后')
  assert.deepEqual(turns, ['t1', 't2'])
  assert.equal(calls[2].isError, true, 'result 的 isError 回填到调用')
})

test('流解析：孤儿 result（无配对 call）独立建档，不丢任何一次真实执行', () => {
  const { calls } = buildCalls(parseStream('{"type":"tool_result","id":"x","name":"bash","args":{"command":"ls"},"isError":true}'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('三层互认：zhizhi（无调用 id 的旧格式）与 jiebi 的夹具流可直接解析', () => {
  const zhizhi = buildCalls(parseStream(readFileSync(join(here, '..', '..', 'zhizhi', 'fixtures', 'sample-stream.jsonl'), 'utf8')))
  assert.equal(zhizhi.calls.length, 8, '无 id 的 result 并入紧邻 call，16 行 → 8 次调用')
  const jiebi = buildCalls(parseStream(readFileSync(join(here, '..', '..', 'jiebi', 'fixtures', 'sample-stream.jsonl'), 'utf8')))
  assert.equal(jiebi.calls.length, 8)
})

// ---------------------------------------------------------------------------
// 拂拭块渲染
// ---------------------------------------------------------------------------

test('拂拭块：逐字节确定（同契约同状态两次渲染完全一致）', () => {
  const c = readJSON('drifting-wish.json')
  const state = { k: 3, score: 18, forget: 8, grasp: 0, cadence: 10 }
  const a = renderReanchor(c, state)
  const b = renderReanchor(c, { ...state })
  assert.equal(a, b)
  assert.equal(a, renderReanchor({ ...c, anchors: { paths: c.anchors.paths, keywords: c.anchors.keywords } }, { ...state }),
    '契约键序不影响渲染（顺序由代码固定）')
})

test('拂拭块：包含本愿原文、锚点、愿界、终验；#k 随状态递增', () => {
  const c = readJSON('drifting-wish.json')
  const text = renderReanchor(c, { k: 2, score: 0, forget: 0, grasp: 0, cadence: 0 })
  assert.ok(text.includes('本愿：修复 payments 模块的重复扣款，并让回归测试全绿'))
  assert.ok(text.includes('锚点：payment / duplicate / 扣款 / test'))
  assert.ok(text.includes('愿界：src/payments/ / tests/payments/'))
  assert.ok(text.includes('a1=bash~npm test'))
  assert.ok(text.includes('a2=artifact=reports/repro-fixed.txt'))
  assert.ok(text.includes('#2'))
})

test('拂拭块：无状态时不出现尘值行（不假装量过）；有状态时出现', () => {
  const c = readJSON('clean-wish.json')
  assert.equal(renderReanchor(c, null).includes('尘值'), false)
  assert.ok(renderReanchor(c, { k: 1, score: 5, forget: 5, grasp: 0, cadence: 0 }).includes('尘值：5'))
})

test('拂拭块：allowAll 之愿明说"攀缘之门沉默"', () => {
  const c = wish({ scope: { allowAll: true } })
  assert.ok(renderReanchor(c, null).includes('allowAll'))
})

// ---------------------------------------------------------------------------
// 离线审计与终验门
// ---------------------------------------------------------------------------

test('审计：蒙尘夹具逐字段断言（失念 32 + 攀缘 24 + 息尘 10 = 66 → 蒙）', () => {
  const report = auditStream(readJSON('drifting-wish.json'), readFixture('drifting-stream.jsonl'))
  assert.equal(report.calls, 34)
  assert.equal(report.score, 66)
  assert.equal(report.band, '蒙')
  assert.equal(report.verdict, 'fail')
  assert.deepEqual(report.breakdown, { forget: 32, grasp: 24, cadence: 10 })
  assert.equal(report.details.anchorMissStreak, 4)
  assert.deepEqual(report.details.outOfScopeWrites.map((o) => o.path), ['docs/api.md', 'scripts/ci.sh'])
  assert.equal(report.ok, false)
  assert.equal(report.issues.length, 3)
})

test('审计：干净夹具为 0（净）且终验对账 fulfilled', () => {
  const report = auditStream(readJSON('clean-wish.json'), readFixture('clean-stream.jsonl'), { acceptance: true })
  assert.equal(report.score, 0)
  assert.equal(report.band, '净')
  assert.equal(report.verdict, 'pass')
  assert.equal(report.acceptance.verdict, 'fulfilled')
  assert.equal(report.ok, true)
})

test('审计：gate 覆盖语义（66 < 70 → pass）', () => {
  const report = auditStream(readJSON('drifting-wish.json'), readFixture('drifting-stream.jsonl'), { gate: 70 })
  assert.equal(report.verdict, 'pass')
  assert.equal(report.gate, 70)
  assert.equal(report.ok, true)
})

test('终验门：探针与工件逐条核对；artifact 无 cwd 且流中无痕迹 → unverified（不假装核对）', () => {
  const calls = [call('bash', { command: 'npm test' })]
  assert.deepEqual(checkAcceptanceRef({ ref: 'a1', name: 'bash', argsContains: 'npm test' }, calls).status, 'verified')
  assert.deepEqual(checkAcceptanceRef({ ref: 'a2', name: 'bash', argsContains: 'never-ran' }, calls).status, 'unverified')
  assert.deepEqual(checkAcceptanceRef({ ref: 'a3', artifact: 'reports/x.json' }, calls).status, 'unverified')
  assert.deepEqual(
    checkAcceptanceRef({ ref: 'a3', artifact: 'reports/x.json' }, [call('bash', { command: 'cat reports/x.json' })]).status,
    'verified',
    '流中出现工件路径的调用痕迹即可 verified',
  )
})

test('终验门：artifact + cwd 走文件系统核对', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zn-'))
  mkdirSync(join(dir, 'reports'))
  writeFileSync(join(dir, 'reports', 'repro-fixed.txt'), 'ok')
  const ref = { ref: 'a2', artifact: 'reports/repro-fixed.txt' }
  assert.deepEqual(checkAcceptanceRef(ref, [], dir).status, 'verified')
  assert.deepEqual(checkAcceptanceRef(ref, [], join(tmpdir(), 'nonexistent-zn')).status, 'unverified')
})

test('审计：三层互认——zhizhi / jiebi 夹具流配契约直接可审', () => {
  // 两条流的尾部动作（read/edit src/user.js、npm test）都在本愿锚点上 → 尾部失念 0。
  // zhizhi 流中间的 write src/patch.js 落在愿界 src/ 内 → 攀缘 0。
  const expect = {
    zhizhi: { calls: 8, score: 0 },
    jiebi: { calls: 8, score: 0 },
  }
  for (const dir of ['zhizhi', 'jiebi']) {
    const text = readFileSync(join(here, '..', '..', dir, 'fixtures', 'sample-stream.jsonl'), 'utf8')
    const report = auditStream(readJSON('cross-wish.json'), text, { acceptance: true })
    const want = expect[dir]
    assert.equal(report.calls, want.calls, `${dir} 流：8 次调用`)
    assert.deepEqual(report.breakdown, { forget: 0, grasp: 0, cadence: 0 }, `${dir} 流：分项`)
    assert.equal(report.score, want.score, `${dir} 流：尘值`)
    assert.equal(report.band, '净')
    assert.equal(report.acceptance.verdict, 'fulfilled', `${dir} 流：npm test 真实发生过`)
    assert.equal(report.ok, true, `${dir} 流：净，终验对账`)
  }
})

test('审计：契约非法抛错（由 CLI 转退出码 2）', () => {
  assert.throws(() => auditStream({ version: 9 }, ''), /契约非法/)
})

test('审计：allowAll 之愿——攀缘结构性沉默，unbounded 如实入账', () => {
  const c = wish({ scope: { allowAll: true } })
  const report = auditStream(c, '{"type":"tool_call","id":"x","name":"edit","args":{"path":"/anywhere/else.md"},"at":1}\n')
  assert.equal(report.breakdown.grasp, 0)
  assert.equal(report.details.unbounded, true)
})

test('尘值组合语义：尾部越界写入同时计入失念与攀缘（它既出界又不在锚点上）', () => {
  const s = dustScore(wish(), [onGoal(), call('edit', { path: 'docs/api.md' })])
  assert.equal(s.breakdown.grasp, 12)
  assert.equal(s.breakdown.forget, 8, '越界写对锚点相关性而言同样是一次离开')
  assert.equal(s.score, 20)
})

test('终验门：探针 name 必须逐字相同（sh 里的 npm test 冒充不了 bash 终验）', () => {
  const calls = [call('sh', { command: 'npm test' })]
  const ref = { ref: 'a1', name: 'bash', argsContains: 'npm test' }
  assert.deepEqual(checkAcceptanceRef(ref, calls).status, 'unverified')
  assert.deepEqual(checkAcceptanceRef(ref, [call('bash', { command: 'npm test' })]).status, 'verified')
})

// ---------------------------------------------------------------------------
// 正念引擎（无 Cordis 的状态机层）
// ---------------------------------------------------------------------------

test('引擎：换愿＝新账——setContract 重置观察与拂拭序号', () => {
  const p = createPresence({ contract: wish({ id: 'w-a' }) })
  p.observe({ name: 'read', args: { path: 'x.md' } })
  p.reanchor()
  assert.equal(p.report().totals.callsObserved, 1)
  assert.equal(p.report().totals.reanchors, 1)
  const r = p.setContract(wish({ id: 'w-b' }))
  assert.equal(r.valid, true)
  assert.equal(p.report().totals.callsObserved, 0)
  assert.equal(p.report().totals.reanchors, 0)
  assert.equal(p.report().contract.id, 'w-b')
})

test('引擎：enabled=false 观察沉默，契约服务照常', () => {
  const p = createPresence({ contract: wish(), enabled: false })
  p.observe({ name: 'read', args: { path: 'x.md' } })
  assert.equal(p.report().totals.callsObserved, 0)
  assert.equal(p.dust().score, 0)
  assert.equal(p.reanchor().valid, true)
})

test('引擎：拂拭事件把调用序列切段（息尘的运行时依据）', () => {
  const p = createPresence({ contract: wish() })
  for (let i = 0; i < 3; i++) p.observe({ name: 'read', args: { path: 'src/payments/a.js' } })
  p.reanchor()
  for (let i = 0; i < 3; i++) p.observe({ name: 'read', args: { path: 'src/payments/a.js' } })
  const dust = p.dust()
  assert.equal(dust.breakdown.cadence, 0)
  assert.equal(dust.details.reanchors, 1)
})
