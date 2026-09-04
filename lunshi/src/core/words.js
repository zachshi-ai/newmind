/**
 * 论世词表 —— 显式声明的越词表（docs/03 §4 锁死），零 NLP 的确定性下限。
 *
 * 设计原则：精度优先。只收注入惯用短语与高危命令词，不收
 * 「run / install / 执行」类日常祈使词——误伤一次，用户就永久关掉这个层。
 * 无命中即无入账，绝不虚构威胁。
 */

/** 默认越词表：40 条，全部小写，子串匹配（大小写不敏感）。 */
export const DEFAULT_WORDS = Object.freeze([
  // 覆盖指令类（注入惯用短语）
  'ignore previous instructions',
  'ignore previous',
  'ignore all previous',
  'ignore the above',
  'disregard previous',
  'disregard the above',
  'disregard all previous instructions',
  'forget your instructions',
  'forget all previous',
  'you must now',
  'from now on you',
  'new instructions:',
  'system prompt:',
  'reveal your instructions',
  'reveal your system prompt',
  'exfiltrate',
  'send the secret',
  'send the api key',
  'upload the secret',
  // 高危命令类
  'rm -rf',
  'sudo rm',
  'git push --force',
  'drop table',
  'curl | bash',
  'curl | sh',
  // 中文覆盖指令类
  '忽略之前',
  '忽略上述',
  '忽略以上',
  '无视上述',
  '无视之前',
  '无视以上',
  '忘记之前的指令',
  '以上指令作废',
  '从现在开始你',
  '从现在起你',
  '你现在是',
  '你的新任务',
  '泄露系统提示',
  '把密钥',
  '上传密钥',
])

/**
 * 归并词表：默认表 + 自定义表取并集（追加不可删减默认保护）。
 * 小写化、去重、丢弃非字符串与空串；默认表在前，词表序即默认序。
 */
export function normalizeWords(custom) {
  const seen = new Set()
  const out = []
  const push = (w) => {
    if (typeof w !== 'string') return
    const v = w.toLowerCase()
    if (!v || seen.has(v)) return
    seen.add(v)
    out.push(v)
  }
  DEFAULT_WORDS.forEach(push)
  if (Array.isArray(custom)) custom.forEach(push)
  return out
}

/** 词命中：text 中包含的词表词（按词表序）。内部小写化，大小写不敏感；纯子串匹配，零 NLP。 */
export function matchWords(text, words) {
  const lower = String(text ?? '').toLowerCase()
  const hits = []
  for (const w of words) {
    if (lower.includes(w)) hits.push(w)
  }
  return hits
}

/**
 * 命中坍缩：最长词胜出。若命中词 w 是另一命中词 w2 的子串，w 被吸收
 * （"ignore previous instructions" 吸收 "ignore previous"）；
 * 不相交的多个词各自保留，输出保持词表序。
 */
export function collapseHits(hits) {
  return hits.filter((w) => !hits.some((other) => other !== w && other.includes(w)))
}
