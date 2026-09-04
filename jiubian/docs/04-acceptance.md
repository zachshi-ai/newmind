# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A1–A4 含**先于实现手算**的期望值（见 docs/03 与夹具头注释）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 对象键三级回退（p:/c:/n:）、工具族分类（精确集合优先、包含词兜底）、四裁决（变/盲捶/悬/离）首触决定、p:/c: 分治、盲捶链首记免分（+12/记）、游骑三条件（悬账未清、全流首现对象、非观察族、段长 ≥3、+20/轮）与两类打断（观察族、归还悬账）、cap 60/40、失机值公式、分带 合/钝/胶、门 30——核心用例 ≥ 48 且全绿，断言恰好该分值 | `npm test`（core 部分） | ⬜ |
| A2 | 夹具分数（先于实现手算定死） | `adaptive-stream`：7 调用、失机值 0、带「合」、变 2、盲捶 0、游骑 0、exit 0；`stubborn-stream`：7 调用、失机值 36、带「胶」、盲捶 4（同对象一链，免 1 计 3 → 36）、变 1、离 1、游骑 0、exit 1；`grazing-stream`：10 调用、失机值 40、带「胶」、游骑 2（40）、变 1、盲捶 0、exit 1 | core 断言 + CLI 复现 | ⬜ |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl`（无 id 旧格式）与 jiebi 的 `fixtures/sample-stream.jsonl`（带 id）直接喂 `jiubian audit`：各 **8** 次调用、失机值 **24**、带「钝」、盲捶 **3**（同对象一链，免 1 计 2 → 24）、游骑 0、变 1——同格式流可跨项目验尸 | core 用例 | ⬜ |
| A4 | CLI 语义 | `audit`：失机值超门 → exit 1，干净 → 0，不可读/坏 JSON → exit 2；`--gate <n>` 生效；`--json` 紧凑输出；`--version`/`--help` 正常；`gate --value <n>` 按 `--gate`（默认 30）判 0/1；`bianfang` 默认纯文本、`--json` 包装 | CLI 测试（≥ 12 用例） | ⬜ |
| A5 | 真实管道上的勘流式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载九变插件：所有调用无条件到达工具本体（失败探针直达工具、计数吻合，结构性零拦截）；势账随 `tools/result` 更新且裁决与失机值和公式吻合；`ctx.jiubian.bianfang()` 返回逐字节稳定文本且 `#k` 递增；`exportStream()` 被离线 `audit` 重放后数字与运行时一致 | 集成测试（≥ 10 用例） | ⬜ |
| A6 | 变方逐字节确定 | 同一份流两次渲染 shasum 相同；同一流截去尾部悬账归还段后渲染不同（文本随状态变）；`#k` 随渲染次数递增；无悬账时输出「悬账：无——势途相合，续行。」 | 渲染器单测 + CLI shasum 复现 | ⬜ |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络；插件源码无 pre-execute 监听器（结构性零拦截） | grep（下附命令，应无输出） | ⬜ |
| A8 | 测试总量 | 全部用例 ≥ 70 且全绿（core + cli + 集成） | `npm test` | ⬜ |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ⬜ |

## 复现命令

```bash
cd jiubian
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 全量测试
node src/bin/jiubian.js audit fixtures/adaptive-stream.jsonl; echo $?    # 0
node src/bin/jiubian.js audit fixtures/stubborn-stream.jsonl; echo $?   # 1
node src/bin/jiubian.js audit fixtures/grazing-stream.jsonl; echo $?    # 1
```

**A7 的 grep 命令**（应无输出）：

```bash
grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create" src/core src/plugin | grep -v "^\s*//"
grep -rn "pre-execute\|preExecute\|pre_execute" src/plugin | grep -v "^\s*\*\|//.*pre-execute"
```

## 实测记录（2026-09-05，实现后回填）

（待实现完成后以本机复跑的真实输出回填，不预设数字。）
