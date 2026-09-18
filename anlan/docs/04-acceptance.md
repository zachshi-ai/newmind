# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（夹具定义即手算对象，诊形/状态笔/搅笔/叠数/搅窗/
> 荡案风浪静默三档按 docs/03 语义逐夹具逐笔核算，含每流的词元注册与挂账复核）；实现与测试
> 若与手算冲突，只能改实现，不得改本表。

## 手算底稿（先于实现，逐夹具锁死）

- `clean`（守准·单轮修复）：红「npm test -- auth」at100（auth 逆，注册 auth）→ write
  src/auth.js at150（搅 auth）→ 绿「npm test -- auth」at200（auth 顺）→ auth 序列
  〔逆,顺〕叠 1 → **静默**：counts zhen=1/ni=1/jiao=1 余 0、平、exit 0（漏斗规则一，
  最健康的循环）；
- `anlang`（最小荡案）：红→搅→绿→搅→红→搅→绿（write src/auth.js ×3 夹于胜负之间）
  → auth〔逆,顺,逆,顺〕**叠 3 搅窗 3 → 荡案 1**、min(60,30)=30、荡、exit 1（zhen=2
  ni=2 jiao=3）；
- `fenglang`（风浪·零搅）：红→绿→红→绿，全流无 write → auth 叠 3 搅窗 0 → **风浪 1**
  （feng=1）、0、平、exit 0（红珠实验：波自翻转而手未动——环境之波非人祸）；
- `weidie`（未达门槛）：红→搅→绿→搅→红 → auth〔逆,顺,逆〕叠 2 搅窗 2 → **静默**（叠
  ≤2 宁纵——单轮嫌疑与单轮修复不可分）：zhen=1/ni=2/jiao=2、0、平、exit 0；
- `shoulian`（收敛不赦）：红→搅→绿→搅→红→搅→绿→搅→绿 → auth〔逆,顺,逆,顺,顺〕叠 3
  搅窗 4 → **荡案 1**、30、荡、exit 1（末帧虽收敛，序列罪以全史为凭）；
- `duixiang`（对象独立）：auth 红绿三叠三搅 + cache 单绿一笔（叠 0）→ auth **荡案 1**、
  30、exit 1；cache 静默不并案（对象独立）；
- `shuangdang`（双荡案）：auth〔逆,顺,逆,顺〕搅 3 + cache〔逆,顺,逆,顺〕搅 3 →
  **荡案 2**、min(60,60)=60、荡、exit 1；
- `quanliang`（全科笔镜）：点红「npm test -- auth」at100（auth 注册挂逆）→ 搅 → 全量绿
  「npm test」输出「12 passing」at200（全科顺：auth 在场记顺）→ 搅 → 全量红输出「FAIL
  auth」at300（全科逆：输出词元命中已注册 auth——挂逆）→ 搅 → 全量绿 → auth〔逆,顺,逆,
  顺〕叠 3 搅窗 3 → **荡案 1**、30、exit 1（点笔注册、全科顺逆两通道交替成荡）；
- `laoliu`（老流诚实退化）：`npm test -- auth` ×4 无 isError 旗（红绿交错全 null）→ 不
  记状态笔 → write ×1（isError null 按已发生，搅 auth——但 auth 从未注册）→ counts
  全 0（jiao=0：注册表空无处挂）、平、exit 0（成败未知不诬波）；
- `wushi`（无矢之红）：绿「npm test -- auth」at100（auth 顺在场）→ 裸红「npm test」输出
  空 at200（全量逆、无矢不挂）→ 裸绿「npm test」输出「12 passing」at300（全科顺 → auth
  顺）→ auth〔顺,顺〕叠 0 → **静默**：zhen=2/ni=0/jiao=0、exit 0（红不诬未点名对象）；
- `chijiao`（迟搅不入窗）：红→绿→红→绿（叠 3）→ 三笔 write 全在末绿之后 → 搅窗 0 →
  **风浪 1**、0、平、exit 0（jiao=3 计数透明、窗 0 不认——波定之后的改不参与本局）；
- `cemian`（澜册 spare 免审）：anlang 同流 + `--file anlan-book.json`（spare ["auth"]）
  → auth 整线免审 → paths 无此量、counts 全 0、exit 0；**无册对照**：同流无册 → 荡案
  1、30、exit 1（凡荡必审，豁免授权只能来自册）；
- `yingwen`（英文环境）：RED「FAIL auth.spec.js — 2 failing」→ write src/auth.js →
  GREEN「auth 12 passing」→ write → RED → write → GREEN → auth 叠 3 搅窗 3 →
  **荡案 1**、30、exit 1；
- `guance`（观察不入账）：read src/auth.js（content 含「FAIL auth 2 failing」）×2 +
  exec 红、绿 → read 族永不记波 → auth〔逆,顺〕叠 1 → **静默**：zhen=1/ni=1/jiao=0、
  exit 0（看见失败输出不算自己的诊）；
- `huangfan`（首绿起振）：绿→搅→红→搅→绿→搅→红→搅→绿 → auth〔顺,逆,顺,逆,顺〕叠 4
  搅窗 4 → **荡案 1**、30、exit 1（极性交替不以首极性豁免）；
- `jiaocha`（交错不串账）：auth 红→搅→绿 + cache 红→搅→绿 交错而行 → auth 叠 1、cache
  叠 1，搅笔各归各对象 → **静默**：zhen=2/ni=2/jiao=2、全 0 案、exit 0；
- 合审 `hepan`（a 流：红→搅→绿→搅→红〔叠 2 止〕；b 流：绿 at400）→ at 排序跨会话归并 →
  auth〔逆,顺,逆,顺〕叠 3 搅窗 2 → **荡案 1**、30、exit 1（6 调用 2 会话）；
- 附加口径：`anlang + --gate 40` → 30 过门 exit 0；`anlang + --gate 20` → 30 红 exit 1
  （荡带翻转）。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call、非 tool_call/result 事件忽略）；对象键与工具族同全仓（write 族含 edit/patch/apply）；径规整同全仓；**零稿面**（无愈形无径门，全流 exec/write 皆入账，豁免唯对象）；**诊形 44**（命令小写化子串命中；册 forms 增形、noDefaults 可关；非诊形 exec 永不入账）；**状态笔**（顺=isError===false ∧ 诊形；逆=isError===true ∧ 诊形；null 不记——诚实退化；点笔=命令∪输出含词元；全科笔=剥诊形后余文只剩旗标∪脚手架词：顺记全部在场对象、逆只记输出词元命中者——无矢不挂；两不沾不挂）；**搅笔**（write 族 ∧ isError!==true ∧ 径∪content 含**已注册**对象词元；null 按已发生；observe/other 永不搅）；**判定序**（每对象独立：叠≥3∧搅窗≥2→荡案 +30 单案即红；叠≥3∧搅窗<2→风浪注记 0；叠≤2→静默；搅窗=夹于首末状态笔之间的该对象搅笔；案序=对象键字典序；一对象至多一案；中途收敛不撤案）；**澜册 spare**（对象词元小写全等豁免，整线免审；无册照判）；dang 值=min(60,30×dang)、total=min(100)；分带 平 0–14 / 漾 15–29 / 荡 ≥30；门默认 30；counts 附 zhen/ni/jiao 透明量；judge 幂等——core 用例 ≥ 30 且全绿，断言恰好该分值与案名对象 | `npm test`（core 部分） | ✅ core 37 用例全绿（三档判定 16 · 通道锁死 10 · 澜册门禁 5 · 幂等案序合审导出 6——逐项断言恰好该分值与案名对象） |
| A2 | 夹具分数（先于实现手算定死） | 无册（audit 不带 --file）：`clean-stream`：zhen=1/ni=1/jiao=1 余 0、平、exit 0；`anlang-stream`：荡案 1（dang=1）、30、荡、exit 1；`fenglang-stream`：风浪 1（feng=1）、0、平、exit 0；`weidie-stream`：zhen=1/ni=2/jiao=2、0、平、exit 0；`shoulian-stream`：荡案 1、30、exit 1；`duixiang-stream`：荡案 1（auth）、30、exit 1；`shuangdang-stream`：荡案 2、60、exit 1；`quanliang-stream`：荡案 1、30、exit 1；`laoliu-stream`：counts 全 0、exit 0；`wushi-stream`：zhen=2/ni=0/jiao=0、exit 0；`chijiao-stream`：风浪 1（jiao=3 窗 0）、0、exit 0；`yingwen-stream`：荡案 1、30、exit 1；`guance-stream`：zhen=1/ni=1/jiao=0、exit 0；`huangfan-stream`：荡案 1、30、exit 1；`jiaocha-stream`：zhen=2/ni=2/jiao=2、全 0 案、exit 0；`cemian-stream` 带册（spare auth）：全 0、exit 0；cemian 无册对照：荡案 1、30、exit 1；合审 `hepan-a + hepan-b`：2 调用 2 会话 → 荡案 1、30、exit 1；附加口径：`anlang + --gate 40` → 30 过门 exit 0；`anlang + --gate 20` → 30 红 exit 1 | core 断言 + CLI 复现 | ✅ 19 条复现命令退出码与输出逐字吻合（clean 0/anlang 1/fenglang 0/weidie 0/shoulian 1/duixiang 1/shuangdang 1·60/quanliang 1/laoliu 0/wushi 0/chijiao 0/cemian 带册 0·无册 1/yingwen 1/guance 0/huangfan 1/jiaocha 0/hepan 1·6调用2会话/gate 40·0 与 20·1） |
| A3 | 跨项目互认（外部夹具已实读核对，先于实现逐笔核算：zhizhi sample 之 npm test ×4 红 1 绿全为全量形而输出无 content——无矢不挂、绿全科无在场对象；huiji clean/huiji-stream 单笔 auth；kaocheng mixed 之 exec 为 `node gen.js` 非诊形；dingfen fenced 之 npm test 红绿二笔输出无 content——无矢不挂；erbing mixed/delegated 全为 terraform/send_invoice/mail/npm publish 非诊形；huashui fuji 仅 write 二笔而注册表空） | zhizhi 的 `fixtures/sample-stream.jsonl`：calls 8、counts 全 0、平、exit 0；huiji 的 `fixtures/clean-stream.jsonl`：zhen=1、exit 0；huiji 的 `fixtures/huiji-stream.jsonl`：ni=1、叠 0、exit 0；kaocheng 的 `fixtures/mixed-stream.jsonl`：counts 全 0；dingfen 的 `fixtures/fenced-stream.jsonl`：counts 全 0；erbing 的 `fixtures/mixed-stream.jsonl` 与 `fixtures/delegated-stream.jsonl`：counts 全 0；huashui 的 `fixtures/fuji-stream.jsonl`：counts 全 0（同格式流跨项目可审、互不误伤） | CLI 测试 | ✅ 八流全零误伤：zhizhi sample（calls 8）、huiji clean（顺1搅1）/huiji（逆1搅1）、kaocheng mixed、dingfen fenced、erbing mixed/delegated、huashui fuji——counts 全 0、exit 0 |
| A4 | CLI 语义 | `audit` 多流合审 + `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 未知旗标 / 缺值 → exit 2；`register --path` 缺 --path → exit 2、重复登记去重、`--spare`/`--forms`/`--no-defaults` 增改；`revoke` 无此径 → exit 2；`list` 册缺失 → exit 2；`block` 无册出确定性文本（澜册公示是供给不是门禁）；`gate --value` 按门判 0/1（29 过 / 30 红 / --gate 50 时 45 过）；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ✅ 八流全零误伤：zhizhi sample（calls 8）、huiji clean（顺1搅1）/huiji（逆1搅1）、kaocheng mixed、dingfen fenced、erbing mixed/delegated、huashui fuji——counts 全 0、exit 0 |
| A5 | 荡牌块逐字节确定 | 同一澜册两次 `anlan block` shasum 相同；增一 spare 后文本改变；无册输出确定性文本（`澜册：未立（凡荡必审）`）；块中不含命令原文、输出原文与搅笔原文（只载 对象键:案别:指纹——djb2 指纹，原文不进块是结构性保证） | CLI shasum 复现 | ✅ 同册双跑 shasum 一致；增 spare cache 后文本改变；无册出「澜册：未立（凡荡必审）」；牌块含对象词元切片（点名所需）而 npm test/FAIL/retry 等原文零出现（集成 11 逐断言） |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载安澜插件：失败探针也无条件到达工具本体（结构性零拦截）；守准探针 → 0 平过门；最小荡案探针 → 30 荡门红；风浪探针 → 0；未达门槛探针 → 0；迟搅探针 → 0；澜册 spare 探针 → 0；失败 write 探针不搅；老流 null 探针 → 0；`exportStream()` 导出流离线 `audit` 重放账实一致；gate 翻转 + 荡牌块两次渲染逐字节相同且不含命令/输出/搅笔原文——集成用例 ≥ 10 | 集成测试 | ✅ 集成 12 用例全绿（零拦截/守准/荡案/风浪/未达门槛/迟搅/澜册/失败写不搅/观察不入账/导出重放一致/牌块确定/门翻转；失败探针触发串用旗标形 --cursedfail——词元注册不被测试探针污染） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证，ban 表累加至 huiji 全部机制词） | grep（下附命令，应无输出） | ✅ 三条 grep 皆零输出（依赖/零拦截/机制词 ban 表；注释散文 3 处措辞已改避） |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ✅ 68 tests 全绿（core 37 + cli 19 + 集成 12），0 fail 0 skip（官方包在场） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅ 01–04 + SKILL.md + README 齐备；根 README 索引行/方向行/许可行交付 commit 更新 |

## 复现命令

```bash
cd anlan
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/anlan.js audit fixtures/clean-stream.jsonl; echo $?     # 0（守准·平）
node src/bin/anlan.js audit fixtures/anlang-stream.jsonl; echo $?    # 1（荡案 30）
node src/bin/anlan.js audit fixtures/fenglang-stream.jsonl; echo $?  # 0（风浪注记·平）
node src/bin/anlan.js audit fixtures/weidie-stream.jsonl; echo $?    # 0（未达门槛·静默）
node src/bin/anlan.js audit fixtures/shoulian-stream.jsonl; echo $?  # 1（收敛不赦 30）
node src/bin/anlan.js audit fixtures/duixiang-stream.jsonl; echo $?  # 1（对象独立荡案）
node src/bin/anlan.js audit fixtures/shuangdang-stream.jsonl; echo $? # 1（双荡案 60）
node src/bin/anlan.js audit fixtures/quanliang-stream.jsonl; echo $? # 1（全科笔镜 30）
node src/bin/anlan.js audit fixtures/laoliu-stream.jsonl; echo $?    # 0（老流诚实退化）
node src/bin/anlan.js audit fixtures/wushi-stream.jsonl; echo $?     # 0（无矢之红）
node src/bin/anlan.js audit fixtures/chijiao-stream.jsonl; echo $?   # 0（迟搅不入窗·风浪）
node src/bin/anlan.js audit fixtures/cemian-stream.jsonl --file fixtures/anlan-book.json; echo $?  # 0（澜册免审）
node src/bin/anlan.js audit fixtures/cemian-stream.jsonl; echo $?    # 1（无册对照 30）
node src/bin/anlan.js audit fixtures/yingwen-stream.jsonl; echo $?   # 1（英文荡案）
node src/bin/anlan.js audit fixtures/guance-stream.jsonl; echo $?    # 0（观察不入账）
node src/bin/anlan.js audit fixtures/huangfan-stream.jsonl; echo $?  # 1（首绿起振 30）
node src/bin/anlan.js audit fixtures/jiaocha-stream.jsonl; echo $?   # 0（交错不串账）
node src/bin/anlan.js audit fixtures/hepan-a.jsonl fixtures/hepan-b.jsonl; echo $?  # 1（合审荡案跨会话）
node src/bin/anlan.js audit fixtures/anlang-stream.jsonl --gate 40; echo $?  # 0（30 过门）
node src/bin/anlan.js audit fixtures/anlang-stream.jsonl --gate 20; echo $?  # 1（30 翻荡）
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；
第二条为插件结构性零拦截自检；第三条为机制词防撞自检——相邻各层的机制词不得出现在本层
源码，ban 表累加至 huiji 全部机制词；本层避开了「试形」（saowu 散文「调试形」占
取，验证命令词表取「诊形」）、「施治」（chengshi 官方题名「重施治理」跨词占取，
搅动形迹取「搅笔」）、「检形/疾账/疾窗/讳案/愈形/痊笔/疾笔/痊册/静养/疾值/疾牌」
（huiji 占取，状态账取「波账」、门禁取「荡值」、牌块取「荡牌」、免审册取「澜册」）、
「势账/盲捶/游骑/悬账/变方」（jiubian 占取）、「判面/判形/据窗/可形/否形/虞形/靖形/
褒形/翻案/谀断/泛判」（kuijing 占取）、「红账/镜凭/照册/照牌/练场/责面/弃责」（zizhao
占取）、「归因形/因账/诊面」（suliu 占取——本层验证词表取「诊形」与「诊面」双向不为
子串）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|契径|工据|工见|灭据|末据|幽物|灭物|壳物|畸物|疵物|诚物|诚值|考牌|结形|域条|卷条|典形|典册|改典|复典|灭典|宪案|禁案|章案|法值|法牌|开门|知面|行面|戒形|戒体|戒词|必行词|宥词|先悖|试违|违知|行值|合牌|化知|缺行|湮形|空捕|空还|空接|导词|川册|塞值|导牌|文账|沙川|已浚|净川|码面|增附|去锁|越源|钩入|籍面|籍账|籍形|命籍|纳籍|准值|准牌|附名|遂形|遂账|遂键|遂册|遂牌|初遂|承施|凭消|消词|命词|豁施|重决|重值|允列|段施|文据|旧据|变写|陈写|陈线|新线|覆世|覆己|覆案|失鲜|许复|陈值|陈改|水牌|水册|画水|约形|公面|约据|约册|约牌|面集|削名|哑削|明削|削值|约改|世据|守约|背约|约法|帚账|唯写|末卷|垢形|垢值|留册|垢门|扫牌|试验场|洁蒙|市虎|虎值|虚功|陈报|状词|成报|勾选形|里程碑形|交接形|虎账|虎牌|市册|中状形|中状册|状账|状牌|状面形|状键词|声明形|旗标形|弱锁形|验锁|网锁|拆锁|遇阻|素拆|复锁|锁册|锁值|锁牌|阻词|校场|阻账|尾文|帚牌|引词|掠据|矫制|矫托|托面|引形|引语|诏账|诏本|矫引|佚据|征引|征据|泛引|阙据|托主|托径|诏册|矫值|矫牌|指瑕|瑕账|瑕册|瑕值|瑕牌|瑕形|数言|列块|表块|乖列|乖总|倒期|阙列|已磨|末稿|试场|察传|得言|得言形|指物|自指|见据|目见|书见|验见|基径|证册|证牌|传账|幻言|疑言|迟证|虚指|幻值|靶场|网卫|溯流|诊面|归因形|因面|果词|推词|指代形|拔验|重演|勘验|臆断|望断|显疑|迟验|泛因|臆值|臆册|溯牌|演域|因账|自照|责面|责面形|责稿|弃责|弃责形|护短|思短|泛弃|虚弃|红账|镜凭|镜形|照册|照值|照牌|练场|暗带|窥镜|判面|判面形|判行|判账|可形|否形|虞形|靖形|褒形|翻案|谀断|泛判|鉴更|谀值|赏册|刺牌|据窗|帷幄|据件|讳疾|愈形|检形|疾账|疾窗|讳案|已痊|迟痊|泛愈|痊册|静养|疾值|疾牌|痊笔|疾笔" src/core src/plugin
```

（ban 表累计至 huiji；本层机制词 11——安澜/波账/诊形/搅笔/叠数/荡案/风浪/荡值/荡牌/
澜册/分带平漾荡——对全仓 ban 表双向子串零撞、repo 散文零占位，交付时复核。）
