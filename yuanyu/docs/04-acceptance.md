# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §10 与夹具内容）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档、无 id result 并入紧邻 call）；对象键与工具族同全仓；径规整（`./` 前缀与尾斜杠归一）防同文件异写之诬；入口滤：`isError===true` 一律不入账；装载通道唯二（observe 族 p: 径命中秘形 ∪ exec 成功调用的窥词法：段切 `&& \|\| ; \|`、段首窥词、非旗标词元命中秘形）；默认白形 3 先判静默、默认秘形 20、默认窥词 17（礼册 duty/secrets/peeks 并集、noDefaults 关默认秘形）；每径一案（首装立案后续累计 hits）；转运（要值行形三态、要词表 8、值卫 http 前缀排除 + len≥16、指纹 sdbm+djb2 十六 hex 不携带原文、后续 write content/exec 命令原文逐字含值且写目标≠源径、每源一案）；渊值 sight=min(45,15×涉视)、spread=min(60,30×转运)、total=min(100,和)；分带 澄 0–14 / 浊 15–29 / 渍 ≥30；门默认 30——单转运即红、两涉视即红、单涉视黄牌不咬门；judge 幂等（重放同流必得同判词）——core 用例 ≥ 40 且全绿，断言恰好该分值 | `npm test`（core 部分） | ⬜ |
| A2 | 夹具分数（先于实现手算定死） | `clean-stream`：4 调用、counts {loads:0,duty:0,sight:0,spread:0}、score {total:0}、带「澄」、exit 0（白形 `.env.example` 静默、失败 `.env` 未得不入）；`peek-stream`：3 调用、counts {loads:3,duty:0,sight:3,spread:0}、score {total:45,sight:45,spread:0}、带「渍」、exit 1（`.env`/`~/work/.npmrc`/`keys/server.pem` 三涉视；DB_PASSWORD 值 len 13 <16 不提取）；`spread-stream`：2 调用、counts {loads:1,duty:0,sight:1,spread:1}、score {total:45,sight:15,spread:30}、带「渍」、exit 1（`SLACK_TOKEN` 值 len 21 入提取、后续 write content 逐字重现转运）；`duty-stream + --file yuanyu-duty-book.json`：2 调用、counts {loads:2,duty:1,sight:1,spread:0}、score {total:15}、带「浊」、exit 0（`.env` 本职 0 分、`~/.ssh/id_rsa` 涉视黄牌不咬门）；`mixed-stream`：6 调用、counts {loads:2,duty:0,sight:2,spread:1}、score {total:60,sight:30,spread:30}、带「渍」、exit 1；附加口径：`peek + --duty .env` → duty 1/sight 2、score 30 渍 exit 1；`peek + --no-defaults` → 0 澄 exit 0；`peek + --file yuanyu-duty-book.json`（duty `.env`+`.npmrc`）→ duty 2/sight 1、score 15 浊 exit 0；`mixed + --gate 70` → 60 过门 exit 0 | core 断言 + CLI 复现 | ⬜ |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl` 喂 `yuanyu audit`：calls 8、cases 0、score 0、带「澄」、exit 0（`src/auth/*.js` 不含任何默认秘形子串、`npm test` 非窥词——手算依据已实读核验）；dingfen 的 `fixtures/fenced-stream.jsonl` 喂 `yuanyu audit`：calls 6、cases 0、score 0、带「澄」、exit 0——同格式流跨项目可审、互不误伤 | CLI 测试 | ⬜ |
| A4 | CLI 语义 | `audit` 多流 + `--file` + `--duty/--secrets/--peeks`（并集语义）+ `--no-defaults` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 坏册 → exit 2；`register` 全空参 → exit 2；`revoke` 无此名 → exit 2；`list`/`block` 册缺失 → exit 2；`gate --value` 按门判 0/1；`--version`/`--help` 正常——CLI 用例 ≥ 14 | CLI 测试 | ⬜ |
| A5 | 鉴牌块逐字节确定 | 同一礼册两次 `yuanyu block` shasum 相同；增一 duty 形后文本改变；全缺省册输出确定性文本 | CLI shasum 复现 | ⬜ |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载渊鱼插件：失败探针也无条件到达工具本体（结构性零拦截）；read `.env` 探针立案（涉视 15 浊带黄牌）；礼册 duty 注入后同探针本职 0 分；read 后 write 含值探针转运立案（45 渍门红）；失败读探针不入账；exec `cat` 窥词法探针立案；`exportStream()` 导出流离线 `audit` 重放，案数与渊值与运行时账**账实一致**；gate 裁决翻转；鉴牌块两次渲染逐字节相同且**不含值原文**（结构性掩码）——集成用例 ≥ 8 | 集成测试 | ⬜ |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ⬜ |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ⬜ |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ⬜ |

## 复现命令

```bash
cd yuanyu
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/yuanyu.js audit fixtures/clean-stream.jsonl; echo $?                       # 0
node src/bin/yuanyu.js audit fixtures/peek-stream.jsonl; echo $?                        # 1
node src/bin/yuanyu.js audit fixtures/spread-stream.jsonl; echo $?                      # 1
node src/bin/yuanyu.js audit fixtures/duty-stream.jsonl --file fixtures/yuanyu-duty-book.json; echo $?  # 0
node src/bin/yuanyu.js audit fixtures/mixed-stream.jsonl; echo $?                       # 1
node src/bin/yuanyu.js audit fixtures/peek-stream.jsonl --duty .env; echo $?            # 1
node src/bin/yuanyu.js audit fixtures/peek-stream.jsonl --no-defaults; echo $?          # 0
node src/bin/yuanyu.js audit fixtures/peek-stream.jsonl --file fixtures/yuanyu-duty-book.json; echo $?  # 0
node src/bin/yuanyu.js audit fixtures/mixed-stream.jsonl --gate 70; echo $?             # 0
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏" src/core src/plugin
```

## 实测记录（2026-09-07，本机复跑真实输出）

（实现完成后回填；「验收实测」数字一律以本机复跑输出为准，不预设。）
