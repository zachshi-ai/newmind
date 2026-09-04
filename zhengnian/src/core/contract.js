/**
 * 本愿契约 —— schema 校验与骨架。
 *
 * 契约是本愿的形状：开工时声明一次，之后一切度量与拂拭都从它确定性推导。
 * 它不是 Agent 的产物——锚点声明权收归契约（任务方），Agent 无从自我挑题。
 *
 * 零语义判断：不读字段的"意思"，只看"有没有、够不够"。
 */

export const WRITE_TOOLS = [
  'write', 'edit', 'create', 'update', 'delete', 'mkdir', 'touch',
  'move', 'rename', 'patch', 'apply_patch', 'str_replace', 'multiedit',
  'notebook_edit',
]
export const SHELL_TOOLS = ['bash', 'shell', 'terminal', 'exec']
export const WINDOW_DEFAULT = 10
export const MAX_STALE_DEFAULT = 30

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0

/** schema 校验。返回 { valid, issues: [{ code:'schema', path, message }] }。 */
export function validateContract(obj) {
  const issues = []
  const bad = (path, message) => issues.push({ code: 'schema', path, message })

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, issues: [{ code: 'schema', path: '$', message: '契约必须是一个 JSON 对象' }] }
  }
  if (obj.version !== 1) bad('version', '必须是 1（当前仅支持 contract v1）')
  if (!isNonEmpty(obj.id)) bad('id', '必须是非空字符串')
  if (!isNonEmpty(obj.wish)) bad('wish', '必须是非空字符串（本愿必须成文）')

  if (!obj.anchors || typeof obj.anchors !== 'object' || Array.isArray(obj.anchors)) {
    bad('anchors', '必须是对象（keywords ≥1 是失念可测的前提）')
  } else {
    if (!Array.isArray(obj.anchors.keywords) || obj.anchors.keywords.length < 1 ||
        !obj.anchors.keywords.every(isNonEmpty)) {
      bad('anchors.keywords', '必须是 ≥1 个非空字符串的数组')
    }
    if (obj.anchors.paths !== undefined) {
      if (!Array.isArray(obj.anchors.paths) || !obj.anchors.paths.every(isNonEmpty)) {
        bad('anchors.paths', '存在时必须是非空字符串数组')
      }
    }
  }

  if (!obj.scope || typeof obj.scope !== 'object' || Array.isArray(obj.scope)) {
    bad('scope', '必须是对象（allowRoots 与 allowAll 恰好其一）')
  } else {
    // "恰好其一"按字段存在性判定：空数组 + allowAll 并存仍是并存，不是无界
    const rootsPresent = obj.scope.allowRoots !== undefined
    const allPresent = obj.scope.allowAll !== undefined
    if (rootsPresent && allPresent) bad('scope', 'allowRoots 与 allowAll 恰好其一，不可并存')
    else if (!rootsPresent && !allPresent) bad('scope', '必须给 allowRoots（非空数组）或 allowAll:true —— 愿界必须显式声明')
    else if (rootsPresent && !(Array.isArray(obj.scope.allowRoots) &&
      obj.scope.allowRoots.length > 0 && obj.scope.allowRoots.every(isNonEmpty))) {
      bad('scope.allowRoots', '必须是非空字符串数组')
    } else if (allPresent && obj.scope.allowAll !== true) bad('scope.allowAll', '无界之愿必须显式写 true')
  }

  if (!Array.isArray(obj.acceptance) || obj.acceptance.length < 1) {
    bad('acceptance', '必须是 ≥1 条的数组（本愿必须自带终验）')
  } else {
    obj.acceptance.forEach((a, i) => {
      const at = `acceptance[${i}]`
      if (!a || typeof a !== 'object' || Array.isArray(a)) {
        bad(at, '必须是对象')
        return
      }
      if (!isNonEmpty(a.ref)) bad(`${at}.ref`, '必须是非空字符串')
      const hasProbe = isNonEmpty(a.name) && isNonEmpty(a.argsContains)
      const hasArtifact = isNonEmpty(a.artifact)
      if (!hasProbe && !hasArtifact) {
        bad(at, '必须带 name+argsContains（探针）或 artifact（工件）之一')
      }
    })
  }

  if (obj.window !== undefined &&
      (!Number.isInteger(obj.window) || obj.window < 1)) {
    bad('window', '必须是正整数')
  }

  return { valid: issues.length === 0, issues }
}

/** 归一化后的愿界根列表（无界契约返回 null）。 */
export function allowRootsOf(contract) {
  if (contract?.scope?.allowAll === true) return null
  return Array.isArray(contract?.scope?.allowRoots) ? contract.scope.allowRoots : null
}

/** 生成一份契约骨架（占位文本即填写指南）。 */
export function makeTemplate() {
  return {
    version: 1,
    id: 'w-000',
    wish: '本愿一句话：这个任务到底要办成什么？（写结果，不写步骤）',
    anchors: {
      keywords: ['本愿词汇 1', '本愿词汇 2'],
      paths: ['本愿主战场路径，如 src/payments/'],
    },
    scope: {
      allowRoots: ['允许写入的根 1', '允许写入的根 2'],
    },
    acceptance: [
      { ref: 'a1', name: 'bash', argsContains: '本愿自己的终验命令', note: '完成必须对着的证据' },
      { ref: 'a2', artifact: '本愿产出的工件路径（可选二选一）' },
    ],
    window: WINDOW_DEFAULT,
  }
}
