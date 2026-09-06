# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。标准一经定稿不得为实现缺口事后删改。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 绳账 schema 全路径 | 四种条目（promise/revise/abandon/discharge）必需键、可选键、未知键拒绝、空串拒绝、id 重复拒绝、`supersedes`/`settles` 指向不存在或已关闭的结均拒绝（报行号与原因）；`#` 与空行注释合法；坏 JSON 报行号；discharge 语法校验（contains 必需、tool/ok 类型合法）；`template` 输出可直接通过校验 | core 用例 | ✅ |
| A2 | 结账引擎语义 | 结账状态恰为 discharged/revised/abandoned/breached；改诺链逐结展开只对链尾结账且继承字段；凭据匹配 = tool 精确 + args JSON 子串 + ok 对照 isError；咎值 = min(100, min(60,30×失诺)+min(20,10×轻诺))；分带 无咎(0–14)/吝(15–29)/咎(≥30) 边界逐点可证；改诺/弃约记 0 分但入账；无凭悬结同时记咎与轻诺；无凭弃约单独记吝（吝带可达）；discharge 宣告使命中兑现、不命中仍悬（有凭失诺只记咎）；空账咎值 0 无咎 | core 用例 | ✅ |
| A3 | 流解析与账实对账 | 解析共享会话流格式（`#` 注释、坏行报行号、带 id 配对、无 id 旧格式 result 并入紧邻 call、孤儿 result 独立建档）；discharge 命中取首次匹配调用序号；`ok:true` 只被 isError=false 的调用满足；speech 事件可解析且默认词表计数（事件级去重）、无 speech 事件时 `unaccounted:null` 诚实沉默 | core 用例 | ✅ |
| A4 | 结账块逐字节确定 | 同一输入两次渲染逐字节相同（shasum 可证）；悬结按账序、引文按分带二选一固定；无时间戳字段；全平账以「绳上无悬结。」收尾 | 渲染器单测 + CLI 复现 | ✅ |
| A5 | 真实管道上的结绳式插件（结构性零拦截） | 挂载 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 真实管道：插件源码无 pre-execute 监听；穿过管道的所有调用（含失败探针）全部到达工具本体、管道零反噬；make/revise/abandon/settle 全链路可用；settle 与核心引擎对同一账+流账实对账（deepEqual）；空账诚实报 0；观察异常不冒泡 | 集成测试 | ✅ |
| A6 | CLI 语义 | `template` 输出合法骨架；`ledger`：合法 → 0，非法/坏 JSON → 2；`settle`：超门 → 1，坏输入 → 2，干净 → 0；`--gate` 可翻 verdict（同一账 `--gate 100` 从 fail 翻 pass）；`--json` 输出完整报告（含 speech 域与 breakdown）；`block` 输出结账块；未知命令/缺参数 → 2 | CLI 测试 | ✅ |
| A7 | 六层互不越界 | 插件与核心：无 pre-execute 监听、无解蔽账本字段（alternatives/disconfirming）、无本愿契约字段（wish/anchors）、无任务书字段（charter）、无跨会话错误账本、无失机账——grep 应无输出 | 代码 grep（复现命令见下） | ✅ |
| A8 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程 | 代码 grep（复现命令见下） | ✅ |
| A9 | 测试总量 | 全部用例 ≥ 70 且全绿（core + cli + 集成，0 失败） | `npm test` | ✅ 79 tests, 79 pass |
| A10 | 文档与登记 | docs 01–04、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新（含与六层的边界行） | 人工 + 链接 | ✅ |

## 复现命令

```bash
cd licheng
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 见 A9 实测
```

**A7 的 grep 命令**（应无输出——不越六层地盘）：

```bash
grep -rniE "pre-execute|alternatives|disconfirming|allowRoots|charter|maxSteps|recurrence|失机" src/core src/plugin | grep -v "^\s*//"
```

**A8 的 grep 命令**（应无输出——零 LLM、零网络、零子进程）：

```bash
grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create|child_process|spawn|exec\(" src/core src/plugin | grep -v "^\s*//"
```

## 实测结果（实现后回填，验收标准本身不改动）

- A1：✅ template 直通校验（3 立 1 改 1 弃 1 宣告共 6 条）；四种条目必需键/未知键/空串/坏行号（`第 2 行不是合法 JSON`）/id 重复（`第 2 行 id 重复: p-1`）/目标不存在（`不存在的结`）/已关闭（`已关闭的结`）逐项可证；discharge 三类非法（缺 contains、ok 非 boolean、tool 空串）各有一测。
- A2：✅ 空账 `{promised:0,…}` 咎值 0 无咎；兑现记首次命中序号；失诺 30 入咎带；无凭悬结 40（咎 30+吝 10）；咎 cap 60（三笔封顶）；吝 10/笔且两笔入吝带、三笔封顶 20；总分 cap（2 失诺+6 无凭弃约 = 80）；分带 14/15/29/30 逐点；改诺继承（what 与凭据）、换凭、带凭弃约悔 0、宣告命中兑现/不命中只记咎、`ok:true/false` 语义、tool 过滤、账序输出——全部核心用例绿。
- A3：✅ 共享流格式（带 id 配对 / 无 id 旧格式并入 / 孤儿建档 `isError null`）；`ok:true` 不被 isError 未知的调用满足；speech 事件级去重、可替换词表（非法替换抛 TypeError）、无 speech 时 `unaccounted:null`、`max(0, hits−promised)` 逐点可证；两套夹具（clean/broken）端到端数字与期望一致。
- A4：✅ `licheng block fixtures/broken-ledger.jsonl fixtures/broken-stream.jsonl` 两次运行 shasum 均为 `af6a45b4064186e3a62aa1eec108f4a64ecfce1b`；金样逐字断言（含「绳上无悬结。」与分带引文）；无时间戳字段（正则断言）。
- A5：✅ 8 集成用例全绿（官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 真实管道）。插件源码 `pre-execute` 字样零出现、`ctx.on(` 恰好 1 处且只挂 `tools/result`；连败探针 4/4 直达工具本体、5 次调用全部完整入账（4 isError=true + 1 false）；运行时 `settle()` 与核心 `settleLedger(账, exportCalls())` **deepEqual**（账实对账）；make/revise/abandon/declare 全链路可用；坏形状/重复 id/目标不存在或已关闭一律 `valid:false` 且不入账；`block()` 两次逐字节一致且与核心渲染器逐字一致。
- A6：✅ 16 CLI 用例全绿。`template` 直通校验；`ledger` 合法 0 / 坏 JSON、缺键、id 重复 → 2；`settle` 破账 1（咎值：40（咎）· 门 30）/ `--gate 100` 翻 0 / 干净 0；`--json` 完整报告（totals/breakdown/speech）；`--lexicon` 替换词表生效且内置词表不受影响；`block` 恒 0 且与 settle 输出逐字一致；未知命令/缺参数/坏 `--gate` → 2。
- A7：✅ `grep -rniE "pre-execute|alternatives|disconfirming|allowRoots|charter|maxSteps|recurrence|失机" src/core src/plugin`（剔除注释行）无输出。
- A8：✅ `grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create|child_process|spawn|exec\(" src/core src/plugin`（剔除注释行）无输出。
- A9：✅ `npm test` → 79 tests, 79 pass, 0 skipped（core 55 + cli 16 + integration 8）。
- A10：✅ docs 01–04、SKILL.md、README、根 README 项目索引与方向登记均已更新。
