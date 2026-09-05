/**
 * 实录块渲染 —— 接缝处的确定性供给件。
 *
 * 同一账本状态两次渲染逐字节相同（#k 随渲染递增且仅此一处不同）；
 * 无时间戳；摘录已过掩码自洁（报告不得成为新的出险面）。
 */

import { liveScore } from './bizhang.js'

function line(out, s) {
  out.push(s)
}

const SUFFIX = {
  zhi: '',
  wei: '（空绿）',
  hong: '（诚红，0 分）',
  shi: '（试笔，0 分）',
}

const VERDICT_CHAR = { zhi: '直', wei: '讳', hong: '红', shi: '试' }

/**
 * @param {object} state 引擎状态（cases / notes / families）
 * @param {number} k 渲染序号（随渲染递增）
 * @param {number} gate 门
 */
export function renderShilu(state, k, gate) {
  const live = liveScore(state)
  const { score, counts } = live

  const out = []
  line(out, `【直笔 · 实录块 #${k}】`)
  line(out, `讳值 ${score.total}（${live.band}），门 ${gate}，判 ${score.total < gate ? 'pass' : 'fail'}`)
  line(
    out,
    `史事 ${counts.shishi} 笔（族 ${counts.families}：直 ${counts.families - counts.konglv - counts.chenghong - counts.shibi}` +
      ` · 讳 ${counts.konglv} · 红 ${counts.chenghong} · 试 ${counts.shibi}），` +
      `讳笔 ${counts.weibi} 案，空绿 ${counts.konglv} 族`,
  )

  line(out, '讳笔点名（按流序）：')
  if (state.cases.length === 0) line(out, '  （无）')
  for (const kase of state.cases) {
    const fams = kase.words.map((w) => w.label).join('/')
    const masks = kase.maskHits.map((m) => m.label).join('/')
    line(out, `  · #${kase.seq} ${kase.tool} ${fams}｜${masks}｜${kase.excerpt}`)
  }

  line(out, '空绿点名（按族序）：')
  if (live.hollowFamilies.length === 0) line(out, '  （无）')
  for (const f of live.hollowFamilies) {
    line(out, `  · ${f.label}｜族末讳笔，此后无真判——交付态勿立其上`)
  }

  line(out, '族末一览（按族序）：')
  if (live.familyList.length === 0) line(out, '  （无）')
  for (const f of live.familyList) {
    line(out, `  · ${f.label}：${VERDICT_CHAR[f.verdict] ?? f.verdict}${SUFFIX[f.verdict] ?? ''}（末笔 #${f.lastSeq}）`)
  }

  line(out, '—— 本块由确定性规则生成；重放同一流必得同一文本。')
  return out.join('\n')
}
