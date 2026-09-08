/**
 * 垢形提取 —— 扫卷面调试残迹的词法形态表（docs/03 §3 锁死），全部确定性，零 LLM。
 *
 * 针形默认表 10 形（一处一行，针优先于屑）：
 *   debugger（行首）/ breakpoint( / pdb|ipdb|pudb.set_trace( / import pdb（行首）/
 *   from pdb import（行首）/ binding.pry|irb|remote_pry / byebug（行首）/ dbg!( /
 *   set -x | set -o xtrace（行首）/ console.trace(
 *   行首形行首是注释符时不中（宁纵）；子串形注释与字符串内命中同判（宁严一格）。
 * 屑两路：打印原语 12 × 标记形 9（大写词界）同行共现；探针注释形独立立案。
 * 册增形 forms 须含命名捕获组 name（命中计遗屑，捕获组名进案名）；noDefaults 关默认表。
 * console.error 不在原语表（错误导出正当——防川层有专门的清白词，本层词面让渡）；
 * logger.* 不在原语表（结构化日志正当）；无标记的裸打印不案（宁纵，册增形兜底）。
 */

const ZHEN_FORMS = [
  { name: 'debugger', re: /^\s*debugger\b/ },
  { name: 'breakpoint', re: /breakpoint\s*\(/ },
  { name: 'set_trace', re: /(?:pdb|ipdb|pudb)\.set_trace\s*\(/ },
  { name: 'import_pdb', re: /^\s*import\s+pdb\b/ },
  { name: 'from_pdb', re: /^\s*from\s+pdb\s+import\b/ },
  { name: 'binding', re: /binding\.(?:pry|irb|remote_pry)/ },
  { name: 'byebug', re: /^\s*byebug\b/ },
  { name: 'dbg', re: /\bdbg!\s*\(/ },
  { name: 'set_x', re: /^\s*set\s+(?:-x|-o\s+xtrace)\b/ },
  { name: 'console_trace', re: /console\.trace\s*\(/ },
]

const PRINT_PRIMS = [
  { name: 'console.log', s: 'console.log(' },
  { name: 'console.info', s: 'console.info(' },
  { name: 'console.debug', s: 'console.debug(' },
  { name: 'console.warn', s: 'console.warn(' },
  { name: 'print', s: 'print(' },
  { name: 'printf', s: 'printf(' },
  { name: 'pprint', s: 'pprint(' },
  { name: 'echo', s: 'echo ' },
  { name: 'puts', s: 'puts ' },
  { name: 'println', s: 'println!(' },
  { name: 'System.out.print', s: 'System.out.print' },
  { name: 'alert', s: 'alert(' },
]

const MARKERS = [
  { name: 'DEBUG', re: /\bDEBUG\b/ },
  { name: 'DBG', re: /\bDBG\b/ },
  { name: 'HERE', re: /\bHERE\b/ },
  { name: 'XXX', re: /\bXXX\b/ },
  { name: 'TODO', re: /\bTODO\b/ },
  { name: '>>>', re: />>>/ },
  { name: '###', re: /###/ },
  { name: '====', re: /====/ },
  { name: 'debug-note', re: /(?:\/\/|#)\s*debug:/ },
]

const NOTE_RE = /(?:\/\/|#)\s*debug:/

/** 试验场名段（docs/03 §4，径含名段即豁免，立案前）：正则形 10（目录段在串首亦算段）。 */
const GROUND_FORMS = [
  /(?:^|\/)tests?\//,
  /(?:^|\/)specs?\//,
  /(?:^|\/)__tests__\//,
  /(?:^|\/)__mocks__\//,
  /(?:^|\/)fixtures\//,
  /(?:^|\/)debug\//,
  /\.test\./,
  /\.spec\./,
  /\.mock\./,
  /\.debug\./,
]

/** 试验场豁免：径含任一名段即真。 */
export function grounded(path) {
  return GROUND_FORMS.some((re) => re.test(path))
}

/** 册增形：字符串源按 JS 正则解析，须含命名捕获组 name。 */
function compileForms(forms) {
  return (Array.isArray(forms) ? forms : []).map((src, i) => {
    try {
      const re = new RegExp(src)
      return { re, idx: i }
    } catch (error) {
      throw new Error(`留册第 ${i + 1} 条增形不是合法正则: ${error.message}`)
    }
  })
}

/** 单行判定：册增形优先 → 针形 → 屑共现 → 屑注释独立路。返回 { kind, name } 或 null。 */
function scanLine(line, extra, noDefaults) {
  for (const { re } of extra) {
    const m = line.match(re)
    if (m && m.groups && m.groups.name) return { kind: 'xie', name: m.groups.name }
  }
  if (!noDefaults) {
    for (const f of ZHEN_FORMS) {
      if (f.re.test(line)) return { kind: 'zhen', name: f.name }
    }
    let prim = null
    for (const p of PRINT_PRIMS) {
      if (line.includes(p.s)) { prim = p.name; break }
    }
    let mark = null
    for (const mk of MARKERS) {
      if (mk.re.test(line)) { mark = mk.name; break }
    }
    if (prim && mark) return { kind: 'xie', name: `${prim}×${mark}` }
    if (!prim && NOTE_RE.test(line)) return { kind: 'xie', name: 'debug-note' }
  }
  return null
}

/**
 * 扫卷面：正文逐行扫垢形，一处 = 一行（一行内命中多形只计一处，形取首）。
 * 返回 [{ line, kind, name }]（line 从 1 起，按行序）。
 */
export function scanContent(text, opts = {}) {
  const extra = compileForms(opts.forms)
  const noDefaults = opts.noDefaults === true
  const hits = []
  const lines = String(text).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const hit = scanLine(lines[i], extra, noDefaults)
    if (hit) hits.push({ line: i + 1, ...hit })
  }
  return hits
}

/** 宽 glob 命中：词元含 * 时按通配全匹配（* 跨目录），否则规整逐字相等（同全仓既例）。 */
export function globMatch(path, pattern) {
  const p = String(pattern ?? '')
  if (!p.includes('*')) return path === p
  const re = new RegExp(
    p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*') + '$'
  )
  return re.test(path)
}
