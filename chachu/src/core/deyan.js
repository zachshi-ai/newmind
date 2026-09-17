/**
 * 得言词法 —— 得言形、指物、模态门（docs/03 §3/§4/§5 锁死），全部显式词表，零 LLM。
 *
 * 判定单位是行：得言形与指物同行共现方成言；模态门行级跳过（将然未然不判）。
 * 网卫：URL 跨度内的 token 一律不作指物。
 */

// ---- 得言形（断言之词迹）------------------------------------------------

/** 中文形 30（子串命中；否定形不设——「不包含」同案，断言缺席与在场一样需要见据）。 */
export const DEYAN_ZH = [
  '写着', '写有', '载有', '包含', '含有', '内含', '使用', '用到', '采用', '启用',
  '配置了', '已配置', '设置了', '已设置', '位于', '存于', '存放在', '存储在', '集中在',
  '输出到', '输出至', '生成于', '保存在', '定义在', '定义于', '实现在', '声明在',
  '调用', '支持', '返回',
]

/** 英文形 23（词界、大小写不敏感）。 */
export const DEYAN_EN = [
  'contains', 'includes', 'uses', 'uses the', 'uses a', 'lives in', 'lives at',
  'located in', 'located at', 'stored in', 'stored at', 'defined in', 'defined at',
  'declared in', 'implemented in', 'implements', 'exports', 'returns', 'supports',
  'written to', 'generated in', 'exists in', 'found in',
]

const DEYAN_EN_RES = DEYAN_EN.map((f) => new RegExp(`\\b${f.replace(/\s+/g, '\\s+')}\\b`, 'i'))

/** 行内得言形提取：返回命中的形（中文子串 ∪ 英文词界），无命中返回空数组。 */
export function findDeyan(line) {
  const hits = []
  for (const f of DEYAN_ZH) if (line.includes(f)) hits.push(f)
  for (let i = 0; i < DEYAN_EN.length; i++) if (DEYAN_EN_RES[i].test(line)) hits.push(DEYAN_EN[i])
  return hits
}

// ---- 模态门（将然未然不判，行级）----------------------------------------

/** 中文模态词 24（子串；「将」单字不设门——只认复合形）。 */
export const MODAL_ZH = [
  '将把', '将要', '将会', '即将', '将来', '应当', '应该', '需要', '务必', '请',
  '建议', '不妨', '可以', '可能', '或许', '也许', '大概', '如果', '若', '一旦',
  '待', '计划', '打算', '考虑',
]

/** 英文模态词 11（词界、大小写不敏感）。 */
export const MODAL_EN = ['will', 'shall', 'should', 'must', 'may', 'might', 'could', 'would', 'todo', 'fixme', 'tbd']

const MODAL_EN_RES = MODAL_EN.map((w) => new RegExp(`\\b${w}\\b`, 'i'))

/** 行级模态门：命中任一模态词 → 整行静默跳过。 */
export function isModal(line) {
  if (MODAL_ZH.some((w) => line.includes(w))) return true
  return MODAL_EN_RES.some((re) => re.test(line))
}

// ---- 指物（断言之对象的径形词法）----------------------------------------

/** 专名底表 10（大小写敏感全等）。 */
export const BASENAMES = new Set([
  'README.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'CONTRIBUTING.md',
  'CHANGELOG.md', 'Makefile', 'Dockerfile', 'Jenkinsfile', 'CMakeLists.txt',
])

/** 扩展名白名单 44。 */
export const EXTS = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts', 'py', 'pyi', 'rb', 'go', 'rs',
  'java', 'kt', 'kts', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'md',
  'markdown', 'txt', 'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg',
  'conf', 'xml', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'sql',
])

/** 目录底表 18（裸目录名断言——信一半，立案疑言档）。 */
export const DIRS = new Set([
  'src', 'lib', 'bin', 'docs', 'tests', 'test', 'config', 'scripts', 'packages',
  'app', 'core', 'utils', 'tools', 'examples', 'assets', 'public', 'build', 'dist',
])

/** 自指形：中文 7 ∪ 英文 4——指物即稿径自身（本笔即据）。 */
export const SELF_ZH = ['本文档', '本报告', '本文件', '本方案', '本说明', '本清单', '本篇']
export const SELF_EN = ['this document', 'this file', 'this report', 'this doc']
const SELF_EN_RES = SELF_EN.map((f) => new RegExp(`\\b${f.replace(/\s+/g, '\\s+')}\\b`, 'i'))

const TOKEN_RE = /[A-Za-z0-9_\-./@]+/g
const URL_RE = /https?:\/\/\S+/g

/** 行内 URL 跨度收集（网卫：跨度内 token 不作指物）。 */
function urlSpans(line) {
  const spans = []
  for (const m of line.matchAll(URL_RE)) spans.push([m.index, m.index + m[0].length])
  return spans
}

/** 径指物判定（docs/03 §4 档一）：slash ∪ 专名底表 ∪ dotfile ∪ 小写扩展名白名单。 */
export function isPathToken(t) {
  if (t.includes('/')) {
    if (!/[a-z]/.test(t)) return false // 全大写斜杠形（TCP/IP）不中——大写词干不判
    return true
  }
  if (BASENAMES.has(t)) return true
  if (t.startsWith('.')) {
    // dotfile：余部小写；裸扩展名（.js/.ts/.env 类——白名单尾段且无第二点）不中，宁纵
    if (!/^[.][a-z][a-z0-9_.-]*$/.test(t)) return false
    return t.includes('.', 1) || !EXTS.has(t.slice(1))
  }
  const m = /^[a-z][a-z0-9_-]*\.([A-Za-z][A-Za-z0-9]{0,5})$/.exec(t)
  if (m) return EXTS.has(m[1])
  return false
}

/**
 * 行内指物提取（docs/03 §4）。返回 { paths: [], dirs: [], self: false }。
 * paths=径指物（规整后逐字去重）；dirs=目录指物（底表全等）；self=命中自指形。
 * token 尾部的句点（「…src/config.js.」句号粘尾）剥除后再判——防同物异写之诬。
 */
export function findZhiwu(line) {
  const spans = urlSpans(line)
  const inUrl = (start, end) => spans.some(([a, b]) => start >= a && end <= b)
  const paths = []
  const dirs = []
  const seen = new Set()
  for (const m of line.matchAll(TOKEN_RE)) {
    if (inUrl(m.index, m.index + m[0].length)) continue
    const t = m[0].replace(/\.+$/, '')
    if (t.length === 0) continue
    if (isPathToken(t)) {
      if (!seen.has(t)) {
        seen.add(t)
        paths.push(t)
      }
      continue
    }
    if (!t.includes('/') && DIRS.has(t)) {
      if (!seen.has(t)) {
        seen.add(t)
        dirs.push(t)
      }
    }
  }
  const self = SELF_ZH.some((w) => line.includes(w)) || SELF_EN_RES.some((re) => re.test(line))
  return { paths, dirs, self }
}

// ---- 指纹 ---------------------------------------------------------------

/** djb2 指纹（案的断言数据，不是行原文——掩码是结构性保证）。 */
export function djb2(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}
