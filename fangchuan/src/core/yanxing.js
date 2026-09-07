/**
 * 湮形扫描 —— 交付代码里吞错形的词法（docs/03 §3 锁死），全部确定性，零 LLM。
 *
 * 三语族 6 形：空捕 / 空还 / 空接（JS·TS·Java·C#·promise）/ 单行空捕 / 多行空捕（Python）/ 空救（Ruby）。
 * 导词表（决之使导）：空接的表达式含导词即清白——日志、上抛、上报是导不是湮。
 * 词法不析语法：注释与字符串内的形同判（文档豁免后缀挡大头）；catch 体唯注释不判（宁纵）。
 */

/** 导词表 12：体内有之即清白（决之使导）。 */
export const GUIDE_WORDS = [
  'throw', 'raise', 'rethrow', 'console.', 'logger', 'log.', 'print(',
  'sys.stderr', 'process.exit', 'reject(', 'emit(', 'alert(',
]

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

/** 保留换行的抹除：把命中文本换成等长空白（后续形不再重复计入，行号不乱）。 */
function blankSpan(text, start, end) {
  const seg = text.slice(start, end)
  const blanked = seg.replace(/[^\n]/g, ' ')
  return text.slice(0, start) + blanked + text.slice(end)
}

/**
 * 从 `from` 起找与 `(` 配对的 `)`，返回表达式文本（不含外括号）；找不到返回 null。
 * 纯词法括号计数，不做字符串感知（词法可欺但骗一次留一次形）。
 */
function parenSpan(text, from) {
  let depth = 0
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return text.slice(from + 1, i)
    }
  }
  return null
}

/**
 * 形 3 空接：`.catch(实参)`——实参含导词即清白；实参为空体箭头 / null / undefined /
 * 空函数四写法即湮；其余表达式宁纵不判。命中后抹除该段（形 1 不再重复计）。
 */
function scanPromise(text, hits) {
  const re = /\.catch\s*\(/g
  let m
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1
    const expr = parenSpan(text, open)
    if (expr === null) continue
    const trimmed = expr.trim()
    const hasGuide = GUIDE_WORDS.some((w) => trimmed.includes(w))
    const isSwallow =
      trimmed === 'null' ||
      trimmed === 'undefined' ||
      /^\(\s*\)\s*=>\s*null$/.test(trimmed) ||
      /^\(\s*\)\s*=>\s*undefined$/.test(trimmed) ||
      /^\(\s*\)\s*=>\s*\{\s*\}$/.test(trimmed) ||
      /^function\s*\(\s*\)\s*\{\s*\}$/.test(trimmed)
    if (!hasGuide && isSwallow) {
      hits.push({ line: lineOf(text, m.index), form: '空接' })
    }
    text = blankSpan(text, m.index, m.index + m[0].length + expr.length + 1)
    re.lastIndex = 0
  }
  return text
}

/** 多行空捕的体行（Python）：比 except 行缩进更大的连续行。 */
function indentedBody(lines, startIdx, indent) {
  const body = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i]
    if (l.trim() === '') {
      body.push(l)
      continue
    }
    const lead = l.match(/^\s*/)[0]
    if (lead.length <= indent.length) break
    body.push(l)
  }
  return body
}

const PY_EMPTY_BODY = new Set(['pass', '...'])

function pyBodyIsEmpty(body) {
  return body.every((l) => {
    const t = l.trim()
    if (t === '' || t.startsWith('#')) return true
    const code = t.split('#')[0].trim()
    return PY_EMPTY_BODY.has(code)
  })
}

/** Ruby 空救的同缩进 end。 */
function rescueBody(lines, startIdx, indent) {
  const body = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i]
    if (/^\s*end\b/.test(l) && l.match(/^\s*/)[0].length <= indent.length) break
    body.push(l)
  }
  return body
}

/**
 * 湮形扫描（唯一扫描点）：返回命中数组 [{line, form}]，行号为 1-based 的 catch/except 行。
 */
export function scanContent(content) {
  const text = String(content ?? '')
  const hits = []

  // 形 3 空接先行（命中段抹除，防形 1 重复计）
  const afterPromise = scanPromise(text, hits)

  // 形 1 空捕：体剥空白为空
  let m
  const reEmpty = /catch\s*(\([^)]*\))?\s*\{\s*\}/g
  while ((m = reEmpty.exec(afterPromise)) !== null) {
    hits.push({ line: lineOf(text, m.index), form: '空捕' })
  }
  // 形 2 空还：体恰为 `return;`
  const reBare = /catch\s*(\([^)]*\))?\s*\{\s*return;\s*\}/g
  while ((m = reBare.exec(afterPromise)) !== null) {
    hits.push({ line: lineOf(text, m.index), form: '空还' })
  }

  // 形 4 / 形 5（Python，行扫描）
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const code = l.split('#')[0].trimEnd()
    const indent = l.match(/^\s*/)[0]

    // 形 4 单行空捕
    if (/^except\b[^:]*:\s*pass\b/.test(code.trim()) || /^except\s*:\s*pass\b/.test(code.trim())) {
      hits.push({ line: i + 1, form: '单行空捕' })
      continue
    }
    // 形 5 多行空捕：except 行无尾码，体全空
    if (/^except\b.*:\s*$/.test(code.trim())) {
      const body = indentedBody(lines, i, indent)
      if (body.length > 0 && pyBodyIsEmpty(body)) {
        hits.push({ line: i + 1, form: '多行空捕' })
      }
      continue
    }
    // 形 6 空救（Ruby）
    if (/^rescue\s*$/.test(code.trim())) {
      const body = rescueBody(lines, i, indent)
      if (body.every((x) => x.trim() === '' || x.trim().startsWith('#'))) {
        hits.push({ line: i + 1, form: '空救' })
      }
    }
  }

  hits.sort((a, b) => a.line - b.line || (a.form < b.form ? -1 : a.form > b.form ? 1 : 0))
  return hits
}
