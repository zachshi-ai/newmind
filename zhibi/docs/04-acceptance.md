# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。标准一经定稿不得为实现缺口事后删改。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 流解析兼容性 | 共享会话流格式全路径：`#` 与空行注释合法、坏 JSON 报行号；带 id 的 call/result 正确配对且 id 首见为准；无 id 旧格式 result 并入紧邻其前 call；孤儿 result 独立建档（`isError:null`）；`turn_start/turn_end` 等非工具事件跳过 | core 用例 | ✅ 6 例全过（坏行号断言 /第 4 行/、id 首见回填、无 id 归并、孤儿建档、非工具事件跳过、at 保留不判定） |
| A2 | 笔册语义 | 显式 words/masks 与默认表取并集且只增不删；excuses 纯显式（无默认）；`noDefaults` 同时关闭两张默认表（excuses 本无默认不受影响）；`enroll` 并集去重；册与 CLI 选项同构生效 | core 用例 | ✅ 5 例全过（默认 12 词 6 形齐备、并集只增不删、撞源去重唯一、excuses 无默认、noDefaults 关双表、非法正则建册即抛报项名） |
| A3 | 史事判定语义 | exec 族判定沿用同仓惯例（精确集 ∪ 子串）；`args.command` 优先、否则 args 字符串值拼接；史事 = exec ∧ 史词命中 ≥1；一次史事可同属多族且各族独立记账；非 exec 族永不为史事（常事不书——族表外命令带讳形不入账）；族内先后以流内序列定（无 `at` 之流全判） | core 用例 | ✅ 5 例全过（exec 精确∪子串∪大小写、非 exec 具词具讳形仍不入账、command 优先/拼接兜底、一案双族独立记账、序列判定不读 at） |
| A4 | 讳形表 | 默认 6 形逐形命中（吞真/吞言/吞零/弛禁/塞目/虚准各一例）；一次史事多形全列点名、分数按案计；裸 `2>/dev/null` 不入默认表（弃声非讳咎）；显式 `--mask` 正则扩展生效 | core 用例 | ✅ 4 例全过（六形八写法逐一命中、三形一案不复利 30、裸 2>/dev/null 判直、显式讳形 + 显式史词联动 30） |
| A5 | 案别与族末状态机 | 判定序锁死：豁免 > 失败侧 > 讳形；豁笔/试笔/诚红均 0 分且点名；成功侧讳笔 → 族末置讳；族末为讳 → 空绿案 +30/族（族末讳笔不再另计 +10，一讳不两罚）；非族末讳笔 +10/案（已赎）；排序全用流内序列；`isError:null` 按成功侧口径 | core 用例 | ✅ 8 例全过（豁免压一切且不触族末、试笔 0 族末试、账面无全文有摘录、空绿不两罚 30、已赎 10、前讳后讳 40、成串不互赎 40、孤儿按成功侧 30） |
| A6 | 讳值与分带 | `total = min(30,10×讳笔) + min(60,30×空绿族)`；分带边界逐点可证（14→素、15→讳、29→讳、30→诬）；cap 逐点可证（4 案已赎 40→30、3 空绿族 90→60）；一空绿即越门（30）；`liveScore` 与离线重放同流**前缀一致**；门默认 30，`--gate` 可覆盖 | core 用例 + 夹具手算期望值（clean=0/素、hollow=30/诬、healed=10/素、honestred=0/素、mixed=70/诬、excused=0/素） | ✅ 边界逐点（14素/15讳/29讳/30诬）+ cap（4 案 40→30、3 族 90→60 账面照记）+ mixed 全前缀逐步 deepEqual + 夹具手算五组全对账（clean 0 素 / hollow 30 诬 / healed 10 素 / honestred 0 素 / mixed 70 诬=已赎 eslint 10+双族空绿 60）；干净流 0 不虚报 |
| A7 | 实录块逐字节确定 | 同一账本状态两次渲染逐字节相同（shasum 可证）；`#k` 随渲染递增且仅此一处不同；无时间戳字段；讳笔/空绿/族末一律按流序/族序点名；摘录过掩码自洁（sk-/Bearer/私钥头/云钥四形）；末行「—— 本块由确定性规则生成；重放同一流必得同一文本。」 | 渲染器单测 + CLI 复现 | ✅ 同状态两跑逐字节同 + CLI 两跑 shasum 同值 e5f3e3094cdf8864d3d55ecfd017a6dd7594896e；#k 仅首行不同；结构齐备断言过；掩码映射骑缝不漏（窗口边界落进凭据区段折算到掩码起点）；空块确定；无时间戳 |
| A8 | 真实管道上的秉笔式插件（结构性零拦截） | 挂载 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 真实管道：插件源码无 pre-execute 监听；讳形探针**无条件到达工具本体**、管道零反噬；report/bizhang/shilu/gate/exportStream 全链路可用；实录块 `#k` 递增；`exportStream()` 与离线 `audit` 对同一流**账实对账**（deepEqual 讳值与案数）；观察异常不冒泡 | 集成测试 | ✅ 11 例全过（源码无 pre-execute；`\|\| true` 探针 ran 直达本体且空绿 30 fail；弛禁一案双族 60 诬；真判还直 10 pass；excuses 配置豁笔不触族末；register 配置对象显式词形生效；逐案账面无凭据原文、摘录带掩码；#k 递增仅首行不同；导出流离线重放 deepEqual；null 事件吞掉；非 exec 只计数不成史事） |
| A9 | CLI 语义 | `audit` 恰取一流（两流 → 2）：干净流 → 0，空绿流 → 1，已赎流 → 0（`--gate 10` 翻 1），诚红流 → 0，混合流 → 1，豁免流 → 0（去豁免词翻 1）；`--word` 显式史词生效；`--mask` 显式讳形生效；`--no-defaults` 关默认表生效；`--register` 缺省载入 `./.zhibi.json`（存在时）；`--json` 输出完整报告；`block` 纯文本、`--json` 包装、两跑 shasum 同；`enroll` 并集去重只增不删；`list` 出册 JSON；`gate --value` 裁决；坏文件/坏流/未知命令/缺参数 → 2 | CLI 测试 | ✅ 18 例全过（六夹具退出码与数值、@file 豁免、--word/--mask 联动翻转、--no-defaults 归零、--register 册文件与 ./.zhibi.json 缺省载入、block shasum 同 + --json、list 生效册、enroll 并集只增不删、gate 29/30 边界 + 自定义门、help/version、多流/坏文件/坏流行号/未知命令·选项·缺参 → 2） |
| A10 | 十二层互不越界 | 插件与核心：无 pre-execute 监听器；无他层机制词表（判断账本 alternatives/disconfirming、本愿 wish/anchors/尘值/拂拭、任务书 charter、望闻问切/病灶/医嘱、势账 盲捶/悬账/游骑/失机、见闻账 复见/复命/殆值/要籍、渠道 越词/涉命/僭行、分册 争界/侵入/越分/争写、过账 贰过/省身、绳账 绳账/咎值/结账、出境 溃值/泄物、器册 验尺/曲尺/虚器/照末/废尺/尾红/枉值/翻红窗/绳墨）——grep 应无输出 | 代码 grep（复现命令见下） | ✅ 全部无输出 |
| A11 | 模型无关 | 核心 + 插件零 LLM 调用、零网络请求、零子进程：grep `child_process\|axios\|openai\|anthropic\|completion(\|fetch(` 应无输出（直笔审计对象无 baihe 式 http 词法例外） | 代码 grep（复现命令见下） | ✅ 无输出（审计对象是命令串词法与流序状态机，与 http 词法无结构性交集） |
| A12 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成，0 失败） | `npm test` | ✅ 实测 **70 tests, 70 pass, 0 fail, 0 skipped**（core 27 + cli 18 + integration 11；集成在真实 cordis 管道上运行，0 跳过） |
| A13 | 文档与登记 | docs 01–04、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新（含与十二层的边界行） | 人工 + 链接 | ✅ 本表回填时提交齐备 |

## 夹具手算（实现前先算死期望值）

| 夹具 | 流情 | 手算期望 |
|---|---|---|
| clean | `npm test` 直 → `make` 直 → 写文件 → 常事讳形（`ls \|\| true`，非史事） | 讳值 0（素）exit 0 |
| hollow | `npm test \|\| true` 讳 → 写文件（收工） | 空绿 1 族 → 30（诬）exit 1 |
| healed | `npm test \|\| true` 讳 → `npm test` 直（已赎） | 讳笔 1 → 10（素）exit 0；`--gate 10` → exit 1 |
| honestred | `npm test` 干净见红（末笔） | 0（素）exit 0 |
| mixed | `set +e; make all; npm run test`（弛禁，双族） → `eslint .` 直 | 空绿 2 族 60 + 讳笔 0 → 60？不——eslint 后其族为直，双族仍讳末 → 空绿 60（诬）exit 1；如再补 `eslint \|\| true` 讳 + `eslint` 直 → +10 → 70（诬） |
| excused | `npm test \|\| true # smoke-optional`（--excuse smoke-optional → 豁笔） | 0（素）exit 0；去豁免 → 空绿 30（诬）exit 1 |

（mixed 夹具取「已赎 eslint」变体：弛禁双族空绿 60 + 已赎讳笔 10 = 70，与 A6 锁定值一致；实现后未改动任何期望值。）

## 复现命令

```bash
cd zhibi
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 见 A12 实测
node src/bin/zhibi.js audit fixtures/hollow-stream.jsonl; echo "exit=$?"     # 期望 讳值 30（诬）exit=1
node src/bin/zhibi.js audit fixtures/healed-stream.jsonl; echo "exit=$?"     # 期望 讳值 10（素）exit=0
node src/bin/zhibi.js audit fixtures/hollow-stream.jsonl --excuse 'npm test'; echo "exit=$?"   # 期望 0 exit=0
node src/bin/zhibi.js audit fixtures/mixed-stream.jsonl; echo "exit=$?"      # 期望 诬带 exit=1
```

## A10/A11 的 grep 命令

```bash
# A10：他层机制词（应无输出）
grep -rn "tools/pre-execute\|alternatives\|disconfirming\|anchors\|wish\|charter\|盲捶\|悬账\|游骑\|失机\|复见\|复命\|殆值\|要籍\|越词\|涉命\|僭行\|争界\|侵入\|越分\|争写\|贰过\|省身\|溃值\|泄物\|绳账\|咎值\|结账\|尘值\|拂拭\|病灶\|医嘱\|验尺\|曲尺\|虚器\|照末\|废尺\|尾红\|枉值\|翻红窗\|绳墨" zhibi/src/ | grep -v node_modules

# A11：模型无关（应无输出）
grep -rnE "child_process|axios|openai|anthropic|completion\(|fetch\(" zhibi/src/
```

## 实测结果（实现后回填，数字一律来自本机复跑）

- `npm test`：**70 tests, 70 pass, 0 fail, 0 skipped**（core 27 + cli 18 + integration 11，集成在真实 cordis + dsh-tools 管道上运行）；
- `node src/bin/zhibi.js audit fixtures/hollow-stream.jsonl` → 讳值 30（诬）exit=1；
- `node src/bin/zhibi.js audit fixtures/healed-stream.jsonl` → 讳值 10（素）exit=0；
- `node src/bin/zhibi.js audit fixtures/excused-stream.jsonl --excuse 'npm test'` → 讳值 0（素）exit=0；
- `node src/bin/zhibi.js audit fixtures/mixed-stream.jsonl` → 讳值 70（诬）exit=1（空绿 60 + 已赎 10）；
- `node src/bin/zhibi.js block fixtures/hollow-stream.jsonl` 两跑 shasum 同值 `e5f3e3094cdf8864d3d55ecfd017a6dd7594896e`；
- A10/A11 grep 门复跑：两段均无输出。

诚实记录（实现期真实修过的三处，均不改验收标准）：

1. `shishi` 计数初版漏数直/红结算的史事（只数了讳笔与注记）——core 冒烟对账抓到，改为独立计数器；
2. 摘录初版「先截后掩」，骑缝凭据的尾部可能露出——改为掩码映射（先掩后按坐标映射截取），并新增骑缝专项用例；
3. 实录块族末一览初版输出拼音内部值（wei/zhi）——按 §8 模板锁定的汉字（讳/直）渲染。
