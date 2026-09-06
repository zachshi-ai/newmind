/**
 * 核心判定语义测试 —— 改动通道、三族词法、复位凭据、判定序、分值分带、册与牌（docs/03/04 的 A1）。
 * 期望值全部先于实现手算定死（docs/03 §10）；实现与手算冲突只能改实现。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseStream, buildCalls } from '../src/core/stream.js'
import { objectKey, familyOf, normalizePath } from '../src/core/object.js'
import {
  segments, tokenize, dropTargets, stripVersion, rcFormHit, parseSegment,
  globMatch, wildcardMatch, RC_EXACT_FORMS, RC_SUFFIX_FORMS, RC_PREFIX_FORMS,
  INSTALL_FORMS, UNINSTALL_FORMS,
} from '../src/core/lexicon.js'
import { createEngine, recordCall, judge, settleLines, bandOf, assembleOpts } from '../src/core/gaizhang.js'
import { parseBook, serializeBook, overrideBook, emptyBook, bookCount } from '../src/core/tuce.js'
import { renderTupai } from '../src/core/tupai.js'
import { auditStreams, sessionName } from '../src/core/audit.js'

// ---- 流解析 ---------------------------------------------------------------

test('流解析：# 注释与空行跳过、坏行报行号', () => {
  const ok = parseStream('# 注释\n\n{"type":"tool_call","id":"c1","name":"read"}\n')
  assert.equal(ok.length, 1)
  assert.throws(() => parseStream('{"a":1}\n不是json\n'), /第 2 行/)
})

test('流解析：id 配对回填 isError 与 content；孤儿 result 建档', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","id":"c1","name":"bash"}\n' +
    '{"type":"tool_result","id":"c1","isError":true,"content":"boom"}\n' +
    '{"type":"tool_result","id":"zz","isError":false}\n',
  ))
  assert.equal(calls.length, 2)
  assert.equal(calls[0].isError, true)
  assert.equal(calls[0].content, 'boom')
  assert.equal(calls[1].ref, 'zz')
})

test('流解析：无 id result 并入紧邻 call（zhizhi 旧格式）', () => {
  const { calls } = buildCalls(parseStream(
    '{"type":"tool_call","name":"bash"}\n{"type":"tool_result","isError":false}\n',
  ))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isError, false)
})

// ---- 对象键与工具族 -------------------------------------------------------

test('对象键：path 字段优先序与命令对象、不透明对象', () => {
  assert.equal(objectKey({ path: 'a.js' }, 'x'), 'p:a.js')
  assert.equal(objectKey({ command: ' npm test ' }, 'x'), 'c:npm test')
  assert.equal(objectKey({ other: 1 }, 'tool9'), 'n:tool9')
})

test('工具族：观察/写/执行/其他', () => {
  assert.equal(familyOf('read'), 'observe')
  assert.equal(familyOf('web_search'), 'observe')
  assert.equal(familyOf('write'), 'write')
  assert.equal(familyOf('bash'), 'exec')
  assert.equal(familyOf('mystery'), 'other')
})

test('径规整：反斜杠、./ 前缀、尾斜杠', () => {
  assert.equal(normalizePath('./a/b/'), 'a/b')
  assert.equal(normalizePath('a\\b\\c'), 'a/b/c')
})

// ---- 词法：目标提取与版本尾饰 ---------------------------------------------

test('词法：段切分与词元化（引号字符删除）', () => {
  assert.deepEqual(segments('a && b || c; d | e'), ['a ', ' b ', ' c', ' d ', ' e'])
  assert.deepEqual(tokenize("echo 'a b' c"), ['echo', 'a', 'b', 'c'])
})

test('词法：dropTargets——cp/mv 末词元、tee/touch 全部、重定向、2>&1 丢弃', () => {
  assert.deepEqual(dropTargets('cp a.js b.js'), ['b.js'])
  assert.deepEqual(dropTargets('tee -a x.log y.log'), ['x.log', 'y.log'])
  assert.deepEqual(dropTargets('echo hi > out.txt'), ['out.txt'])
  assert.deepEqual(dropTargets('echo hi 2>&1'), [])
  assert.deepEqual(dropTargets('cmd >> append.rc'), ['append.rc'])
})

test('版本尾饰剥离：@=<> 截断、@scope 包名位次 0 保留', () => {
  assert.equal(stripVersion('nodemon@3'), 'nodemon')
  assert.equal(stripVersion('requests==2.31'), 'requests')
  assert.equal(stripVersion('pkg>=1.0'), 'pkg')
  assert.equal(stripVersion('@vue/cli'), '@vue/cli')
  assert.equal(stripVersion('@vue/cli@5'), '@vue/cli')
  assert.equal(stripVersion('lodash'), 'lodash')
})

// ---- 改径形 ----------------------------------------------------------------

test('改径形：单名形 basename 全等——src/profile/ 目录名不诬', () => {
  assert.equal(rcFormHit('~/.zshrc'), '.zshrc')
  assert.equal(rcFormHit('/home/u/.bash_profile'), '.bash_profile')
  assert.equal(rcFormHit('src/profile/avatar.js'), null)
  assert.equal(RC_EXACT_FORMS.length, 8)
})

test('改径形：尾形后缀与前缀形', () => {
  assert.equal(rcFormHit('~/.ssh/config'), '.ssh/config')
  assert.equal(rcFormHit('/Users/u/.ssh/authorized_keys'), '.ssh/authorized_keys')
  assert.equal(rcFormHit('/etc/hosts'), '/etc/')
  assert.equal(rcFormHit('etc/hosts'), null)
  assert.equal(rcFormHit('src/.ssh-backup/config'), null)
  assert.equal(RC_SUFFIX_FORMS.length, 2)
  assert.equal(RC_PREFIX_FORMS.length, 1)
})

// ---- 装形词法 --------------------------------------------------------------

test('装形：node 族 scope 词必须在场——项目域安装天然白', () => {
  assert.deepEqual(parseSegment('npm install -g nodemon').installs, [{ manager: 'npm', pkg: 'nodemon' }])
  assert.deepEqual(parseSegment('npm install lodash').installs, [])
  assert.deepEqual(parseSegment('pip install --user yq').installs, [{ manager: 'pip', pkg: 'yq' }])
  assert.deepEqual(parseSegment('pip install requests').installs, [])
  assert.deepEqual(parseSegment('pip3 install --break-system-packages foo').installs, [{ manager: 'pip3', pkg: 'foo' }])
})

test('装形：apt-get 双包两案、yarn global add、pacman -S、动词 i', () => {
  assert.deepEqual(
    parseSegment('apt-get install -y jq ripgrep').installs,
    [{ manager: 'apt-get', pkg: 'jq' }, { manager: 'apt-get', pkg: 'ripgrep' }],
  )
  assert.deepEqual(parseSegment('yarn global add typescript').installs, [{ manager: 'yarn', pkg: 'typescript' }])
  assert.deepEqual(parseSegment('pacman -S curl').installs, [{ manager: 'pacman', pkg: 'curl' }])
  assert.deepEqual(parseSegment('npm i -g cowsay').installs, [{ manager: 'npm', pkg: 'cowsay' }])
})

test('装形：版本尾饰随装剥离、卸词不立装案、默认形表 17 条', () => {
  assert.deepEqual(parseSegment('npm install -g nodemon@3').installs, [{ manager: 'npm', pkg: 'nodemon' }])
  assert.deepEqual(parseSegment('npm uninstall -g nodemon').installs, [])
  assert.equal(INSTALL_FORMS.length, 17)
  assert.equal(UNINSTALL_FORMS.length, 15)
})

// ---- 改词形 ----------------------------------------------------------------

test('改词形：gitconfig 写案（scope 后 ≥2 词元）、询值白、无 scope 白', () => {
  assert.deepEqual(
    parseSegment('git config --global user.email bot@example.com').configs,
    [{ kind: 'gitconfig', key: 'user.email', scope: '--global' }],
  )
  assert.deepEqual(parseSegment('git config --global user.email').configs, [])
  assert.deepEqual(parseSegment('git config user.email a@b').configs, [])
  assert.deepEqual(parseSegment('sudo git config --system x y').configs, [{ kind: 'gitconfig', key: 'x', scope: '--system' }])
})

test('改词形：npmrc set、defaults write、ln 进共享 bin', () => {
  assert.deepEqual(parseSegment('npm config set registry https://x.y').configs, [{ kind: 'npmrc', key: 'registry' }])
  assert.deepEqual(parseSegment('defaults write com.apple.dock autohide -bool true').configs, [{ kind: 'defaults', key: 'com.apple.dock' }])
  assert.deepEqual(parseSegment('ln -sf /opt/x/cli /usr/local/bin/cli').configs, [{ kind: 'ln', key: '/usr/local/bin/cli' }])
  assert.deepEqual(parseSegment('ln -sf a b').configs, [])
})

// ---- 驻形 ------------------------------------------------------------------

test('驻形：brew services、systemctl、docker -d、nohup', () => {
  assert.deepEqual(parseSegment('brew services start redis').resides, [{ kind: 'brew-services', manager: 'brew', target: 'redis' }])
  assert.deepEqual(parseSegment('systemctl enable --now nginx').resides, [{ kind: 'systemctl', manager: 'systemctl', target: 'nginx' }])
  assert.deepEqual(parseSegment('docker run -d redis:7').resides, [{ kind: 'docker', manager: 'docker', target: 'redis:7' }])
  const nohup = parseSegment('nohup npm run dev &')
  assert.equal(nohup.resides.length, 1)
  assert.equal(nohup.resides[0].target, 'npm')
  assert.equal(nohup.installs.length, 0) // npm 无 install 动词不立装案
})

test('驻形：crontab——纯列白、-e/-/文件参皆案、-r 只出凭据', () => {
  assert.equal(parseSegment('crontab -l').resides.length, 0)
  assert.equal(parseSegment('crontab -e').resides.length, 1)
  assert.equal(parseSegment('crontab -').resides.length, 1)
  assert.equal(parseSegment('crontab ~/deploy.cron').resides.length, 1)
  const rmOnly = parseSegment('crontab -r')
  assert.equal(rmOnly.resides.length, 0)
  assert.deepEqual(rmOnly.restores, [{ kind: 'stop-global', manager: 'crontab' }])
  assert.equal(parseSegment('crontab -l | crontab -').resides.length, 1) // 管道分段：纯列白 + stdin 案
})

// ---- 复位凭据词法 ----------------------------------------------------------

test('凭据：node 卸需 scope、pip 卸免 scope、apt 卸词、kill/rm 以段首为准', () => {
  const scoped = parseSegment('npm uninstall -g cowsay').restores
  assert.deepEqual(scoped, [{ kind: 'uninst', manager: 'npm', pkg: 'cowsay' }])
  assert.deepEqual(parseSegment('npm uninstall cowsay').restores, []) // 项目卸载不复全局之案
  assert.deepEqual(parseSegment('pip uninstall -y yq').restores, [{ kind: 'uninst', manager: 'pip', pkg: 'yq' }])
  assert.deepEqual(parseSegment('brew uninstall redis').restores, [{ kind: 'uninst', manager: 'brew', pkg: 'redis' }])
  assert.deepEqual(parseSegment('apt-get remove -y curl').restores, [{ kind: 'uninst', manager: 'apt-get', pkg: 'curl' }])
  assert.deepEqual(parseSegment('pkill -f dev').restores, [{ kind: 'kill' }])
  assert.deepEqual(parseSegment('rm /usr/local/bin/cli').restores, [{ kind: 'rm', paths: ['/usr/local/bin/cli'] }])
  assert.deepEqual(parseSegment('echo rm not-a-cred').restores, []) // 段首词为准
  assert.deepEqual(parseSegment('brew services stop redis').restores, [{ kind: 'stop', manager: 'brew-services', targets: ['redis'] }])
  assert.deepEqual(parseSegment('docker stop x').restores, [{ kind: 'stop-global', manager: 'docker' }])
})

test('凭据：gitconfig unset 同 scope 同 key、npmrc delete、defaults delete', () => {
  assert.deepEqual(
    parseSegment('git config --global --unset core.editor').restores,
    [{ kind: 'cfg', sub: 'gitconfig', scope: '--global', key: 'core.editor' }],
  )
  assert.deepEqual(parseSegment('npm config delete registry').restores, [{ kind: 'cfg', sub: 'npmrc', key: 'registry' }])
  assert.deepEqual(parseSegment('defaults delete com.apple.dock').restores, [{ kind: 'cfg', sub: 'defaults', key: 'com.apple.dock' }])
})

test('词法：宽 glob（复位方向从宽）与 roots glob', () => {
  assert.equal(wildcardMatch('/usr/local/bin/*', '/usr/local/bin/cli'), true)
  assert.equal(wildcardMatch('/usr/local/bin/*', '/usr/bin/cli'), false)
  assert.equal(globMatch('src/**', 'src/a/b.js'), true)
  assert.equal(globMatch('src/*', 'src/a/b.js'), false)
})

// ---- 引擎：立案、复位、判定序 ---------------------------------------------

function run(lines, book = null) {
  const engine = createEngine({ book })
  const { calls } = buildCalls(parseStream(lines))
  for (const c of calls) recordCall(engine, { session: 's1', ref: c.ref, name: c.name, args: c.args, isError: c.isError })
  return engine
}

test('引擎：入口滤——失败调用不入账', () => {
  const e = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"npm install -g nodemon"}}\n' +
    '{"type":"tool_result","id":"c1","isError":true}\n',
  )
  const r = judge(e)
  assert.equal(r.muts, 0)
  assert.equal(r.band, '淮')
})

test('引擎：装案立案与 key 形态、复案销案', () => {
  const e = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"pip install --user yq"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"pip uninstall -y yq"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  const r = judge(e)
  assert.deepEqual(r.score, { total: 0, reside: 0, inst: 0, conf: 0 })
  assert.equal(r.counts.mutated, 1)
  assert.equal(r.counts.restored, 1)
})

test('引擎：凭据时序保护——先卸后装不销案', () => {
  const e = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"pip uninstall -y yq"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"pip install --user yq"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  const r = judge(e)
  assert.equal(r.counts.restored, 0)
  assert.equal(r.score.inst, 15)
  assert.equal(r.band, '移')
})

test('引擎：改径形写案立案；写案无可凭复——rm 不复 rc 写案', () => {
  const e = run(
    '{"type":"tool_call","id":"c1","name":"write","args":{"path":"~/.zshrc","content":"export A=1\\n"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"rm ~/.zshrc"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  const r = judge(e)
  assert.equal(r.counts.leftConf, 1)
  assert.equal(r.counts.restored, 0)
  assert.equal(settleLines(e)[0].key, '改:path:~/.zshrc')
})

test('引擎：ln 案由 rm 凭据宽 glob 复案', () => {
  const e = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"ln -sf /opt/x/cli /usr/local/bin/cli"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"rm /usr/local/bin/*"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  const r = judge(e)
  assert.equal(r.counts.restored, 1)
  assert.equal(r.score.total, 0)
})

test('引擎：gitconfig 案——unset 复案、scope 不匹配不复', () => {
  const ok = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"git config --global core.editor vim"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"git config --global --unset core.editor"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  assert.equal(judge(ok).counts.restored, 1)
  const bad = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"git config --global core.editor vim"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"git config --system --unset core.editor"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  const r = judge(bad)
  assert.equal(r.counts.restored, 0)
  assert.equal(r.score.conf, 15)
})

test('引擎：驻案——kill 复 nohup、docker stop 复 docker run -d、crontab -r 复 crontab', () => {
  const kill = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"nohup serve.sh &"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"pkill -f serve"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  assert.equal(judge(kill).counts.restored, 1)
  const dock = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"docker run -d postgres:16"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"docker stop nostalgic_turing"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  assert.equal(judge(dock).counts.restored, 1)
  const cron = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"crontab -e"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"crontab -r"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  assert.equal(judge(cron).counts.restored, 1)
})

test('引擎：单驻案即红、单装案或单改案黄牌不咬门', () => {
  const reside = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"brew services start redis"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n',
  )
  const rr = judge(reside)
  assert.deepEqual(rr.score, { total: 30, reside: 30, inst: 0, conf: 0 })
  assert.equal(rr.band, '枳')
  assert.equal(rr.verdict, 'fail')
  const inst = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"npm install -g nodemon"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n',
  )
  const ri = judge(inst)
  assert.equal(ri.score.total, 15)
  assert.equal(ri.band, '移')
  assert.equal(ri.verdict, 'pass') // 黄牌点名不咬门
})

test('引擎：分带边界（淮 0–14 / 移 15–29 / 枳 ≥30）', () => {
  assert.equal(bandOf(0), '淮')
  assert.equal(bandOf(14), '淮')
  assert.equal(bandOf(15), '移')
  assert.equal(bandOf(29), '移')
  assert.equal(bandOf(30), '枳')
})

test('引擎：judge 幂等——重放同引擎两次判词全等', () => {
  const e = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"npm install -g nodemon"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"brew services start redis"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  assert.deepEqual(judge(e), judge(e))
})

test('引擎：每案一键——同案重复改动只刷新基点不另立案', () => {
  const e = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"npm install -g nodemon"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"npm install -g nodemon"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  const r = judge(e)
  assert.equal(r.muts, 1)
  assert.equal(r.events, 2)
  assert.equal(r.gauge.mutTop[0].hits, 2)
})

test('引擎：豁免在册——土册三列子串命中完全出账（注记）', () => {
  const e = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"apt-get install -y jq"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"crontab ~/x.cron"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n' +
    '{"type":"tool_call","id":"c3","name":"write","args":{"path":"~/.zshrc","content":"x"}}\n' +
    '{"type":"tool_result","id":"c3","isError":false}\n',
    { install: ['apt'], config: ['.zshrc'], reside: [] },
  )
  const r = judge(e)
  assert.equal(r.counts.exempted, 2) // apt 子串命中 apt-get 案、.zshrc 命中写案
  assert.equal(r.counts.leftReside, 1) // crontab 未豁
  assert.equal(r.score.total, 30)
})

test('引擎：多流合审——跨会话的改动与复位归并；撞名报错', () => {
  const a = '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"npm install -g nodemon"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n'
  const b = '{"type":"tool_call","id":"d1","name":"bash","args":{"command":"npm uninstall -g nodemon"}}\n' +
    '{"type":"tool_result","id":"d1","isError":false}\n'
  const r = auditStreams([
    { name: 'a.jsonl', text: a },
    { name: 'b.jsonl', text: b },
  ])
  assert.equal(r.counts.restored, 1)
  assert.equal(r.score.total, 0)
  assert.equal(r.sessions, 2)
  assert.throws(() => auditStreams([{ name: 'x.jsonl', text: a }, { name: 'x.jsonl', text: b }]), /撞名/)
})

// ---- 土册与土牌块 ---------------------------------------------------------

test('土册：坏册报错、序列化往返、旗标并集', () => {
  assert.throws(() => parseBook('不是json'), /合法 JSON/)
  assert.throws(() => parseBook('{"install":"x"}'), /字符串数组/)
  assert.throws(() => parseBook('{"reside":[1]}'), /非空字符串/)
  const book = parseBook('{"version":1,"install":["brew"],"config":[],"reside":["redis"]}')
  assert.deepEqual(parseBook(serializeBook(book)), book)
  const merged = overrideBook(book, { install: ['npm'], reside: ['crontab'] })
  assert.deepEqual(merged.install, ['brew', 'npm'])
  assert.deepEqual(merged.reside, ['redis', 'crontab'])
  assert.equal(bookCount(book), 2)
  assert.deepEqual(emptyBook(), { version: 1, install: [], config: [], reside: [] })
})

test('土牌块：同一清点两次渲染逐字节相同；册变则文变；全缺省确定性文本', () => {
  const e = run(
    '{"type":"tool_call","id":"c1","name":"bash","args":{"command":"brew services start redis"}}\n' +
    '{"type":"tool_result","id":"c1","isError":false}\n' +
    '{"type":"tool_call","id":"c2","name":"bash","args":{"command":"npm install -g nodemon"}}\n' +
    '{"type":"tool_result","id":"c2","isError":false}\n',
  )
  const stats = judge(e)
  const lines = settleLines(e)
  const t1 = renderTupai(null, stats, lines)
  const t2 = renderTupai(null, judge(e), settleLines(e))
  assert.equal(t1, t2)
  assert.match(t1, /驻:brew:redis（会话 s1）/)
  assert.match(t1, /装:npm:nodemon（会话 s1）/)
  assert.notEqual(renderTupai({ install: ['npm'] }, stats, lines), t1)
  const bare = renderTupai(null)
  assert.equal(renderTupai(null), bare)
  assert.match(bare, /土册：install 0 条 · config 0 条 · reside 0 条/)
})

test('装配：无册空册等价、assembleOpts 旗标并集', () => {
  assert.deepEqual(assembleOpts({}), { install: [], config: [], reside: [] })
  assert.deepEqual(
    assembleOpts({ book: null, overrides: { install: ['brew'] } }),
    { install: ['brew'], config: [], reside: [] },
  )
  assert.equal(sessionName('/a/b/c.jsonl'), 'c.jsonl')
})

// ---- 夹具期望（docs/03 §10 手算定死） -------------------------------------

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (f) => readFileSync(join(here, '..', 'fixtures', f), 'utf8')

function auditFixture(name, opts = {}) {
  return auditStreams([{ name, text: fx(name) }], opts)
}

test('夹具 clean-stream：4 调用 0 案 0 分淮带 exit 0', () => {
  const r = auditFixture('clean-stream.jsonl')
  assert.equal(r.calls, 4)
  assert.equal(r.muts, 0)
  assert.deepEqual(r.score, { total: 0, reside: 0, inst: 0, conf: 0 })
  assert.equal(r.band, '淮')
  assert.equal(r.ok, true)
})

test('夹具 drift-stream：3 案 60 分枳带 fail', () => {
  const r = auditFixture('drift-stream.jsonl')
  assert.equal(r.calls, 4)
  assert.equal(r.muts, 3)
  assert.deepEqual(r.score, { total: 60, reside: 30, inst: 15, conf: 15 })
  assert.equal(r.band, '枳')
  assert.equal(r.ok, false)
  assert.deepEqual(r.counts, { mutated: 3, restored: 0, exempted: 0, leftReside: 1, leftInst: 1, leftConf: 1 })
})

test('夹具 restored-stream：3 案全复 0 分淮带', () => {
  const r = auditFixture('restored-stream.jsonl')
  assert.equal(r.calls, 7)
  assert.equal(r.muts, 3)
  assert.deepEqual(r.score, { total: 0, reside: 0, inst: 0, conf: 0 })
  assert.equal(r.band, '淮')
  assert.deepEqual(r.counts, { mutated: 3, restored: 3, exempted: 0, leftReside: 0, leftInst: 0, leftConf: 0 })
})

test('夹具 declared-stream 带册：3 豁（完全出账）2 改遗 30 分', () => {
  const r = auditFixture('declared-stream.jsonl', { book: parseBook(fx('shuitu-book.json')) })
  assert.equal(r.calls, 4)
  assert.equal(r.muts, 2)
  assert.equal(r.events, 2)
  assert.deepEqual(r.score, { total: 30, reside: 0, inst: 0, conf: 30 })
  assert.equal(r.band, '枳')
  assert.equal(r.ok, false)
  assert.deepEqual(r.counts, { mutated: 2, restored: 0, exempted: 3, leftReside: 0, leftInst: 0, leftConf: 2 })
})

test('夹具 declared-stream 无册照判：5 案 90 分枳带', () => {
  const r = auditFixture('declared-stream.jsonl')
  assert.equal(r.muts, 5)
  assert.deepEqual(r.score, { total: 90, reside: 30, inst: 30, conf: 30 })
  assert.equal(r.counts.exempted, 0)
  assert.equal(r.ok, false)
})

test('夹具 mixed-stream：5 案 2 复 60 分枳带', () => {
  const r = auditFixture('mixed-stream.jsonl')
  assert.equal(r.calls, 9)
  assert.equal(r.muts, 5)
  assert.deepEqual(r.score, { total: 60, reside: 30, inst: 15, conf: 15 })
  assert.equal(r.band, '枳')
  assert.deepEqual(r.counts, { mutated: 5, restored: 2, exempted: 0, leftReside: 1, leftInst: 1, leftConf: 1 })
  assert.match(r.issues[0], /^驻遗 ×1/)
  assert.match(r.issues.find((i) => i.startsWith('复')), /驻:nohup:npm/)
})

test('夹具附加口径：旗标豁免、门禁翻转、中带可达', () => {
  const driftOverrides = auditFixture('drift-stream.jsonl', { overrides: { install: ['npm'] } })
  assert.deepEqual(driftOverrides.score, { total: 45, reside: 30, inst: 0, conf: 15 })
  assert.equal(driftOverrides.counts.exempted, 1)
  const gated = auditFixture('drift-stream.jsonl', { gate: 70 })
  assert.equal(gated.verdict, 'pass')
  assert.equal(gated.ok, true)
  const middle = auditFixture('mixed-stream.jsonl', { overrides: { reside: ['redis', 'nohup'], install: ['npm'] } })
  assert.deepEqual(middle.score, { total: 15, reside: 0, inst: 0, conf: 15 })
  assert.equal(middle.band, '移')
  assert.equal(middle.ok, true)
  const resideOnly = auditFixture('mixed-stream.jsonl', { overrides: { reside: ['redis', 'nohup'] } })
  assert.deepEqual(resideOnly.score, { total: 30, reside: 0, inst: 15, conf: 15 })
  assert.equal(resideOnly.ok, false)
})
