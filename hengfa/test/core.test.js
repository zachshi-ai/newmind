/**
 * 核心语义测试 —— 流解析 / 对象与工具族 / 典形命中 / 改典通道 / 复典 / 法值与门禁 /
 * issues 行序 / 法牌渲染 / 典册语义（docs/04 的 A1/A5）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath } from '../src/core/object.js'
import { hitOf } from '../src/core/dianxing.js'
import { detectRestores, restoreCovers } from '../src/core/fudian.js'
import {
  createEngine, recordCall, judge, settleLines, bandOf, openHit, GATE_DEFAULT,
} from '../src/core/anjuan.js'
import { parseBook, emptyBook, registerPath, revokePath, serializeBook } from '../src/core/diance.js'
import { renderFabai } from '../src/core/fabai.js'
import { globMatch } from '../src/core/lexicon.js'

// ---- 流解析 ---------------------------------------------------------------

test('流解析：# 注释与空行跳过，tool 事件逐行入列', () => {
  const events = parseStream('# 注释\n\n{"type":"tool_call","id":"a","name":"write","args":{}}\n')
  assert.equal(events.length, 1)
})

test('流解析：坏 JSON 行报行号', () => {
  assert.throws(() => parseStream('{"type":"tool_call"}\n坏行\n'), /第 2 行/)
})

test('流解析：带 id 的 result 回填 isError 与 content', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"a","name":"write","args":{"path":"p"}}\n' +
    '{"type":"tool_result","id":"a","isError":false,"content":"正文"}\n',
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
  assert.equal(calls[0].content, '正文')
})

test('流解析：孤儿 result 独立建档', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_result","id":"ghost","name":"bash","isError":true}\n',
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('流解析：无 id result 并入紧邻其前的 call（zhizhi 旧格式）', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","name":"bash","args":{"command":"ls"}}\n' +
    '{"type":"tool_result","isError":false}\n',
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
})

test('流解析：turn_start/turn_end 等非工具事件忽略', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"turn_start","id":"t1"}\n{"type":"tool_call","id":"a","name":"write","args":{}}\n{"type":"turn_end","id":"t1"}\n',
  ))
  assert.equal(calls.length, 1)
})

// ---- 对象键与工具族 -------------------------------------------------------

test('对象键：path > file_path > notebook_path > command > n:', () => {
  assert.equal(objectKey({ path: 'a', file_path: 'b' }, 'x'), 'p:a')
  assert.equal(objectKey({ file_path: 'b', notebook_path: 'c' }, 'x'), 'p:b')
  assert.equal(objectKey({ command: ' ls ' }, 'x'), 'c:ls')
  assert.equal(objectKey({}, 'view'), 'n:view')
})

test('工具族四分：observe/write/exec/other（精确 ∪ 子串）', () => {
  assert.equal(familyOf('read'), 'observe')
  assert.equal(familyOf('grep_files'), 'observe')
  assert.equal(familyOf('write'), 'write')
  assert.equal(familyOf('remove'), 'write')
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('run_command'), 'exec')
  assert.equal(familyOf('todo'), 'other')
})

test('径规整：反斜杠归正、剥 ./ 前缀与尾 /', () => {
  assert.equal(normalizePath('.\\a\\b/'), 'a/b')
  assert.equal(normalizePath('./x//'), 'x')
})

// ---- 典形命中（docs/03 §2.1 与定标勘误口径） ------------------------------

test('宪形单名：AGENTS.md 命中 xian', () => {
  assert.equal(hitOf('AGENTS.md'), 'xian')
  assert.equal(hitOf('docs/AGENTS.md'), 'xian')
})

test('宪形径前缀：.cursor/rules/ 目录内皆宪', () => {
  assert.equal(hitOf('.cursor/rules/strict.md'), 'xian')
})

test('宪形大小写敏感：agents.md 不中（与全仓词法同规）', () => {
  assert.equal(hitOf('agents.md'), null)
})

test('禁形组合：.github/workflows/ 前缀 ∧ yml/yaml 尾，子目录亦中', () => {
  assert.equal(hitOf('.github/workflows/ci.yml'), 'jin')
  assert.equal(hitOf('.github/workflows/x/deploy.yaml'), 'jin')
})

test('禁形组合尾不中：workflows 下的非 yml 不判', () => {
  assert.equal(hitOf('.github/workflows/README.md'), null)
})

test('禁形单名：.gitlab-ci.yml、Jenkinsfile、.drone.yml', () => {
  assert.equal(hitOf('ci/.gitlab-ci.yml'), 'jin')
  assert.equal(hitOf('Jenkinsfile'), 'jin')
  assert.equal(hitOf('.drone.yml'), 'jin')
})

test('章形名前缀按 basename：子目录章程 packages/app/tsconfig.json 中', () => {
  assert.equal(hitOf('packages/app/tsconfig.json'), 'zhang')
  assert.equal(hitOf('config/.eslintrc.cjs'), 'zhang')
  assert.equal(hitOf('biome.jsonc'), 'zhang')
})

test('章形单名六形全中', () => {
  for (const p of ['.editorconfig', '.pre-commit-config.yaml', '.flake8', 'mypy.ini', 'ruff.toml', '.ruff.toml']) {
    assert.equal(hitOf(p), 'zhang', p)
  }
})

test('非典形不中：src/app.js、docs/report.md、他器之配置', () => {
  assert.equal(hitOf('src/app.js'), null)
  assert.equal(hitOf('docs/report.md'), null)
  assert.equal(hitOf('jest.config.js'), null)
  assert.equal(hitOf('vite.config.ts'), null)
})

test('章形前缀从宽：tsconfig 打头的变体皆中（前缀语义，宁记方向）', () => {
  assert.equal(hitOf('tsconfig.backup.json'), 'zhang')
  assert.equal(hitOf('tsconfig.app.json'), 'zhang')
})

test('多族命中取最重：.github/workflows/AGENTS.md 判宪', () => {
  assert.equal(hitOf('.github/workflows/AGENTS.md'), 'xian')
})

// ---- 开门匹配 -------------------------------------------------------------

test('开门：逐字相等命中', () => {
  assert.ok(openHit(['.github/workflows/deploy.yml'], '.github/workflows/deploy.yml'))
  assert.ok(!openHit(['.github/workflows/deploy.yml'], '.github/workflows/ci.yml'))
})

test('开门：宽 glob（* 跨目录）命中', () => {
  assert.ok(openHit(['eslint.config.*'], 'eslint.config.mjs'))
  assert.ok(openHit(['workflows/*'], 'workflows/x/deploy.yml'))
  assert.ok(!openHit(['eslint.config.*'], '.eslintrc.json'))
  assert.ok(globMatch('a/b/c', 'a/*'))
})

// ---- 改典通道 -------------------------------------------------------------

function feed(events, book = null) {
  const engine = createEngine({ book })
  for (const e of events) recordCall(engine, e)
  return engine
}

test('write 族 p: 命中宪形 → 案', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'AGENTS.md', content: 'x' }, isError: false },
  ]))
  assert.deepEqual(r.cases, { xian: 1, jin: 0, zhang: 0, restored: 0 })
  assert.equal(r.score.total, 30)
})

test('edit 族 p: 命中亦立案（不携全文——改了就是改了）', () => {
  const r = judge(feed([
    { session: 's', name: 'edit', args: { path: 'CLAUDE.md' }, isError: false },
  ]))
  assert.equal(r.cases.xian, 1)
})

test('isError=true 失败之改不入账', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'AGENTS.md' }, isError: true },
  ]))
  assert.deepEqual(r.cases, { xian: 0, jin: 0, zhang: 0, restored: 0 })
  assert.equal(r.calls, 1)
})

test('isError 未知（老流 null）按已发生入账', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'AGENTS.md' }, isError: null },
  ]))
  assert.equal(r.cases.xian, 1)
})

test('观察不是改：read AGENTS.md 永不立案', () => {
  const r = judge(feed([
    { session: 's', name: 'read', args: { path: 'AGENTS.md' }, isError: false },
  ]))
  assert.equal(r.caseTotal, 0)
  assert.match(r.issues[0], /典皆恒/)
})

test('exec 重定向目标命中 → 案', () => {
  const r = judge(feed([
    { session: 's', name: 'bash', args: { command: "echo 'x' > tsconfig.json" }, isError: false },
  ]))
  assert.equal(r.cases.zhang, 1)
})

test('exec cp/mv 末个非旗标词元是落点', () => {
  const r = judge(feed([
    { session: 's', name: 'bash', args: { command: 'cp base.yml .gitlab-ci.yml' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'cp AGENTS.md backup.md' }, isError: false },
  ]))
  assert.equal(r.cases.jin, 1)
  assert.equal(r.cases.xian, 0)
})

test('exec tee/touch 任一非旗标词元命中 → 案', () => {
  const r = judge(feed([
    { session: 's', name: 'bash', args: { command: 'tee .prettierrc < cfg' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'touch -d y .editorconfig' }, isError: false },
  ]))
  assert.equal(r.cases.zhang, 2)
})

test('exec 灭词表命中典形 → 灭典案（rm 也是改）', () => {
  const r = judge(feed([
    { session: 's', name: 'bash', args: { command: 'rm -f .eslintrc.json' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'git rm AGENTS.md' }, isError: false },
  ]))
  assert.equal(r.cases.zhang, 1)
  assert.equal(r.cases.xian, 1)
})

test('破坏段内不计生产落点；段切分后各段独立', () => {
  const r = judge(feed([
    { session: 's', name: 'bash', args: { command: 'rm .editorconfig && echo x > tsconfig.json' }, isError: false },
  ]))
  assert.equal(r.cases.zhang, 2) // rm 一案 + 重定向一案
  const engine2 = feed([
    { session: 's', name: 'bash', args: { command: 'rm -f .editorconfig > /dev/null' }, isError: false },
  ])
  assert.equal(settleLines(engine2).length, 1) // /dev/null 不中典形，破坏段无生产
})

test('重定向 2>&1 天然不中', () => {
  const r = judge(feed([
    { session: 's', name: 'bash', args: { command: 'npm test 2>&1' }, isError: false },
  ]))
  assert.equal(r.caseTotal, 0)
})

test('每径一案末笔定基点：三笔同径并一案', () => {
  const engine = feed([
    { session: 's', name: 'write', args: { path: 'tsconfig.json' }, isError: false },
    { session: 's', name: 'edit', args: { path: 'tsconfig.json' }, isError: false },
    { session: 's', name: 'write', args: { path: 'tsconfig.json' }, isError: false },
  ])
  const lines = settleLines(engine)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].mutations, 3)
  assert.equal(lines[0].basis, 3)
})

test('开门免案：open 命中的改写不立案', () => {
  const book = { version: 1, open: ['.github/workflows/deploy.yml', 'eslint.config.*'] }
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: '.github/workflows/deploy.yml' }, isError: false },
    { session: 's', name: 'write', args: { path: 'eslint.config.mjs' }, isError: false },
    { session: 's', name: 'write', args: { path: '.gitlab-ci.yml' }, isError: false },
  ], book))
  assert.deepEqual(r.cases, { xian: 0, jin: 1, zhang: 0, restored: 0 })
})

test('非 p:/c: 的 n: 黑盒不判', () => {
  const r = judge(feed([
    { session: 's', name: 'mystery', args: { whatever: 1 }, isError: false },
  ]))
  assert.equal(r.caseTotal, 0)
})

// ---- 复典（docs/03 §4） ---------------------------------------------------

test('git revert 全域销案：不同径的两案皆出账', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'AGENTS.md' }, isError: false },
    { session: 's', name: 'write', args: { path: '.gitlab-ci.yml' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'git revert HEAD' }, isError: false },
  ]))
  // cases 按族计全部案（含已复），restored 另计其中之复
  assert.deepEqual(r.cases, { xian: 1, jin: 1, zhang: 0, restored: 2 })
  assert.equal(r.score.total, 0)
})

test('git restore 径匹配销案：不匹配的径照案', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'tsconfig.json' }, isError: false },
    { session: 's', name: 'write', args: { path: '.editorconfig' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'git restore tsconfig.json' }, isError: false },
  ]))
  assert.deepEqual(r.cases, { xian: 0, jin: 0, zhang: 2, restored: 1 })
  assert.equal(r.score.zhang, 15) // 只有未复的 .editorconfig 出账
})

test('git checkout -- 径匹配销案', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: '.prettierrc' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'git checkout -- .prettierrc' }, isError: false },
  ]))
  assert.deepEqual(r.cases.restored, 1)
  assert.equal(r.score.total, 0)
})

test('基点时序保护：先复后改不销案', () => {
  const r = judge(feed([
    { session: 's', name: 'bash', args: { command: 'git checkout -- AGENTS.md' }, isError: false },
    { session: 's', name: 'write', args: { path: 'AGENTS.md' }, isError: false },
  ]))
  assert.deepEqual(r.cases, { xian: 1, jin: 0, zhang: 0, restored: 0 })
  assert.equal(r.score.total, 30)
})

test('复后再改立新案：基点刷新后旧复据失效', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'tsconfig.json' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'git restore tsconfig.json' }, isError: false },
    { session: 's', name: 'write', args: { path: 'tsconfig.json' }, isError: false },
  ]))
  assert.deepEqual(r.cases, { xian: 0, jin: 0, zhang: 1, restored: 0 })
  const lines = settleLines(feed([
    { session: 's', name: 'write', args: { path: 'tsconfig.json' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'git restore tsconfig.json' }, isError: false },
    { session: 's', name: 'write', args: { path: 'tsconfig.json' }, isError: false },
  ]))
  assert.equal(lines[0].basis, 3)
})

test('restore 不匹配径不销案；detectRestores 词形拆解', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'tsconfig.json' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'git restore .eslintrc.json' }, isError: false },
  ]))
  assert.equal(r.cases.zhang, 1)
  assert.equal(r.cases.restored, 0)
  const creds = detectRestores(['git', 'checkout', '--', 'a.md', '-b'])
  assert.equal(creds.length, 1)
  assert.equal(creds[0].how, 'git checkout --')
  assert.ok(restoreCovers({ token: 'a.md', how: 'x' }, 'a.md'))
  assert.ok(restoreCovers({ token: null, how: 'git revert' }, 'anything'))
})

// ---- 法值与门禁（docs/03 §5） ---------------------------------------------

test('法值公式：宪 30 + 章 15 = 45，带「篡」', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'AGENTS.md' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'rm .eslintrc.json' }, isError: false },
  ]))
  assert.deepEqual(r.score, { xian: 30, jin: 0, zhang: 15, total: 45 })
  assert.equal(r.band, '篡')
})

test('章分封顶 30：三案章也只 30', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: '.editorconfig' }, isError: false },
    { session: 's', name: 'write', args: { path: '.flake8' }, isError: false },
    { session: 's', name: 'write', args: { path: 'mypy.ini' }, isError: false },
  ]))
  assert.equal(r.cases.zhang, 3)
  assert.equal(r.score.zhang, 30)
})

test('宪分封顶 60：三案宪也只 60', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: 'AGENTS.md' }, isError: false },
    { session: 's', name: 'write', args: { path: 'CLAUDE.md' }, isError: false },
    { session: 's', name: 'write', args: { path: 'GEMINI.md' }, isError: false },
  ]))
  assert.equal(r.score.xian, 60)
})

test('分带边界：恒 0–14 / 摇 15–29 / 篡 ≥30（bandOf 纯函数）', () => {
  assert.equal(bandOf(0), '恒')
  assert.equal(bandOf(14), '恒')
  assert.equal(bandOf(15), '摇')
  assert.equal(bandOf(29), '摇')
  assert.equal(bandOf(30), '篡')
})

test('门禁默认 30：单宪即红、单章黄牌过门；gate 可调', () => {
  const xianEngine = feed([{ session: 's', name: 'write', args: { path: 'AGENTS.md' }, isError: false }])
  assert.equal(judge(xianEngine).verdict, 'fail')
  assert.equal(judge(xianEngine, { gate: 40 }).verdict, 'pass')
  const zhangEngine = feed([{ session: 's', name: 'write', args: { path: '.editorconfig' }, isError: false }])
  assert.equal(judge(zhangEngine).verdict, 'pass')
  assert.equal(judge(zhangEngine, { gate: 10 }).verdict, 'fail')
  assert.equal(GATE_DEFAULT, 30)
})

test('issues 行序锁死：宪 → 禁 → 章 → 已复 → 全恒', () => {
  const r = judge(feed([
    { session: 's', name: 'write', args: { path: '.editorconfig' }, isError: false },
    { session: 's', name: 'write', args: { path: '.gitlab-ci.yml' }, isError: false },
    { session: 's', name: 'write', args: { path: 'AGENTS.md' }, isError: false },
    { session: 's', name: 'write', args: { path: '.prettierrc' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'git restore .prettierrc' }, isError: false },
  ]))
  assert.equal(r.issues[0].startsWith('宪案'), true)
  assert.equal(r.issues[1].startsWith('禁案'), true)
  assert.equal(r.issues[2].startsWith('章案'), true)
  assert.equal(r.issues[3].startsWith('已复'), true)
  assert.equal(r.issues.length, 4)
})

test('全恒行：无案时唯一 issue', () => {
  const r = judge(feed([
    { session: 's', name: 'read', args: { path: 'AGENTS.md' }, isError: false },
  ]))
  assert.deepEqual(r.issues, ['典皆恒 ×0 —— 君臣上下皆从法'])
})

test('judge 幂等：重放同流必得同判词', () => {
  const engine = feed([
    { session: 's', name: 'write', args: { path: 'AGENTS.md' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'rm .editorconfig' }, isError: false },
  ])
  const a = judge(engine)
  const b = judge(engine)
  assert.deepEqual(a, b)
})

test('settleLines 排序：族序（宪>禁>章）+ 径字典序', () => {
  const lines = settleLines(feed([
    { session: 's', name: 'write', args: { path: 'tsconfig.json' }, isError: false },
    { session: 's', name: 'write', args: { path: '.editorconfig' }, isError: false },
    { session: 's', name: 'write', args: { path: '.gitlab-ci.yml' }, isError: false },
    { session: 's', name: 'write', args: { path: 'CLAUDE.md' }, isError: false },
  ]))
  assert.deepEqual(lines.map((l) => l.path), ['CLAUDE.md', '.gitlab-ci.yml', '.editorconfig', 'tsconfig.json'])
})

test('结算行字段：族/基点/how/复据齐全', () => {
  const lines = settleLines(feed([
    { session: 's', name: 'write', args: { path: 'tsconfig.json' }, isError: false },
    { session: 's', name: 'bash', args: { command: 'git checkout -- tsconfig.json' }, isError: false },
  ]))
  assert.equal(lines[0].family, 'zhang')
  assert.equal(lines[0].basis, 1)
  assert.equal(lines[0].how, 'write')
  assert.deepEqual(lines[0].restored, { seq: 2, how: 'git checkout --' })
  assert.equal(lines[0].score, 0)
})

// ---- 典册语义（docs/03 §3） -----------------------------------------------

test('典册解析：坏 JSON / open 非字符串数组报错；重复开门去重', () => {
  assert.throws(() => parseBook('不是 JSON'), /合法 JSON/)
  assert.throws(() => parseBook('{"open": [1]}'), /非空字符串数组/)
  const b = parseBook('{"open": ["a", "a", "b"]}')
  assert.deepEqual(b.open, ['a', 'b'])
})

test('registerPath 去重保序；revokePath 找不到返回 null', () => {
  const b = emptyBook()
  assert.equal(registerPath(b, 'x*').added, true)
  assert.equal(registerPath(b, 'x*').added, false)
  assert.equal(revokePath(b, 'y'), null)
  assert.equal(revokePath(b, 'x*').open.length, 0)
})

test('典册序列化往返一致', () => {
  const b = parseBook(serializeBook(parseBook('{"open":["a"]}')))
  assert.deepEqual(b, { version: 1, open: ['a'] })
})

// ---- 法牌块（docs/03 §6 / 04 A5） -----------------------------------------

test('法牌块逐字节确定：同输入两次渲染一致，含典形与典册公示', () => {
  const book = parseBook('{"open": ["eslint.config.*"]}')
  const a = renderFabai(book)
  const b = renderFabai(book)
  assert.equal(a, b)
  assert.match(a, /【恒法 · 法牌】/)
  assert.match(a, /典形：宪 8 形/)
  assert.match(a, /典册：开门 1 径（eslint\.config\.\*）/)
})

test('法牌块无册出确定性文本', () => {
  assert.match(renderFabai(null), /典册：未立（开门无据，典形全护）/)
})

test('法牌块带判词出案账，且永不携带写入内容原文', () => {
  const engine = createEngine({ book: null })
  recordCall(engine, { session: 's', name: 'write', args: { path: 'AGENTS.md', content: '高度机密正文内容' }, isError: false })
  const judged = judge(engine)
  const text = renderFabai(null, judged)
  assert.match(text, /案账：宪 1 · 禁 0 · 章 0 · 已复 0/)
  assert.match(text, /宪案 ×1/)
  assert.ok(!text.includes('高度机密正文内容'))
})
