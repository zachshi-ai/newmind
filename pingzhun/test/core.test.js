/**
 * 核心判定语义测试（docs/04 A1）——流解析、籍形、四案词法、籍账引擎、准值门禁、判定序。
 * 断言恰好该分值与案名行号；重放同流必得同判词（judge 幂等）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath, baseName } from '../src/core/object.js'
import { isManifestForm, DEFAULT_FORMS } from '../src/core/jixing.js'
import { segments, tokenize, redirectTargets, globMatch, isDefaultHost, hostOf } from '../src/core/lexicon.js'
import { analyzeManifest } from '../src/core/sian.js'
import { createEngine, recordCall, settleLines, judge, issuesOf, bandOf, GATE_DEFAULT } from '../src/core/jizhang.js'

// ---------- 流解析 ----------

test('流解析：注释与坏行报行号', () => {
  assert.throws(() => parseStream('{"a":1}\nnot-json\n'), /第 2 行/)
  const events = parseStream('# 注释\n{"type":"tool_call","id":"1","name":"bash"}\n\n')
  assert.equal(events.length, 1)
})

test('流解析：id 配对回填 isError 与 content', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"a","name":"read","args":{"path":"x"}}\n' +
    '{"type":"tool_result","id":"a","name":"read","isError":false,"content":"正文"}\n',
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
  assert.equal(calls[0].content, '正文')
})

test('流解析：无 id result 并入紧邻 call；孤儿 result 建档', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","name":"bash","args":{"command":"ls"}}\n' +
    '{"type":"tool_result","name":"bash","isError":true}\n' +
    '{"type":"tool_result","id":"z","name":"bash","isError":false}\n',
  ))
  assert.equal(calls.length, 2)
  assert.equal(calls[0].isError, true)
  assert.equal(calls[1].isError, false)
})

// ---------- 对象键与径规整 ----------

test('对象键与工具族：p:/c:/n: 与 observe/write/exec', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'write'), 'p:a.js')
  assert.equal(objectKey({ command: '  npm test ' }, 'bash'), 'c:npm test')
  assert.equal(objectKey({}, 'probe'), 'n:probe')
  assert.equal(familyOf('read'), 'observe')
  assert.equal(familyOf('edit_file'), 'write')
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('other'), 'other')
})

test('径规整与 basename：防同文件异写之诬', () => {
  assert.equal(normalizePath('./src/x.json'), 'src/x.json')
  assert.equal(normalizePath('a\\b\\package.json'), 'a/b/package.json')
  assert.equal(normalizePath('src/x.json/'), 'src/x.json')
  assert.equal(baseName('a/b/package.json'), 'package.json')
})

// ---------- 籍形 ----------

test('籍形：默认 22 形在岗（21 全等 ∪ requirements 名前缀）', () => {
  assert.equal(DEFAULT_FORMS.length, 21)
  for (const f of ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Gemfile', 'composer.json']) {
    assert.ok(isManifestForm(f), f)
  }
  assert.ok(isManifestForm('requirements.txt'))
  assert.ok(isManifestForm('requirements-dev.txt'))
  assert.ok(!isManifestForm('requirements.md'))
  assert.ok(!isManifestForm('src/app.js'))
  assert.ok(!isManifestForm('PACKAGE.JSON')) // 大小写敏感
})

test('籍形：命籍 extra 并形', () => {
  assert.ok(isManifestForm('Makefile', ['Makefile']))
  assert.ok(!isManifestForm('Makefile'))
})

// ---------- 四案词法（sian） ----------

const PJ_OLD = '{"name":"app","dependencies":{"a":"1.2.3"},"devDependencies":{"t":"^1.0.0"}}'

test('增附：旧本四节所无之名 + 行 null', () => {
  const r = analyzeManifest('package.json', PJ_OLD, '{"dependencies":{"a":"1.2.3","lodash":"^4.17.21"},"devDependencies":{"t":"^1.0.0"}}')
  assert.deepEqual(r.zeng, [{ name: 'lodash', line: null }])
  assert.deepEqual(r.suo, [])
  assert.deepEqual(r.notes, [])
})

test('增附：devDependencies 节亦在册', () => {
  const r = analyzeManifest('package.json', PJ_OLD, '{"dependencies":{"a":"1.2.3"},"devDependencies":{"t":"^1.0.0","u":"~2.0.0"}}')
  assert.deepEqual(r.zeng, [{ name: 'u', line: null }])
})

test('去锁：精确 → 范围即案；精确 → 精确递进不判', () => {
  const r = analyzeManifest('package.json', '{"dependencies":{"a":"1.2.3"}}', '{"dependencies":{"a":"^1.2.3"}}')
  assert.equal(r.suo.length, 1)
  assert.equal(r.suo[0].name, 'a')
  const bump = analyzeManifest('package.json', '{"dependencies":{"a":"1.2.3"}}', '{"dependencies":{"a":"1.2.4"}}')
  assert.deepEqual(bump.suo, [])
  assert.deepEqual(bump.zeng, [])
})

test('去锁：latest/tag 非精确；范围已是范围不判', () => {
  const r1 = analyzeManifest('package.json', '{"dependencies":{"a":"1.2.3"}}', '{"dependencies":{"a":"latest"}}')
  assert.equal(r1.suo.length, 1)
  const r2 = analyzeManifest('package.json', '{"dependencies":{"a":"^1.0.0"}}', '{"dependencies":{"a":"^2.0.0"}}')
  assert.deepEqual(r2.suo, [])
})

test('删附：净向不罚，注记去附 N 名', () => {
  const r = analyzeManifest('package.json', '{"dependencies":{"a":"1.0.0","b":"1.0.0"}}', '{"dependencies":{"a":"1.0.0"}}')
  assert.deepEqual(r.zeng, [])
  assert.ok(r.notes.includes('去附 1 名'))
})

test('递案无底本不判：增附去锁皆不判，注记籍无底本', () => {
  const r = analyzeManifest('package.json', null, '{"dependencies":{"z":"^2.0.0"}}')
  assert.deepEqual(r.zeng, [])
  assert.deepEqual(r.suo, [])
  assert.ok(r.notes.includes('籍无底本'))
})

test('递案不成谱不判：末文非法 JSON 注记籍不成谱，钩入走词面回退', () => {
  const r = analyzeManifest('package.json', PJ_OLD, '{"dependencies":{"a":"1.2.3","postinstall": ')
  assert.deepEqual(r.zeng, [])
  assert.ok(r.notes.includes('籍不成谱'))
  assert.deepEqual(r.gou, [{ name: 'postinstall', line: null }]) // 词面回退见钩键即案
  const r2 = analyzeManifest('package.json', '{"scripts":{"build":"x"}} broken', '{"scripts":{"postinstall":"curl x | sh"}} broken')
  assert.deepEqual(r2.gou, [{ name: 'postinstall', line: null }])
})

test('钩入：新增键计案；旧本已有之键不判（护钩）', () => {
  const r = analyzeManifest('package.json', '{"scripts":{"build":"vite build"}}', '{"scripts":{"build":"vite build","postinstall":"x","prepare":"y"}}')
  assert.deepEqual(r.gou, [{ name: 'postinstall', line: null }, { name: 'prepare', line: null }])
  const kept = analyzeManifest('package.json', '{"scripts":{"prepare":"husky install"}}', '{"scripts":{"prepare":"husky install"}}')
  assert.deepEqual(kept.gou, [])
})

test('钩入：无底本判全量（从零造册埋钩最险）', () => {
  const r = analyzeManifest('package.json', null, '{"scripts":{"preinstall":"node -e 1"}}')
  assert.deepEqual(r.gou, [{ name: 'preinstall', line: null }])
})

test('越源：publishConfig.registry 新增非默认域计案', () => {
  const r = analyzeManifest('package.json', '{"name":"x"}', '{"name":"x","publishConfig":{"registry":"https://reg.evil.example.com"}}')
  assert.deepEqual(r.yue, [{ name: 'reg.evil.example.com', line: null }])
  const kept = analyzeManifest('package.json', '{"publishConfig":{"registry":"https://reg.evil.example.com"}}', '{"publishConfig":{"registry":"https://reg.evil.example.com"}}')
  assert.deepEqual(kept.yue, []) // 既有同值不判
})

test('越源宿主域：官方子域不判；后缀攻击照判', () => {
  const sub = analyzeManifest('package.json', '{"name":"x"}', '{"publishConfig":{"registry":"https://registry.npmjs.org/"}}')
  assert.deepEqual(sub.yue, [])
  const attack = analyzeManifest('package.json', '{"name":"x"}', '{"publishConfig":{"registry":"https://pypi.org.evil.com/simple"}}')
  assert.equal(attack.yue.length, 1)
  assert.equal(attack.yue[0].name, 'pypi.org.evil.com')
})

test('越源：composer repositories 条目；禁用 packagist 不判', () => {
  const r = analyzeManifest('composer.json', '{"require":{}}', '{"require":{"symfony/console":"^6.0"},"repositories":[{"type":"composer","url":"https://mirror.corp.example"}]}')
  assert.deepEqual(r.zeng, [{ name: 'symfony/console', line: null }])
  assert.deepEqual(r.yue, [{ name: 'mirror.corp.example', line: null }])
  const off = analyzeManifest('composer.json', '{"require":{}}', '{"repositories":{"packagist":false}}')
  assert.deepEqual(off.yue, [])
})

test('requirements：增附带行号；附名归一（大小写与连写不敏感）', () => {
  const old = '# comment\nrequests==2.31.0\n'
  const nw = 'requests==2.31.0\nDjango-Filter==24.3\n'
  const r = analyzeManifest('requirements.txt', old, nw)
  assert.deepEqual(r.zeng, [{ name: 'Django-Filter', line: 2 }])
  const same = analyzeManifest('requirements.txt', 'django_filter==24.3\n', 'Django.Filter==24.3\n')
  assert.deepEqual(same.zeng, [])
})

test('requirements：去锁 == 精确钉 → 范围或裸名', () => {
  const r1 = analyzeManifest('requirements.txt', 'a==1.0.0\n', 'a>=1.0.0\n')
  assert.equal(r1.suo.length, 1)
  const r2 = analyzeManifest('requirements.txt', 'a==1.0.0\n', 'a\n')
  assert.equal(r2.suo.length, 1)
  const r3 = analyzeManifest('requirements.txt', 'a>=1.0.0\n', 'a==1.0.0\n')
  assert.deepEqual(r3.suo, []) // 收紧不判
})

test('requirements：越源行旗标（-i/--extra-index-url/--trusted-host）；默认域不判', () => {
  const r = analyzeManifest('requirements.txt', 'a==1.0.0\n', '-i https://pypi.org/simple\n--extra-index-url https://mirror.corp.example/simple\n--trusted-host files.pythonhosted.org\n--trusted-host mirror.corp.example\n')
  assert.deepEqual(r.yue, [{ name: 'mirror.corp.example', line: 2 }, { name: 'mirror.corp.example', line: 4 }])
})

test('requirements：直连 URL 行不是附名；环境标记剥离', () => {
  const r = analyzeManifest('requirements.txt', 'a==1.0.0\n', 'https://x.example/p.whl\nb==1.0 ; python_version < "3.10"\n')
  assert.deepEqual(r.zeng, [{ name: 'b', line: 2 }])
})

test('pyproject：uv.index 段内 url 非默认域计案带行号', () => {
  const nw = '[project]\nname = "x"\n\n[[tool.uv.index]]\nname = "corp"\nurl = "https://pypi.corp.example/simple"\n'
  const r = analyzeManifest('pyproject.toml', null, nw)
  assert.deepEqual(r.yue, [{ name: 'pypi.corp.example', line: 6 }])
  const ok = analyzeManifest('pyproject.toml', null, '[[tool.uv.index]]\nurl = "https://pypi.org/simple"\n')
  assert.deepEqual(ok.yue, [])
})

test('Gemfile：source 非默认域计案', () => {
  const r = analyzeManifest('Gemfile', null, "source 'https://rubygems.org'\nsource 'https://gems.corp.example'\n")
  assert.deepEqual(r.yue, [{ name: 'gems.corp.example', line: 2 }])
})

test('锁文件与未及族：诚实沉默（无案无注记）', () => {
  const r = analyzeManifest('package-lock.json', null, '{"name":"x","lockfileVersion":3}')
  assert.deepEqual(r.zeng, [])
  assert.deepEqual(r.yue, [])
  assert.deepEqual(r.notes, [])
})

// ---------- 词法与宿主工具 ----------

test('词法：段切、词元、重定向目标、glob', () => {
  assert.deepEqual(segments('a && b | c'), ['a ', ' b ', ' c'])
  assert.deepEqual(tokenize("echo 'x' > f"), ['echo', 'x', '>', 'f'])
  assert.deepEqual(redirectTargets('echo hi > out.json'), ['out.json'])
  assert.deepEqual(redirectTargets('cmd 2>&1'), [])
  assert.ok(globMatch('vendor/pkg/package.json', 'vendor/*'))
  assert.ok(!globMatch('src/package.json', 'vendor/*'))
  assert.ok(globMatch('a/b', 'a/b'))
})

test('宿主工具：hostOf 剥 scheme 与端口；isDefaultHost 相等或子域', () => {
  assert.equal(hostOf('https://User@reg.corp.example:8443/simple'), 'reg.corp.example')
  assert.ok(isDefaultHost('registry.npmjs.org', ['registry.npmjs.org']))
  assert.ok(isDefaultHost('api.pypi.org', ['pypi.org']))
  assert.ok(!isDefaultHost('pypi.org.evil.com', ['pypi.org']))
})

// ---------- 籍账引擎 ----------

function engineOf(...calls) {
  const engine = createEngine({ book: null })
  for (const c of calls) recordCall(engine, c)
  return engine
}

test('引擎：write 无 content → 素籍；edit 无文不改末文 gauge 注记', () => {
  const engine = engineOf(
    { session: 's', name: 'write', args: { path: 'package.json' }, isError: false },
    { session: 's', name: 'edit', args: { path: 'package.json' }, isError: false },
  )
  const settled = settleLines(engine)
  assert.equal(settled[0].state, '素籍')
  const r = judge(engine)
  assert.equal(r.cases.su, 1)
  assert.ok(r.issues.some((s) => s.includes('素籍：package.json')))
})

test('引擎：观察供旧本——read 后 write 递案可判', () => {
  const engine = engineOf(
    { session: 's', name: 'read', args: { path: 'package.json' }, isError: false, content: '{"dependencies":{"a":"1.0.0"}}' },
    { session: 's', name: 'write', args: { path: 'package.json', content: '{"dependencies":{"a":"1.0.0","b":"^1.0.0"}}' }, isError: false },
  )
  const r = judge(engine)
  assert.deepEqual(r.cases, { zeng: 1, suo: 0, yue: 0, gou: 0, an: 0, su: 0 })
  assert.equal(r.score.total, 15)
})

test('引擎：exec 重定向与 cp/touch 落点 → 暗籍；cat 与 npm install 不生产；rm 破坏段不生产', () => {
  const r1 = judge(engineOf({ session: 's', name: 'bash', args: { command: "echo '{}' > package.json" }, isError: false }))
  assert.equal(r1.cases.an, 1)
  const r2 = judge(engineOf({ session: 's', name: 'bash', args: { command: 'cp a.json b/go.mod' }, isError: false }))
  assert.equal(r2.cases.an, 1)
  const r3 = judge(engineOf({ session: 's', name: 'bash', args: { command: 'cat package.json' }, isError: false }))
  assert.equal(r3.paths, 0)
  const r4 = judge(engineOf({ session: 's', name: 'bash', args: { command: 'npm install left-pad' }, isError: false }))
  assert.equal(r4.paths, 0)
  const r5 = judge(engineOf({ session: 's', name: 'bash', args: { command: 'rm package.json && echo x > requirements.txt' }, isError: false }))
  assert.equal(r5.cases.an, 1) // rm 段不计生产，重定向段照记
})

test('引擎：失败写不入账', () => {
  const r = judge(engineOf({ session: 's', name: 'write', args: { path: 'package.json', content: '{"x":1}' }, isError: true }))
  assert.equal(r.paths, 0)
  assert.equal(r.calls, 1)
})

test('引擎：判定序——暗籍与写并存时以写判案；考其末文', () => {
  const engine = engineOf(
    { session: 's', name: 'bash', args: { command: 'echo old > package.json' }, isError: false },
    { session: 's', name: 'read', args: { path: 'package.json' }, isError: false, content: '{"dependencies":{}}' },
    { session: 's', name: 'write', args: { path: 'package.json', content: '{"dependencies":{"a":"^1.0.0"}}' }, isError: false },
  )
  const r = judge(engine)
  assert.deepEqual(r.cases, { zeng: 1, suo: 0, yue: 0, gou: 0, an: 0, su: 0 })
})

test('引擎：改净不追——先写附名后写净，末文净即净籍（无增附无去锁）', () => {
  const engine = engineOf(
    { session: 's', name: 'read', args: { path: 'package.json' }, isError: false, content: '{"dependencies":{}}' },
    { session: 's', name: 'write', args: { path: 'package.json', content: '{"dependencies":{"a":"1.0.0"}}' }, isError: false },
    { session: 's', name: 'write', args: { path: 'package.json', content: '{"dependencies":{}}' }, isError: false },
  )
  const r = judge(engine)
  assert.deepEqual(r.cases, { zeng: 0, suo: 0, yue: 0, gou: 0, an: 0, su: 0 })
  assert.equal(r.issues.filter((s) => s.startsWith('注记')).length, 1) // 去附 1 名
})

test('引擎：纳籍免账在立案前；增形扩籍面', () => {
  const book = { version: 1, admit: ['vendor/*'], extra: ['Makefile'] }
  const e1 = createEngine({ book })
  recordCall(e1, { session: 's', name: 'write', args: { path: 'vendor/x/package.json', content: '{"scripts":{"postinstall":"x"}}' }, isError: false })
  const r1 = judge(e1)
  assert.equal(r1.paths, 0)
  const e2 = createEngine({ book })
  recordCall(e2, { session: 's', name: 'write', args: { path: 'Makefile', content: 'a:\n\techo b\n' }, isError: false })
  const r2 = judge(e2)
  assert.equal(r2.paths, 1) // 增形入账（未及族诚实沉默，无案）
})

test('引擎：多流合审——旧本池与时序全流全局', () => {
  const engine = createEngine({ book: null })
  recordCall(engine, { session: 'A', ref: '1', name: 'write', args: { path: 'package.json', content: '{"dependencies":{"a":"^1.0.0"}}' }, isError: false })
  recordCall(engine, { session: 'B', ref: '2', name: 'write', args: { path: 'package.json', content: '{"dependencies":{"a":"^1.0.0","b":"^2.0.0"}}' }, isError: false })
  const r = judge(engine)
  assert.deepEqual(r.cases, { zeng: 1, suo: 0, yue: 0, gou: 0, an: 0, su: 0 })
  assert.equal(r.sessions, 2)
})

// ---------- 准值与门禁 ----------

test('准值：单增附 15 偏过门；两增附 30 倾红；单去锁 10 平', () => {
  const r1 = judge(engineOf(
    { session: 's', name: 'read', args: { path: 'package.json' }, isError: false, content: '{"dependencies":{}}' },
    { session: 's', name: 'write', args: { path: 'package.json', content: '{"dependencies":{"a":"^1.0.0"}}' }, isError: false },
  ))
  assert.deepEqual(r1.score, { yue: 0, gou: 0, zeng: 15, suo: 0, total: 15 })
  assert.equal(r1.band, '偏')
  assert.equal(r1.verdict, 'pass')

  const r2 = judge(engineOf(
    { session: 's', name: 'write', args: { path: 'package.json', content: '{"dependencies":{}}' }, isError: false },
    { session: 's', name: 'write', args: { path: 'package.json', content: '{"dependencies":{"a":"^1.0.0","b":"^1.0.0"}}' }, isError: false },
  ))
  assert.equal(r2.score.total, 30)
  assert.equal(r2.band, '倾')
  assert.equal(r2.verdict, 'fail')

  const r3 = judge(engineOf(
    { session: 's', name: 'read', args: { path: 'package.json' }, isError: false, content: '{"dependencies":{"a":"1.0.0"}}' },
    { session: 's', name: 'write', args: { path: 'package.json', content: '{"dependencies":{"a":"^1.0.0"}}' }, isError: false },
  ))
  assert.deepEqual(r3.score, { yue: 0, gou: 0, zeng: 0, suo: 10, total: 10 })
  assert.equal(r3.band, '平')
})

test('准值：越源与钩入单案即红；分带函数与门', () => {
  const yue = judge(engineOf({ session: 's', name: 'write', args: { path: 'requirements.txt', content: '-i https://mirror.corp.example/simple\n' }, isError: false }))
  assert.equal(yue.score.total, 30)
  assert.equal(yue.verdict, 'fail')
  assert.equal(bandOf(0), '平')
  assert.equal(bandOf(14), '平')
  assert.equal(bandOf(15), '偏')
  assert.equal(bandOf(29), '偏')
  assert.equal(bandOf(30), '倾')
  assert.equal(GATE_DEFAULT, 30)
})

test('issues 行序锁死：增附→去锁→越源→钩入→暗籍→素籍→注记→全平', () => {
  const engine = createEngine({ book: null })
  recordCall(engine, { session: 's', name: 'write', args: { path: 'requirements.txt', content: '-i https://m.corp.example/s\n' }, isError: false })
  recordCall(engine, { session: 's', name: 'bash', args: { command: 'echo x > go.sum' }, isError: false })
  recordCall(engine, { session: 's', name: 'write', args: { path: 'go.mod' }, isError: false })
  recordCall(engine, { session: 's', name: 'write', args: { path: 'Gemfile' }, isError: false })
  const r = judge(engine)
  const kinds = r.issues.map((s) => s.split('：')[0])
  assert.deepEqual(kinds, ['越源', '暗籍', '素籍', '素籍', '注记']) // 注记 = requirements 籍无底本
  const clean = judge(engineOf({ session: 's', name: 'read', args: { path: 'package.json' }, isError: false, content: '{"dependencies":{"a":"^1.0.0"}}' }))
  assert.deepEqual(clean.issues, ['籍皆平 ×0 —— 平万物而便百姓']) // 观察不是写：不入账
})

test('judge 幂等：重放同流必得同判词', () => {
  const calls = [
    { session: 's', name: 'read', args: { path: 'package.json' }, isError: false, content: '{"dependencies":{"a":"1.0.0"}}' },
    { session: 's', name: 'write', args: { path: 'package.json', content: '{"dependencies":{"a":"^1.0.0"}}' }, isError: false },
  ]
  const a = judge(engineOf(...calls))
  const b = judge(engineOf(...calls))
  assert.deepEqual(a, b)
})

test('issuesOf 纯函数与 settleLines 对齐（去锁点名不带 spec 原文）', () => {
  const engine = engineOf(
    { session: 's', name: 'read', args: { path: 'package.json' }, isError: false, content: '{"dependencies":{"a":"1.2.3"}}' },
    { session: 's', name: 'write', args: { path: 'package.json', content: '{"dependencies":{"a":"^1.2.3"}}' }, isError: false },
  )
  const settled = settleLines(engine)
  assert.equal(settled[0].cases[0].type, '去锁')
  const issues = issuesOf(settled)
  assert.deepEqual(issues, ['去锁：package.json a'])
  assert.ok(!issues[0].includes('1.2.3')) // spec 值原文不进 issues
})
