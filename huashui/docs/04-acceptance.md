# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（夹具已先行落盘，行集按实际内容逐夹具核算——见 docs/03 §10）；
> 实现与测试若与手算冲突，只能改实现，不得改本表。

## 手算底稿（先于实现，行集锁死）

三卷之文（行集为 trim 去空行后的集合）：

- `V1 = {a1, b2, c3}`（const a = 1 / const b = 2 / const c = 3）
- `V2 = {a1, d4}`（去 b、c，添 d → 陈线源 {b2,c2}=2 行、新线源 {d4}）
- `V2S = {a1, c3, d4}`（只去 b，添 d → 陈线源 {b2}=1 行）
- `V3 = {a1, b2, c3, e5}`（以 V1 为底添 e、失 d）
- `V2E = {a1, d4, e5}`（clean 末笔：重读 V2 后以 V2 为底添 e）
- `W1 = {x1, y2, z3}`、`W2 = {x1, w4}`、`W3 = {x1, y2, z3, v5}`（shuangfu 第二径）

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call）；对象键与工具族同全仓；径规整防同文件异写之诬；**无默认形表**（凡 p: 径皆受审）；**文据唯二**（observe 族成功 ∧ result.content 非空 → 读据；write 族成功 ∧ args.content 非空 → 写据；content 为空只记无文之痕）；入口滤 `isError===true` 不入账（不生文据也不生无文之痕）；exec 黑盒（落盘文面不可见，不生据不生痕）；合审序（全 at 有数 → (at,流序,流内序) 稳定排序；否则参序拼接）；**三序判定**（变写=j 前最近异文写据、旧据=k=变写前最近异文文据〔读写皆可〕、行集差集陈线/新线）；判定序锁死（无文据静默 → 隔断陈改不判〔有变写看 m→j 窗、无变写看最后文据→j 窗〕→ 无变写无旧据静默 → 陈线≥2∧新线≥1 分覆世/覆己 → 陈线=1∧新线≥1 失鲜 → 保新线不罚）；等文重写不判；案前曾重读注记不改分；水册 excuse glob 免账（立案前）；陈值 shi=min(60,30×覆世)+ji=min(40,15×覆己)、total=min(100)；分带 活 0–14 / 滞 15–29 / 腐 ≥30；门默认 30——单覆世即红、双覆己即红、单覆己黄牌不咬门；judge 幂等（重放同流必得同判词）——core 用例 ≥ 30 且全绿，断言恰好该分值 | `npm test`（core 部分） | ✅ 34 用例全绿（core：流解析 4 + 对象与径规整 2 + 行集与 glob 2 + 文据通道 2 + 三序判定 11 + 陈值门禁 3 + 水册 2 + 行序与水牌 2 + 合审序 2 + 夹具全量 1 + 幂等 1 + 边界 1 + 水册序列化 1——断言恰好该分值与案名 seq） |
| A2 | 夹具分数（先于实现手算定死） | 水册夹具 `huashui-book.json`：excuse [`vendor/*`]。`clean-stream`：4 调用（读 V1、写 V2、**重读 V2**、写 V2E——陈线={b,c}∩V2E=0、新线={d}∈V2E=0）、counts {shi:0, ji:0, xian:0, gai:0}、score {total:0}、带「活」、全活 ×1、exit 0；`fuji-stream`：3 调用（读 V1、写 V2、写 V3——陈线 {b,c}=2、新线 {d}=1）、counts {ji:1}、score {total:15, ji:15}、带「滞」、exit 0（单覆己黄牌点名不咬门）；`shuangfu-stream`：6 调用两径各一案、counts {ji:2}、score {total:30, ji:30}、带「腐」、exit 1；`fushi-a + fushi-b` 两流合审：3 调用 2 会话（at 归并：A 读 V1@100 → B 写 V2@200 → A 写 V3@300——s(m)=fushi-b≠s(j)=fushi-a）、counts {shi:1}、score {total:30, shi:30}、带「腐」、exit 1；`xufu-stream`（带册）：3 调用、paths 0、counts 全 0、带「活」、exit 0（许复免账）；`xufu` 无册对照：counts {ji:1}、15、带「滞」、exit 0；`fuxian-stream`：3 调用（V1→V2S→V3——陈线 {b}=1、新线 {d}=1）、counts {xian:1}、score {total:0}、带「活」、exit 0（失鲜只点名）；`chenbi-stream`：3 调用（读 V1、edit 无文、写 V3——无变写而最后文据→j 有痕）、counts {gai:1}、score {total:0}、带「活」、exit 0；`dugrip-stream`：2 调用（写 V1、写 V2——变写前无旧据）、counts 全 0、带「活」、exit 0；`shixie-stream`：3 调用（写 V2 isError——失败之写不入账不生痕）、counts 全 0、带「活」、exit 0；`idem-stream`：2 调用（读 V1、写 V1 等文）、counts 全 0、带「活」、exit 0；附加口径：`shuangfu + --gate 40` → 30 过门 exit 0；`fuji + --gate 10` → 15 红 exit 1 | core 断言 + CLI 复现 | ✅ 十三条复现命令退出码逐字吻合（0/0/1/1/0/0/0/0/0/0/0/0/1）；分数与 cases 由 CLI JSON 逐字段断言（clean 全 0 全活 ×1 / fuji 15 滞 覆己 src/a.js seq3 覆 seq2 陈线 2 新线 1 / shuangfu 30 腐 / fushi 合审 30 腐 会话 2 / xufu 带册全 0 受审径 0 / xufu 无册 15 滞 / fuxian 0 活 失鲜 / chenbi 0 活 陈改 / dugrip·shixie·idem 全 0 全活 / shuangfu+--gate 40 过 / fuji+--gate 10 红） |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl` 无册喂 `huashui audit`：calls 8、counts 全 0、score 0、带「活」、exit 0（全流无一带文之据 → 据账空）；kaocheng 的 `fixtures/mixed-stream.jsonl` 无册喂：calls 4、counts 全 0、exit 0（report.md 单写据无对、result.json 读据不判案）；dingfen 的 `fixtures/fenced-stream.jsonl` 无册喂：calls 6、counts 全 0、exit 0（读取与 edit 皆无文）；fangchuan 的 `fixtures/yancao-stream.jsonl` 无册喂：calls 2、counts 全 0、exit 0（两径各一写据无对）；erbing 的 `fixtures/mixed-stream.jsonl` 与 `fixtures/delegated-stream.jsonl` 无册喂：各 calls 5、counts 全 0、exit 0（exec/ask/principal 无 p: 文据）——同格式流跨项目可审、互不误伤 | CLI 测试 | ✅ 六流零误伤（zhizhi sample 8 调用受审径 2〔两笔无文之写之径，全流无一带文之据〕/ kaocheng mixed 4 调用径 2〔report.md 单写据无对、result.json 读据不判案〕/ dingfen fenced 6 调用径 2〔读取与 edit 皆无文〕/ fangchuan yancao 2 调用径 2〔两径各一写据无对〕/ erbing mixed 5 与 delegated 5 调用径 0〔exec/ask/principal 无 p: 文据〕——counts 全 0、全活带 exit 0） |
| A4 | CLI 语义 | `audit` 多流合审（fushi-a+fushi-b 两文件 → 30 腐 exit 1）+ `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 未知旗标 → exit 2；`register --path` 缺 --path → exit 2、重复登记去重、册缺失自动建册；`revoke` 无此径 → exit 2；`list` 册缺失 → exit 2；`block` 无册出确定性文本（水册公示是供给不是门禁）；`gate --value` 按门判 0/1（29 过 / 30 红 / --gate 50 时 45 过）；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ✅ 22 用例全绿（A2 十一夹具逐字段断言 + 两流合审 + --file/--gate/--json + 坏行报行号/缺流/未知旗标/缺值 exit 2 + register 自动建册去重 + revoke 无此径 exit 2 + list 缺册 exit 2 + gate 29/30/--gate 50×45 + block 无册确定性文本与增许复改变 + --version/--help） |
| A5 | 水牌块逐字节确定 | 同一水册两次 `huashui block` shasum 相同；增一许复后文本改变；无册输出确定性文本（`水册：未立（凡覆皆记）`）；块中不含任何行原文（只载径、seq、行数与案别） | CLI shasum 复现 | ✅ 逐字节一致（同册两次 block shasum 全等；增许复 legacy/* 后文本改变；无册块逐字等于「水册：未立（凡覆皆记）」；行原文不进水牌见 A6 集成 9 断言） |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载画水插件：失败探针也无条件到达工具本体（结构性零拦截）；写前重读探针（读 V1 写 V2 重读 V2 写 V2E）→ 0 过门；凭陈落笔探针（读 V1 写 V2 写 V3）→ 覆己 15 滞过门；`--gate 10` 探针 → 15 红门翻；失败 write 探针（isError）不入账 → 0；许复径探针（vendor/*）→ 免账 0；edit 无文中变探针 → 陈改注记 0；`exportStream()` 导出流离线 `audit` 重放，案数与陈值与运行时账**账实一致**；水牌块两次渲染逐字节相同且**不含行原文**——集成用例 ≥ 8 | 集成测试 | ✅ 10 用例全绿（真实管道挂载 npm 官方 @deepseek-ai/cordis@4.0.2 + @deepseek-ai/dsh-tools@0.0.1-rc.1：失败探针无条件到达工具本体、写前重读白 0、覆己 15 滞过门、gate 10 翻红、失败写不入账、许复免账 0、edit 无文陈改注记 0、exportStream 重放账实一致 15、水牌两次渲染逐字节相同且不含 const b = 2 行原文、report/ledger 口径观察数含失败而据账不含） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出（grep3 累加至 chengshi 全部机制词——含「遂形|遂账|遂册|遂牌|初遂|承施|凭消|消词|命词|豁施|重决|重值|允列|段施」；实现期 grep3 抓到两处子串相撞——「末据」⊂考诚机制词〔显示词面与注释改「最近文据/最后文据」〕、插件头注释引平准句带「籍面」〔改「依赖清单」〕，改名后复验全净，判定语义与 A1–A9 期望未动） |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ✅ 66 tests, 66 pass（core 34 + cli 22 + 集成 10，0 跳过） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅（本行即 A9 验证；根 README #33 行见交付提交） |

## 复现命令

```bash
cd huashui
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/huashui.js audit fixtures/clean-stream.jsonl --file fixtures/huashui-book.json; echo $?    # 0
node src/bin/huashui.js audit fixtures/fuji-stream.jsonl --file fixtures/huashui-book.json; echo $?     # 0（单覆己黄牌）
node src/bin/huashui.js audit fixtures/shuangfu-stream.jsonl --file fixtures/huashui-book.json; echo $? # 1
node src/bin/huashui.js audit fixtures/fushi-a-stream.jsonl fixtures/fushi-b-stream.jsonl --file fixtures/huashui-book.json; echo $?  # 1（覆世唯合审可见）
node src/bin/huashui.js audit fixtures/xufu-stream.jsonl --file fixtures/huashui-book.json; echo $?     # 0（许复）
node src/bin/huashui.js audit fixtures/xufu-stream.jsonl; echo $?                                       # 0（无册对照：15 滞）
node src/bin/huashui.js audit fixtures/fuxian-stream.jsonl --file fixtures/huashui-book.json; echo $?   # 0（失鲜注记）
node src/bin/huashui.js audit fixtures/chenbi-stream.jsonl --file fixtures/huashui-book.json; echo $?   # 0（陈改不判）
node src/bin/huashui.js audit fixtures/dugrip-stream.jsonl --file fixtures/huashui-book.json; echo $?   # 0（初据无可覆）
node src/bin/huashui.js audit fixtures/shixie-stream.jsonl --file fixtures/huashui-book.json; echo $?   # 0（失败写不入账）
node src/bin/huashui.js audit fixtures/idem-stream.jsonl --file fixtures/huashui-book.json; echo $?     # 0（等文重写）
node src/bin/huashui.js audit fixtures/shuangfu-stream.jsonl --file fixtures/huashui-book.json --gate 40; echo $?  # 0
node src/bin/huashui.js audit fixtures/fuji-stream.jsonl --file fixtures/huashui-book.json --gate 10; echo $?      # 1
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；
第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码，ban 表累加 chengshi 全部
机制词；本层避开了「中变」（⊂zhengnian「命中变更」）「间写」（⊂「中间写着」）两处
散文子串占位，取「变写」）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|契径|工据|工见|灭据|末据|幽物|灭物|壳物|畸物|疵物|诚物|诚值|考牌|结形|域条|卷条|典形|典册|改典|复典|灭典|宪案|禁案|章案|法值|法牌|开门|知面|行面|戒形|戒体|戒词|必行词|宥词|先悖|试违|违知|行值|合牌|化知|缺行|湮形|空捕|空还|空接|导词|川册|塞值|导牌|文账|沙川|已浚|净川|码面|增附|去锁|越源|钩入|籍面|籍账|籍形|命籍|纳籍|准值|准牌|附名|遂形|遂账|遂键|遂册|遂牌|初遂|承施|凭消|消词|命词|豁施|重决|重值|允列|段施" src/core src/plugin
```

## 实测记录（2026-09-08，本机复跑真实输出）

- `npm test`：**66 tests, 66 pass, 0 fail, 0 skipped**（core 34 + cli 22 + 集成 10；集成挂载 npm 官方 `@deepseek-ai/cordis@4.0.2` + `@deepseek-ai/dsh-tools@0.0.1-rc.1` 真实管道）。
- A2 十三条复现命令退出码逐字吻合：clean 0/活/exit 0 · fuji 15/滞/exit 0 · shuangfu 30/腐/exit 1 · fushi 合审 30/腐/exit 1 · xufu 带册 0/活/exit 0 · xufu 无册 15/滞/exit 0 · fuxian 0/活/exit 0（失鲜）· chenbi 0/活/exit 0（陈改）· dugrip 0/活/exit 0 · shixie 0/活/exit 0 · idem 0/活/exit 0 · shuangfu+--gate 40 过门 · fuji+--gate 10 红。
- A3 跨项目六流零误伤（见 A3 格）。
- A5 水牌块：无册确定性文本逐字吻合；同册两次输出逐字节相同；增许复后文本改变。
- A7 三组 grep（模型无关 / 无 pre-execute / 机制词防撞）均无输出。
- 定标勘误：零笔——夹具先行落盘、行集手算先于 04 定稿（勘误教训前置执行）。
- 实现期缺陷两笔如实记（用例暴露后改实现，标准未动）：①seq 计数原对未入账事件亦递增（core「失败之写不占 seq」暴露）——改 seq 只数文据与无文之痕，水牌点名 seq 连续可读；②audit 对未知旗标静默跳过（cli 用例暴露）——补旗标校验，未知旗标 exit 2。
- 测试自身缺陷三笔如实记（测试侧笔误，实现口径未动）：①覆世 cap 用例把写据 content 误置 args 顶层致写据未入账；②「逐笔立案」「最近一对」两用例手算与锁死谓词不符（按 docs/03 §3.4 重算后改期望）；③block 用例误用 require（ESM）——改 import。
- 机制词防撞：机制词 16 词（画水/水牌/水册/陈值/覆世/覆己/覆案/失鲜/许复/文据/旧据/变写/陈写/陈线/新线/陈改）对全仓 ban 表双向子串零撞，且避开「中变」（⊂zhengnian「命中变更」）「间写」（⊂「中间写着」）两处散文占位；实现期 grep3 复抓两处（「末据」「籍面」）——显示词面改名，语义未动。
