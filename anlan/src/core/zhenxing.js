/**
 * 诊形词法 —— 诊形、对象词元、全量形、指纹（docs/03 §3/§4/§6 锁死），全部显式词表，零 LLM。
 *
 * 诊形是验证命令词法：命令原文小写化子串命中任一形 → 该次 exec 是一次验证之诊
 * （一次落点）。与 huiji 的验证命令词表同族谱不同账：huiji 记单帧胜负挂两通道，本层记状态
 * 排序列——胜负序列对搅动序列的净效果是本层的对象。
 * 对象词元走命令余文切词（剥诊形片段、剥旗标、剥脚手架后剩余词元——agent 点名
 * 验证的对象）；搅笔面与状态笔面做子串命中匹配（auth ⊂ src/auth.js，宽进既知代价）。
 */

// ---- 诊形（验证命令词法，docs/03 §3）----------------------------------------

/** 诊形 44（命令原文小写化子串命中任一形 → 一次验证之诊；册 forms 增形）。 */
export const ZHENXING = [
  'npm test', 'npm run test', 'npm run check', 'npm run lint', 'npm run build',
  'pnpm test', 'pnpm lint', 'yarn test', 'yarn lint', 'bun test',
  'vitest', 'jest', 'mocha', 'karma', 'cypress run', 'playwright test',
  'pytest', 'py.test', 'tox', 'go test', 'go vet',
  'cargo test', 'cargo check', 'cargo clippy', 'gradle test', 'gradlew test', 'mvn test',
  'phpunit', 'dotnet test', 'deno test', 'mix test', 'rake test', 'swift test',
  'make test', 'make check', 'make lint',
  'tsc', 'eslint', 'ruff', 'flake8', 'pylint', 'rubocop', 'golangci', 'shellcheck',
]

/** 全量形余文的脚手架词（剥诊形命中后只剩旗标与脚手架 → 全量形）。 */
export const SCAFFOLD = new Set(['npx', 'node', 'yarn', 'pnpm', 'npm', 'make', 'run'])

const TOKEN_RE = /[A-Za-z0-9_\-./@]+/g

/** 册内生效诊形（默认表 ∪ forms；noDefaults 关默认表）。 */
function activeForms({ forms = [], noDefaults = false } = {}) {
  const all = noDefaults ? [] : [...ZHENXING]
  for (const f of forms) all.push(String(f).toLowerCase())
  return all
}

/** 命令是否命中诊形（小写化子串）。 */
export function hitsZhenxing(command, cfg) {
  const s = String(command ?? '').toLowerCase()
  if (s.length === 0) return false
  return activeForms(cfg).some((f) => s.includes(f))
}

/** 全量形判定（docs/03 §4）：命令剥去全部诊形命中片段后，余文 ASCII 词元
 * 只剩旗标词（`-` 开头）∪ 脚手架词 ∪ 纯标点词（`./...` 类无字母数字）→ 全量形。
 * 剥形按长形优先（'go test' ⊂ 'cargo test'、'npm test' ⊂ 'pnpm test'——防残词之诬）。 */
export function isSweeping(command, cfg = {}) {
  let s = String(command ?? '').toLowerCase()
  const sorted = activeForms(cfg).sort((a, b) => b.length - a.length)
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

/** 点笔对象词元（docs/03 §4）：命令剥去诊形片段后切词，剥旗标词与脚手架词，
 * 余词过停词/纯数字/短词滤（tokensOf 同规）——agent 点名验证的对象。 */
export function commandTokens(command, cfg = {}) {
  let s = String(command ?? '').toLowerCase()
  const sorted = activeForms(cfg).sort((a, b) => b.length - a.length)
  for (const f of sorted) s = s.split(f).join(' ')
  const out = []
  const seen = new Set()
  for (const tok of tokensOf(s)) {
    if (tok.startsWith('-')) continue
    if (SCAFFOLD.has(tok)) continue
    if (!seen.has(tok)) {
      seen.add(tok)
      out.push(tok)
    }
  }
  return out
}

// ---- 对象词元（docs/03 §6，同全仓切词规）------------------------------------

/** 英文停词 37（大小写不敏感全等）。 */
const STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'is', 'was', 'are', 'were', 'be',
  'to', 'for', 'in', 'on', 'with', 'that', 'this', 'it', 'not', 'when',
  'but', 'as', 'at', 'by', 'from',
  'no', 'never', 'cannot', 'without', 'will', 'would', 'should', 'plan',
  'we', 'our', 'us',
])

/**
 * 词元提取（ASCII 路 only）：按 `[A-Za-z0-9_\-./@]+` 切词，剥尾点；过滤停词/
 * 纯数字/长 <2（路径形 token 含 `./_@-` 者保留，普通词元须 ≥3）。CJK 词元不入
 * 对账（跨语言词面不可对账——宁纵）。词元一律小写化（澜册 spare 小写全等）。
 */
export function tokensOf(text) {
  const tokens = []
  const seen = new Set()
  for (const m of String(text ?? '').matchAll(TOKEN_RE)) {
    const t = m[0].replace(/\.+$/, '').toLowerCase()
    if (t.length < 2) continue
    if (!/[./_\-@]/.test(t)) {
      if (t.length < 3) continue
      if (/^\d+$/.test(t)) continue
      if (STOP.has(t)) continue
    }
    if (!seen.has(t)) {
      seen.add(t)
      tokens.push(t)
    }
  }
  return tokens
}

// ---- 指纹 -----------------------------------------------------------------

/** djb2 指纹（案的断言数据，不是原文——掩码是结构性保证）。 */
export function djb2(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}
