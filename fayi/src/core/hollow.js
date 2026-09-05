/**
 * 虚器词表 —— 绳量不出弯的绳：恒真之断言的确定性形表（docs/03 §6）。
 *
 * 只认词表可证之虚：同字面比较（expect/assert/t 三族、Python assert x == x）、
 * 恒真断言、空体用例。"断言够不够强"是语义判断，零 LLM 约束下不做——宁可漏判，不可妄断。
 * 件 =（写 × 形）一次：同一写里同形多次命中只记 1 件。
 */

const LIT = '("[^"]*"|\'[^\']*\'|[\\w.$]+)' // 字面 = 双引号串 | 单引号串 | 标识链（反引引用断同字面）

/** 形表（形名 → 正则组）。组内任一命中即该形命中；组序即报告序。 */
export const HOLLOW_FORMS = [
  {
    form: '同字面比较',
    res: [
      new RegExp(`\\bexpect\\(\\s*${LIT}\\s*\\)\\s*(?:\\.\\s*to\\s*\\.\\s*(?:equal|eql)|\\.\\s*(?:toBe|toEqual|toStrictEqual))\\s*\\(\\s*\\1\\s*\\)`),
      new RegExp(`\\bassert\\.(?:equal|strictEqual|deepEqual|deepStrictEqual)\\s*\\(\\s*${LIT}\\s*,\\s*\\1\\s*[,)]`),
      new RegExp(`\\bt\\.(?:equal|strictEqual|deepEqual|deepStrictEqual)\\s*\\(\\s*${LIT}\\s*,\\s*\\1\\s*[,)]`),
    ],
  },
  {
    form: '同字面断言',
    res: [new RegExp(`\\bassert\\s+${LIT}\\s*==\\s*\\1\\b`)],
  },
  {
    form: '恒真断言',
    res: [/\bassert\(\s*true\s*\)/, /\bassert\.ok\(\s*true\s*[,)]/, /\bassert\s+True\b/],
  },
  {
    form: '空体用例',
    res: [/\b(?:it|test)\s*\(\s*(["'`])[^"'`]*\1\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{\s*\}\s*[,)]/],
  },
]

/** 扫一段文本，返回 [{ form, hit }]——每形至多 1 件，hit 截到 48 字符。 */
export function scanHollow(text) {
  const s = String(text ?? '')
  const hits = []
  for (const { form, res } of HOLLOW_FORMS) {
    for (const re of res) {
      const m = re.exec(s)
      if (m) {
        hits.push({ form, hit: m[0].length > 48 ? m[0].slice(0, 48) + '…' : m[0] })
        break
      }
    }
  }
  return hits
}
