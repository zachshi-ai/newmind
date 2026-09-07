/**
 * 籍形 —— 依赖清单与锁文件的默认形表（docs/03 §2 锁死）。
 *
 * basename 全等 21 形 ∪ 名前缀形 1（requirements 前缀且 .txt 后缀），开箱在岗；
 * 命籍 extra（basename 全等）并形。匹配大小写敏感（与全仓同规）。
 */

/** 默认籍形（basename 全等）。 */
export const DEFAULT_FORMS = [
  // npm 族 7
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  // Python 族 6
  'requirements.txt',
  'pyproject.toml',
  'poetry.lock',
  'uv.lock',
  'Pipfile',
  'Pipfile.lock',
  // Rust 族 2
  'Cargo.toml',
  'Cargo.lock',
  // Go 族 2
  'go.mod',
  'go.sum',
  // Ruby 族 2
  'Gemfile',
  'Gemfile.lock',
  // PHP 族 2
  'composer.json',
  'composer.lock',
]

/** 名前缀形 1：requirements 前缀且 .txt 后缀（requirements-dev.txt 之属）。 */
export const PREFIX_FORMS = [{ prefix: 'requirements', suffix: '.txt' }]

/** 深判族（JSON.parse 逐附名对账）：npm 与 composer 的清单。 */
export const JSON_DEEP_FORMS = new Set(['package.json', 'composer.json'])

/** 行级递变族（requirements 旗标行清单）：增附与去锁的行级浅判。 */
export const REQ_LINE_FORMS = PREFIX_FORMS

/** 判定某 basename 是否籍形（默认 ∪ 命籍 extra）。 */
export function isManifestForm(basename, extra = []) {
  const name = String(basename ?? '')
  if (!name) return false
  if (DEFAULT_FORMS.includes(name)) return true
  if (extra.includes(name)) return true
  return PREFIX_FORMS.some((f) => name.startsWith(f.prefix) && name.endsWith(f.suffix))
}
