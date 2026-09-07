/**
 * 典形 —— 常驻规矩源的默认形表（docs/03 §2.1 锁死）：三族 25 形，无册照判、开箱在岗。
 *
 *   宪形 8（治理文书）：单名 7 + 径前缀 1
 *   禁形 4（CI 流程）：组合 1 + 单名 3
 *   章形 13（检查章程）：名前缀 7 + 单名 6
 *
 * 命中语义（docs/03 §2.1 定标勘误后口径）：
 *   单名形按 basename 全等（大小写敏感，与全仓词法同规）；
 *   名前缀形按 basename 以前缀开头（七形是文件名形——子目录章程 packages 目录下的 tsconfig 是常态）；
 *   径前缀形按规整径以前缀开头（仅 .cursor/rules/ 目录形）；
 *   组合形两件皆中（径前缀 .github/workflows/ ∧ basename 尾形 .yml/.yaml）。
 *   多族命中取最重：宪 > 禁 > 章。
 */

import { normalizePath, baseName } from './object.js'

export const XIAN_SINGLE = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  'copilot-instructions.md',
]
export const XIAN_DIR_PREFIX = '.cursor/rules/'
export const JIN_DIR_PREFIX = '.github/workflows/'
export const JIN_TAILS = ['.yml', '.yaml']
export const JIN_SINGLE = ['.gitlab-ci.yml', 'Jenkinsfile', '.drone.yml']
export const ZHANG_PREFIX = [
  '.eslintrc',
  'eslint.config.',
  '.prettierrc',
  'prettier.config.',
  'biome.json',
  'tsconfig',
  '.stylelintrc',
]
export const ZHANG_SINGLE = [
  '.editorconfig',
  '.pre-commit-config.yaml',
  '.flake8',
  'mypy.ini',
  'ruff.toml',
  '.ruff.toml',
]

export const FAMILY_RANK = { xian: 0, jin: 1, zhang: 2 }
export const FAMILY_LABEL = { xian: '宪', jin: '禁', zhang: '章' }
export const FAMILY_OF_LABEL = { 宪: 'xian', 禁: 'jin', 章: 'zhang' }

/** 典形命中（唯一命中点）：返回 'xian' | 'jin' | 'zhang' | null。径先规整。 */
export function hitOf(p) {
  const path = normalizePath(p)
  const b = baseName(path)
  if (XIAN_SINGLE.includes(b)) return 'xian'
  if (path.startsWith(XIAN_DIR_PREFIX)) return 'xian'
  if (JIN_SINGLE.includes(b)) return 'jin'
  if (path.startsWith(JIN_DIR_PREFIX) && JIN_TAILS.some((t) => b.endsWith(t))) return 'jin'
  if (ZHANG_SINGLE.includes(b)) return 'zhang'
  if (ZHANG_PREFIX.some((pfx) => b.startsWith(pfx))) return 'zhang'
  return null
}
