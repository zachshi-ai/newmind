# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（夹具已先行落盘，状键与作工面按实际内容逐夹具核算——见 docs/03 §12）；
> 实现与测试若与手算冲突，只能改实现，不得改本表。

## 手算底稿（先于实现，作工面与状键锁死）

作工面 = exec 命令原文（成败皆入）∪ write 规整径 ∪ observe 规整径（**不含正文**）。

各流作工面：

- `clean / xugong / weixuan / daixian`：`{src/a.js, npm test}`
- `yinbai`：`{src/a.js, npm test}`
- `shuangxu`：`{src/a.js, npm test}`
- `duoshu`：`{src/a.js, npm test}`
- `shibai`：`{npm install left-pad（isError=true 亦入——试错也是始）, src/a.js, npm test}`
- `zonghe`：`{src/a.js, npm test}`

逐夹具判定（状面形：HANDOFF.md 全等 ∪ 名含 handoff ∪ /handoff/ 段 ∪ 名含交接；
声明行按判定序：exempt 径免 → 引词掠据 0 → 状键任一词元命中作工面有据 0 →
全查无虚功 +30 → 无键注记 0）：

| 夹具 | 状面 | 声明行对账 | counts | 虎值 | 带 | exit |
|------|------|-----------|--------|------|----|------|
| clean | HANDOFF.md | 修复 src/a.js→径命中；npm test→exec 原文命中；`[ ]` 未勾非状 | 全 0 | 0 | 真 | 0 |
| xugong | HANDOFF.md | src/a.js 有据；src/b.js/空指针全查无 → 虚功 1 | xu:1 | 30 | 虎 | 1 |
| yinbai | HANDOFF.md | 上游会话已完成 docs 迁移→掠据；src/a.js 有据 | lue:1 | 0 | 真 | 0 |
| weixuan | HANDOFF.md | `[ ]` 未勾非状；「将完成」不中状词 | 全 0 | 0 | 真 | 0 |
| shuangxu | HANDOFF.md | src/b.js、src/c.js 双虚 | xu:2 | 60(cap) | 虎 | 1 |
| daixian 带册 | archive/HANDOFF.md | exempt 命中立案前免账 | 全 0 | 0 | 真 | 0 |
| daixian 无册 | 同上 | src/b.js 虚功 1 | xu:1 | 30 | 虎 | 1 |
| duoshu | docs/HANDOFF.md + handoff-notes.md | 各 1 虚（src/b.js、src/d.js） | xu:2 | 60(cap) | 虎 | 1 |
| shibai | HANDOFF.md | 安装 left-pad→词元 left-pad 命中失败 exec（试错也是始）有据；src/b.js 虚功 | xu:1 | 30 | 虎 | 1 |
| zonghe | HANDOFF.md | src/a.js 有据；上游掠据；src/b.js 虚功；「已完成」剥后无词元无键 | xu:1·lue:1·wu:1 | 30 | 虎 | 1 |

附加口径：shuangxu + `--gate 100` → 60 过门 exit 0；xugong + `--gate 10` → 30 红门 exit 1。

A3 跨项目六流预期：zhizhi sample（两笔无文之写 → 状账空，受审状面 0）、
kaocheng mixed（report.md 不中状面形）、dingfen fenced（edit 皆无文）、
fangchuan yancao（两径不中状面形）、erbing mixed/delegated（无带文之写）——
counts 全 0、受审状面 0、全真带 exit 0（实读核验后如受审状面 >0 须逐径说明
为何不构成误伤）。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call）；对象键与工具族同全仓；径规整同全仓；**状面唯写**（write 族成功 ∧ content 非空 ∧ 径命中状面形 → 状面入账；观察不入账；isError 不入账；无文之写不入账）；**作工面**（本会话 exec 命令原文成败皆入 ∪ write/observe 规整径——不含正文，失败亦入=试错也是始；other 黑盒不入；按会话分账）；**状面形默认表 5**（HANDOFF.md/handoff.md 全等 ∪ 名含 handoff ∪ /handoff/ 径段 ∪ 名含「交接」∪ 册 shapes 增形 noDefaults 可关）；**状形**（勾选形 `[x]/[X]` 行首 ∪ 中文状词 11 ∪ 英文状词 4 ∪ 里程碑形 ∪ 旗标形；未勾选与将来时不中）；**判定序锁死**（exempt 径免 → 引词掠据 0 → 状键任一词元命中有据 0 → 全查无虚功 +30/条 cap60 → 无键注记 0）；状键（径形词元保形 + Unicode 词元 ≥2，停用词表 16 剥离，大小写归一子串）；状册 exempt glob + shapes（无册=全账）；虎值 min(60,30×虚功条)；分带 真 0–14/疑 15–29/虎 ≥30；门默认 30——单虚功条即红；judge 幂等（重放同流必得同判词）——core 用例 ≥ 30 且全绿，断言恰好该分值与案名 | `npm test`（core 部分） | ⏳ 定标待实测 |
| A2 | 夹具分数（先于实现手算定死） | 状册夹具 `shihu-book.json`：exempt [`archive/*`]。手算表（见上）十二条复现：clean 0/真/exit 0；xugong 30/虎/1；yinbai 0/真/0（掠据 1）；weixuan 0/真/0；shuangxu 60/虎/1；daixian 带册 0/真/0 受审状面 0；daixian 无册 30/虎/1；duoshu 60/虎/1；shibai 30/虎/1（失败 exec 亦入作工面）；zonghe 30/虎/1（虚功 1·掠据 1·无键 1）；shuangxu+`--gate 100` → 0；xugong+`--gate 10` → 1 | core 断言 + CLI 复现 | ⏳ 定标待实测 |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl`、kaocheng 的 `fixtures/mixed-stream.jsonl`、dingfen 的 `fixtures/fenced-stream.jsonl`、fangchuan 的 `fixtures/yancao-stream.jsonl`、erbing 的 `fixtures/mixed-stream.jsonl` 与 `fixtures/delegated-stream.jsonl` 无册喂 `shihu audit`：counts 全 0、带「真」、exit 0——同格式流跨项目可审、互不误伤（受审状面按实际流核算并说明） | CLI 测试 | ⏳ 定标待实测 |
| A4 | CLI 语义 | `audit` 多流合审 + `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 未知旗标 → exit 2；`register --path` 缺 --path → exit 2、重复登记去重、册缺失自动建册；`revoke` 无此径 → exit 2；`list` 缺册 → exit 2；`block` 无册出确定性文本（状册公示是供给不是门禁）；`gate --value` 按门判 0/1（29 过 / 30 红 / --gate 50 时 45 过）；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ⏳ 定标待实测 |
| A5 | 状牌块逐字节确定 | 同一状册两次 `shihu block` shasum 相同；增一豁免后文本改变；无册输出确定性文本（`状册：未立（凡状皆对）`）；块中不含任何行原文（只载径、行号与状键） | CLI shasum 复现 | ⏳ 定标待实测 |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载市虎插件：失败探针也无条件到达工具本体（结构性零拦截）；守状探针（声明对象有作工）→ 0 过门；虚功探针（声明对象查无）→ 30 红门；`--gate 10` 探针 → 30 红门翻；掠据探针（引用署名）→ 0；失败 exec 探针 → 仍入作工面（有据）；exempt 径探针 → 免账 0；`exportStream()` 导出流离线 `audit` 重放，案数与虎值与运行时账**账实一致**；状牌块两次渲染逐字节相同且**不含行原文**——集成用例 ≥ 8 | 集成测试 | ⏳ 定标待实测 |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证；ban 表累加至 saowu 全部机制词） | grep（下附命令，应无输出） | ⏳ 定标待实测 |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ⏳ 定标待实测 |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅（本行即 A9 验证；根 README #36 行见交付提交） |

## 复现命令

```bash
cd shihu
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/shihu.js audit fixtures/clean-stream.jsonl --file fixtures/shihu-book.json; echo $?    # 0
node src/bin/shihu.js audit fixtures/xugong-stream.jsonl --file fixtures/shihu-book.json; echo $?   # 1（虚功 1）
node src/bin/shihu.js audit fixtures/yinbai-stream.jsonl --file fixtures/shihu-book.json; echo $?   # 0（掠据）
node src/bin/shihu.js audit fixtures/weixuan-stream.jsonl --file fixtures/shihu-book.json; echo $?  # 0（非状）
node src/bin/shihu.js audit fixtures/shuangxu-stream.jsonl --file fixtures/shihu-book.json; echo $? # 1（双虚 60）
node src/bin/shihu.js audit fixtures/daixian-stream.jsonl --file fixtures/shihu-book.json; echo $?  # 0（带册免账）
node src/bin/shihu.js audit fixtures/daixian-stream.jsonl; echo $?                                  # 1（无册对照 30）
node src/bin/shihu.js audit fixtures/duoshu-stream.jsonl --file fixtures/shihu-book.json; echo $?   # 1（两状面各一虚）
node src/bin/shihu.js audit fixtures/shibai-stream.jsonl --file fixtures/shihu-book.json; echo $?   # 1（失败 exec 亦入作工面）
node src/bin/shihu.js audit fixtures/zonghe-stream.jsonl --file fixtures/shihu-book.json; echo $?   # 1（虚功+掠据+无键）
node src/bin/shihu.js audit fixtures/shuangxu-stream.jsonl --file fixtures/shihu-book.json --gate 100; echo $?  # 0
node src/bin/shihu.js audit fixtures/xugong-stream.jsonl --file fixtures/shihu-book.json --gate 10; echo $?     # 1
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；
第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码，ban 表累加 saowu 全部
机制词；本层机制词 9 词〔市虎/状面/状形/状键/虚功/状册/状牌/成虎/引白〕定标期对全仓
ban 表双向子串零撞）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|契径|工据|工见|灭据|末据|幽物|灭物|壳物|畸物|疵物|诚物|诚值|考牌|结形|域条|卷条|典形|典册|改典|复典|灭典|宪案|禁案|章案|法值|法牌|开门|知面|行面|戒形|戒体|戒词|必行词|宥词|先悖|试违|违知|行值|合牌|化知|缺行|湮形|空捕|空还|空接|导词|川册|塞值|导牌|文账|沙川|已浚|净川|码面|增附|去锁|越源|钩入|籍面|籍账|籍形|命籍|纳籍|准值|准牌|附名|遂形|遂账|遂键|遂册|遂牌|初遂|承施|凭消|消词|命词|豁施|重决|重值|允列|段施|文据|旧据|变写|陈写|陈线|新线|覆世|覆己|覆案|失鲜|许复|陈值|陈改|水牌|水册|画水|约法|公面|约据|约册|约牌|约形|面集|削名|哑削|明削|削值|约改|世据|折旧|守约|背约|帚账|帚牌|帚值|垢形|垢值|垢门|针形|屑两路|末卷|试验场|留册" src/core src/plugin
```

注意：ban 表已按 saowu/src 实际源码复核补正（帚牌/帚值/针形/屑两路——先于实现落盘）。

## 实测记录（交付时以本机复跑真实输出回填）

- 定标期说明一笔：本层定标前重查 git log 实锤并发会话已交付 saowu #35（调试残迹治理）——
  本层编号自 #35 改 #36（能力类型序号顺延为第三十七个），方向与 saowu 正交（一码一文）。
- ⏳ 待实测（npm test / 复现命令 / shasum / grep3 交付时回填）。
