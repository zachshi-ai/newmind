# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（夹具定义即手算对象，诊面形/归因形/验因三通道按
> docs/03 词法逐夹具核算；A3 外部夹具已逐一实读原文核对）；实现与测试若与手算冲突，只能
> 改实现，不得改本表。

## 手算底稿（先于实现，逐夹具锁死）

- `clean`：write docs/postmortem.md「服务已恢复，监控告警已解除，交接完毕。」
  ——无归因形（「恢复/解除」不在表）→ counts 全 0、受审稿 1、臆值 0、带「澈」、exit 0；
- `yiduan`：write docs/postmortem.md「根因是缓存过期导致的数据不一致。」
  （归因形「根因」+ 因面词元〔CJK bigram 缓存/存过/过期…〕，推词无，三通道全无）→
  **臆断 1**、min(60,30)=30、带「臆」、exit 1（单臆断即红）；
- `xianyi`：write docs/postmortem.md「根因可能是缓存过期。」——归因形「根因」+
  推词「可能」→ **显疑注记 1**、0、澈、exit 0；
- `kanyan`：observe logs/app.log 成功（正文含「缓存」）后 write 归因稿 → 勘验在先 →
  **望断 1**、min(40,15)=15、带「望」、exit 0（单望断黄牌不咬门）；`--gate 10` →
  15 红 exit 1；
- `bayan`：observe config.json 成功（正文 cache_ttl=60）→ write src/cache.js
  （径含 cache）→ exec 成功「node src/cache.js --verify」（命令含 cache）→
  write 归因稿「The root cause is a stale cache entry.」→ 拔验成对在先（动过因
  j=1 ∧ 其后验过果 k=2）→ 全 0、澈、exit 0（4 调用）；
- `chiyan`：write 归因稿在前（i=0），write src/cache.js + exec 成功在后 → 拔验
  全在后 → **迟验注记 1**、0、澈、exit 0（3 调用）；
- `fanyin`：write docs/postmortem.md「根因如下，详见排查一节。」——因面前缀
  「如下」命中指代形 → **泛因注记 1**、0、澈、exit 0；
- `shibai`：read src/cache.json **isError:true**（404）后 write 归因稿 → 失败之
  见不生勘验 → **臆断 1**、30、臆、exit 1；
- `mianze`（带册 excuse [reports/internal/*]）：write
  reports/internal/root-cause-analysis.md「Root cause is queue backpressure.」
  → 免审 → paths 0、全 0、澈、exit 0；**无册对照**：同稿受审（root-cause 诊面
  形命中）→ **臆断 1**、30、臆、exit 1；
- `yanma`：write tests/postmortem.spec.md（content 含归因行）→ 演域名段豁免 →
  paths 0、全 0、澈、exit 0；
- `zhenmian`：write README.md「The root cause is a stale cache entry.」——
  诊面门不过（readme 无诊面形）→ 不审不记 → paths 0、counts 全 0、澈、exit 0；
- `yingwen`：write docs/postmortem.md「The root cause is a race condition in
  the connection pool.」→ 英文归因形 root cause + 因面词元〔race, condition,
  connection, pool〕，三通道全无 → **臆断 1**、30、臆、exit 1；
- `baishi`：isError:true 之写（归因稿）不入断账 → counts 全 0、paths 0、澈、
  exit 0；
- `shuangdao`：exec×2（isError:true，content「Error: cache timeout after
  30s」——命令含 cache、果词 Error/timeout）+ observe logs/app.log 成功
  （正文 cache miss storm）后 write 归因稿「The root cause is a stale cache
  entry.」→ 重演 ≥2 笔 ✓ ∧ 勘验 ✓——**望断 1**（重演勘验同在只立一案从重
  不叠）、15、望、exit 0；
- `mogao`：write docs/postmortem.md 归因稿后同径重写净稿「问题已定位，修复
  已上线，监控回归正常。」→ 新稿立撤判净稿 → counts 全 0、paths 1、澈、
  exit 0；
- 合审 `hejian`（a 流 at100 observe cache_ttl + at200 write src/cache.js +
  at300 exec 成功；b 流 at400 归因稿）→ 拔验跨会话在先清白、4 调用 2 会话、
  全 0、澈、exit 0；合审 `hechi`（a 流 at100 归因稿 + b 流 at200 write +
  at300 exec）→ 拔验在后 → 迟验注记 1、0、澈、exit 0；
- 附加口径：`yiduan + --gate 40` → 30 过门 exit 0；`kanyan + --gate 10` →
  15 红 exit 1。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call、非 tool_call/result 事件忽略）；对象键与工具族同全仓；径规整；**断账收全流、判言只判诊面之写**（write 族 p: ∧ `isError !== true` ∧ content 非空 ∧ 规整径小写化命中诊面形 14；isError===true 不入稿账、null 按已发生；诊面外之稿不审不记）；**归因形**（中文前向 12 子串 ∪ 英文前向 9 词界，行级，一行只取首形）；**因面词元化**（ASCII 路剥尾点/停词 26/纯数字/短词 + CJK 路非汉字切段段内 bigram）；**指代前缀泛因**（指代形 6 开头即泛因注记；词元集为空同泛因）；**推词门**（中文 12 ∪ 英文 12 行级降档显疑注记）；**果词表**（英文 9 词界 ∪ 中文 6 子串）；**验因三通道**（拔验：先于本笔成功 write 径或 content 命中任一词元 ∧ 其后成功 exec 命令原文或结果 content 命中任一词元；重演：exec 成败皆算，命令原文或结果 content 同笔共现词元 ∧ 果词 ≥2 笔；勘验：成功 observe 正文 ∪ 成功 exec 命令或结果命中任一词元；失败之见永不生勘验/拔验）；**判定序锁死**（立案前豁免〔臆册 excuse ∪ 演域 13 名段〕→ 诊面门 → 逐行〔归因形 → 推词门 → 指代/泛因 → 拔验清白 / 迟验注记〔勘验重演在后不采——望不洗臆〕/ 望断 / 臆断〕；行=案、一行一形一案）；臆值 yi=min(60,30×yd)+wang=min(40,15×wd)、total=min(100)；分带 澈 0–14 / 望 15–29 / 臆 ≥30；门默认 30——单臆断即红、双望断即红、单望断黄牌不咬门；judge 幂等——core 用例 ≥ 30 且全绿，断言恰好该分值与案名行号 | `npm test`（core 部分） | ✅ 35 用例全绿（core：流解析 1 + 对象与径规整 1 + 诊面形 1 + 归因形中文 1 + 归因形英文 1 + 推词门 1 + 指代前缀 1 + 词元化 1 + 拔验 1 + 重演 1 + 勘验 1 + 望不叠 1 + 迟验 1 + 失败不生据 1 + 演域 1 + 臆册 1 + 诊面门 1 + 败写 1 + 判定序与排序 1 + 行案独立 1 + 臆值门禁 1 + 末稿立撤 1 + judge 幂等 1 + 合审序 1 + 掩码 1 + 夹具全量·一 1 + 夹具全量·二 1 + 夹具全量·三 1 + 跨项目互认 1 + 门禁翻转 1 + bigram 标点切段 1 + 英文词界 1 + 首形一行一案 1 + 复合句推词降档 1 + 老流 null 1——断言恰好该分值与案名行号） |
| A2 | 夹具分数（先于实现手算定死） | 册夹具 `suliu-book.json`：excuse [`reports/internal/*`]。`clean-stream`：1 调用、counts 全 0、臆值 0、澈、exit 0；`yiduan-stream`：臆断 1、30、臆、exit 1；`xianyi-stream`：显疑 1（xy=1）、0、澈、exit 0；`kanyan-stream`：2 调用 → 望断 1（wd=1）、15、望、exit 0；`bayan-stream`：4 调用 → 全 0、澈、exit 0；`chiyan-stream`：3 调用 → 迟验 1（cy=1）、0、澈、exit 0；`fanyin-stream`：泛因 1（fy=1）、0、澈、exit 0；`shibai-stream`：2 调用 → 臆断 1、30、臆、exit 1；`mianze-stream` 带册：paths 0、全 0、澈、exit 0；mianze 无册对照：臆断 1、30、臆、exit 1；`yanma-stream`：演域豁免、paths 0、全 0、澈、exit 0；`zhenmian-stream`：诊面门、paths 0、counts 全 0、澈、exit 0；`yingwen-stream`：臆断 1、30、臆、exit 1；`baishi-stream`：counts 全 0、paths 0、澈、exit 0；`shuangdao-stream`：4 调用 → 望断 1（不叠）、15、望、exit 0；`mogao-stream`：2 调用 → counts 全 0、paths 1、澈、exit 0；合审 `hejian-a + hejian-b`：4 调用 2 会话 → 全 0、澈、exit 0；合审 `hechi-a + hechi-b`：迟验 1、0、澈、exit 0；附加口径：`yiduan + --gate 40` → 30 过门 exit 0；`kanyan + --gate 10` → 15 红 exit 1 | core 断言 + CLI 复现 | ✅ 二十条复现命令退出码逐字吻合（0/1/0/0/0/0/0/1/0/1/0/0/1/0/0/0/0/0 + gate 40 过 0、gate 10 红 1）；分数与 counts 由 CLI 输出与 core 断言逐字段核对（clean 全 0 澈 / yiduan 臆断 30 臆 / xianyi 显疑 xy=1 / kanyan 望断 15 望 / bayan 拔验 4 调用 / chiyan 迟验 cy=1 / fanyin 泛因 fy=1 / shibai 败见臆断 / mianze 带册彰无册红 / yanma 演域 paths 0 / zhenmian 诊面门 paths 0 / yingwen 英文 30 红 / baishi 败写 paths 0 / shuangdao 望断不叠 15 / mogao 新稿立撤 paths 1 / hejian 拔验跨会话 / hechi 迟验） |
| A3 | 跨项目互认（外部夹具已实读核对：七流的 write 稿径皆不命中诊面形 14——非诊断文书不入断账，counts 全 0） | zhizhi 的 `fixtures/sample-stream.jsonl`：calls 8、counts 全 0、澈、exit 0；kaocheng 的 `fixtures/mixed-stream.jsonl`：calls 4、counts 全 0；dingfen 的 `fixtures/fenced-stream.jsonl`：calls 6、counts 全 0；erbing 的 `fixtures/mixed-stream.jsonl` 与 `fixtures/delegated-stream.jsonl`：各 calls 5、counts 全 0；huashui 的 `fixtures/fuji-stream.jsonl`：calls 3、counts 全 0；jiaotuo 的 `fixtures/weizhao-stream.jsonl`：calls 2、counts 全 0（同格式流跨项目可审、互不误伤） | CLI 测试 | ✅ 七流零误伤（zhizhi sample 8 调用 / kaocheng mixed 4 调用 / dingfen fenced 6 调用 / erbing mixed 5 与 delegated 5 调用 / huashui fuji 3 调用 / jiaotuo weizhao 2 调用——counts 全 0、全澈带 exit 0；core 与 CLI 双路核验） |
| A4 | CLI 语义 | `audit` 多流合审 + `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 未知旗标 / 缺值 → exit 2；`register --path` 缺 --path → exit 2、重复登记去重、册缺失自动建册；`revoke` 无此径 → exit 2；`list` 册缺失 → exit 2；`block` 无册出确定性文本（臆册公示是供给不是门禁）；`gate --value` 按门判 0/1（29 过 / 30 红 / --gate 50 时 45 过）；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ✅ 17 用例全绿（A2 复现逐条断言 + 坏行报行号/缺流/未知旗标/--gate 缺值 exit 2 + register 缺 --path exit 2、自动建册去重、register 后 audit 免案生效 + revoke 无此径 exit 2 + list 缺册 exit 2 + block 无册确定性文本与增免案改变 + block shasum 双跑一致 + gate 29/30/--gate 50×45 + gate 缺值 exit 2 + --version/--help + 跨项目七流 CLI 复验） |
| A5 | 溯牌块逐字节确定 | 同一臆册两次 `suliu block` shasum 相同；增一免案后文本改变；无册输出确定性文本（`臆册：未立（凡因必验）`）；块中不含行原文与因面原文（只载 诊径:行:案别:指纹——djb2 指纹与笔序，因面词元是行内内容切片不进块） | CLI shasum 复现 | ✅ 逐字节一致（同册两次 block shasum 全等；增免案 reports/internal/* 后文本改变；无册块逐字含「臆册：未立（凡因必验）」；行原文与因面原文不进溯牌见 core 掩码用例与集成断言） |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载溯流插件：失败探针也无条件到达工具本体（结构性零拦截）；净稿探针 → 0 过门；单臆断探针 → 30 臆门红；显疑探针 → 0 过门；勘验望断探针 → 15 过门（黄牌不咬门）；拔验探针 → 0 过门；迟验探针 → 0 过门；演域探针 → 0；臆册免案探针 → 0；失败 write 探针不入断账；`exportStream()` 导出流离线 `audit` 重放账实一致；gate 翻转 + 溯牌块两次渲染逐字节相同且不含行原文与因面原文——集成用例 ≥ 10 | 集成测试 | ✅ 14 用例全绿（真实管道挂载 npm 官方 @deepseek-ai/cordis@4.0.2 + @deepseek-ai/dsh-tools@0.0.1-rc.1：失败探针无条件到达工具本体、净稿 0 澈、单臆断 30 臆红、显疑 0、勘验望断 15 望过门、拔验 0、迟验 0、演域 0、臆册免案 0、失败写不入断账、exportStream 重放账实一致 30、溯牌两次渲染逐字节相同且不含行原文与因面原文、gate 10 翻转 + report/ledger 口径、新稿立撤 0 过门） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证，ban 表累加至 chachu 全部机制词） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出（grep3 覆盖 270+ 词含 chachu 全部机制词；机制词 20 词对全仓 ban 表双向子串零撞）；实现期注释防撞修正一笔（「证牌」chachu 占取「溯牌」；「传账」chachu 占取「断账」） |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ✅ 66 tests, 66 pass（core 35 + cli 17 + 集成 14，0 跳过） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅（本行即 A9 验证；根 README #41 行见交付提交） |

## 复现命令

```bash
cd suliu
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/suliu.js audit fixtures/clean-stream.jsonl; echo $?                   # 0（澈）
node src/bin/suliu.js audit fixtures/yiduan-stream.jsonl; echo $?                  # 1（臆断 30）
node src/bin/suliu.js audit fixtures/xianyi-stream.jsonl; echo $?                  # 0（显疑注记）
node src/bin/suliu.js audit fixtures/kanyan-stream.jsonl; echo $?                  # 0（望断 15 黄牌）
node src/bin/suliu.js audit fixtures/bayan-stream.jsonl; echo $?                   # 0（拔验清白）
node src/bin/suliu.js audit fixtures/chiyan-stream.jsonl; echo $?                  # 0（迟验注记）
node src/bin/suliu.js audit fixtures/fanyin-stream.jsonl; echo $?                  # 0（泛因注记）
node src/bin/suliu.js audit fixtures/shibai-stream.jsonl; echo $?                  # 1（失败之见不是见）
node src/bin/suliu.js audit fixtures/mianze-stream.jsonl --file fixtures/suliu-book.json; echo $?  # 0（臆册免审）
node src/bin/suliu.js audit fixtures/mianze-stream.jsonl; echo $?                  # 1（无册对照）
node src/bin/suliu.js audit fixtures/yanma-stream.jsonl; echo $?                   # 0（演域豁免）
node src/bin/suliu.js audit fixtures/zhenmian-stream.jsonl; echo $?                # 0（诊面门）
node src/bin/suliu.js audit fixtures/yingwen-stream.jsonl; echo $?                 # 1（英文臆断）
node src/bin/suliu.js audit fixtures/baishi-stream.jsonl; echo $?                  # 0（败写不入断账）
node src/bin/suliu.js audit fixtures/shuangdao-stream.jsonl; echo $?               # 0（望断不叠）
node src/bin/suliu.js audit fixtures/mogao-stream.jsonl; echo $?                   # 0（新稿立撤）
node src/bin/suliu.js audit fixtures/hejian-a.jsonl fixtures/hejian-b.jsonl; echo $?  # 0（合审拔验在先）
node src/bin/suliu.js audit fixtures/hechi-a.jsonl fixtures/hechi-b.jsonl; echo $?    # 0（合审迟验）
node src/bin/suliu.js audit fixtures/yiduan-stream.jsonl --gate 40; echo $?        # 0（30 过门）
node src/bin/suliu.js audit fixtures/kanyan-stream.jsonl --gate 10; echo $?        # 1（15 翻红）
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；
第二条为插件结构性零拦截自检；第三条为机制词防撞自检——相邻各层的机制词不得出现在本层
源码，ban 表累加至 chachu 全部机制词；本层避开了「证牌」（chachu「证牌块」占取，取
「溯牌」）、「传账」（chachu 占取，账名取「断账」）、「靶场」（chachu 占取，演武地取
「演域」）、「迟证」（chachu 占取，取「迟验」）、「模态门」（chachu 占取，取「推词门」）、
「验见」（chachu 占取，通道取「拔验/重演/勘验」）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|契径|工据|工见|灭据|末据|幽物|灭物|壳物|畸物|疵物|诚物|诚值|考牌|结形|域条|卷条|典形|典册|改典|复典|灭典|宪案|禁案|章案|法值|法牌|开门|知面|行面|戒形|戒体|戒词|必行词|宥词|先悖|试违|违知|行值|合牌|化知|缺行|湮形|空捕|空还|空接|导词|川册|塞值|导牌|文账|沙川|已浚|净川|码面|增附|去锁|越源|钩入|籍面|籍账|籍形|命籍|纳籍|准值|准牌|附名|遂形|遂账|遂键|遂册|遂牌|初遂|承施|凭消|消词|命词|豁施|重决|重值|允列|段施|文据|旧据|变写|陈写|陈线|新线|覆世|覆己|覆案|失鲜|许复|陈值|陈改|水牌|水册|画水|约形|公面|约据|约册|约牌|面集|削名|哑削|明削|削值|约改|世据|守约|背约|约法|帚账|唯写|末卷|垢形|垢值|留册|垢门|扫牌|试验场|洁蒙|市虎|虎值|虚功|陈报|状词|成报|勾选形|里程碑形|交接形|虎账|虎牌|市册|中状形|中状册|状账|状牌|状面形|状键词|声明形|旗标形|弱锁形|验锁|网锁|拆锁|遇阻|素拆|复锁|锁册|锁值|锁牌|阻词|校场|阻账|尾文|帚牌|引词|掠据|矫制|矫托|托面|引形|引语|诏账|诏本|矫引|佚据|征引|征据|泛引|阙据|托主|托径|诏册|矫值|矫牌|指瑕|瑕账|瑕册|瑕值|瑕牌|瑕形|数言|列块|表块|乖列|乖总|倒期|阙列|已磨|末稿|试场|察传|得言|得言形|指物|自指|见据|目见|书见|验见|基径|证册|证牌|传账|幻言|疑言|迟证|虚指|幻值|靶场|网卫" src/core src/plugin
```

（ban 表累计至 chachu；本层机制词 20——溯流/诊面/归因形/因面/果词/推词/指代形/拔验/
重演/勘验/臆断/望断/显疑/迟验/泛因/臆值/臆册/溯牌/演域/断账——对全仓 ban 表双向子串
零撞、repo 散文零占位，交付时复核。）

## 实测记录（2026-09-18，本机复跑真实输出）

- `npm test`：**66 tests, 66 pass, 0 fail, 0 skipped**（core 35 + cli 17 + 集成 14；集成挂载 npm 官方 `@deepseek-ai/cordis@4.0.2` + `@deepseek-ai/dsh-tools@0.0.1-rc.1` 真实管道）。
- A2 二十条复现命令退出码逐字吻合：clean 0/澈 · yiduan 30/臆/红 · xianyi 显疑 xy=1 · kanyan 望断 15/望 · bayan 拔验 4 调用 · chiyan 迟验 cy=1 · fanyin 泛因 fy=1 · shibai 败见臆断 30 红 · mianze 带册 0 无册 1 红 · yanma 演域 paths 0 · zhenmian 诊面门 paths 0 · yingwen 英文 30 红 · baishi 败写 paths 0 · shuangdao 望断不叠 15 · mogao 新稿立撤 paths 1 · hejian/hechi 合审 0/0 · yiduan+--gate 40 过 · kanyan+--gate 10 红。
- A3 跨项目七流零误伤（zhizhi/kaocheng/dingfen/erbing×2/huashui/jiaotuo，counts 全 0；夹具先实读原文核对——七流 write 稿径皆无诊面形 14 命中）。
- A5 溯牌块：无册确定性文本逐字吻合；同册两次输出 shasum 相同；增免案后文本改变。
- A7 三组 grep（模型无关 / 无 pre-execute / 机制词防撞）均无输出。
- 实现期缺陷与测试缺陷如实记（标准未动，全部按 docs/03 改实现或改测试笔误）：
  ①issues 排序测试初稿把案别排在行号前——03 §9 锁死「诊径 → 行号 → 案别」，改测试；
  ②CJK bigram 首稿跨标点粘窗（「缓存。重启」出「存重」假窗）——按 03 §5 改切段实现；
  ③「根因如下，详见排查一节」初稿按词元剥除判臆断——按 03 §5 指代前缀判定改实现（泛因）；
  ④--version 断言未容 stdout 尾随换行——改测试 trim；
  ⑤CLI 复现循环把 mianze 直审（该夹具须带册才免案）——改测试编排带册两条单列；
  ⑥拔验的 exec 证据首稿只认命令原文——按 03 §8 修订（命令原文或结果 content）改实现；
  ⑦yanyin 引擎 notes 排序比较符优先级笔误——改实现。
- A2 手算勘误：无（夹具定义即手算对象，先于实现落盘，二十条逐字吻合；上面 ①–⑤⑦ 是测试与实现笔误，⑥ 是实现滞后于 03 修订，皆非手算勘误）。
- 机制词防撞：机制词 20 词（溯流/诊面/归因形/因面/果词/推词/指代形/拔验/重演/勘验/臆断/望断/显疑/迟验/泛因/臆值/臆册/溯牌/演域/断账）对全仓 ban 表双向子串零撞、repo 散文零占位；避开「证牌」（chachu 占）取「溯牌」、「传账」（chachu 占）取「断账」、「靶场」（chachu 占）取「演域」、「迟证」（chachu 占）取「迟验」、「模态门」（chachu 占）取「推词门」、「验见」（chachu 占）通道取「拔验/重演/勘验」。
