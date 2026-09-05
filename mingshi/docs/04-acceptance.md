# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §10 与夹具内容）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档）；对象键三级回退与工具族词表同 dingfen；提名词表（import/require/动态/export-from 各形 + 注释剥离 + 行内 `//` 截断 + 代码后缀门 + 无 `p:` 不判 + 去重）；相对名以被写文件目录为基解析（`..` 逃逸照判）；裸名取首段（scoped 取两段）；安装令提取（npm/pnpm/yarn、旗标滤除、版本剥离、无名不立案）；实的三源按序：内建（node: 前缀 + 默认表 + extraBuiltins）→ 册内（root glob / package 精确）→ 流内生实（成功读写之径逐字相等、装成之包名；试装不生实；全流先后皆采、合并审计跨会话）；判定序锁死：无册不判 → 免（内建/册内/生实）→ 幻径 +15/名 cap 30 → 幻包 +30/名 cap 60；装所册免、册外装成 strictDeps ? 犯装 +30/次 cap 60 : 新装 +6/次 cap 30、试装不计分；名值 total = min(100, ghost + stray)；分带 正 0–14 / 疑 15–29 / 妄 ≥30；门默认 30——core 用例 ≥ 42 且全绿，断言恰好该分值 | `npm test`（core 部分） | ⬜ |
| A2 | 夹具分数（先于实现手算定死） | `clean-stream`+`clean-registry`：3 调用、写 2、名 3、名值 `{total:0, ghost:0, stray:0}`、带「正」、exit 0、exemptImports 3、registryCount 3；`ghost-stream`+`ghost-registry`：5 调用、写 2、名 3、名值 `{total:51, ghost:45, stray:6}`、带「妄」、exit 1、counts `{ghostPackages:1, ghostRelatives:1, strayInstalls:1, trialInstalls:1, exemptImports:1, exemptInstalls:1, registryCount:3}`；同流换 `strict-registry`：名值 `{total:75, ghost:45, stray:30}`、带「妄」、exit 1；同流无实册：名值 0、带「正」、exit 0、registryCount 0 | core 断言 + CLI 复现 | ⬜ |
| A3 | 跨项目互认 | dingfen 的 `fixtures/fenced-stream.jsonl` 喂 `mingshi audit`（配 ghost-registry）：名 0、值 0、带「正」、exit 0（无内容字段即无名可提）；mingshi 的 `fixtures/ghost-stream.jsonl` 喂 `dingfen audit`（子进程真跑对方 bin）：争值 0、带「定」、exit 0——同格式流双向可审，多余内容字段互不误伤 | CLI 测试 | ⬜ |
| A4 | CLI 语义 | `audit` 多流 + `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 实册缺失或坏籍 → exit 2；`register` 全空参 / 重复登记 → exit 2，`--pkgfile` 快照后 `list` 可见；`revoke` 无此名 → exit 2；`list`/`block` 实册文件缺失 → exit 2；`gate --value` 按门判 0/1；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ⬜ |
| A5 | 名册块逐字节确定 | 同一实册两次 `mingshi block` shasum 相同；增一界后文本改变；空籍（文件在、无条目）输出确定性空籍文本 | CLI shasum 复现 | ⬜ |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载名实插件：失败探针也无条件到达工具本体（结构性零拦截）；幻包写探针立案门红；写径生实探针免；新装/犯装两态可切；试装点名不计分；名册块两次渲染逐字节相同；`exportStream()` 导出流离线 `audit` 重放，案数与名值与运行时账**账实一致**——集成用例 ≥ 8 | 集成测试 | ⬜ |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截） | grep（下附命令，应无输出） | ⬜ |
| A8 | 测试总量 | 全部用例 ≥ 72 且全绿（core + cli + 集成） | `npm test` | ⬜ |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ⬜ |

## 复现命令

```bash
cd mingshi
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/mingshi.js audit fixtures/clean-stream.jsonl --file fixtures/clean-registry.json; echo $?    # 0
node src/bin/mingshi.js audit fixtures/ghost-stream.jsonl --file fixtures/ghost-registry.json; echo $?    # 1
node src/bin/mingshi.js audit fixtures/ghost-stream.jsonl --file fixtures/strict-registry.json; echo $?   # 1
node src/bin/mingshi.js audit fixtures/ghost-stream.jsonl; echo $?                                        # 0（无册不判）
```

**A7 的 grep 命令**（应无输出；第二条用监听器注册的精确模式，避免误伤注释散文）：

```bash
grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create|child_process|execSync|spawn|readFileSync\(|existsSync\(" src/core src/plugin | grep -v "^\s*//"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
```

## 实测记录（实现完成后回填）

⬜ 待实现后逐项回填真实输出。
