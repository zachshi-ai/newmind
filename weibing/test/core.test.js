/**
 * 核心单测 —— charter schema / 险兆词表 / 切诊探针 / 病灶计分 / 分带门禁 /
 * 传变预告警 / 医嘱渲染 / 确定性。
 *
 * 计分用例全部断言"恰好该分值"：每个病灶条款都可独立证伪（docs/04-acceptance.md A1）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { validateCharter, makeTemplate, CHARTER_VERSION } from '../src/core/charter.js'
import { DEFAULT_UNBOUNDED, DEFAULT_VAGUE, mergeLexicon, findOmens, omenScore } from '../src/core/lexicon.js'
import { commandOnPath, pathExistsUnder, firstTokenOf } from '../src/core/probes.js'
import { runExam, bandOf, underRoot, GATE_DEFAULT, TRANSMISSIONS } from '../src/core/exam.js'
import { renderPrescribe } from '../src/core/prescribe.js'

/** 测试用 charter 骨架：除 brief 外四诊全清（score 0 的基准）。 */
const charter = (over = {}) => ({
  version: 1,
  id: 't-x',
  brief: '把 payments 模块的重复扣款修掉',
  scope: { allowRoots: ['src/payments/'] },
  acceptance: [{ ref: 'a1', name: 'bash', argsContains: 'node --version' }],
  stop: { maxSteps: 100 },
  ...over,
})

const tmp = () => mkdtempSync(join(tmpdir(), 'weibing-core-'))

// ---------------------------------------------------------------------------
// charter schema
// ---------------------------------------------------------------------------

test('契约：骨架必须通过 schema 校验（template 自洽）', () => {
  const v = validateCharter(makeTemplate())
  assert.equal(v.valid, true, JSON.stringify(v.issues))
})

test('契约：version 必须为 1', () => {
  assert.equal(validateCharter(charter({ version: 2 })).valid, false)
  assert.ok(validateCharter(charter({ version: 2 })).issues.some((i) => i.path === 'version'))
  assert.equal(validateCharter(charter({ version: CHARTER_VERSION })).valid, true)
})

test('契约：id 与 brief 必须非空', () => {
  assert.equal(validateCharter(charter({ id: '' })).valid, false)
  assert.equal(validateCharter(charter({ brief: '   ' })).valid, false)
  assert.ok(validateCharter(charter({ brief: '  \n ' })).issues.some((i) => i.path === 'brief'))
})

test('契约：非对象输入直接非法', () => {
  for (const bad of [null, 42, 'x', []]) {
    assert.equal(validateCharter(bad).valid, false)
  }
})

test('契约：paths 必须是非空相对路径（无 / 前缀、无 .. 段）', () => {
  assert.equal(validateCharter(charter({ paths: ['/abs'] })).valid, false)
  assert.equal(validateCharter(charter({ paths: ['a/../b'] })).valid, false)
  assert.equal(validateCharter(charter({ paths: [''] })).valid, false)
  assert.equal(validateCharter(charter({ paths: 'src/' })).valid, false)
  assert.equal(validateCharter(charter({ paths: ['src/v2/'] })).valid, true)
})

test('契约：scope 的类型规则（allowRoots 数组、allowAll 布尔）', () => {
  assert.equal(validateCharter(charter({ scope: { allowRoots: 'src/' } })).valid, false)
  assert.equal(validateCharter(charter({ scope: { allowRoots: ['/abs'] } })).valid, false)
  assert.equal(validateCharter(charter({ scope: { allowAll: 'yes' } })).valid, false)
  assert.equal(validateCharter(charter({ scope: {} })).valid, true)
})

test('契约：ref 重复是问诊的事（W4 相克），schema 只管形状', () => {
  const dup = charter({ acceptance: [{ ref: 'a1', artifact: 'a.txt' }, { ref: 'a1', artifact: 'b.txt' }] })
  assert.equal(validateCharter(dup).valid, true, '重复引用在 schema 层合法')
  const r = runExam(dup)
  assert.equal(r.lesions.filter((l) => l.code === 'W4').length, 1, '重复引用在体检层计为相克')
})

test('契约：acceptance 必须argsContains⊕artifact 二选一，argsContains 必须带 name', () => {
  const mk = (a) => validateCharter(charter({ acceptance: [a] }))
  assert.equal(mk({ ref: 'a1' }).valid, false, '两者皆无')
  assert.equal(mk({ ref: 'a1', argsContains: 'npm test', artifact: 'x.txt' }).valid, false, '两者都有')
  assert.equal(mk({ ref: 'a1', argsContains: 'npm test' }).valid, false, '缺 name')
  assert.equal(mk({ ref: 'a1', artifact: '' }).valid, false, '空 artifact')
  assert.equal(mk({ ref: 'a1', name: 'bash', argsContains: 'npm test' }).valid, true)
  assert.equal(mk({ ref: 'a1', artifact: 'reports/x.txt' }).valid, true)
})

test('契约：stop 至少一项且为正整数', () => {
  assert.equal(validateCharter(charter({ stop: {} })).valid, false)
  assert.equal(validateCharter(charter({ stop: { maxSteps: 0 } })).valid, false)
  assert.equal(validateCharter(charter({ stop: { maxMinutes: -5 } })).valid, false)
  assert.equal(validateCharter(charter({ stop: { maxSteps: 1, maxMinutes: 1 } })).valid, true)
})

test('契约：requires 的 files 走路径规则、tools 为非空字符串', () => {
  assert.equal(validateCharter(charter({ requires: { files: ['/abs'] } })).valid, false)
  assert.equal(validateCharter(charter({ requires: { tools: [''] } })).valid, false)
  assert.equal(validateCharter(charter({ requires: { files: ['a/b.json'], tools: ['node'] } })).valid, true)
})

test('契约：顶层未知字段拒绝（严格 schema）', () => {
  const v = validateCharter(charter({ wish: '顺手写个心愿' }))
  assert.equal(v.valid, false)
  assert.ok(v.issues.some((i) => i.path === 'wish'))
})

// ---------------------------------------------------------------------------
// 险兆词表（闻诊）
// ---------------------------------------------------------------------------

test('词表：内置表非空且互不重合；mergeLexicon 追加并过滤垃圾', () => {
  assert.ok(DEFAULT_UNBOUNDED.length >= 10)
  assert.ok(DEFAULT_VAGUE.length >= 10)
  const merged = mergeLexicon({ unbounded: ['一律', 42, ''], vague: ['打磨'] })
  assert.ok(merged.unbounded.includes('一律'))
  assert.ok(merged.unbounded.includes('所有'))
  assert.ok(merged.vague.includes('打磨'))
  assert.ok(merged.vague.includes('优化'))
  assert.equal(merged.unbounded.includes(42), false)
  assert.equal(merged.unbounded.includes(''), false)
})

test('词表：同一 kind 内去重 token（与出现次数无关）', () => {
  const omens = findOmens('所有文件都要所有格式，所有场景', mergeLexicon(null))
  assert.equal(omens.filter((o) => o.token === '所有').length, 1)
})

test('词表：英文大小写不敏感', () => {
  const omens = findOmens('ALL files and Every module', mergeLexicon(null))
  assert.deepEqual(omens.map((o) => o.token).sort(), ['all', 'every'])
})

test('词表：输出序固定——无边先于无度，与 brief 内出现序无关', () => {
  const omens = findOmens('先优化一下，再处理所有文件', mergeLexicon(null))
  assert.equal(omens[0].kind, 'unbounded')
  assert.equal(omens[1].kind, 'vague')
})

test('词表：计分 5/去重 token，每 kind 封顶 10（总封顶 20）', () => {
  const lex = mergeLexicon(null)
  assert.equal(omenScore(findOmens('所有 全部 凡是', lex)), 10, '无边 3 个 → 封顶 10')
  assert.equal(omenScore(findOmens('所有 全部', lex)), 10, '无边 2 个 → 10')
  assert.equal(omenScore(findOmens('所有 全部 + 优化 改进 看看', lex)), 20, '2+3 → 10+10')
  assert.equal(omenScore(findOmens('优化', lex)), 5, '无度 1 个 → 5')
})

// ---------------------------------------------------------------------------
// 切诊探针
// ---------------------------------------------------------------------------

test('探针：PATH 上找得到 node，找不到胡编的命令', () => {
  assert.equal(commandOnPath('node'), true)
  assert.equal(commandOnPath('definitely-not-a-real-cmd-xyz'), false)
  assert.equal(commandOnPath(''), false)
})

test('探针：含 / 的命令按体检根相对路径实测，且要求可执行位；裸命令名只查 PATH', () => {
  const dir = tmp()
  try {
    writeFileSync(join(dir, 'tool.sh'), '#!/bin/sh\n')
    chmodSync(join(dir, 'tool.sh'), 0o755)
    assert.equal(commandOnPath('./tool.sh', dir), true, './ 前缀走相对路径分支')
    assert.equal(commandOnPath('tool.sh', dir), false, '裸命令名不在 PATH 上就不算')
    chmodSync(join(dir, 'tool.sh'), 0o644)
    assert.equal(commandOnPath('./tool.sh', dir), false, '无可执行位 → 不算备资')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('探针：文件存在性——无 cwd 诚实返回 null（未探），不假装核对', () => {
  assert.equal(pathExistsUnder(null, 'x.txt'), null)
  const dir = tmp()
  try {
    writeFileSync(join(dir, 'x.txt'), 'x')
    assert.equal(pathExistsUnder(dir, 'x.txt'), true)
    assert.equal(pathExistsUnder(dir, 'nope.txt'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('探针：argsContains 首词提取', () => {
  assert.equal(firstTokenOf('  npm  test --run  '), 'npm')
  assert.equal(firstTokenOf('node'), 'node')
  assert.equal(firstTokenOf('   '), '')
})

// ---------------------------------------------------------------------------
// 望诊病灶：W1 / W2 / W3（缺席即症状）
// ---------------------------------------------------------------------------

test('W1 无验 = 45：acceptance 缺席或空数组', () => {
  for (const acceptance of [undefined, []]) {
    const r = runExam(charter({ acceptance }))
    assert.equal(r.valid, true)
    const w1 = r.lesions.find((l) => l.code === 'W1')
    assert.ok(w1, '应报无验')
    assert.equal(w1.weight, 45)
    assert.equal(r.score, 45)
    assert.equal(r.band, '病')
    assert.equal(r.verdict, 'fail')
    assert.ok(r.transmissions.some((t) => /终验门/.test(t)), '传变点名正念终验门')
  }
})

test('W2 无界 = 45：scope 缺席 / allowRoots 空 / allowAll 三种形状各自可判', () => {
  const cases = [
    [undefined, 'absent', '愿界缺席'],
    [{ allowAll: true }, 'allow-all', 'allowAll 即无界'],
    [{ allowRoots: [] }, 'empty-roots', 'allowRoots 为空'],
  ]
  for (const [scope, kind, detail] of cases) {
    const r = runExam(charter({ scope }))
    const w2 = r.lesions.find((l) => l.code === 'W2')
    assert.ok(w2, `scope=${JSON.stringify(scope)} 应报无界`)
    assert.equal(w2.weight, 45)
    assert.equal(w2.kind, kind)
    assert.equal(w2.detail, detail)
    assert.ok(r.transmissions.some((t) => /攀缘/.test(t)), '传变点名攀缘')
  }
})

test('W3 无止 = 30：stop 缺席（stop:{} 在 schema 层即非法，不出现在体检）', () => {
  const r = runExam(charter({ stop: undefined }))
  const w3 = r.lesions.find((l) => l.code === 'W3')
  assert.ok(w3)
  assert.equal(w3.weight, 30)
  assert.equal(r.score, 30)
  assert.equal(r.band, '萌', '无止单项是黄灯：运行时层尚可止损')
  assert.equal(r.verdict, 'pass', '萌级诊而不拦')
  assert.ok(r.transmissions.some((t) => /知止/.test(t)), '传变点名知止')
})

test('空 stop 对象是 schema 违规：体检诚实拒绝而不是假装通过', () => {
  const r = runExam(charter({ stop: {} }))
  assert.equal(r.valid, false)
  assert.ok(r.issues.some((i) => i.path === 'stop'))
})

// ---------------------------------------------------------------------------
// 问诊病灶：W4 相克（逐条计，上限 2）
// ---------------------------------------------------------------------------

test('W4 相克 = 40/条：ref 重复按多出的引用次数计', () => {
  const one = runExam(charter({ acceptance: [{ ref: 'a1', artifact: 'a.txt' }, { ref: 'a1', artifact: 'b.txt' }] }))
  assert.equal(one.lesions.filter((l) => l.code === 'W4').length, 1)
  assert.equal(one.breakdown.lesions, 40)
  const three = runExam(charter({ acceptance: [{ ref: 'a1', artifact: 'a.txt' }, { ref: 'a1', artifact: 'b.txt' }, { ref: 'a1', artifact: 'c.txt' }] }))
  assert.equal(three.lesions.filter((l) => l.code === 'W4').length, 2, '三次引用 = 两条相克')
})

test('W4 相克：artifact 路径被多条终验重复引用', () => {
  const r = runExam(charter({ acceptance: [{ ref: 'a1', artifact: 'same.txt' }, { ref: 'a2', artifact: 'same.txt' }] }))
  const w4 = r.lesions.find((l) => l.code === 'W4')
  assert.ok(w4)
  assert.equal(w4.kind, 'dup-artifact')
  assert.match(w4.detail, /same\.txt/)
})

test('W4 相克：目标径在所有愿界之外（前缀匹配，underRoot 可独立证伪）', () => {
  assert.equal(underRoot('src/v2/a.js', ['src/']), true)
  assert.equal(underRoot('docs/a.md', ['src/']), false)
  const r = runExam(charter({ paths: ['docs/api.md'], scope: { allowRoots: ['src/'] } }))
  const w4 = r.lesions.find((l) => l.code === 'W4')
  assert.ok(w4)
  assert.equal(w4.kind, 'path-out-of-scope')
  assert.match(w4.detail, /docs\/api\.md/)
})

test('W4 相克：逐条计——出界的径各自成条，入界的径诚实放行', () => {
  const r = runExam(charter({ paths: ['docs/api.md', 'src/in.js'], scope: { allowRoots: ['src/'] } }))
  const w4 = r.lesions.filter((l) => l.code === 'W4')
  assert.equal(w4.length, 1, '只有 docs/api.md 出界')
  assert.match(w4[0].detail, /docs\/api\.md/)
  assert.doesNotMatch(w4[0].detail, /src\/in\.js/)
})

test('W4 相克：上限 2 条（80 分封顶）', () => {
  const r = runExam(charter({
    paths: ['a/', 'b/', 'c/', 'd/'],
    scope: { allowRoots: ['z/'] },
  }))
  const w4 = r.lesions.filter((l) => l.code === 'W4')
  assert.equal(w4.length, 2)
  assert.equal(r.breakdown.lesions, 80)
})

// ---------------------------------------------------------------------------
// 切诊病灶：W5 妄证 / W6 缺资（落空即症状；无 cwd 诚实 unprobed）
// ---------------------------------------------------------------------------

test('W5 妄证 = 35/条：artifact 落空（有 cwd 才核对）', () => {
  const dir = tmp()
  try {
    const r = runExam(charter({ acceptance: [{ ref: 'a1', artifact: 'reports/missing.txt' }] }), { cwd: dir })
    const w5 = r.lesions.find((l) => l.code === 'W5')
    assert.ok(w5)
    assert.equal(w5.weight, 35)
    assert.equal(w5.kind, 'artifact-missing')
    assert.equal(r.probes.probed, 1)
    assert.ok(r.transmissions.some((t) => /mid-run/.test(t)), '传变点名 mid-run 翻车')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('W5 妄证：artifact 存在则不罚；无 cwd 诚实 unprobed 不计分', () => {
  const dir = tmp()
  try {
    mkdirSync(join(dir, 'reports'), { recursive: true })
    writeFileSync(join(dir, 'reports', 'ok.txt'), 'x')
    const r = runExam(charter({ acceptance: [{ ref: 'a1', artifact: 'reports/ok.txt' }] }), { cwd: dir })
    assert.equal(r.score, 0)
    assert.equal(r.probes.probed, 1)
    const noCwd = runExam(charter({ acceptance: [{ ref: 'a1', artifact: 'reports/ok.txt' }] }))
    assert.equal(noCwd.score, 0)
    assert.equal(noCwd.probes.unprobed, 1)
    assert.equal(noCwd.lesions.filter((l) => l.code === 'W5').length, 0, '不假装核对过')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('W5 妄证：终验命令不在 PATH', () => {
  const r = runExam(charter({ acceptance: [{ ref: 'a1', name: 'bash', argsContains: 'nope-cmd-xyz --flag' }] }))
  const w5 = r.lesions.find((l) => l.code === 'W5')
  assert.ok(w5)
  assert.equal(w5.kind, 'command-missing')
  assert.match(w5.detail, /nope-cmd-xyz/)
})

test('W5 妄证：上限 2 条（70 分）', () => {
  const dir = tmp()
  try {
    const r = runExam(charter({ acceptance: [
      { ref: 'a1', artifact: 'm1.txt' },
      { ref: 'a2', artifact: 'm2.txt' },
      { ref: 'a3', artifact: 'm3.txt' },
    ] }), { cwd: dir })
    assert.equal(r.lesions.filter((l) => l.code === 'W5').length, 2)
    assert.equal(r.breakdown.lesions, 70)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('W6 缺资 = 35/条：文件与工具各自落空，合计上限 2 条', () => {
  const dir = tmp()
  try {
    const r = runExam(charter({ requires: { files: ['gone1.txt'], tools: ['nope-tool-xyz'] } }), { cwd: dir })
    const w6 = r.lesions.filter((l) => l.code === 'W6')
    assert.equal(w6.length, 2)
    assert.deepEqual(w6.map((l) => l.kind).sort(), ['file-missing', 'tool-missing'])
    assert.equal(r.breakdown.lesions, 70)
    const capped = runExam(charter({ requires: { files: ['g1', 'g2', 'g3'] } }), { cwd: dir })
    assert.equal(capped.lesions.filter((l) => l.code === 'W6').length, 2)
    assert.ok(capped.transmissions.some((t) => /第一轮工具调用/.test(t)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// 全清 / 混合 / 分带 / 门禁 / 确定性
// ---------------------------------------------------------------------------

test('全清 charter：病值 0（安）、零病灶零险兆、探针全实测、无传变', () => {
  const r = runExam(charter(), { cwd: process.cwd() })
  assert.equal(r.score, 0)
  assert.equal(r.band, '安')
  assert.equal(r.verdict, 'pass')
  assert.equal(r.ok, true)
  assert.equal(r.lesions.length, 0)
  assert.equal(r.omens.length, 0)
  assert.equal(r.transmissions.length, 0)
  assert.ok(r.probes.probed >= 1, 'node --version 的 PATH 探针执行过')
  assert.equal(r.probes.unprobed, 0)
})

test('混合：病灶按 W1→W6 固定码序，三项硬伤总分 cap 100', () => {
  const r = runExam(charter({ acceptance: undefined, scope: undefined, stop: undefined }))
  assert.deepEqual(r.lesions.map((l) => l.code), ['W1', 'W2', 'W3'])
  assert.equal(r.breakdown.lesions, 120)
  assert.equal(r.score, 100, '总分封顶 100')
  assert.equal(r.band, '病')
  assert.equal(r.transmissions.length, 3)
})

test('分带：安(0–15) / 萌(16–39) / 病(≥40) 边界逐点可证', () => {
  assert.equal(bandOf(0), '安')
  assert.equal(bandOf(15), '安')
  assert.equal(bandOf(16), '萌')
  assert.equal(bandOf(39), '萌')
  assert.equal(bandOf(40), '病')
})

test('闻诊实测：3 无边 + 1 无度 = 15 分（安带顶格）；+1 无度即入萌带', () => {
  const r15 = runExam(charter({ brief: '所有 全部 凡是 优化一下' }))
  assert.equal(r15.score, 15, '无边 3 → 封顶 10，无度 1 → 5')
  assert.equal(r15.band, '安')
  const r20 = runExam(charter({ brief: '所有 全部 凡是 优化 改进' }))
  assert.equal(r20.score, 20)
  assert.equal(r20.band, '萌')
  assert.equal(r20.omens.length, 5)
  assert.equal(r20.verdict, 'pass', '萌级诊而不拦')
})

test('门禁：默认 40，W1 单项即拒；--gate 提高（此处传 gate）可放行', () => {
  const c = charter({ acceptance: undefined })
  assert.equal(runExam(c).verdict, 'fail', '45 ≥ 40')
  assert.equal(runExam(c, { gate: 50 }).verdict, 'pass', '45 < 50')
  assert.equal(runExam(c, { gate: 0 }).verdict, 'fail', 'gate 0 恒拒')
  assert.equal(GATE_DEFAULT, 40)
})

test('W4 单条相克恰好 40 = 病带下限（分带与病灶表的接缝点）', () => {
  const r = runExam(charter({ paths: ['docs/'], scope: { allowRoots: ['src/'] } }))
  assert.equal(r.score, 40)
  assert.equal(r.band, '病')
  assert.equal(r.verdict, 'fail')
})

test('确定性：同输入两次体检逐字相等（JSON 级），无时间戳无随机', () => {
  const c = charter({ brief: '对所有模块做一次彻底的优化', requires: { tools: ['nope-tool-xyz'] } })
  const a = runExam(c, { cwd: '/nonexistent-cwd-for-test' })
  const b = runExam(c, { cwd: '/nonexistent-cwd-for-test' })
  assert.deepEqual(a, b)
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  assert.equal(JSON.stringify(a).match(/"at"|timestamp|now/gi), null)
})

test('非法 charter：体检拒绝出诊（valid:false + issues），绝不对坏数据打分', () => {
  const r = runExam(charter({ version: 9 }))
  assert.equal(r.valid, false)
  assert.ok(r.issues.length > 0)
})

test('传变规则：六个病灶各有一条可指认的下游预告警', () => {
  assert.match(TRANSMISSIONS.W1, /终验门/)
  assert.match(TRANSMISSIONS.W2, /攀缘/)
  assert.match(TRANSMISSIONS.W3, /知止/)
  assert.match(TRANSMISSIONS.W4, /中局爆雷/)
  assert.match(TRANSMISSIONS.W5, /翻车/)
  assert.match(TRANSMISSIONS.W6, /第一轮/)
})

// ---------------------------------------------------------------------------
// 医嘱块（prescribe）：逐字节确定
// ---------------------------------------------------------------------------

test('医嘱块：同输入两次渲染逐字节相同', () => {
  const c = charter({ brief: '对所有模块做一次彻底的优化' })
  const a = renderPrescribe(c, runExam(c))
  const b = renderPrescribe(c, runExam(c))
  assert.equal(a, b)
  assert.ok(a.length > 0)
})

test('医嘱块：全清以「未病。可以开工。」收尾，报出病值与分带', () => {
  const c = charter()
  const text = renderPrescribe(c, runExam(c))
  assert.match(text, /【治未病 · pre-flight】#t-x/)
  assert.match(text, /病值：0（安）· 门 40/)
  assert.match(text, /病灶：0 · 险兆：0/)
  assert.match(text, /未病。可以开工。/)
  assert.match(text, /圣人不治已病治未病/)
})

test('医嘱块：病灶行带码、名、分值与医嘱；险兆行带词与开方', () => {
  const c = charter({ brief: '对所有模块做一次彻底的优化', acceptance: undefined, scope: undefined, stop: undefined })
  const text = renderPrescribe(c, runExam(c))
  assert.match(text, /- W1 无验 \+45 —— 医嘱：声明终验/)
  assert.match(text, /- W2 无界 \+45 —— 医嘱：立愿界 allowRoots/)
  assert.match(text, /- W3 无止 \+30 —— 医嘱：立止法/)
  assert.match(text, /「所有」无边之词 \+5 —— 医嘱：/)
  assert.match(text, /「优化」无度之动词 \+5 —— 医嘱：/)
  assert.match(text, /传变 3：/)
})

test('医嘱块：多行 brief 只取首行；体检未行时诚实说明', () => {
  const c = charter({ brief: '第一行任务\n第二行不该出现' })
  const text = renderPrescribe(c, runExam(c))
  assert.match(text, /任务：第一行任务/)
  assert.doesNotMatch(text, /第二行/)
  const bad = renderPrescribe({ id: 't-bad' }, { valid: false })
  assert.match(bad, /体检未行/)
})

test('W2 无界：allowAll true 时即使 allowRoots 也在，无界照报（无界优先）', () => {
  const r = runExam(charter({ scope: { allowRoots: ['src/'], allowAll: true } }))
  const w2 = r.lesions.find((l) => l.code === 'W2')
  assert.ok(w2)
  assert.equal(w2.kind, 'allow-all')
  assert.equal(r.score, 45)
})

test('问诊的前提：paths 与愿界任一缺席，相克结构性沉默（不假装判过）', () => {
  const noPaths = runExam(charter({ paths: undefined, scope: { allowRoots: ['src/'] } }))
  assert.equal(noPaths.lesions.filter((l) => l.code === 'W4').length, 0)
  const noRoots = runExam(charter({ paths: ['docs/'], scope: { allowRoots: undefined } }))
  assert.equal(noRoots.lesions.filter((l) => l.code === 'W4').length, 0)
})

test('切诊的容错：argsContains 带前后空白仍取到正确的首词', () => {
  const r = runExam(charter({ acceptance: [{ ref: 'a1', name: 'bash', argsContains: '   nope-cmd-xyz   --flag  ' }] }))
  const w5 = r.lesions.find((l) => l.code === 'W5')
  assert.ok(w5)
  assert.match(w5.detail, /nope-cmd-xyz/)
})

test('医嘱块：萌级中间态——有险兆行、无「未病」收尾、病灶行报零', () => {
  const c = charter({ brief: '所有文件优化一下' })
  const text = renderPrescribe(c, runExam(c))
  assert.match(text, /病灶：0/)
  assert.match(text, /险兆 2：/)
  assert.doesNotMatch(text, /未病。可以开工。/)
  assert.match(text, /「所有」无边之词 \+5/)
  assert.match(text, /「优化」无度之动词 \+5/)
})
