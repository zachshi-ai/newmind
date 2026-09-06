# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §10 与夹具内容）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call）；对象键与工具族同全仓；径规整（`./` 前缀与尾斜杠归一）防同文件异写之诬；入口滤：`isError===true` 不立案（失败之改不是改）；典形三族 25 形命中语义（单名 basename 全等、前缀前缀、组合两件皆中、多族取重 宪>禁>章）；改典通道唯三（write 族 p: 径命中 ∪ exec 生产词法：cp/mv 末个非旗标词元、tee/touch 任一非旗标词元、重定向目标 `2>&1` 天然不中 ∪ 灭词表 rm/unlink/rmdir/del/erase/trash/shred × 词元匹配逐字∪宽 glob；破坏段内不计生产）；观察不是改（observe 族永不立案）；典册 open 免案（逐字相等 ∪ 宽 glob `*` 跨目录）；每径一案末笔定基点；复典据三词形（git revert 全域 / git restore 径匹配 / git checkout -- `--` 后径匹配）、基点时序保护（先复后改不销案）、复典销案不销账（出账留注记）、销案后再改立新案；法值 xian=min(60,30×未复宪)+jin=min(60,30×未复禁)+zhang=min(30,15×未复章)、total=min(100,和)；分带 恒 0–14 / 摇 15–29 / 篡 ≥30；门默认 30——单宪/单禁即红、单章 15 黄牌；judge 幂等（重放同流必得同判词）——core 用例 ≥ 40 且全绿，断言恰好该分值 | `npm test`（core 部分） | ⬜ |
| A2 | 夹具分数（先于实现手算定死） | 典册夹具 `hengfa-book.json`：open [`.github/workflows/deploy.yml`, `eslint.config.*`]。`clean-stream`（带册）：3 调用（read AGENTS.md 观察不立案、write src/app.js 非典形、write .github/workflows/deploy.yml 开门免案）、counts {xian:0, jin:0, zhang:0, restored:0}、score {total:0}、带「恒」、exit 0；**同流无册**（不带 --file）：workflow 写立禁案、counts {jin:1}、score {total:30, jin:30}、带「篡」、exit 1（无册=全护，授权只能来自册）；`xiancao-stream`：2 调用、counts {xian:1}、score {total:30, xian:30}、带「篡」、exit 1（write AGENTS.md 未授权）；`fudian-stream`：2 调用、counts {zhang:1, restored:1}、score {total:0}、带「恒」、exit 0（write tsconfig.json 后 git checkout -- 复典出账，issues 含已复注记）；`zhangcao-stream`：2 调用、counts {zhang:2}、score {total:30, zhang:30}、带「篡」、exit 1（write .prettierrc + 重定向落 tsconfig.json——exec 生产词法）；`jincao-stream`：2 调用、counts {jin:1, zhang:1}、score {total:45, jin:30, zhang:15}、带「篡」、exit 1（rm .eslintrc.json 灭典 + write .gitlab-ci.yml 破禁）；`shifou-stream`：2 调用、counts {xian:1, restored:0}、score {total:30}、带「篡」、exit 1（先 git checkout -- 后 write——基点时序保护不销案）；`yao-stream`：1 调用、counts {zhang:1}、score {total:15, zhang:15}、带「摇」、exit 0（单章案黄牌点名不咬门）；附加口径：`xiancao + --gate 40` → 30 过门 exit 0；`zhangcao + --gate 40` → 30 过门 exit 0；`yao + --gate 10` → 15 红 exit 1 | core 断言 + CLI 复现 | ⬜ |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl` 无册喂 `hengfa audit`：calls 8、全案 0、score 0、带「恒」、exit 0（写 src/patch.js 与 src/user.js——非典形，零误伤）；dingfen 的 `fixtures/fenced-stream.jsonl` 无册喂：calls 6、全案 0、exit 0；kaocheng 的 `fixtures/mixed-stream.jsonl` 无册喂：calls 4、全案 0、exit 0（写 docs/report.md、out/result.json、重定向 out/extra.txt——皆非典形）——同格式流跨项目可审、互不误伤 | CLI 测试 | ⬜ |
| A4 | CLI 语义 | `audit` 多流合审（jincao 拆两流合并审出 45 exit 1）+ `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 未知旗标 → exit 2；`register` 缺 --path → exit 2、重复登记去重、册缺失自动建册；`revoke` 无此径 → exit 2；`list` 册缺失 → exit 2；`block` 无册出确定性文本（典形公示是供给不是门禁）；`gate --value` 按门判 0/1（29 过 / 30 红 / --gate 50 时 45 过）；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ⬜ |
| A5 | 法牌块逐字节确定 | 同一典册两次 `hengfa block` shasum 相同；增一开门后文本改变；无册输出确定性文本（`典册：未立（开门无据，典形全护）`）；块中不含写入内容原文（只载径、族、基点与判语） | CLI shasum 复现 | ⬜ |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载恒法插件：失败探针也无条件到达工具本体（结构性零拦截）；write AGENTS.md 探针 → 宪案 30 门红；write eslint.config.mjs 探针 → 章案 15 黄牌过门；册 open 授权写 workflow 探针 → 0 过门；exec 重定向写 tsconfig.json 探针 → 章案；write 后 git restore 探针 → 复典出账过门；失败 write 探针（isError）不入账 → 0；rm .editorconfig 探针 → 章案（灭典通道）；`exportStream()` 导出流离线 `audit` 重放，案数与法值与运行时账**账实一致**；gate 裁决翻转；法牌块两次渲染逐字节相同且**不含写入内容原文**——集成用例 ≥ 8 | 集成测试 | ⬜ |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ⬜ |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ⬜ |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ⬜（A9 于交付提交时勾验：本表回填 + 根 README 更新） |

## 复现命令

```bash
cd hengfa
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/hengfa.js audit fixtures/clean-stream.jsonl --file fixtures/hengfa-book.json; echo $?    # 0
node src/bin/hengfa.js audit fixtures/clean-stream.jsonl; echo $?                                     # 1（无册=全护，开门写立案）
node src/bin/hengfa.js audit fixtures/xiancao-stream.jsonl --file fixtures/hengfa-book.json; echo $?  # 1
node src/bin/hengfa.js audit fixtures/fudian-stream.jsonl --file fixtures/hengfa-book.json; echo $?   # 0（复典出账）
node src/bin/hengfa.js audit fixtures/zhangcao-stream.jsonl --file fixtures/hengfa-book.json; echo $? # 1
node src/bin/hengfa.js audit fixtures/jincao-stream.jsonl --file fixtures/hengfa-book.json; echo $?   # 1
node src/bin/hengfa.js audit fixtures/shifou-stream.jsonl --file fixtures/hengfa-book.json; echo $?   # 1（时序保护）
node src/bin/hengfa.js audit fixtures/yao-stream.jsonl --file fixtures/hengfa-book.json; echo $?      # 0（黄牌不咬门）
node src/bin/hengfa.js audit fixtures/xiancao-stream.jsonl --file fixtures/hengfa-book.json --gate 40; echo $?  # 0
node src/bin/hengfa.js audit fixtures/zhangcao-stream.jsonl --file fixtures/hengfa-book.json --gate 40; echo $? # 0
node src/bin/hengfa.js audit fixtures/yao-stream.jsonl --file fixtures/hengfa-book.json --gate 10; echo $?      # 1
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；
第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|契径|工据|工见|灭据|末据|幽物|灭物|壳物|畸物|疵物|诚物|诚值|考牌|结形|域条|卷条" src/core src/plugin
```

## 实测记录（2026-09-07，本机复跑真实输出）

（实现完成后回填；「验收实测」数字一律以本机复跑输出为准，不预设。）
