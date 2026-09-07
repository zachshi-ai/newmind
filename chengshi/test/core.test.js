/**
 * 核心语义测试 —— 流解析 / 施主与遂形 / 遂账通道 / 消据成物之柄 / 再命承施 /
 * 判定序与重值 / 遂册 / 遂牌掩码与行序（docs/04 的 A1）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseStream, buildItems } from '../src/core/stream.js'
import { objectKey, familyOf } from '../src/core/object.js'
import { segments, tokenize, collapseWs, globMatch, fingerprint } from '../src/core/lexicon.js'
import { deedHead, matchSegment } from '../src/core/suixing.js'
import { extractHandle, isUndoSegment } from '../src/core/chengwu.js'
import { objectTokens, matchRemand } from '../src/core/suming.js'
import {
  createEngine, recordCall, recordPrincipal, judge, settleKeys, bandOf, nameOf, GATE_DEFAULT,
} from '../src/core/suizhang.js'
import { emptyBook, parseBook, allowKey, disallowKey, serializeBook } from '../src/core/suice.js'
import { renderSuipai, renderSuipaiWithLedger } from '../src/core/suipai.js'

// ---- 流解析（docs/03 §2）--------------------------------------------------

test('流解析：# 注释与空行跳过，坏 JSON 行报行号', () => {
  const events = parseStream('# 注释\n\n{"type":"tool_call","id":"a","name":"bash","args":{}}\n')
  assert.equal(events.length, 1)
  assert.throws(() => parseStream('{"type":"tool_call"}\n坏行\n'), /第 2 行/)
})

test('流解析：id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call', () => {
  const { items } = buildItems(parseStream(
    '{"type":"tool_call","id":"a","name":"bash","args":{"command":"x"}}\n' +
    '{"type":"tool_result","id":"a","isError":false,"content":"正文"}\n' +
    '{"type":"tool_result","id":"ghost","name":"bash","args":{"command":"y"},"isError":true}\n' +
    '{"type":"tool_call","name":"bash","args":{"command":"z"}}\n' +
    '{"type":"tool_result","isError":false,"content":"w"}\n',
  ), 's')
  const callsOnly = items.filter((i) => i.kind === 'call')
  assert.equal(callsOnly.length, 3)
  assert.equal(callsOnly[0].content, '正文')
  assert.equal(callsOnly[1].isError, true)
  assert.equal(callsOnly[2].content, 'w')
})

test('流解析：principal 入账、turn_start/reanchor/appeal 跳过、ord 混排递增', () => {
  const { items } = buildItems(parseStream(
    '{"type":"turn_start"}\n' +
    '{"type":"tool_call","id":"a","name":"bash","args":{"command":"x"}}\n' +
    '{"type":"principal","text":"再发一遍"}\n' +
    '{"type":"reanchor"}\n' +
    '{"type":"appeal","text":"请问"}\n' +
    '{"type":"tool_result","id":"a","isError":false}\n' +
    '{"type":"turn_end"}\n',
  ), 's')
  assert.equal(items.length, 2)
  assert.equal(items[0].kind, 'call')
  assert.equal(items[1].kind, 'principal')
  assert.equal(items[1].text, '再发一遍')
  assert.deepEqual(items.map((i) => i.ord), [0, 1])
})

// ---- 对象族与施主（docs/03 §2/§3）-----------------------------------------

test('对象键与工具族四分同全仓', () => {
  assert.equal(objectKey({ path: 'a', command: 'ls' }, 'x'), 'p:a')
  assert.equal(objectKey({ command: ' npm test ' }, 'x'), 'c:npm test')
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('edit'), 'write')
  assert.equal(familyOf('read'), 'observe')
})

test('施主：剥环境前缀与包装词、basename 小写；遂键规整保大小写', () => {
  assert.equal(deedHead(tokenize('FOO=1 sudo /usr/bin/GH pr create')), 'gh')
  assert.equal(deedHead(tokenize('nohup curl -d x')), 'curl')
  assert.equal(deedHead(tokenize('--flag only')), 'only') // 无真命令的段匹配不到遂形，施主只是探针
  assert.equal(collapseWs('  a   b\tc '), 'a b c')
})

// ---- 遂形（docs/03 §3）----------------------------------------------------

test('启族：gh 建档/评论/发版/片/标', () => {
  assert.equal(matchSegment(tokenize('gh pr create --title t'))?.name, 'gh 建档')
  assert.equal(matchSegment(tokenize('gh issue create --title t'))?.name, 'gh 建档')
  assert.equal(matchSegment(tokenize('gh issue comment 5 --body b'))?.name, 'gh 评论')
  assert.equal(matchSegment(tokenize('gh release create v1 --notes n'))?.name, 'gh 发版')
  assert.equal(matchSegment(tokenize('gh gist create f.md'))?.name, 'gh 片')
  assert.equal(matchSegment(tokenize('gh label create bug'))?.name, 'gh 标')
})

test('启族：gh api 显 POST 与默 POST；显式非 POST 不入', () => {
  assert.equal(matchSegment(tokenize('gh api /x -X POST'))?.name, 'gh api 显 POST')
  assert.equal(matchSegment(tokenize('gh api /x --method POST'))?.name, 'gh api 显 POST')
  assert.equal(matchSegment(tokenize('gh api /x -f k=v'))?.name, 'gh api 默 POST')
  assert.equal(matchSegment(tokenize('gh api /x -X GET')), null)
  assert.equal(matchSegment(tokenize('gh api /x')), null)
})

test('邮族：mail/mailx/sendmail/mutt/msmtp 五基名在岗', () => {
  for (const h of ['mail', 'mailx', 'sendmail', 'mutt', 'msmtp']) {
    assert.equal(matchSegment(tokenize(`${h} -s subj a@b.example`))?.family, '邮', h)
  }
  assert.equal(matchSegment(tokenize('mailq')), null)
})

test('单族：显 POST 与默 POST；显式 PUT/GET 与 PATCH 不入', () => {
  assert.equal(matchSegment(tokenize('curl -X POST https://a.example/x'))?.name, '显 POST')
  assert.equal(matchSegment(tokenize('wget --request POST https://a.example/x'))?.name, '显 POST')
  assert.equal(matchSegment(tokenize("curl -d '{\"k\":1}' https://a.example/x"))?.name, '默 POST')
  assert.equal(matchSegment(tokenize('curl -F f=1 https://a.example/x'))?.name, '默 POST')
  assert.equal(matchSegment(tokenize('curl -X PUT -d k=1 https://a.example/x')), null)
  assert.equal(matchSegment(tokenize('curl -X PATCH https://a.example/x')), null)
  assert.equal(matchSegment(tokenize('curl https://a.example/x')), null)
})

test('单族：httpie POST 在岗、GET 不入', () => {
  assert.equal(matchSegment(tokenize('http POST a.example/x k=1'))?.name, 'httpie')
  assert.equal(matchSegment(tokenize('https GET a.example/x')), null)
})

test('排除即边界：npm publish/terraform apply/git push/npm test 皆非遂形', () => {
  for (const c of [
    'npm publish --access public',
    'terraform apply -var env=prod',
    'git push origin main',
    'npm test',
    'send_invoice --id INV-2041',
  ]) {
    assert.equal(matchSegment(tokenize(c)), null, c)
  }
})

// ---- 遂账通道（docs/03 §2）------------------------------------------------

test('遂账通道：观察不是施、失败不遂、write 族永不入账', () => {
  const e = createEngine()
  recordCall(e, { session: 's', name: 'read', args: { path: 'a' }, isError: false })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'mail -s x b@c' }, isError: true })
  recordCall(e, { session: 's', name: 'write', args: { path: 'a', content: 'gh issue create' }, isError: false })
  assert.equal(e.deeds.length, 0)
  const r = judge(e)
  assert.equal(r.keys, 0)
})

test('遂账通道：老流无 isError 按已发生；段切并行分段各成遂', () => {
  const e = createEngine()
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh issue create --title t' }, isError: null })
  const r1 = judge(e)
  assert.deepEqual(r1.cases, { chu: 1, chong: 0, xiao: 0, huo: 0, cheng: 0 })
  const e2 = createEngine()
  recordCall(e2, { session: 's', name: 'bash', args: { command: 'gh issue create --title t && gh pr create --title u' }, isError: false })
  assert.equal(judge(e2).keys, 2) // 两个段两个键
})

test('遂账通道：同段规整并键——空白折叠、变参不入键', () => {
  const e = createEngine()
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh issue create --title a' }, isError: false })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh  issue create --title a' }, isError: false }) // 折叠后同键
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh issue create --title b' }, isError: false }) // 变参异键
  const r = judge(e)
  assert.deepEqual(r.cases, { chu: 2, chong: 1, xiao: 0, huo: 0, cheng: 0 })
})

// ---- 消据与成物之柄（docs/03 §5.1）----------------------------------------

test('成物之柄：URL 路径末段资源号；无 URL 为 null', () => {
  assert.equal(extractHandle('see https://github.com/acme/app/issues/7 for details'), '7')
  assert.equal(extractHandle('merged https://github.com/acme/app/pull/42.'), '42')
  assert.equal(extractHandle('https://gist.github.com/me/abc123'), 'abc123')
  assert.equal(extractHandle('{"order":43,"ok":true}'), null)
  assert.equal(extractHandle(null), null)
})

test('消据：消词 ∧ 柄资源号整词元；缺一不成立', () => {
  assert.equal(isUndoSegment(tokenize('gh issue close 7 --reason done'), '7'), true)
  assert.equal(isUndoSegment(tokenize('gh issue close 8'), '7'), false)
  assert.equal(isUndoSegment(tokenize('gh issue view 7'), '7'), false)
  assert.equal(isUndoSegment(tokenize('curl -X DELETE https://x.example/orders/15'), '15'), true)
  assert.equal(isUndoSegment(tokenize('curl -X DELETE https://x.example/orders/150'), '15'), false)
  assert.equal(isUndoSegment(tokenize('gh issue close 7'), null), false)
})

test('已消：消据之后的同串再施是补过之施（0 分注记）', () => {
  const e = createEngine()
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh issue create --title t --body b' }, isError: false, content: 'https://github.com/a/r/issues/7' })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh issue close 7' }, isError: false })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh issue create --title t --body b' }, isError: false })
  const r = judge(e)
  assert.deepEqual(r.cases, { chu: 1, chong: 0, xiao: 1, huo: 0, cheng: 0 })
  assert.equal(r.score.total, 0)
  assert.match(r.issues.find((i) => i.startsWith('已消')), /消于 seq 1/)
})

test('末消：末笔之后有消据只注记不销案（善后不追回双生之物）', () => {
  const e = createEngine()
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh issue create --title t' }, isError: false, content: 'https://github.com/a/r/issues/9' })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh issue create --title t' }, isError: false })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh issue close 9' }, isError: false })
  const r = judge(e)
  assert.deepEqual(r.cases, { chu: 1, chong: 1, xiao: 0, huo: 0, cheng: 0 })
  assert.equal(r.score.total, 30) // 重决照记
  assert.ok(r.issues.some((i) => i.startsWith('末消：')), '末消注记在案')
})

test('消跨会话有效：下一会话收尾上一会话的双生物', () => {
  const e = createEngine()
  recordCall(e, { session: 'a', name: 'bash', args: { command: 'curl -d k=1 https://x.example/orders/15' }, isError: false, content: 'https://x.example/orders/15' })
  recordCall(e, { session: 'a', name: 'bash', args: { command: 'curl -d k=1 https://x.example/orders/15' }, isError: false })
  recordCall(e, { session: 'b', name: 'bash', args: { command: 'curl -X DELETE https://x.example/orders/15' }, isError: false })
  recordCall(e, { session: 'b', name: 'bash', args: { command: 'curl -d k=1 https://x.example/orders/15' }, isError: false })
  const r = judge(e)
  // 第二笔在消据（ord 2）之前照记重决；消据之后的第三笔是补过之施
  assert.deepEqual(r.cases, { chu: 1, chong: 1, xiao: 1, huo: 0, cheng: 0 })
  assert.equal(r.score.total, 30)
})

// ---- 再命与承施（docs/03 §5.2）---------------------------------------------

test('承施·对象通道：主文含遂键对象词元', () => {
  const p = { session: 's', ord: 1, text: '把 metrics 那个 PR 再建一次' }
  const d = { session: 's', ord: 2, key: 'gh pr create --title "Add metrics"' }
  assert.equal(matchRemand(p, d, 2), '对象')
})

test('承施·命词通道：只认 principal 后同会话首笔遂（一次再命只开一决）', () => {
  const key = 'gh release create v1 --notes n'
  assert.equal(objectTokens(key).includes('release'), true)
  const p = { session: 's', ord: 1, text: '公告好像没发出去，再发一遍。' }
  assert.equal(matchRemand(p, { session: 's', ord: 2, key }, 2), '命词')
  // 第二笔再施：首笔遂不是它 → 命词通道不认
  assert.equal(matchRemand(p, { session: 's', ord: 3, key }, 2), null)
})

test('承施：跨会话主文不认命；先命之遂不溯既往', () => {
  const key = 'gh release create v1 --notes n'
  assert.equal(matchRemand({ session: 'other', ord: 1, text: '再发一遍' }, { session: 's', ord: 2, key }, 2), null)
  // 主文在两笔之后 → 不认
  assert.equal(matchRemand({ session: 's', ord: 5, text: '再发一遍' }, { session: 's', ord: 2, key }, 2), null)
})

// ---- 判定序与重值（docs/03 §5/§6）-----------------------------------------

test('判定序：豁 > 消 > 承 > 重决——允列优先于一切案别', () => {
  const book = { version: 1, allow: ['curl -d*'] }
  const e = createEngine({ book })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'curl -d a=1 https://x.example/y' }, isError: false })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'curl -d a=1 https://x.example/y' }, isError: false })
  const r = judge(e)
  assert.deepEqual(r.cases, { chu: 1, chong: 0, xiao: 0, huo: 1, cheng: 0 })
})

test('重值：30/案、cap 60、单重决即红（门 30）', () => {
  const e = createEngine()
  const cmd = 'mail -s "disk full" ops@example.com'
  for (let i = 0; i < 5; i++) recordCall(e, { session: 's', name: 'bash', args: { command: cmd }, isError: false })
  const r = judge(e)
  assert.deepEqual(r.score, { chong: 60, total: 60 })
  assert.equal(r.band, '沓')
  assert.equal(r.verdict, 'fail')
  assert.deepEqual(r.cases, { chu: 1, chong: 4, xiao: 0, huo: 0, cheng: 0 })
  const g = judge(e, { gate: 61 })
  assert.equal(g.verdict, 'pass')
})

test('分带：谐 0–29 / 叠 30–59 / 沓 ≥60；judge 幂等（重放同判词）', () => {
  assert.deepEqual([0, 29, 30, 59, 60].map(bandOf), ['谐', '谐', '叠', '叠', '沓'])
  assert.equal(GATE_DEFAULT, 30)
  const e = createEngine()
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh pr create --title t' }, isError: false })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh pr create --title t' }, isError: false })
  const a = judge(e)
  const b = judge(e)
  assert.deepEqual(a, b)
})

test('遂名掩码：形词 + 指纹，同名异键异纹、同键同纹', () => {
  const f = { words: ['gh', 'issue', 'create'] }
  const n1 = nameOf(f, 'gh issue create --title a')
  const n2 = nameOf(f, 'gh issue create --title b')
  assert.equal(n1.startsWith('gh·issue·create '), true)
  assert.notEqual(n1, n2)
  assert.equal(nameOf(f, 'gh issue create --title a'), n1)
  assert.match(n1, /^[a-z·A-Z0-9]+ [0-9a-f]{8}$/)
})

// ---- 遂册（docs/03 §4）----------------------------------------------------

test('遂册：allow glob 跨字符命中、逐字相等；去重与销允', () => {
  const book = emptyBook()
  assert.equal(allowKey(book, 'curl -d*hooks.example/beat*').added, true)
  assert.equal(allowKey(book, 'curl -d*hooks.example/beat*').added, false)
  assert.equal(globMatch('curl -d \'{"beat":1}\' https://hooks.example/beat', 'curl -d*hooks.example/beat*'), true)
  assert.equal(globMatch('curl -d x https://api.example.com/hooks', 'curl -d*hooks.example/beat*'), false)
  assert.equal(globMatch('exact key', 'exact key'), true)
  assert.equal(disallowKey(book, 'nope'), null)
  assert.equal(disallowKey(book, 'curl -d*hooks.example/beat*').allow.length, 0)
})

test('遂册：解析与序列化', () => {
  const b = parseBook('{"version":1,"allow":["a","b"]}')
  assert.deepEqual(b.allow, ['a', 'b'])
  assert.throws(() => parseBook('{"version":2}'), /版本/)
  assert.throws(() => parseBook('{"version":1,"allow":[1]}'), /字符串数组/)
  assert.match(serializeBook(parseBook(serializeBook(b))), /"version": 1/)
})

// ---- 遂牌块（docs/03 §7/§8）-----------------------------------------------

test('遂牌块：逐字节确定；无册确定性文本；不携带命令原文', () => {
  const book = { version: 1, allow: ['curl -d*hooks.example/beat*'] }
  const t1 = renderSuipai(book)
  const t2 = renderSuipai(book)
  assert.equal(t1, t2)
  assert.match(t1, /【成事 · 遂牌】/)
  assert.match(t1, /遂形：15 形（启 7 · 邮 5 · 单 3）/)
  assert.match(t1, /遂册：允 1 键/)
  assert.match(renderSuipai(null), /遂册：未立（允列无据，已遂照账）/)

  const e = createEngine()
  recordCall(e, { session: 's', name: 'bash', args: { command: 'mail -s "disk full" ops@example.com' }, isError: false })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'mail -s "disk full" ops@example.com' }, isError: false })
  const judged = judge(e)
  const full = renderSuipaiWithLedger(book, judged)
  assert.equal(full, renderSuipaiWithLedger(book, judge(e)))
  assert.match(full, /重决：mail [0-9a-f]{8} ×1/)
  assert.ok(!full.includes('ops@example.com') && !full.includes('disk full'), '命令原文与实参不进遂牌')
})

test('issues 行序锁死：重决 → 已消 → 豁施 → 承施 → 末消 → 全谐；运行时附线上无主文注记', () => {
  const book = { version: 1, allow: ['curl -d*h.example/beat*'] }
  const e = createEngine({ book })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh issue create --title t' }, isError: false, content: 'https://github.com/a/r/issues/7' })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh issue create --title t' }, isError: false })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'curl -d b=1 https://h.example/beat' }, isError: false })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'curl -d b=1 https://h.example/beat' }, isError: false })
  const e2 = createEngine({ book, runtime: true })
  for (const x of e.deeds) recordCall(e2, { session: 's', name: 'bash', args: { command: x.key }, isError: false, content: x.content })
  const r = judge(e2)
  const idx = (re) => r.issues.findIndex((i) => re.test(i))
  assert.ok(idx(/重决：/) !== -1 && idx(/豁施：/) !== -1, '重决与豁施俱在')
  assert.ok(idx(/重决：/) < idx(/豁施：/), '重决在豁施前')
  assert.ok(r.issues.includes('注记：线上无主文，承不判——终裁归线下'))
  const clean = judge(createEngine())
  assert.deepEqual(clean.issues, ['事皆遂 ×0 —— 成事不说，遂事不谏'])
})

// ---- 运行时注记与 settleKeys 直读 ------------------------------------------

test('settleKeys：键按首笔 ord 升序；runtimeNote 只在有重决时点亮', () => {
  const e = createEngine({ runtime: true })
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh pr create --title solo' }, isError: false })
  const solo = judge(e)
  assert.equal(solo.runtimeNote, false)
  recordCall(e, { session: 's', name: 'bash', args: { command: 'gh pr create --title solo' }, isError: false })
  assert.equal(judge(e).runtimeNote, true)
  const keys = settleKeys(e)
  assert.equal(keys.length, 1)
  assert.deepEqual(keys[0].states.map((s) => s.state), ['初遂', '重决'])
})
