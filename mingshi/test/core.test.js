/**
 * 名实核心测试 —— 提名、分类、生实、判定序、分值、分带、门禁（A1/A2）。
 * 期望值先于实现手算锁死（docs/03 §10），实现与手算冲突只能改实现。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf } from '../src/core/object.js'
import { normalizePath, globMatches } from '../src/core/glob.js'
import {
  contentOf, isCodePath, stripLine, extractSpecs, classifySpec, pkgName,
  resolveRelative, extractInstalls, stripVersion, isBuiltin, DEFAULT_BUILTINS,
} from '../src/core/ming.js'
import {
  emptyRegistry, parseRegistry, addRoots, addPackages, setStrictDeps,
  revoke, registryCount,
} from '../src/core/shi.js'
import { createEngine, recordCall, judge, bandOf, GATE_DEFAULT } from '../src/core/he.js'
import { renderMingce } from '../src/core/mingce.js'
import { auditStreams, sessionName } from '../src/core/audit.js'

const REG = { roots: ['src/**', 'test/**'], packages: ['lodash'] }

// ---------------------------------------------------------------- 流解析

test('流解析：# 注释与空行被跳过', () => {
  const ev = parseStream('# 注释\n\n{"type":"tool_call","id":"a","name":"read","args":{}}\n')
  assert.equal(ev.length, 1)
})

test('流解析：坏行报行号', () => {
  assert.throws(() => parseStream('{"type":"tool_call"}\nnot-json\n'), /第 2 行/)
})

test('流解析：id 配对回填 isError', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"a","name":"bash","args":{"command":"x"}}\n' +
    '{"type":"tool_result","id":"a","name":"bash","isError":true}\n'
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, true)
})

test('流解析：孤儿 result 独立建档', () => {
  const { calls } = buildCalls(parseStream('{"type":"tool_result","name":"bash","isError":false}'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
})

// ---------------------------------------------------------------- 对象键与工具族

test('对象键：p:/c:/n: 三级回退', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'write'), 'p:a.js')
  assert.equal(objectKey({ command: ' ls ' }, 'bash'), 'c:ls')
  assert.equal(objectKey({}, 'read'), 'n:read')
})

test('工具族：observe/write/exec/other', () => {
  assert.equal(familyOf('read'), 'observe')
  assert.equal(familyOf('mcpwrite_file'), 'write')
  assert.equal(familyOf('Bash'), 'exec')
  assert.equal(familyOf('think'), 'other')
})

test('路径规范化：\\\\ 与 // 与尾斜杠', () => {
  assert.equal(normalizePath('a\\b//c/'), 'a/b/c')
  assert.equal(normalizePath('./x/y'), 'x/y')
})

test('glob：src/** 命中深层与浅层，不命中兄弟径', () => {
  assert.ok(globMatches('src/**', 'src/a/b/c.js'))
  assert.ok(globMatches('src/**', 'src/a.js'))
  assert.ok(!globMatches('src/**', 'config/secrets.js'))
  assert.ok(!globMatches('src/*.js', 'src/a/b.js'))
})

// ---------------------------------------------------------------- 提名词表

test('内容字段：按序取首个非空字符串（content 优先于 text）', () => {
  assert.equal(contentOf({ text: 'a', content: 'b' }), 'b')
  assert.equal(contentOf({ text: 'a' }), 'a')
  assert.equal(contentOf({ content: '' }), null)
  assert.equal(contentOf(null), null)
})

test('代码后缀门：js/ts 在表内，md/vue 不在（登记可增）', () => {
  assert.ok(isCodePath('a/b.ts'))
  assert.ok(!isCodePath('a/b.md'))
  assert.ok(isCodePath('a/b.vue', ['.vue']))
})

test('注释剥离：整行注释不计，行内 // 截断，https:// 不误伤', () => {
  assert.equal(stripLine('// import x from "a"'), null)
  assert.equal(stripLine('* import x'), null)
  assert.equal(stripLine('foo() // import y from "z"'), 'foo() ')
  assert.equal(stripLine('const url = "https://x.dev"'), 'const url = "https://x.dev"')
  const specs = extractSpecs('import _ from "lodash" // ghost\nconst u = "https://a.dev/b"\n')
  assert.deepEqual(specs, ['lodash'])
})

test('提名：import 各形 + require + 动态 + export-from', () => {
  const specs = extractSpecs([
    'import a from "./a.js"',
    "import { b } from '../b.ts'",
    "import 'polyfill.js'",
    'const c = require("c.js")',
    'const d = import("./d.js")',
    "export { e } from 'e.js'",
  ].join('\n'))
  assert.deepEqual(specs, ['./a.js', '../b.ts', 'polyfill.js', 'c.js', './d.js', 'e.js'])
})

test('提名：一行多命中只取首模式，注释行全跳', () => {
  const specs = extractSpecs('# import "a.js"\nimport "b.js"\n')
  assert.deepEqual(specs, ['b.js'])
})

// ---------------------------------------------------------------- 名的分类

test('分类：node: 内建 / 相对 / 裸名 / 跳过（# 与 /）', () => {
  assert.equal(classifySpec('node:fs').kind, 'builtin')
  assert.equal(classifySpec('./a.js').kind, 'relative')
  assert.equal(classifySpec('../a.js').kind, 'relative')
  assert.equal(classifySpec('lodash/chunk').kind, 'bare')
  assert.equal(classifySpec('#app/main.js').kind, 'skip')
  assert.equal(classifySpec('/abs/x.js').kind, 'skip')
})

test('包名：scoped 取两段，普通取首段', () => {
  assert.equal(pkgName('@scope/pkg/sub'), '@scope/pkg')
  assert.equal(pkgName('lodash/chunk'), 'lodash')
  assert.equal(pkgName('react'), 'react')
})

test('相对解析：以被写文件目录为基', () => {
  assert.equal(resolveRelative('./helpers/x.js', 'src/app.js'), 'src/helpers/x.js')
  assert.equal(resolveRelative('../config/a.js', 'src/app.js'), 'config/a.js')
  assert.equal(resolveRelative('./tools/clock.js', 'main.js'), 'tools/clock.js')
})

test('安装令：npm/pnpm/yarn、旗标滤除、版本剥离', () => {
  assert.deepEqual(extractInstalls('npm install left-pad'), ['left-pad'])
  assert.deepEqual(extractInstalls('pnpm add -D vitest@1.2.3'), ['vitest'])
  assert.deepEqual(extractInstalls('yarn add @scope/pkg@2'), ['@scope/pkg'])
  assert.deepEqual(extractInstalls('npm install a@latest && npm test'), ['a'])
  assert.deepEqual(extractInstalls('npm install'), [])
  assert.deepEqual(extractInstalls('npm test'), [])
  assert.deepEqual(extractInstalls('pip install requests'), [])
})

test('stripVersion：裸名无版本原样，scoped 剥第二版本', () => {
  assert.equal(stripVersion('pkg'), 'pkg')
  assert.equal(stripVersion('pkg@1.2.3'), 'pkg')
  assert.equal(stripVersion('@a/b'), '@a/b')
  assert.equal(stripVersion('@a/b@1.2'), '@a/b')
})

test('内建豁免：node: 前缀 ∪ 默认表 ∪ 增词', () => {
  assert.ok(isBuiltin('node:child_process'))
  assert.ok(isBuiltin('fs'))
  assert.ok(isBuiltin('my-native', ['my-native']))
  assert.ok(!isBuiltin('lodash'))
  assert.ok(DEFAULT_BUILTINS.includes('util'))
})

// ---------------------------------------------------------------- 实册

test('实册：缺省字段补全，坏籍报错', () => {
  const r = parseRegistry('{"version":1}')
  assert.deepEqual(r.roots, [])
  assert.equal(r.strictDeps, false)
  assert.throws(() => parseRegistry('{"version":0}'), /version/)
  assert.throws(() => parseRegistry('{"version":1,"roots":"x"}'), /roots/)
  assert.throws(() => parseRegistry('not-json'), /JSON/)
})

test('实册：重复登记与销名', () => {
  let r = emptyRegistry()
  r = addRoots(r, ['src/**'])
  assert.throws(() => addRoots(r, ['src/**']), /已在册/)
  r = addPackages(r, ['lodash'])
  assert.throws(() => addPackages(r, ['lodash']), /已在册/)
  r = revoke(r, { root: 'src/**' })
  assert.throws(() => revoke(r, { root: 'src/**' }), /无此树界/)
  r = revoke(r, { pkg: 'lodash' })
  assert.throws(() => revoke(r, { pkg: 'lodash' }), /无此包名/)
  assert.equal(registryCount(emptyRegistry()), 0)
})

test('实册：setStrictDeps 切执法态', () => {
  assert.equal(setStrictDeps(emptyRegistry(), true).strictDeps, true)
})

// ---------------------------------------------------------------- 判定

function feed(engine, seq) {
  for (const [id, name, args, isError] of seq) {
    recordCall(engine, { session: 's', ref: id, name, args, isError })
  }
  return engine
}

test('判定序：无册不判（registry null）→ counts 全零、registryCount 0', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'a.js', content: "import x from 'ghost-pkg'" }, false],
  ])
  const r = judge(engine, { registry: null })
  assert.equal(r.score.total, 0)
  assert.equal(r.counts.registryCount, 0)
  assert.equal(r.band, '正')
  assert.ok(r.issues[0].includes('无实册'))
})

test('判定序：空册（roots+packages 全空）同无册', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'a.js', content: "import x from 'ghost-pkg'" }, false],
  ])
  const r = judge(engine, { registry: emptyRegistry() })
  assert.equal(r.counts.registryCount, 0)
  assert.equal(r.score.total, 0)
})

test('幻包：册外且全流无装成 → +30/名，带「妄」，门 30 红', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content: "import x from 'json-parser-pro'" }, false],
  ])
  const r = judge(engine, { registry: REG })
  assert.equal(r.counts.ghostPackages, 1)
  assert.equal(r.score.total, 30)
  assert.equal(r.band, '妄')
  assert.equal(r.verdict, 'fail')
  assert.ok(r.issues[0].includes('幻包 ×1'))
  assert.ok(r.issues[0].includes('json-parser-pro'))
})

test('幻径：resolved 不在册且无读写 → +15/名（单案带「疑」不红）', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/app.js', content: "import { c } from '../config/secrets.js'" }, false],
  ])
  const r = judge(engine, { registry: REG })
  assert.equal(r.counts.ghostRelatives, 1)
  assert.equal(r.score.total, 15)
  assert.equal(r.band, '疑')
  assert.equal(r.verdict, 'pass')
  assert.ok(r.issues[0].includes('config/secrets.js'))
})

test('册内免：root glob 命中（src/**） presumed real', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/app.js', content: "import { a } from './lib/gone.js'" }, false],
  ])
  const r = judge(engine, { registry: REG })
  assert.equal(r.counts.exemptImports, 1)
  assert.equal(r.score.total, 0)
})

test('流内生实：册外径成功写后即可引（全流先后皆采）', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'tools/clock.js', content: 'export const x = 1\n' }, false],
    ['c2', 'write', { path: 'main.js', content: "import { x } from './tools/clock.js'" }, false],
  ])
  const r = judge(engine, { registry: REG })
  assert.equal(r.counts.exemptImports, 1)
  assert.equal(r.score.total, 0)
})

test('流内生实：先引后写（TDD）同样免——先后皆采', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'test/a.test.js', content: "import { r } from '../tools/race.js'" }, false],
    ['c2', 'write', { path: 'tools/race.js', content: 'export const r = 1\n' }, false],
  ])
  const r = judge(engine, { registry: REG })
  assert.equal(r.counts.exemptImports, 1)
  assert.equal(r.score.total, 0)
})

test('生实：读成功亦生实（observe 族）', () => {
  const engine = feed(createEngine(), [
    ['c1', 'read', { path: 'tools/clock.js' }, false],
    ['c2', 'write', { path: 'main.js', content: "import { x } from './tools/clock.js'" }, false],
  ])
  const r = judge(engine, { registry: REG })
  assert.equal(r.counts.exemptImports, 1)
})

test('失败之读不生实', () => {
  const engine = feed(createEngine(), [
    ['c1', 'read', { path: 'tools/clock.js' }, true],
    ['c2', 'write', { path: 'main.js', content: "import { x } from './tools/clock.js'" }, false],
  ])
  const r = judge(engine, { registry: REG })
  assert.equal(r.counts.ghostRelatives, 1)
})

test('裸名生实：装成之包可引（引免，但册外之装仍是新装 +6 留痕；试装不生实）', () => {
  const ok = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content: "import p from 'newpkg'" }, false],
    ['c2', 'bash', { command: 'npm install newpkg' }, false],
  ])
  const rok = judge(ok, { registry: REG })
  assert.equal(rok.counts.exemptImports, 1)
  assert.equal(rok.counts.ghostPackages, 0)
  assert.equal(rok.counts.strayInstalls, 1)
  assert.equal(rok.score.total, 6)

  const bad = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content: "import p from 'newpkg'" }, false],
    ['c2', 'bash', { command: 'npm install newpkg' }, true],
  ])
  const rb = judge(bad, { registry: REG })
  assert.equal(rb.counts.ghostPackages, 1)
  assert.equal(rb.counts.trialInstalls, 1)
  assert.equal(rb.score.total, 30)
})

test('装所册免；册外装成新装 +6/次；strictDeps 下犯装 +30/次', () => {
  const eng = feed(createEngine(), [
    ['c1', 'bash', { command: 'npm install lodash' }, false],
    ['c2', 'bash', { command: 'npm install left-pad' }, false],
  ])
  const wide = judge(eng, { registry: REG })
  assert.equal(wide.counts.exemptInstalls, 1)
  assert.equal(wide.counts.strayInstalls, 1)
  assert.equal(wide.score.stray, 6)

  const strict = judge(eng, { registry: setStrictDeps(REG, true) })
  assert.equal(strict.score.stray, 30)
  assert.ok(strict.issues.join('\n').includes('犯装'))
})

test('cap：三幻包 60（30×3 封顶）、四幻径 30（15×4 封顶）', () => {
  const content = [
    "import a from 'ghost-a'",
    "import b from 'ghost-b'",
    "import c from 'ghost-c'",
  ].join('\n')
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content }, false],
  ])
  assert.equal(judge(engine, { registry: REG }).score.ghost, 60)

  const rels = ["import a from '../x/a.js'", "import b from '../x/b.js'", "import c from '../x/c.js'", "import d from '../x/d.js'"].join('\n')
  const eng2 = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content: rels }, false],
  ])
  assert.equal(judge(eng2, { registry: REG }).score.ghost, 30)
})

test('total cap 100', () => {
  const content = [
    "import a from 'g1'", "import b from 'g2'", "import c from 'g3'",
    "import x from '../x/x.js'", "import y from '../x/y.js'", "import z from '../x/z.js'",
  ].join('\n')
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/a.js', content }, false],
    ['c2', 'bash', { command: 'npm install zz1' }, false],
    ['c3', 'bash', { command: 'npm install zz2' }, false],
  ])
  assert.equal(judge(engine, { registry: REG }).score.total, 100)
})

test('分带边界：14 正 / 15 疑 / 29 疑 / 30 妄', () => {
  assert.equal(bandOf(0), '正')
  assert.equal(bandOf(14), '正')
  assert.equal(bandOf(15), '疑')
  assert.equal(bandOf(29), '疑')
  assert.equal(bandOf(30), '妄')
  assert.equal(GATE_DEFAULT, 30)
})

test('门可调：--gate 语义（>= 门即红）', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'src/app.js', content: "import { c } from '../config/secrets.js'" }, false],
  ])
  const r = judge(engine, { registry: REG, gate: 15 })
  assert.equal(r.score.total, 15)
  assert.equal(r.verdict, 'fail')
  assert.equal(r.gate, 15)
})

test('非代码后缀与无名内容不提名；同名去重', () => {
  const engine = feed(createEngine(), [
    ['c1', 'write', { path: 'docs/a.md', content: "import x from 'ghost-md'" }, false],
    ['c2', 'write', { path: 'src/a.js', content: "import 'g1'\nimport 'g1'" }, false],
  ])
  const r = judge(engine, { registry: REG })
  assert.equal(r.imports, 1)
  assert.equal(r.counts.ghostPackages, 1)
})

test('bash 写是黑盒：heredoc 之 import 不判（宁漏勿诬）', () => {
  const engine = feed(createEngine(), [
    ['c1', 'bash', { command: "cat > a.js <<EOF\nimport 'ghost'\nEOF" }, false],
  ])
  const r = judge(engine, { registry: REG })
  assert.equal(r.imports, 0)
  assert.equal(r.score.total, 0)
})

// ---------------------------------------------------------------- 夹具（A2 手算锁死）

test('A2：clean-stream —— 3 调用、写 2、名 3、值 0、带「正」', () => {
  const r = auditStreams([{ name: 'clean-stream.jsonl', text: fixtureText('clean-stream.jsonl') }], { registry: regFixture('clean-registry.json') })
  assert.equal(r.sessions, 1)
  assert.equal(r.calls, 3)
  assert.equal(r.writes, 2)
  assert.equal(r.imports, 3)
  assert.deepEqual(r.score, { total: 0, ghost: 0, stray: 0 })
  assert.equal(r.band, '正')
  assert.equal(r.verdict, 'pass')
  assert.deepEqual(r.counts, {
    ghostPackages: 0, ghostRelatives: 0, strayInstalls: 0, trialInstalls: 0,
    exemptImports: 3, exemptInstalls: 0, registryCount: 3,
  })
  assert.equal(r.ok, true)
})

test('A2：ghost-stream —— 5 调用、写 2、名 3、值 {51,45,6}、带「妄」、exit 1', () => {
  const r = auditStreams([{ name: 'ghost-stream.jsonl', text: fixtureText('ghost-stream.jsonl') }], { registry: regFixture('ghost-registry.json') })
  assert.equal(r.calls, 5)
  assert.equal(r.writes, 2)
  assert.equal(r.imports, 3)
  assert.deepEqual(r.score, { total: 51, ghost: 45, stray: 6 })
  assert.equal(r.band, '妄')
  assert.equal(r.verdict, 'fail')
  assert.equal(r.ok, false)
  assert.deepEqual(r.counts, {
    ghostPackages: 1, ghostRelatives: 1, strayInstalls: 1, trialInstalls: 1,
    exemptImports: 1, exemptInstalls: 1, registryCount: 3,
  })
})

test('A2：ghost-stream 换 strict-registry —— 值 {75,45,30}', () => {
  const r = auditStreams([{ name: 'ghost-stream.jsonl', text: fixtureText('ghost-stream.jsonl') }], { registry: regFixture('strict-registry.json') })
  assert.deepEqual(r.score, { total: 75, ghost: 45, stray: 30 })
  assert.equal(r.band, '妄')
})

test('A2：ghost-stream 无实册 —— 值 0、带「正」、registryCount 0', () => {
  const r = auditStreams([{ name: 'ghost-stream.jsonl', text: fixtureText('ghost-stream.jsonl') }], { registry: null })
  assert.deepEqual(r.score, { total: 0, ghost: 0, stray: 0 })
  assert.equal(r.counts.registryCount, 0)
  assert.equal(r.band, '正')
  assert.equal(r.verdict, 'pass')
})

// ---------------------------------------------------------------- 名册块与多流

test('名册块：同一实册两次渲染逐字节相同；空籍确定性文本', () => {
  const a = renderMingce(regFixture('ghost-registry.json'))
  const b = renderMingce(regFixture('ghost-registry.json'))
  assert.equal(a, b)
  assert.ok(a.includes('src/**'))
  assert.ok(a.includes('lodash'))
  assert.ok(a.includes('夫名，实谓也'))
  const empty = renderMingce(emptyRegistry())
  assert.ok(empty.includes('空册'))
})

test('多流合并：跨会话同名去重，生实跨会话皆采', () => {
  const r = auditStreams([
    { name: 'a.jsonl', text: streamOf([['c1', 'write', { path: 'tools/t.js', content: 'export const t = 1\n' }, false]]) },
    { name: 'b.jsonl', text: streamOf([['d1', 'write', { path: 'src/x.js', content: "import { t } from '../tools/t.js'" }, false]]) },
  ], { registry: REG })
  assert.equal(r.sessions, 2)
  assert.equal(r.imports, 1)
  assert.equal(r.score.total, 0)
})

test('多流撞名报错', () => {
  assert.throws(() => auditStreams([
    { name: 'a.jsonl', text: '' },
    { name: 'x/a.jsonl', text: '' },
  ], { registry: REG }), /撞名/)
})

test('sessionName 取 basename', () => {
  assert.equal(sessionName('/tmp/racer-a.jsonl'), 'racer-a.jsonl')
})

// ---------------------------------------------------------------- helpers

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const fixtureText = (name) => readFileSync(join(root, 'fixtures', name), 'utf8')
const regFixture = (name) => parseRegistry(fixtureText(name))

function streamOf(seq) {
  return seq.map(([id, name, args, isError]) => (
    `{"type":"tool_call","id":"${id}","name":"${name}","args":${JSON.stringify(args)}}\n` +
    `{"type":"tool_result","id":"${id}","name":"${name}","args":${JSON.stringify(args)},"isError":${isError}}\n`
  )).join('')
}
