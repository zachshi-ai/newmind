/**
 * 复典词法 —— 改典案的复典凭据只认 git 词面（docs/03 §4 锁死）：
 *
 *   git revert        全域——回滚提交即复原，从宽；
 *   git restore <径>   非旗标词元与案径匹配者各出一条凭据；
 *   git checkout -- <径>  `--` 分隔符后的非旗标词元各出一条凭据。
 *
 * 基点时序保护在结算处判（凭据 seq 必须 > 案基点——先复后改不销案）；
 * write 写回不判复——流内无法验证写回内容等于原状，唯 git 词面可凭。
 */

import { normalizePath } from './object.js'
import { argTokens, tokenMatchesPath } from './lexicon.js'

/**
 * 逐段检测复词形。tokens 为该段词元化结果。
 * 返回凭据数组：{ token, how }——token 为 null 表示全域（git revert），否则是原始词元（未规整）。
 */
export function detectRestores(tokens) {
  const low = tokens.map((t) => t.toLowerCase())
  const has = (w) => low.includes(w)
  const out = []
  if (has('git') && has('revert')) {
    out.push({ token: null, how: 'git revert' })
  }
  if (has('git') && has('restore')) {
    for (const t of argTokens(tokens)) {
      const l = t.toLowerCase()
      if (l === 'git' || l === 'restore') continue
      out.push({ token: t, how: 'git restore' })
    }
  }
  if (has('git') && has('checkout')) {
    const dd = tokens.indexOf('--')
    if (dd !== -1) {
      for (const t of argTokens(tokens.slice(dd + 1))) {
        out.push({ token: t, how: 'git checkout --' })
      }
    }
  }
  return out
}

/** 凭据与案径配对：全域凭据恒真，径凭据按规整逐字 ∪ 宽 glob。 */
export function restoreCovers(credential, casePath) {
  if (credential.token === null) return true
  return tokenMatchesPath(credential.token, casePath)
}
