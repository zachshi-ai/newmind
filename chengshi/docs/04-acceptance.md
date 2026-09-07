# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §11 与夹具内容）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call、principal 事件入账、turn_start/turn_end/reanchor/appeal 跳过）；对象键与工具族同全仓；施主提取（段切 `&& \|\| ; \|`、剥 `KEY=VALUE` 前缀与 `sudo/nohup/command/nice` 包装词、basename 小写）；遂键规整（trim + 连续空白折叠单空格、**保留原大小写**）；遂账通道锁死（唯 exec 族 `c:` 命令成功笔入账；isError===true 不入账、null 老流按已发生；观察不是施；write/other 永不入账）；遂形 15 形三族（启 7：gh 建档/评论/发版/片/标/api 显 POST/api 默 POST；邮 5：mail/mailx/sendmail/mutt/msmtp；单 3：curl/wget 显 POST、默 POST〔携数据旗标且无 -X，显 PUT/GET/DELETE 不入、PATCH 不入〕、httpie POST）无册照判；遂册 allow glob（`*` 跨空白段 ∪ 逐字）豁免在判定序第一位；判定序锁死（初遂 > 豁施 > 已消 > 承施 > 重决〔+30/案 cap60〕；成物之柄 = 首笔遂 result.content 首个 URL 路径末段资源号；消据 = 成功 exec 段含消词 11 词 ∧ 柄资源号整词元，跨会话有效；再命两通道 = 对象词元 ∨ 命词 12 词 ∧ principal 后同会话首笔遂，**限同会话**）；重值 min(60,30×重决)、total=min(100)；分带 谐 0–29 / 叠 30–59 / 沓 ≥60；门默认 30 单重决即红；末消注记不销案；judge 幂等（重放同流必得同判词）——core 用例 ≥ 28 且全绿，断言恰好该分值 | `npm test`（core 部分） | ✅ 32 用例全绿（core：流解析 3 + 对象族与施主 2 + 遂形 6 + 遂账通道 3 + 消据成物之柄 5 + 再命承施 4 + 判定序与重值 5 + 遂册 2 + 遂牌掩码与行序 2——断言恰好该分值与案别） |
| A2 | 夹具分数（先于实现手算定死） | 遂册夹具 `chengshi-book.json`：allow [`curl -d*hooks.example/beat*`]。`clean-stream`（带册）：6 调用（观察 1 + gh pr create 初遂 + curl -d api.example.com 初遂〔不中允列〕+ curl -d hooks.example/beat 初遂〔中允列但首笔恒初遂——允列豁的是再施，册在此仅公示，其效由 yunchong 证〕+ mail isError:true 失败不遂 + npm test 非遂形）、counts {chu:3, chong:0, xiao:0, huo:0, cheng:0}、score {total:0}、带「谐」、exit 0；`chonggao-stream`（无册）：4 调用（两笔 write 夹一双生 gh issue create 同串两笔）、counts {chu:1, chong:1}、score {chong:30, total:30}、带「叠」、exit 1——**夹写不断罪**（youya 哑点即本层靶点）；`shuangchong-stream`：4 调用（mail 同串×2 + curl -d pay 单同串×2）、counts {chu:2, chong:2}、score {chong:60, total:60}、带「沓」、exit 1（cap 60 触顶）；`chengming-stream`：3 调用 + 1 主文（gh release create 初遂 → principal「……再发一遍」→ 同串再施）、counts {chu:1, cheng:1}、score 0、带「谐」、exit 0（命词通道承施）；`xiaoju-stream`：3 调用（gh issue create 初遂〔content 带 issues/7 柄〕→ gh issue close 7 消据 → 同串再施）、counts {chu:1, xiao:1}、score 0、带「谐」、exit 0（补过不咎）；`yunchong-stream`（带册）：3 调用（心跳 curl -d hooks.example/beat 同串三笔）、counts {chu:1, chong:0, xiao:0, huo:2, cheng:0}、score 0、带「谐」、exit 0（首笔初遂 + 两笔允列豁施）；`laoliu-stream`：2 调用（无 id 旧格式、无 isError 字段——老流按已发生：gh pr comment 同串两笔）、counts {chu:1, chong:1}、score {chong:30}、带「叠」、exit 1；附加口径：`chonggao --gate 40` → 30 过门 exit 0；`yunchong` **无册对照** → {chu:1, chong:2}、60 沓 exit 1（允列之效的直接对照——同一流带册谐、无册沓）；`shuangchong` 拆两流合审 → 仍 chu:2/chong:2、60 沓 exit 1（离线合并可证）；`chonggao` 拆两会话合审（create1 与 create2 异流）→ 仍 chong:1、30 叠 exit 1（**跨会话重决**——单流各自初遂，合审并键） | core 断言 + CLI 复现 | ✅ 十二条复现命令退出码逐字吻合（0/1/1/0/0/0/1；附加口径 0/1/1/1）；分数与 cases 由 CLI JSON 逐字段断言（clean 0 谐 / chonggao 30 叠 夹写不断罪 / shuangchong 60 沓 / chengming 承施 0 / xiaoju 已消 0 / yunchong 带册 huo:2 谐、无册 chong:2 沓 / laoliu 老流 30 / 合审两流 60 / 跨会话 30）；A1–A9 期望未动 |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl` 无册喂 `chengshi audit`：8 调用、counts 全 0、带「谐」、exit 0（`npm test` 非遂形）；kaocheng 的 `fixtures/mixed-stream.jsonl` 无册喂：4 调用、counts 全 0（写与重定向非施）；fangchuan 的 `fixtures/yancao-stream.jsonl` 无册喂：2 调用、counts 全 0（唯 write 族）；erbing 的 `fixtures/mixed-stream.jsonl` 无册喂：5 调用 1 主文、counts 全 0（`terraform apply`×2 收敛类排除、`mail` isError:true 失败不遂、`send_invoice` 非遂形基名——排除即边界）；erbing 的 `fixtures/delegated-stream.jsonl` 无册喂：4 调用、counts 全 0（`terraform apply`×2 + `npm publish`×2 皆排除类）——同格式流跨项目可审、互不误伤 | CLI 测试 | ✅ 五流零误伤（zhizhi 8 / kaocheng 4 / fangchuan 2 / erbing mixed 5+1 主文 / erbing delegated 4——全部 counts 全 0、谐带、exit 0） |
| A4 | CLI 语义 | `audit` 多流合审（shuangchong 拆两流合审 60 沓 exit 1、chonggao 跨会话合审 30 exit 1）+ `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 未知旗标 → exit 2；`allow` 缺 --key → exit 2、重复登记去重、册缺失自动建册；`disallow` 无此键 → exit 2；`list` 册缺失 → exit 2；`block` 无册出确定性文本（遂形与遂册公示是供给不是门禁）；`gate --value` 按门判 0/1（29 过 / 30 红 / --gate 50 时 45 过）；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ✅ 18 用例全绿 |
| A5 | 遂牌块逐字节确定 | 同一遂册两次 `chengshi block` shasum 相同；增一允列后文本改变；无册输出确定性文本（`遂册：未立（允列无据，已遂照账）`）；块与 issues 不含命令原文与实参（遂名 = 施主基名·资源词 + djb2 指纹——掩码是结构性保证，URL/邮箱/参数进不了供给面） | CLI shasum 复现 | ✅ 逐字节一致（同册两次 shasum 相同；增允（`gh release*`）后文本改变；无册块为确定性文本；含 mail 案的块经断言不含 `ops@example.com` 与命令原文） |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载成事插件：失败探针也无条件到达工具本体（结构性零拦截）；gh issue create 同串两笔探针 → 重决 30 门红（其间夹一笔 write——写间不断罪）；mail 失败探针（isError）不入账 → 0；允列遂键探针 → 豁施 0；首遂+消据+再施探针 → 已消 0 过门；`exportStream()` 导出流离线 `audit` 重放，案数与重值与运行时账**账实一致**；gate 裁决翻转；遂牌块两次渲染逐字节相同且**不含命令原文**——集成用例 ≥ 8 | 集成测试 | ✅ 9 用例全绿（账实一致 30 = 同串双建；失败 mail 探针不入账；真实管道挂载 npm 官方 @deepseek-ai/cordis + @deepseek-ai/dsh-tools；线上无主文承不判——插件视图如实降级） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出（定标前词检抓到一处机制词子串相撞——「承词」撞 lunshi 机制词，定标即改名「命词」先于实现落盘；实现期 grep3 复验全净） |
| A8 | 测试总量 | 全部用例 ≥ 55 且全绿（core + cli + 集成） | `npm test` | ✅ 59 tests, 59 pass（core 32 + cli 18 + 集成 9，0 跳过） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅（本行即 A9 验证；根 README #32 行见交付提交） |

## 复现命令

```bash
cd chengshi
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/chengshi.js audit fixtures/clean-stream.jsonl --file fixtures/chengshi-book.json; echo $?     # 0
node src/bin/chengshi.js audit fixtures/chonggao-stream.jsonl; echo $?                                     # 1
node src/bin/chengshi.js audit fixtures/shuangchong-stream.jsonl; echo $?                                  # 1
node src/bin/chengshi.js audit fixtures/chengming-stream.jsonl; echo $?                                    # 0（承施）
node src/bin/chengshi.js audit fixtures/xiaoju-stream.jsonl; echo $?                                       # 0（已消）
node src/bin/chengshi.js audit fixtures/yunchong-stream.jsonl --file fixtures/chengshi-book.json; echo $?  # 0（带册：首笔初遂+两笔豁施）
node src/bin/chengshi.js audit fixtures/yunchong-stream.jsonl; echo $?                                    # 1（无册对照：重决 2 → 60 沓）
node src/bin/chengshi.js audit fixtures/laoliu-stream.jsonl; echo $?                                       # 1（老流）
node src/bin/chengshi.js audit fixtures/chonggao-stream.jsonl --gate 40; echo $?                           # 0
node src/bin/chengshi.js audit fixtures/shuangchong-part1.jsonl fixtures/shuangchong-part2.jsonl; echo $?  # 1（合审）
node src/bin/chengshi.js audit fixtures/chonggao-s1.jsonl fixtures/chonggao-s2.jsonl; echo $?              # 1（跨会话重决）
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；
第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账|装形|改径形|驻形|卸词|复位|改账|土册|土牌|察土|契册|契径|工据|工见|灭据|末据|幽物|灭物|壳物|畸物|疵物|诚物|诚值|考牌|结形|域条|卷条|典形|典册|改典|复典|灭典|宪案|禁案|章案|法值|法牌|开门|知面|行面|戒形|戒体|戒词|必行词|宥词|先悖|试违|违知|行值|合牌|化知|缺行|湮形|空捕|空还|空接|导词|川册|塞值|导牌|文账|沙川|已浚|净川|码面|增附|去锁|越源|钩入|籍面|籍账|籍形|命籍|纳籍|准值|准牌|附名" src/core src/plugin
```

## 实测记录（2026-09-08，本机复跑真实输出）

- `npm test`：**59 tests, 59 pass, 0 fail, 0 skipped**（core 32 + cli 18 + 集成 9；集成挂载 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 真实管道）。
- A2 十条复现命令退出码逐字吻合：clean 0/谐/exit 0 · chonggao 30/叠/exit 1 · shuangchong 60/沓/exit 1 · chengming 0/谐/exit 0（承施）· xiaoju 0/谐/exit 0（已消）· yunchong 0/谐/exit 0（允列全豁）· laoliu 30/叠/exit 1（老流）· 附加口径 chonggao+--gate 40 过门 · shuangchong 两流合审 60 · chonggao 跨会话合审 30。
- A3 跨项目五流零误伤：zhizhi sample 8 / kaocheng mixed 4 / fangchuan yancao 2 / erbing mixed 5（1 主文）/ erbing delegated 4——counts 全 0、谐带、exit 0。
- A5 遂牌块：同册两次 `block` shasum 一致；增允后文本改变；无册块为确定性文本；含 mail 案的块不含收件地址与命令原文。
- A7 三组 grep（模型无关 / 无 pre-execute / 机制词防撞）均无输出。
- 定标勘误先行落盘：「承词」撞 lunshi 机制词，定标即改名「命词」；A2 手算与实现零冲突。A1–A9 期望与 docs/03 语义未动。
