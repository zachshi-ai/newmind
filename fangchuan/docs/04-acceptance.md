# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §11 与夹具内容）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call）；对象键与工具族同全仓；径规整（`./` 前缀与尾斜杠归一）防同文件异写之诬；码面豁免（后缀 10 + `.min.` 名形 + `__snapshots__/` 段豁免在立案前）；写面唯一（write 族 p: 径命中码面 → 文账，content 可 null）；exec 生产词法（cp/mv 末个非旗标词元、tee/touch 任一非旗标词元、重定向目标 `2>&1` 天然不中）落点命中码面 → 沙川；破坏段内不计生产；观察不是写；入口滤：`isError===true` 不入账；川册 indulge glob 免扫（逐字 ∪ 宽 glob `*` 跨目录）；湮形 6 形词法（空捕 `\{\s*\}`、空还 `\{\s*return;\s*\}`、空接 `.catch` 四写法、单行空捕 `except…: pass`、多行空捕缩进体全空、Ruby 空救）+ 导词表 12 词（空接表达式含导词即清白）；判定序锁死（沙川 > 无文 > 湮案〔逐处 +15〕> 已浚 > 净川；考末文——末笔带 content 之写；无文之改不改末文 gauge 注记）；塞值 min(60,15×湮案)、total=min(100)；分带 宣 0–14 / 淤 15–29 / 塞 ≥30；门默认 30——单湮案黄牌不咬门、两案即红；judge 幂等（重放同流必得同判词）——core 用例 ≥ 40 且全绿，断言恰好该分值 | `npm test`（core 部分） | ✅ 41 用例全绿（core：流解析 3 + 对象族 1 + 码面豁免 3 + 湮形扫描 11 + 文账引擎 9 + 塞值门禁 4 + 判定序与行序 4 + 川册 3 + 导牌 3——断言恰好该分值与形名行号） |
| A2 | 夹具分数（先于实现手算定死） | 川册夹具 `fangchuan-book.json`：indulge [`src/best-effort/*`]。`clean-stream`（带册）：3 调用（读 docs 示例、写 src/app.js 导词在场的正当处理、写 docs/guide.md 文档豁免）、counts {yan:0, jun:0, sha:0, wu:0}、score {total:0}、带「宣」、exit 0；`yancao-stream`：2 调用、counts {yan:1, jun:0, sha:0, wu:0}、score {total:15, yan:15}、带「淤」、exit 0（src/a.js 第 3 行空捕——单案黄牌点名不咬门）；`shuangyan-stream`：2 调用、counts {yan:2}、score {total:30, yan:30}、带「塞」、exit 1（src/a.js 空捕 + src/b.py 多行空捕——except Exception: 换行体 pass）；`jun-stream`：2 调用、counts {yan:0, jun:1}、score {total:0}、带「宣」、exit 0（先写吞形后改净——已浚注记，考其末文）；`shachuan-stream`：1 调用、counts {sha:1}、score {total:0}、带「宣」、exit 0（echo 重定向落 src/a.js——沙川注记）；`daozhu-stream`：2 调用、counts 全 0、score {total:0}、带「宣」、exit 0（src/h.js 导词在场清白 + src/best-effort/cleanup.js 纵列免扫）；`laoliu-stream`：2 调用、counts {yan:1}、score {total:15}、带「淤」、exit 0（写带 content 之吞形后 edit 族无文之写——末文不改，湮案照计 + 无文之改 gauge 注记）；附加口径：`shuangyan + --gate 40` → 30 过门 exit 0；`yancao + --gate 10` → 15 红 exit 1 | core 断言 + CLI 复现 | ✅ 九条复现命令退出码逐字吻合（0/0/1/0/0/0/0；附加口径 0/1）；分数与 cases 由 CLI JSON 逐字段断言（clean 0 宣 / yancao 15 淤 湮案 src/a.js:3 空捕 / shuangyan 30 塞 / jun 已浚 seq 2 / shachuan 沙川 seq 1 重定向 / daozhu 导词+纵列全零 / laoliu 湮案照计 + 无文之改 1 笔注记）；实现期修一处实现缺陷（空接的箭头表达式匹配漏 () => null / () => undefined 两写法——core 用例暴露后补全四写法）与一处实现口径（沙川每径末笔落点定基点，首笔不锁定——同全仓末笔惯例）；测试自身缺陷两处如实记（快照段豁免期望写反——目录内一切豁免、形 4 用例把换行体 pass 误作单行——夹具实为多行空捕）；A1–A9 期望未动（A2 形名勘误见勘误二） |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl` 无册喂 `fangchuan audit`：calls 8、counts {yan:0, jun:0, sha:0, wu:2}、score 0、带「宣」、exit 0（write src/patch.js 无 content + edit src/user.js 无 content——两笔 write 族无文之写，零误伤）；dingfen 的 `fixtures/fenced-stream.jsonl` 无册喂：calls 6、counts {wu:2}、exit 0（两笔 edit 族无 content）；kaocheng 的 `fixtures/mixed-stream.jsonl` 无册喂：calls 4、counts 全 0、exit 0（docs/report.md 与 out/result.json 豁免后缀、重定向 out/extra.txt 豁免后缀）——同格式流跨项目可审、互不误伤 | CLI 测试 | ✅ 三流零误伤（zhizhi sample 8 调用 wu:2 / dingfen fenced 6 调用 wu:2 / kaocheng mixed 4 调用全 0——豁免后缀挡住 md/json/txt，全宣带 exit 0） |
| A4 | CLI 语义 | `audit` 多流合审（shuangyan 拆两流合并审出 30 塞 exit 1）+ `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 未知旗标 → exit 2；`register` 缺 --path → exit 2、重复登记去重、册缺失自动建册；`revoke` 无此径 → exit 2；`list` 册缺失 → exit 2；`block` 无册出确定性文本（湮形与川册公示是供给不是门禁）；`gate --value` 按门判 0/1（29 过 / 30 红 / --gate 50 时 45 过）；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ✅ 20 用例全绿 |
| A5 | 导牌块逐字节确定 | 同一川册两次 `fangchuan block` shasum 相同；增一纵列后文本改变；无册输出确定性文本（`川册：未立（纵列无据，湮形全护）`）；块中不含命中行原文（只载径、行号、形名与判语） | CLI shasum 复现 | ✅ 逐字节一致（同册两次 shasum `a8c03fa1…`×2；增纵（vendor/*）后 `366b9b0a…` 文本改变；无册块为确定性文本「川册：未立（纵列无据，湮形全护）」；块不含命中行原文） |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载防川插件：失败探针也无条件到达工具本体（结构性零拦截）；write src 空捕探针 → 湮案 15 黄牌过门；write 双吞形（js+py）探针 → 30 塞门红；导词在场探针 → 0 过门；改净探针（写后重写）→ 已浚 0 过门；exec 重定向探针 → 沙川 0 过门；失败 write 探针（isError）不入账 → 0；川册纵列径探针 → 免扫 0；`exportStream()` 导出流离线 `audit` 重放，案数与塞值与运行时账**账实一致**；gate 裁决翻转；导牌块两次渲染逐字节相同且**不含命中行原文**——集成用例 ≥ 8 | 集成测试 | ✅ 10 用例全绿（账实一致 30 = 双吞形 js+py；失败写探针不入账；真实管道挂载 npm 官方 @deepseek-ai/cordis@4.0.2 + @deepseek-ai/dsh-tools@0.0.1-rc.1） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出（实现期 grep3 抓到三处机制词子串相撞——「改笔」「复命」「复典」分别在注释与复制自恒法的词法头注释里，改写后复验全净） |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ✅ 71 tests, 71 pass（core 41 + cli 20 + 集成 10，0 跳过） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅（本行即 A9 验证；根 README #30 行见交付提交） |

## 复现命令

```bash
cd fangchuan
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/fangchuan.js audit fixtures/clean-stream.jsonl --file fixtures/fangchuan-book.json; echo $?     # 0
node src/bin/fangchuan.js audit fixtures/yancao-stream.jsonl --file fixtures/fangchuan-book.json; echo $?    # 0（单案黄牌）
node src/bin/fangchuan.js audit fixtures/shuangyan-stream.jsonl --file fixtures/fangchuan-book.json; echo $? # 1
node src/bin/fangchuan.js audit fixtures/jun-stream.jsonl --file fixtures/fangchuan-book.json; echo $?       # 0（已浚）
node src/bin/fangchuan.js audit fixtures/shachuan-stream.jsonl --file fixtures/fangchuan-book.json; echo $?  # 0（沙川）
node src/bin/fangchuan.js audit fixtures/daozhu-stream.jsonl --file fixtures/fangchuan-book.json; echo $?    # 0（导词+纵列）
node src/bin/fangchuan.js audit fixtures/laoliu-stream.jsonl --file fixtures/fangchuan-book.json; echo $?    # 0（末文不改）
node src/bin/fangchuan.js audit fixtures/shuangyan-stream.jsonl --file fixtures/fangchuan-book.json --gate 40; echo $?  # 0
node src/bin/fangchuan.js audit fixtures/yancao-stream.jsonl --file fixtures/fangchuan-book.json --gate 10; echo $?     # 1
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；
第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|契径|工据|工见|灭据|末据|幽物|灭物|壳物|畸物|疵物|诚物|诚值|考牌|结形|域条|卷条|典形|典册|改典|复典|灭典|宪案|禁案|章案|法值|法牌|开门|知面|行面|戒形|戒体|戒词|必行词|宥词|先悖|试违|违知|行值|合牌|化知|缺行" src/core src/plugin
```

## 实测记录（2026-09-08，本机复跑真实输出）

- `npm test`：**71 tests, 71 pass, 0 fail, 0 skipped**（core 41 + cli 20 + 集成 10；集成挂载 npm 官方 `@deepseek-ai/cordis@4.0.2` + `@deepseek-ai/dsh-tools@0.0.1-rc.1` 真实管道）。
- A2 九条复现命令退出码逐字吻合：clean 0/宣/exit 0 · yancao 15/淤/exit 0 · shuangyan 30/塞/exit 1 · jun 0/宣/exit 0（已浚）· shachuan 0/宣/exit 0（沙川）· daozhu 0/宣/exit 0（导词+纵列）· laoliu 15/淤/exit 0（末文不改 + 注记）· 附加口径 shuangyan+--gate 40 过门 · yancao+--gate 10 红。
- A3 跨项目：zhizhi sample 8 调用 wu:2 / dingfen fenced 6 调用 wu:2 / kaocheng mixed 4 调用全 0，三流全宣带 exit 0。
- A5 导牌块：同册两次 `block` shasum `a8c03fa1…` 一致；增纵（vendor/*）后 `366b9b0a…` 文本改变；无册块为确定性文本。
- A7 三组 grep（模型无关 / 无 pre-execute / 机制词防撞）均无输出。
- 实现期勘误如实记：一处实现缺陷（空接箭头匹配漏 `() => null` / `() => undefined` 两写法，core 用例暴露后补全）；一处实现口径（沙川每径末笔落点定基点）；三处机制词子串相撞（「改笔」「复命」「复典」）；两处测试自身缺陷（快照段豁免期望写反、形 4 用例换行体误作单行——夹具实为多行空捕，形名勘误先行落盘）；两处定标勘误先行落盘（A3 zhizhi wu:2 实读重算、A2 形名订正）。A1–A9 期望与 docs/03 语义未动。
