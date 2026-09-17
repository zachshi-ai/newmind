/**
 * 核心判定语义测试 —— 断言恰好该分值与案名行号（docs/04 A1 锁死）。
 * 全部用例与夹具先行落盘的手算期望对表：实现与手算冲突时只能改实现。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath } from '../src/core/object.js'
import {
  claimsOf, isListLine, isTableLine, scanBlock, collectList, collectTableLines,
  parseTable, claimTableRows, parseIntCell, isTotalRow, calOk, normLabel, djb2,
} from '../src/core/shuyan.js'
import { emptyBook, parseBook, registerEntry, revokeEntry, serializeBook, bookCount, globMatch } from '../src/core/xiance.js'
import { createEngine, recordCall, judge, bandOf, GATE_DEFAULT, auditContent } from '../src/core/xiuzhang.js'
import { renderXiapai } from '../src/core/xiapai.js'
import { auditStreams } from '../src/core/audit.js'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8')

/** 便捷挂载：把 (name, args, isError, content) 逐笔记入引擎。 */
function feed(engine, rows) {
  for (const r of rows) recordCall(engine, r)
  return engine
}
const write = (path, content, isError = false) => ({ name: 'write', args: { path, content }, isError })
const read = (path, content, isError = false) => ({ name: 'read', args: { path }, isError, content })
const exec = (command, isError = false) => ({ name: 'bash', args: { command }, isError })

test('流解析：#注释跳过、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call', () => {
  const ok = parseStream('{"type":"tool_call","id":"a","name":"write"}\n# 注释\n{"type":"tool_call","id":"b","name":"read"}\n')
  assert.equal(ok.length, 2)
  assert.throws(() => parseStream('{"ok":1}\n{bad}'), /第 2 行不是合法 JSON/)
  const { calls } = buildCalls(parseStream(fx('guailie-stream.jsonl')))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
  assert.ok(calls[0].args.content.includes('共 5 项'))
  const orphan = buildCalls(parseStream('{"type":"tool_result","id":"x","isError":true}'))
  assert.equal(orphan.calls.length, 1) // 孤儿 result 独立建档
  const legacy = buildCalls(parseStream('{"type":"tool_call","name":"write"}\n{"type":"tool_result","isError":false,"content":"c"}'))
  assert.equal(legacy.calls.length, 1)
  assert.equal(legacy.calls[0].content, 'c') // 无 id result 并入紧邻 call
})

test('对象键与工具族：p:/c:/n: 三类键、observe/write/exec/other 四族、径规整', () => {
  assert.equal(objectKey({ path: 'a.md' }, 'write'), 'p:a.md')
  assert.equal(objectKey({ command: ' npm test ' }, 'bash'), 'c:npm test')
  assert.equal(objectKey({}, 'ask'), 'n:ask')
  assert.equal(familyOf('Read'), 'observe')
  assert.equal(familyOf('notebook-edit'), 'write')
  assert.equal(familyOf('Bash'), 'exec')
  assert.equal(familyOf('ask'), 'other')
  assert.equal(normalizePath('.\\a\\b/'), 'a/b')
})

test('数言词法中文：方向词三档、量词、N≥2 门槛', () => {
  assert.deepEqual(claimsOf('本次共 5 项：').map((c) => [c.dir, c.n]), [['any', 5]])
  assert.equal(claimsOf('以下 3 步：')[0].dir, 'down')
  assert.equal(claimsOf('前述 3 步已排定')[0].dir, 'up')
  assert.deepEqual(claimsOf('共 1 项：'), []) // N=1 不成言
  assert.deepEqual(claimsOf('共五项修复'), []) // 中文数字不判
  assert.deepEqual(claimsOf('重构了内部实现'), [])
  assert.equal(claimsOf('共 3 个问题，合计 2 条备注').length, 2) // 一行多言（「另有 2 条」无方向词不成言）
})

test('数言词法中文：非列非表行才生言（列内子数是引擎侧豁免——词法层照提、引擎侧不判）', () => {
  assert.equal(claimsOf('- 修复共 3 处空指针').length, 1) // 词法层照提——列行过滤在引擎
  assert.equal(claimsOf('## 共 5 项风险').length, 1) // 标题行生言
  const e = createEngine()
  feed(e, [write('docs/r.md', '- 修复共 3 处空指针\n- 补回归测试\n- 更新文档\n')])
  assert.deepEqual(judge(e).counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 }) // 引擎侧：列行不生言（条目子账不是卷面结构声明）
  const e2 = createEngine()
  feed(e2, [write('docs/t.md', '| 项目 | 数 |\n|---|---|\n| 合计 | 3 项 |\n')])
  assert.deepEqual(judge(e2).counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 }) // 引擎侧：表行不生言
})

test('数言词法英文：方向形与冒号形、跨形去重、词界、大小写', () => {
  const a = claimsOf('The following 3 items were fixed:')
  assert.equal(a.length, 1)
  assert.equal(a[0].dir, 'down')
  assert.equal(claimsOf('Above 4 points')[0].dir, 'up')
  assert.equal(claimsOf('Total: 5 findings')[0].dir, 'any')
  assert.equal(claimsOf('3 bugs:')[0].dir, 'any') // 冒号形
  assert.deepEqual(claimsOf('We ship 3 modules every week'), []) // 无方向词无冒号不判
  assert.deepEqual(claimsOf('about 3 items later'), []) // 词界：about 不中 above 亦不生冒号形
  assert.equal(claimsOf('The FOLLOWING 3 items:').length, 1) // 大小写不敏感
  assert.deepEqual(claimsOf('we fixed 3 itemsX today'), []) // 词界：item 不中 itemsX
})

test('列块扫描：向下/向上/无向先下后上、gap ≤ 2、空行透明', () => {
  const lines = ['共 2 项：', '', '## 清单', '', '- 甲', '- 乙']
  const blk = scanBlock(lines, 0, 1)
  assert.equal(blk.start, 4) // heading gap 1、空行透明
  assert.equal(collectList(lines, blk.start), 2)
  const up = ['1. 甲', '2. 乙', '3. 丙', '', '前述 3 步已排定']
  const ublk = scanBlock(up, 4, -1)
  assert.equal(ublk.start, 2) // 向上命中的是块底
  assert.equal(collectList(up, 2), 1) // 收集只向前数——到连绵块顶是引擎职责（zhenglie 夹具回归）
  const any = ['共 1 项：', '- 惟一']
  assert.deepEqual(scanBlock(any, 0, 1) && 1, 1) // 有块即认
  const none = ['共 3 项：', '段落一', '段落二', '段落三', '段落四', '- 甲']
  assert.equal(scanBlock(none, 0, 1), null) // gap 3 > 2 不认块
})

test('表块识别与列实：有效形、无效形、数据行数去表头与合计', () => {
  const good = ['| 项目 | 金额 |', '|---|---|', '| 服务器 | 40 |', '| 合计 | 100 |']
  const t = parseTable(good.map((text, i) => ({ text, no: i + 1 })))
  assert.equal(t.valid, true)
  assert.equal(t.skip, false)
  assert.equal(t.dataRows.length, 1)
  assert.equal(t.total.cells[1], '100')
  const bad = ['| 项目 | 金额 |', '| 服务器 | 40 |']
  assert.equal(parseTable(bad.map((text, i) => ({ text, no: i + 1 }))).valid, false) // 无分隔行
  const multi = ['| 项 | 值 |', '|---|---|', '| 甲 | 10 |', '| 合计 | 10 |', '| 乙 | 5 |', '| 合计 | 5 |']
  const tm = parseTable(multi.map((text, i) => ({ text, no: i + 1 })))
  assert.equal(tm.valid, true)
  assert.equal(tm.skip, true) // 合计行 2 → 整表跳过
  assert.equal(isListLine('1. 备份数据'), true)
  assert.equal(isListLine('- [ ] 待办'), true)
  assert.equal(isListLine('普通行'), false)
  assert.equal(isTableLine('  | 表行'), true)
})

test('表账解析：合计行识别、整数格剥离、小数格非整数', () => {
  assert.equal(isTotalRow(['合计', '100']), true)
  assert.equal(isTotalRow(['总计:', '100']), true)
  assert.equal(isTotalRow(['Total', '100']), true)
  assert.equal(isTotalRow(['服务器', '40']), false)
  assert.equal(parseIntCell('1,234'), 1234)
  assert.equal(parseIntCell('40%'), 40)
  assert.equal(parseIntCell('¥120'), 120)
  assert.equal(parseIntCell('-5'), -5)
  assert.equal(parseIntCell('33.3'), null)
  assert.equal(parseIntCell(''), null)
  assert.equal(calOk('2026-09-05'), true)
  assert.equal(calOk('2026-13-01'), false)
  assert.equal(calOk('2026-09-32'), false)
  assert.equal(normLabel('Total:'), 'total')
  assert.equal(djb2('abc'), djb2('abc'))
  assert.notEqual(djb2('abc'), djb2('abd'))
})

test('倒期词法：至/到/~/to/through、词界、相等不判、列行表行皆判', () => {
  const r1 = auditContent('开发：2026-09-10 至 2026-09-05。')
  assert.equal(r1.cases.length, 1)
  assert.equal(r1.cases[0].type, '倒期')
  assert.equal(auditContent('评审：2026-09-01 到 2026-09-09。').cases.length, 0)
  assert.equal(auditContent('联调：2026-09-20 ~ 2026-09-25。').cases.length, 0)
  assert.equal(auditContent('ship: 2026-10-01 to 2026-09-28').cases.length, 1)
  assert.equal(auditContent('hold: 2026-11-02 THROUGH 2026-10-30').cases.length, 1) // 大小写不敏感
  assert.equal(auditContent('auto 2026-10-01 2026-09-28').cases.length, 0) // 无连接词不判
  assert.equal(auditContent('平：2026-09-05 至 2026-09-05。').cases.length, 0) // 相等不判
  assert.equal(auditContent('怪：2026-13-40 至 2026-01-01。').cases.length, 0) // 历法门
  const r2 = auditContent('- 评审：2026-10-01 至 2026-09-28\n') // 列行受审
  assert.equal(r2.cases.length, 1)
})

test('通道：瑕账只收写——observe/exec/other 永不受审、isError true 不入、null 按已发生', () => {
  const e = createEngine()
  feed(e, [read('docs/r.md', '共 5 项：\n- 甲\n'), exec('echo "共 5 项：\\n- 甲"', false), { name: 'ask', args: { q: '共 5 项：' } }])
  assert.equal(judge(e).paths, 0)
  assert.equal(judge(e).counts.gl, 0)
  const e2 = createEngine()
  feed(e2, [write('docs/r.md', '共 5 项：\n- 甲\n', true)])
  assert.equal(judge(e2).paths, 0) // 失败之写不入账
  const e3 = createEngine()
  feed(e3, [{ name: 'write', args: { path: 'docs/r.md', content: '共 5 项：\n- 甲\n' }, isError: null }])
  assert.equal(judge(e3).counts.gl, 1) // 老流按已发生
  const e4 = createEngine()
  feed(e4, [write('docs/r.md', null), write('docs/r.md', '')])
  assert.equal(judge(e4).paths, 0) // 无稿可审
})

test('末稿立撤：先瑕后磨已磨注记、先净后瑕照立、两稿皆瑕换案不叠加', () => {
  const e = createEngine()
  feed(e, [write('docs/r.md', '共 5 项：\n- 甲\n- 乙\n'), write('docs/r.md', '共 2 项：\n- 甲\n- 乙\n')])
  const r = judge(e)
  assert.equal(r.counts.gl, 0)
  assert.equal(r.counts.mo, 1)
  assert.equal(r.rows, 3) // rows 只算末稿
  const e2 = createEngine()
  feed(e2, [write('docs/r.md', '共 2 项：\n- 甲\n- 乙\n'), write('docs/r.md', '共 5 项：\n- 甲\n')])
  const r2 = judge(e2)
  assert.equal(r2.counts.gl, 1) // 先净后瑕照立
  assert.equal(r2.counts.mo, 0)
  const e3 = createEngine()
  feed(e3, [write('docs/r.md', '共 5 项：\n- 甲\n'), write('docs/r.md', '共 9 项：\n- 甲\n- 乙\n')])
  const r3 = judge(e3)
  assert.equal(r3.counts.gl, 1) // 新案换旧案
  assert.equal(r3.cases[0].said, 9)
})

test('豁免：瑕册 glob 整径不审不记、试场名段立案前豁免、目录段在径首亦算', () => {
  const book = parseBook(JSON.stringify({ excuse: ['docs/reports/*'] }))
  const e = createEngine({ book })
  feed(e, [write('docs/reports/audit.md', '共 5 项：\n- 甲\n')])
  assert.equal(judge(e).paths, 0)
  assert.ok(book && globMatch('docs/reports/a.md', 'docs/reports/*'))
  assert.ok(!globMatch('docs/other/a.md', 'docs/reports/*'))
  const e2 = createEngine()
  feed(e2, [write('tests/fixtures/handoff.md', '共 5 项：\n- 甲\n'), write('pkg/src/a.test.js', '共 5 项：\n- 甲\n')])
  assert.equal(judge(e2).paths, 0) // 试场豁免
  assert.throws(() => parseBook('not json'), /瑕册不是合法 JSON/)
  assert.throws(() => parseBook('[]'), /瑕册须为对象/)
})

test('判定序：无数言无表无日期静默（全净行）、乖列双向', () => {
  const e = createEngine()
  feed(e, [write('docs/a.md', '普通的一稿。\n第二行也寻常。\n')])
  const r = judge(e)
  assert.deepEqual(r.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 })
  assert.equal(r.rows, 2)
  assert.match(r.issues[0], /卷皆净 ×1 径 2 行/)
  const e2 = createEngine()
  feed(e2, [write('docs/b.md', '共 5 项：\n- 甲\n- 乙\n- 丙\n')])
  assert.equal(judge(e2).counts.gl, 1) // 言 5 实 3
  const e3 = createEngine()
  feed(e3, [write('docs/c.md', '共 2 项：\n- 甲\n- 乙\n- 丙\n- 丁\n')])
  const r3 = judge(e3)
  assert.equal(r3.counts.gl, 1) // 言 2 实 4（双向皆乖）
  assert.equal(r3.cases[0].act, 4)
})

test('表账独立于数言：无声表格照判乖总、合计行案号、整数列剥离', () => {
  const e = createEngine()
  feed(e, [write('docs/budget.md', '## 支出表\n\n| 项目 | 金额 |\n|---|---|\n| 服务器 | 1,040 |\n| 带宽 | 30 |\n| 人力 | 20 |\n| 合计 | 100 |\n')])
  const r = judge(e)
  assert.equal(r.counts.gz, 1) // 1040+30+20=1090 ≠ 100（千分位剥离后照加）
  assert.equal(r.score.zong, 30)
  const e2 = createEngine()
  feed(e2, [write('docs/b.md', '| 项目 | 金额 |\n|---|---|\n| 甲 | 40 |\n| 乙 | 60 |\n| 合计 | 100 |\n')])
  assert.equal(judge(e2).counts.gz, 0) // 相敷清白
})

test('三形并行案案独立：阙列不咬门、乖列与倒期同稿并出', () => {
  const e = createEngine()
  feed(e, [write('docs/mix.md', '共 5 项：\n\n排期：2026-09-10 至 2026-09-05。\n')])
  const r = judge(e)
  assert.equal(r.counts.gl, 0)
  assert.equal(r.counts.que, 1) // 言 5 无近列 → 阙列注记（不判分）
  assert.equal(r.counts.dq, 1)
  assert.equal(r.score.total, 15) // 只有倒期
  const e2 = createEngine()
  feed(e2, [write('docs/mix2.md', '共 3 项：\n- 甲\n- 乙\n\n排期：2026-09-10 至 2026-09-05。\n')])
  const r2 = judge(e2)
  assert.equal(r2.counts.gl, 1)
  assert.equal(r2.counts.dq, 1)
  assert.equal(r2.score.total, 45) // 30 + 15
  assert.equal(r2.band, '疵')
})

test('数言指表块：共 N 项 + 表格数据行（去表头与合计）', () => {
  const e = createEngine()
  feed(e, [write('docs/r.md', '风险共 3 项：\n\n| 风险 | 等级 |\n|---|---|\n| 甲 | 高 |\n| 乙 | 中 |\n| 丙 | 低 |\n')])
  assert.equal(judge(e).counts.gl, 0) // 言 3 实 3（数据行）
  const e2 = createEngine()
  feed(e2, [write('docs/r2.md', '风险共 2 项：\n\n| 风险 | 等级 |\n|---|---|\n| 甲 | 高 |\n| 乙 | 中 |\n| 丙 | 低 |\n')])
  assert.equal(judge(e2).counts.gl, 1) // 言 2 实 3
})

test('瑕值门禁：cap 60/40、分带边界、门 30', () => {
  const e = createEngine()
  feed(e, [
    write('docs/a.md', '共 5 项：\n- 甲\n'),
    write('docs/b.md', '共 5 项：\n- 甲\n'),
    write('docs/c.md', '共 5 项：\n- 甲\n'),
  ])
  const r = judge(e)
  assert.equal(r.counts.gl, 3)
  assert.equal(r.score.lie, 60) // cap 60
  const e2 = createEngine()
  feed(e2, [write('docs/d.md', '一：2026-10-01 至 2026-09-01。\n二：2026-10-02 至 2026-09-02。\n三：2026-10-03 至 2026-09-03。\n')])
  const r2 = judge(e2)
  assert.equal(r2.counts.dq, 3)
  assert.equal(r2.score.dao, 40) // cap 40
  assert.equal(r2.score.total, 40)
  assert.equal(bandOf(0), '净')
  assert.equal(bandOf(14), '净')
  assert.equal(bandOf(15), '瑕')
  assert.equal(bandOf(29), '瑕')
  assert.equal(bandOf(30), '疵')
  assert.equal(GATE_DEFAULT, 30)
})

test('judge 幂等：同引擎多次 judge 同判词、gate 覆写只改裁决不改分', () => {
  const e = createEngine()
  feed(e, [write('docs/r.md', '共 5 项：\n- 甲\n- 乙\n')])
  const a = judge(e)
  const b = judge(e)
  assert.deepEqual(a.counts, b.counts)
  assert.deepEqual(a.score, b.score)
  const g = judge(e, { gate: 40 })
  assert.equal(g.score.total, 30)
  assert.equal(g.verdict, 'pass') // 30 < 40 过门
  const g2 = judge(e, { gate: 10 })
  assert.equal(g2.verdict, 'fail') // 30 ≥ 10 翻红
})

test('issues 排序：乖列 → 乖总 → 倒期 → 注记两档 → 全净行', () => {
  const e = createEngine()
  feed(e, [
    write('docs/a.md', '共 5 项：\n- 甲\n- 乙\n'), // 言5实2 乖列
    write('docs/b.md', '| 项 | 值 |\n|---|---|\n| 甲 | 10 |\n| 合计 | 99 |\n'), // 乖总
    write('docs/c.md', '期：2026-10-01 至 2026-09-01。\n'), // 倒期
  ])
  const r = judge(e)
  const kinds = r.issues.map((s) => s.slice(0, 2))
  assert.deepEqual(kinds, ['乖列', '乖总', '倒期'])
  const e2 = createEngine()
  feed(e2, [write('docs/d.md', '共 3 个遗留。\n散文一段。\n')])
  const r2 = judge(e2)
  assert.match(r2.issues[0], /注记：docs\/d\.md:1 阙列（言 3 无近列）/)
  const e3 = createEngine()
  feed(e3, [write('docs/r.md', '共 5 项：\n- 甲\n'), write('docs/r.md', '共 2 项：\n- 甲\n- 乙\n')])
  assert.match(judge(e3).issues[0], /注记：docs\/r\.md 已磨（先瑕今净）/)
})

test('乖总点名格式与掩码：载列次言和指纹、不携带行原文', () => {
  const e = createEngine()
  feed(e, [write('docs/b.md', '| 项目 | 金额 |\n|---|---|\n| 服务器 | 40 |\n| 合计 | 100 |\n')])
  const r = judge(e)
  assert.match(r.issues[0], /乖总：docs\/b\.md:4 表第 2 列 言 100 和 40（指纹 [0-9a-f]+）/)
  assert.ok(!r.issues[0].includes('服务器')) // 行原文不进判词
})

test('瑕牌块：逐字节确定、无册确定性文本、不含行原文', () => {
  const book = parseBook(JSON.stringify({ excuse: ['docs/reports/*'] }))
  const e = createEngine({ book })
  feed(e, [write('docs/r.md', '共 5 项：\n- 甲\n- 乙\n')])
  const judged = judge(e)
  const a = renderXiapai(book, judged)
  const b = renderXiapai(book, judged)
  assert.equal(a, b)
  assert.match(a, /【指瑕 · 瑕牌】/)
  assert.match(a, /瑕册：免审 1 处（docs\/reports\/\*）/)
  assert.ok(a.includes('共 5 项') === false) // 行原文不进瑕牌
  const none = renderXiapai(null, judge(createEngine()))
  assert.match(none, /瑕册：未立（凡卷皆审）/)
})

test('瑕册：解析、register 去重、revoke 无径抛错、序列化往返', () => {
  const b = emptyBook()
  registerEntry(b, 'docs/reports/*')
  registerEntry(b, 'docs/reports/*') // 去重
  assert.equal(bookCount(b), 1)
  assert.throws(() => revokeEntry(b, 'nope/*'), /瑕册无此免审径/)
  revokeEntry(b, 'docs/reports/*')
  assert.equal(bookCount(b), 0)
  const parsed = parseBook(serializeBook(b))
  assert.equal(parsed.version, 1)
})

test('合审序：at 全有数按 (at,流序,流内序) 归并；缺 at 按参序拼接', () => {
  const res = auditStreams([
    { name: 'b.jsonl', text: fx('clean-stream.jsonl') },
    { name: 'a.jsonl', text: fx('guailie-stream.jsonl') },
  ])
  // guailie at 100 在前、clean at 100 同刻按流序 b 先——但 guailie 的写 at 100 < clean at 100? 皆 100 → 流序 b(clean) 先
  assert.equal(res.calls, 2)
  assert.equal(res.counts.gl, 1)
  assert.equal(res.score.total, 30)
  assert.equal(res.verdict, 'fail')
  const legacy = auditStreams([
    { name: 'x.jsonl', text: '{"type":"tool_call","name":"write","args":{"path":"d.md","content":"共 5 项：\\n- 甲\\n"}}\n{"type":"tool_result","isError":false}\n' },
    { name: 'y.jsonl', text: '{"type":"tool_call","name":"write","args":{"path":"e.md","content":"寻常稿。"}}\n{"type":"tool_result","isError":false}\n' },
  ])
  assert.equal(legacy.calls, 2) // 缺 at 按参序拼接照判
  assert.equal(legacy.counts.gl, 1)
})

test('跨会话：乙会话的同径续写撤换甲会话之案（合审即全库）', () => {
  const res = auditStreams([
    { name: 'w1.jsonl', text: fx('guailie-stream.jsonl') },
    { name: 'w2.jsonl', text: fx('xianmo-stream.jsonl') },
  ])
  // w1 立乖列（docs/report.md），w2 前稿又瑕、后稿改净——末稿归 w2，已磨
  assert.equal(res.calls, 3)
  assert.equal(res.counts.gl, 0)
  assert.equal(res.counts.mo, 1)
  assert.equal(res.verdict, 'pass')
})

test('夹具全量：A2 手算逐字吻合（十七流 + 合审 + gate 口径）', () => {
  const book = parseBook(fx('zhixia-book.json'))
  const caseOf = (file, useBook = true) =>
    auditStreams([{ name: file, text: fx(file) }], useBook ? { book } : {})
  const c1 = caseOf('clean-stream.jsonl', false)
  assert.deepEqual(c1.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 })
  assert.equal(c1.band, '净')
  const c2 = caseOf('guailie-stream.jsonl', false)
  assert.equal(c2.counts.gl, 1); assert.equal(c2.score.total, 30); assert.equal(c2.verdict, 'fail')
  const c3 = caseOf('shuangli-stream.jsonl', false)
  assert.equal(c3.counts.gl, 2); assert.equal(c3.score.lie, 60)
  const c4 = caseOf('zhenglie-stream.jsonl', false)
  assert.deepEqual(c4.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 })
  const c5 = caseOf('guaizong-stream.jsonl', false)
  assert.equal(c5.counts.gz, 1); assert.equal(c5.score.total, 30); assert.equal(c5.verdict, 'fail')
  const c6 = caseOf('hezong-stream.jsonl', false)
  assert.equal(c6.counts.gz, 0); assert.equal(c6.score.total, 0)
  const c7 = caseOf('xiaoshu-stream.jsonl', false)
  assert.deepEqual(c7.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 })
  const c8 = caseOf('duohe-stream.jsonl', false)
  assert.deepEqual(c8.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 })
  const c9 = caseOf('daoqi-stream.jsonl', false)
  assert.equal(c9.counts.dq, 1); assert.equal(c9.score.total, 15); assert.equal(c9.band, '瑕'); assert.equal(c9.verdict, 'pass')
  const c10 = caseOf('shuangdao-stream.jsonl', false)
  assert.equal(c10.counts.dq, 2); assert.equal(c10.score.dao, 30); assert.equal(c10.verdict, 'fail')
  const c11 = caseOf('quelie-stream.jsonl', false)
  assert.equal(c11.counts.que, 1); assert.equal(c11.score.total, 0)
  const c12 = caseOf('mianze-stream.jsonl', true)
  assert.equal(c12.paths, 0); assert.equal(c12.counts.gl, 0)
  const c12b = caseOf('mianze-stream.jsonl', false)
  assert.equal(c12b.counts.gl, 1); assert.equal(c12b.verdict, 'fail')
  const c13 = caseOf('xiaochang-stream.jsonl', false)
  assert.equal(c13.paths, 0); assert.equal(c13.counts.gl, 0)
  const c14 = caseOf('xianmo-stream.jsonl', false)
  assert.equal(c14.calls, 2); assert.equal(c14.counts.mo, 1); assert.equal(c14.counts.gl, 0)
  const c15 = caseOf('baishi-stream.jsonl', false)
  assert.deepEqual(c15.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 }); assert.equal(c15.paths, 0)
  const c16 = caseOf('yingwen-stream.jsonl', false)
  assert.equal(c16.counts.gl, 1); assert.equal(c16.verdict, 'fail')
  const c17 = caseOf('gelie-stream.jsonl', false)
  assert.deepEqual(c17.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 })
  const c18 = auditStreams([
    { name: 'guailie-stream.jsonl', text: fx('guailie-stream.jsonl') },
    { name: 'clean-stream.jsonl', text: fx('clean-stream.jsonl') },
  ])
  assert.equal(c18.calls, 2); assert.equal(c18.counts.gl, 1); assert.equal(c18.score.total, 30)
})

test('跨项目互认：七流零误伤（同格式流可审、互不误伤）', () => {
  const cross = (root, file, calls) => {
    const text = readFileSync(join(here, '..', '..', root, 'fixtures', file), 'utf8')
    const r = auditStreams([{ name: file, text }])
    assert.equal(r.calls, calls, `${root}/${file}`)
    assert.deepEqual(r.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 }, `${root}/${file}`)
    assert.equal(r.verdict, 'pass')
  }
  cross('zhizhi', 'sample-stream.jsonl', 8)
  cross('kaocheng', 'mixed-stream.jsonl', 4)
  cross('dingfen', 'fenced-stream.jsonl', 6)
  cross('erbing', 'mixed-stream.jsonl', 5)
  cross('erbing', 'delegated-stream.jsonl', 5)
  cross('huashui', 'fuji-stream.jsonl', 3)
  cross('jiaotuo', 'weizhao-stream.jsonl', 2)
})

function buildJsonl(rows) {
  return rows.map((r, i) => {
    const id = `c${i + 1}`
    const call = { type: 'tool_call', id, name: r.name, args: r.args }
    const result = { type: 'tool_result', id, name: r.name, isError: r.isError === true }
    if (r.content) result.content = r.content
    return JSON.stringify(call) + '\n' + JSON.stringify(result)
  }).join('\n')
}

test('exec 与 observe 不入账的跨项目对照：内容带数言也不判', () => {
  const e = createEngine()
  feed(e, [exec('git commit -m "fix: resolve 5 issues (see list below)"')])
  assert.equal(judge(e).paths, 0) // exec 不受审——命令行无稿面结构
  const e2 = createEngine()
  feed(e2, [read('report.md', '本次共 5 项：\n- 甲\n- 乙\n')])
  assert.equal(judge(e2).paths, 0) // 观察不是落卷
})

test('collectTableLines 与 collectList 的空行透明、runTop 连绵到顶', () => {
  const lines = ['- 甲', '', '- 乙', '中断段', '- 丙']
  assert.equal(collectList(lines, 0), 2) // 空行透明、遇中断段止
  assert.equal(collectTableLines(lines, 3).length, 0)
  const tbl = ['| a | b |', '', '|---|---|', '| 1 | 2 |']
  assert.equal(collectTableLines(tbl, 0).length, 3) // 空行透明收表
})

test('claimTableRows：无效形 null、合计行悉数不计、多合计照数', () => {
  const good = ['| 风险 | 等级 |', '|---|---|', '| 甲 | 高 |', '| 乙 | 中 |', '| 丙 | 低 |'].map((text, i) => ({ text, no: i + 1 }))
  assert.equal(claimTableRows(good), 3)
  const multiTotal = ['| 项 | 值 |', '|---|---|', '| 甲 | 10 |', '| 合计 | 10 |', '| 乙 | 5 |', '| 合计 | 5 |'].map((text, i) => ({ text, no: i + 1 }))
  assert.equal(claimTableRows(multiTotal), 2) // 合计行悉数不计（不问合计行数）
  const noSep = ['| a | b |', '| 1 | 2 |'].map((text, i) => ({ text, no: i + 1 }))
  assert.equal(claimTableRows(noSep), null)
  const ragged = ['| a | b |', '|---|---|', '| 1 |'].map((text, i) => ({ text, no: i + 1 }))
  assert.equal(claimTableRows(ragged), null) // 行列不齐
})

test('无向数言先下后上：下方无块上方认块', () => {
  const e = createEngine()
  feed(e, [write('docs/r.md', '- 甲\n- 乙\n- 丙\n\n合计 3 项,如上所列。\n')])
  const r = judge(e)
  assert.equal(r.counts.gl, 0) // 下方无块 → 上方认块 言3实3
  const e2 = createEngine()
  feed(e2, [write('docs/r2.md', '- 甲\n- 乙\n\n合计 3 项,如上所列。\n')])
  const r2 = judge(e2)
  assert.equal(r2.counts.gl, 1) // 言 3 实 2
})

test('gap 计数只算非空非列非表行：标题不挤掉块', () => {
  const e = createEngine()
  feed(e, [write('docs/r.md', '共 2 项：\n\n## 详单\n\n### 子目\n\n- 甲\n- 乙\n')])
  const r = judge(e)
  assert.deepEqual(r.counts, { gl: 0, gz: 0, dq: 0, que: 0, mo: 0 }) // gap 2（两个 heading）仍认块，言 2 实 2 清白
  const e2 = createEngine()
  feed(e2, [write('docs/r2.md', '共 2 项：\n\n## 详单\n\n### 子目\n\n#### 又一层\n\n- 甲\n- 乙\n')])
  const r2 = judge(e2)
  assert.equal(r2.counts.que, 1) // gap 3 > 2 不认块 → 阙列
})
