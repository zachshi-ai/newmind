/**
 * 鉴牌块 —— 接缝供给（docs/03 §7）：礼册公示 + 视账清点。
 * 同输入两次渲染逐字节相同；块中永不出现值原文（掩码是结构性保证）。
 */

export function renderPaizi(book = null, result = null, lines = null) {
  const b = book ?? {}
  const duty = b.duty ?? []
  const secrets = b.secrets ?? []
  const peeks = b.peeks ?? []
  const out = []
  out.push('【渊鱼 · 鉴牌】')
  out.push(
    `礼册：duty ${duty.length ? duty.join('、') : '无'} · secrets ${secrets.length ? secrets.join('、') : '无'}` +
      ` · peeks ${peeks.length ? peeks.join('、') : '无'} · noDefaults ${b.noDefaults ? '是' : '否'}（默认秘形${b.noDefaults ? '停' : '在岗'}）`,
  )
  if (result && lines) {
    const c = result.counts ?? {}
    out.push(`视账：装载 ${c.loads ?? 0} 笔 · 涉视 ${c.sight ?? 0} 案 · 转运 ${c.spread ?? 0} 案 · 本职 ${c.duty ?? 0} 案`)
    const spreads = lines.filter((l) => l.spread)
    if (spreads.length) {
      out.push(`转运 ×${spreads.length}（+30/案）：${spreads.map((l) => `${l.path} → ${l.spread.fp}`).join('、')} —— 智料隐匿者有殃`)
    }
    const sights = lines.filter((l) => l.state === '涉视')
    if (sights.length) {
      out.push(`涉视 ×${sights.length}（+15/案）：${sights.map((l) => `${l.path}（${l.form}，hits ${l.hits}，${l.session}）`).join('、')} —— 察见渊鱼者不祥`)
    }
    const dutys = lines.filter((l) => l.state === '本职')
    if (dutys.length) {
      out.push(`本职 ×${dutys.length}（不计分）：${dutys.map((l) => `${l.path}（${l.form}，hits ${l.hits}，${l.session}）`).join('、')} —— 礼册明言`)
    }
    if (!lines.length) {
      out.push('视账无案，渊鱼自隐')
    }
  }
  return out.join('\n')
}
