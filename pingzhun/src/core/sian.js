/**
 * 四案判定 —— 增附 / 去锁 / 越源 / 钩入 的词法判定（docs/03 §3 锁死），全部确定性，零 LLM。
 *
 * 共同规则：面案（钩入/越源）取「新增」——旧本在，只判旧本所无之词面；
 * 旧本缺（无旧本），判全量（agent 从零造册埋钩移源恰是最险之形）。
 * 递案（增附/去锁）无底本不判——注记「籍无底本」，宁漏勿诬。
 * 末文解析失败 → 递案不判（注记「籍不成谱」）、钩入走词面回退、越源诚实沉默。
 */

import { hostOf, isDefaultHost } from './lexicon.js'

export const HOOK_KEYS = ['preinstall', 'install', 'postinstall', 'prepare']

const NPM_DEP_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
const COMPOSER_DEP_SECTIONS = ['require', 'require-dev']

const JSON_DEEP = new Set(['package.json', 'composer.json'])

const PYPI_DEFAULTS = ['pypi.org', 'files.pythonhosted.org']
const NPM_DEFAULTS = ['registry.npmjs.org']
const PACKAGIST_DEFAULTS = ['repo.packagist.org', 'packagist.org']
const RUBYGEMS_DEFAULTS = ['rubygems.org']

function tryJson(text) {
  if (typeof text !== 'string' || text.length === 0) return null
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/** npm/composer spec 精确版判定：首字符为数字且无范围符。 */
function isExactNpm(spec) {
  return typeof spec === 'string' && /^[0-9]/.test(spec) && !/[\^~*><xX|]/.test(spec)
}

/** requirements spec 精确钉判定：恰为 ==数字版（无通配）。 */
function isExactReq(spec) {
  return typeof spec === 'string' && /^==\s*\d[\w.+-]*$/.test(spec.trim())
}

/** dep 名归一（requirements 侧：pip 名大小写与连写不敏感）。 */
function normReqName(name) {
  return String(name ?? '').toLowerCase().replace(/[-.]/g, '_')
}

function depMapOf(root, sections) {
  const map = new Map()
  if (!root) return map
  for (const s of sections) {
    const v = root[s]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [name, spec] of Object.entries(v)) map.set(name, typeof spec === 'string' ? spec : '')
    }
  }
  return map
}

function hookKeysOfRoot(root) {
  const s = root && typeof root === 'object' ? root.scripts : null
  if (!s || typeof s !== 'object' || Array.isArray(s)) return []
  return HOOK_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(s, k))
}

function hookKeysByRegex(content) {
  const out = []
  for (const m of String(content ?? '').matchAll(/"(preinstall|install|postinstall|prepare)"\s*:/g)) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

/** npm 侧源条目（publishConfig.registry）。 */
function npmSources(root) {
  if (!root) return []
  const reg = root.publishConfig && typeof root.publishConfig === 'object' ? root.publishConfig.registry : null
  if (typeof reg !== 'string' || reg.length === 0) return []
  return [{ url: reg, host: hostOf(reg), line: null }]
}

/** composer 侧源条目（repositories.*.url；禁用 packagist 的布尔不判）。 */
function composerSources(root) {
  if (!root) return []
  const r = root.repositories
  const urls = []
  const push = (e) => {
    if (e && typeof e === 'object' && typeof e.url === 'string' && e.url.length > 0) urls.push(e.url)
  }
  if (Array.isArray(r)) r.forEach(push)
  else if (r && typeof r === 'object') Object.values(r).forEach(push)
  return urls.map((url) => ({ url, host: hostOf(url), line: null }))
}

/** requirements 行解析：附名行与源旗标行。 */
function reqLines(content) {
  const deps = [] // {name, norm, spec, line}
  const sources = [] // {host, line}
  const lines = String(content ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/(^|\s)#.*$/, '').trim()
    if (!line) continue
    if (line.startsWith('-')) {
      let m = line.match(/^(?:--index-url|--extra-index-url|-i)[=\s]+(\S+)\s*$/)
      let kind = 'index'
      if (!m) {
        m = line.match(/^--trusted-host[=\s]+(\S+)\s*$/)
        kind = 'trusted'
      }
      if (m) {
        sources.push({ host: kind === 'trusted' ? m[1].toLowerCase() : hostOf(m[1]), line: i + 1 })
      }
      continue
    }
    const dm = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(.*)$/)
    if (!dm) continue
    if (/:/.test(line) && /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(line)) continue // 直连 URL 行非附名
    const spec = dm[3].split(';')[0].trim()
    deps.push({ name: dm[1], norm: normReqName(dm[1]), spec, line: i + 1 })
  }
  return { deps, sources }
}

/** pyproject 源段（[[tool.uv.index]] 与 [tool.poetry.source] 段内之 url）。 */
function pyprojectSources(content) {
  const out = []
  let inSrc = false
  const lines = String(content ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^\s*\[\[?([^\]]+)\]\]?/)
    if (head) {
      inSrc = /tool\.uv\.index|tool\.poetry\.source/.test(head[1])
      continue
    }
    if (!inSrc) continue
    const u = lines[i].match(/^\s*url\s*=\s*"([^"]+)"/)
    if (u) out.push({ url: u[1], host: hostOf(u[1]), line: i + 1 })
  }
  return out
}

/** Gemfile 源行。 */
function gemfileSources(content) {
  const out = []
  const lines = String(content ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*source\s+['"]([^'"]+)['"]/)
    if (m) out.push({ url: m[1], host: hostOf(m[1]), line: i + 1 })
  }
  return out
}

/** 越源过滤：host 非默认域的条目（docs/03 §3.3 宿主域判定）。 */
function offendingSources(sources, defaults) {
  return sources.filter((s) => s.host && !isDefaultHost(s.host, defaults))
}

/** 面案取新增：newSrc 中 oldSrc（按 url 原文）所无之条目；oldMissing 时全量。 */
function newSources(newSrc, oldSrc, oldMissing) {
  if (oldMissing) return newSrc
  const seen = new Set(oldSrc.map((s) => s.url))
  return newSrc.filter((s) => !seen.has(s.url))
}

function blankResult() {
  return { zeng: [], suo: [], yue: [], gou: [], notes: [] }
}

/** requirements 行级浅判。 */
function analyzeReq(oldContent, newContent) {
  const r = blankResult()
  const nw = reqLines(newContent)
  const oldMissing = typeof oldContent !== 'string'
  const od = oldMissing ? { deps: [], sources: [] } : reqLines(oldContent)

  // 递案：无底本不判（docs/03 §3 共同规则）
  if (oldMissing) {
    r.notes.push('籍无底本')
  } else {
    const oldNames = new Map(od.deps.map((d) => [d.norm, d]))
    for (const d of nw.deps) {
      if (!oldNames.has(d.norm)) r.zeng.push({ name: d.name, line: d.line })
      else {
        const o = oldNames.get(d.norm)
        if (isExactReq(o.spec) && !isExactReq(d.spec)) r.suo.push({ name: d.name, line: d.line })
      }
    }
  }
  // 面案：旧本缺判全量
  for (const s of newSources(nw.sources, od.sources, oldMissing)) {
    if (!s.host || isDefaultHost(s.host, PYPI_DEFAULTS)) continue
    r.yue.push({ name: s.host, line: s.line })
  }
  return r
}

/** package.json / composer.json 深判。 */
function analyzeJson(basename, oldContent, newContent) {
  const r = blankResult()
  const isComposer = basename === 'composer.json'
  const sections = isComposer ? COMPOSER_DEP_SECTIONS : NPM_DEP_SECTIONS
  const newRoot = tryJson(newContent)
  const oldMissing = typeof oldContent !== 'string'
  const oldRoot = oldMissing ? null : tryJson(oldContent)

  // 递案：增附与去锁（解析在岗才判）
  if (!newRoot) {
    r.notes.push('籍不成谱')
  } else if (oldMissing) {
    r.notes.push('籍无底本')
  } else if (!oldRoot) {
    r.notes.push('籍不成谱')
  } else {
    const nd = depMapOf(newRoot, sections)
    const od = depMapOf(oldRoot, sections)
    for (const [name] of nd) if (!od.has(name)) r.zeng.push({ name, line: null })
    for (const [name, spec] of nd) {
      if (od.has(name)) {
        const from = od.get(name)
        if (isExactNpm(from) && spec.length > 0 && !isExactNpm(spec)) r.suo.push({ name, line: null })
      }
    }
    const removed = [...od.keys()].filter((n) => !nd.has(n)).length
    if (removed > 0) r.notes.push(`去附 ${removed} 名`)
  }

  // 面案：钩入（唯 package.json；解析失败走词面回退）
  if (!isComposer) {
    const newHooks = newRoot ? hookKeysOfRoot(newRoot) : hookKeysByRegex(newContent)
    const oldHooks = oldMissing ? [] : oldRoot ? hookKeysOfRoot(oldRoot) : hookKeysByRegex(oldContent)
    for (const k of newHooks) if (!oldHooks.includes(k)) r.gou.push({ name: k, line: null })
  }

  // 面案：越源（解析在岗才判；旧本缺判全量、旧本不成谱宁纵）
  const newSrc = isComposer ? composerSources(newRoot) : npmSources(newRoot)
  const defaults = isComposer ? PACKAGIST_DEFAULTS : NPM_DEFAULTS
  const oldSrc = oldMissing ? [] : isComposer ? composerSources(oldRoot) : npmSources(oldRoot)
  const oldUsable = oldMissing || Boolean(oldRoot)
  if (newRoot && oldUsable) {
    for (const s of newSources(newSrc, oldSrc, oldMissing)) {
      if (!s.host || isDefaultHost(s.host, defaults)) continue
      r.yue.push({ name: s.host, line: null })
    }
  }
  return r
}

/** pyproject / Gemfile：越源单案（v1 递案不判）。 */
function analyzeSources(oldContent, newContent, extract, defaults) {
  const r = blankResult()
  const newSrc = extract(newContent)
  const oldMissing = typeof oldContent !== 'string'
  const oldSrc = oldMissing ? [] : extract(oldContent)
  for (const s of newSources(newSrc, oldSrc, oldMissing)) {
    if (!s.host || isDefaultHost(s.host, defaults)) continue
    r.yue.push({ name: s.host, line: s.line })
  }
  return r
}

/**
 * 四案判定唯一入口：basename 分族派发（JSON 深判族 → 行级族 → 越源单案族 → 其余诚实沉默）。
 * 返回 { zeng, suo, yue, gou, notes }——name 为附名/键名/宿主，line 为 1-based 行号（行级族）或 null。
 */
export function analyzeManifest(basename, oldContent, newContent) {
  if (basename === 'pyproject.toml') {
    return analyzeSources(oldContent, newContent, pyprojectSources, PYPI_DEFAULTS)
  }
  if (basename === 'Gemfile') {
    return analyzeSources(oldContent, newContent, gemfileSources, RUBYGEMS_DEFAULTS)
  }
  if (/^requirements/.test(String(basename)) && String(basename).endsWith('.txt')) {
    return analyzeReq(oldContent, newContent)
  }
  if (JSON_DEEP.has(basename)) {
    return analyzeJson(basename, oldContent, newContent)
  }
  return blankResult() // 锁文件与未及族：v1 无案无注记
}
