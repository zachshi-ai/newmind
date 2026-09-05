# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。标准一经定稿不得为实现缺口事后删改。
>
> 定标后实现前的一处夹具自洽修正（不涉 A1–A14 标准条款）：silent 事册原把「未宣终形」错安在有终形声明的 T3 头上——实现前改为 T3 未宣终形（半途行尾点名之所在）、T2 补终形 `invoice check`。期望值分数不受影响（T3 仍半途、T2 仍幽项）。

## 验收标准表（实现前定稿，结果为实测回填）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 流解析兼容性 | 共享会话流格式全路径：`#` 与空行注释合法、坏 JSON 报行号；带 id 的 call/result 正确配对且重复 id 不重复建档（结算以末次为准）；无 id 旧格式 result 并入紧邻其前 call；孤儿 result 独立建档（isError 原样保留、缺失记 null）；`turn_start/turn_end` 等非工具事件跳过；多流按参序拼接、seq 全局递增 | core 用例 | ✅ 6 例全过（注释跳过、坏行号 /第 2 行/、id 配对+重复 id 单档末次结算、无 id 归并、孤儿双口径、多流拼接 seq 全局） |
| A2 | 工具族与作工面 | familyOf 同仓惯例逐字（观察/写/执行/其他，精确表∪包含表）；**作工面 = observe ∪ write ∪ exec**；**todo 族显式排除**（名小写精确命中 `todo_write`/`todowrite`/`todo` 按 other 处理，其参数含项词不计作工）；其余 other 族不入账；文本串 = argsText 递归收集全部字符串值以空格连接 | core 用例 | ✅ 6 例全过（familyOf 精确/包含表含 WebSearch/notebook_edit/run_cmd、workFamilyOf todo 三形收窄、argsText 递归、写族路径计作工、观察族查即始且 other 不入账、todo_write 参数全是项词仍幽项） |
| A3 | 事册语义 | items[].id 必填且唯一（重复 → exit 2）；name 缺省以 id 兼作项词与显示名；项词集 = name ∪ aliases（trim 后滤空）；order 引用不存在的 id → exit 2；`--register` 缺省载入 `./.zhongshi.json`（存在时）；**无册不判**（audit 无册 exit 2）；enroll 按 id 并集去重只增不删（既有 id 原样保留、新 id 追加、order 不动） | core 用例 + CLI 测试 | ✅ 5 例全过（normalizeItem 缺省 id 兼名+trim、重复 id/order 引用抛错、loadRegister 缺文件空册+夹具四事、merge 只增不删既有 id 不动、CLI 缺省载入/无册 exit 2/坏册两类 exit 2/enroll 只增不删） |
| A4 | 词法与逐调用分类 | 词命中 = argsText 大小写归一字面子串；**判定序锁死：弃形 > 终形 > 作工**；一调用可并行结账多项；**失败调用（isError=true）亦记作工**（试错也是始）；孤儿（isError=null）照成功侧口径；未宣终形之项不得认终、未宣弃形之弃不入账 | core 用例 | ✅ 6 例全过（大小写归一、弃>终>工双断言、并行结账、失败调用记半途、孤儿成功侧、未宣终形至多半途+点名） |
| A5 | 案别判定 | 末笔定案别：幽项（全流无事件）／半途（末为 W）／有终（末为 T）／有弃（末为 A）；**空终案**=其后复有作工之 W 的 T 逐案计（末态不影响计数）；复活（A 后复有 W/T → A 作废，末笔定案） | core 用例 + 夹具手算期望值 | ✅ 9 例全过（四案别、空终计数 T,W,T,W→有终+1、空终多案 T,W,T,W→2 案触 cap40、复活、终后言弃不计空终、幽项封顶 3 项仍 60、夹具 silent/washed/fenced 全对账） |
| A6 | 先后账 | order [A,B] 失序 ⟺ B 首个 W 的 seq 早于 A 首个 T 的 seq 且两者皆存在；**A 无终不判**（宁纵，不让 B 代 A 受罚）；一对至多一案、多对逐对 | core 用例 | ✅ 5 例全过（失序案 seq 对点、A 无终不判双半途、次序正确不判、多对逐对 2 案、B 未作工不判） |
| A7 | 程值与分带 | `total = min(100, min(60,30×幽) + min(30,15×半) + min(40,20×空终) + min(30,10×失序))`；分带边界逐点可证（0/10/14→近道、15/29→鲜终、30→无终）；cap 逐点可证（幽 3 项 90→60、半 3 项 45→30、空终 3 案 60→40、失序 4 处 40→30；四轴合计 160→100）；门默认 30，`--gate` 可覆盖；`liveScore` 与离线重放同流前缀一致 | core 用例 + 夹具手算期望值 | ✅ scoreOf/bandName 边界逐点（0/14 近道、15/29 鲜终、30/100 无终）；cap 逐点（60/30/40/30、2+2+2+3=160→100）；单幽项 30=无终 fail、--gate 31 翻 pass；前缀一致（k=1..3 三档 live 与离线 deepEqual）；夹具 75/60/45/0/35 全对 |
| A8 | 程账块逐字节确定 | 同一（册, 引擎态）两次渲染逐字节相同（#k 随渲染递增且仅此一处不同，对比断言用 split('\n') 后首行单独比、其余 deepEqual）；无时间戳字段；逐事序 = 册序；末行「—— 本块由确定性规则生成；重放同一流必得同一文本。」；未宣终形之项在行尾点名「未宣终形」 | 渲染器单测 + CLI 复现（shasum） | ✅ 首行 #k 之外逐字节相同（deepEqual 行数组）；末行逐字断言过；无时间戳断言过；未宣终形行尾点名断言过；CLI 两跑 shasum 同值 5108e722ce5aedccfefd8013337264d575fbb130（fenced 两流拼接） |
| A9 | 真实管道上的持账式插件（结构性零拦截） | 挂载 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 真实管道：插件源码无 pre-execute 监听；幽项探针**无条件到达工具本体**、管道零反噬；report/chengzhang/chengkuai/gate/exportStream 全链路可用；事册随插件 config 注入生效；`exportStream()` 与离线 `audit` 对同一流**账实对账**（deepEqual 程值与案数）；观察异常不冒泡；写族调用计入作工 | 集成测试 | ✅ 10 例全过（源码无 pre-execute 监听；echo 探针直达本体且双幽项 fail；作工至终言账平 pass；空终 35=15+20；弃言提交信息生效有弃 0 分；todo_write 不计作工；写族计作工；程账 #k 首行外逐字节同；exportStream 离线重放 deepEqual；null 事件吞掉管道照常 60=30×2） |
| A10 | CLI 语义 | `audit` 可取多流：fenced 两流拼接 → 程值 0（近道）exit 0、**单流 part1 → 45（无终）exit 1**（真中断）、反序拼接 → 35（无终）exit 1（流序敏感）；silent 流 → 75（无终）exit 1、`--gate 80` 翻 pass；washed 流 → 60（无终）exit 1、`--gate 80` 翻 pass；`--json` 输出完整报告（逐事清单+失序）；`ledger` 逐事点名（含 --json）；`kuai` 程账块（--json 包装）；`list` 出册、`enroll` 只增不删、`gate --value` 裁决；无册/坏册/坏流/未知命令/缺参数/坏 item → 2 | CLI 测试 | ✅ 14 例全过（六条夹具审计命令 exit 与程值全对——含反序 35 流序敏感、--gate 80 翻 pass、--json 全报告、ledger 三行点名+程值行+--json、kuai 双跑同输出+--json 包装、缺省载入 cwd 事册、无册不判 exit 2、坏册两类 exit 2、坏流行号 exit 2、未知命令/缺流/缺 --value exit 2、list 出册+空册视图、enroll 只增不删+坏 item exit 2、gate 双裁+--json） |
| A11 | 十七层互不越界 | 插件与核心：无 pre-execute 监听器；无他层机制词（判断账本 alternatives/disconfirming、本愿 wish/anchors/尘值、任务书 charter/病灶、势账 盲捶/悬账/游骑/失机、见闻账 复见/复命/殆值/要籍、渠道 越词/涉命/僭行、分册 争写/侵入/越分、出境 溃值/泄物/阖籍、记录 讳笔/空绿、退路 裸险/备形/影写、总量 制册/逾案/余量、权柄 柄册/决形/侵柄/渍请、量尺 验尺/绿验/红验/曲尺/照末、承诺 绳账/咎值、教训 贰过/省身、成色 效值/空言）——grep 应无输出 | 代码 grep（复现命令见下） | ✅ 无输出。grep 门在实现期真实跑过两轮：第一轮抓到插件注释「结账」二字撞立诚机制词（改「结案」后净）——全仓三次前科之后第四次实锤，注释里的字面量必须避开被 grep 的词 |
| A12 | 模型无关 | 核心 + 插件零 LLM 调用、零网络请求、零子进程：grep `child_process\|axios\|openai\|anthropic\|completion(\|fetch(` 应无输出 | 代码 grep（复现命令见下） | ✅ 无输出 |
| A13 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成，0 失败） | `npm test` | ✅ 实测 **68 tests, 68 pass, 0 fail, 0 skipped**（core 44 + cli 14 + integration 10；集成在真实 cordis 管道上运行，0 跳过） |
| A14 | 文档与登记 | docs 01–04、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新（含与十七层的边界行） | 人工 + 链接 | ✅ 本表回填时提交齐备（docs 01–04、SKILL.md、README、根 README 索引 #17 与方向登记行——并发会话交付的 xiaoyan #18 已在登记行预写与本层的边界句「走没走到归 zhongshi，拿什么证明归效验」） |

## 夹具期望值（实现前手算，含逐步依据）

**事册** `fixtures/silent.zhongshi.json`：T1 重复扣款修复〔词:重复扣款修复,dedupe；终形:test dedupe〕、T2 账单导出〔词:账单导出,invoice-export；终形:invoice check〕、T3 边界用例〔词:边界用例,edge-cases；**未宣终形**〕、T4 文档同步〔词:文档同步,docs-sync；终形:docs check〕；无 order。

**fixtures/silent-stream.jsonl —— 期望 程值 75（无终）exit 1；`--gate 80` 翻 pass**

| # | 调用 | 事件 | 依据 |
|---|---|---|---|
| c1 | read src/billing/ledger.js | 无 | 无项词命中（ledger ≠ 任何项词） |
| c2 | `grep -rn dedupe src/` | T1 始#2(W) | 别名 dedupe 命中 |
| c3 | edit src/billing/dedupe.js | T1 W | 路径词面命中 |
| c4 | `npm test -- test dedupe` | **T1 终#4(T)** | 终形 test dedupe 命中；判定序 T > W |
| c5 | `grep -rn edge-cases test/` | T3 始#5(W) | |
| c6 | edit test/billing/edge-cases.spec.js | T3 W(末作#6) | |
| c7 | `npm run lint` | 无 | |
| c8 | read docs/sync-notes.md | 无 | 近 decoy：sync-notes ≠ docs-sync |
| c9 | `git commit -m "wip edge-cases"` | T3 W(末作#9) | |
| c10 | `npm run build` | 无 | |

案别：T1 **有终**（始#2 终#4）；T2 **幽项**（全流无作工）；T3 **半途**（始#5 末作#9——**未宣终形**，行尾点名）；T4 **幽项**。
程值 = min(60,30×2) + min(30,15×1) + 0 + 0 = 60+15 = **75** → 无终 → exit 1。

**事册** `fixtures/washed.zhongshi.json`：T1 用户表迁移〔词:用户表迁移,migrate-users；终形:migrate check〕、T2 旧列清理〔词:旧列清理,drop-old-cols；弃形:跳过旧列〕、T3 补索引〔词:补索引,add-index；终形:index verify〕、T4 回归验证〔词:回归验证,regression-suite；终形:full regression〕；order [["T3","T4"]]。

**fixtures/washed-stream.jsonl —— 期望 程值 60（无终）exit 1；`--gate 80` 翻 pass**

| # | 调用 | 事件 | 依据 |
|---|---|---|---|
| c1 | `npm run migrate-users --dry-run` | T1 始#1(W) | 作工与干跑无涉（干跑是豫立的词，本层只记行程） |
| c2 | `npm run migrate check` | **T1 终#2(T)** | 终形命中 |
| c3 | `npm run migrate-users --verify-only` | T1 W → **空终端#1** | 终#2 后复作于#3 |
| c4 | `git commit -m "跳过旧列：下游仍依赖"` | T2 弃#4(A) | 弃形命中 → 末笔 A → **有弃** 0 分 |
| c5 | edit db/add-index.sql | T3 始#5(W) | |
| c6 | `npm run regression-suite --smoke` | T4 始#6(W) | order[T3,T4]：T4 之始#6 |
| c7 | `npm run index verify` | **T3 终#7(T)** | 终形命中 |
| c8 | edit docs/regression-notes.md | 无 | 近 decoy：regression-notes ≠ regression-suite |

案别：T1 **半途**（末作#3）+ **空终案 1**（终#2 后复作#3）；T2 **有弃**；T3 **有终**；T4 **半途**（始#6 末作#6）。
失序：立序 T3→T4，T4 首 W=#6 早于 T3 首 T=#7 → **失序案 1**。
程值 = 0 + min(30,15×2)=30 + min(40,20×1)=20 + min(30,10×1)=10 = **60** → 无终 → exit 1。

**事册** `fixtures/fenced.zhongshi.json`：T1 断连修复〔词:断连修复,flink-reconnect；终形:test flink〕、T2 部署清单更新〔词:部署清单,manifest.yml；终形:manifest check〕；order [["T1","T2"]]。

**fixtures/fenced-part1.jsonl（第一班，中断）+ fenced-part2.jsonl（第二班，续跑）**

| 流 | # | 调用 | 事件 | 依据 |
|---|---|---|---|---|
| part1 | c1 | edit net/flink-reconnect.js | T1 始#1(W) | |
| part1 | c2 | read net/flink-reconnect.js | T1 W(末作#2) | 中断——会话到此为止 |
| part2 | c1 | edit net/flink-reconnect.js | T1 W | 续跑 |
| part2 | c2 | `npm run test flink` | **T1 终(T)** | 终形命中 |
| part2 | c3 | edit deploy/manifest.yml | T2 始(W) | 别名 manifest.yml 命中 |
| part2 | c4 | `npm run manifest check` | **T2 终(T)** | 终形命中 |

- **part1 单流**：T1 半途（始#1 末作#2）+ T2 幽项 → 15+30 = **45 无终** exit 1——真中断就该红；
- **两流拼接（参序 part1 part2）**：T1 有终（始#1 终#4）、T2 有终（始#5 终#6）；失序 [T1,T2]：T2 首 W=#5 不早于 T1 首 T=#4 → 无失序 → **程值 0（近道）exit 0**——跨会话账平，程账块即续跑图（T1 上一班开的头、这一班收的尾）；
- **反序拼接（part2 part1）**：T1 事件 W,T,W,W → 末笔 W → 半途 + 空终端 1（终#2 后复作#5）；T2 有终 → 15+20 = **35 无终** exit 1——流序敏感，账认时间的形状。

实测三组全对：`audit silent → 75 exit 1（--gate 80 → 0）`、`audit washed → 60 exit 1（--gate 80 → 0）`、`audit part1 → 45 exit 1`、`audit part1 part2 → 0 exit 0`、`audit part2 part1 → 35 exit 1`、`kuai part1 part2` shasum 双跑一致 `5108e722ce5aedccfefd8013337264d575fbb130`。

## 复现命令

```bash
cd zhongshi
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 见 A13 实测
node src/bin/zhongshi.js audit fixtures/silent-stream.jsonl --register fixtures/silent.zhongshi.json; echo "exit=$?"        # 期望 75（无终）exit=1
node src/bin/zhongshi.js audit fixtures/silent-stream.jsonl --register fixtures/silent.zhongshi.json --gate 80; echo "exit=$?"  # 期望 翻 pass exit=0
node src/bin/zhongshi.js audit fixtures/washed-stream.jsonl --register fixtures/washed.zhongshi.json; echo "exit=$?"       # 期望 60（无终）exit=1
node src/bin/zhongshi.js audit fixtures/fenced-part1.jsonl --register fixtures/fenced.zhongshi.json; echo "exit=$?"        # 期望 45（无终）exit=1
node src/bin/zhongshi.js audit fixtures/fenced-part1.jsonl fixtures/fenced-part2.jsonl --register fixtures/fenced.zhongshi.json; echo "exit=$?"  # 期望 0（近道）exit=0
node src/bin/zhongshi.js audit fixtures/fenced-part2.jsonl fixtures/fenced-part1.jsonl --register fixtures/fenced.zhongshi.json; echo "exit=$?"  # 期望 35（无终）exit=1
node src/bin/zhongshi.js kuai fixtures/fenced-part1.jsonl fixtures/fenced-part2.jsonl --register fixtures/fenced.zhongshi.json | shasum   # 两次一致（A8）
```

## A11/A12 的 grep 命令

```bash
# A11：他层机制词（应无输出）
grep -rn "alternatives\|disconfirming\|本愿\|尘值\|anchors\|reanchor\|charter\|病灶\|病值\|医嘱\|盲捶\|悬账\|游骑\|失机\|势账\|变方\|复见\|复命\|殆值\|要籍\|陈账\|涉命\|僭行\|越词\|世牌\|诫块\|争写\|侵入\|越分\|分册\|界碑\|溃值\|泄物\|阖籍\|境账\|讳笔\|空绿\|实录\|笔账\|裸险\|险值\|豫牌\|备形\|影写\|存史\|制册\|逾案\|制值\|余量\|柄册\|决形\|侵柄\|渍请\|柄值\|柄牌\|验尺\|绿验\|红验\|曲尺\|废尺\|枉值\|照末\|虚器\|绳账\|咎值\|结账\|轻诺\|贰过\|省身\|拂拭\|效值\|空言\|证块\|回令\|效账" zhongshi/src/ | grep -v node_modules
# A12：模型无关（应无输出）
grep -rn "child_process\|axios\|openai\|anthropic\|completion(\|fetch(" zhongshi/src/ | grep -v node_modules
```
