/**
 * 词元对账 —— 改写式佚据/征据的词面证据（docs/03 §5 锁死）。
 *
 * 词元化三向切分：`[A-Za-z0-9_]` 段整段为词元（小写归一）；CJK 段（纯汉字连书）
 * 做二元滑窗（bigram）；其余（标点、空白）丢弃——标点是天然分隔，不与汉字混切。
 * 命中比 = 命中词元数 / 总词元数；总词元 <2 不判（宁纵）。
 * 中文用二元滑窗的理由：中文无空格，整段匹配过严（差一字即全不中）；
 * 二元量词汇重合度，过半为界。
 */

const SEG_RE = /[A-Za-z0-9_]+|[\u3400-\u9fff]+|[^A-Za-z0-9_\u3400-\u9fff]+/g

export function tokenize(text) {
  const tokens = []
  for (const m of String(text).matchAll(SEG_RE)) {
    const seg = m[0]
    if (/[A-Za-z0-9_]/.test(seg[0])) {
      tokens.push(seg.toLowerCase())
    } else if (/[\u3400-\u9fff]/.test(seg[0])) {
      for (let i = 0; i + 1 < seg.length; i++) tokens.push(seg.slice(i, i + 2))
    } // 其余段（标点与空白）：天然分隔，丢弃
  }
  return tokens
}

/** 命中比（hay 为诏本规整小写串）。 */
export function hitRatio(tokens, hay) {
  let hit = 0
  for (const t of tokens) if (hay.includes(t)) hit++
  return { hit, total: tokens.length, ratio: tokens.length > 0 ? hit / tokens.length : 0 }
}
