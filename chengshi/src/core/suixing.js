/**
 * 遂形 —— 默认形表三族 15 形（docs/03 §3），无册照判、开箱在岗。
 *
 * 施主（deed head）：段内首个非旗标、非 KEY=VALUE 环境前缀、非包装词的词元，
 * 取 basename、小写化——只用于遂形匹配。
 * 遂键：整段规整（collapseWs），保留原大小写——同串才并键（变参不入键，宁漏）。
 *
 * 三族：
 *   启族 7（外建档）：gh 建档/评论/发版/片/标/api 显 POST/api 默 POST
 *   邮族 5（外发信）：mail / mailx / sendmail / mutt / msmtp
 *   单族 3（非幂等写）：curl·wget 显 POST / 默 POST / httpie POST
 *
 * 排除即边界（docs/03 §12）：发布类同版自守、terraform/PUT 收敛自愈、git push 重复
 * 是推进——皆不在表，重施不入账。
 */

const MAIL_HEADS = new Set(['mail', 'mailx', 'sendmail', 'mutt', 'msmtp'])
const CURL_HEADS = new Set(['curl', 'wget'])
const HTTPPIE_HEADS = new Set(['http', 'https'])
const WRAPPERS = new Set(['sudo', 'nohup', 'command', 'nice'])

const DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '-F', '--form'])
const GH_DEFAULT_POST = new Set(['-f', '--raw-field', '-F', '--input'])
// 旗标大小写敏感：curl 的 -d/-D、-x/-X 语义各异（-D dump-header、-x proxy）
const GH_METHOD_FLAGS = new Set(['-X', '--method'])
const CURL_METHOD_FLAGS = new Set(['-X', '--request'])

/** 施主提取：剥环境前缀与包装词，取首个真词元的 basename（小写）。 */
export function deedHead(tokens) {
  for (const t of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue
    if (t.startsWith('-')) continue
    const low = t.toLowerCase()
    if (WRAPPERS.has(low)) continue
    return low.split(/[/\\]/).pop()
  }
  return null
}

function valueAfter(tokens, flagSet) {
  for (let i = 0; i < tokens.length; i++) {
    if (flagSet.has(tokens[i])) {
      const v = tokens[i + 1]
      if (v && !v.startsWith('-')) return v.toUpperCase()
    }
  }
  return null
}

function hasAny(tokens, set) {
  return tokens.some((t) => set.has(t))
}

/**
 * 段命中判定：返回 { family, name, words }（words 供遂名掩码）或 null。
 * 单族显式方法非 POST 不入（PUT/GET/DELETE 幂等侧、PATCH 不入——宁纵）。
 */
export function matchSegment(tokens) {
  const head = deedHead(tokens)
  if (!head) return null

  if (head === 'gh') {
    const has = (w) => tokens.some((t) => t.toLowerCase() === w)
    const seq = (a, b) => {
      const i = tokens.findIndex((t) => t.toLowerCase() === a)
      return i !== -1 && tokens.slice(i + 1).some((t) => t.toLowerCase() === b)
    }
    if (has('api')) {
      const method = valueAfter(tokens, GH_METHOD_FLAGS)
      if (method === 'POST') return { family: '启', name: 'gh api 显 POST', words: ['gh', 'api', 'POST'] }
      if (!method && hasAny(tokens, GH_DEFAULT_POST)) return { family: '启', name: 'gh api 默 POST', words: ['gh', 'api', 'POST'] }
      return null
    }
    if (seq('pr', 'create') || seq('issue', 'create')) {
      const which = has('pr') ? 'pr' : 'issue'
      return { family: '启', name: 'gh 建档', words: ['gh', which, 'create'] }
    }
    if (seq('pr', 'comment') || seq('issue', 'comment')) {
      const which = has('pr') ? 'pr' : 'issue'
      return { family: '启', name: 'gh 评论', words: ['gh', which, 'comment'] }
    }
    if (seq('release', 'create')) return { family: '启', name: 'gh 发版', words: ['gh', 'release', 'create'] }
    if (seq('gist', 'create')) return { family: '启', name: 'gh 片', words: ['gh', 'gist', 'create'] }
    if (seq('label', 'create')) return { family: '启', name: 'gh 标', words: ['gh', 'label', 'create'] }
    return null
  }

  if (MAIL_HEADS.has(head)) {
    return { family: '邮', name: `邮：${head}`, words: [head] }
  }

  if (CURL_HEADS.has(head)) {
    const method = valueAfter(tokens, CURL_METHOD_FLAGS)
    if (method === 'POST') return { family: '单', name: '显 POST', words: [head, 'POST'] }
    if (method) return null // 显式 PUT/GET/DELETE/PATCH 不入
    if (hasAny(tokens, DATA_FLAGS)) return { family: '单', name: '默 POST', words: [head, 'POST'] }
    return null
  }

  if (HTTPPIE_HEADS.has(head)) {
    const hi = tokens.findIndex((t) => t.toLowerCase().split(/[/\\]/).pop() === head)
    const next = tokens.slice(hi + 1).find((t) => !t.startsWith('-'))
    if (next && next.toUpperCase() === 'POST') return { family: '单', name: 'httpie', words: [head, 'POST'] }
    return null
  }

  return null
}

export const FORM_COUNTS = { 启: 7, 邮: 5, 单: 3 }
export const FORM_TOTAL = 15
