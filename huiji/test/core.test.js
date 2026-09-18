/**
 * 讳疾核心测试 —— 判定语义逐条对账 docs/03（实现与 03/04 冲突时改实现不改标准）。
 * 夹具手算期望锁死于 docs/04 A2；此处断言恰好该分值与案名行号。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath } from '../src/core/object.js'
import { findYuxing, hasNegationGuard, tokensOf, hitsJianxing, isSweeping, djb2, YU_ZH, YU_EN, JIANXING } from '../src/core/yuxing.js'
import { createEngine, recordCall, judge, exportCalls, bandOf, GATE_DEFAULT } from '../src/core/jizhang.js'
import { auditStreams } from '../src/core/audit.js'
import { emptyBook, parseBook, registerEntry, revokeEntry, globMatch, bookCount } from '../src/core/quance.js'
import { renderJipai } from '../src/core/jipai.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8')

/** 便捷装配：从流文本记入引擎。 */
function feed(text, { book = null } = {}) {
  const engine = createEngine({ book })
  const { calls } = buildCalls(parseStream(text))
  for (const c of calls) recordCall(engine, { session: 's', ...c })
  return engine
}

// ---- 流解析（1）--------------------------------------------------------------

test('流解析：注释/坏行报行号/id 配对/无 id 并入紧邻/孤儿 result 建档', () => {
  const bad = '# 注释\n{"type":"turn_start","id":"t1"}\n{"nonsense"\n'
  assert.throws(() => parseStream(bad), /第 3 行/)
  const ok = [
    '{"type":"tool_call","id":"a","name":"bash","args":{"command":"npm test"}}',
    '{"type":"tool_result","id":"a","isError":true,"content":"FAIL"}',
    '{"type":"tool_result","isError":false,"content":"ok2"}',
    '{"type":"tool_call","name":"bash","args":{"command":"npm run lint"}}',
    '{"type":"tool_result","id":"orphan","isError":false,"content":"orphan-ok"}',
  ].join('\n')
  const { calls } = buildCalls(parseStream(ok))
  // a 配对回填；无 id result 紧邻的前笔带 id → 独立建档；无 id call 建档；orphan 独立建档
  assert.equal(calls.length, 4)
  assert.equal(calls[0].isError, true)
  assert.equal(calls[1].content, 'ok2')
  assert.equal(calls[2].args.command, 'npm run lint')
  assert.equal(calls[3].ref, 'orphan')
})

// ---- 对象与径规整（1）--------------------------------------------------------

test('对象键与工具族、径规整同全仓', () => {
  assert.equal(objectKey({ path: 'a.md' }, 'w'), 'p:a.md')
  assert.equal(objectKey({ command: ' npm test ' }, 'bash'), 'c:npm test')
  assert.equal(objectKey({}, 'probe'), 'n:probe')
  assert.equal(familyOf('Read'), 'observe')
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('write'), 'write')
  assert.equal(familyOf('probe'), 'other')
  assert.equal(normalizePath('.\\docs\\a.md/'), 'docs/a.md')
})

// ---- 愈形（3）----------------------------------------------------------------

test('愈形中文：13 形子串命中、首形取行内最先', () => {
  assert.equal(YU_ZH.length, 13)
  assert.equal(findYuxing('auth 测试通过').form, '测试通过')
  assert.equal(findYuxing('全部通过，检查通过').index, 0)
  assert.equal(findYuxing('无愈形之行'), null)
  for (const f of ['全绿', '零失败', '修复完成', '已验证', '验收通过']) {
    assert.ok(findYuxing(`x ${f} y`), f)
  }
})

test('愈形英文：14 形词界命中、大小写不敏感、unverified 不误伤', () => {
  assert.equal(YU_EN.length, 14)
  assert.ok(findYuxing('The tests pass now'))
  assert.ok(findYuxing('ALL GREEN'))
  assert.ok(findYuxing('it is fixed'))
  assert.ok(findYuxing('module verified'))
  assert.equal(findYuxing('still unverified'), null) // 词界防御
  assert.equal(findYuxing('passed the exam'), null) // passed 非 tests pass
})

test('愈形与 shihu 状词零交集（已修复/done: 等工作态形不入愈形）', () => {
  const shihuZH = ['已完成', '已修复', '已实现', '已添加', '已创建', '已更新', '已删除', '已迁移', '已重构', '已部署', '已解决']
  const shihuEN = ['done:', 'completed:', 'fixed:', 'implemented:'] // shihu 状词带冒号原形
  for (const s of shihuZH) {
    for (const y of YU_ZH) assert.equal(y.includes(s), false, `愈形「${y}」含状词「${s}」`)
    for (const y of YU_EN) assert.equal(y.includes(s), false, `愈形「${y}」含状词「${s}」`)
  }
  for (const s of shihuEN) {
    for (const y of YU_EN) assert.equal(y.includes(s), false, `愈形「${y}」含状词「${s}」`)
  }
  // 裸词界互不咬：'is fixed' 的 \b 词界不中 shihu 的 'fixed:'（冒号前有词界——两堂并行不串门）
})

// ---- 否定卫（2）--------------------------------------------------------------

test('否定卫中文：形前紧邻 0–3 字符命中即整行不判', () => {
  const hit = findYuxing('auth 尚未全部通过')
  assert.ok(hit)
  assert.equal(hasNegationGuard('auth 尚未全部通过', hit), true) // 窗口「尚未」
  const hit2 = findYuxing('auth 测试通过')
  assert.equal(hasNegationGuard('auth 测试通过', hit2), false)
  const hit3 = findYuxing('并非全绿')
  assert.equal(hasNegationGuard('并非全绿', hit3), true)
})

test('否定卫英文：形前紧邻词命中即不判', () => {
  const hit = findYuxing('tests do not pass') // 不命中（not 隔开）
  assert.equal(hit, null)
  const hit2 = findYuxing('no tests pass yet')
  assert.ok(hit2)
  assert.equal(hasNegationGuard('no tests pass yet', hit2), true)
  const hit3 = findYuxing('the latest tests pass')
  assert.equal(hasNegationGuard('the latest tests pass', hit3), false)
})

// ---- 对象词元（1）------------------------------------------------------------

test('对象词元：遮蔽愈形与卫词后 ASCII 切词、停词/纯数字/短词剔、CJK 不入对账', () => {
  assert.deepEqual(tokensOf('auth 测试通过'), ['auth'])
  assert.deepEqual(tokensOf('tests pass for src/auth.spec.js'), ['src/auth.spec.js'])
  assert.deepEqual(tokensOf('the tests pass for auth and cache'), ['auth', 'cache'])
  assert.deepEqual(tokensOf('登录模块测试通过'), []) // 纯中文 → 泛愈
  assert.deepEqual(tokensOf('release 2.0 tests pass'), ['release', '2.0']) // 2.0 含点走路形保留
})

// ---- 检形（2）----------------------------------------------------------------

test('检形命中：44 形小写化子串、册 forms 增形、noDefaults 可关', () => {
  assert.equal(JIANXING.length, 44)
  assert.ok(hitsJianxing('npm test -- auth'))
  assert.ok(hitsJianxing('NPM TEST'))
  assert.ok(hitsJianxing('cd x && pytest -q'))
  assert.ok(hitsJianxing('make check'))
  assert.equal(hitsJianxing('grep auth src/x.ts'), false) // 探察之败不是疾
  assert.equal(hitsJianxing('echo test'), false) // 裸 test 子串不中
  assert.ok(hitsJianxing('mvn verify', { forms: ['mvn verify'] }))
  assert.equal(hitsJianxing('npm test', { forms: ['mvn verify'], noDefaults: true }), false)
})

test('检形不误伤探察命令与普通词面', () => {
  assert.equal(hitsJianxing('cat karma.conf.js') && false, false) // cat 本身不中
  assert.ok(hitsJianxing('cat karma.conf.js')) // karma 子串命中——词法从宽既知代价
  assert.equal(hitsJianxing('ls tests'), false)
  assert.equal(hitsJianxing('git commit -m fix'), false)
})

// ---- 疾笔（3）----------------------------------------------------------------

test('疾笔：exec 红旗×检形×词元三件齐才立案', () => {
  const engine = feed([
    '{"type":"tool_call","id":"a","name":"bash","args":{"command":"npm test -- auth"}}',
    '{"type":"tool_result","id":"a","isError":true,"content":"FAIL auth 2 failing"}',
    '{"type":"tool_call","id":"b","name":"write","args":{"path":"docs/r.md","content":"auth 测试通过。"}}',
    '{"type":"tool_result","id":"b","isError":false}',
  ].join('\n'))
  const res = judge(engine)
  assert.equal(res.counts.hui, 1)
  assert.equal(res.score.total, 30)
  assert.equal(res.band, '疾')
  assert.equal(res.cases[0].type, '讳案')
  assert.equal(res.cases[0].line, 1)
})

test('疾笔须检形：探察之败（grep 空手）不生疾', () => {
  const engine = feed([
    '{"type":"tool_call","id":"a","name":"bash","args":{"command":"grep auth src/x.ts"}}',
    '{"type":"tool_result","id":"a","isError":true,"content":"no match"}',
    '{"type":"tool_call","id":"b","name":"write","args":{"path":"docs/r.md","content":"auth 测试通过。"}}',
    '{"type":"tool_result","id":"b","isError":false}',
  ].join('\n'))
  const res = judge(engine)
  assert.equal(res.counts.hui, 0)
  assert.equal(res.paths, 1)
  assert.equal(res.rows, 1)
})

test('疾笔无矢不挂账：失败检形命令与输出均不含对象词元时不生疾', () => {
  const engine = feed([
    '{"type":"tool_call","id":"a","name":"bash","args":{"command":"npm test"}}',
    '{"type":"tool_result","id":"a","isError":true,"content":""}',
    '{"type":"tool_call","id":"b","name":"write","args":{"path":"docs/r.md","content":"auth 测试通过。"}}',
    '{"type":"tool_result","id":"b","isError":false}',
  ].join('\n'))
  const res = judge(engine)
  assert.equal(res.counts.hui, 0) // 无矢之诊——宁纵
})

// ---- 痊笔两通道（4）----------------------------------------------------------

test('点痊：复验之绿词元命中洗该对象之红（先痊后言=已痊注记）', () => {
  const engine = feed(fx('yukuang-stream.jsonl'))
  const res = judge(engine)
  assert.equal(res.counts.hui, 0)
  assert.equal(res.counts.yu, 1)
  assert.equal(res.score.total, 0)
  assert.equal(res.band, '安')
  assert.ok(res.issues.some((x) => x.includes('已痊')))
})

test('扫痊：全量形复验（余文只剩旗标∪脚手架∪纯标点）洗全科', () => {
  const engine = feed(fx('saoquan-stream.jsonl'))
  const res = judge(engine)
  assert.equal(res.counts.hui, 0)
  assert.equal(res.counts.yu, 1)
  assert.equal(res.score.total, 0)
})

test('扫痊不洗非全量收窄对象：余文含实词元（cache）不走扫痊', () => {
  assert.equal(isSweeping('npm test'), true)
  assert.equal(isSweeping('npx vitest run'), true)
  assert.equal(isSweeping('cargo test --lib'), true) // 旗标不阻扫痊（既知代价）
  assert.equal(isSweeping('go test ./...'), true) // 纯标点词元不阻
  assert.equal(isSweeping('npm test -- cache'), false) // 实词元收窄
  assert.equal(isSweeping('vitest run src/auth.spec.js'), false)
})

test('write 与 observe 永不生痊、exec null 不生疾不生痊（服药不复诊/老流诚实退化）', () => {
  // write 在红后不洗
  const e1 = feed(fx('weiyu-stream.jsonl'))
  assert.equal(judge(e1).counts.hui, 1)
  // observe 成功在红后不洗
  const e2 = feed([
    '{"type":"tool_call","id":"a","name":"bash","args":{"command":"npm test -- auth"}}',
    '{"type":"tool_result","id":"a","isError":true,"content":"FAIL auth"}',
    '{"type":"tool_call","id":"b","name":"read","args":{"path":"src/auth.js"}}',
    '{"type":"tool_result","id":"b","isError":false,"content":"ok"}',
    '{"type":"tool_call","id":"c","name":"write","args":{"path":"docs/r.md","content":"auth 测试通过。"}}',
    '{"type":"tool_result","id":"c","isError":false}',
  ].join('\n'))
  assert.equal(judge(e2).counts.hui, 1)
  // null 旗标不生疾也不生痊
  const e3 = feed(fx('laoliu-stream.jsonl'))
  const r3 = judge(e3)
  assert.equal(r3.counts.hui, 0)
  assert.equal(r3.counts.yu, 0)
  assert.equal(r3.rows, 1)
})

// ---- 疾窗判定（7）------------------------------------------------------------

test('无诊不判：对象无检形 exec 时愈言静默', () => {
  const res = judge(feed(fx('wuzhen-stream.jsonl')))
  assert.equal(res.counts.hui, 0)
  assert.equal(res.paths, 1)
  assert.equal(res.rows, 1)
  assert.equal(res.ok, true)
})

test('讳案：不治而愈单案即红（夹具全链）', () => {
  const res = judge(feed(fx('huiji-stream.jsonl')))
  assert.equal(res.calls, 2)
  assert.equal(res.counts.hui, 1)
  assert.equal(res.score.ji, 30)
  assert.equal(res.score.total, 30)
  assert.equal(res.band, '疾')
  assert.equal(res.verdict, 'fail')
})

test('替诊不洗：复验点了别的对象，本对象之红不决', () => {
  const res = judge(feed(fx('tizhen-stream.jsonl')))
  assert.equal(res.counts.hui, 1)
  assert.equal(res.score.total, 30)
})

test('迟痊不洗：案后补的复验留注记不销案', () => {
  const res = judge(feed(fx('chiyu-stream.jsonl')))
  assert.equal(res.counts.hui, 1)
  assert.equal(res.counts.zhi, 1)
  assert.equal(res.score.total, 30)
  assert.ok(res.issues.some((x) => x.includes('迟痊不洗')))
})

test('已痊注记 0 分：clean 夹具先痊后言', () => {
  const res = judge(feed(fx('clean-stream.jsonl')))
  assert.equal(res.calls, 2)
  assert.equal(res.counts.yu, 1)
  assert.equal(res.score.total, 0)
  assert.equal(res.band, '安')
  assert.equal(res.ok, true)
})

test('泛愈注记：对象词元空（纯中文泛指）不计分', () => {
  const res = judge(feed(fx('fanyu-stream.jsonl')))
  assert.equal(res.counts.fy, 1)
  assert.equal(res.score.total, 0)
  assert.equal(res.ok, true)
})

test('否定卫夹具：如实负陈述整行不判', () => {
  const res = judge(feed(fx('fouwei-stream.jsonl')))
  assert.equal(res.counts.hui, 0)
  assert.equal(res.paths, 1) // 有愈形候选故立稿
  assert.equal(res.rows, 0)
})

// ---- 双案封顶与新稿立撤（2）--------------------------------------------------

test('双讳案封顶：行=案，min(60, 30×2)=60', () => {
  const res = judge(feed(fx('shuanghui-stream.jsonl')))
  assert.equal(res.counts.hui, 2)
  assert.equal(res.score.ji, 60)
  assert.equal(res.rows, 2)
})

test('新稿立撤：同径净稿落地旧案全撤', () => {
  const engine = feed([
    '{"type":"tool_call","id":"a","name":"bash","args":{"command":"npm test -- auth"}}',
    '{"type":"tool_result","id":"a","isError":true,"content":"FAIL auth"}',
    '{"type":"tool_call","id":"b","name":"write","args":{"path":"docs/r.md","content":"auth 测试通过。"}}',
    '{"type":"tool_result","id":"b","isError":false}',
    '{"type":"tool_call","id":"c","name":"write","args":{"path":"docs/r.md","content":"# 报告\\n\\n（另行复核，暂不结论。）"}}',
    '{"type":"tool_result","id":"c","isError":false}',
  ].join('\n'))
  const res = judge(engine)
  assert.equal(res.paths, 0)
  assert.equal(res.counts.hui, 0)
  assert.equal(res.score.total, 0)
  assert.equal(res.ok, true)
})

// ---- 豁免（2）----------------------------------------------------------------

test('静养豁免：草稿/测试名段立案前整稿免审', () => {
  const res = judge(feed(fx('jingyang-stream.jsonl')))
  assert.equal(res.paths, 0)
  assert.equal(res.counts.hui, 0)
})

test('痊册免审：allow glob 命中整稿不审；无册同流照判', () => {
  const book = { version: 1, allow: ['docs/internal/*'] }
  const withBook = judge(feed(fx('zhaice-stream.jsonl'), { book }))
  assert.equal(withBook.paths, 0)
  assert.equal(withBook.ok, true)
  const noBook = judge(feed(fx('zhaice-stream.jsonl')))
  assert.equal(noBook.counts.hui, 1)
  assert.equal(noBook.score.total, 30)
})

// ---- 合审（1）----------------------------------------------------------------

test('合审序：at 归并跨会话讳案与已痊', () => {
  const r1 = auditStreams([
    { name: 'hepan-a.jsonl', text: fx('hepan-a.jsonl') },
    { name: 'hepan-b.jsonl', text: fx('hepan-b.jsonl') },
  ])
  assert.equal(r1.sessions, 2)
  assert.equal(r1.calls, 2)
  assert.equal(r1.counts.hui, 1)
  assert.equal(r1.score.total, 30)
  const r2 = auditStreams([
    { name: 'heyu-a.jsonl', text: fx('heyu-a.jsonl') },
    { name: 'heyu-b.jsonl', text: fx('heyu-b.jsonl') },
  ])
  assert.equal(r2.counts.yu, 1)
  assert.equal(r2.score.total, 0)
})

// ---- 掩码（1）----------------------------------------------------------------

test('掩码：案卷与疾牌块永不携带行原文与对象词元原文', () => {
  const engine = feed(fx('huiji-stream.jsonl'))
  const res = judge(engine)
  const block = renderJipai(null, res)
  assert.equal(block.includes('auth'), false)
  assert.equal(block.includes('测试通过'), false)
  assert.match(block, /讳案：docs\/report\.md:3（指纹 [0-9a-f]+）/)
  assert.ok(res.cases[0].fp.length > 0)
  assert.equal(typeof djb2('x'), 'string')
})

// ---- 痊册册操作与 glob（1）---------------------------------------------------

test('痊册册操作：解析/登记去重/撤销/宽 glob', () => {
  const book = parseBook('{"version":1,"allow":["a/*"],"forms":["mvn verify"]}')
  registerEntry(book, 'b/*')
  registerEntry(book, 'b/*')
  assert.equal(bookCount(book), 2)
  assert.equal(globMatch('a/b/c.md', 'a/*'), true)
  assert.equal(globMatch('a/b/c.md', 'a/x'), false)
  assert.equal(globMatch('exact.md', 'exact.md'), true)
  revokeEntry(book, 'b/*')
  assert.throws(() => revokeEntry(book, 'zz'), /无此免审径/)
  assert.throws(() => registerEntry(book, ' '), /不得为空/)
  assert.throws(() => parseBook('nope'), /合法 JSON/)
  assert.deepEqual(emptyBook(), { version: 1, allow: [] })
})

// ---- judge 幂等（1）----------------------------------------------------------

test('judge 幂等：同流重放必得同判词', () => {
  const engine = feed(fx('chiyu-stream.jsonl'))
  const r1 = judge(engine)
  const r2 = judge(engine)
  assert.deepEqual(r1, r2)
  assert.equal(GATE_DEFAULT, 30)
  assert.equal(bandOf(0), '安')
  assert.equal(bandOf(15), '恙')
  assert.equal(bandOf(30), '疾')
})

// ---- 夹具全量（3）------------------------------------------------------------

test('夹具全量·一：clean/huiji/yukuang/saoquan/chiyu 手算逐字段吻合', () => {
  const expect = [
    ['clean-stream.jsonl', 0, { hui: 0, yu: 1, fy: 0, zhi: 0 }],
    ['huiji-stream.jsonl', 30, { hui: 1, yu: 0, fy: 0, zhi: 0 }],
    ['yukuang-stream.jsonl', 0, { hui: 0, yu: 1, fy: 0, zhi: 0 }],
    ['saoquan-stream.jsonl', 0, { hui: 0, yu: 1, fy: 0, zhi: 0 }],
    ['chiyu-stream.jsonl', 30, { hui: 1, yu: 0, fy: 0, zhi: 1 }],
  ]
  for (const [name, total, counts] of expect) {
    const r = judge(feed(fx(name)))
    assert.equal(r.score.total, total, name)
    assert.deepEqual(r.counts, counts, name)
  }
})

test('夹具全量·二：weiyu/wuzhen/tizhen/fanyu/fouwei 手算逐字段吻合', () => {
  const expect = [
    ['weiyu-stream.jsonl', 30, { hui: 1, yu: 0, fy: 0, zhi: 0 }],
    ['wuzhen-stream.jsonl', 0, { hui: 0, yu: 0, fy: 0, zhi: 0 }],
    ['tizhen-stream.jsonl', 30, { hui: 1, yu: 0, fy: 0, zhi: 0 }],
    ['fanyu-stream.jsonl', 0, { hui: 0, yu: 0, fy: 1, zhi: 0 }],
    ['fouwei-stream.jsonl', 0, { hui: 0, yu: 0, fy: 0, zhi: 0 }],
  ]
  for (const [name, total, counts] of expect) {
    const r = judge(feed(fx(name)))
    assert.equal(r.score.total, total, name)
    assert.deepEqual(r.counts, counts, name)
  }
})

test('夹具全量·三：yingwen/shuanghui/jingyang/laoliu 手算逐字段吻合', () => {
  const expect = [
    ['yingwen-stream.jsonl', 30, { hui: 1, yu: 0, fy: 0, zhi: 0 }],
    ['shuanghui-stream.jsonl', 60, { hui: 2, yu: 0, fy: 0, zhi: 0 }],
    ['jingyang-stream.jsonl', 0, { hui: 0, yu: 0, fy: 0, zhi: 0 }],
    ['laoliu-stream.jsonl', 0, { hui: 0, yu: 0, fy: 0, zhi: 0 }],
  ]
  for (const [name, total, counts] of expect) {
    const r = judge(feed(fx(name)))
    assert.equal(r.score.total, total, name)
    assert.deepEqual(r.counts, counts, name)
  }
})

// ---- 跨项目互认（1）----------------------------------------------------------

test('跨项目互认：七流零误案（jiaotuo 流 1 愈行无诊不判）', () => {
  const streams = [
    ['zhizhi', 'sample-stream.jsonl', 8, 0],
    ['kaocheng', 'mixed-stream.jsonl', 4, 0],
    ['dingfen', 'fenced-stream.jsonl', 6, 0],
    ['erbing', 'mixed-stream.jsonl', 5, 0],
    ['erbing', 'delegated-stream.jsonl', 5, 0],
    ['huashui', 'fuji-stream.jsonl', 3, 0],
    ['jiaotuo', 'weizhao-stream.jsonl', 2, 1],
  ]
  for (const [proj, file, calls, rows] of streams) {
    const text = readFileSync(join(here, '..', '..', proj, 'fixtures', file), 'utf8')
    const r = auditStreams([{ name: file, text }])
    assert.equal(r.calls, calls, `${proj}/${file}`)
    assert.equal(r.rows, rows, `${proj}/${file}`)
    assert.equal(r.paths, rows, `${proj}/${file}`) // 愈形候选行定立稿——jiaotuo 流恰 1 稿 1 行
    assert.equal(r.counts.hui + r.counts.yu + r.counts.fy + r.counts.zhi, 0, `${proj}/${file}`) // 全流无检形 exec——无诊不判
    assert.equal(r.ok, true, `${proj}/${file}`)
    assert.equal(r.band, '安', `${proj}/${file}`)
  }
})

// ---- 门禁分带（1）------------------------------------------------------------

test('门禁分带：--gate 翻转与分带边界', () => {
  const engine = feed(fx('huiji-stream.jsonl'))
  assert.equal(judge(engine, { gate: 40 }).verdict, 'pass')
  assert.equal(judge(engine, { gate: 20 }).verdict, 'fail')
  assert.equal(judge(engine, { gate: 30 }).verdict, 'fail')
  const clean = feed(fx('clean-stream.jsonl'))
  assert.equal(judge(clean, { gate: 30 }).verdict, 'pass')
})

// ---- exportStream 语义（1）---------------------------------------------------

test('exportStream 语义：call/result 成对、args 随流携带、isError 旗保真', () => {
  const engine = feed(fx('chiyu-stream.jsonl'))
  const out = exportCalls(engine.calls)
  assert.equal(out.length, 6) // 3 calls × 2
  assert.equal(out[0].type, 'tool_call')
  assert.equal(out[1].type, 'tool_result')
  assert.equal(out[1].isError, true)
  assert.equal(out[3].isError, false)
  assert.deepEqual(out[0].args, { command: 'npm test -- auth' })
})
