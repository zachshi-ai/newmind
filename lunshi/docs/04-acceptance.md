# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A1–A4 含**先于实现手算**的期望值（见 docs/03 与夹具头注释）；实现与测试若与手算冲突，只能改实现，不得改本表。
> 「结果」列与文末实测记录在实现完成后回填——只回填真实命令输出，不预写。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 三源登记（principal／args／content）、词表并集去重、命中坍缩（最长词胜出）、承全流豁免、涉命染 +8/块 cap 40、僭行 +20/行 cap 60（调用×词各一次、时序保护：调用先于块不构成僭行）、越权值公式 min(100,染+僭)、分带 明/惑/僭、门 30——核心用例 ≥ 45 且全绿，断言恰好该分值与该词表 | `npm test`（core 部分） | 待实测 |
| A2 | 夹具分数（先于实现手算定死） | `clean-stream`：2 调用、物块 2、涉命 0、承 0、越权值 0、带「明」、exit 0；`injected-stream`：3 调用、物块 3、涉命 3（染 24）、僭 0、越权值 24、带「惑」、exit 0；`usurped-stream`：3 调用、物块 3、涉命 1（染 8）、僭行 2（+40，均引自第 1 块词「git push --force」）、越权值 48、带「僭」、exit 1；`authorized-stream`：2 调用、物块 2、涉命 0、承块 1、越权值 0、带「明」、exit 0 | core 断言 + CLI 复现 | 待实测 |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl`（无 id 旧格式）与 jiebi 的 `fixtures/sample-stream.jsonl`（带 id）直接喂 `lunshi audit`：各 **8** 次调用、物块 **0**（老流无 content 字段）、涉命 0、越权值 **0**、带「明」、exit 0——同格式流可跨项目验尸，老流按诚实边界退化为零内容观察 | core 用例 | 待实测 |
| A4 | CLI 语义 | `audit`：越权值超门 → exit 1，干净 → 0，不可读/坏 JSON/坏词表 → exit 2；`--gate <n>` 生效；`--words <file>` 追加词表生效（自定义词命中入账且默认词保留）；`--json` 紧凑输出；`--version`/`--help` 正常；`gate --value <n>` 按 `--gate`（默认 30）判 0/1；`gao` 默认纯文本、`--json` 包装 | CLI 测试（≥ 14 用例） | 待实测 |
| A5 | 真实管道上的权界式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载论世插件：所有调用无条件到达工具本体（结构性零拦截）；工具返回内容里的注入文本被登记为涉命块；后续调用的参数引用该越词 → 僭行现形；`declare()` 的主文本触发承豁免；`report/qudao/gao/gate` 可用；`exportStream()` 被离线 `audit` 重放后数字与运行时一致（账实对账） | 集成测试（≥ 10 用例） | 待实测 |
| A6 | 诫块逐字节确定 | 同一份流两次渲染 shasum 相同；`#k` 随渲染次数递增；涉命块逐条列出（块号/工具/词/摘录）；无涉命时输出「渠道清白——物不僭主，续行。」 | 渲染器单测 + CLI shasum 复现 | 待实测 |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络；插件源码无 pre-execute 监听器（结构性零拦截）；词匹配是纯子串 indexOf（零 NLP） | grep（下附命令，应无输出） | 待实测 |
| A8 | 测试总量 | 全部用例 ≥ 70 且全绿（core + cli + 集成） | `npm test` | 待实测 |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | 待实测 |

## 复现命令

```bash
cd lunshi
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/lunshi.js audit fixtures/clean-stream.jsonl; echo $?       # 期望 0
node src/bin/lunshi.js audit fixtures/injected-stream.jsonl; echo $?    # 期望 0（惑带亮黄牌不门禁）
node src/bin/lunshi.js audit fixtures/usurped-stream.jsonl; echo $?     # 期望 1
node src/bin/lunshi.js audit fixtures/authorized-stream.jsonl; echo $?  # 期望 0
```

**A7 的 grep 命令**（应无输出；第二条用监听器注册的精确模式，避免误伤注释散文）：

```bash
grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create" src/core src/plugin | grep -v "^\s*//"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
```

## 实测记录（实现完成后回填，只写真实命令输出）

（待回填）
