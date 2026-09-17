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
  ZHENMIAN, GUIYIN_ZH, GUIYIN_EN, TUI_ZH, TUI_EN, ZHIDAI_ZH, GUO_EN, GUO_ZH,
  isZhenmian, findGuiyin, hasTui, isZhidaiQianzhui, hasGuo, tokensOf, djb2,
} from '../src/core/guiyin.js'
import { emptyBook, parseBook, registerEntry, revokeEntry, serializeBook, bookCount, globMatch } from '../src/core/yice.js'
import { createEngine, recordCall, judge, bandOf, GATE_DEFAULT } from '../src/core/yanyin.js'
import { renderSupai } from '../src/core/supai.js'
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
const exec = (command, isError = false, content = null) => ({ name: 'bash', args: { command }, isError, content })

test('流解析：#注释跳过、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call、非 tool 事件忽略', () => {
  const ok = parseStream('{"type":"tool_call","id":"a","name":"write"}\n# 注释\n{"type":"tool_call","id":"b","name":"read"}\n')
  assert.equal(ok.length, 2)
  assert.throws(() => parseStream('{"ok":1}\n{bad}'), /第 2 行不是合法 JSON/)
  const { calls } = buildCalls(parseStream(fx('kanyan-stream.jsonl')))
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

test('诊面形：14 形命中（post-mortem/rca/复盘/排查）、大小写不敏感、README 不中', () => {
  assert.ok(ZHENMIAN.length === 14)
  assert.ok(isZhenmian('docs/Postmortem.md'))
  assert.ok(isZhenmian('docs/incident-42.md'))
  assert.ok(isZhenmian('docs/root-cause.md'))
  assert.ok(isZhenmian('reports/rca/notes.md'))
  assert.ok(isZhenmian('docs/复盘-0918.md'))
  assert.ok(isZhenmian('docs/排查记录.md'))
  assert.ok(!isZhenmian('README.md'))
  assert.ok(!isZhenmian('docs/notes.md'))
})

test('归因形中文：12 形子串命中、首形一行一案（多形取最早）、无形不中', () => {
  assert.ok(GUIYIN_ZH.length === 12)
  assert.equal(findGuiyin('根因是缓存过期。').form, '根因')
  assert.equal(findGuiyin('问题在于配置漂移。').form, '问题在于')
  assert.equal(findGuiyin('延迟症结在连接池。').form, '症结')
  assert.equal(findGuiyin('服务不稳是因为超时未配。').form, '是因为')
  assert.equal(findGuiyin('根因是 A，原因是 B').form, '根因') // 一行只取首形
  assert.equal(findGuiyin('服务已恢复，监控告警已解除。'), null)
  assert.equal(findGuiyin('由于篇幅限制，只列要点。'), null) // 纯连接词保护
})

test('归因形英文：9 形词界命中、大小写不敏感、reuses 类词界不中', () => {
  assert.ok(GUIYIN_EN.length === 9)
  assert.equal(findGuiyin('The root cause is a stale cache.').form, 'root cause')
  assert.equal(findGuiyin('It was caused by a misconfig.').form, 'caused by')
  assert.equal(findGuiyin('Due to timeout the job died.').form, 'due to')
  assert.ok(findGuiyin('ROOT CAUSE IS unclear.'))
  assert.equal(findGuiyin('the rootless daemon'), null) // rootless 词界不中 root cause 无关
  assert.equal(findGuiyin('We gathered the data.'), null)
})

test('推词门：中文 12 ∪ 英文 12 行级命中、mayor 不中 may（词界）', () => {
  assert.ok(TUI_ZH.length === 12)
  assert.ok(TUI_EN.length === 12)
  assert.ok(hasTui('根因可能是缓存过期。'))
  assert.ok(hasTui('疑似配置漂移所致。'))
  assert.ok(hasTui('The root cause might be the pool.'))
  assert.ok(!hasTui('The mayor signed it.')) // mayor 词界不中 may
  assert.ok(!hasTui('根因是缓存过期。'))
})

test('指代前缀：因面以指代形开头即泛因；中段指代不触发；前导标点剥除', () => {
  assert.ok(ZHIDAI_ZH.length === 4)
  assert.ok(isZhidaiQianzhui('如下，详见排查一节。'))
  assert.ok(isZhidaiQianzhui('见下节'))
  assert.ok(isZhidaiQianzhui('：见下节')) // 前导标点剥除后仍判
  assert.ok(isZhidaiQianzhui('see below for details'))
  assert.ok(!isZhidaiQianzhui('是缓存过期，详见下文。')) // 中段指代不触发
  assert.ok(!isZhidaiQianzhui('缓存过期导致的数据不一致'))
})

test('因面词元化：英文停词/纯数字/短词过滤、路径形保留、CJK bigram 段内滑窗、标点不跨段', () => {
  assert.deepEqual(tokensOf('is a stale cache entry.'), ['stale', 'cache', 'entry'])
  assert.deepEqual(tokensOf('a race condition in the connection pool'), ['race', 'condition', 'connection', 'pool'])
  assert.ok(tokensOf('缓存过期导致的数据不一致').includes('缓存'))
  assert.ok(tokensOf('缓存过期导致的数据不一致').includes('过期'))
  assert.ok(!tokensOf('缓存。重启').includes('存重')) // bigram 不跨标点
  assert.ok(tokensOf('v2 的 timeout 问题').includes('timeout'))
  assert.ok(!tokensOf('42 个实例').includes('42')) // 纯数字不中
  assert.deepEqual(tokensOf('is the of and'), []) // 全停词 → 空
})

test('果词表：英文 9 词界 ∪ 中文 6 子串、timeout/errors 命中', () => {
  assert.ok(GUO_EN.length === 9)
  assert.ok(GUO_ZH.length === 5 + 1 || GUO_ZH.length === 6)
  assert.ok(hasGuo('Error: cache timeout after 30s'))
  assert.ok(hasGuo('connection refused'))
  assert.ok(hasGuo('请求超时堆积'))
  assert.ok(!hasGuo('verify ok'))
})

test('拔验清白：动因 write 在先 ∧ 其后成功 exec 验果（皆在本笔前）→ 0 分', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    read('config.json', '{"cache_ttl": 60}'),
    write('src/cache.js', '// fix cache expiry'),
    exec('node src/cache.js --verify'),
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
  ])
  const r = judge(eng)
  assert.deepEqual(r.counts, { yd: 0, wd: 0, xy: 0, cy: 0, fy: 0 })
  assert.equal(r.score.total, 0)
  assert.equal(r.verdict, 'pass')
})

test('重演望断：exec 败相（果词×因面同笔）≥2 笔 → 15 黄牌', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    exec('curl http://api/cache/items', true, 'Error: cache timeout'),
    exec('curl http://api/cache/items', true, 'Error: cache timeout'),
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
  ])
  const r = judge(eng)
  assert.equal(r.counts.wd, 1)
  assert.equal(r.score.wang, 15)
  assert.equal(r.verdict, 'pass') // 黄牌不咬门
})

test('勘验望断：observe 正文含因面词元 → 望断；望不叠（重演勘验同在只一案）', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    read('logs/app.log', 'cache miss storm'),
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
  ])
  const r = judge(eng)
  assert.equal(r.counts.wd, 1)
  assert.equal(r.score.total, 15)
  // 望不叠：重演 2 笔 + 勘验同在
  const eng2 = createEngine({ book: null })
  feed(eng2, [
    exec('curl http://api/cache/items', true, 'Error: cache timeout'),
    exec('curl http://api/cache/items', true, 'Error: cache timeout'),
    read('logs/app.log', 'cache miss storm'),
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
  ])
  const r2 = judge(eng2)
  assert.equal(r2.counts.wd, 1) // 只一案，不是 30
  assert.equal(r2.score.total, 15)
})

test('迟验注记：拔验对全在本笔之后 → 0 分留痕；望档证据在后不采（望不洗臆）', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
    write('src/cache.js', '// fix cache expiry'),
    exec('node src/cache.js --verify'),
  ])
  const r = judge(eng)
  assert.equal(r.counts.cy, 1)
  assert.equal(r.score.total, 0)
  // 望档证据在后不采：断言前全无 → 臆断
  const eng2 = createEngine({ book: null })
  feed(eng2, [
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
    read('logs/app.log', 'cache miss storm'),
  ])
  const r2 = judge(eng2)
  assert.equal(r2.counts.yd, 1) // 后来的勘验不洗在前的臆断
  assert.equal(r2.score.total, 30)
})

test('失败不生据：isError 之读不生勘验 → 臆断；isError 之写不入因账', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    read('src/cache.json', 'ENOENT', true),
    write('docs/postmortem.md', '根因是缓存过期导致的数据不一致。\n'),
  ])
  const r = judge(eng)
  assert.equal(r.counts.yd, 1)
  assert.equal(r.score.total, 30)
  const eng2 = createEngine({ book: null })
  feed(eng2, [write('docs/postmortem.md', '根因是缓存过期导致的数据不一致。\n', true)])
  const r2 = judge(eng2)
  assert.equal(r2.paths, 0) // 败写不入因账
  assert.equal(r2.score.total, 0)
})

test('演域豁免：tests/specs/scratch/drafts 名段 + .test./.spec. 尾形，立案前整稿不审不记', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    write('tests/postmortem.spec.md', 'The root cause is a stale cache.\n'),
    write('scratch/排查草稿.md', '根因是缓存过期。\n'),
    write('drafts/incident-notes.md', '根因是缓存过期。\n'),
    write('docs/postmortem.md', '根因是缓存过期导致的数据不一致。\n'),
  ])
  const r = judge(eng)
  assert.equal(r.paths, 1) // 只有 docs/postmortem.md 受审
  assert.equal(r.counts.yd, 1)
})

test('臆册免审：excuse glob 立案前免账；无册照判；register/revoke 去重与报错', () => {
  const book = parseBook(fx('suliu-book.json'))
  const eng = createEngine({ book })
  feed(eng, [write('reports/internal/root-cause-analysis.md', 'Root cause is queue backpressure.\n')])
  const r = judge(eng)
  assert.equal(r.paths, 0)
  const eng2 = createEngine({ book: null })
  feed(eng2, [write('reports/internal/root-cause-analysis.md', 'Root cause is queue backpressure.\n')])
  assert.equal(judge(eng2).counts.yd, 1) // 无册对照
  const b = emptyBook()
  registerEntry(b, 'docs/a/*')
  registerEntry(b, 'docs/a/*')
  assert.equal(bookCount(b), 1) // 重复去重
  assert.throws(() => revokeEntry(b, 'no/such/*'), /无此免审径/)
})

test('诊面门：README/notes 等非诊断文书不审不记（归因形在场也不判）', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    write('README.md', 'The root cause is a stale cache entry.\n'),
    write('docs/notes.md', '根因是缓存过期。\n'),
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
  ])
  const r = judge(eng)
  assert.equal(r.paths, 1)
  assert.equal(r.counts.yd, 1)
})

test('判定序与排序：案按 稿径→行→案别（臆断<望断）；注记排后（显疑→迟验→泛因）', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    write('docs/postmortem.md', '根因是缓存过期。\n\n原因在于队列堆积。\n'), // 3 行：两臆断
    write('docs/incident-b.md', '根因可能是缓存过期。\n'), // 显疑
  ])
  const r = judge(eng)
  assert.equal(r.counts.yd, 2)
  assert.equal(r.counts.xy, 1)
  assert.equal(r.score.total, 60) // min(60, 30×2)
  const issues = r.issues
  const ai = issues.findIndex((s) => s.startsWith('臆断'))
  const yi = issues.findIndex((s) => s.startsWith('注记'))
  assert.ok(ai !== -1 && yi !== -1 && ai < yi) // 案先注记后
  assert.match(issues[0], /臆断：docs\/postmortem\.md:1/)
  assert.match(issues[1], /臆断：docs\/postmortem\.md:3/)
})

test('行案独立：一稿多行多案、同 token 重复行照案、cap 到 60', () => {
  const eng = createEngine({ book: null })
  const lines = Array.from({ length: 5 }, () => '根因是缓存过期导致的数据不一致。').join('\n') + '\n'
  feed(eng, [write('docs/postmortem.md', lines)])
  const r = judge(eng)
  assert.equal(r.counts.yd, 5)
  assert.equal(r.score.yi, 60) // cap
  assert.equal(r.score.total, 60)
})

test('臆值门禁：单臆断 30 红、双望断 30 红、单望断 15 黄牌；分带 澈/望/臆', () => {
  assert.equal(bandOf(0), '澈')
  assert.equal(bandOf(14), '澈')
  assert.equal(bandOf(15), '望')
  assert.equal(bandOf(29), '望')
  assert.equal(bandOf(30), '臆')
  const eng1 = createEngine({ book: null })
  feed(eng1, [write('docs/postmortem.md', '根因是缓存过期导致的数据不一致。\n')])
  assert.equal(judge(eng1).verdict, 'fail') // 单臆断即红
  const eng2 = createEngine({ book: null })
  feed(eng2, [
    read('logs/a.log', 'cache miss storm'),
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
    read('logs/b.log', 'cache miss storm'),
    write('docs/incident.md', 'The root cause is a stale cache entry.\n'),
  ])
  const r2 = judge(eng2)
  assert.equal(r2.counts.wd, 2)
  assert.equal(r2.score.total, 30)
  assert.equal(r2.verdict, 'fail') // 双望断即红
  assert.equal(GATE_DEFAULT, 30)
})

test('末稿立撤：同径净稿换下归因稿 → 旧案随稿撤', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    write('docs/postmortem.md', '根因是缓存过期导致的数据不一致。\n'),
    write('docs/postmortem.md', '问题已定位，修复已上线，监控回归正常。\n'),
  ])
  const r = judge(eng)
  assert.equal(r.paths, 1)
  assert.deepEqual(r.counts, { yd: 0, wd: 0, xy: 0, cy: 0, fy: 0 })
  assert.equal(r.verdict, 'pass')
})

test('judge 幂等：同引擎连判两次逐字段一致；无案无注记出「因皆有验」行', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    read('logs/app.log', 'cache miss storm'),
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
  ])
  const a = judge(eng)
  const b = judge(eng)
  assert.deepEqual(a, b)
  const clean = createEngine({ book: null })
  feed(clean, [write('docs/postmortem.md', '服务已恢复。\n')])
  assert.match(judge(clean).issues[0], /因皆有验 ×1 稿 1 行/)
})

test('合审序：全 at 有数按 (at, 流序, 流内序) 稳定归并；跨会话拔验互认；撞名报错', () => {
  const r = auditStreams(
    [
      { name: 'a.jsonl', text: fx('hejian-a.jsonl') },
      { name: 'b.jsonl', text: fx('hejian-b.jsonl') },
    ],
    { book: null }
  )
  assert.equal(r.calls, 4)
  assert.equal(r.sessions, 2)
  assert.equal(r.score.total, 0) // 拔验跨会话在先清白
  assert.throws(
    () => auditStreams([
      { name: 'a.jsonl', text: fx('hechi-a.jsonl') },
      { name: 'a.jsonl', text: fx('hechi-b.jsonl') },
    ]),
    /撞名/
  )
})

test('掩码：issues 与溯牌块永不携带行原文与因面原文', () => {
  const eng = createEngine({ book: null })
  feed(eng, [write('docs/postmortem.md', '根因是缓存过期导致的数据不一致。\n')])
  const r = judge(eng)
  const all = r.issues.join('\n')
  assert.ok(!all.includes('缓存过期')) // 因面原文不进账面
  assert.match(all, /指纹 [0-9a-f]+/)
  const pai = renderSupai(null, r)
  assert.ok(!pai.includes('缓存过期'))
  assert.match(pai, /【溯流 · 溯牌】/)
  assert.match(pai, /臆册：未立（凡因必验）/)
})

test('夹具全量·一：clean 全 0 澈 / yiduan 30 臆红 / xianyi 显疑 / kanyan 望断 15', () => {
  const run = (name, book = null) => auditStreams([{ name, text: fx(name) }], { book })
  const r1 = run('clean-stream.jsonl')
  assert.deepEqual(r1.counts, { yd: 0, wd: 0, xy: 0, cy: 0, fy: 0 })
  assert.equal(r1.band, '澈')
  const r2 = run('yiduan-stream.jsonl')
  assert.equal(r2.counts.yd, 1)
  assert.equal(r2.score.total, 30)
  assert.equal(r2.verdict, 'fail')
  const r3 = run('xianyi-stream.jsonl')
  assert.equal(r3.counts.xy, 1)
  assert.equal(r3.score.total, 0)
  const r4 = run('kanyan-stream.jsonl')
  assert.equal(r4.counts.wd, 1)
  assert.equal(r4.score.total, 15)
  assert.equal(r4.verdict, 'pass')
})

test('夹具全量·二：bayan 拔验 / chiyan 迟验 / fanyin 泛因 / shibai 败见臆断', () => {
  const run = (name, book = null) => auditStreams([{ name, text: fx(name) }], { book })
  const r1 = run('bayan-stream.jsonl')
  assert.equal(r1.calls, 4)
  assert.equal(r1.score.total, 0)
  const r2 = run('chiyan-stream.jsonl')
  assert.equal(r2.counts.cy, 1)
  assert.equal(r2.score.total, 0)
  const r3 = run('fanyin-stream.jsonl')
  assert.equal(r3.counts.fy, 1)
  assert.equal(r3.score.total, 0)
  const r4 = run('shibai-stream.jsonl')
  assert.equal(r4.counts.yd, 1)
  assert.equal(r4.verdict, 'fail')
})

test('夹具全量·三：mianze 带册免审无册红 / yanma / zhenmian / yingwen / baishi / shuangdao / mogao', () => {
  const run = (name, book = null) => auditStreams([{ name, text: fx(name) }], { book })
  const book = parseBook(fx('suliu-book.json'))
  assert.equal(run('mianze-stream.jsonl', book).paths, 0)
  const mz = run('mianze-stream.jsonl')
  assert.equal(mz.counts.yd, 1)
  assert.equal(mz.verdict, 'fail')
  assert.equal(run('yanma-stream.jsonl').paths, 0)
  assert.equal(run('zhenmian-stream.jsonl').paths, 0)
  const yw = run('yingwen-stream.jsonl')
  assert.equal(yw.counts.yd, 1)
  assert.equal(yw.verdict, 'fail')
  assert.equal(run('baishi-stream.jsonl').paths, 0)
  const sd = run('shuangdao-stream.jsonl')
  assert.equal(sd.counts.wd, 1)
  assert.equal(sd.score.total, 15)
  const mg = run('mogao-stream.jsonl')
  assert.equal(mg.paths, 1)
  assert.equal(mg.score.total, 0)
})

test('跨项目互认：chachu 等七层夹具流喂本层零误伤（诊面门 + 归因形零交集）', () => {
  const names = [
    '../zhizhi/fixtures/sample-stream.jsonl',
    '../kaocheng/fixtures/mixed-stream.jsonl',
    '../dingfen/fixtures/fenced-stream.jsonl',
    '../erbing/fixtures/mixed-stream.jsonl',
    '../erbing/fixtures/delegated-stream.jsonl',
    '../huashui/fixtures/fuji-stream.jsonl',
    '../jiaotuo/fixtures/weizhao-stream.jsonl',
  ]
  for (const rel of names) {
    const text = readFileSync(join(root, rel), 'utf8')
    const r = auditStreams([{ name: rel.split('/').pop(), text }], { book: null })
    assert.deepEqual(r.counts, { yd: 0, wd: 0, xy: 0, cy: 0, fy: 0 }, `${rel} 应零误伤`)
    assert.equal(r.verdict, 'pass')
  }
})

test('门禁翻转：--gate 10 时望断 15 红；--gate 40 时臆断 30 过门', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    read('logs/app.log', 'cache miss storm'),
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
  ])
  assert.equal(judge(eng, { gate: 10 }).verdict, 'fail')
  assert.equal(judge(eng, { gate: 30 }).verdict, 'pass')
  const eng2 = createEngine({ book: null })
  feed(eng2, [write('docs/postmortem.md', '根因是缓存过期导致的数据不一致。\n')])
  assert.equal(judge(eng2, { gate: 40 }).verdict, 'pass')
  assert.equal(judge(eng2, { gate: 30 }).verdict, 'fail')
})

test('CJK bigram 标点切段：「缓存。重启」不出「存重」假窗；段内窗齐', () => {
  const t = tokensOf('缓存。重启')
  assert.ok(t.includes('缓存'))
  assert.ok(t.includes('重启'))
  assert.ok(!t.includes('存重'))
  const t2 = tokensOf('缓存过期，数据不一致')
  assert.ok(t2.includes('缓存') && t2.includes('存过') && t2.includes('过期'))
  assert.ok(!t2.includes('期数')) // 逗号切段
})

test('英文词界：single 词中 cause 不中 root cause；多词形空格容错', () => {
  assert.equal(findGuiyin('the rootcause doc'), null) // rootcause 连写不在英文表（径形归诊面形）
  assert.ok(findGuiyin('It is caused   by X.')) // 多空白容错
  assert.ok(findGuiyin('Stemmed from a bad deploy.'))
})

test('老流 null：isError 未知按已发生入因账；exec 无 content 只认命令原文', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    { name: 'bash', args: { command: 'grep cache app.log' }, isError: null, content: null },
    { name: 'write', args: { path: 'docs/postmortem.md', content: 'The root cause is a stale cache entry.\n' }, isError: null },
  ])
  const r = judge(eng)
  assert.equal(r.counts.wd, 1) // 勘验（命令原文含 cache）成立 → 望断
  assert.equal(r.paths, 1) // null 写按已发生入账
})

test('一行一案：多归因形同行只取首形，至多一案不双罚', () => {
  const eng = createEngine({ book: null })
  feed(eng, [write('docs/postmortem.md', '根因是缓存过期，原因在于配置漂移。\n')])
  const r = judge(eng)
  assert.equal(r.counts.yd, 1) // 首形「根因」一案，不因「原因在于」再案
})

test('复合句推词降档：前确后疑整行显疑（降档方向是宽方向）', () => {
  const eng = createEngine({ book: null })
  feed(eng, [write('docs/postmortem.md', '根因是缓存过期，估计需要重启服务。\n')])
  const r = judge(eng)
  assert.equal(r.counts.yd, 0) // 推词「估计」整行降档
  assert.equal(r.counts.xy, 1)
})

test('勘验 exec 半边：成功 exec 命令原文含因面词元 → 望断；失败 exec 命令不生勘验（退重演或臆断）', () => {
  const eng = createEngine({ book: null })
  feed(eng, [
    exec('grep cache /var/log/app'),
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
  ])
  assert.equal(judge(eng).counts.wd, 1) // 成功 exec 命令勘验
  const eng2 = createEngine({ book: null })
  feed(eng2, [
    exec('grep cache /var/log/app', true, 'no match'),
    write('docs/postmortem.md', 'The root cause is a stale cache entry.\n'),
  ])
  assert.equal(judge(eng2).counts.yd, 1) // 失败 exec 不生勘验、单笔不成重演
})
