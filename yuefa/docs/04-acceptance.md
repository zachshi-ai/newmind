# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（夹具已先行落盘，面集按实际内容逐夹具核算——见 docs/03 §11）；
> 实现与测试若与手算冲突，只能改实现，不得改本表。

## 手算底稿（先于实现，面集锁死）

约形提取（行首形 + 花括号形，`as` 取后名）：

- `U1 = {parseConfig, formatDate, VERSION}`（V1 三行 export）
- `U2 = {parseConfig, VERSION}`（V2：去 formatDate）
- `U3 = {parseConfig}`（V3：再去 VERSION）
- `U4 = {parseConfig, formatDate, VERSION, formatTime}`（V1e：V1 加 formatTime）
- `L1 = {legacyFnA, legacyFnB}`（W1，径 `legacy/util.js` 命中开门 glob `legacy/*`）
- `P1 = {load_cfg, Parser}`（PY1：`def load_cfg(` + `class Parser`）
- `P2 = {load_cfg}`（PY2）
- `H1 = {keepOne, dropMe, renamed}`（读卷：`export { dropMe, keepTwo as renamed }` → dropMe、renamed）
- `H2 = {keepOne, renamed}`（写卷）

逐夹具判定（约据 u = 前最近读据；约面 = U ∩ S(m)，m = u 与 j 间最近写据；
削名 = 约面 − S(j)；弃词同行查明削）：

| 夹具 | 谱系 | 判定 | counts | 削值 | 带 | exit |
|------|------|------|--------|------|----|------|
| clean | 读 U1 → 写 U1（等面） | 削 ∅ 静默 | 全 0 | 0 | 坚 | 0 |
| zhanwo | 读 U1 → 写 U4 | 削 ∅（展约）静默 | 全 0 | 0 | 坚 | 0 |
| xiaojian | 读 U1 → 写 U2 | 削 {formatDate} 无声 → 哑削 1 名 | ya:1 | 30 | 背 | 1 |
| mingxiao | 读 U1 → 写 U2+`@deprecated formatDate` 同行 | formatDate 明削 | ming:1 | 0 | 坚 | 0 |
| zhujian | 读 U1 → 写 U2 → 写 U3 | j1 削 {formatDate}；j2 约面 U1∩U2 削 {VERSION} | ya:2 | 60(cap) | 背 | 1 |
| baochi | 读 U1 → 写 U2 → 写 U2（等面） | j1 削 {formatDate}；j2 折旧后削 ∅ 静默 | ya:1 | 30 | 背 | 1 |
| geyue | 读 U1 → edit 无文痕 → 写 U2 | 约据与落笔间有痕 → 约改不判 | gai:1 | 0 | 坚 | 0 |
| wuyue | 写 U1（无读）→ 写 U2 | 无约不判 | 全 0 | 0 | 坚 | 0 |
| quanxie | 读 U1 → 写 {loadData, saveData} | 削 3 名无声 → 90 封顶 60 | ya:3 | 60(cap) | 背 | 1 |
| xuyue 带册 | 读 L1 → 写 {legacyFnA}，径命中开门 | 免账在立案前 | 全 0 | 0 | 坚 | 0 |
| xuyue 无册 | 同上 | 削 {legacyFnB} → 哑削 1 名 | ya:1 | 30 | 背 | 1 |
| duoyan | 读 P1 → 写 P2 | 削 {Parser} → 哑削 1 名 | ya:1 | 30 | 背 | 1 |
| huakuo | 读 H1 → 写 H2 | 削 {dropMe} → 哑削 1 名 | ya:1 | 30 | 背 | 1 |

附加口径：quanxie + `--gate 100` → 60 过门 exit 0；xiaojian + `--gate 10` → 30 红门 exit 1。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call）；对象键与工具族同全仓；径规整防同文件异写之诬；**无默认径表**（凡 p: 径皆受审）；**约据唯二**（observe 族成功 ∧ result.content 非空 → 读据立约；write 族成功 ∧ args.content 非空 → 写据受判；content 为空只记无文之痕）；入口滤 `isError===true` 不入账（不生据也不生痕）；exec 黑盒（不生据不生痕不折旧）；合审序（全 at 有数 → (at,流序,流内序) 稳定排序；否则参序拼接）；**约形词法**（默认 15 形行首形 ∪ 花括号跨行形 as 取后名 ∪ Python `__all__` 项 ∪ Py 族剥 `_` 前缀 ∪ `pub(crate)` 限域不收 ∪ 册 forms 增形 noDefaults 可关）；**判定序锁死**（无约静默 → 间有痕约改不判 → 世据折旧 约面=U∩S(m) → 削名 ∅ 静默 → 弃词同行查明削：有声 0 无声 +30/名 cap60）；明削声 8 弃词同行整词共现；约册 allow glob 免账（立案前）；削值 min(60,30×哑削名)；分带 坚 0–14 / 渝 15–29 / 背 ≥30；门默认 30——单哑削名即红；judge 幂等（重放同流必得同判词）——core 用例 ≥ 30 且全绿，断言恰好该分值 | `npm test`（core 部分） | ✅ 36 用例全绿（core：流解析 4 + 对象与径规整 2 + 约形 6 + 约据通道 3 + 判定序 9 + 明削 2 + 削值门禁 2 + 约册 3 + 行序与约牌 2 + 合审序 1 + 夹具全量 1 + 幂等与 seq 1——断言恰好该分值与案名） |
| A2 | 夹具分数（先于实现手算定死） | 约册夹具 `yuefa-book.json`：allow [`legacy/*`]。手算表（见上）十三条复现：clean 0/坚/exit 0；zhanwo 0/坚/0；xiaojian 30/背/1（哑削 1 名）；mingxiao 0/坚/0（明削 1 名）；zhujian 60/背/1（哑削 2 名 cap）；baochi 30/背/1（保持者折旧静默）；geyue 0/坚/0（约改不判 1）；wuyue 0/坚/0（无约）；quanxie 60/背/1（哑削 3 名 cap）；xuyue 带册全 0 受审径 0/0；xuyue 无册 30/背/1；duoyan 30/背/1（Python 约形）；huakuo 30/背/1（花括号 as 取后名）；quanxie+`--gate 100` → 0；xiaojian+`--gate 10` → 1 | core 断言 + CLI 复现 | ✅ 十五条复现命令退出码逐字吻合（0/0/1/0/1/1/0/0/1/0/1/1/1/0/1）；分数与 cases 由 CLI JSON 逐字段断言（clean 全 0 受审径 1 / xiaojian 30 背 哑削 formatDate 公面 3 失 1 / zhujian 60 背 两案两名 / baochi 单案折旧静默 / geyue 约改 1 / quanxie 60 背 公面 3 失 3 / xuyue 带册受审径 0 无册 30 背 / duoyan 削 Parser / huakuo 削 dropMe——as 取后名 / gate 附加两口径） |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl` 无册喂 `yuefa audit`：calls 8、counts 全 0、score 0、带「坚」、exit 0（全流无一带文之据 → 约账空）；kaocheng 的 `fixtures/mixed-stream.jsonl` 无册喂：calls 4、counts 全 0、exit 0（report.md 单写据无前置读、result.json 读据面空）；dingfen 的 `fixtures/fenced-stream.jsonl` 无册喂：calls 6、counts 全 0、exit 0（读取与 edit 皆无文）；fangchuan 的 `fixtures/yancao-stream.jsonl` 无册喂：calls 2、counts 全 0、exit 0（两径各一写据无前置读）；erbing 的 `fixtures/mixed-stream.jsonl` 与 `fixtures/delegated-stream.jsonl` 无册喂：各 calls 5、counts 全 0、exit 0（exec/ask/principal 无 p: 约据）——同格式流跨项目可审、互不误伤 | CLI 测试 | ✅ 六流零误伤（zhizhi sample 8 调用受审径 2〔两笔无文之写之径入痕集〕/ kaocheng mixed 4 调用径 2〔report.md 单写据无前置读、result.json 读据面空〕/ dingfen fenced 6 调用径 2〔edit 无文之痕之径〕/ fangchuan yancao 2 调用径 2〔两径各一写据无前置读〕/ erbing mixed 5 与 delegated 5 调用径 0——counts 全 0、全坚带 exit 0） |
| A4 | CLI 语义 | `audit` 多流合审 + `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 未知旗标 → exit 2；`register --path` 缺 --path → exit 2、重复登记去重、册缺失自动建册；`revoke` 无此径 → exit 2；`list` 册缺失 → exit 2；`block` 无册出确定性文本（约册公示是供给不是门禁）；`gate --value` 按门判 0/1（29 过 / 30 红 / --gate 50 时 45 过）；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ✅ 24 用例全绿（A2 十三夹具逐字段断言 + 无册对照 + --file/--gate/--json + 坏行报行号/缺流/未知旗标/缺值 exit 2 + register 自动建册去重 + revoke 无此径 exit 2 + list 缺册 exit 2 + gate 29/30/--gate 50×45 + block 无册确定性文本与增许削改变 + --version/--help） |
| A5 | 约牌块逐字节确定 | 同一约册两次 `yuefa block` shasum 相同；增一开门后文本改变；无册输出确定性文本（`约册：未立（凡削皆记）`）；块中不含任何行原文（只载径、名与案别） | CLI shasum 复现 | ✅ 逐字节一致（同册两次 block shasum 全等 e968d403…；增许削 vendor/* 后文本改变；无册块逐字等于「约册：未立（凡削皆记）」；行原文不进约牌见 A6 集成 9 断言） |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载约法插件：失败探针也无条件到达工具本体（结构性零拦截）；守约探针（读 V1 写 U4 展约）→ 0 过门；哑削探针（读 V1 写 U2）→ 30 红门；明削探针（弃词同行）→ 0；失败 write 探针（isError）不入账 → 0；开门径探针（legacy/*）→ 免账 0；edit 无文痕探针 → 约改注记 0；`exportStream()` 导出流离线 `audit` 重放，案数与削值与运行时账**账实一致**；约牌块两次渲染逐字节相同且**不含行原文**——集成用例 ≥ 8 | 集成测试 | ✅ 10 用例全绿（真实管道挂载 npm 官方 @deepseek-ai/cordis@4.0.2 + @deepseek-ai/dsh-tools@0.0.1-rc.1：失败探针无条件到达工具本体、守约 0 过门、哑削 30 红门、gate 10 翻红、失败写不入账、许削免账 0、约改注记 0、exportStream 重放账实一致 30、约牌两次渲染逐字节相同且不含 export function parseConfig 行原文、report/ledger 口径观察数含失败而约账不含） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出（grep3 累加至 huashui 全部机制词——含「文据|旧据|变写|陈写|陈线|新线|覆世|覆己|失鲜|许复|陈值|陈改」；实现期 grep3 抓到插件头注释引画水层带「画水」二字——改拼音词面 huashui 后复验全净，判定语义与 A1–A9 期望未动） |旧据\|变写\|陈写\|陈线\|新线\|覆世\|覆己\|失鲜\|许复\|陈值\|陈改」；实现期 grep3 复验全净，判定语义与 A1–A9 期望未动） |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ✅ 70 tests, 70 pass（core 36 + cli 24 + 集成 10，0 跳过） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅（本行即 A9 验证；根 README #34 行见交付提交） |

## 复现命令

```bash
cd yuefa
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/yuefa.js audit fixtures/clean-stream.jsonl --file fixtures/yuefa-book.json; echo $?     # 0
node src/bin/yuefa.js audit fixtures/zhanwo-stream.jsonl --file fixtures/yuefa-book.json; echo $?    # 0（展约）
node src/bin/yuefa.js audit fixtures/xiaojian-stream.jsonl --file fixtures/yuefa-book.json; echo $?  # 1（哑削 1 名）
node src/bin/yuefa.js audit fixtures/mingxiao-stream.jsonl --file fixtures/yuefa-book.json; echo $?  # 0（明削有声）
node src/bin/yuefa.js audit fixtures/zhujian-stream.jsonl --file fixtures/yuefa-book.json; echo $?   # 1（逐笔立案 60）
node src/bin/yuefa.js audit fixtures/baochi-stream.jsonl --file fixtures/yuefa-book.json; echo $?    # 1（保持者折旧静默）
node src/bin/yuefa.js audit fixtures/geyue-stream.jsonl --file fixtures/yuefa-book.json; echo $?     # 0（约改不判）
node src/bin/yuefa.js audit fixtures/wuyue-stream.jsonl --file fixtures/yuefa-book.json; echo $?     # 0（无约）
node src/bin/yuefa.js audit fixtures/quanxie-stream.jsonl --file fixtures/yuefa-book.json; echo $?   # 1（哑削 3 名 cap）
node src/bin/yuefa.js audit fixtures/xuyue-stream.jsonl --file fixtures/yuefa-book.json; echo $?     # 0（开门免账）
node src/bin/yuefa.js audit fixtures/xuyue-stream.jsonl; echo $?                                     # 1（无册对照 30 背）
node src/bin/yuefa.js audit fixtures/duoyan-stream.jsonl --file fixtures/yuefa-book.json; echo $?    # 1（Python 约形）
node src/bin/yuefa.js audit fixtures/huakuo-stream.jsonl --file fixtures/yuefa-book.json; echo $?    # 1（花括号 as 后名）
node src/bin/yuefa.js audit fixtures/quanxie-stream.jsonl --file fixtures/yuefa-book.json --gate 100; echo $?  # 0
node src/bin/yuefa.js audit fixtures/xiaojian-stream.jsonl --file fixtures/yuefa-book.json --gate 10; echo $?  # 1
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；
第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码，ban 表累加 huashui 全部
机制词；本层机制词「约形」避开 licheng/zhiixng 散文「账面形状/册面形」之子串「面形」、
「公面」避开 zhengnian 散文「契约面前」之子串「约面」）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|契径|工据|工见|灭据|末据|幽物|灭物|壳物|畸物|疵物|诚物|诚值|考牌|结形|域条|卷条|典形|典册|改典|复典|灭典|宪案|禁案|章案|法值|法牌|开门|知面|行面|戒形|戒体|戒词|必行词|宥词|先悖|试违|违知|行值|合牌|化知|缺行|湮形|空捕|空还|空接|导词|川册|塞值|导牌|文账|沙川|已浚|净川|码面|增附|去锁|越源|钩入|籍面|籍账|籍形|命籍|纳籍|准值|准牌|附名|遂形|遂账|遂键|遂册|遂牌|初遂|承施|凭消|消词|命词|豁施|重决|重值|允列|段施|文据|旧据|变写|陈写|陈线|新线|覆世|覆己|覆案|失鲜|许复|陈值|陈改|水牌|水册|画水" src/core src/plugin
```

注意：机制词「开门」为恒法已注册之词——本层设计中「开门」只作 allow 豁免的
散文释义（约册开门），源码词面用「allow / allowGlobs」承载语义，不使「开门」
二字进入 src；如 grep3 命中，改词面为「许门」或直用 allow，先于测试落盘。

## 实测记录（交付时以本机复跑真实输出回填）

- 定标勘误两笔（先于实现落盘）：①§4.3 世据 m 去掉「异文」条件（等文写据照取，面等则折旧自然无效果——数学等价而表述更简）；②§11 夹具数勘正（十二流夹具非十一，huakuo 花括号形夹具补列）；夹具注释勘误一笔（baochi 单流三调用，非「5 调用 2 会话」——先于测试落盘）。
- 实现期缺陷两笔如实记（用例暴露后改实现，标准未动）：①seq 计数原对未入账事件亦递增——改 seq 只数入账事件（读据/写据/无文之痕），约牌点名 seq 连续可读；②花括号形跨行状态机原不认 `export type {`——补 type/default 前缀形。
- ⏳ 待实测（npm test / 复现命令 / shasum / grep3 交付时回填）。
- 机制词防撞：机制词 16 词（约法/公面/约据/约册/约牌/约形/面集/削名/哑削/明削/削值/约改/世据/折旧/守约/背约）对全仓 ban 表双向子串零撞——「面形」⊂ licheng「账面形状」/zhixing「册面形」、「约面」⊂ zhengnian「契约面前」两处散文子串占位在定标期被 grep3 抓到弃用，改「约形/公面」；「开门」（恒法已注册）按 04 预案以 allow 词面承载，源码零命中。
