/**
 * 改动词法 —— exec 命令词面的装/改/驻三族形表与复位凭据提取（docs/03 §4 锁死）。
 *
 * 词面账三原则：不做文件系统语义、不展开 `~`、不探测存在性；
 * 引号字符从命令文本中删除后空白切词（词面账简化：引号内的空格不再分隔）。
 * 所有「词」的匹配以词元 basename 的小写形为准（命令名惯例小写）；
 * 包名/径/key 的匹配保持原文（大小写敏感）。
 */

/** 段切分：按 && || ; | 切段（管道与链式各段独立判型）。 */
export function segments(command) {
  return String(command ?? '').split(/&&|\|\||;|\|/)
}

/** 词元化：删引号字符后空白切分。 */
export function tokenize(segment) {
  return String(segment ?? '').replace(/['"]/g, '').trim().split(/\s+/).filter(Boolean)
}

const BASENAME_RE = /[/\\]/

/** 词元 basename。 */
export function base(token) {
  return String(token ?? '').split(BASENAME_RE).pop()
}

/** 段首词（basename 小写）。 */
export function headWord(segment) {
  const t = tokenize(segment)
  if (!t.length) return ''
  return base(t[0]).toLowerCase()
}

const FLAG_RE = /^-/
const OUTREF_RE = /^&\d/

function validTarget(token) {
  return !FLAG_RE.test(token) && !OUTREF_RE.test(token)
}

const REDIRECT_RE = /(?:^|\s)[012&]*>{1,2}\s*([^\s;&|<>]+)/g
const CP_MV = new Set(['cp', 'mv'])
const TEE_TOUCH = new Set(['tee', 'touch'])

/**
 * exec 词面提取目标（改径形命中用，docs/03 §4.5）：
 *   cp/mv → 末个非旗标词元；tee/touch → 其余全部非旗标词元；其余段 → 重定向正则。
 */
export function dropTargets(segment) {
  const tokens = tokenize(segment)
  if (!tokens.length) return []
  const head = base(tokens[0]).toLowerCase()
  const out = []
  if (CP_MV.has(head)) {
    const paths = tokens.slice(1).filter(validTarget)
    if (paths.length) out.push(paths[paths.length - 1])
  } else if (TEE_TOUCH.has(head)) {
    out.push(...tokens.slice(1).filter(validTarget))
  } else {
    REDIRECT_RE.lastIndex = 0
    let m
    while ((m = REDIRECT_RE.exec(String(segment))) !== null) {
      if (validTarget(m[1])) out.push(m[1])
    }
  }
  return out
}

/**
 * 版本尾饰剥离（装/卸两侧同剥）：自第一个位次 > 0 的 `@` `=` `<` `>` 起截断。
 * `nodemon@3` → nodemon；`requests==2.31` → requests；`@vue/cli` 位次 0 的 @ 保留；`@vue/cli@5` → @vue/cli。
 */
export function stripVersion(token) {
  const s = String(token ?? '')
  for (let i = 1; i < s.length; i++) {
    if (s[i] === '@' || s[i] === '=' || s[i] === '<' || s[i] === '>') return s.slice(0, i)
  }
  return s
}

// ---- 三族形表（docs/03 §4.2–§4.4，默认 41 形） -----------------------------

/** 装形 17 条：manager → { verbs, scope }。scope 为 null 表示本征常驻（免 scope 词）。 */
const NODE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun']
export const INSTALL_FORMS = [
  ...NODE_MANAGERS.map((m) => ({ manager: m, verbs: ['install', 'add', 'i'], scope: ['-g', '--global', 'global'] })),
  { manager: 'pip', verbs: ['install'], scope: ['--user', '--system', '--break-system-packages'] },
  { manager: 'pip3', verbs: ['install'], scope: ['--user', '--system', '--break-system-packages'] },
  { manager: 'pipx', verbs: ['install'], scope: null },
  { manager: 'gem', verbs: ['install'], scope: null },
  { manager: 'cargo', verbs: ['install'], scope: null },
  { manager: 'go', verbs: ['install'], scope: null },
  { manager: 'apt', verbs: ['install'], scope: null },
  { manager: 'apt-get', verbs: ['install'], scope: null },
  { manager: 'dnf', verbs: ['install'], scope: null },
  { manager: 'yum', verbs: ['install'], scope: null },
  { manager: 'pacman', verbs: ['install', '-S'], scope: null },
  { manager: 'apk', verbs: ['install', 'add'], scope: null },
  { manager: 'brew', verbs: ['install'], scope: null },
]

const NODE_UNINSTALL = ['uninstall', 'remove', 'rm', 'unlink']
export const UNINSTALL_FORMS = [
  ...NODE_MANAGERS.map((m) => ({ manager: m, verbs: NODE_UNINSTALL, scoped: true })),
  { manager: 'pip', verbs: ['uninstall'], scoped: false },
  { manager: 'pip3', verbs: ['uninstall'], scoped: false },
  { manager: 'gem', verbs: ['uninstall'], scoped: false },
  { manager: 'cargo', verbs: ['uninstall'], scoped: false },
  { manager: 'apt', verbs: ['remove', 'purge', 'autoremove'], scoped: false },
  { manager: 'apt-get', verbs: ['remove', 'purge', 'autoremove'], scoped: false },
  { manager: 'dnf', verbs: ['remove', 'erase', 'autoremove'], scoped: false },
  { manager: 'yum', verbs: ['remove', 'erase', 'autoremove'], scoped: false },
  { manager: 'pacman', verbs: ['-R', '-Rs', '-Rns'], scoped: false },
  { manager: 'apk', verbs: ['del', 'delete'], scoped: false },
  { manager: 'brew', verbs: ['uninstall', 'remove'], scoped: false },
]

/** 装案包名词元提取：非旗标，剔除 manager 词、动词、`global`、`get`。 */
const INSTALL_STOP = new Set(['install', 'add', 'i', 'global', 'get'])
function packageTokens(tokens, managerWords, verbWords) {
  const stops = new Set([...managerWords, ...verbWords, 'global'])
  return tokens
    .filter((t) => !FLAG_RE.test(t))
    .filter((t) => !stops.has(base(t).toLowerCase()))
    .map(stripVersion)
    .filter((p) => p.length > 0)
}

// ---- 改径形 11（docs/03 §4.3） --------------------------------------------

/** 单名形 8：basename 全等（防 `src/profile/` 目录名之诬）。 */
export const RC_EXACT_FORMS = [
  '.zshrc', '.zshenv', '.zprofile', '.bashrc', '.bash_profile', '.profile', '.gitconfig', '.gitignore_global',
]
/** 尾形 2：路径后缀匹配。 */
export const RC_SUFFIX_FORMS = ['.ssh/config', '.ssh/authorized_keys']
/** 前缀形 1。 */
export const RC_PREFIX_FORMS = ['/etc/']
/** 默认弃物址。 */
export const SINK_FORMS = ['/dev/null']

/** 改径形命中：单名形 basename 全等、尾形后缀、前缀形前缀。返回命中的形或 null。 */
export function rcFormHit(path) {
  const p = String(path ?? '')
  if (!p) return null
  const bn = base(p)
  const exact = RC_EXACT_FORMS.find((f) => bn === f)
  if (exact) return exact
  const suffix = RC_SUFFIX_FORMS.find((f) => p.endsWith(f))
  if (suffix) return suffix
  const prefix = RC_PREFIX_FORMS.find((f) => p.startsWith(f))
  if (prefix) return prefix
  return null
}

const GIT_SCOPES = ['--global', '--system']
const GIT_UNSET = ['unset', 'unset-all', '--unset', '--unset-all']
const NODE_CONFIG_MANAGERS = new Set(NODE_MANAGERS)
const LNER_DIRS = ['/usr/local/', '/usr/bin/', '/usr/sbin/', '/opt/']

// ---- 单段解析（改动 + 凭据同源） -------------------------------------------

/**
 * 单段的改动与凭据提取（docs/03 §4.2–§4.5）。
 * 返回 { installs, configs, resides, restores, targets }：
 *   installs: [{ manager, pkg }]
 *   configs:  [{ kind: 'gitconfig'|'npmrc'|'defaults'|'ln', key, scope? }]
 *   resides:  [{ kind, manager, target }]
 *   restores: [{ kind: 'uninst'|'cfg'|'stop'|'stop-global'|'kill'|'rm', ... }]
 *   targets:  [词面提取目标]（改径形命中在引擎里做）
 */
export function parseSegment(segment) {
  const tokens = tokenize(segment)
  const out = { installs: [], configs: [], resides: [], restores: [], targets: dropTargets(segment) }
  if (!tokens.length) return out
  const words = tokens.map((t) => base(t).toLowerCase())
  const has = (w) => words.includes(w)
  const nonFlags = tokens.filter((t) => !FLAG_RE.test(t))
  const afterWord = (w) => {
    const i = words.indexOf(w)
    if (i === -1) return []
    const rest = []
    for (let j = i + 1; j < tokens.length; j++) {
      if (!FLAG_RE.test(tokens[j])) rest.push(tokens[j])
      if (rest.length >= 2) break
    }
    return rest
  }

  // ---- 装形 17 ----
  const managerWords = [...new Set(words.filter((w) => INSTALL_FORMS.some((f) => f.manager === w)))]
  for (const form of INSTALL_FORMS) {
    if (!managerWords.includes(form.manager)) continue
    const verbHit = form.verbs.find((v) => (v.startsWith('-') ? tokens.includes(v) : has(v)))
    if (!verbHit) continue
    if (form.scope && !form.scope.some((s) => (s.startsWith('-') ? tokens.includes(s) : has(s)))) continue
    for (const pkg of packageTokens(tokens, managerWords, form.verbs)) {
      out.installs.push({ manager: form.manager, pkg })
    }
  }

  // ---- 改词形 4 ----
  if (has('git') && has('config')) {
    const scope = GIT_SCOPES.find((s) => tokens.includes(s))
    if (scope) {
      const after = tokens.slice(tokens.indexOf(scope) + 1).filter((t) => !FLAG_RE.test(t))
      if (after.length >= 2) out.configs.push({ kind: 'gitconfig', key: after[0], scope })
      const unset = GIT_UNSET.find((u) => words.includes(u))
      if (unset) {
        const ui = words.indexOf(unset)
        const key = tokens.slice(ui + 1).find((t) => !FLAG_RE.test(t))
        if (key) out.restores.push({ kind: 'cfg', sub: 'gitconfig', scope, key })
      }
    }
  }
  const nodeConfigPresent = nonFlags.some((t) => NODE_CONFIG_MANAGERS.has(base(t).toLowerCase()))
  if (nodeConfigPresent && has('config')) {
    if (has('set')) {
      const key = afterWord('set')[0]
      if (key) out.configs.push({ kind: 'npmrc', key })
    }
    if (has('delete')) {
      const key2 = afterWord('delete')[0]
      if (key2) out.restores.push({ kind: 'cfg', sub: 'npmrc', key: key2 })
    }
  }
  if (has('defaults')) {
    if (has('write')) {
      const domain = afterWord('write')[0]
      if (domain) out.configs.push({ kind: 'defaults', key: domain })
    }
    if (has('delete')) {
      const domain2 = afterWord('delete')[0]
      if (domain2) out.restores.push({ kind: 'cfg', sub: 'defaults', key: domain2 })
    }
  }
  if (has('ln')) {
    const last = nonFlags[nonFlags.length - 1]
    if (last && LNER_DIRS.some((d) => last.startsWith(d))) {
      out.configs.push({ kind: 'ln', key: last })
    }
  }

  // ---- 驻形 9 ----
  if (has('brew') && has('services')) {
    const verb = ['start', 'run', 'restart'].find((v) => has(v))
    if (verb) {
      const t = afterWord(verb)[0]
      if (t) out.resides.push({ kind: 'brew-services', manager: 'brew', target: t })
    }
    const stopVerb = ['stop', 'unload'].find((v) => has(v))
    if (stopVerb) {
      const t = afterWord(stopVerb)[0]
      out.restores.push(t ? { kind: 'stop', manager: 'brew-services', targets: [t] } : { kind: 'stop-global', manager: 'brew-services' })
    }
  }
  if (has('systemctl')) {
    const verb = ['start', 'enable', 'restart'].find((v) => has(v))
    if (verb) {
      const t = afterWord(verb)[0]
      if (t) out.resides.push({ kind: 'systemctl', manager: 'systemctl', target: t })
    }
    const stopVerb = ['stop', 'disable', 'mask'].find((v) => has(v))
    if (stopVerb) {
      const t = afterWord(stopVerb)[0]
      if (t) out.restores.push({ kind: 'stop', manager: 'systemctl', targets: [t] })
    }
  }
  if (has('service') && has('start')) {
    const t = afterWord('service')[0]
    if (t) out.resides.push({ kind: 'service-start', manager: 'service', target: t })
    if (has('stop')) {
      const t2 = afterWord('service')[0]
      if (t2) out.restores.push({ kind: 'stop', manager: 'service-start', targets: [t2] })
    }
  }
  if (has('launchctl')) {
    const verb = ['load', 'bootstrap', 'enable'].find((v) => has(v))
    if (verb) {
      const t = afterWord(verb)[0]
      if (t) out.resides.push({ kind: 'launchctl', manager: 'launchctl', target: t })
    }
    const stopVerb = ['unload', 'bootout', 'disable'].find((v) => has(v))
    if (stopVerb) {
      const t = afterWord(stopVerb)[0]
      if (t) out.restores.push({ kind: 'stop', manager: 'launchctl', targets: [t] })
    }
  }
  if (has('pm2')) {
    if (has('start')) {
      const t = afterWord('start')[0]
      if (t) out.resides.push({ kind: 'pm2', manager: 'pm2', target: t })
    }
    const stopVerb = ['stop', 'delete'].find((v) => has(v))
    if (stopVerb) {
      const t = afterWord(stopVerb)[0]
      if (t) out.restores.push({ kind: 'stop', manager: 'pm2', targets: [t] })
    } else if (has('kill')) {
      out.restores.push({ kind: 'stop-global', manager: 'pm2' })
    }
  }
  if (has('docker') && has('run') && (tokens.includes('-d') || tokens.includes('--detach'))) {
    const last = nonFlags[nonFlags.length - 1]
    if (last) out.resides.push({ kind: 'docker', manager: 'docker', target: last })
  }
  if (has('docker') && ['stop', 'rm', 'down'].some((v) => has(v))) {
    out.restores.push({ kind: 'stop-global', manager: 'docker' })
  }
  for (const launcher of ['nohup', 'setsid']) {
    if (has(launcher)) {
      const t = afterWord(launcher)[0]
      if (t) out.resides.push({ kind: launcher, manager: launcher, target: t })
    }
  }
  if (has('crontab')) {
    const rest = tokens.slice(words.indexOf('crontab') + 1)
    const restNonFlags = rest.filter((t) => !FLAG_RE.test(t))
    const pureList = rest.length > 0 && rest.every((t) => t === '-l')
    const pureRemove = rest.length > 0 && rest.every((t) => t === '-r')
    const stdinMark = rest.includes('-')
    if (!pureList && !pureRemove && (restNonFlags.length > 0 || rest.includes('-e') || stdinMark)) {
      out.resides.push({ kind: 'crontab', manager: 'crontab', target: 'crontab' })
    }
    if (rest.includes('-r')) out.restores.push({ kind: 'stop-global', manager: 'crontab' })
  }

  // ---- 复位凭据 ----
  const head = headWord(segment)
  for (const form of UNINSTALL_FORMS) {
    if (!managerWords.includes(form.manager)) continue
    const verbHit = form.verbs.find((v) => (v.startsWith('-') ? tokens.includes(v) : has(v)))
    if (!verbHit) continue
    if (form.scoped) {
      const scoped = ['-g', '--global', 'global'].some((s) => (s.startsWith('-') ? tokens.includes(s) : has(s)))
      if (!scoped) continue
    }
    for (const pkg of packageTokens(tokens, managerWords, form.verbs)) {
      out.restores.push({ kind: 'uninst', manager: form.manager, pkg })
    }
  }
  if (['kill', 'pkill', 'killall'].includes(head)) out.restores.push({ kind: 'kill' })
  if (['rm', 'rmdir', 'unlink'].includes(head)) {
    out.restores.push({ kind: 'rm', paths: tokens.slice(1).filter((t) => !FLAG_RE.test(t)) })
  }

  return out
}

const GLOB_ESCAPE = /[.*+?^${}()|[\]\\]/g

/** roots 式 glob（`**` 跨 `/`、`*` 不跨 `/`、`?` 单字符；尾 `/` 视为目录前缀）——本层 v1 未用，与全仓词法同备。 */
export function globMatch(pattern, path) {
  const p = String(pattern ?? '')
  const s = String(path ?? '')
  if (p === s) return true
  const src = (p.endsWith('/') ? p + '**' : p)
    .split('**')
    .map((seg) =>
      seg
        .split('*')
        .map((piece) => piece.split('?').map((q) => q.replace(GLOB_ESCAPE, '\\$&')).join('[^/]'))
        .join('[^/]*'),
    )
    .join('.*')
  return new RegExp(`^${src}$`).test(s)
}

/** 凭据宽匹配（`*` 匹配任意含 `/`、`?` 单字符）——复位方向从宽（宁纵）。 */
export function wildcardMatch(pattern, path) {
  const p = String(pattern ?? '')
  const s = String(path ?? '')
  if (p === s) return true
  const src = p
    .split('*')
    .map((piece) => piece.split('?').map((q) => q.replace(GLOB_ESCAPE, '\\$&')).join('.'))
    .join('.*')
  return new RegExp(`^${src}$`).test(s)
}
