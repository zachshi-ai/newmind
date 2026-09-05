# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。标准一经定稿不得为实现缺口事后删改。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 流解析兼容性 | 共享会话流格式全路径：`#` 与空行注释合法、坏 JSON 报行号；带 id 的 call/result 正确配对且 call 首见建档唯一；无 id 旧格式 result 并入紧邻其前 call；孤儿 result 独立建档；`turn_start/turn_end` 等非工具事件跳过；纯量事件在归并处跳过；`at` 原样保留 | core 用例 | ✅ 6 例全过（坏行号 /第 2 行/、id 配对与首见建档、无 id 归并、孤儿建档、非工具事件跳过、at 保留） |
| A2 | 制册语义 | schema：`version` 必为 1、`id` 非空、`budget` 至少含 `maxCalls/maxMinutes` 之一、存在时必为 ≥1 整数、多余字段宽容；`budget:{}` 非法；CLI 旗标与册互补、同键 CLI 覆盖；`declare` 补丁语义（给的键更新、未给的键保留、未给 `--id` 保留旧 id）；缺省载入 `./.duzhi.json`（存在时） | core + CLI 用例 | ✅ 10 例全过（合法全册/单线、四类坏册各出 issue、线 0/负/小数/字符串/null 皆拒、多余字段宽容、册形简形解析、互补与覆盖、坏旗标拒、id 优先级） |
| A3 | 用账语义 | 出 = 流内每一次工具调用**含 isError**（失败也计）；非工具事件不计；时程 `spanMs` = 末带 at 调用 at − 首带 at 调用 at；全流无 at → `spanMs:null` 时长维度退化；个别调用缺 at → 该调用时程逾判跳过而调用维度照判，`firstAt` 取首个带 at 调用 | core 用例 | ✅ 5 例全过（失败照计、无 at 流 spanMs null 而调用线照判、firstAt 基准、个别缺 at 只跳时程、spanMs=末−首=180000） |
| A4 | 逾案判定 | 调用过线：`seq > maxCalls`（第 maxCalls 次合法、第 maxCalls+1 次起逾）；时程过线：`at − firstAt > maxMinutes×60000` **严格大于**（恰在线上合法）；两线同越 via `both` 一案计一次不双罚；逐案记 `{seq, ref, at, via}` | core 用例 | ✅ 6 例全过（第 3 次=0 第 4 次=1、60000 恰在线上不逾/60001 逾、both 一案 6 分、逐案 ref/at 留痕、逾点名 seq 序列 4-8） |
| A5 | 三宗与制值 | 三宗：无制（册与旗标皆无）40 一次性；逾制 +6/案 cap 60；守界 0。`制值 = (无制?40:0) + min(60,6×逾案)`；cap 逐点可证（12 调用 11 案 66→60 账面照记）；`liveScore` 与离线重放同流**前缀一致**（逐步结算与同前缀离线重放 deepEqual） | core 用例 | ✅ 4 例全过（前缀逐步 0,0,0,6,12,18,24,30 且每前缀 deepEqual、无制不随调用量增长、cap 60、analyze≡逐案） |
| A6 | 分带与门禁 | 分带边界逐点可证（14→足、15→急、29→急、30→非）；无制单独即 40 → 非；门默认 30，`--gate` 可覆盖；守界流 0 不虚报 | core 用例 + 夹具手算期望值（fenced=0/足、overrun=30/非、overtime=12/足、unbounded=40/非、untimed=0/足） | ✅ 边界逐点（14足/15急/29急/30非）+ 夹具手算五组全对账（0足/30非/12足/40非/0足，追认 12足·18急）+ 干净流 0 不虚报 |
| A7 | 余量块逐字节确定 | 同一账本状态两次渲染逐字节相同（shasum 可证）；`#k` 随渲染递增且仅首行不同；无时间戳字段；入/出/蓄/带/逾各行按 §6 模板锁死；变体齐备（无制/未设线/无时不判/透支含负分钟/逾点名按流序含 both）；末行「—— 本块由确定性规则生成；重放同一流必得同一文本。」 | 渲染器单测 + CLI 复现 | ✅ 同状态两跑逐字节同 + CLI 两跑 shasum 同值 `03c682ce68dee11fabd90ce559e73aaef766987f`；#k 仅首行不同；无制/未设线/无时不判/负分钟透支（−1.0 分钟（已透支））/both 标签/末行全行断言过 |
| A8 | 真实管道上的度支式插件（结构性零拦截） | 挂载 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 真实管道：插件源码无 pre-execute 监听；探针**无条件到达工具本体**、管道零反噬；report/ledger/yuliang/gate/exportStream 全链路可用；register 与直配两种配置生效；`exportStream()` 与离线 `audit` 对同一流**账实对账**（deepEqual 制值与案数）；观察异常不冒泡；setBudget 立/换册（换册=新账）；坏线（0）点名且不生效 | 集成测试 | ✅ 9 例全过（源码无 pre-execute；探针 ran/wrote 直达本体且 0 分；cap 2 第 3 次起逾 6 分；直配等价+无册 40 非 fail；余量块 #k 递增仅首行不同且蓄行随账步进；导出流离线重放 deepEqual（含 overCases）；null 事件吞掉管道照常；setBudget 坏册 valid:false 好册换新账；坏线 0 点名 registerIssues 且无制 40 亮出） |
| A9 | CLI 语义 | `audit` 恰取一流；五夹具退出码与数值（fenced→0、overrun→1、overtime→0 且 `--gate 10`→1、unbounded→1 且追认 `--max-calls 4`→0、untimed→0 且 `--max-calls 2`→0）；`--json` 完整报告；`block` 纯文本、两跑 shasum 同、`--json` 包装；`declare` 写册补丁语义；`list` 出生效之线与 bounded 标记；`gate --value` 裁决；坏文件/坏流（带行号）/制册非法/未知命令/缺参数 → 2 | CLI 测试 | ✅ 17 例全过（五夹具数值与退出码、追认三态 40/12/18、门边界 CLI 版 12fail/13pass、block shasum 同+--json+无制变体、declare 补丁语义与双拒立、list 合并与 bounded、gate 29/30+自定义、坏流行号/坏文件/空 budget 册/未知命令·选项·缺参·多流·线 0 → 2、help/version） |
| A10 | 十四层互不越界 | 插件与核心：无 pre-execute 监听器；无他层机制词表（判断账本 alternatives/disconfirming、本愿 wish/anchors/尘值/拂拭、任务书 charter、望闻问切/病灶/医嘱、势账 盲捶/悬账/游骑/失机、见闻账 复见/复命/殆值/要籍、渠道 越词/涉命/僭行、分册 争界/侵入/越分/争写、过账 贰过/省身、绳账 绳账/咎值/结账、出境 溃值/泄物、器册 验尺/曲尺/虚器/照末/废尺/尾红/枉值/翻红窗/绳墨/绿验/器册、险册 险形/裸险/虚险/落款/影写/存史/布影/豫牌/险值/款词/行前定）——grep 应无输出 | 代码 grep（复现命令见下） | ✅ 无输出（首跑抓到自家注释枚举先层类型时的「行前定」三字，改写为「行前进退」后复跑净——grep 门要在实现期真跑的家训第三次实锤） |
| A11 | 模型无关 | 核心 + 插件零 LLM 调用、零网络请求、零子进程：grep `child_process\|axios\|openai\|anthropic\|completion(\|fetch(` 应无输出 | 代码 grep（复现命令见下） | ✅ 无输出 |
| A12 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成，0 失败；集成在真实 cordis 管道上 0 跳过） | `npm test` | ✅ 实测 **67 tests, 67 pass, 0 fail, 0 skipped**（core 41 + cli 17 + integration 9；集成全部在真实 cordis + dsh-tools 管道运行。定标期 60 例，为达 ≥65 补 7 例边角覆盖——标准未动，覆盖加厚） |
| A13 | 跨项目互认 | 对既有项目夹具流（无册）离线审计：诚实报无制 40（非）exit 1——「此流从未被量纲约束」是治理发现不是诬告；解析器与其余各层同构（同一流两账并行不悖） | CLI 复现（夹具缺席则跳过） | ✅ 双流同验：zhizhi `sample-stream.jsonl`（8 调用，无 id 旧格式）→ 40/非 exit 1；zhibi `hollow-stream.jsonl`（3 调用，带 id）→ 40/非 exit 1。定标稿误把 zhibi 夹具名（hollow-stream）安在 zhizhi 头上——A13 标准不变，修路径并扩为双流（详见诚实记录 3） |
| A14 | 文档与登记 | docs 01–04、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新（含与各层的边界行） | 人工 + 链接 | ✅ 本表回填时提交齐备 |

## 夹具手算（实现前先算死期望值）

| 夹具 | 流情 | 手算期望 | 实测 |
|---|---|---|---|
| fenced | 制册 `maxCalls:100 / maxMinutes:60`；4 次调用，span 180000ms=3.0 分 | 制值 0（足）exit 0；spanMs=180000 | ✅ 一致 |
| overrun | 制册 `maxCalls:3`；8 次调用（at 1000…8000，span 7000ms，未设时长线） | 逾制 5 案（第 4–8 次，via calls）×6=30（非）exit 1 | ✅ 一致 |
| overtime | 制册 `maxMinutes:1`；4 次调用 at = t0 / +20s / +70s / +100s | 逾制 2 案（第 3、4 次，70000/100000>60000，via time）×6=12（足）exit 0；`--gate 10` → exit 1 | ✅ 一致 |
| unbounded | 无制册无旗标；6 次调用（at 1000…6000） | 无制 40（非）exit 1；追认 `--max-calls 4` → 12（足）exit 0；`--max-calls 3` → 18（急）exit 0 | ✅ 一致 |
| untimed | 全流无 `at`；制册 `maxMinutes:5` | 时长维度退化（spanMs null）→ 0（足）exit 0；`--max-calls 2` → 12（足）exit 0 | ✅ 一致 |

跨项目：zhizhi sample（8 调用）/ zhibi hollow（3 调用）无册 → 均无制 40（非）exit 1。✅

## 复现命令

```bash
cd duzhi
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 见 A12 实测：67 tests, 67 pass, 0 fail, 0 skipped
node src/bin/duzhi.js audit fixtures/fenced-stream.jsonl --register fixtures/fenced-register.json; echo "exit=$?"    # 0（足）exit=0
node src/bin/duzhi.js audit fixtures/overrun-stream.jsonl --register fixtures/overrun-register.json; echo "exit=$?"  # 30（非）exit=1
node src/bin/duzhi.js audit fixtures/overtime-stream.jsonl --register fixtures/overtime-register.json; echo "exit=$?"  # 12（足）exit=0
node src/bin/duzhi.js audit fixtures/overtime-stream.jsonl --register fixtures/overtime-register.json --gate 10; echo "exit=$?"  # exit=1
node src/bin/duzhi.js audit fixtures/unbounded-stream.jsonl; echo "exit=$?"     # 无制 40（非）exit=1
node src/bin/duzhi.js audit fixtures/unbounded-stream.jsonl --max-calls 4; echo "exit=$?"  # 追认 12（足）exit=0
node src/bin/duzhi.js audit fixtures/untimed-stream.jsonl --register fixtures/untimed-register.json; echo "exit=$?"  # 无时不判 0（足）exit=0
node src/bin/duzhi.js audit ../zhizhi/fixtures/sample-stream.jsonl; echo "exit=$?"  # 无制 40（非）exit=1
node src/bin/duzhi.js audit ../zhibi/fixtures/hollow-stream.jsonl; echo "exit=$?"   # 无制 40（非）exit=1
node src/bin/duzhi.js block fixtures/overrun-stream.jsonl --register fixtures/overrun-register.json | shasum; echo "exit=$?"
node src/bin/duzhi.js block fixtures/overrun-stream.jsonl --register fixtures/overrun-register.json | shasum   # 两跑同值
```

## A10/A11 的 grep 命令

```bash
# A10：他层机制词（应无输出）
grep -rn "tools/pre-execute\|alternatives\|disconfirming\|anchors\|wish\|charter\|盲捶\|悬账\|游骑\|失机\|复见\|复命\|殆值\|要籍\|越词\|涉命\|僭行\|争界\|侵入\|越分\|争写\|贰过\|省身\|溃值\|泄物\|绳账\|咎值\|结账\|尘值\|拂拭\|病灶\|医嘱\|验尺\|曲尺\|虚器\|照末\|废尺\|尾红\|枉值\|翻红窗\|绳墨\|绿验\|器册\|险形\|裸险\|虚险\|落款\|影写\|存史\|布影\|豫牌\|险值\|款词\|行前定" duzhi/src/ | grep -v node_modules

# A11：模型无关（应无输出）
grep -rnE "child_process|axios|openai|anthropic|completion\(|fetch\(" duzhi/src/
```

## 实测结果（实现后回填，数字一律来自本机复跑）

- `npm test`：**67 tests, 67 pass, 0 fail, 0 skipped**（core 41 + cli 17 + integration 9，集成全部在真实 cordis + dsh-tools 管道上运行）；
- fenced → 制值 0（足）exit=0，spanMs 180000；
- overrun → 制值 30（非）exit=1，逾 5 案（第 4–8 次，via calls）；
- overtime → 制值 12（足）exit=0（spanMs 100000，逾 2 案 via time）；`--gate 10` → exit=1；
- unbounded → 无制 40（非）exit=1；追认 `--max-calls 4` → 12（足）exit=0；`--max-calls 3` → 18（急）exit=0；
- untimed → 0（足）exit=0（spanMs null，无时不判）；`--max-calls 2` → 12（足）exit=0；
- zhizhi sample 流 → 40（非）exit=1（8 调用）；zhibi hollow 流 → 40（非）exit=1（3 调用）；
- `block`（overrun）两跑 shasum 同值 `03c682ce68dee11fabd90ce559e73aaef766987f`；
- A10/A11 grep 门复跑：两段均无输出。

诚实记录（实现期真实修过的四处，均不改验收标准）：

1. 余量块蓄行的分钟段漏了「时程」前缀（`蓄：调用 98 · 57.0 分钟`）——core 的手算全行断言抓到，改渲染器（测试即规格，不改测试）；
2. A10 grep 门首跑抓到自家插件注释：枚举先层能力类型时写了「行前定」三字——改写为「行前进退」后复跑净。grep 门误触已是本仓第三次实锤（youya「过账」、baihe「定分/争写」之后），家训再验：grep 门要在实现期真跑，注释避开被 grep 的字面量；
3. 定标稿的跨项目复现命令把 zhibi 的夹具名（hollow-stream.jsonl）错安在 zhizhi 头上——zhizhi 实为 sample-stream.jsonl。A13 标准不变（无册历史流 → 无制 40 非 exit 1），修路径并扩为双流同验（zhizhi 8 调用无 id 旧格式 + zhibi 3 调用带 id，两种流形同一裁决）；
4. 定标期测试 60 例 < A12 的 ≥65：补 7 例边角覆盖（纯量流行、逾案 ref/at 留痕、负分钟透支、缺 budget 册解析、追认 id 注入、CLI 门边界、无制余量块）——覆盖加厚，标准未动。补测过程中两处新手算错（parseStream/buildCalls 职责分层、180000ms=3.0 分钟）被实现纠正后落账。
