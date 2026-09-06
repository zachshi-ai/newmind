/**
 * 核心判定语义测试 —— 期望值先于实现手算定死（docs/03 §10），实现与手算冲突只能改实现。
 * 覆盖：流解析 / 对象键与径规整 / 残见判定序（偏窗·限窗·认尾残记·无据之见）/
 * 盲动判定序（先查账后记自书·补览·自书为览）/ 碎览（不双罚）/ 分值分带门 / 豁免 / 会话分账 / 账实一致。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath, countLines } from '../src/core/object.js'
import { createEngine, recordCall, judge, bandOf, GATE_DEFAULT } from '../src/core/caizhang.js'
import { crawlOf } from '../src/core/caizhang.js'
import { DEFAULT_MARKERS, DEFAULT_CAP_FIELDS, DEFAULT_OFFSET_FIELDS, parseBook, emptyBook } from '../src/core/caice.js'

// ---------------------------------------------------------------- helpers

const L = (tag, n) => Array.from({ length: n }, (_, i) => `${tag} line ${i + 1}`).join('\n')

function engine(book = null) {
  return createEngine({ book })
}

function feed(e, session, name, args, { isError = false, content = null, ref = null } = {}) {
  return recordCall(e, { session, ref, name, args, isError, content })
}

const read = (e, session, path, { content, limit, offset, isError } = {}) =>
  feed(e, session, 'read', { path, ...(limit != null ? { limit } : {}), ...(offset != null ? { offset } : {}) }, { content, isError })

const edit = (e, session, path, { content = 'x', isError } = {}) =>
  feed(e, session, 'edit', { path, content }, { isError })

// ---------------------------------------------------------------- 流解析

test('流解析：# 注释与空行跳过', () => {
  const events = parseStream('# 头注释\n\n{"type":"tool_call","id":"c1","name":"read","args":{"path":"a.js"}}\n')
  assert.equal(events.length, 1)
})

test('流解析：坏行报行号', () => {
  assert.throws(() => parseStream('{"type":"tool_call"}\n不是 JSON\n'), /第 2 行/)
})

test('流解析：id 配对回填 isError 与 content', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"c1","name":"read","args":{"path":"a.js"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false,"content":"正文"}\n',
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
  assert.equal(calls[0].content, '正文')
})

test('流解析：无 id result 并入紧邻其前的 call', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","name":"read","args":{"path":"a.js"}}\n' +
    '{"type":"tool_result","isError":true}\n',
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('流解析：孤儿 result 独立建档', () => {
  const { calls } = buildCalls(parseStream('{"type":"tool_result","id":"zz","isError":false}\n'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].ref, 'zz')
})

// ---------------------------------------------------------------- 对象键与径规整

test('对象键三级回退：p: → c: → n:', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'read'), 'p:a.js')
  assert.equal(objectKey({ file_path: 'b.ts' }, 'read'), 'p:b.ts')
  assert.equal(objectKey({ command: ' ls -l ' }, 'bash'), 'c:ls -l')
  assert.equal(objectKey({}, 'weird'), 'n:weird')
})

test('径规整：./ 前缀、尾斜杠、反斜杠归一', () => {
  assert.equal(normalizePath('./a.js'), 'a.js')
  assert.equal(normalizePath('src/dir/'), 'src/dir')
  assert.equal(normalizePath('src\\win.js'), 'src/win.js')
})

test('countLines：末尾换行不计为额外一行', () => {
  assert.equal(countLines('a\nb\nc'), 3)
  assert.equal(countLines('a\nb\nc\n'), 3)
  assert.equal(countLines('单行'), 1)
})

test('familyOf：观察/写/执行/其他', () => {
  assert.equal(familyOf('read'), 'observe')
  assert.equal(familyOf('grep_files'), 'observe')
  assert.equal(familyOf('edit'), 'write')
  assert.equal(familyOf('writeFile'), 'write')
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('mystery'), 'other')
})

test('默认表：残记 10 形、窗字段 18 名（限 11 + 偏 7）', () => {
  assert.equal(DEFAULT_MARKERS.length, 10)
  assert.equal(DEFAULT_CAP_FIELDS.length, 11)
  assert.equal(DEFAULT_OFFSET_FIELDS.length, 7)
})

// ---------------------------------------------------------------- 残见判定序

test('入口滤：失败之见不入账（读失败不登记）', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 3), isError: true })
  const r = judge(e)
  assert.equal(r.views, 0)
  assert.equal(r.calls, 1)
})

test('入口滤：失败之写不立案（未落盘）', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  edit(e, 's', 'a.js', { isError: true })
  const r = judge(e)
  assert.equal(r.counts.blindActs, 0)
  assert.equal(r.writes, 0)
})

test('偏窗命中（offset>0）→ 残见（跳卷首，无论回程多少行）', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: '卷首被跳过\nx', offset: 10 })
  assert.equal(judge(e).counts.partialViews, 1)
})

test('偏窗值 0 不命中，转限形判定', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 3), offset: 0, limit: 40 })
  // 限窗 40、回程 3 < 40 → 取窗认全
  assert.equal(judge(e).counts.fullViews, 1)
  assert.equal(judge(e).counts.partialViews, 0)
})

test('限窗命中而 content 缺 → 无据之见（不证其残亦不证其全）', () => {
  const e = engine()
  read(e, 's', 'a.js', { limit: 40 })
  const r = judge(e)
  assert.equal(r.views, 0)
  assert.equal(r.calls, 1)
})

test('取窗认全：限窗回程行数 < 窗值 → 全览', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 3), limit: 100 })
  const r = judge(e)
  assert.equal(r.counts.fullViews, 1)
  assert.equal(r.gauge.windowReads, 1)
})

test('窗满未到底：限窗回程行数 ≥ 窗值 → 残见', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  assert.equal(judge(e).counts.partialViews, 1)
})

test('无窗无残记有 content → 全览', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 10) })
  assert.equal(judge(e).counts.fullViews, 1)
})

test('无窗卷尾残记 → 显残（默认形认尾）', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: `${L('x', 9)}\n[truncated]` })
  const r = judge(e)
  assert.equal(r.counts.partialViews, 1)
  assert.equal(r.gauge.markerHits, 1)
})

test('认尾语义：正文中间引用 truncated 字样不误伤', () => {
  const e = engine()
  read(e, 's', 'docs.md', { content: '本文讨论 [truncated] 与 (truncated) 的词法\n结尾是正常句子' })
  assert.equal(judge(e).counts.partialViews, 0)
})

test('无 content 无窗 → 无据之见（老流诚实沉默）', () => {
  const e = engine()
  read(e, 's', 'a.js', {})
  const r = judge(e)
  assert.equal(r.views, 0)
})

test('显式残记认全文：册词在内容中部也命中', () => {
  const e = engine({ version: 1, markers: ['EXCERPT-END'] })
  read(e, 's', 'a.js', { content: `上半 EXCERPT-END 下半\n结尾正常` })
  assert.equal(judge(e).counts.partialViews, 1)
})

test('noDefaults：默认残记形关闭后认尾命中失效', () => {
  const e = engine({ version: 1, noDefaults: true })
  read(e, 's', 'a.js', { content: `${L('x', 9)}\n[truncated]` })
  assert.equal(judge(e).counts.fullViews, 1) // content 在、无窗无残记 → 全览
})

test('noDefaults：默认窗字段关闭后 limit 不再取窗', () => {
  const e = engine({ version: 1, noDefaults: true })
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  const r = judge(e)
  assert.equal(r.gauge.windowReads, 0)
  assert.equal(r.counts.fullViews, 1) // content 在、无窗无残记 → 全览
})

// ---------------------------------------------------------------- 盲动

test('残见之上动刀 → 盲动 +30、带「盲」、门红', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  edit(e, 's', 'a.js')
  const r = judge(e)
  assert.deepEqual(r.score, { total: 30, blind: 30, crawl: 0 })
  assert.equal(r.band, '盲')
  assert.equal(r.verdict, 'fail')
})

test('全览在先动刀清白', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 10) })
  edit(e, 's', 'a.js')
  assert.equal(judge(e).counts.blindActs, 0)
})

test('补览赦免：残见 → 全览 → 动刀清白', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  read(e, 's', 'a.js', { content: L('y', 60) })
  edit(e, 's', 'a.js')
  assert.equal(judge(e).counts.blindActs, 0)
})

test('时序以流序为准：残见 → 动刀（案）→ 全览 → 动刀（清白）', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  edit(e, 's', 'a.js')
  read(e, 's', 'a.js', { content: L('y', 50) })
  edit(e, 's', 'a.js')
  const r = judge(e)
  assert.equal(r.counts.blindActs, 1)
  assert.equal(r.cases, 1)
})

test('自书为览：先写后改无任何读 → 清白', () => {
  const e = engine()
  edit(e, 's', 'a.js')
  edit(e, 's', 'a.js')
  assert.equal(judge(e).counts.blindActs, 0)
})

test('无见闻之写不归本层（写前读过没有是知止的地盘）', () => {
  const e = engine()
  edit(e, 's', 'brand-new.js')
  const r = judge(e)
  assert.equal(r.counts.blindActs, 0)
  assert.equal(r.cases, 0)
})

test('全是无据之见之写 → 静默（宁纵）', () => {
  const e = engine()
  read(e, 's', 'a.js', {}) // 无 content 无窗
  edit(e, 's', 'a.js')
  assert.equal(judge(e).counts.blindActs, 0)
})

test('两笔盲动 60、三笔封顶仍 60', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  edit(e, 's', 'a.js')
  edit(e, 's', 'a.js')
  assert.equal(judge(e).score.blind, 60)
  edit(e, 's', 'a.js')
  assert.equal(judge(e).score.blind, 60)
})

test('据证链按会话分账：甲会话读全救不了乙会话的盲', () => {
  const e = engine()
  read(e, 'A', 'shared.js', { content: L('x', 10) }) // 甲：全览
  read(e, 'B', 'shared.js', { content: L('x', 30), limit: 30 }) // 乙：残见
  edit(e, 'B', 'shared.js') // 乙动刀
  const r = judge(e)
  assert.equal(r.counts.blindActs, 1)
  assert.equal(e.cases[0].session, 'B')
})

test('会话分账：乙动刀在先、甲后读全，乙案不销', () => {
  const e = engine()
  read(e, 'B', 'p.js', { content: L('x', 20), limit: 20 })
  edit(e, 'B', 'p.js')
  read(e, 'A', 'p.js', { content: L('x', 20) }) // 另一会话之后才读全
  assert.equal(judge(e).counts.blindActs, 1)
})

test('exec 与 n: 黑盒不判（命令式读取不入账）', () => {
  const e = engine()
  feed(e, 's', 'bash', { command: 'head -40 src/api.js' }, { content: L('x', 40) })
  feed(e, 's', 'weird', { target: 'a.js' }, { content: '[truncated]' })
  const r = judge(e)
  assert.equal(r.views, 0)
  edit(e, 's', 'src/api.js')
  assert.equal(judge(e).counts.blindActs, 0)
})

// ---------------------------------------------------------------- 碎览

test('碎览：残见 ≥3 无作 → 单径 +10、落全带点名不咬门', () => {
  const e = engine()
  read(e, 's', 'a.log', { content: L('a', 20), limit: 20 })
  read(e, 's', 'a.log', { content: L('a', 20), limit: 20 })
  read(e, 's', 'a.log', { content: L('a', 20), limit: 20 })
  const r = judge(e)
  assert.deepEqual(r.score, { total: 10, blind: 0, crawl: 10 })
  assert.equal(r.band, '全')
  assert.equal(r.verdict, 'pass')
  assert.equal(r.counts.crawls, 1)
})

test('碎览：残见 2 不足阈不案', () => {
  const e = engine()
  read(e, 's', 'a.log', { content: L('a', 20), limit: 20 })
  read(e, 's', 'a.log', { content: L('a', 20), limit: 20 })
  const r = judge(e)
  assert.equal(r.counts.crawls, 0)
  assert.match(r.issues[0], /净鉴/)
})

test('碎览阈可配：fragWindows 2 → 两径各案 → 20 带昧', () => {
  const e = engine({ version: 1, fragWindows: 2 })
  read(e, 's', 'a.log', { content: L('a', 20), limit: 20 })
  read(e, 's', 'a.log', { content: L('a', 20), limit: 20 })
  read(e, 's', 'b.log', { content: L('b', 20), limit: 20 })
  read(e, 's', 'b.log', { content: L('b', 20), limit: 20 })
  const r = judge(e)
  assert.deepEqual(r.score, { total: 20, blind: 0, crawl: 20 })
  assert.equal(r.band, '昧')
  assert.equal(r.verdict, 'pass')
})

test('碎览 cap 20：四径全案仍 20', () => {
  const e = engine()
  for (const p of ['a.log', 'b.log', 'c.log', 'd.log']) {
    read(e, 's', p, { content: L('x', 20), limit: 20 })
    read(e, 's', p, { content: L('x', 20), limit: 20 })
    read(e, 's', p, { content: L('x', 20), limit: 20 })
  }
  const r = judge(e)
  assert.equal(r.counts.crawls, 4)
  assert.equal(r.score.crawl, 20)
})

test('不双罚：残见×3 之径动刀 → 只盲动 30、crawls 0', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  edit(e, 's', 'a.js')
  const r = judge(e)
  assert.deepEqual(r.score, { total: 30, blind: 30, crawl: 0 })
  assert.equal(r.counts.crawls, 0)
})

test('自书破碎览：残见×3 后写过该径 → 不入碎览（盲动已定罪）', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  edit(e, 's', 'a.js') // 盲动立案
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 }) // 第三窗在刀后
  const r = judge(e)
  assert.equal(r.counts.blindActs, 1)
  assert.equal(r.counts.crawls, 0)
})

// ---------------------------------------------------------------- 豁免

test('豁免在册：见不登记、写不立案、注记每径一记', () => {
  const e = engine({ version: 1, exempt: ['vendor/'] })
  read(e, 's', 'vendor/lib.js', { content: L('x', 50), limit: 50 })
  edit(e, 's', 'vendor/lib.js')
  edit(e, 's', 'vendor/lib.js')
  const r = judge(e)
  assert.equal(r.views, 0)
  assert.equal(r.writes, 0)
  assert.equal(r.counts.exempted, 1)
  assert.equal(r.counts.blindActs, 0)
  assert.match(r.issues[0], /豁免 ×1（不计分）：vendor\/lib\.js —— 材册明言/)
})

test('豁免按子串匹配：./ 归一后仍命中', () => {
  const e = engine({ version: 1, exempt: ['vendor/'] })
  read(e, 's', './vendor/lib.js', { content: L('x', 50), limit: 50 })
  assert.equal(judge(e).counts.exempted, 1)
})

// ---------------------------------------------------------------- 分值分带与报告

test('分带函数：全 0–14 / 昧 15–29 / 盲 ≥30', () => {
  assert.equal(bandOf(0), '全')
  assert.equal(bandOf(14), '全')
  assert.equal(bandOf(15), '昧')
  assert.equal(bandOf(29), '昧')
  assert.equal(bandOf(30), '盲')
})

test('门可调：--gate 口径改变裁决', () => {
  const e = engine()
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  edit(e, 's', 'a.js')
  assert.equal(judge(e, { gate: 40 }).verdict, 'pass')
  assert.equal(judge(e, { gate: 30 }).verdict, 'fail')
})

test('报告形状：字段齐全且 gauge 正确', () => {
  const e = engine()
  read(e, 's', 'src/big.js', { content: L('b', 40), limit: 40 })
  read(e, 's', 'src/big.js', { content: L('b', 60), limit: 60 })
  edit(e, 's', 'src/big.js')
  read(e, 's', 'src/small.js', { content: L('s', 10) })
  edit(e, 's', 'src/small.js')
  const r = judge(e)
  assert.equal(r.sessions, 1)
  assert.equal(r.calls, 5)
  assert.equal(r.views, 3)
  assert.equal(r.writes, 2)
  assert.equal(r.cases, 1)
  assert.equal(r.gate, GATE_DEFAULT)
  assert.deepEqual(r.gauge.fragTop, [{ path: 'src/big.js', partials: 2 }])
  assert.equal(r.gauge.viewedPaths, 2)
  assert.match(r.issues[0], /盲动 ×1（\+30\/案）：src\/big\.js 残见 2 笔（窗 2） —— 审曲面势，以饬五材/)
})

test('issues 行序锁死：盲动 → 豁免 →（无净鉴）', () => {
  const e = engine({ version: 1, exempt: ['vendor/'] })
  read(e, 's', 'a.js', { content: L('x', 40), limit: 40 })
  edit(e, 's', 'a.js')
  read(e, 's', 'vendor/v.js', { content: L('x', 50), limit: 50 })
  const r = judge(e)
  assert.equal(r.issues.length, 2)
  assert.match(r.issues[0], /^盲动/)
  assert.match(r.issues[1], /^豁免/)
})

test('净鉴行：无案时收尾（豁免注记不挡净鉴）', () => {
  const e = engine({ version: 1, exempt: ['gen/'] })
  read(e, 's', 'gen/x.js', { content: L('x', 50), limit: 50 })
  const r = judge(e)
  assert.equal(r.issues.length, 2)
  assert.match(r.issues[1], /^净鉴/)
})

// ---------------------------------------------------------------- 账实一致（运行时增量 == 离线重放）

test('账实一致：逐调用增量记账与离线重放同结果（前缀一致）', () => {
  const mk = () => [
    ['read', { path: 'src/big.js', limit: 40 }, { content: L('b', 40) }],
    ['read', { path: 'src/big.js', limit: 60 }, { content: L('b', 60) }],
    ['edit', { path: 'src/big.js', content: 'p' }, {}],
    ['read', { path: 'src/small.js' }, { content: L('s', 10) }],
    ['edit', { path: 'src/small.js', content: 'p' }, {}],
  ]
  const e1 = engine()
  for (const [name, args, { content }] of mk()) feed(e1, 's', name, args, { content })
  const offline = judge(e1)

  // 逐前缀判（运行时视图）
  const e2 = engine()
  const prefixes = []
  for (const [name, args, { content }] of mk()) {
    feed(e2, 's', name, args, { content })
    prefixes.push(judge(e2))
  }
  const last = prefixes[prefixes.length - 1]
  assert.equal(last.score.total, offline.score.total)
  assert.deepEqual(last.counts, offline.counts)
  // 半流前缀：读了两窗未动刀时盲动为 0（增量不预支未来之案）
  assert.equal(prefixes[1].counts.blindActs, 0)
  assert.equal(prefixes[2].counts.blindActs, 1)
})

test('多流合并审计：会话分账在合并下仍成立', () => {
  const e = engine()
  feed(e, 'one', 'read', { path: 'p.js' }, { content: L('x', 10) })
  feed(e, 'two', 'read', { path: 'p.js', limit: 5 }, { content: L('x', 5) })
  feed(e, 'two', 'edit', { path: 'p.js', content: 'p' }, {})
  const r = judge(e)
  assert.equal(r.sessions, 2)
  assert.equal(r.counts.blindActs, 1)
})

// ---------------------------------------------------------------- 材册解析

test('坏材册：JSON 坏 / 类型错 / 阈非法 全部抛错', () => {
  assert.throws(() => parseBook('不是 JSON'), /合法 JSON/)
  assert.throws(() => parseBook('{"version":2}'), /version/)
  assert.throws(() => parseBook('{"version":1,"exempt":"x"}'), /exempt/)
  assert.throws(() => parseBook('{"version":1,"fragWindows":0}'), /fragWindows/)
  assert.throws(() => parseBook('{"version":1,"noDefaults":"yes"}'), /noDefaults/)
})

test('空册与全缺省册解析', () => {
  const b = parseBook('{}')
  assert.deepEqual(b, { ...emptyBook(), exempt: [], markers: [], windowFields: [] })
  assert.deepEqual(parseBook('{"version":1,"fragWindows":2}').fragWindows, 2)
})
