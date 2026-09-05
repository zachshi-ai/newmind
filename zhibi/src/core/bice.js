/**
 * 笔册 —— 史词 / 讳形 / 豁免词 三张清单：默认表 ∪ 显式登记（只增不删，声明权在任务方）。
 *
 * 常事不书：史词族表划定了「何种命令的结果必须直书」的边界——族表之外的命令
 * 即便落了讳形也不入账（探测类命令失败本在预期，宁漏勿诬）。
 * 豁免词无默认表：洗白的合法化只能由任务方显式声明，引擎绝不自作主张。
 */

/** 默认史词表（12 词，一词一族；正则源字符串，与显式登记取并集，不能删它）。 */
export const DEFAULT_WORDS = [
  { id: 'w01', label: 'pkg-test', re: '\\b(npm|pnpm|yarn|bun)\\s+(run\\s+)?(test|check)\\b' },
  { id: 'w02', label: 'js-runner', re: '\\b(vitest|jest|mocha)\\b' },
  { id: 'w03', label: 'py-check', re: '\\b(pytest|unittest|tox|flake8)\\b' },
  { id: 'w04', label: 'go-test', re: '\\bgo\\s+(test|vet)\\b' },
  { id: 'w05', label: 'cargo-check', re: '\\bcargo\\s+(test|check|clippy)\\b' },
  { id: 'w06', label: 'make', re: '\\bmake\\b' },
  { id: 'w07', label: 'js-static', re: '\\b(tsc|oxlint|biome)\\b' },
  { id: 'w08', label: 'eslint', re: '\\beslint\\b' },
  { id: 'w09', label: 'py-static', re: '\\b(ruff|mypy|pyright)\\b' },
  { id: 'w10', label: 'jvm-build', re: '\\b(mvn|gradle)\\b' },
  { id: 'w11', label: 'ctest', re: '\\bctest\\b' },
  { id: 'w12', label: 'pre-commit', re: '\\bpre-commit\\b' },
]

/** 默认讳形表（6 形，确定性词法；一字之差即记录性质之差）。 */
export const DEFAULT_MASKS = [
  { id: 't-true', label: '吞真形', re: '\\|\\|\\s*(true\\b|:)' },
  { id: 't-echo', label: '吞言形', re: '\\|\\|\\s*(echo|printf)\\b' },
  { id: 't-exit', label: '吞零形', re: '\\|\\|\\s*exit\\s+0\\b' },
  { id: 't-sete', label: '弛禁形', re: 'set\\s*\\+e\\b' },
  { id: 't-devnull', label: '塞目形', re: '>\\s*/dev/null\\s+2>&1|&>\\s*/dev/null' },
  { id: 't-notests', label: '虚准形', re: '--passWithNoTests' },
]

/**
 * 掩码自洁 —— 报告里不得出现凭据原文（实录块不得成为新的出险面；
 * 这只是报告卫生，不是对出境的审计，出境另有其主）。
 * len > 8 → 前 4 + `…` + 尾 2；否则整段 `…`。
 */
export function maskSecret(literal) {
  const s = String(literal)
  if (s.length > 8) return `${s.slice(0, 4)}…${s.slice(-2)}`
  return '…'
}

const HYGIENE_FORMS = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /AKIA[0-9A-Z]{8,}/g,
]

/** 对报告片段做掩码自洁：四形凭据命中即掩码，其余原样。 */
export function redact(text) {
  let out = String(text)
  for (const re of HYGIENE_FORMS) {
    out = out.replace(re, (m) => maskSecret(m))
  }
  return out
}

/**
 * 掩码映射 —— 摘录安全的结构化保证。
 *
 * 先对全文找出全部凭据区段并替换为掩码，同时保留原文坐标 → 掩码坐标的映射；
 * 摘录窗口的边界若落进凭据区段，则折算到掩码起点——摘录之内只有掩码，
 * 永不出现骑缝泄漏（先截后掩会漏掉骑缝凭据的尾，先掩后截才干净）。
 */
function findSecretSpans(text) {
  const spans = []
  for (const re of HYGIENE_FORMS) {
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    let m
    while ((m = r.exec(text)) !== null) {
      spans.push([m.index, m.index + m[0].length])
      if (m.index === r.lastIndex) r.lastIndex++
    }
  }
  spans.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const s of spans) {
    const last = merged[merged.length - 1]
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1])
    else merged.push([...s])
  }
  return merged
}

/** 全文掩码 + 坐标映射：返回 { text, marks }，marks 为 [原文起, 原文终, 掩码起, 掩码长] 四元组。 */
export function buildRedacted(text) {
  const src = String(text)
  const merged = findSecretSpans(src)
  let out = ''
  let pos = 0
  const marks = []
  for (const [s, e] of merged) {
    out += src.slice(pos, s)
    const redStart = out.length
    const masked = maskSecret(src.slice(s, e))
    out += masked
    marks.push([s, e, redStart, masked.length])
    pos = e
  }
  out += src.slice(pos)
  return { text: out, marks }
}

/** 原文坐标 → 掩码坐标：落在凭据区段内的点折算到掩码起点。 */
function origToRed(i, marks) {
  let shift = 0
  for (const [s, e, redStart, redLen] of marks) {
    if (i < s) return i
    if (i <= e) return redStart
    shift += e - s - redLen
  }
  return i - shift
}

/**
 * 摘录：讳形命中处前 12 + 后 6 字符——在**掩码后的全文**上按映射截取，
 * 再压白、截 48。摘录之内只有掩码，骑缝不可能泄漏。
 */
export function excerptWithHygiene(text, index, length) {
  const { text: red, marks } = buildRedacted(text)
  const s = origToRed(Math.max(0, index - 12), marks)
  const e = origToRed(index + length + 6, marks)
  return red.slice(s, Math.max(e, s)).replace(/\s+/g, ' ').trim().slice(0, 48)
}

function validateAll(items, what) {
  for (const it of items) {
    try {
      new RegExp(it.re, 'g')
    } catch (error) {
      throw new Error(`无效的${what}正则「${it.label || it.id}」: ${error.message}`)
    }
  }
  return items
}

/**
 * 建册：显式登记（正则源字符串数组）与默认表取并集，去重按源字符串。
 * 所有正则在此校验（显式项非法即抛——CLI 侧退出码 2，插件侧由观察兜底吞掉）。
 * @param {{ words?: string[], masks?: string[], excuses?: string[], noDefaults?: boolean }} opts
 */
export function createBice(opts = {}) {
  const noDefaults = opts.noDefaults === true
  const words = [
    ...(noDefaults ? [] : DEFAULT_WORDS),
    ...(opts.words ?? []).map((s, i) => ({ id: `x${i + 1}`, label: String(s), re: String(s) })),
  ]
  const masks = [
    ...(noDefaults ? [] : DEFAULT_MASKS),
    ...(opts.masks ?? []).map((s, i) => ({ id: `x${i + 1}`, label: String(s), re: String(s) })),
  ]
  const excuses = (opts.excuses ?? []).map((s) => String(s)).filter((s) => s.length > 0)
  return {
    words: validateAll(dedupe(words), '史词'),
    masks: validateAll(dedupe(masks), '讳形'),
    excuses,
    noDefaults,
  }
}

/** 按正则源去重（显式与默认撞源时以默认为先——显式只增不删也不重记）。 */
function dedupe(items) {
  const seen = new Set()
  const out = []
  for (const it of items) {
    const key = it.re
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

/** 命中史词：返回逐族命中 [{ id, label, re }]（一词一族，re 为正则源，即族键）。 */
export function matchWords(bice, text) {
  const hits = []
  for (const w of bice.words) {
    if (new RegExp(w.re, 'g').test(text)) hits.push({ id: w.id, label: w.label, re: w.re })
  }
  return hits
}

/** 命中讳形：返回逐处命中 [{ id, label, index, length, literal }]（全列，零宽防御）。 */
export function matchMasks(bice, text) {
  const hits = []
  for (const m of bice.masks) {
    const re = new RegExp(m.re, 'g')
    let mm
    while ((mm = re.exec(text)) !== null) {
      hits.push({ id: m.id, label: m.label, index: mm.index, length: mm[0].length, literal: mm[0] })
      if (mm.index === re.lastIndex) re.lastIndex++ // 零宽防御
    }
  }
  return hits
}

/** 豁免词命中：命令串含任一显式子串即豁。 */
export function matchExcuse(bice, text) {
  return bice.excuses.find((e) => text.includes(e)) ?? null
}
