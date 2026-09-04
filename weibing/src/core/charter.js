/**
 * 任务书契约（charter v1）—— 体检的对象。
 *
 * 结构契约（v1）：
 *   {
 *     version: 1,
 *     id:       't-001'          账内唯一
 *     brief:    任务原文一句话（闻诊对象，必填）
 *     paths:    ['src/v2/']      任务关注的目标径（问诊：与愿界做相交）
 *     scope:    { allowRoots: ['src/v2/'], allowAll: false }
 *     acceptance: [ { ref:'a1', name:'bash', argsContains:'npm test' }
 *                 | { ref:'a2', artifact:'reports/x.txt' } ]
 *     stop:     { maxSteps:200, maxMinutes:45 }   至少一项
 *     requires: { files:['package.json'], tools:['node'] }
 *   }
 *
 * 设计立场：契约描述的是"任务书与环境在 t=0 的样子"，声明什么就体检什么；
 * 缺席本身就是症状（W1/W2/W3），落空是另一类症状（W5/W6）——两者分开计分。
 */

export const CHARTER_VERSION = 1

/** 相对路径规则：非空、非绝对、不含 .. 段（探针只在体检根下工作）。 */
function isRelPath(s) {
  if (typeof s !== 'string' || s.length === 0) return false
  if (s.startsWith('/')) return false
  return !s.split('/').includes('..')
}

function isPosInt(n) {
  return Number.isInteger(n) && n > 0
}

/**
 * schema 全路径校验。返回 { valid, issues:[{path,message}] }——
 * 顺序随字段定义序，保证同输入同输出。
 */
export function validateCharter(c) {
  const issues = []
  if (c === null || typeof c !== 'object' || Array.isArray(c)) {
    return { valid: false, issues: [{ path: '(root)', message: '任务书契约必须是一个 JSON 对象' }] }
  }

  if (c.version !== CHARTER_VERSION) issues.push({ path: 'version', message: `必须为 ${CHARTER_VERSION}` })
  if (typeof c.id !== 'string' || c.id.length === 0) issues.push({ path: 'id', message: '必须为非空字符串' })
  if (typeof c.brief !== 'string' || c.brief.trim().length === 0) issues.push({ path: 'brief', message: '必须为非空字符串（闻诊的对象）' })

  if (c.paths !== undefined && c.paths !== null) {
    if (!Array.isArray(c.paths)) issues.push({ path: 'paths', message: '必须为字符串数组' })
    else c.paths.forEach((p, i) => { if (!isRelPath(p)) issues.push({ path: `paths[${i}]`, message: '必须为非空相对路径（不以 / 开头、不含 ..）' }) })
  }

  if (c.scope !== undefined && c.scope !== null) {
    const s = c.scope
    if (typeof s !== 'object' || Array.isArray(s)) issues.push({ path: 'scope', message: '必须为对象' })
    else {
      if (s.allowRoots !== undefined && s.allowRoots !== null) {
        if (!Array.isArray(s.allowRoots)) issues.push({ path: 'scope.allowRoots', message: '必须为字符串数组' })
        else s.allowRoots.forEach((p, i) => { if (!isRelPath(p)) issues.push({ path: `scope.allowRoots[${i}]`, message: '必须为非空相对路径' }) })
      }
      if (s.allowAll !== undefined && typeof s.allowAll !== 'boolean') issues.push({ path: 'scope.allowAll', message: '必须为布尔' })
    }
  }

  if (c.acceptance !== undefined && c.acceptance !== null) {
    if (!Array.isArray(c.acceptance)) issues.push({ path: 'acceptance', message: '必须为数组' })
    else {
      c.acceptance.forEach((a, i) => {
        const at = `acceptance[${i}]`
        if (a === null || typeof a !== 'object' || Array.isArray(a)) { issues.push({ path: at, message: '必须为对象' }); return }
        if (typeof a.ref !== 'string' || a.ref.length === 0) issues.push({ path: `${at}.ref`, message: '必须为非空字符串' })
        // ref 唯一性不在 schema 层管：重复引用是「相克」（W4）的病灶，由问诊计分。
        const hasCmd = a.argsContains !== undefined
        const hasArt = a.artifact !== undefined
        if (hasCmd && hasArt) issues.push({ path: at, message: 'argsContains 与 artifact 只能给一个' })
        else if (!hasCmd && !hasArt) issues.push({ path: at, message: 'argsContains 与 artifact 必须给一个' })
        if (hasCmd) {
          if (typeof a.argsContains !== 'string' || a.argsContains.trim().length === 0) issues.push({ path: `${at}.argsContains`, message: '必须为非空字符串' })
          if (typeof a.name !== 'string' || a.name.length === 0) issues.push({ path: `${at}.name`, message: 'argsContains 必须带 name' })
        }
        if (hasArt && (typeof a.artifact !== 'string' || !isRelPath(a.artifact))) issues.push({ path: `${at}.artifact`, message: '必须为非空相对路径' })
      })
    }
  }

  if (c.stop !== undefined && c.stop !== null) {
    const s = c.stop
    if (typeof s !== 'object' || Array.isArray(s)) issues.push({ path: 'stop', message: '必须为对象' })
    else {
      if (s.maxSteps !== undefined && !isPosInt(s.maxSteps)) issues.push({ path: 'stop.maxSteps', message: '必须为正整数' })
      if (s.maxMinutes !== undefined && !isPosInt(s.maxMinutes)) issues.push({ path: 'stop.maxMinutes', message: '必须为正整数' })
      if (s.maxSteps === undefined && s.maxMinutes === undefined) issues.push({ path: 'stop', message: 'maxSteps / maxMinutes 至少一项' })
    }
  }

  if (c.requires !== undefined && c.requires !== null) {
    const r = c.requires
    if (typeof r !== 'object' || Array.isArray(r)) issues.push({ path: 'requires', message: '必须为对象' })
    else {
      if (r.files !== undefined && r.files !== null) {
        if (!Array.isArray(r.files)) issues.push({ path: 'requires.files', message: '必须为字符串数组' })
        else r.files.forEach((p, i) => { if (!isRelPath(p)) issues.push({ path: `requires.files[${i}]`, message: '必须为非空相对路径' }) })
      }
      if (r.tools !== undefined && r.tools !== null) {
        if (!Array.isArray(r.tools)) issues.push({ path: 'requires.tools', message: '必须为字符串数组' })
        else r.tools.forEach((p, i) => { if (typeof p !== 'string' || p.length === 0) issues.push({ path: `requires.tools[${i}]`, message: '必须为非空字符串' }) })
      }
    }
  }

  const KNOWN = ['version', 'id', 'brief', 'paths', 'scope', 'acceptance', 'stop', 'requires']
  for (const k of Object.keys(c)) {
    if (!KNOWN.includes(k)) issues.push({ path: k, message: '未知字段（charter v1 只认 ' + KNOWN.join(' / ') + '）' })
  }

  return { valid: issues.length === 0, issues }
}

/** 任务书契约骨架（自洽：validateCharter(makeTemplate()).valid === true）。 */
export function makeTemplate() {
  return {
    version: CHARTER_VERSION,
    id: 't-001',
    brief: '（任务原文一句话：要做成什么，写完这行就删掉括号）',
    paths: ['src/v2/'],
    scope: { allowRoots: ['src/v2/', 'tests/v2/'], allowAll: false },
    acceptance: [
      { ref: 'a1', name: 'bash', argsContains: 'npm test' },
      { ref: 'a2', artifact: 'reports/repro.txt' },
    ],
    stop: { maxSteps: 200, maxMinutes: 45 },
    requires: { files: ['package.json'], tools: ['node'] },
  }
}
