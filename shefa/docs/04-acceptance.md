# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §10 与夹具内容）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档）；对象键与工具族同 zhizu；径规整（`./` 前缀与尾斜杠归一）防同文件异写之诬；入口滤：`isError===true` 一律不入账；落物通道唯二（write 族 p: 径命中筏形 ∪ exec 成功调用的落物词法：cp/mv 末词元、tee/touch 全部词元、重定向正则、`2>&1`/旗标/keep 弃物址过滤）；每径一案末落定基点；销案判定序锁死（舍 > 归 > 外逸 > 遗；rm 词元逐字/glob 匹配、git clean 全域、add+commit 收编、凭据时序保护——先删后写不销案）；域外判定（roots glob 优先，空则系统区词形回退）；分值 infield=min(30,15×遗)、exfield=min(60,30×外逸)、total=min(100,和)；分带 净 0–14 / 滞 15–29 / 积 ≥30；门默认 30——单外逸即红、两案域内遗即红；judge 幂等（重放同流必得同判词）——core 用例 ≥ 40 且全绿，断言恰好该分值 | `npm test`（core 部分） | ✅ 42 用例全绿 |
| A2 | 夹具分数（先于实现手算定死） | `clean-stream`：3 调用、rafts 0、cases 0、score {total:0}、带「净」、exit 0；`leftover-stream`：5 调用、rafts 3、paths 3、cases 3、score {total:60, infield:30, exfield:30}、带「积」、exit 1、counts {dropped:3, removed:0, adopted:0, exempted:0, left:2, stray:1}；`shepherded-stream`：4 调用、rafts 2、score {total:0}、带「净」、exit 0、counts {dropped:2, removed:2}；`adopted-stream`：4 调用、rafts 1、score {total:0}、带「净」、exit 0、counts {dropped:1, adopted:1}；`mixed-stream`：8 调用、rafts 4、paths 4、cases 2、score {total:45, infield:15, exfield:30}、带「积」、exit 1、counts {dropped:4, removed:1, adopted:1, left:1, stray:1}；附加口径：`leftover + --file shefa-book.json`（keep ["scratch/",".bak"] + roots 含 /tmp/**）→ 15 滞 exit 0、exempted 2；`leftover + --keep scratch/,.bak` → 30 积 exit 1、exempted 2；`leftover + --no-defaults --raft .bak` → rafts 1、15 滞 exit 0；`mixed + --gate 50` → 45 过门 exit 0 | core 断言 + CLI 复现 | ✅ 九条复现命令退出码与分数逐字吻合（0/60/0/0/45；附加口径 15 滞、30 积、15 滞 rafts 1、45 过门）；实现期零勘误——九组手算期望与实测一次全对（冒烟期修过一处装配缺陷：无册时默认形表未开箱，属实现缺陷按手算修正实现，期望未动） |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl` 喂 `shefa audit`：calls 8、rafts 0、score 0、带「净」、exit 0（exec 仅 "npm test" 无径词面、写径 src/patch.js 与 src/user.js 非筏形——手算依据已实读核验）；dingfen 的 `fixtures/fenced-stream.jsonl` 喂 `shefa audit`：calls 6、rafts 0、score 0、带「净」、exit 0——同格式流跨项目可审、互不误伤 | CLI 测试 | ✅ 双流零误伤（zhizhi sample 8 调用/0 净 exit 0；dingfen fenced 6 调用/0 净 exit 0） |
| A4 | CLI 语义 | `audit` 多流 + `--file` + `--keep/--raft/--roots`（并集语义）+ `--no-defaults` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 坏册 → exit 2；`register --keep/--raft`（全空参 → exit 2）；`revoke` 无此名 → exit 2；`list`/`block` 册缺失 → exit 2；`gate --value` 按门判 0/1；`--version`/`--help` 正常——CLI 用例 ≥ 14 | CLI 测试 | ✅ 17 用例全绿 |
| A5 | 舍牌块逐字节确定 | 同一筏册两次 `shefa block` shasum 相同；增一 keep 形后文本改变；全缺省册输出确定性文本 | CLI shasum 复现 | ✅ 逐字节一致（shasum 47b46aab…×2）；增 keep 后文本改变；全缺省空册确定性文本 |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载舍筏插件：失败探针也无条件到达工具本体（结构性零拦截）；write 筏形探针立案（域内遗）；exec cp 筏形探针立案；rm 探针销案；git add+commit 探针销案（归）；keep 在册豁免；/tmp 写探针外逸即红；`exportStream()` 导出流离线 `audit` 重放，案数与筏值与运行时账**账实一致**；gate 裁决翻转；舍牌块两次渲染逐字节相同——集成用例 ≥ 8 | 集成测试 | ✅ 9 用例全绿（账实一致 45 = 域内遗 15 + 外逸 30） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出 |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ✅ 68 tests, 68 pass（core 42 + cli 17 + 集成 9，0 跳过） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅（本行即 A9 验证；根 README #24 行见交付提交） |

## 复现命令

```bash
cd shefa
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/shefa.js audit fixtures/clean-stream.jsonl; echo $?      # 0
node src/bin/shefa.js audit fixtures/leftover-stream.jsonl; echo $?   # 1
node src/bin/shefa.js audit fixtures/shepherded-stream.jsonl; echo $? # 0
node src/bin/shefa.js audit fixtures/adopted-stream.jsonl; echo $?    # 0
node src/bin/shefa.js audit fixtures/mixed-stream.jsonl; echo $?      # 1
node src/bin/shefa.js audit fixtures/leftover-stream.jsonl --file fixtures/shefa-book.json; echo $?  # 0
node src/bin/shefa.js audit fixtures/leftover-stream.jsonl --keep scratch/,.bak; echo $?             # 1
node src/bin/shefa.js audit fixtures/leftover-stream.jsonl --no-defaults --raft .bak; echo $?        # 0
node src/bin/shefa.js audit fixtures/mixed-stream.jsonl --gate 50; echo $?                           # 0
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览" src/core src/plugin
```

## 实测记录（2026-09-07，本机复跑真实输出）

（实现完成后回填；「验收实测」数字一律以本机复跑输出为准，不预设。）
