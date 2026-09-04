# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。标准一经定稿不得为实现缺口事后删改。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 流解析兼容性 | 共享会话流格式全路径：`#` 与空行注释合法、坏 JSON 报行号；带 id 的 call/result 正确配对且 id 首见为准；无 id 旧格式 result 并入紧邻其前 call；孤儿 result 独立建档（`isError:null`）；`turn_start/turn_end` 等非工具事件跳过 | core 用例 | ✅ 5 例全过（坏行号断言 /第 2 行/、id 首见回填、无 id 归并、孤儿双口径、非工具事件跳过） |
| A2 | 阖籍语义 | 默认 7 形逐形命中（sk / 代码仓 / 协作 / 云钥 / 私钥头 / 承凭 / 敏感赋值各一例）；`$VAR` 与 `${VAR}` 引用形天然不命中任何形；显式登记与默认表取并集且只增不删；掩码规则：物 len > 8 → 前 4 + `…` + 尾 2，否则整段 `…`——报告中永不出现物的原文 | core 用例 | ✅ 13 例全过（七形齐备 + 逐形命中 7 例、两支 vcs、$VAR/${VAR} 豁免、显式登记只增不删、掩码 len 边界、命中结构无原文） |
| A3 | 境账案别语义 | 出境判定 = 参数序列化含 `http(s)://`，工具名无关；host 取参数中首个 URL 并小写；回环五形（localhost / 127.* / 0.0.0.0 / ::1 / [::1]）恒为内域；`--allow` 域匹配 host 相等或紧贴点子域，且不误配（`allow a.com` 不匹配 `evil-a.com` 亦不匹配 `a.com.evil.org`）；四案别：泄物（成功∧外域∧命中，唯一计分）/ 试出（失败，点名不计分）/ 内域档（不计分，命中也只点名）/ 合法出境（外域成功无命中，0 分）；装载类（无 URL）永不入账；一案多物按案计 1、逐件点名；同物多案逐案计分 | core 用例 | ✅ 9 例全过（工具名无关、host 小写去端口去 userinfo、回环五形、allow 紧贴点子域且不误配 evil-a.com、四案别齐全、+25/案、一案多物 3 形按案计 1、同物两案 50、isError null 成功侧口径） |
| A4 | 溃值与分带 | 公式 `min(60, 25 × 外域泄案数)`；分带边界逐点可证（14→密、15→疏、29→疏、30→溃）；cap 逐点可证（3 案 75→60）；`liveScore` 与离线重放**前缀一致**；门默认 30，`--gate` 可覆盖 | core 用例 + fixtures 三夹具手算期望值（tight=0/密、seep=25/疏、leaker=50/溃） | ✅ 边界逐点（14密/15疏/29疏/30溃）+ cap（3 案 75→60、4 案账面照记分数封顶）+ 门默认 30 + leaker 全前缀双引擎（analyze 截断 / 逐案 step）对账；三夹具手算一致（tight=0/密、seep=25/疏、leaker=50/溃） |
| A5 | 阖门块逐字节确定 | 同一账本状态两次渲染逐字节相同（shasum 可证）；`#k` 随渲染递增且仅此一处不同；无时间戳字段；泄物案按位次升序逐行编号；末行「—— 本块由确定性规则生成；重放同一流必得同一文本。」 | 渲染器单测 + CLI 复现 | ✅ 首行 #k 之外逐字节相同（deepEqual 行数组）；CLI 两跑 shasum 同值 48dc232a736a6e435b930100bac79ce142c64ddc；无时间戳断言过；原文断言 0 泄漏 |
| A6 | 真实管道上的权界式插件（结构性零拦截） | 挂载 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 真实管道：插件源码无 pre-execute 监听；含密钥参数的出境探针**无条件到达工具本体**、管道零反噬；report/jingzhang/hemen/gate 全链路可用；阖门块 `#k` 递增；`exportStream()` 与离线 `audit` 对同一流**账实对账**（deepEqual 溃值与案数）；观察异常不冒泡 | 集成测试 | ✅ 10 例全过（插件源码无 on('tools/pre-execute'；泄物探针 ran:curl 直达本体；两案 50 越门 fail；内域档 0 分；declare 配置注入生效；逐案掩码无原文；#k 首行外逐字节同；导出流离线重放 deepEqual；null 事件吞掉；装载不入账） |
| A7 | CLI 语义 | `audit`：干净流 → 0，疏带流 → 0，溃带流 → 1，坏文件/坏流 → 2；`--gate` 可翻 verdict（25 分流 `--gate 20` 翻 fail；50 分流 `--gate 60` 翻 pass）；`--allow` 可使外域变内域（leaker 指明第三方域后翻 pass）；`--declare` 显式登记生效（对干净流登记其参数子串后翻 fail）；`--json` 输出完整报告（含 breakdown 与逐案清单）；`leaks` 逐案掩码清单；`hemen` 默认纯文本、`--json` 包装；`gate --value` 子命令裁决；未知命令/缺参数 → 2 | CLI 测试 | ✅ 17 例全过（三夹具 exit 1/0/0、--gate 20 翻 fail、--gate 60 翻 pass、--allow 全内域翻 pass、--declare https:// 翻 fail 泄 2 案、--declare @file 逐行、--json 全结构、leaks 掩码+试出段、hemen 两跑 shasum 同、hemen --json、gate 25/30 双裁、坏文件、坏流行号、未知命令·选项·缺参 → 2、help/version） |
| A8 | 十层互不越界 | 插件与核心：无 pre-execute 监听器；无判断账本字段（alternatives/disconfirming）、无本愿契约字段（wish/anchors）、无任务书字段（charter）、无势账词（盲捶/悬账/游骑/失机）、无见闻账词（复见/复命/殆值/要籍）、无绳账词（绳账/咎值/结账）、无跨会话错误账词（过账/省身/贰过）、无并发分词（定分/争写）——grep 应无输出 | 代码 grep（复现命令见下） | ✅ 全部无输出。诚实记录：首跑抓到插件头注释「定分裁并发争写」字样撞定分机制词表（字面量误触，与有涯当年的「过账」同款），改写为「并发资源之争另有其主」后复验干净——grep 门在实现期真实起了作用 |
| A9 | 模型无关 | 核心 + 插件零 LLM 调用、零网络请求、零子进程：grep `child_process\|axios\|openai\|anthropic\|completion(` 应无输出。诚实说明：`http`/`https` 词法在本层**是审计对象本身的形态**（出境判定正则），预期命中且仅此一处——这不是对 A9 的放宽，是本层审计对象与其他层的结构性差异，逐处列明 | 代码 grep（复现命令见下） | ✅ 首组无输出。次组 https? 命中 5 处逐处列明：jingzhang.js:37 出境词法 URL_RE、:49 hostOf 兜底正则、:72 出境判定 test、:4 与 :70 注释描述——全部是审计对象本身的形态，无一处网络调用、无 LLM、无子进程 |
| A10 | 测试总量 | 全部用例 ≥ 64 且全绿（core + cli + 集成，0 失败） | `npm test` | ✅ 实测 **65 tests, 65 pass, 0 fail, 0 skipped**（core 38 + cli 17 + integration 10；集成在真实 cordis 管道上运行，0 跳过） |
| A11 | 文档与登记 | docs 01–04、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新（含与十层的边界行） | 人工 + 链接 | ✅ 本表回填时提交齐备 |

## 复现命令

```bash
cd baihe
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 见 A10 实测
node src/bin/baihe.js audit fixtures/leaker-stream.jsonl --allow api.internal.corp; echo "exit=$?"   # 期望 溃值 50（溃）exit=1
node src/bin/baihe.js audit fixtures/seep-stream.jsonl; echo "exit=$?"     # 期望 溃值 25（疏）exit=0
node src/bin/baihe.js audit fixtures/tight-stream.jsonl; echo "exit=$?"    # 期望 溃值 0（密）exit=0
```

**A8 的 grep 命令**（应无输出——不越十层地盘）：

```bash
grep -rn "tools/pre-execute" baihe/src/            # 零拦截是结构性的
grep -rnE "alternatives|disconfirming" baihe/src/  # 解蔽地盘
grep -rnE "\bwish\b|anchors" baihe/src/            # 正念地盘
grep -rn "charter" baihe/src/                      # 治未病地盘
grep -rnE "盲捶|悬账|游骑|失机" baihe/src/          # 九变地盘
grep -rnE "复见|复命|殆值|要籍" baihe/src/          # 有涯地盘
grep -rnE "绳账|咎值|结账" baihe/src/               # 立诚地盘
grep -rnE "过账|省身|贰过" baihe/src/               # 不贰地盘
grep -rnE "定分|争写" baihe/src/                    # 定分地盘
```

**A9 的 grep 命令**（首组应无输出；次组列出全部命中并逐一说明——均为出境判定的审计对象词法）：

```bash
grep -rnE "child_process|axios|openai|anthropic|completion\(" baihe/src/   # 应无输出
grep -rnE "https?" baihe/src/                                              # 预期命中，逐处说明
```

## 实测结果（实现后回填，数字一律来自本机复跑）

⏳ 待实现后回填。
