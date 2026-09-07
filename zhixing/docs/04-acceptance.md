# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §10 与夹具内容）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call）；对象键与工具族同全仓；径规整（`./` 前缀与尾斜杠归一）防同文件异写之诬；知面唯二（observe 族 `isError===false` ∧ 凭据径命中：显式 rules ∪ 默认知形 8〔单名形 7 basename 全等 ∪ 径前缀形 `.cursor/rules/`，`noDefaults` 关〕）；知面取文于流（result.content 缺失或空 → 化知道诚实降级 jiang 注记 0 分，不凭空捏戒）；戒形提取（11 句式：中文 7〔不要/不得/禁止/不许/切勿/不能/勿〕∪ 英文 4〔never/must not/do not/don't 大小写不敏感〕；戒体 = 句式后剥引导符、至句读〔`。；，！？;,!?.\n` 含英文句号〕或 20 字符先到；戒体词元剥首尾标点〔不含 `-` `_`〕、长 ≥2、过停用词表 41 词；戒词元 = 词元集中最长者）；行面唯三（exec 族成功切段原文 ∪ write 族成功规整径 ∪ write content——**化知戒形只咬前两处不咬 content**；`isError===true` 执行不入行面）；亲命直令不问知（bans 三处咬、musts 三处查有、exempts 宥）；缺行查有认 isError 执行；判定序锁死（宥 > 试违 > 先悖〔at 时序，at 双缺按流序轨〕 > 违知 +30/案 cap60 > 缺行 +15/条 cap30）；行值 = min(60,30×违知)+min(30,15×缺行)；分带 合 0–14/亏 15–29/悖 ≥30；门默认 30——单违知即红、单缺行黄牌；多流合审跨流合并知面与行面、时序全局比；judge 幂等（重放同流必得同判词）——core 用例 ≥ 34 且全绿，断言恰好该分值 | `npm test`（core 部分） | ✅ 43 用例全绿 |
| A2 | 夹具分数（先于实现手算定死） | 主册 `zhixing-book.json`（bans [TODO_FIXME]、musts [npm run lint, npm run build]）；副册 `zhixing-book-shier.json`（exempts [--force]、musts [npm run lint]）；副册 `zhixing-book-mixed.json`（musts [npm run build]）。`clean-stream`（主册）：4 调用、counts {zhi:1, jie:1, wei:0, que:0, shi:0, xian:0, mian:0, jiang:0}、score {total:0}、带「合」、exit 0（git push 不含 --force 不撞、两必行词皆查有）；`weizhi-stream`（无册）：2 调用、counts {zhi:1, jie:1, wei:1}、score 30、带「悖」、exit 1（装载后 --force 落地）；`qinming-stream`（主册）：4 调用、counts {zhi:0, jie:0, wei:1, que:0}、score 30、带「悖」、exit 1（write content 撞戒词 TODO_FIXME，直令不问知；lint/build 查有故无缺行）；`quexing-stream`（主册）：2 调用、counts {zhi:1, que:1}、score 15、带「亏」、exit 0（build 全流查无，黄牌不咬默认门）；`shier-stream`（副册 shier）：5 调用、counts {zhi:1, jie:2, wei:0, que:0, shi:1, xian:1, mian:1, jiang:0}、score 0、带「合」、exit 0（先悖/宥/试违三道全豁免）；`mixed-stream`（副册 mixed）：3 调用、counts {zhi:1, jie:1, wei:1, que:1}、score 45、带「悖」、exit 1（违知 30 + 缺行 15）；`laoliu-stream`（无册）：2 调用、counts {zhi:1, jie:0, jiang:1}、score 0、带「合」、exit 0（装载无 content，化知道降级沉默）；`xianliu-stream`（无册）：2 调用、counts {zhi:1, jie:1, wei:1}、score 30、带「悖」、exit 1（CLAUDE.md 默认知形、never 句式戒词元 sudo）；附加口径：`weizhi + --gate 40` → 30 过门 exit 0；`quexing + --gate 10` → 15 红 exit 1；`mixed + --gate 50` → 45 过门 exit 0；`xianliu + --no-defaults` → 知形 8 关、jie 0、score 0 带「合」exit 0；多流合审：weizhi 拆两流（仅 read + 仅 exec）合审 → wei 1、score 30、exit 1 | core 断言 + CLI 复现 | ✅ 十三条复现命令退出码与分数逐字吻合（0/30/30/15/0/45/0/30；附加 30 过门、15 红、45 过门、--no-defaults 0、合审 30）；首跑即全吻合——实现期三处实现缺陷（行面证据漏 seq 致流序轨恒 false、bin 未捕获坏输入异常 exit 1≠2、集成章程正文一句两戒词只生一戒形）全部由 core/cli/集成测试暴露后修复，未动夹具与期望 |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl` 喂 `zhixing audit`（无册）：calls 8、counts {zhi:0}、score 0、带「合」、exit 0（流内无知形装载——读的是 src/*.js 非章程，化知无从生戒）；dingfen 的 `fixtures/fenced-stream.jsonl` 喂 zhixing audit（无册）：score 0、exit 0；zhixing 的 `mixed-stream` 喂 kaocheng audit（无册）：contractless true、exit 0——同格式流跨项目可审、互不误伤 | CLI 测试 | ✅ 三流零误伤（zhizhi sample 8 调用/zhi 0/合 exit 0；dingfen fenced 合 exit 0；zhixing mixed 喂 kaocheng contractless exit 0） |
| A4 | CLI 语义 | `audit` 多流合审 + `--file` + `--gate` + `--json` + `--no-defaults`；坏 JSON 行 / 流缺失 / 未知旗标 / 坏册（坏 JSON、字段非数组、数组含非字符串、含空串）→ exit 2；`rule` 四增条旗标一个不给 → exit 2、空串 → exit 2、增条去重；`show` 无册 → exit 2；`block` 无亲命册出确定性文本（公示是供给不是门禁）；`gate --value --score` 按门判 0/1（30/门 40 过、30/门 20 红）；`--version`/`--help` 正常——CLI 用例 ≥ 14 | CLI 测试 | ✅ 17 用例全绿 |
| A5 | 合牌块逐字节确定 | 同册两次 `zhixing block` shasum 相同；增一条戒词后文本改变；无亲命册输出确定性文本（`凭册：亲命未立（知形在岗）`）；块中不含任何装载正文（result.content 原文永不入块——戒形短语与戒词原文是册面形，公示即供给本意） | CLI shasum 复现 | ✅ 逐字节一致（默认册两次 shasum 一致；增戒词后文本改变；无亲命确定性文本；块不含 content 独有长句） |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载知行插件：失败探针也无条件到达工具本体（结构性零拦截）；write 章程 + read 装载 + exec 撞戒探针 → 违知 30 门红；装载前 exec 探针 → 先悖 0 过门（真实管道无 at，按流序轨）；isError exec 撞戒探针 → 试违不入案、行面无痕；write content 撞亲命戒词探针 → 违知 30；必行词查无探针 → 缺行 15 黄牌过门、gate 翻转转红；宥词探针 → 0 过门；`exportStream()` 导出流离线 `audit` 重放，案数与行值与运行时账**账实一致**；合牌块两次渲染逐字节相同且**不含装载正文**——集成用例 ≥ 8 | 集成测试 | ✅ 9 用例全绿（账实一致；失败探针零拦截照常到达工具本体） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自检） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出（grep3 词表按 kaocheng 惯例只收前层机制词不收层名——初版词表误列「恒法」层名致插件头注释点名前层时误中，去层名后复验无输出） |
| A8 | 测试总量 | 全部用例 ≥ 60 且全绿（core + cli + 集成） | `npm test` | ✅ 69 tests, 69 pass（core 43 + cli 17 + 集成 9，0 跳过） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅（本行即 A9 验证；根 README #29 行见交付提交） |

## 复现命令

```bash
cd zhixing
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/zhixing.js audit fixtures/clean-stream.jsonl --file fixtures/zhixing-book.json; echo $?      # 0
node src/bin/zhixing.js audit fixtures/weizhi-stream.jsonl; echo $?                                        # 1
node src/bin/zhixing.js audit fixtures/qinming-stream.jsonl --file fixtures/zhixing-book.json; echo $?     # 1
node src/bin/zhixing.js audit fixtures/quexing-stream.jsonl --file fixtures/zhixing-book.json; echo $?     # 0
node src/bin/zhixing.js audit fixtures/shier-stream.jsonl --file fixtures/zhixing-book-shier.json; echo $?      # 0
node src/bin/zhixing.js audit fixtures/mixed-stream.jsonl --file fixtures/zhixing-book-mixed.json; echo $?      # 1
node src/bin/zhixing.js audit fixtures/laoliu-stream.jsonl; echo $?                                        # 0
node src/bin/zhixing.js audit fixtures/xianliu-stream.jsonl; echo $?                                       # 1
node src/bin/zhixing.js audit fixtures/weizhi-stream.jsonl --gate 40; echo $?                              # 0
node src/bin/zhixing.js audit fixtures/quexing-stream.jsonl --file fixtures/zhixing-book.json --gate 10; echo $?  # 1
node src/bin/zhixing.js audit fixtures/mixed-stream.jsonl --file fixtures/zhixing-book.json --gate 50; echo $?   # 0
node src/bin/zhixing.js audit fixtures/xianliu-stream.jsonl --no-defaults; echo $?                          # 0
node src/bin/zhixing.js audit fixtures/weizhi-read.jsonl fixtures/weizhi-exec.jsonl; echo $?                # 1（多流合审）
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；第三条为机制词防撞自检——前二十九层的机制词不得出现在本层源码）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|工据|灭据|幽物|壳物|畸物|疵物|诚值|考牌|工见未考|法值|改典|典形|宪形|章形|典册|名前缀形" src/core src/plugin
```

## 实测记录（2026-09-07，本机复跑真实输出）

- `npm test`：**69 tests, 69 pass, 0 fail, 0 skipped**（core 43 + cli 17 + 集成 9；集成挂载 npm 官方 `@deepseek-ai/cordis@4.0.2` + `@deepseek-ai/dsh-tools@0.0.1-rc.1` 真实管道）。
- A2 十三条复现命令退出码与分数逐字吻合：clean 0/合/exit 0 · weizhi 30/悖/exit 1 · qinming 30/悖/exit 1 · quexing 15/亏/exit 0 · shier 0/合/exit 0 · mixed 45/悖/exit 1 · laoliu 0/合/exit 0 · xianliu 30/悖/exit 1 · weizhi+--gate 40 30/过门/exit 0 · quexing+--gate 10 15/红/exit 1 · mixed+--gate 50 45/过门/exit 0 · xianliu+--no-defaults 0/合/exit 0 · 拆流合审 30/悖/exit 1。
- A3 跨项目：zhizhi sample 8 调用、zhi 0、0 合 exit 0；dingfen fenced 6 调用 0 合 exit 0；zhixing mixed 喂 kaocheng contractless exit 0。
- A5 合牌块：默认册两次 `block` shasum 一致；`rule --ban "git push --force"` 增条后文本改变；无亲命册块为确定性文本（含「亲命未立」）；块不含 content 独有长句（「提交前必须写测试」）。
- A7 三组 grep（模型无关 / 无 pre-execute / 机制词防撞）均无输出。
- 实现期勘误与修复如实记：定标期三勘误（先悖探针换 sudo 撞形——裁决序宥 > 先悖；夹具拆三册——qinming 共用主册则缺行 2 条计 60≠30；戒体句读集补英文句号——英文章程句号最常见缺则戒体跨句吞并，皆先于实现落盘）。实现期修三处实现缺陷（行面证据对象漏 seq 字段致流序轨恒 false——违知误立；bin 未捕获 auditStreams/parseBook 异常致坏输入 exit 1 而非 2；集成章程正文一句含两戒词只生一戒形——改两句）；两处测试自身构造错（'禁止 X' 戒体单字符不成形仍断言 jie 1；全停用词无空格粘连不成词元仍断言不成形）；grep3 词表误列「恒法」层名（按 kaocheng 惯例词表只收机制词）。A1–A9 期望与 docs/03 语义未动。
