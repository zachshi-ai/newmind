/**
 * 约形提取 —— 从正文行提取公共名的词法形态表（docs/03 §3 锁死），全部确定性，零 LLM。
 *
 * 默认形表 15 形（行首允许空白后即形，排除行中散文）：
 *   JS/TS：export function / export async function / export const|let|var /
 *          export class|interface|type|enum / export default function|class（具名）/
 *          module.exports.N = / exports.N = / export { … }（花括号跨行，as 取后名）
 *   Python：def / async def / class / __all__ = […] 字符串项；`_` 前缀名不入面
 *   Go：func（receiver 形同收）与 type struct|interface，首字母大写
 *   Rust：裸 pub fn|struct|enum|trait|const|type|mod（pub(crate) 限域不收）
 * 约外不治：未命中行不产名（宁漏勿诬）；册 forms 增形须含命名捕获组 name；
 * noDefaults 可关默认表。
 */

const JS_FORMS = [
  /^\s*export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+default\s+class\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:module\.exports|exports)\s*\.\s*([A-Za-z_$][\w$]*)\s*=/,
]

const PY_FORMS = [
  /^\s*async\s+def\s+([A-Za-z_][\w]*)/,
  /^\s*def\s+([A-Za-z_][\w]*)/,
  /^\s*class\s+([A-Za-z_][\w]*)/,
]

const GO_FORMS = [
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/,
  /^\s*type\s+([A-Z]\w*)\s+(?:struct|interface)\b/,
]

const RS_FORMS = [
  /^\s*pub\s+(?:fn|struct|enum|trait|const|type|mod)\s+([A-Za-z_]\w*)/,
]

const ALL_ALL_RE = /^\s*__all__\s*=\s*\[(.*)\]/
const BRACE_OPEN_RE = /^\s*export\s+(?:type\s+|default\s+)?\{(.*)$/
const STR_ITEM_RE = /['"]([^'"]+)['"]/g

function addJs(names, n) {
  if (n) names.add(n)
}

/** Python 名：`_` 前缀不入面（Python 私有惯例）；其他语言不剥。 */
function addPy(names, n) {
  if (n && !n.startsWith('_')) names.add(n)
}

/**
 * 花括号形词元收集：取 `}` 之前的段按 `,` 切，每词元剥 as 前段与 from 尾。
 * 返回是否在本行闭括号（true = 已闭，false = 跨行续）。
 */
function collectBrace(chunk, names) {
  const end = chunk.indexOf('}')
  const body = end >= 0 ? chunk.slice(0, end) : chunk
  for (let item of body.split(',')) {
    item = item.trim()
    if (!item) continue
    const asMatch = item.match(/^(?:type\s+)?([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\s*$/)
    if (asMatch) {
      addJs(names, asMatch[2])
      continue
    }
    const m = item.match(/^(?:type\s+)?([A-Za-z_$][\w$]*)/)
    if (m) addJs(names, m[1])
  }
  return end >= 0
}

/** 册 forms：字符串源按 JS 正则解析，须含命名捕获组 name。 */
function compileForms(forms) {
  return (Array.isArray(forms) ? forms : []).map((src, i) => {
    try {
      const re = new RegExp(src)
      return { re, idx: i }
    } catch (error) {
      throw new Error(`约册第 ${i + 1} 条增形不是合法正则: ${error.message}`)
    }
  })
}

/**
 * 公面提取：正文 → 名的集合（Set 去重）。
 * opts：{ forms?: string[], noDefaults?: boolean }（缺省用默认形表）。
 */
export function surfaceOf(text, opts = {}) {
  const names = new Set()
  const extra = compileForms(opts.forms)
  const lines = String(text).split(/\r?\n/)
  let brace = false // 花括号形跨行状态

  for (const line of lines) {
    if (brace) {
      brace = !collectBrace(line, names)
      continue
    }

    // 册增形优先（一行命中多形取第一形）
    let hit = false
    for (const { re } of extra) {
      const m = line.match(re)
      if (m && m.groups && m.groups.name) {
        addJs(names, m.groups.name)
        hit = true
        break
      }
    }
    if (hit) continue

    // Python __all__ 列举
    const all = line.match(ALL_ALL_RE)
    if (all) {
      for (const m of all[1].matchAll(STR_ITEM_RE)) addPy(names, m[1])
      continue
    }

    // JS 花括号形（同行闭或跨行开）
    const open = line.match(BRACE_OPEN_RE)
    if (open) {
      if (!collectBrace(open[1], names)) brace = true
      continue
    }

    if (!opts.noDefaults) {
      for (const re of JS_FORMS) {
        const m = line.match(re)
        if (m) {
          addJs(names, m[1])
          break
        }
      }
      for (const re of PY_FORMS) {
        const m = line.match(re)
        if (m) {
          addPy(names, m[1])
          break
        }
      }
      for (const re of GO_FORMS) {
        const m = line.match(re)
        if (m) {
          addJs(names, m[1])
          break
        }
      }
      for (const re of RS_FORMS) {
        const m = line.match(re)
        if (m) {
          addJs(names, m[1])
          break
        }
      }
    }
  }
  return names
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

/** 明削声（docs/03 §3.4）：正文存在一行同时含名（标识符整词）与弃词（默认表 8 词）。 */
const VOICE_WORDS = ['@deprecated', '@removed', 'deprecated', 'Deprecated', 'DEPRECATED', '已废弃', '弃用', '移除']

export function hasVoice(content, name) {
  const text = String(content ?? '')
  if (text.length === 0) return false
  const ident = /^[A-Za-z_$][\w$]*$/.test(name)
  const boundary = ident ? new RegExp(`(?<![A-Za-z0-9_$])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_$])`) : null
  for (const line of text.split(/\r?\n/)) {
    if (!VOICE_WORDS.some((w) => line.includes(w))) continue
    if (boundary ? boundary.test(line) : line.includes(name)) return true
  }
  return false
}
