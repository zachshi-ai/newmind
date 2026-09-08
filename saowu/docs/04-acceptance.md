# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（夹具已先行落盘，卷面按实际内容逐夹具核算——见 docs/03 §12）；
> 实现与测试若与手算冲突，只能改实现，不得改本表。

## 手算底稿（先于实现，卷面锁死）

垢形判定（一处 = 一行；针形 10 ∪ 屑两路：原语×标记共现 ∪ 探针注释形独立）：

- 卷 V1 = `export function id(x) {` / `  return x` / `}`（净卷，0 垢）
- 卷 V2 = check 函数含 `  debugger;`（行 2 命中针形 1 `^\s*debugger\b`）
- 卷 V3 = check 函数含 `  console.log("DEBUG: token =", t)`（行 2：原语
  `console.log(` × 标记 `DEBUG` 共现 → 屑）
- 卷 V4 = `echo "==== stage 1 ===="`（行 1：原语 `echo ` × 标记 `====`）+
  `console.log("HERE 2")`（行 2：`console.log(` × `HERE`）→ 屑 2 处
- 卷 V5a = `function f() {` / `  breakpoint()` / `}`（行 2 命中针形 2）
- 卷 V5b = 净卷（同径重写）
- 三径各一针：src/a.js `debugger;`（针形 1）、lib/b.rb `binding.pry`（针形 6）、
  bin/deploy.sh `set -x`（针形 9）
- tests/auth.test.js 含 `debugger;` 与 `breakpoint()`（径段 `/tests/` 豁免）
- scripts/dev.sh 含 `set -x`（行 1 针形 9）与 `echo "DEBUG: starting"`
  （行 2：`echo ` × `DEBUG` → 屑）——带册（retain `scripts/*`）豁免 /
  无册 45
- 无文之写：write args.content 缺 → 无文之痕，无末卷
- 卷 V10 = `debugger;` / `import pdb` / `console.trace(x)`（行 1 针形 1、
  行 2 针形 4、行 3 针形 10 → 针 3 处）
- 卷 V11 = `print('>>> checkpoint 1')`（屑：`print(` × `>>>`）+
  `console.log("XXX intermediate state")`（屑：`console.log(` × `XXX`）+
  `printf("# debug: entered loop")`（屑：`printf(` × 探针注释形 `# debug:`）
  → 屑 3 处
- 卷 V12 = `try {` / `  load()` / `} catch (e) {` /
  `  console.log("DEBUG: load failed", e)` / `}`（行 4：`console.log(` ×
  `DEBUG` → 屑 1 处——fangchuan 账上导词清白，两账并记正交）
- 卷 V13 = `console.log("listening on port 3000")`（无标记不中）+
  `print("用户未注册")`（无标记不中）+ `echo done`（无标记不中）+
  `logger.info("service started")`（logger 不在原语表）→ 净卷
- qianzhang：write 脏卷 V2a（含 `debugger;`）→ edit 无 content（无文之痕）
  → 遗针 1 处 + 帚账不前注记 1

逐夹具判定（末卷 = 该径末笔带 content 之成功写；一处 = 一行；帚值 =
min(60,30×针) + min(40,15×屑)）：

| 夹具 | 判定 | counts | 垢值 | 带 | exit |
|------|------|--------|------|----|------|
| clean | 末卷 V1 净 | 全 0 | 0 | 洁 | 0 |
| yizhen | 末卷 V2 遗针 1 处 | zhen:1 | 30 | 垢 | 1 |
| yixie | 末卷 V3 遗屑 1 处 | xie:1 | 15 | 蒙 | 0 |
| shuangxie | 末卷 V4 遗屑 2 处 | xie:2 | 30 | 垢 | 1 |
| yisao | V5a 撒 V5b 净 → 已扫注记 | sao:1 | 0 | 洁 | 0 |
| pinzhen | 三径各遗针 1 处 | zhen:3 | 60(cap) | 垢 | 1 |
| shichang | tests/ 试验场豁免 | 受审径 0 | 0 | 洁 | 0 |
| liuce 带册 | retain scripts/* 豁免 | 受审径 0 | 0 | 洁 | 0 |
| liuce 无册 | 针 1 + 屑 1 | zhen:1 xie:1 | 45 | 垢 | 1 |
| wujuan | 无文之写无末卷 | 全 0（受审径 1） | 0 | 洁 | 0 |
| duozhen | 末卷 V10 遗针 3 处 | zhen:3 | 60(cap) | 垢 | 1 |
| biaoji | 末卷 V11 遗屑 3 处 | xie:3 | 40(cap) | 垢 | 1 |
| daoci | 末卷 V12 遗屑 1 处（catch 体内照案） | xie:1 | 15 | 蒙 | 0 |
| huisheng | 末卷 V13 净（宁纵） | 全 0 | 0 | 洁 | 0 |
| qianzhang | 遗针 1 处 + 帚账不前注记 | zhen:1 qian:1 | 30 | 垢 | 1 |

附加口径：yizhen + `--gate 100` → 30 过门 exit 0；yixie + `--gate 10` → 15 红门 exit 1。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call）；对象键与工具族同全仓；径规整防同文件异写之诬；**无默认径表**（凡 p: 径皆受审）；**帚账唯写**（write 族成功 ∧ args.content 非空 → 末卷；content 空 → 无文之痕；observe 永不入账；exec 黑盒）；入口滤 `isError===true` 不入账（不生账也不生痕）；合审序（全 at 有数 → (at,流序,流内序) 稳定排序；否则参序拼接）；**垢形词法**（针形默认 10 形：行首形注释不中/子串形注释同判 ∪ 屑两路：原语 12 × 标记 9 大写词界同行共现 ∪ 探针注释形 `(?://\|#)\s*debug:` 独立案 ∪ 册 forms 增形须命名捕获组 noDefaults 可关）；**试验场豁免**（径段名段 10 形立案前）；**留册** retain glob 立案前；**判定序锁死**（立案前豁免 → 无末卷静默 → 扫末卷一处一行针优先 → 已扫注记（末卷 0 处 ∧ 先前帚账 ≥1 处）→ 帚账不前注记（末卷后无文之痕，案照出账止于末卷）→ 全洁）；帚值 min(60,30×针)+min(40,15×屑)；分带 洁 0–14 / 蒙 15–29 / 垢 ≥30；门默认 30——单针即红双屑即红单屑黄牌；judge 幂等（重放同流必得同判词）——core 用例 ≥ 30 且全绿，断言恰好该分值 | `npm test`（core 部分） | ✅ 35 用例全绿（core：流解析 4 + 对象与径规整 2 + 针形 6 + 屑共现 4 + 屑注释路 1 + 试验场 2 + 留册 2 + 判定序 7 + 帚值门禁 2 + 帚牌行序 2 + 合审序 1 + 夹具全量 1 + 幂等与 seq 1——断言恰好该分值与案名） |
| A2 | 夹具分数（先于实现手算定死） | 留册夹具 `saowu-book.json`：retain [`scripts/*`]。手算表（见上）十五夹具 + 两附加口径十七条复现：clean 0/洁/0；yizhen 30/垢/1（遗针 1 处）；yixie 15/蒙/0（遗屑 1 处黄牌）；shuangxie 30/垢/1（遗屑 2 处）；yisao 0/洁/0（已扫注记）；pinzhen 60/垢/1（三径三针 cap）；shichang 0/洁/0（试验场豁免受审径 0）；liuce 带册 0/洁/0；liuce 无册 45/垢/1（针 1+屑 1）；wujuan 0/洁/0（无末卷受审径 1）；duozhen 60/垢/1（单卷三针 cap）；biaoji 40/垢/1（三路屑 cap）；daoci 15/蒙/0（catch 体内屑照案）；huisheng 0/洁/0（宁纵净卷）；qianzhang 30/垢/1（针 1+帚账不前 1）；yizhen+`--gate 100` → 0；yixie+`--gate 10` → 1 | core 断言 + CLI 复现 | ✅ 十七条复现命令退出码逐字吻合（0/1/0/1/0/1/0/0/1/0/1/1/0/0/1 + gate 100→0/10→1）；分数与 cases 由 CLI JSON 逐字段断言（clean 全 0 受审径 1 / yizhen 30 垢 遗针 src/auth.js:2 debugger / yixie 15 蒙 单屑黄牌 / shuangxie 30 垢 两屑 / yisao 已扫注记 1 / pinzhen 60 三径各一针 / shichang 受审径 0 / liuce 带册 0 无册 45 垢 / wujuan 无末卷受审径 1 / duozhen 60 三针 / biaoji 40 三屑 / daoci 15 蒙 / huisheng 全 0 / qianzhang 30 垢 zhen:1 qian:1 / gate 附加两口径） |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl` 无册喂 `saowu audit`：calls 8、counts 全 0、score 0、带「洁」、exit 0（write 无 content、read/edit 无 content → 全流无末卷）；kaocheng 的 `fixtures/mixed-stream.jsonl` 无册喂：calls 4、counts 全 0、exit 0（report.md 空白末卷、result.json 净卷）；fangchuan 的 `fixtures/yancao-stream.jsonl` 无册喂：calls 2、counts 全 0、exit 0（a.js 湮形不是垢形、lib.js 净）；yuefa 的 `fixtures/clean-stream.jsonl` 无册喂：calls 2、counts 全 0、exit 0（export 函数卷无垢）；huashui 的 `fixtures/clean-stream.jsonl` 无册喂：calls 4、counts 全 0、exit 0（const 赋值行无垢）；erbing 的 `fixtures/mixed-stream.jsonl` 无册喂：calls 5、counts 全 0、exit 0（exec/ask/principal 无 p: 落笔）——同格式流跨项目可审、互不误伤 | CLI 测试 | ✅ 六流零误伤（zhizhi sample 8 调用无末卷〔write 无 content、read/edit 无 content〕/ kaocheng mixed 4 调用两径全净 / fangchuan yancao 2 调用湮形非垢形 / yuefa clean 2 调用 export 函数卷无垢 / huashui clean 4 调用 const 赋值行无垢 / erbing mixed 5 调用 exec/ask/principal 无 p: 落笔——counts 全 0、全洁带 exit 0） |
| A4 | CLI 语义 | `audit` 多流合审 + `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 未知旗标 → exit 2；`register --path` 缺 --path → exit 2、重复登记去重、册缺失自动建册；`revoke` 无此径 → exit 2；`list` 册缺失 → exit 2；`block` 无册出确定性文本（留册公示是供给不是门禁）；`gate --value` 按门判 0/1（29 过 / 30 红 / --gate 50 时 45 过）；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ✅ 26 用例全绿（A2 十四夹具 + 无册对照 + 两 gate 口径逐字段断言 + A3 六流 + 坏行报行号/缺流/无流参/未知旗标 exit 2 + register 自动建册去重 + revoke 无此径 exit 2 + list 缺册 exit 2 + gate 29/30/--gate 50×45 + block 无册确定性文本与增许留改变 + --version/--help/未知命令 + A5 shasum 断言） |
| A5 | 帚牌块逐字节确定 | 同一留册两次 `saowu block` shasum 相同；增一许留后文本改变；无册输出确定性文本（`留册：未立（凡迹皆记）`）；块中不含任何行原文（只载径、行号与形名） | CLI shasum 复现 | ✅ 逐字节一致（同册两次 block shasum 全等 4660d8fb…；增许留 vendor/* 后文本改变；无册块逐字等于「留册：未立（凡迹皆记）」；行原文不进帚牌见 A6 集成 9 断言） |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载扫屋插件：失败探针也无条件到达工具本体（结构性零拦截）；净卷探针（写 V1）→ 0 过门；遗针探针（写含 debugger）→ 30 红门；遗屑探针（写含 console.log DEBUG）→ 15 蒙过门；gate 10 翻红；失败 write 探针（isError）不入账 → 0；留册径探针（scripts/*）→ 免账 0；已扫探针（先撒后净）→ 注记 0；`exportStream()` 导出流离线 `audit` 重放，案数与垢值与运行时账**账实一致**；帚牌块两次渲染逐字节相同且**不含行原文**——集成用例 ≥ 8 | 集成测试 | ✅ 10 用例全绿（真实管道挂载 npm 官方 @deepseek-ai/cordis@4.0.2 + @deepseek-ai/dsh-tools@0.0.1-rc.1：失败探针无条件到达工具本体、净卷 0 过门、遗针 30 红门、遗屑 15 蒙过门、gate 10 翻红、失败写不入账、许留免账 0、已扫注记 0、exportStream 重放账实一致 30、帚牌两次渲染逐字节相同且不含 export function check 行原文、edit 无文之痕出帚账不前注记） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出（grep3 累加至 yuefa 全部机制词——含「约形\|公面\|约据\|约册\|约牌\|面集\|削名\|哑削\|明削\|削值\|约改\|世据\|守约\|背约」与 huashui 全部「文据\|旧据\|变写\|陈写\|陈线\|新线\|覆世\|覆己\|失鲜\|许复\|陈值\|陈改」；实现期 grep3 抓到两处——插件头注释引 yuefa 带注册词、gouxing 注释带 fangchuan「导词」——改词面后复验全净，判定语义与 A1–A9 期望未动） |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ✅ 71 tests, 71 pass（core 35 + cli 26 + 集成 10，0 跳过） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅（本行即 A9 验证；根 README #35 行见交付提交） |

## 复现命令

```bash
cd saowu
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/saowu.js audit fixtures/clean-stream.jsonl --file fixtures/saowu-book.json; echo $?     # 0
node src/bin/saowu.js audit fixtures/yizhen-stream.jsonl --file fixtures/saowu-book.json; echo $?    # 1（遗针 1 处）
node src/bin/saowu.js audit fixtures/yixie-stream.jsonl --file fixtures/saowu-book.json; echo $?     # 0（单屑黄牌 15 蒙）
node src/bin/saowu.js audit fixtures/shuangxie-stream.jsonl --file fixtures/saowu-book.json; echo $? # 1（双屑 30）
node src/bin/saowu.js audit fixtures/yisao-stream.jsonl --file fixtures/saowu-book.json; echo $?     # 0（已扫注记）
node src/bin/saowu.js audit fixtures/pinzhen-stream.jsonl --file fixtures/saowu-book.json; echo $?   # 1（三径三针 cap 60）
node src/bin/saowu.js audit fixtures/shichang-stream.jsonl --file fixtures/saowu-book.json; echo $?  # 0（试验场豁免）
node src/bin/saowu.js audit fixtures/liuce-stream.jsonl --file fixtures/saowu-book.json; echo $?     # 0（留册豁免）
node src/bin/saowu.js audit fixtures/liuce-stream.jsonl; echo $?                                     # 1（无册对照 45 垢）
node src/bin/saowu.js audit fixtures/wujuan-stream.jsonl --file fixtures/saowu-book.json; echo $?    # 0（无末卷）
node src/bin/saowu.js audit fixtures/duozhen-stream.jsonl --file fixtures/saowu-book.json; echo $?   # 1（单卷三针 cap）
node src/bin/saowu.js audit fixtures/biaoji-stream.jsonl --file fixtures/saowu-book.json; echo $?    # 1（三路屑 cap 40）
node src/bin/saowu.js audit fixtures/daoci-stream.jsonl --file fixtures/saowu-book.json; echo $?     # 0（catch 体内屑 15 蒙）
node src/bin/saowu.js audit fixtures/huisheng-stream.jsonl --file fixtures/saowu-book.json; echo $?  # 0（宁纵净卷）
node src/bin/saowu.js audit fixtures/qianzhang-stream.jsonl --file fixtures/saowu-book.json; echo $? # 1（针 1 + 帚账不前）
node src/bin/saowu.js audit fixtures/yizhen-stream.jsonl --file fixtures/saowu-book.json --gate 100; echo $?  # 0
node src/bin/saowu.js audit fixtures/yixie-stream.jsonl --file fixtures/saowu-book.json --gate 10; echo $?    # 1
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；
第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码，ban 表累加至 yuefa
全部机制词；本层机制词「垢形」避开了全仓 ban 表双向子串与散文组合、「帚账」避开
防川「文账」、「帚牌」沿用全仓「X牌」家族、「留册」避开 shefa 筏册的 keep 键名
（本层用 retain 承载））：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|契径|工据|工见|灭据|末据|幽物|灭物|壳物|畸物|疵物|诚物|诚值|考牌|结形|域条|卷条|典形|典册|改典|复典|灭典|宪案|禁案|章案|法值|法牌|开门|知面|行面|戒形|戒体|戒词|必行词|宥词|先悖|试违|违知|行值|合牌|化知|缺行|湮形|空捕|空还|空接|导词|川册|塞值|导牌|文账|沙川|已浚|净川|码面|增附|去锁|越源|钩入|籍面|籍账|籍形|命籍|纳籍|准值|准牌|附名|遂形|遂账|遂键|遂册|遂牌|初遂|承施|凭消|消词|命词|豁施|重决|重值|允列|段施|文据|旧据|变写|陈写|陈线|新线|覆世|覆己|覆案|失鲜|许复|陈值|陈改|水牌|水册|画水|约形|公面|约据|约册|约牌|面集|削名|哑削|明削|削值|约改|世据|守约|背约|约法" src/core src/plugin
```

## 实测记录（交付时以本机复跑真实输出回填）

- 定标勘误一笔（先于实现落盘）：§4 试验场名段改按正则形 10 形——列举字面 12 项与「10 形」计数不符、且目录段在径首（`tests/a.js`）应同豁；勘误 commit 先于实现与测试落盘。
- 实现期修正三笔如实记（用例暴露后落盘，A1–A9 期望未动）：①试验场正则原用 `/\/tests?\//` 对径首 `tests/a.js` 失配（A1 用例暴露）——改 `(^|/)` 分支，是「径含名段」意图的落实；②屑形原语按 03 形表序取首命中——`pprint(` 含 `print(` 子串，形名为 `print×DEBUG`（形表序的确定性，测试期望按标准修正）；③grep3 抓到两处注册词入注记（见 A7）——改词面后全净。
- 2026-09-08 本机实测回填：npm test 71/71（core 35 + cli 26 + 集成 10，0 跳过）；十七条复现命令退出码逐字吻合；帚牌 shasum 4660d8fb53723638aff8459eb004e49df82b8ff5 两次全等；三组 grep 无输出。
- 机制词防撞：机制词 12 词（扫屋/巡扫/垢形/垢值/遗针/遗屑/已扫/留册/帚牌/帚账/末卷/试验场）对全仓 ban 表（241 词累加至 yuefa）双向子串零撞、对全仓散文 grep 零命中——「帚账」避防川「文账」、「留册」避 shefa 筏册 keep 键名（retain 承载）、屑判定让 console.error/logger 于原语表外（与防川导词表词面和谐）。
