/**
 * 核心语义测试 —— 流解析 / 码面豁免 / 湮形扫描 / 文账引擎 / 判定序 / 塞值门禁 /
 * issues 行 / 导牌渲染 / 川册语义（docs/04 的 A1/A5）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath } from '../src/core/object.js'
import { isCodePath } from '../src/core/mamian.js'
import { scanContent, GUIDE_WORDS } from '../src/core/yanxing.js'
import {
  createEngine, recordCall, judge, settleLines, bandOf, GATE_DEFAULT,
} from '../src/core/wenzhang.js'
import { parseBook, emptyBook, registerPath, revokePath, serializeBook } from '../src/core/chuanzhou.js'
import { renderDaopai } from '../src/core/daopai.js'

// ---- 流解析 ---------------------------------------------------------------

test('流解析：# 注释与空行跳过，坏 JSON 行报行号', () => {
  const events = parseStream('# 注释\n\n{"type":"tool_call","id":"a","name":"write","args":{}}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"type":"tool_call"}\n坏行\n'), /第 2 行/)
})

test('流解析：id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"a","name":"write","args":{"path":"p"}}\n' +
    '{"type":"tool_result","id":"a","isError":false,"content":"正文"}\n' +
    '{"type":"tool_result","id":"ghost","name":"bash","isError":true}\n' +
    '{"type":"tool_call","name":"bash","args":{"command":"ls"}}\n' +
    '{"type":"tool_result","isError":false}\n',
  ))
  assert.equal(calls.length, 3)
  assert.equal(calls[0].content, '正文')
  assert.equal(calls[1].isError, true)
  assert.equal(calls[2].isError, false)
})

test('对象键与工具族四分、径规整同全仓', () => {
  assert.equal(objectKey({ path: 'a', command: 'ls' }, 'x'), 'p:a')
  assert.equal(familyOf('edit'), 'write')
  assert.equal(familyOf('run_command'), 'exec')
  assert.equal(normalizePath('./x//'), 'x')
})

// ---- 码面豁免（docs/03 §2） -----------------------------------------------

test('码面：代码之径受扫', () => {
  assert.equal(isCodePath('src/app.js'), true)
  assert.equal(isCodePath('lib/mod.py'), true)
  assert.equal(isCodePath('Makefile'), true)
})

test('码面：文档与数据后缀豁免在立案前', () => {
  for (const p of ['docs/guide.md', 'out/result.json', 'a.yml', 'b.yaml', 'notes.txt', 'x.svg', 't.csv', 'd.rst', 'c.adoc', 'b.mdx']) {
    assert.equal(isCodePath(p), false, p)
  }
})

test('码面：压缩产物与快照段豁免（豁免整个快照目录）', () => {
  assert.equal(isCodePath('dist/app.min.js'), false)
  assert.equal(isCodePath('test/fixtures/a.snap'), true) // .snap 无豁免、不在快照段 → 受扫
  assert.equal(isCodePath('test/__snapshots__/a.snap'), false) // 快照段内一切豁免
})

// ---- 湮形扫描（docs/03 §3） -----------------------------------------------

test('形 1 空捕：catch (e) { } 与 catch { }（多行体剥空白为空）', () => {
  assert.deepEqual(scanContent('try {\n  load()\n} catch (e) {\n}\n'), [{ line: 3, form: '空捕' }])
  assert.deepEqual(scanContent('try { x() } catch {}'), [{ line: 1, form: '空捕' }])
  assert.deepEqual(scanContent('try { x() } catch (Exception e) { }'), [{ line: 1, form: '空捕' }])
})

test('形 2 空还：体恰为 return;；return null 降级不判', () => {
  assert.deepEqual(scanContent('try { x() } catch (e) { return; }'), [{ line: 1, form: '空还' }])
  assert.deepEqual(scanContent('try { x() } catch (e) { return null }'), [])
})

test('形 3 空接：null / undefined / 空体箭头 / 空函数四写法；导词在场的表达式清白；其余宁纵', () => {
  for (const expr of ['.catch(() => {})', '.catch(() => null)', '.catch(() => undefined)', '.catch(function () {})']) {
    assert.deepEqual(scanContent(`fetch(u) ${expr}`), [{ line: 1, form: '空接' }], expr)
  }
  assert.deepEqual(scanContent('fetch(u).catch(() => console.error(e))'), [])
  assert.deepEqual(scanContent('fetch(u).catch(() => fallback())'), [])
})

test('空捕与空接不双计：.catch(function(){}) 只记空接一处', () => {
  assert.equal(scanContent('fetch(u).catch(function () {})').length, 1)
})

test('形 4 单行空捕：except: pass 与 except Exception: pass 同行体（行尾注释不碍）', () => {
  assert.deepEqual(scanContent('try:\n    x()\nexcept: pass\n'), [{ line: 3, form: '单行空捕' }])
  assert.deepEqual(scanContent('try:\n    x()\nexcept Exception: pass  # 宽捕\n'), [{ line: 3, form: '单行空捕' }])
})

test('形 4 反例：except 体内有导词即清白', () => {
  assert.deepEqual(scanContent('try:\n    x()\nexcept Exception:\n    print(e)\n'), [])
})

test('形 5 多行空捕：体全为 pass/.../注释/空行；有实码即不判', () => {
  assert.deepEqual(
    scanContent('try:\n    x()\nexcept Exception:\n    # 说明\n    pass\n'),
    [{ line: 3, form: '多行空捕' }],
  )
  assert.deepEqual(scanContent('try:\n    x()\nexcept Exception:\n    raise\n'), [])
})

test('形 6 空救：rescue 到同缩进 end 体全空；有实码不判', () => {
  assert.deepEqual(scanContent('begin\n  x\nrescue\nend\n'), [{ line: 3, form: '空救' }])
  assert.deepEqual(scanContent('begin\n  x\nrescue\n  log e\nend\n'), [])
})

test('catch 体唯注释不判（宁纵——词法不析注释）；导词表 12 词在册', () => {
  assert.deepEqual(scanContent('try { x() } catch (e) { /* 说明 */ }'), [])
  assert.equal(GUIDE_WORDS.length, 12)
})

test('行号按命中起始行计（1-based）', () => {
  const content = 'a\nb\nc\ntry {\n  x()\n} catch (e) {\n}\n'
  assert.deepEqual(scanContent(content), [{ line: 6, form: '空捕' }])
})

test('同一末文多处吞形逐处计案、按行序排列', () => {
  const hits = scanContent('try { a() } catch (e) { }\ntry { b() } catch (e) { return; }\nfetch(c).catch(() => null)\n')
  assert.deepEqual(hits, [
    { line: 1, form: '空捕' },
    { line: 2, form: '空还' },
    { line: 3, form: '空接' },
  ])
})

test('形 5 多行空捕：体为省略号（...）亦判空', () => {
  assert.deepEqual(scanContent('try:\n    x()\nexcept Exception:\n    ...\n'), [{ line: 3, form: '多行空捕' }])
})

test('同径多笔写并一文账档：末文取最后一笔带 content 之写', () => {
  const engine = feed([
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'v1\n' }, isError: false },
    { session: 's', name: 'edit', args: { path: 'src/a.js' }, isError: false },
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
  ])
  const lines = settleLines(engine)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].state, '湮案')
  assert.equal(lines[0].gauge, 0)
  assert.equal(lines[0].last.seq, 3)
})

test('沙川每径只记末笔落点，how 按词面判型（重定向 ∪ cp/touch 落点）', () => {
  const lines = settleLines(feed([
    { session: 's', name: 'bash', args: { command: 'cp t src/a.js && echo x > src/a.js' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'touch src/b.js' }, isError: false },
  ]))
  const a = lines.find((l) => l.path === 'src/a.js')
  const b = lines.find((l) => l.path === 'src/b.js')
  assert.equal(a.state, '沙川')
  assert.equal(a.sand.how, '重定向')
  assert.equal(a.sand.seq, 1) // 每径一笔，末落定基点
  assert.equal(b.sand.how, 'touch 落点')
})

// ---- 文账引擎（docs/03 §2/§5） --------------------------------------------

function feed(events, book = null) {
  const engine = createEngine({ book })
  for (const e of events) recordCall(engine, e)
  return engine
}

test('write 族 p: 命中码面入文账；带 content 之写为末文', () => {
  const lines = settleLines(feed([
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'const x = 1\n' }, isError: false },
  ]))
  assert.equal(lines.length, 1)
  assert.equal(lines[0].state, '净川')
})

test('文档豁免后缀不入文账（豁免在立案前）', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'docs/guide.md', content: 'catch (e) { }' }, isError: false },
  ]))
  assert.equal(r.paths, 0)
})

test('isError=true 失败之写不入账；isError 未知按已发生入账', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'x' }, isError: true },
    { session: 's', name: 'write', args: { path: 'src/b.js', content: 'y' }, isError: null },
  ]))
  assert.equal(r.calls, 2)
  assert.equal(r.paths, 1)
})

test('观察不是写：read 永不入文账', () => {
  const r = judge(feed([
    { session: 's', name: 'read', args: { path: 'src/a.js' }, isError: false },
  ]))
  assert.equal(r.paths, 0)
  assert.match(r.issues[0], /川皆宣/)
})

test('无文之写（edit 族不携全文）判无文，零分诚实沉默', () => {
  const r = judge(feed([
    { session: 's', name: 'edit', args: { path: 'src/a.js' }, isError: false },
  ]))
  assert.deepEqual(r.cases, { yan: 0, jun: 0, sha: 0, wu: 1 })
})

test('exec 重定向/cp/touch 落点命中码面 → 沙川；rm 段不计', () => {
  const r = judge(feed([
    { session: 's', name: 'bash', args: { command: 'echo ok > src/a.js' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'cp t src/b.js' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'touch src/c.js' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'rm -f src/d.js' }, isError: false },
  ]))
  assert.deepEqual(r.cases, { yan: 0, jun: 0, sha: 3, wu: 0 })
})

test('重定向 2>&1 天然不中；沙川不与文账重复记', () => {
  const r = judge(feed([
    { session: 's', name: 'bash', args: { command: 'npm test 2>&1' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'echo x > src/a.js' }, isError: false },
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'const a = 1\n' }, isError: false },
  ]))
  assert.deepEqual(r.cases, { yan: 0, jun: 0, sha: 0, wu: 0 })
  assert.equal(r.paths, 1)
})

test('湮案：末文命中 +15/处，逐处点名（径:行:形）', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'try {\n  x()\n} catch (e) {\n}\n' }, isError: false },
  ]))
  assert.deepEqual(r.cases, { yan: 1, jun: 0, sha: 0, wu: 0 })
  assert.equal(r.score.total, 15)
  assert.match(r.issues[0], /湮案：src\/a\.js:3 空捕/)
})

test('考末文：先写吞形后改净 → 已浚零分；无文之改不改末文（gauge 注记）', () => {
  const jun = judge(feed([
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'try { x() } catch (e) { throw e }\n' }, isError: false },
  ]))
  assert.deepEqual(jun.cases, { yan: 0, jun: 1, sha: 0, wu: 0 })
  assert.match(jun.issues[0], /已浚：src\/a\.js（改净于 seq 2）/)
  const laoliu = judge(feed([
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
    { session: 's', name: 'edit', args: { path: 'src/a.js' }, isError: false },
  ]))
  assert.equal(laoliu.score.total, 15)
  assert.match(laoliu.issues.join('\n'), /无文之改 1 笔/)
})

test('川册纵列免扫：indulge 命中之径不入文账（逐字 ∪ 宽 glob 跨目录）', () => {
  const book = { version: 1, indulge: ['src/best-effort/*'] }
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'src/best-effort/cleanup.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
    { session: 's', name: 'write', args: { path: 'src/other.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
  ], book))
  assert.deepEqual(r.cases, { yan: 1, jun: 0, sha: 0, wu: 0 })
})

// ---- 塞值与门禁（docs/03 §6） ---------------------------------------------

test('塞值公式与分带：宣 0–14 / 淤 15–29 / 塞 ≥30；封顶 60', () => {
  const two = judge(feed([
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
    { session: 's', name: 'write', args: { path: 'src/b.py', content: 'try:\n    x()\nexcept:\n    pass\n' }, isError: false },
  ]))
  assert.equal(two.score.total, 30)
  assert.equal(two.band, '塞')
  assert.equal(two.verdict, 'fail')
  const four = judge(feed([
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
    { session: 's', name: 'write', args: { path: 'src/b.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
    { session: 's', name: 'write', args: { path: 'src/c.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
    { session: 's', name: 'write', args: { path: 'src/d.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
  ]))
  assert.equal(four.cases.yan, 4)
  assert.equal(four.score.yan, 60)
  for (const [v, b] of [[0, '宣'], [14, '宣'], [15, '淤'], [29, '淤'], [30, '塞']]) {
    assert.equal(bandOf(v), b, String(v))
  }
  assert.equal(GATE_DEFAULT, 30)
})

test('门禁默认 30：单湮案黄牌过门、两案红；gate 可调', () => {
  const one = feed([{ session: 's', name: 'write', args: { path: 'src/a.js', content: 'try { x() } catch (e) { }\n' }, isError: false }])
  assert.equal(judge(one).verdict, 'pass')
  assert.equal(judge(one, { gate: 10 }).verdict, 'fail')
})

test('issues 行序锁死：湮案 → 已浚 → 沙川 → 无文 → 注记 → 全宣', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'src/z.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'echo x > src/s.js' }, isError: false },
    { session: 's', name: 'edit', args: { path: 'src/w.js' }, isError: false },
  ]))
  assert.equal(r.issues[0].startsWith('湮案'), true)
  assert.equal(r.issues[1].startsWith('沙川'), true)
  assert.equal(r.issues[2].startsWith('无文'), true)
  const jun = judge(feed([
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'ok\n' }, isError: false },
    { session: 's', name: 'write', args: { path: 'src/kept.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
    { session: 's', name: 'edit', args: { path: 'src/kept.js' }, isError: false },
  ]))
  assert.equal(jun.issues[0].startsWith('湮案'), true) // src/kept.js 末文后无文之改，湮案照计
  assert.equal(jun.issues[1].startsWith('已浚'), true) // src/a.js 改净
  assert.match(jun.issues.join('\n'), /注记：src\/kept\.js 末文后无文之改 1 笔/)
})

test('全宣行：无案无注记时唯一 issue', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'src/ok.js', content: 'const a = 1\n' }, isError: false },
  ]))
  assert.deepEqual(r.issues, ['川皆宣 ×0 —— 为民者，宣之使言'])
})

test('judge 幂等：重放同流必得同判词', () => {
  const engine = feed([
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'try { x() } catch (e) { }\n' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'echo x > src/s.js' }, isError: false },
  ])
  assert.deepEqual(judge(engine), judge(engine))
})

test('settleLines 排序：按规整径字典序', () => {
  const lines = settleLines(feed([
    { session: 's', name: 'write', args: { path: 'src/b.js', content: 'x\n' }, isError: false },
    { session: 's', name: 'write', args: { path: 'src/a.js', content: 'y\n' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'echo x > src/c.js' }, isError: false },
  ]))
  assert.deepEqual(lines.map((l) => l.path), ['src/a.js', 'src/b.js', 'src/c.js'])
})

// ---- 川册语义（docs/03 §4） -----------------------------------------------

test('川册解析：坏 JSON / indulge 非字符串数组报错；去重保序', () => {
  assert.throws(() => parseBook('不是 JSON'), /合法 JSON/)
  assert.throws(() => parseBook('{"indulge": [1]}'), /非空字符串数组/)
  const b = parseBook('{"indulge": ["a", "a", "b"]}')
  assert.deepEqual(b.indulge, ['a', 'b'])
})

test('registerPath 去重；revokePath 找不到返回 null；序列化往返一致', () => {
  const b = emptyBook()
  assert.equal(registerPath(b, 'x*').added, true)
  assert.equal(registerPath(b, 'x*').added, false)
  assert.equal(revokePath(b, 'y'), null)
  assert.equal(revokePath(b, 'x*').indulge.length, 0)
  const rt = parseBook(serializeBook(parseBook('{"indulge":["a"]}')))
  assert.deepEqual(rt, { version: 1, indulge: ['a'] })
})

// ---- 导牌块（docs/03 §7 / 04 A5） -----------------------------------------

test('导牌块逐字节确定：同输入两次渲染一致，含湮形与川册公示', () => {
  const book = parseBook('{"indulge": ["src/best-effort/*"]}')
  const a = renderDaopai(book)
  const b = renderDaopai(book)
  assert.equal(a, b)
  assert.match(a, /【防川 · 导牌】/)
  assert.match(a, /湮形：空捕、空还、空接、单行空捕、多行空捕、空救（6 形；导词 12 词）/)
  assert.match(a, /川册：纵列 1 径（src\/best-effort\/\*）/)
})

test('导牌块无册出确定性文本', () => {
  assert.match(renderDaopai(null), /川册：未立（纵列无据，湮形全护）/)
})

test('导牌块带判词出案账，且永不携带命中行原文', () => {
  const engine = createEngine({ book: null })
  recordCall(engine, { session: 's', name: 'write', args: { path: 'src/a.js', content: 'try {\n  机密调用()\n} catch (e) {\n}\n' }, isError: false })
  const judged = judge(engine)
  const text = renderDaopai(null, judged)
  assert.match(text, /案账：湮 1 · 已浚 0 · 沙川 0 · 无文 0/)
  assert.match(text, /湮案：src\/a\.js:3 空捕/)
  assert.ok(!text.includes('机密调用'))
})
