/**
 * 实册 —— 实在之物的登记（roots 树界 / packages 包册 / strictDeps 执法态）。
 *
 * 声明权在任务方：册内之名 presumed real（任务方为整棵树作保）；
 * 无册不判——先立册再审计。校验失败抛 Error（CLI 转 exit 2）。
 */

export function emptyRegistry() {
  return { version: 1, roots: [], packages: [], strictDeps: false, extraBuiltins: [], extraExts: [] }
}

function strArray(v, what) {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new Error(`${what} 必须是字符串数组`)
  }
  return v
}

/** 解析实册 JSON 文本；坏籍抛 Error。 */
export function parseRegistry(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error(`实册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('实册必须是 JSON 对象')
  if (typeof raw.version !== 'number' || !(raw.version >= 1)) throw new Error('实册 version 必须 ≥ 1')
  const roots = strArray(raw.roots, 'roots')
  const packages = strArray(raw.packages, 'packages')
  const strictDeps = raw.strictDeps === undefined ? false : raw.strictDeps
  if (typeof strictDeps !== 'boolean') throw new Error('strictDeps 必须是布尔')
  return {
    version: raw.version,
    roots,
    packages,
    strictDeps,
    extraBuiltins: strArray(raw.extraBuiltins, 'extraBuiltins'),
    extraExts: strArray(raw.extraExts, 'extraExts'),
  }
}

export function serializeRegistry(registry) {
  return `${JSON.stringify(registry, null, 2)}\n`
}

export function registryCount(registry) {
  return registry.roots.length + registry.packages.length
}

/** 登记树界/包册；重复登记抛 Error（CLI 转 exit 2）。返回新数组（不可变风格）。 */
export function addRoots(registry, roots) {
  for (const r of roots) {
    if (registry.roots.includes(r)) throw new Error(`树界已在册: ${r}`)
  }
  return { ...registry, roots: [...registry.roots, ...roots] }
}

export function addPackages(registry, packages) {
  for (const p of packages) {
    if (registry.packages.includes(p)) throw new Error(`包名已在册: ${p}`)
  }
  return { ...registry, packages: [...registry.packages, ...packages] }
}

export function setStrictDeps(registry, value) {
  return { ...registry, strictDeps: !!value }
}

/** 销名：root 与 pkg 二选一；无名可销抛 Error。 */
export function revoke(registry, { root, pkg }) {
  if (root != null) {
    if (!registry.roots.includes(root)) throw new Error(`无此树界: ${root}`)
    return { ...registry, roots: registry.roots.filter((x) => x !== root) }
  }
  if (!registry.packages.includes(pkg)) throw new Error(`无此包名: ${pkg}`)
  return { ...registry, packages: registry.packages.filter((x) => x !== pkg) }
}
