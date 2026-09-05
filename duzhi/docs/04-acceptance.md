# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。标准一经定稿不得为实现缺口事后删改。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 流解析兼容性 | 共享会话流格式全路径：`#` 与空行注释合法、坏 JSON 报行号；带 id 的 call/result 正确配对且 id 首见为准；无 id 旧格式 result 并入紧邻其前 call；孤儿 result 独立建档（`isError:null`）；`turn_start/turn_end` 等非工具事件跳过；`at` 原样保留 | core 用例 | （实现后回填） |
| A2 | 制册语义 | schema：`version` 必为 1、`id` 非空、`budget` 至少含 `maxCalls/maxMinutes` 之一、存在时必为 ≥1 整数、多余字段宽容；`budget:{}` 非法；CLI 旗标与册互补、同键 CLI 覆盖；`declare` 补丁语义（给的键更新、未给的键保留、未给 `--id` 保留旧 id）；缺省载入 `./.duzhi.json`（存在时） | core + CLI 用例 | （实现后回填） |
| A3 | 用账语义 | 出 = 流内每一次工具调用**含 isError**（失败也计）；非工具事件不计；时程 `spanMs` = 末带 at 调用 at − 首带 at 调用 at；全流无 at → `spanMs:null` 时长维度退化；个别调用缺 at → 该调用时程逾判跳过而调用维度照判，`firstAt` 取首个带 at 调用 | core 用例 | （实现后回填） |
| A4 | 逾案判定 | 调用过线：`seq > maxCalls`（第 maxCalls 次合法、第 maxCalls+1 次起逾）；时程过线：`at − firstAt > maxMinutes×60000` **严格大于**（恰在线上合法）；两线同越 via `both` 一案计一次不双罚；逐案记 `{seq, ref, at, via}` | core 用例 | （实现后回填） |
| A5 | 三宗与制值 | 三宗：无制（册与旗标皆无）40 一次性；逾制 +6/案 cap 60；守界 0。`制值 = (无制?40:0) + min(60,6×逾案)`；cap 逐点可证（11 案 66→60）；`liveScore` 与离线重放同流**前缀一致**（逐步结算即时分数与同前缀离线重放 deepEqual） | core 用例 | （实现后回填） |
| A6 | 分带与门禁 | 分带边界逐点可证（14→足、15→急、29→急、30→非）；无制单独即 40 → 非；门默认 30，`--gate` 可覆盖；守界流 0 不虚报 | core 用例 + 夹具手算期望值（fenced=0/足、overrun=30/非、overtime=12/足、unbounded=40/非、untimed=0/足） | （实现后回填） |
| A7 | 余量块逐字节确定 | 同一账本状态两次渲染逐字节相同（shasum 可证）；`#k` 随渲染递增且仅首行不同；无时间戳字段；入/出/蓄/带/逾各行按 §6 模板锁死；变体齐备（无制/未设线/无时不判/透支/逾点名按流序）；末行「—— 本块由确定性规则生成；重放同一流必得同一文本。」 | 渲染器单测 + CLI 复现 | （实现后回填） |
| A8 | 真实管道上的度支式插件（结构性零拦截） | 挂载 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 真实管道：插件源码无 pre-execute 监听；探针**无条件到达工具本体**、管道零反噬；report/ledger/yuliang/gate/exportStream 全链路可用；register 与直配两种配置生效；`exportStream()` 与离线 `audit` 对同一流**账实对账**（deepEqual 制值与案数）；观察异常不冒泡 | 集成测试 | （实现后回填） |
| A9 | CLI 语义 | `audit` 恰取一流；五夹具退出码与数值（fenced→0、overrun→1、overtime→0 且 `--gate 10`→1、unbounded→1 且追认 `--max-calls 4`→0、untimed→0 且 `--max-calls 2`→0）；`--json` 完整报告；`block` 纯文本、两跑 shasum 同、`--json` 包装；`declare` 写册补丁语义；`list` 出生效之线；`gate --value` 裁决；坏文件/坏流（带行号）/制册非法/未知命令/缺参数 → 2 | CLI 测试 | （实现后回填） |
| A10 | 十四层互不越界 | 插件与核心：无 pre-execute 监听器；无他层机制词表（判断账本 alternatives/disconfirming、本愿 wish/anchors/尘值/拂拭、任务书 charter、望闻问切/病灶/医嘱、势账 盲捶/悬账/游骑/失机、见闻账 复见/复命/殆值/要籍、渠道 越词/涉命/僭行、分册 争界/侵入/越分/争写、过账 贰过/省身、绳账 绳账/咎值/结账、出境 溃值/泄物、器册 验尺/曲尺/虚器/照末/废尺/尾红/枉值/翻红窗/绳墨/绿验/器册、险册 险形/裸险/虚险/落款/影写/存史/布影/豫牌/险值/款词/行前定）——grep 应无输出 | 代码 grep（复现命令见下） | （实现后回填） |
| A11 | 模型无关 | 核心 + 插件零 LLM 调用、零网络请求、零子进程：grep `child_process\|axios\|openai\|anthropic\|completion(\|fetch(` 应无输出 | 代码 grep（复现命令见下） | （实现后回填） |
| A12 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成，0 失败；集成在真实 cordis 管道上 0 跳过） | `npm test` | （实现后回填） |
| A13 | 跨项目互认 | 对 zhizhi 夹具流（无册）离线审计：诚实报无制 40（非）exit 1——「此流从未被量纲约束」是治理发现不是诬告；解析器与其余各层同构（同一流两账并行不悖） | CLI 复现（夹具缺席则跳过） | （实现后回填） |
| A14 | 文档与登记 | docs 01–04、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新（含与各层的边界行） | 人工 + 链接 | （实现后回填） |

## 夹具手算（实现前先算死期望值）

| 夹具 | 流情 | 手算期望 |
|---|---|---|
| fenced | 制册 `maxCalls:100 / maxMinutes:60`；4 次调用，首 at=…000000、末 at=…018000（span 180000ms=3.0 分） | 制值 0（足）exit 0；spanMs=180000 |
| overrun | 制册 `maxCalls:3`；8 次调用（at 1000…8000，span 7000ms，未设时长线） | 逾制 5 案（第 4–8 次，via calls）×6=30（非）exit 1 |
| overtime | 制册 `maxMinutes:1`；4 次调用 at = t0 / +20s / +70s / +100s | 逾制 2 案（第 3、4 次，at−firstAt=70000/100000>60000，via time）×6=12（足）exit 0；`--gate 10` → 12≥10 exit 1 |
| unbounded | 无制册无旗标；6 次调用（at 1000…6000） | 无制 40（非）exit 1；追认 `--max-calls 4` → 逾 2 案=12（足）exit 0；`--max-calls 3` → 逾 3 案=18（急）exit 0 |
| untimed | 全流无 `at`；制册 `maxMinutes:5` | 时长维度退化（spanMs null）→ 制值 0（足）exit 0；加 `--max-calls 2` → 逾 2 案=12（足）exit 0 |

跨项目：zhizhi `hollow-stream.jsonl`（3 次调用、无册）→ 无制 40（非）exit 1。

## 复现命令

```bash
cd duzhi
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 见 A12 实测
node src/bin/duzhi.js audit fixtures/fenced-stream.jsonl --register fixtures/fenced-register.json; echo "exit=$?"    # 期望 0（足）exit=0
node src/bin/duzhi.js audit fixtures/overrun-stream.jsonl --register fixtures/overrun-register.json; echo "exit=$?"  # 期望 30（非）exit=1
node src/bin/duzhi.js audit fixtures/overtime-stream.jsonl --register fixtures/overtime-register.json; echo "exit=$?"  # 期望 12（足）exit=0
node src/bin/duzhi.js audit fixtures/overtime-stream.jsonl --register fixtures/overtime-register.json --gate 10; echo "exit=$?"  # 期望 exit=1
node src/bin/duzhi.js audit fixtures/unbounded-stream.jsonl; echo "exit=$?"     # 期望 无制 40（非）exit=1
node src/bin/duzhi.js audit fixtures/unbounded-stream.jsonl --max-calls 4; echo "exit=$?"  # 期望 追认后 12（足）exit=0
node src/bin/duzhi.js audit fixtures/untimed-stream.jsonl --register fixtures/untimed-register.json; echo "exit=$?"  # 期望 无时不判 0（足）exit=0
node src/bin/duzhi.js audit ../zhizhi/fixtures/hollow-stream.jsonl; echo "exit=$?"  # 期望 无制 40（非）exit=1
```

## A10/A11 的 grep 命令

```bash
# A10：他层机制词（应无输出）
grep -rn "tools/pre-execute\|alternatives\|disconfirming\|anchors\|wish\|charter\|盲捶\|悬账\|游骑\|失机\|复见\|复命\|殆值\|要籍\|越词\|涉命\|僭行\|争界\|侵入\|越分\|争写\|贰过\|省身\|溃值\|泄物\|绳账\|咎值\|结账\|尘值\|拂拭\|病灶\|医嘱\|验尺\|曲尺\|虚器\|照末\|废尺\|尾红\|枉值\|翻红窗\|绳墨\|绿验\|器册\|险形\|裸险\|虚险\|落款\|影写\|存史\|布影\|豫牌\|险值\|款词\|行前定" duzhi/src/ | grep -v node_modules

# A11：模型无关（应无输出）
grep -rnE "child_process|axios|openai|anthropic|completion\(|fetch\(" duzhi/src/
```

## 实测结果（实现后回填，数字一律来自本机复跑）

（待实现后回填）
