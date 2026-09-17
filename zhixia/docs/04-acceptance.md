# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（夹具已先行落盘，数言/列块/表账/日序按实际内容逐夹具核算——见 docs/03）；
> 实现与测试若与手算冲突，只能改实现，不得改本表。

## 手算底稿（先于实现，逐夹具锁死）

- `clean`：write docs/notes.md「重构说明：调整了内部实现，补了对应测试。」→
  无数言/无表块/无日期 → counts 全 0、瑕值 0、带「净」、exit 0；
- `guailie`：write docs/report.md——「本次共 5 项：」言后空行透明、列块 3 行
  （- 空指针防护/- 越界检查/- 内存泄漏修复），空行后「全部已验证。」止 →
  言 5 实 3 → **乖列 1**、min(60,30)=30、带「疵」、exit 1（单乖列即红）；
- `shuangli`：两处乖列——「以下 2 步：」列实 3（有序块 1./2./3.）、「遗留共
  3 个问题：」列实 2 → **乖列 2**、min(60,60)=60（cap）、疵、exit 1；
- `zhenglie`：「以下 3 步：」列实 3 ✓、「前述 3 步已排定」向上块列实 3 ✓
  → 全 0、净、exit 0（下向上向双向清白）；
- `guaizong`：支出表——表块 6 行有效（第 2 行分隔行）、合计行恰 1、
  金额列全整数（40/30/20）、合计 100 → 和 90 ≠ 100 → **乖总 1**、30、疵、
  exit 1（案记合计行行号）；
- `hezong`：同表合计 90 → 和 90 = 90 → 全 0、净、exit 0；
- `xiaoshu`：占比列 33.3/33.3/33.4 全小数 → 该列跳过（四舍五入的世界）→
  全 0、净、exit 0；
- `duohe`：表内「合计」行 2 → 合计行数 ≠ 1 整表跳过（分组小计）→ 全 0、净、
  exit 0；
- `daoqi`：「开发窗口：2026-09-10 至 2026-09-05。」起 > 止 → **倒期 1**、
  min(40,15)=15、带「瑕」、exit 0（黄牌不咬门）；「2026-09-01 到
  2026-09-09」「2026-09-20 至 2026-09-25」有序不判；
- `shuangdao`：两处起 > 止（2026-10-01 至 2026-09-28、2026-11-02 至
  2026-10-30，皆列行受审）→ **倒期 2**、min(40,30)=30、疵、exit 1
  （双倒期即红）；
- `quelie`：「本次共 3 个遗留问题。」言后 gap 1（一段散文）至文档尽无块 →
  **阙列注记 1**、0、净、exit 0；
- `mianze`（带册 docs/reports/*）：径命中豁免 → paths 0、全 0、净、exit 0；
  **无册对照**：同稿「本次共 5 项：」列实 3 → **乖列 1**、30、疵、exit 1；
- `xiaochang`：write tests/fixtures/handoff.md 乖列稿 → 试场名段豁免（无册）
  → paths 0、全 0、净、exit 0；
- `xianmo`：同径两写——前稿「共 5 项」列实 2 有案，新稿「共 2 项」列实 2
  已净 → 旧案全撤 + **已磨注记 1**、0、净、exit 0（2 调用、rows 只算末稿）；
- `baishi`：isError:true 之写（乖列稿）不入账 → counts 全 0、paths 0、净、
  exit 0；
- `yingwen`：「The following 3 items were fixed:」方向形（following→向下）
  + 冒号形跨形去重取一 → 言后空行透明列块 4 行 → 言 3 实 4 → **乖列 1**、
  30、疵、exit 1；
- `gelie`：「共 2 项：」言后 heading（gap 1）+ 空行 + 列块 2 → gap ≤ 2 认块、
  言 2 实 2 ✓ → 全 0、净、exit 0；
- 合审 `guailie + clean`：2 调用 → 乖列 1、30、疵、exit 1；附加口径：
  `daoqi + --gate 10` → 15 红 exit 1；`guailie + --gate 40` → 30 过门 exit 0。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call）；对象键与工具族同全仓；径规整；**瑕账只收写**（write 族 p: ∧ `isError !== true` ∧ content 非空；isError===true 不入账、null 按已发生；observe/exec/other 永不受审）；**以末稿为准**（同径新稿落地即审、旧案全撤、先瑕后磨已磨注记 0 分）；**数言词法**（中文方向词 12〔上 3/下 3/无向 6〕×量词 30 ∪ 英文方向形 7 前缀/冒号形跨形去重；N≥2 方成言；非列非表行才生言）；**列块/表块**（列前缀/表前缀、方向档、块窗 gap ≤ 2、空行透明、表块有效形 ≥3 行含分隔行、列实 M=列块行数或表数据行数）；**表账**（合计行数 ≠1 整表跳过、行列不齐跳过、整数格剥千分位/百分号/币符、逐列 Σ ≠ 合计 → 乖总）；**日序**（ISO 对连接词 10、历法门、起 > 止 → 倒期）；**判定序锁死**（立案前豁免〔瑕册 ∪ 试场 10 名段〕→ 乖总/乖列/阙列/倒期/已磨三形并行案案独立）；瑕值 xia=min(60,30×gl)+min(60,30×gz)+min(40,15×dq)、total=min(100)；分带 净 0–14 / 瑕 15–29 / 疵 ≥30；门默认 30——单乖列即红、单乖总即红、双倒期即红、单倒期黄牌不咬门；judge 幂等——core 用例 ≥ 30 且全绿，断言恰好该分值与案名行号 | `npm test`（core 部分） | ✅ 31 用例全绿（core：流解析 1 + 对象与径规整 1 + 数言中文 2 + 数言英文 1 + 列块扫描 1 + 表块识别 1 + 表账解析 1 + 倒期词法 1 + 通道 1 + 末稿立撤 1 + 豁免 1 + 判定序 1 + 表账独立 1 + 三形并行 1 + 数言指表块 1 + 瑕值门禁 1 + judge 幂等 1 + issues 排序 1 + 乖总掩码 1 + 瑕牌块 1 + 瑕册 1 + 合审序 1 + 跨会话末稿 1 + 夹具全量 1 + 跨项目互认 1 + exec/observe 对照 1 + collectList/runTop 1 + claimTableRows 1 + 无向先下后上 1 + gap 计数 1——断言恰好该分值与案名行号） |
| A2 | 夹具分数（先于实现手算定死） | 册夹具 `zhixia-book.json`：excuse [`docs/reports/*`]。`clean-stream`：1 调用、counts 全 0、瑕值 0、带「净」、exit 0；`guailie-stream`：1 调用 → 乖列 1、30、疵、exit 1；`shuangli-stream`：1 调用 → 乖列 2、60（cap）、疵、exit 1；`zhenglie-stream`：1 调用 → 全 0、净、exit 0；`guaizong-stream`：1 调用 → 乖总 1、30、疵、exit 1；`hezong-stream`：全 0、净、exit 0；`xiaoshu-stream`：全 0（小数列跳过）、净、exit 0；`duohe-stream`：全 0（双合计跳过）、净、exit 0；`daoqi-stream`：倒期 1（dq=1）、15、瑕、exit 0（黄牌不咬门）；`shuangdao-stream`：倒期 2、30、疵、exit 1；`quelie-stream`：阙列 1（que=1）、0、净、exit 0；`mianze-stream` 带册：paths 0、全 0、净、exit 0；mianze 无册对照：乖列 1、30、疵、exit 1；`xiaochang-stream`：试场豁免、paths 0、全 0、净、exit 0；`xianmo-stream`：2 调用 → 已磨 1（mo=1）、0、净、exit 0；`baishi-stream`：1 调用 → counts 全 0、paths 0、净、exit 0；`yingwen-stream`：乖列 1、30、疵、exit 1；`gelie-stream`：全 0（gap 1 认块言 2 实 2）、净、exit 0；合审 `guailie + clean`：2 调用 → 乖列 1、30、疵、exit 1；附加口径：`daoqi + --gate 10` → 15 红 exit 1；`guailie + --gate 40` → 30 过门 exit 0 | core 断言 + CLI 复现 | ✅ 二十一条复现命令退出码逐字吻合（0/1/1/0/1/0/0/0/0/1/0/0/1/0/0/0/1/0/1/1/0）；分数与 counts 由 CLI 输出与 core 断言逐字段核对（clean 全 0 净 / guailie 乖列 30 疵 / shuangli 乖列 2=60 cap / zhenglie 上下向皆敷 / guaizong 乖总 30 言 100 和 90 / hezong 相敷 / xiaoshu 小数列跳 / duohe 双合计跳 / daoqi 倒期 15 瑕过 / shuangdao 倒期 2=30 疵 / quelie 阙列注记 / mianze 带册 paths 0、无册 30 红 / xiaochang 试场 paths 0 / xianmo 已磨 1 / baishi 全 0 / yingwen 英文言 3 实 4 / gelie gap 1 认块 / 合审 2 调用 30 / --gate 口径两条） |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl`：calls 8、counts 全 0、净、exit 0；kaocheng 的 `fixtures/mixed-stream.jsonl`：calls 4、counts 全 0；dingfen 的 `fixtures/fenced-stream.jsonl`：calls 6、counts 全 0；erbing 的 `fixtures/mixed-stream.jsonl` 与 `fixtures/delegated-stream.jsonl`：各 calls 5、counts 全 0；huashui 的 `fixtures/fuji-stream.jsonl`：calls 3、counts 全 0；jiaotuo 的 `fixtures/weizhao-stream.jsonl`：calls 2、counts 全 0（引语稿无数言/无表块/无 ISO 对——同格式流跨项目可审、互不误伤） | CLI 测试 | ✅ 七流零误伤（zhizhi sample 8 调用 / kaocheng mixed 4 调用 / dingfen fenced 6 调用 / erbing mixed 5 与 delegated 5 调用 / huashui fuji 3 调用 / jiaotuo weizhao 2 调用——counts 全 0、全净带 exit 0） |
| A4 | CLI 语义 | `audit` 多流合审 + `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 未知旗标 / 缺值 → exit 2；`register --path` 缺 --path → exit 2、重复登记去重、册缺失自动建册；`revoke` 无此径 → exit 2；`list` 册缺失 → exit 2；`block` 无册出确定性文本（瑕册公示是供给不是门禁）；`gate --value` 按门判 0/1（29 过 / 30 红 / --gate 50 时 45 过）；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ✅ 20 用例全绿（A2 十六夹具退出码逐条断言 + clean/guailie/daoqi/shuangdao/guaizong/quelie/xianmo/mianze 逐字段断言 + 合审 + --file/--gate/--json + 坏行报行号/缺流/未知旗标/零流 exit 2 + register 缺 --path exit 2、自动建册去重、register 后 audit 免案生效 + revoke 无此径 exit 2 + list 缺册 exit 2 + block 无册确定性文本与增免案改变 + block shasum 双跑一致 + gate 29/30/--gate 50×45 + gate 缺值 exit 2 + --version/--help） |
| A5 | 瑕牌块逐字节确定 | 同一瑕册两次 `zhixia block` shasum 相同；增一免案后文本改变；无册输出确定性文本（`瑕册：未立（凡卷皆审）`）；块中不含行原文（只载 径:行:案别:数据:指纹——djb2 指纹与笔序） | CLI shasum 复现 | ✅ 逐字节一致（同册两次 block shasum 全等；增免案 legacy/* 后文本改变；无册块逐字含「瑕册：未立（凡卷皆审）」；行原文不进瑕牌见 core 乖总掩码与集成 11 断言） |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载指瑕插件：失败探针也无条件到达工具本体（结构性零拦截）；净稿探针 → 0 过门；乖列探针（言 5 列实 3）→ 30 疵门红；言列相敷探针 → 0 过门；倒期探针 → 15 过门（黄牌不咬门）；阙列探针 → 0；试场探针 → 0；瑕册免案探针 → 0；失败 write 探针不入账；`exportStream()` 导出流离线 `audit` 重放账实一致；gate 翻转 + 瑕牌块两次渲染逐字节相同且不含行原文——集成用例 ≥ 8 | 集成测试 | ✅ 14 用例全绿（真实管道挂载 npm 官方 @deepseek-ai/cordis@4.0.2 + @deepseek-ai/dsh-tools@0.0.1-rc.1：失败探针无条件到达工具本体、净稿 0 净、乖列 30 疵红、言列相敷 0、倒期 15 瑕过、阙列 0、试场 0、瑕册免案 0、失败写不入账、exportStream 重放账实一致 30、瑕牌两次渲染逐字节相同且不含行原文、gate 10 翻转 + report/ledger 口径、乖总探针 30 门红、末稿立撤已磨 0 过门） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证，ban 表累加至 jiaotuo 全部机制词） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出（grep3 覆盖 240+ 词含 jiaotuo 全部机制词；机制词 16 词对全仓 ban 表双向子串零撞）；实现期注释防撞修正三笔（「末卷」saowu 占取「末稿」、「唯写」saowu 占改述「瑕账只收写」、「已校」散文「已校验」高频取「已磨」；「校场/试验场」已占取「试场」） |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ✅ 65 tests, 65 pass（core 31 + cli 20 + 集成 14，0 跳过） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅（本行即 A9 验证；根 README #39 行见交付提交） |

## 复现命令

```bash
cd zhixia
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/zhixia.js audit fixtures/clean-stream.jsonl; echo $?                                            # 0（净）
node src/bin/zhixia.js audit fixtures/guailie-stream.jsonl; echo $?                                          # 1（乖列 30）
node src/bin/zhixia.js audit fixtures/shuangli-stream.jsonl; echo $?                                         # 1（乖列 60 cap）
node src/bin/zhixia.js audit fixtures/zhenglie-stream.jsonl; echo $?                                         # 0（言列相敷）
node src/bin/zhixia.js audit fixtures/guaizong-stream.jsonl; echo $?                                         # 1（乖总 30）
node src/bin/zhixia.js audit fixtures/hezong-stream.jsonl; echo $?                                           # 0（总分相敷）
node src/bin/zhixia.js audit fixtures/xiaoshu-stream.jsonl; echo $?                                          # 0（小数列跳过）
node src/bin/zhixia.js audit fixtures/duohe-stream.jsonl; echo $?                                            # 0（双合计跳过）
node src/bin/zhixia.js audit fixtures/daoqi-stream.jsonl; echo $?                                            # 0（倒期黄牌）
node src/bin/zhixia.js audit fixtures/shuangdao-stream.jsonl; echo $?                                        # 1（双倒期 30）
node src/bin/zhixia.js audit fixtures/quelie-stream.jsonl; echo $?                                           # 0（阙列注记）
node src/bin/zhixia.js audit fixtures/mianze-stream.jsonl --file fixtures/zhixia-book.json; echo $?          # 0（免案）
node src/bin/zhixia.js audit fixtures/mianze-stream.jsonl; echo $?                                           # 1（无册对照）
node src/bin/zhixia.js audit fixtures/xiaochang-stream.jsonl; echo $?                                        # 0（试场豁免）
node src/bin/zhixia.js audit fixtures/xianmo-stream.jsonl; echo $?                                           # 0（已磨）
node src/bin/zhixia.js audit fixtures/baishi-stream.jsonl; echo $?                                           # 0（失败写不入账）
node src/bin/zhixia.js audit fixtures/yingwen-stream.jsonl; echo $?                                          # 1（英文乖列）
node src/bin/zhixia.js audit fixtures/gelie-stream.jsonl; echo $?                                            # 0（gap 1 认块）
node src/bin/zhixia.js audit fixtures/guailie-stream.jsonl fixtures/clean-stream.jsonl; echo $?              # 1（合审）
node src/bin/zhixia.js audit fixtures/daoqi-stream.jsonl --gate 10; echo $?                                  # 1（翻红）
node src/bin/zhixia.js audit fixtures/guailie-stream.jsonl --gate 40; echo $?                                # 0（过门）
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；
第二条为插件结构性零拦截自检；第三条为机制词防撞自检——相邻各层的机制词不得出现在本层
源码，ban 表累加至 jiaotuo 全部机制词；本层避开了「末卷」（saowu 占）与「末据」（kaocheng
占）取「末稿」、「唯写」（saowu 占）改述「瑕账只收写」、「已校」（散文「已校验」高频）
取「已磨」、「卷面」（全仓散文高频）弃用、「校场」（yidao 占）与「试验场」（saowu 占）
取「试场」、「托面」（jiaotuo 占）弃用、「征引」意近弃用）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|契径|工据|工见|灭据|末据|幽物|灭物|壳物|畸物|疵物|诚物|诚值|考牌|结形|域条|卷条|典形|典册|改典|复典|灭典|宪案|禁案|章案|法值|法牌|开门|知面|行面|戒形|戒体|戒词|必行词|宥词|先悖|试违|违知|行值|合牌|化知|缺行|湮形|空捕|空还|空接|导词|川册|塞值|导牌|文账|沙川|已浚|净川|码面|增附|去锁|越源|钩入|籍面|籍账|籍形|命籍|纳籍|准值|准牌|附名|遂形|遂账|遂键|遂册|遂牌|初遂|承施|凭消|消词|命词|豁施|重决|重值|允列|段施|文据|旧据|变写|陈写|陈线|新线|覆世|覆己|覆案|失鲜|许复|陈值|陈改|水牌|水册|画水|约形|公面|约据|约册|约牌|面集|削名|哑削|明削|削值|约改|世据|守约|背约|约法|帚账|唯写|末卷|垢形|垢值|留册|垢门|扫牌|试验场|洁蒙|市虎|虎值|虚功|陈报|状词|成报|勾选形|里程碑形|交接形|虎账|虎牌|市册|中状形|中状册|状账|状牌|状面形|状键词|声明形|旗标形|弱锁形|验锁|网锁|拆锁|遇阻|素拆|复锁|锁册|锁值|锁牌|阻词|校场|阻账|尾文|帚牌|引词|掠据|矫制|矫托|托面|引形|引语|诏账|诏本|矫引|佚据|征引|征据|泛引|阙据|托主|托径|诏册|矫值|矫牌" src/core src/plugin
```

（ban 表累计至 jiaotuo；本层机制词 16——指瑕/瑕账/瑕册/瑕值/瑕牌/瑕形/数言/列块/表块/
乖列/乖总/倒期/阙列/已磨/末稿/试场——对全仓双向子串零撞，交付时复核。）

## 实测记录（2026-09-18，本机复跑真实输出）

- `npm test`：**65 tests, 65 pass, 0 fail, 0 skipped**（core 31 + cli 20 + 集成 14；集成挂载 npm 官方 `@deepseek-ai/cordis@4.0.2` + `@deepseek-ai/dsh-tools@0.0.1-rc.1` 真实管道）。
- A2 二十一条复现命令退出码逐字吻合：clean 0/净 · guailie 30/疵/红 · shuangli 60cap/疵/红 · zhenglie 0 净 · guaizong 乖总 30/疵/红 · hezong 0 · xiaoshu 0 · duohe 0 · daoqi 倒期 15/瑕/过 · shuangdao 30/疵/红 · quelie 阙列 0 · mianze 带册 paths 0、无册 30 红 · xiaochang 试场 0 · xianmo 已磨 0 · baishi 0 · yingwen 30/疵/红 · gelie 0 · 合审 30/红 · daoqi+--gate 10 红 · guailie+--gate 40 过。
- A3 跨项目七流零误伤（zhizhi/kaocheng/dingfen/erbing×2/huashui/jiaotuo，counts 全 0）。
- A5 瑕牌块：无册确定性文本逐字吻合；同册两次输出 shasum 相同；增免案后文本改变。
- A7 三组 grep（模型无关 / 无 pre-execute / 机制词防撞）均无输出。
- 实现期缺陷与测试缺陷如实记（标准未动，全部按 docs/03 改实现或改测试笔误）：
  ①向上数言取块：scanBlock 向上命中的是连绵块**底端**，collectList 只向前数——zhenglie 手算「前述 3 步」实 1 非 3。改实现：runTop 把块起点扩到连绵块顶端（对称于向前的空行透明语义）；
  ②数言指表块：初版直接复用 §5 parseTable 的「合计行数 ≠1 整表跳过」判 M——03 §4 锁死的是「M=数据行数（去表头/分隔/合计行）」不问合计行数。改实现：新增 claimTableRows，单合计行条件只归 §5 表账；
  ③测试笔误五笔：一行多言用例误含无方向词的「另有 2 条」、词法层用例误期望引擎侧列行过滤、一处三参 assert.equal 写法、三形并行用例首断言与自身注释矛盾、CLI gate 缺值断言正则不符——均改测试，实现口径未动。
- A2 手算勘误：无（夹具先落盘、手算先于实现，二十一条逐字吻合；上面 ①② 是实现对标准的偏差，不是手算勘误）。
- 机制词防撞：机制词 16 词（指瑕/瑕账/瑕册/瑕值/瑕牌/瑕形/数言/列块/表块/乖列/乖总/倒期/阙列/已磨/末稿/试场）对全仓 ban 表双向子串零撞、repo 散文零占位；避开「末卷」（saowu 占）与「末据」（kaocheng 占）取「末稿」、「唯写」（saowu 占）改述「瑕账只收写」、「已校」（散文「已校验」高频）取「已磨」、「卷面」（全仓散文高频）弃用、「校场」（yidao 占）与「试验场」（saowu 占）取「试场」、「托面」（jiaotuo 占）弃用、「后净」（散文占用 4 处）取「已磨」。
