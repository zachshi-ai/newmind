/**
 * 绳墨块 —— 接缝处的器册公示与尺况（法仪章句：直以绳，正以县）。
 *
 * 逐字节确定：同一（册, 引擎判词）两次渲染逐字节相同（无时间戳字段；shasum 可证）。
 * 模板锁死在 docs/03 §9；judged 缺时只出册态公示（register-only，同 CLI `block`）。
 */

import { emptyRegister } from './qice.js'

/** 器动排序：at 升序（缺时垫底），同 at 按流序。 */
function sortedTouches(touches) {
  return [...touches].sort((a, b) => {
    if (a.at == null && b.at == null) return a.idx - b.idx
    if (a.at == null) return 1
    if (b.at == null) return -1
    return a.at - b.at || a.idx - b.idx
  })
}

const SHIMO_LINES = {
  idle: '尺况：实测面无写——尺无对象可照。',
  unjudged: '尺况：时不可考——照末不判（宁可放过）。',
  verified: '尺况：末笔实测写后已绿验。',
  tailred: '尾红：末验为红（不计分）——尺新而话诚。',
  stale: '废尺：末笔实测写后无绿验——尺未照末。',
}

export function renderShengmo(reg, judged = null) {
  const r = reg ?? emptyRegister()
  const lines = ['【法仪 · 绳墨】']
  const guards = r.guards
  const amends = r.amends
  if (guards.length + amends.length === 0) {
    lines.push('在册器径 0 条——尺皆默认形。')
  } else {
    lines.push(`在册器径 ${guards.length + amends.length} 条（持 ${guards.length} / 修 ${amends.length}）：`)
    for (const g of guards) lines.push(`  · 持 ${g}`)
    for (const a of amends) lines.push(`  · 修 ${a}`)
  }
  if (r.verify.length === 0) {
    lines.push('验尺词 0 条——验尺认默认形。')
  } else {
    lines.push(`验尺词 ${r.verify.length} 条：`)
    for (const v of r.verify) lines.push(`  · ${v}`)
  }

  if (judged) {
    const touches = sortedTouches(judged.instrumentTouches)
    if (touches.length === 0) {
      lines.push('器动 0 笔（器写皆可见）。')
    } else {
      lines.push(`器动 ${touches.length} 笔（器写皆可见；持性器写若独占翻红窗另案）：`)
      for (const t of touches) lines.push(`  · ${t.tool} ${t.path}`)
    }
    if (judged.quchiCases.length === 0) {
      lines.push('曲尺：无——尺未弯。')
    } else {
      lines.push(`曲尺 ${judged.quchiCases.length} 案：`)
      for (const c of judged.quchiCases) lines.push(`  · ${c.paths.join('、')}（翻红窗内纯器写）`)
    }
    if (judged.doubtSpots.length > 0) {
      lines.push(`存疑 ${judged.doubtSpots.length} 处（不计分）：`)
      for (const d of judged.doubtSpots) lines.push(`  · ${d.paths.join('、')}`)
    }
    if (judged.amendInWindow.length > 0) {
      lines.push(`修器 ${judged.amendInWindow.length} 笔（不计分）：`)
      for (const a of judged.amendInWindow) lines.push(`  · ${a.path}`)
    }
    if (judged.hollowHits.length > 0) {
      lines.push(`虚器 ${judged.hollowHits.length} 件（+${judged.score.xuqi}）：`)
      for (const h of judged.hollowHits) lines.push(`  · ${h.form}「${h.hit}」@ ${h.path}`)
    }
    lines.push(SHIMO_LINES[judged.shimo])
  }
  lines.push('—— 本块由确定性规则生成；重放同一流必得同一文本。')
  return lines.join('\n') + '\n'
}
