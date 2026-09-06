/**
 * 词形表 —— 默认 16 形 + 凭形，全部确定性词法，零 NLP、零语义判断。
 *
 * 缄形 m（写侧静音指令，10 形）/ 略形 s（测试跳过指令，5 形）/ 避形 b（exec 绕检旗标，1 形）
 * 凭形 j：有凭之默（@ts-expect-error 自带反证——下行无错则编译报错，验收尺自会验它），注记不计分。
 *
 * 大小写敏感（行业词面固定，宁漏勿诬）；\b 词界防御（@ts-ignores 不命中）。
 * 注释不剥离——静音指令恰恰住在注释里。代码后缀门挡住非代码文件（.md 提及不判）。
 */

/** 默认缄形（写侧静音指令，10 形）。 */
export const DEFAULT_MUTE_FORMS = [
  { id: 'm01', label: 'ts-ignore', re: '@ts-ignore\\b' },
  { id: 'm02', label: 'ts-nocheck', re: '@ts-nocheck\\b' },
  { id: 'm03', label: 'eslint-disable', re: 'eslint-disable\\b' },
  { id: 'm04', label: 'noqa', re: '#\\s*noqa\\b' },
  { id: 'm05', label: 'type-ignore', re: '#\\s*type:\\s*ignore\\b' },
  { id: 'm06', label: 'suppress', re: '@Suppress' },
  { id: 'm07', label: 'rs-allow', re: '#!?\\[allow\\(' },
  { id: 'm08', label: 'nolint', re: '//\\s*nolint\\b' },
  { id: 'm09', label: 'shellcheck', re: '#\\s*shellcheck\\s+disable' },
  { id: 'm10', label: 'rubocop', re: 'rubocop\\s*:\\s*disable' },
]

/** 默认略形（测试跳过指令，5 形；skipIf/only 不判——宁纵）。 */
export const DEFAULT_SKIP_FORMS = [
  { id: 's01', label: 'js-skip', re: '\\b(?:it|test|describe|context)\\s*\\.\\s*skip\\s*\\(' },
  { id: 's02', label: 'x-prefix', re: '\\bx(?:it|describe|context)\\s*\\(' },
  { id: 's03', label: 'unittest-skip', re: '@unittest\\.skip\\b' },
  { id: 's04', label: 'pytest-skip', re: '@pytest\\.mark\\.(?:skip|xfail)\\b' },
  { id: 's05', label: 'junit-disabled', re: '@Disabled\\b' },
]

/** 默认避形（exec 绕检旗标，1 形；绕检是「让检查不发生」，与失败记录被改写是两宗罪）。 */
export const DEFAULT_BYPASS_FORMS = [{ id: 'b01', label: 'no-verify', re: '--no-verify\\b' }]

/** 凭形（有凭之默，独立注记）。 */
export const JUSTIFIED_FORM = { id: 'j01', label: 'ts-expect-error', re: '@ts-expect-error\\b' }

/** 默认代码后缀表（22 后缀 ∪ 声册 extraExts）。 */
export const CODE_EXTS = [
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.java', '.kt', '.kts',
  '.rs', '.go', '.rb', '.cs', '.php', '.c', '.cc', '.cpp', '.h', '.hpp', '.sh', '.swift',
]

export const CONTENT_FIELDS = ['content', 'text', 'new_string', 'newString', 'newText']

/** 编译词形：条目为字符串（显式形登记态）或 { re } 形对象；坏正则抛 Error（CLI 转 exit 2）。 */
export function compileForms(list) {
  return list.map((item) => {
    const f = typeof item === 'string' ? { id: 'x', label: item, re: item } : item
    return { ...f, re: new RegExp(f.re) }
  })
}

/** 代码后缀门：径的后缀 ∈ 默认表 ∪ 声册增词 才扫写内容。 */
export function isCodePath(p, extraExts = []) {
  const s = String(p ?? '').toLowerCase()
  for (const ext of [...CODE_EXTS, ...extraExts]) {
    if (s.endsWith(ext)) return true
  }
  return false
}

/** 内容字段：按序取首个非空字符串（写 args 的词形载体）。 */
export function contentOf(args) {
  const a = args && typeof args === 'object' ? args : {}
  for (const field of CONTENT_FIELDS) {
    if (typeof a[field] === 'string' && a[field].length > 0) return a[field]
  }
  return null
}

/**
 * 逐行扫描：返回 [{ form, line, lineText }]（line 自 1 起，每 (行, 形) 一命中，流内自然序）。
 * 不剥离注释——指令恰恰住在注释里。
 */
export function scanLines(text, forms) {
  const hits = []
  const lines = String(text).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    for (const form of forms) {
      if (form.re.test(lines[i])) hits.push({ form, line: i + 1, lineText: lines[i] })
    }
  }
  return hits
}
