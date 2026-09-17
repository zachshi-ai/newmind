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
  DEYAN_ZH, DEYAN_EN, MODAL_ZH, MODAL_EN, BASENAMES, EXTS, DIRS,
  findDeyan, isModal, isPathToken, findZhiwu, djb2,
} from '../src/core/deyan.js'
import { emptyBook, parseBook, registerEntry, revokeEntry, serializeBook, bookCount, globMatch } from '../src/core/zhengce.js'
import { createEngine, recordCall, judge, bandOf, GATE_DEFAULT } from '../src/core/shenyan.js'
import { renderZhengpai } from '../src/core/zhengpai.js'
import { auditStreams } from '../src/core/audit.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const fx = (name) => readFileSync(join(root, 'fixtures', name), 'utf8')
const fxp = (name) => join(root, 'fixtures', name)

/** 便捷挂载：把逐笔记入引擎。 */
function feed(engine, rows) {
  for (const r of rows) recordCall(engine, r)
  return engine
}
const write = (path, content, isError = false) => ({ name: 'write', args: { path, content }, isError })
const read = (path, content, isError = false) => ({ name: 'read', args: { path }, isError, content })
const exec = (command, isError = false) => ({ name: 'bash', args: { command }, isError })

test('流解析：#注释跳过、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call、非 tool 事件忽略', () => {
  const ok = parseStream('{"type":"tool_call","id":"a","name":"write"}\n# 注释\n{"type":"tool_call","id":"b","name":"read"}\n')
  assert.equal(ok.length, 2)
  assert.throws(() => parseStream('{"ok":1}\n{bad}'), /第 2 行不是合法 JSON/)
  const { calls } = buildCalls(parseStream(fx('mujian-stream.jsonl')))
  assert.equal(calls.length, 2)
  assert.equal(calls[0].isError, false)
  const orphan = buildCalls(parseStream('{"type":"tool_result","id":"x","isError":true}'))
  assert.equal(orphan.calls.length, 1) // 孤儿 result 独立建档
  const legacy = buildCalls(parseStream('{"type":"tool_call","name":"write"}\n{"type":"tool_result","isError":false,"content":"c"}'))
  assert.equal(legacy.calls.length, 1)
  assert.equal(legacy.calls[0].content, 'c') // 无 id result 并入紧邻 call
  const mixed = buildCalls(parseStream('{"type":"turn_start","id":"t1"}\n{"type":"principal","text":"做"}\n{"type":"tool_call","name":"bash"}'))
  assert.equal(mixed.calls.length, 1) // turn_start/principal 等事件忽略
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

test('得言形中文：30 形命中、否定形同案（不包含亦案）、指路词不中', () => {
  assert.ok(DEYAN_ZH.length === 30)
  assert.ok(findDeyan('配置集中在 src/config.js，使用 CommonJS 导出。').includes('集中在'))
  assert.ok(findDeyan('配置集中在 src/config.js，使用 CommonJS 导出。').includes('使用'))
  assert.ok(findDeyan('src/config.js 不包含 retry 逻辑。').includes('包含')) // 否定形同案
  assert.deepEqual(findDeyan('详见 src/index.js'), []) // 指路词不是得言形
  assert.deepEqual(findDeyan('重构说明：内部实现调整'), [])
})

test('得言形英文：23 形词界命中、reuses 不中（词界）、大小写不敏感', () => {
  assert.ok(DEYAN_EN.length === 23)
  assert.ok(findDeyan('The config lives in src/config.js and uses CommonJS.').includes('lives in'))
  assert.ok(findDeyan('The config lives in src/config.js and uses CommonJS.').includes('uses'))
  assert.deepEqual(findDeyan('the suite reuses fixtures'), []) // reuses 词界不中
  assert.ok(findDeyan('It RETURNS json.').includes('returns'))
})

test('指物径形：slash/专名底表/dotfile/扩展名白名单；大写词干、版本数字、白名单外尾段、全大写斜杠、裸扩展名不中；句点粘尾剥除', () => {
  assert.equal(BASENAMES.size, 10)
  assert.equal(EXTS.size, 44)
  assert.ok(isPathToken('src/config.js'))
  assert.ok(isPathToken('tests/e2e'))
  assert.ok(isPathToken('AGENTS.md')) // 专名底表大小写敏感
  assert.ok(isPathToken('.npmrc'))
  assert.ok(isPathToken('.eslintrc.json'))
  assert.ok(isPathToken('package-lock.json'))
  assert.ok(!isPathToken('Node.js')) // 大写词干不中
  assert.ok(!isPathToken('TypeScript'))
  assert.ok(!isPathToken('CommonJS'))
  assert.ok(!isPathToken('v16.17.0')) // 版本数字不中
  assert.ok(!isPathToken('example.com')) // 白名单外尾段（com）不中
  assert.ok(!isPathToken('TCP/IP')) // 全大写斜杠形不中
  assert.ok(!isPathToken('.js')) // 裸扩展名不中（dotfile 规则）
  const z = findZhiwu('构建产物位于 dist/index.js. 次日生效。')
  assert.deepEqual(z.paths, ['dist/index.js']) // 句点粘尾剥除
})

test('目录指物与自指形：底表 18 全等、自指 7 ∪ 4', () => {
  assert.equal(DIRS.size, 18)
  const d = findZhiwu('测试位于 tests 目录。')
  assert.deepEqual(d.paths, [])
  assert.deepEqual(d.dirs, ['tests'])
  assert.equal(d.self, false)
  const s = findZhiwu('本文档包含三阶段实施细节。')
  assert.equal(s.self, true)
  const s2 = findZhiwu('This document contains three phases.')
  assert.equal(s2.self, true)
})

test('网卫：URL 跨度内 token 不作指物', () => {
  const z = findZhiwu('安装说明见 https://example.com/guide/src/config.js 使用文档。')
  assert.deepEqual(z.paths, [])
  assert.deepEqual(z.dirs, [])
  const z2 = findZhiwu('配置在 src/config.js，参考 https://example.com/guide。')
  assert.deepEqual(z2.paths, ['src/config.js']) // URL 外的指物照提
})

test('模态门：中文 24 ∪ 英文 11 行级跳过、「将」单字不设门', () => {
  assert.equal(MODAL_ZH.length, 24)
  assert.equal(MODAL_EN.length, 11)
  assert.ok(isModal('下一步将把配置迁移到 src/config.js。'))
  assert.ok(isModal('使用前应当先读 src/config.js。'))
  assert.ok(isModal('TODO: 校验 tests/e2e 覆盖。'))
  assert.ok(!isModal('该项目将配置集中在 src/config.js。')) // 「将配置」是陈述不是将来
})

test('目见：先见清白、失败之见不生据（404 之后照断言即幻言）', () => {
  const e1 = feed(createEngine(), [read('src/config.js', 'module.exports = {}'), write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  const j1 = judge(e1)
  assert.deepEqual(j1.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
  const e2 = feed(createEngine(), [read('src/config.js', null, true), write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  const j2 = judge(e2)
  assert.equal(j2.counts.hy, 1)
  assert.equal(j2.score.total, 30)
  assert.equal(j2.verdict, 'fail')
})

test('书见与自指：先写为据、自指本笔即据、显式写稿径同据', () => {
  const e1 = feed(createEngine(), [write('src/config.js', 'const a = 1'), write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  assert.equal(judge(e1).counts.hy, 0)
  const e2 = feed(createEngine(), [write('docs/plan.md', '# 实施方案\n\n本文档包含三阶段实施细节。\n')])
  const j2 = judge(e2)
  assert.deepEqual(j2.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
  const e3 = feed(createEngine(), [write('docs/plan.md', 'docs/plan.md 包含三阶段实施细节。\n')])
  assert.equal(judge(e3).counts.hy, 0) // 显式指稿径——本笔即据
})

test('验见：exec 成功原文含指物为据、失败 exec 不生据', () => {
  const e1 = feed(createEngine(), [exec('cat src/config.js'), write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  assert.equal(judge(e1).counts.hy, 0)
  const e2 = feed(createEngine(), [exec('cat src/config.js', true), write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  assert.equal(judge(e2).counts.hy, 1)
})

test('迟证：先断言后补看——见据在后注记 0 分', () => {
  const e = feed(createEngine(), [write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n'), read('src/config.js', 'module.exports = {}')])
  const j = judge(e)
  assert.equal(j.counts.cz, 1)
  assert.equal(j.counts.hy, 0)
  assert.equal(j.score.total, 0)
  assert.equal(j.verdict, 'pass')
  assert.match(j.issues[0], /注记：docs\/r\.md:1 迟证 指物 src\/config\.js/)
})

test('基径与免审：grounds 在册清白、excuse 整稿免审、靶场豁免', () => {
  const book = { version: 1, excuse: ['docs/reports/*'], grounds: ['src/config.js'] }
  const e1 = feed(createEngine({ book }), [write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  assert.equal(judge(e1).counts.hy, 0) // 基径清白
  const e2 = feed(createEngine({ book }), [write('docs/reports/w.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  const j2 = judge(e2)
  assert.equal(j2.paths, 0) // 免审：不入稿账
  const e3 = feed(createEngine(), [write('tests/r.spec.js', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  assert.equal(judge(e3).paths, 0) // 靶场豁免
})

test('判定序锁死：模态先于得言、得言无指物生虚指注记（一行一记）', () => {
  const e = feed(createEngine(), [write('docs/r.md', '下一步将把配置迁移到 src/config.js。\n项目包含多个功能模块。\n')])
  const j = judge(e)
  assert.deepEqual(j.counts, { hy: 0, yy: 0, cz: 0, xz: 1 })
  assert.equal(j.score.total, 0)
})

test('行=案独立：一行两指物两案、同 token 重复只立一案', () => {
  const e = feed(createEngine(), [write('docs/r.md', '日志输出到 logs/a.log 与 logs/b.log，两处均未核对。\n')])
  const j = judge(e)
  assert.equal(j.counts.hy, 2)
  const e2 = feed(createEngine(), [write('docs/r.md', '配置集中在 src/config.js，使用 src/config.js。\n')])
  assert.equal(judge(e2).counts.hy, 1) // 同指物去重
})

test('幻值门禁：单幻言 30 诞红、双幻言 60 cap、单疑言 15 疑黄牌、双疑言 30 诞红、bandOf 边界', () => {
  const e1 = feed(createEngine(), [write('docs/r.md', '日志输出到 logs/a.log。\n')])
  const j1 = judge(e1)
  assert.deepEqual(j1.score, { huan: 30, yi: 0, total: 30 })
  assert.equal(j1.band, '诞')
  assert.equal(j1.verdict, 'fail')
  const e2 = feed(createEngine(), [write('docs/r.md', '日志输出到 logs/a.log。\n构建输出到 dist/out.js。\n')])
  assert.equal(judge(e2).score.total, 60) // cap
  const e3 = feed(createEngine(), [write('docs/r.md', '测试位于 tests 目录。\n')])
  const j3 = judge(e3)
  assert.deepEqual(j3.score, { huan: 0, yi: 15, total: 15 })
  assert.equal(j3.band, '疑')
  assert.equal(j3.verdict, 'pass') // 黄牌不咬门
  const e4 = feed(createEngine(), [write('docs/r.md', '测试位于 tests 目录。\n构建产物位于 dist。\n')])
  const j4 = judge(e4)
  assert.deepEqual(j4.score, { huan: 0, yi: 30, total: 30 })
  assert.equal(j4.verdict, 'fail') // 双疑言即红
  assert.equal(bandOf(14), '彰')
  assert.equal(bandOf(15), '疑')
  assert.equal(bandOf(29), '疑')
  assert.equal(bandOf(30), '诞')
  assert.equal(GATE_DEFAULT, 30)
})

test('败写/无文之写不入稿账；observe 结果里的断言永不判言', () => {
  const e1 = feed(createEngine(), [write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n', true)])
  const j1 = judge(e1)
  assert.equal(j1.paths, 0)
  assert.equal(j1.calls, 1) // 调用被记到了
  const e2 = feed(createEngine(), [{ name: 'edit', args: { path: 'docs/r.md' } }])
  assert.equal(judge(e2).paths, 0) // 无 content 无稿可判
  const e3 = feed(createEngine(), [read('docs/x.md', '配置集中在 src/config.js，使用 CommonJS 导出。')])
  const j3 = judge(e3)
  assert.equal(j3.paths, 0) // observe 不受审
  assert.equal(j3.calls, 1)
})

test('issues 排序锁死：稿径 → 行 → 案别（幻言 < 疑言）→ 指物；注记排其后', () => {
  const e = feed(createEngine(), [
    write('docs/b.md', '测试位于 tests 目录。\n日志输出到 logs/a.log。\n'),
    write('docs/a.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n'),
  ])
  const j = judge(e)
  assert.equal(j.issues.length, 3)
  assert.match(j.issues[0], /幻言：docs\/a\.md:1/)
  assert.match(j.issues[1], /疑言：docs\/b\.md:1/) // 行号先于案别（docs/03 §7）
  assert.match(j.issues[2], /幻言：docs\/b\.md:2/)
})

test('末稿立撤：同径新写换下旧稿——旧案随稿撤', () => {
  const e = createEngine()
  feed(e, [write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  assert.equal(judge(e).verdict, 'fail')
  feed(e, [write('docs/r.md', '重构说明：内部实现调整。\n')])
  const j = judge(e)
  assert.equal(j.counts.hy, 0) // 旧案全撤
  assert.equal(j.verdict, 'pass')
})

test('judge 幂等：同引擎双跑 deepEqual；单会话视图 sessions 计数', () => {
  const e = feed(createEngine(), [write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  assert.deepEqual(judge(e), judge(e))
  const merged = auditStreams([
    { name: 's1.jsonl', text: fx('hejian-a.jsonl') },
    { name: 's2.jsonl', text: fx('hejian-b.jsonl') },
  ])
  assert.equal(merged.sessions, 2)
})

test('合审序：at 归并（甲目见救乙断言）与参序拼接、跨会话迟证', () => {
  const grounded = auditStreams([
    { name: 'hejian-a.jsonl', text: fx('hejian-a.jsonl') },
    { name: 'hejian-b.jsonl', text: fx('hejian-b.jsonl') },
  ])
  assert.deepEqual(grounded.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
  assert.equal(grounded.calls, 2)
  const late = auditStreams([
    { name: 'hechi-a.jsonl', text: fx('hechi-a.jsonl') },
    { name: 'hechi-b.jsonl', text: fx('hechi-b.jsonl') },
  ])
  assert.equal(late.counts.cz, 1) // 见据在后——迟证
  assert.equal(late.score.total, 0)
  const single = auditStreams([{ name: 'hejian-b.jsonl', text: fx('hejian-b.jsonl') }])
  assert.equal(single.counts.hy, 1) // 单会话视图无对手之见——幻言
})

test('证册：parse/register/revoke/serialize/grounds 保留/globMatch/缺册', () => {
  const b = parseBook(fx('chachu-book.json'))
  assert.deepEqual(b.excuse, ['docs/reports/*'])
  assert.deepEqual(b.grounds, ['src/config.js'])
  registerEntry(b, 'legacy/*')
  registerEntry(b, 'legacy/*') // 去重
  assert.equal(bookCount(b), 2)
  revokeEntry(b, 'legacy/*')
  assert.equal(bookCount(b), 1)
  assert.throws(() => revokeEntry(b, 'nope/*'), /证册无此免审径/)
  assert.throws(() => parseBook('{bad'), /证册不是合法 JSON/)
  assert.throws(() => parseBook('[]'), /证册须为对象/)
  assert.ok(globMatch('docs/reports/a.md', 'docs/reports/*'))
  assert.ok(!globMatch('docs/report.md', 'docs/reports/*'))
  assert.ok(globMatch('src/config.js', 'src/config.js')) // 无星逐字相等
  const e = createEngine({ book: null })
  assert.deepEqual(e.cfg.excuse, [])
  assert.deepEqual(e.cfg.grounds, []) // 无册照判——凡言必据
})

test('证牌块：双渲染逐字节一致、无册确定性文本、不含行原文', () => {
  const book = { version: 1, excuse: ['docs/reports/*'], grounds: [] }
  const e = feed(createEngine({ book }), [write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  const j = judge(e)
  const a = renderZhengpai(book, j)
  const b = renderZhengpai(book, j)
  assert.equal(a, b)
  assert.match(a, /【察传 · 证牌】/)
  assert.match(a, /证册：免审 1 处（docs\/reports\/\*）/)
  assert.match(a, /幻言：docs\/r\.md:1 指物 src\/config\.js（指纹 [0-9a-f]+）/)
  assert.ok(!a.includes('配置集中在')) // 行原文不进证牌（掩码是结构性保证）
  const empty = renderZhengpai(null, { counts: { hy: 0, yy: 0, cz: 0, xz: 0 }, issues: ['言皆有据 ×0 稿 0 行 —— 言必有据，指物在先'] })
  assert.match(empty, /证册：未立（凡言必据）/)
})

test('掩码：issues 永不携带行原文（指纹与指物是断言数据不是文面）', () => {
  const e = feed(createEngine(), [write('docs/r.md', '日志输出到 logs/agent.log，按日滚动。\n')])
  const j = judge(e)
  assert.ok(!j.issues.some((s) => s.includes('按日滚动')))
  assert.ok(j.cases[0].fp)
  assert.equal(djb2('abc'), djb2('abc'))
})

test('夹具全量·一：clean/huanyan/duchuan/mujian/shujian/xingjian/zizhi 逐字段对表', () => {
  const j = (name, book) => auditStreams([{ name, text: fx(name) }], book ? { book } : {})
  const c = j('clean-stream.jsonl')
  assert.equal(c.calls, 1)
  assert.deepEqual(c.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
  assert.equal(c.band, '彰')
  const h = j('huanyan-stream.jsonl')
  assert.deepEqual(h.counts, { hy: 2, yy: 0, cz: 0, xz: 0 })
  assert.deepEqual(h.score, { huan: 60, yi: 0, total: 60 })
  assert.equal(h.band, '诞')
  assert.equal(h.verdict, 'fail')
  const d = j('duchuan-stream.jsonl')
  assert.deepEqual(d.score, { huan: 30, yi: 0, total: 30 })
  const m = j('mujian-stream.jsonl')
  assert.equal(m.calls, 2)
  assert.equal(m.band, '彰')
  const s = j('shujian-stream.jsonl')
  assert.equal(s.calls, 2)
  assert.equal(s.paths, 2) // 两稿皆审
  assert.equal(s.band, '彰')
  const x = j('xingjian-stream.jsonl')
  assert.equal(x.band, '彰')
  const z = j('zizhi-stream.jsonl')
  assert.deepEqual(z.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
})

test('夹具全量·二：chizheng/shibai/jiyan 带册与无册/mianze/bachang/shimo 逐字段对表', () => {
  const j = (name, book) => auditStreams([{ name, text: fx(name) }], book ? { book } : {})
  const cz = j('chizheng-stream.jsonl')
  assert.deepEqual(cz.counts, { hy: 0, yy: 0, cz: 1, xz: 0 })
  assert.equal(cz.band, '彰')
  const sb = j('shibai-stream.jsonl')
  assert.deepEqual(sb.counts, { hy: 1, yy: 0, cz: 0, xz: 0 })
  assert.equal(sb.verdict, 'fail')
  const book = parseBook(fx('chachu-book.json'))
  const jy = j('jiyan-stream.jsonl', book)
  assert.equal(jy.band, '彰') // 基径清白
  const jy0 = j('jiyan-stream.jsonl')
  assert.equal(jy0.verdict, 'fail') // 无册对照
  const mz = j('mianze-stream.jsonl', book)
  assert.equal(mz.paths, 0)
  const bc = j('bachang-stream.jsonl')
  assert.equal(bc.paths, 0)
  const sm = j('shimo-stream.jsonl')
  assert.deepEqual(sm.counts, { hy: 0, yy: 0, cz: 0, xz: 0 })
})

test('夹具全量·三：yinyu/xuzhi/yingwen/wangwei/yiyan/baishi 逐字段对表', () => {
  const j = (name) => auditStreams([{ name, text: fx(name) }], {})
  const yy = j('yinyu-stream.jsonl')
  assert.deepEqual(yy.counts, { hy: 1, yy: 0, cz: 0, xz: 0 })
  assert.match(yy.issues[0], /幻言：docs\/report\.md:3 指物 AGENTS\.md/)
  const xz = j('xuzhi-stream.jsonl')
  assert.deepEqual(xz.counts, { hy: 0, yy: 0, cz: 0, xz: 1 })
  const yw = j('yingwen-stream.jsonl')
  assert.equal(yw.counts.hy, 1)
  const ww = j('wangwei-stream.jsonl')
  assert.deepEqual(ww.counts, { hy: 0, yy: 0, cz: 0, xz: 1 })
  const yi = j('yiyan-stream.jsonl')
  assert.deepEqual(yi.counts, { hy: 0, yy: 1, cz: 0, xz: 0 })
  assert.deepEqual(yi.score, { huan: 0, yi: 15, total: 15 })
  assert.equal(yi.band, '疑')
  assert.equal(yi.verdict, 'pass')
  const bs = j('baishi-stream.jsonl')
  assert.equal(bs.paths, 0)
  assert.equal(bs.band, '彰')
})

test('跨项目互认：七条外部夹具流零误伤（同格式流跨项目可审）', () => {
  const cases = [
    ['zhizhi/fixtures/sample-stream.jsonl', 8],
    ['kaocheng/fixtures/mixed-stream.jsonl', 4],
    ['dingfen/fixtures/fenced-stream.jsonl', 6],
    ['erbing/fixtures/mixed-stream.jsonl', 5],
    ['erbing/fixtures/delegated-stream.jsonl', 5],
    ['huashui/fixtures/fuji-stream.jsonl', 3],
    ['jiaotuo/fixtures/weizhao-stream.jsonl', 2],
  ]
  for (const [rel, calls] of cases) {
    const text = readFileSync(join(root, '..', rel), 'utf8')
    const j = auditStreams([{ name: rel, text }], {})
    assert.equal(j.calls, calls, rel)
    assert.deepEqual(j.counts, { hy: 0, yy: 0, cz: 0, xz: 0 }, rel)
    assert.equal(j.verdict, 'pass', rel)
  }
})

test('规整相等：断言写 ./src/config.js，目见是 src/config.js——规整后同物清白', () => {
  const e = feed(createEngine(), [read('src/config.js', 'x'), write('docs/r.md', '配置集中在 ./src/config.js，使用 CommonJS 导出。\n')])
  assert.equal(judge(e).counts.hy, 0)
})

test('验见从宽：命令含规整前缀（cat ./src/config.js | head）仍认含指物', () => {
  const e = feed(createEngine(), [exec('cat ./src/config.js | head -5'), write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  assert.equal(judge(e).counts.hy, 0)
})

test('基径 glob：grounds 星号跨目录（src/* 清白、docs/* 不清白）', () => {
  const book = { version: 1, excuse: [], grounds: ['src/*'] }
  const e1 = feed(createEngine({ book }), [write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  assert.equal(judge(e1).counts.hy, 0)
  const e2 = feed(createEngine({ book }), [write('docs/r.md', '日志输出到 logs/agent.log，按日滚动。\n')])
  assert.equal(judge(e2).counts.hy, 1)
})

test('老流诚实判定：isError 缺失（null）之写按已发生照判、之见按已见为据', () => {
  const e1 = feed(createEngine(), [{ name: 'write', args: { path: 'docs/r.md', content: '配置集中在 src/config.js，使用 CommonJS 导出。\n' } }])
  assert.equal(judge(e1).counts.hy, 1) // null 按已发生——稿照判
  const e2 = feed(createEngine(), [{ name: 'read', args: { path: 'src/config.js' } }, write('docs/r.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n')])
  assert.equal(judge(e2).counts.hy, 0) // null 按已见——据成立
})

test('门禁翻转：同流在 gate 40 过、gate 30 红；迟证与幻言并行各计各账', () => {
  const text = fx('duchuan-stream.jsonl')
  assert.equal(auditStreams([{ name: 'd.jsonl', text }], { gate: 40 }).verdict, 'pass')
  assert.equal(auditStreams([{ name: 'd.jsonl', text }], { gate: 30 }).verdict, 'fail')
  const e = feed(createEngine(), [
    write('docs/a.md', '配置集中在 src/config.js，使用 CommonJS 导出。\n'),
    write('docs/b.md', '测试位于 tests 目录。\n'),
    read('src/config.js', 'x'),
  ])
  const j = judge(e)
  assert.equal(j.counts.cz, 1) // docs/a.md 后见补据
  assert.equal(j.counts.yy, 1) // docs/b.md 目录指物
  assert.equal(j.counts.hy, 0)
  assert.deepEqual(j.score, { huan: 0, yi: 15, total: 15 })
})
