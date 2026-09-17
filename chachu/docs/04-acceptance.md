# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（夹具定义即手算对象，得言形/指物/见据按 docs/03
> 词法逐夹具核算；A3 外部夹具已逐一实读原文核对）；实现与测试若与手算冲突，只能改实现，
> 不得改本表。

## 手算底稿（先于实现，逐夹具锁死）

- `clean`：write docs/notes.md「重构说明：内部实现调整，详见 src/index.js，
  测试已补齐。」——「详见」是指路词不是得言形，无数言无指物 → counts 全 0、
  受审稿 1、幻值 0、带「彰」、exit 0；
- `huanyan`：write docs/report.md——「配置集中在 src/config.js，使用 CommonJS
  导出。」（集中在/使用 + 径指物，无见据）、「测试位于 tests/e2e，共 14 个用例。」
  （位于 + 径指物；「共 14 个」归指瑕不归本层）→ **幻言 2**、min(60,60)=60
  （cap）、带「诞」、exit 1（双幻言即红）；
- `duchuan`：write docs/plan.md「日志输出到 logs/agent.log，按日滚动。」→
  **幻言 1**、30、诞、exit 1（单幻言即红）；`--gate 40` → 30 过门 exit 0；
- `mujian`：先 read src/config.js 成功（目见）后 write 断言稿 → 见据在前清白 →
  全 0、彰、exit 0（2 调用）；
- `shujian`：先 write src/config.js 成功（书见）后 write 断言稿 → 全 0、彰、
  exit 0（2 调用、受审稿 2——两稿皆审，前稿无得言形）；
- `xingjian`：先 bash `cat src/config.js` 成功（验见——原文含指物）后 write
  断言稿 → 全 0、彰、exit 0；
- `zizhi`：write docs/plan.md「本文档包含三阶段实施细节与回滚步骤。」——自指形
  「本文档」指物即稿径，本笔即据 → 全 0、彰、exit 0；
- `chizheng`：先 write 断言稿后 read src/config.js 成功 → 见据在后 → **迟证
  注记 1**、0 分、彰、exit 0（2 调用）；
- `shibai`：先 read src/config.js **isError:true**（404）后 write 断言稿 →
  失败之见不是见 → **幻言 1**、30、诞、exit 1；
- `jiyan`（带册 grounds [src/config.js]）：write 断言稿 → 基径清白 → paths 1、
  全 0、彰、exit 0；**无册对照**：同稿 → 幻言 1、30、诞、exit 1；
- `mianze`（带册 excuse [docs/reports/*]）：write docs/reports/weekly.md 断言稿
  → 免审 → paths 0、全 0、彰、exit 0；
- `bachang`：write tests/report.spec.js（content 含断言行）→ 靶场名段豁免 →
  paths 0、全 0、彰、exit 0；
- `shimo`：write docs/plan.md 三行——「下一步将把配置迁移到 src/config.js。」
  （将把）「使用前应当先读 src/config.js。」（应当）「TODO: 校验 tests/e2e
  覆盖。」（todo）→ 模态门整行跳过 → 全 0、彰、exit 0（受审稿 1、5 行）；
- `yinyu`：write docs/report.md「AGENTS.md 写着「提交前必须通过 lint」。」——
  引语不避（本层无引号豁免），AGENTS.md 全流无目见 → **幻言 1**、30、诞、
  exit 1（jiaotuo 阙据注记与本层幻言并行——本的缺席只有本层计分）；
- `xuzhi`：write docs/report.md「项目包含多个功能模块。」——得言形（包含）而
  无指物 → **虚指注记 1**、0 分、彰、exit 0；
- `yingwen`：write docs/report.md「The config lives in src/config.js and uses
  CommonJS.」→ 英文形 lives in/uses + 径指物，CommonJS 大写词干不中 →
  **幻言 1**、30、诞、exit 1；
- `wangwei`：write docs/report.md「安装说明见 https://example.com/guide/src/
  config.js 使用文档。」——URL 跨度内 token 不作指物（网卫）→ 虚指注记 1、
  0 分、彰、exit 0；
- `yiyan`：write docs/report.md「测试位于 tests 目录。」——目录指物 tests →
  **疑言 1**、min(40,15)=15、带「疑」、exit 0（黄牌不咬门）；`--gate 10` →
  15 红 exit 1；
- `baishi`：isError:true 之写（断言稿）不入稿账 → counts 全 0、paths 0、彰、
  exit 0；
- 合审 `hejian`（a 流 at100 目见 src/config.js + b 流 at200 断言稿）→ 见据在
  前清白、2 调用 2 会话、全 0、彰、exit 0；合审 `hechi`（a 流 at100 断言稿 +
  b 流 at200 目见）→ 见据在后 → 迟证注记 1、0 分、彰、exit 0；
- 合审 `huanyan + clean`：2 调用 → 幻言 2、60（cap）、诞、exit 1。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call、非 tool_call/result 事件〔turn_start/principal 等〕忽略）；对象键与工具族同全仓；径规整；**传账收全流、判言只判写**（write 族 p: ∧ `isError !== true` ∧ content 非空；isError===true 不入稿账、null 按已发生；observe/exec/other 永不判言）；**得言形**（中文 30 子串 ∪ 英文 23 词界，行内共现，否定形同案）；**指物三档**（径指物：slash ∪ 专名底表 10 ∪ dotfile ∪ 小写扩展名白名单 44；自指形 11 → 稿径；目录指物底表 18）；**网卫**（URL 跨度内不作指物）；**模态门**（中文 24 ∪ 英文 11 行级跳过，「将」单字不设门）；**见据三通道**（目见 observe 成功规整相等 ∪ 书见 write 成功〔含自指本笔〕∪ 验见 exec 成功原文含指物；先于本笔为据、后于本笔迟证注记、失败永不生据）；**基径**（证册 grounds glob）；**判定序锁死**（立案前豁免〔证册 excuse ∪ 靶场 10 名段〕→ 逐行〔模态 → 得言 → 指物 → 基径 → 见据 → 幻言/疑言/迟证/虚指〕；行=案、案案独立、同 token 重复只一案）；幻值 huan=min(60,30×hy)+yi=min(40,15×yy)、total=min(100)；分带 彰 0–14 / 疑 15–29 / 诞 ≥30；门默认 30——单幻言即红、双疑言即红、单疑言黄牌不咬门；judge 幂等——core 用例 ≥ 30 且全绿，断言恰好该分值与案名行号 | `npm test`（core 部分） | ✅ 34 用例全绿（core：流解析 1 + 对象与径规整 1 + 得言形中文 1 + 得言形英文 1 + 指物径形 1 + 目录指物与自指 1 + 网卫 1 + 模态门 1 + 目见 1 + 书见与自指 1 + 验见 1 + 迟证 1 + 基径与免审 1 + 判定序 1 + 行案独立 1 + 幻值门禁 1 + 败写 1 + 排序 1 + 末稿立撤 1 + judge 幂等 1 + 合审序 1 + 证册 1 + 证牌块 1 + 掩码 1 + 夹具全量·一 1 + 夹具全量·二 1 + 夹具全量·三 1 + 跨项目互认 1 + 规整相等 1 + 验见从宽 1 + 基径 glob 1 + 老流 null 1 + 门禁翻转与并行 1——断言恰好该分值与案名行号） |
| A2 | 夹具分数（先于实现手算定死） | 册夹具 `chachu-book.json`：excuse [`docs/reports/*`] + grounds [`src/config.js`]。`clean-stream`：1 调用、counts 全 0、幻值 0、彰、exit 0；`huanyan-stream`：1 调用 → 幻言 2、60（cap）、诞、exit 1；`duchuan-stream`：幻言 1、30、诞、exit 1；`mujian-stream`：2 调用 → 全 0、彰、exit 0；`shujian-stream`：2 调用 → 全 0（受审稿 2）、彰、exit 0；`xingjian-stream`：2 调用 → 全 0、彰、exit 0；`zizhi-stream`：1 调用 → 全 0、彰、exit 0；`chizheng-stream`：2 调用 → 迟证 1（cz=1）、0、彰、exit 0；`shibai-stream`：2 调用 → 幻言 1、30、诞、exit 1；`jiyan-stream` 带册：paths 1、全 0、彰、exit 0；jiyan 无册对照：幻言 1、30、诞、exit 1；`mianze-stream` 带册：paths 0、全 0、彰、exit 0；`bachang-stream`：靶场豁免、paths 0、全 0、彰、exit 0；`shimo-stream`：模态门、全 0、彰、exit 0；`yinyu-stream`：幻言 1、30、诞、exit 1；`xuzhi-stream`：虚指 1（xz=1）、0、彰、exit 0；`yingwen-stream`：幻言 1、30、诞、exit 1；`wangwei-stream`：虚指 1、0、彰、exit 0；`yiyan-stream`：疑言 1（yy=1）、15、疑、exit 0；`baishi-stream`：counts 全 0、paths 0、彰、exit 0；合审 `hejian-a + hejian-b`：2 调用 2 会话 → 全 0、彰、exit 0；合审 `hechi-a + hechi-b`：迟证 1、0、彰、exit 0；附加口径：`duchuan + --gate 40` → 30 过门 exit 0；`yiyan + --gate 10` → 15 红 exit 1 | core 断言 + CLI 复现 | ✅ 二十四条复现命令退出码逐字吻合（0/1/1/0/0/0/0/0/1/0/0/0/1/0/1/0/0/0/0/0 + jiyan 带册 0 无册 1 + hejian/hechi 0/0 + gate 40 过 0、gate 10 红 1）；分数与 counts 由 CLI 输出与 core 断言逐字段核对（clean 全 0 彰 / huanyan 幻言 2=60 cap 诞 / duchuan 单幻言 30 诞 / mujian 目见 2 调用 / shujian 书见受审稿 2 / xingjian 验见 / zizhi 自指 / chizheng 迟证 cz=1 / shibai 败见幻言 / jiyan 带册彰无册红 / mianze 免审 paths 0 / bachang 靶场 paths 0 / shimo 模态全 0 / yinyu 引语不避指物 AGENTS.md / xuzhi 虚指 xz=1 / yingwen 英文 30 / wangwei 网卫 xz=1 / yiyan 疑言 15 疑黄牌 / baishi 败写 paths 0） |
| A3 | 跨项目互认（外部夹具已实读核对：七流的写稿内容皆无「得言形 ∧ 指物 ∧ 无见据」——weizhao 流写稿用「规定」不在得言形表且 AGENTS.md 有目见） | zhizhi 的 `fixtures/sample-stream.jsonl`：calls 8、counts 全 0、彰、exit 0；kaocheng 的 `fixtures/mixed-stream.jsonl`：calls 4、counts 全 0；dingfen 的 `fixtures/fenced-stream.jsonl`：calls 6、counts 全 0；erbing 的 `fixtures/mixed-stream.jsonl` 与 `fixtures/delegated-stream.jsonl`：各 calls 5、counts 全 0；huashui 的 `fixtures/fuji-stream.jsonl`：calls 3、counts 全 0；jiaotuo 的 `fixtures/weizhao-stream.jsonl`：calls 2、counts 全 0（同格式流跨项目可审、互不误伤） | CLI 测试 | ✅ 七流零误伤（zhizhi sample 8 调用 / kaocheng mixed 4 调用 / dingfen fenced 6 调用 / erbing mixed 5 与 delegated 5 调用 / huashui fuji 3 调用 / jiaotuo weizhao 2 调用——counts 全 0、全彰带 exit 0；core 与 CLI 双路核验） |
| A4 | CLI 语义 | `audit` 多流合审 + `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 未知旗标 / 缺值 → exit 2；`register --path` 缺 --path → exit 2、重复登记去重、册缺失自动建册；`revoke` 无此径 → exit 2；`list` 册缺失 → exit 2；`block` 无册出确定性文本（证册公示是供给不是门禁）；`gate --value` 按门判 0/1（29 过 / 30 红 / --gate 50 时 45 过）；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ✅ 17 用例全绿（A2 复现逐条断言 + clean/huanyan/duchuan/mujian/shujian/xingjian/zizhi/shibai/jiyan 带册无册/mianze/bachang/shimo/yinyu/xuzhi/yingwen/wangwei/yiyan/baishi/hejian/hechi 逐字段断言 + 坏行报行号/缺流/未知旗标/--gate 缺值 exit 2 + register 缺 --path exit 2、自动建册去重、register 后 audit 免案生效 + revoke 无此径 exit 2 + list 缺册 exit 2 + block 无册确定性文本与增免案改变 + block shasum 双跑一致 + gate 29/30/--gate 50×45 + gate 缺值 exit 2 + --version/--help + 跨项目七流 CLI 复验） |
| A5 | 证牌块逐字节确定 | 同一证册两次 `chachu block` shasum 相同；增一免案后文本改变；无册输出确定性文本（`证册：未立（凡言必据）`）；块中不含行原文（只载 稿径:行:案别:指物:指纹——djb2 指纹与笔序） | CLI shasum 复现 | ✅ 逐字节一致（同册两次 block shasum 全等；增免案 legacy/* 后文本改变；无册块逐字含「证册：未立（凡言必据）」；行原文不进证牌见 core 掩码用例与集成 12 断言） |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载察传插件：失败探针也无条件到达工具本体（结构性零拦截）；净稿探针 → 0 过门；单幻言探针 → 30 诞门红；目见在前探针 → 0 过门；迟证探针 → 0 过门；疑言探针 → 15 过门（黄牌不咬门）；靶场探针 → 0；证册免案探针 → 0；基径探针 → 0；失败 write 探针不入稿账；`exportStream()` 导出流离线 `audit` 重放账实一致；gate 翻转 + 证牌块两次渲染逐字节相同且不含行原文——集成用例 ≥ 8 | 集成测试 | ✅ 14 用例全绿（真实管道挂载 npm 官方 @deepseek-ai/cordis@4.0.2 + @deepseek-ai/dsh-tools@0.0.1-rc.1：失败探针无条件到达工具本体、净稿 0 彰、单幻言 30 诞红、目见在前 0、迟证 0 过门、疑言 15 疑过门、靶场 0、证册免案 0、基径 0、失败写不入稿账、exportStream 重放账实一致 30、证牌两次渲染逐字节相同且不含行原文、gate 10 翻转 + report/ledger 口径、末稿立撤 0 过门） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证，ban 表累加至 zhixia 全部机制词） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出（grep3 覆盖 256+ 词含 zhixia 全部机制词；机制词 20 词对全仓 ban 表双向子串零撞）；实现期注释防撞修正一笔（「末稿」zhixia 占取「新稿立撤」） |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ✅ 65 tests, 65 pass（core 34 + cli 17 + 集成 14，0 跳过） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅（本行即 A9 验证；根 README #40 行见交付提交） |

## 复现命令

```bash
cd chachu
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/chachu.js audit fixtures/clean-stream.jsonl; echo $?                                           # 0（彰）
node src/bin/chachu.js audit fixtures/huanyan-stream.jsonl; echo $?                                         # 1（幻言 60 cap）
node src/bin/chachu.js audit fixtures/duchuan-stream.jsonl; echo $?                                         # 1（单幻言 30）
node src/bin/chachu.js audit fixtures/mujian-stream.jsonl; echo $?                                          # 0（目见在前）
node src/bin/chachu.js audit fixtures/shujian-stream.jsonl; echo $?                                         # 0（书见）
node src/bin/chachu.js audit fixtures/xingjian-stream.jsonl; echo $?                                        # 0（验见）
node src/bin/chachu.js audit fixtures/zizhi-stream.jsonl; echo $?                                           # 0（自指）
node src/bin/chachu.js audit fixtures/chizheng-stream.jsonl; echo $?                                        # 0（迟证注记）
node src/bin/chachu.js audit fixtures/shibai-stream.jsonl; echo $?                                          # 1（失败之见不是见）
node src/bin/chachu.js audit fixtures/jiyan-stream.jsonl --file fixtures/chachu-book.json; echo $?          # 0（基径）
node src/bin/chachu.js audit fixtures/jiyan-stream.jsonl; echo $?                                           # 1（无册对照）
node src/bin/chachu.js audit fixtures/mianze-stream.jsonl --file fixtures/chachu-book.json; echo $?         # 0（免审）
node src/bin/chachu.js audit fixtures/bachang-stream.jsonl; echo $?                                         # 0（靶场豁免）
node src/bin/chachu.js audit fixtures/shimo-stream.jsonl; echo $?                                           # 0（模态门）
node src/bin/chachu.js audit fixtures/yinyu-stream.jsonl; echo $?                                           # 1（引语不避）
node src/bin/chachu.js audit fixtures/xuzhi-stream.jsonl; echo $?                                           # 0（虚指注记）
node src/bin/chachu.js audit fixtures/yingwen-stream.jsonl; echo $?                                         # 1（英文幻言）
node src/bin/chachu.js audit fixtures/wangwei-stream.jsonl; echo $?                                         # 0（网卫）
node src/bin/chachu.js audit fixtures/yiyan-stream.jsonl; echo $?                                           # 0（疑言黄牌）
node src/bin/chachu.js audit fixtures/baishi-stream.jsonl; echo $?                                          # 0（败写不入稿账）
node src/bin/chachu.js audit fixtures/hejian-a.jsonl fixtures/hejian-b.jsonl; echo $?                       # 0（合审目见在前）
node src/bin/chachu.js audit fixtures/hechi-a.jsonl fixtures/hechi-b.jsonl; echo $?                         # 0（合审迟证）
node src/bin/chachu.js audit fixtures/duchuan-stream.jsonl --gate 40; echo $?                               # 0（30 过门）
node src/bin/chachu.js audit fixtures/yiyan-stream.jsonl --gate 10; echo $?                                 # 1（15 翻红）
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；
第二条为插件结构性零拦截自检；第三条为机制词防撞自检——相邻各层的机制词不得出现在本层
源码，ban 表累加至 zhixia 全部机制词；本层避开了「言形」（zhibi「吞言形」占取，取
「得言形」全称）、「行见」（全仓 A9 行散文「行见交付提交」高频，取「验见」）、「证账」
（yuli 散文「保证账」子串占取，账名取「传账」）、「凡稿皆审」（zhixia 占用，取「凡言
必据」）、「自称」（jiaotuo「自称原文」核心话术占取，取「自指」）、「断言形」意近弃用、
「引形/状词/托径」（jiaotuo/shihu 占）不涉）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|契径|工据|工见|灭据|末据|幽物|灭物|壳物|畸物|疵物|诚物|诚值|考牌|结形|域条|卷条|典形|典册|改典|复典|灭典|宪案|禁案|章案|法值|法牌|开门|知面|行面|戒形|戒体|戒词|必行词|宥词|先悖|试违|违知|行值|合牌|化知|缺行|湮形|空捕|空还|空接|导词|川册|塞值|导牌|文账|沙川|已浚|净川|码面|增附|去锁|越源|钩入|籍面|籍账|籍形|命籍|纳籍|准值|准牌|附名|遂形|遂账|遂键|遂册|遂牌|初遂|承施|凭消|消词|命词|豁施|重决|重值|允列|段施|文据|旧据|变写|陈写|陈线|新线|覆世|覆己|覆案|失鲜|许复|陈值|陈改|水牌|水册|画水|约形|公面|约据|约册|约牌|面集|削名|哑削|明削|削值|约改|世据|守约|背约|约法|帚账|唯写|末卷|垢形|垢值|留册|垢门|扫牌|试验场|洁蒙|市虎|虎值|虚功|陈报|状词|成报|勾选形|里程碑形|交接形|虎账|虎牌|市册|中状形|中状册|状账|状牌|状面形|状键词|声明形|旗标形|弱锁形|验锁|网锁|拆锁|遇阻|素拆|复锁|锁册|锁值|锁牌|阻词|校场|阻账|尾文|帚牌|引词|掠据|矫制|矫托|托面|引形|引语|诏账|诏本|矫引|佚据|征引|征据|泛引|阙据|托主|托径|诏册|矫值|矫牌|指瑕|瑕账|瑕册|瑕值|瑕牌|瑕形|数言|列块|表块|乖列|乖总|倒期|阙列|已磨|末稿|试场" src/core src/plugin
```

（ban 表累计至 zhixia；本层机制词 20——察传/得言/得言形/指物/自指/见据/目见/书见/
验见/基径/证册/证牌/传账/幻言/疑言/迟证/虚指/幻值/靶场/网卫——对全仓 ban 表双向子串
零撞、repo 散文零占位，交付时复核。）

## 实测记录（2026-09-18，本机复跑真实输出）

- `npm test`：**65 tests, 65 pass, 0 fail, 0 skipped**（core 34 + cli 17 + 集成 14；集成挂载 npm 官方 `@deepseek-ai/cordis@4.0.2` + `@deepseek-ai/dsh-tools@0.0.1-rc.1` 真实管道）。
- A2 二十四条复现命令退出码逐字吻合：clean 0/彰 · huanyan 60cap/诞/红 · duchuan 30/诞/红 · mujian 0 目见 · shujian 0 书见受审稿 2 · xingjian 0 验见 · zizhi 0 自指 · chizheng 迟证 cz=1 · shibai 败见幻言 30 红 · jiyan 带册 0 无册 1 红 · mianze 带册 paths 0 · bachang 靶场 paths 0 · shimo 模态全 0 · yinyu 引语不避 30 红 · xuzhi 虚指 0 · yingwen 英文 30 红 · wangwei 网卫 0 · yiyan 疑言 15 疑过 · baishi 败写 paths 0 · hejian/hechi 合审 0/0 · duchuan+--gate 40 过 · yiyan+--gate 10 红。
- A3 跨项目七流零误伤（zhizhi/kaocheng/dingfen/erbing×2/huashui/jiaotuo，counts 全 0；夹具先实读原文核对——weizhao 流写稿用「规定」不在得言形表且 AGENTS.md 有目见）。
- A5 证牌块：无册确定性文本逐字吻合；同册两次输出 shasum 相同；增免案后文本改变。
- A7 三组 grep（模型无关 / 无 pre-execute / 机制词防撞）均无输出。
- 实现期缺陷与测试缺陷如实记（标准未动，全部按 docs/03 改实现或改测试笔误）：
  ①issues 排序测试初稿把案别排在行号前——03 §7 锁死「稿径 → 行号 → 案别」，改测试；
  ②证牌块测试误用带基径之册（grounds 清白了幻言，块里无案可点）——改测试换无基径之册；
  ③A2 复现循环把 mianze 直审（该夹具须带册才免案）——改测试编排带册四条单列；
  ④「list 缺册 exit 2」用例复用了刚建过册的目录——改测试换未建册目录；
  ⑤--version 断言未容 stdout 尾随换行——改测试 trim；
  ⑥deyan 词法实现补丁两笔（实现期、先于测试落盘）：token 尾部句点剥除（「…src/config.js.」句号粘尾致见据比对失败之诬）、dotfile 规则排除裸扩展名（`.js`/`.env` 类不作指物——宁纵）；
  ⑦shenyan 三笔（实现期）：notes 排序比较符优先级笔误、书见「本笔即据」（显式写稿径的断言同自指清白——03 §6 本有之义）、基径匹配先规整径。
- A2 手算勘误：无（夹具定义即手算对象，先于实现落盘，二十四条逐字吻合；上面 ①–⑤ 是测试笔误，⑥⑦ 是实现对词法边界的细化，不是手算勘误）。
- 机制词防撞：机制词 20 词（察传/得言/得言形/指物/自指/见据/目见/书见/验见/基径/证册/证牌/传账/幻言/疑言/迟证/虚指/幻值/靶场/网卫）对全仓 ban 表双向子串零撞、repo 散文零占位；避开「言形」（zhibi「吞言形」占）取「得言形」全称、「行见」（全仓 A9 行散文高频）取「验见」、「证账」（yuli 散文「保证账」子串占）取「传账」、「凡稿皆审」（zhixia 占）取「凡言必据」、「自称」（jiaotuo「自称原文」话术占）取「自指」、「末稿」（zhixia 占）改述「新稿立撤」。
