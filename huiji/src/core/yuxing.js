/**
 * 愈言词法 —— 愈形、否定卫、对象词元、检形（docs/03 §3–§5 锁死），全部显式词表，零 LLM。
 *
 * 判定单位是行：愈形命中方成愈行（一行多愈形只计一行一案）；否定卫行级拦下
 * （如实负陈述不入罪——本层只审正面的痊愈宣称）；对象词元走整行遮蔽切词
 * （愈言对象双向在场——形前形后皆可，宽进宽出）。
 * 检形是验证命令词法：命令原文小写化子串命中任一形 → 该次 exec 是一次验证之诊。
 */

// ---- 愈形（痊愈态宣称词迹，行级，docs/03 §3）--------------------------------

/** 中文愈形 13（子串命中）——复合痊愈词迹，与 shihu 的工作态词表（已修复/done 等）零交集。 */
export const YU_ZH = [
  '测试通过', '全部通过', '验证通过', '复验通过', '验收通过', '检查通过', '构建通过',
  '全绿', '无失败', '零失败', '修复完成', '修复完毕', '已验证',
]

/** 英文愈形 14（词界，大小写不敏感，多词短语空格容 \s+）。 */
export const YU_EN = [
  'tests pass', 'tests passing', 'all pass', 'all passing', 'all green',
  'is fixed', 'are fixed', 'has been fixed', 'no failures', 'zero failures',
  'build passing', 'build passed', 'checks pass', 'verified',
]

const YU_EN_RES = YU_EN.map((f) => new RegExp(`\\b${f.replace(/\s+/g, '\\s+')}\\b`, 'i'))

/**
 * 行内愈形提取：中英皆扫，取行内最先出现者（index 最小，同位取长者）。
 * 返回 { form, index, len }；无命中返回 null。
 */
export function findYuxing(line) {
  let best = null
  for (const form of YU_ZH) {
    const idx = line.indexOf(form)
    if (idx === -1) continue
    if (!best || idx < best.index || (idx === best.index && form.length > best.len)) {
      best = { form, index: idx, len: form.length }
    }
  }
  for (let i = 0; i < YU_EN.length; i++) {
    const m = YU_EN_RES[i].exec(line)
    if (!m) continue
    const idx = m.index
    const len = m[0].length
    if (!best || idx < best.index || (idx === best.index && len > best.len)) {
      best = { form: YU_EN[i], index: idx, len }
    }
  }
  return best
}

/** 愈形在场（不做卫检查——稿账候选行计数用）。 */
export function hasYuxing(line) {
  return findYuxing(line) !== null
}

// ---- 否定卫（如实负陈述不入罪，行级，docs/03 §4）----------------------------

/** 中文卫词 6（形前紧邻 0–3 字符内子串命中——容三字否定词「尚未/并非」）。 */
export const FOUDING_ZH = ['无', '没有', '并非', '不是', '非', '未']

/** 英文卫词 4（形前紧邻词，词界，大小写不敏感）。 */
export const FOUDING_EN = ['no', 'not', 'never', 'cannot']

const FOUDING_EN_RE = /\b(no|not|never|cannot)[\s,;:]*$/i

/** 否定卫：愈形命中位之前紧邻卫词 → 整行不判（宁纵；窗口 0–3 字符）。 */
export function hasNegationGuard(line, hit) {
  const window = line.slice(Math.max(0, hit.index - 3), hit.index)
  if (FOUDING_ZH.some((w) => window.includes(w))) return true
  return FOUDING_EN_RE.test(line.slice(0, hit.index))
}

// ---- 对象词元（docs/03 §4）--------------------------------------------------

/** 英文停词 37（大小写不敏感全等）。 */
const STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'is', 'was', 'are', 'were', 'be',
  'to', 'for', 'in', 'on', 'with', 'that', 'this', 'it', 'not', 'when',
  'but', 'as', 'at', 'by', 'from',
  'no', 'never', 'cannot', 'without', 'will', 'would', 'should', 'plan',
  'we', 'our', 'us',
])

const TOKEN_RE = /[A-Za-z0-9_\-./@]+/g

/** 把全部愈形命中与卫词从行中遮蔽掉（替换为空白），保其余词面完好。 */
function maskLine(line) {
  let s = line
  for (const form of YU_ZH) s = s.split(form).join(' ')
  for (const re of YU_EN_RES) s = s.replace(re, ' ')
  for (const w of FOUDING_ZH) s = s.split(w).join(' ')
  s = s.replace(/\b(?:no|not|never|cannot)\b/gi, ' ')
  return s
}

/**
 * 对象词元提取（ASCII 路 only）：整行遮蔽愈形与卫词后按 `[A-Za-z0-9_\-./@]+`
 * 切词，剥尾点；过滤停词/纯数字/长 <2（路径形 token 含 `./_@-` 者保留，普通
 * 词元须 ≥3）。CJK 词元不入对账（跨语言词面不可对账——宁纵）。
 */
export function tokensOf(line) {
  const text = maskLine(String(line ?? ''))
  const tokens = []
  const seen = new Set()
  for (const m of text.matchAll(TOKEN_RE)) {
    const t = m[0].replace(/\.+$/, '')
    if (t.length < 2) continue
    if (!/[./_\-@]/.test(t)) {
      if (t.length < 3) continue
      if (/^\d+$/.test(t)) continue
      if (STOP.has(t.toLowerCase())) continue
    }
    if (!seen.has(t)) {
      seen.add(t)
      tokens.push(t)
    }
  }
  return tokens
}

// ---- 检形（验证命令词法，docs/03 §5）----------------------------------------

/** 检形 44（命令原文小写化子串命中任一形 → 一次验证之诊；册 forms 增形）。 */
export const JIANXING = [
  'npm test', 'npm run test', 'npm run check', 'npm run lint', 'npm run build',
  'pnpm test', 'pnpm lint', 'yarn test', 'yarn lint', 'bun test',
  'vitest', 'jest', 'mocha', 'karma', 'cypress run', 'playwright test',
  'pytest', 'py.test', 'tox', 'go test', 'go vet',
  'cargo test', 'cargo check', 'cargo clippy', 'gradle test', 'gradlew test', 'mvn test',
  'phpunit', 'dotnet test', 'deno test', 'mix test', 'rake test', 'swift test',
  'make test', 'make check', 'make lint',
  'tsc', 'eslint', 'ruff', 'flake8', 'pylint', 'rubocop', 'golangci', 'shellcheck',
]

/** 扫痊余文的脚手架词（剥检形命中后只剩旗标与脚手架 → 全量形复验）。 */
const SCAFFOLD = new Set(['npx', 'node', 'yarn', 'pnpm', 'npm', 'make', 'run'])

/** 命令是否命中检形（小写化子串）。 */
export function hitsJianxing(command, { forms = [], noDefaults = false } = {}) {
  const s = String(command ?? '').toLowerCase()
  if (s.length === 0) return false
  if (forms.some((f) => s.includes(String(f).toLowerCase()))) return true
  if (noDefaults) return false
  return JIANXING.some((f) => s.includes(f))
}

/** 扫痊判定（docs/03 §5 扫痊）：命令剥去全部检形命中片段后，余文 ASCII 词元
 * 只剩旗标词（`-` 开头）∪ 脚手架词 ∪ 纯标点词（`./...` 类无字母数字）→ 全量形。
 * 剥形按长形优先（'go test' ⊂ 'cargo test'、'npm test' ⊂ 'pnpm test'——防残词之诬）。 */
export function isSweeping(command) {
  let s = String(command ?? '').toLowerCase()
  const sorted = [...JIANXING].sort((a, b) => b.length - a.length)
  for (const f of sorted) s = s.split(f).join(' ')
  for (const m of s.matchAll(TOKEN_RE)) {
    const t = m[0]
    if (t.startsWith('-')) continue
    if (SCAFFOLD.has(t)) continue
    if (!/[a-z0-9]/.test(t)) continue
    return false
  }
  return true
}

// ---- 指纹 -----------------------------------------------------------------

/** djb2 指纹（案的断言数据，不是行原文——掩码是结构性保证）。 */
export function djb2(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}
