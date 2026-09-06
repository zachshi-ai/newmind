# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §10 与夹具内容）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档）；对象键与工具族同 shefa；径规整（`./` 前缀与尾斜杠归一）；入口滤：`isError===true` 一律不入账；改动通道唯二（write 族 p: 径命中改径形 ∪ exec 三族词法：装形 17 条 manager×动词×scope、改词形 4 条、驻形 9 条 ∪ 词面提取目标命中改径形）；版本尾饰剥离（位次 >0 的 `@=`<> 截断、`@vue/cli` 保留）；basename 全等防 `src/profile/` 之诬、尾形后缀匹配、前缀形；询值白（scope 后恰 1 词元）；项目域安装天然白（node/pip 族无 scope 词）；每案一键末改定基点；豁免在立案前（册词子串命中完全出账）；复位凭据配对（卸词×manager×包名、node 卸需 scope、pip 卸免 scope、gitconfig unset 同 key、npmrc delete、defaults delete 同 domain、kill/rm/crontab -r/docker stop 全域从宽）；判定序锁死（豁 > 复 > 遗；凭据时序保护——先卸后装不销案）；分值 reside=min(60,30×驻遗)、inst=min(30,15×装遗)、conf=min(30,15×改遗)、total=min(100,和)；分带 淮 0–14 / 移 15–29 / 枳 ≥30；门默认 30——单驻案即红、两装案或两改案即红；judge 幂等（重放同流必得同判词）——core 用例 ≥ 40 且全绿，断言恰好该分值 | `npm test`（core 部分） | ⬜ |
| A2 | 夹具分数（先于实现手算定死） | `clean-stream`：4 调用、muts 0、score {total:0}、带「淮」、exit 0；`drift-stream`：4 调用、muts 3、events 3、score {total:60, reside:30, inst:15, conf:15}、带「枳」、exit 1、counts {mutated:3, restored:0, exempted:0, leftReside:1, leftInst:1, leftConf:1}；`restored-stream`：7 调用、muts 3、score {total:0}、带「淮」、exit 0、counts {mutated:3, restored:3}；`declared-stream`（带 --file shuitu-book.json）：4 调用、muts 2、events 2、score {total:30, conf:30}、带「枳」、exit 1、counts {exempted:3, leftConf:2}（豁免在立案前完全出账）；`mixed-stream`：9 调用、muts 5、events 5、score {total:60, reside:30, inst:15, conf:15}、带「枳」、exit 1、counts {mutated:5, restored:2, leftReside:1, leftInst:1, leftConf:1}；附加口径：`drift + --install npm` → 45 枳 exit 1（exempted 1）；`drift + --gate 70` → 60 过门 exit 0；`declared` 无 --file → muts 5、90 枳 exit 1（exempted 0）；`mixed + --reside redis,nohup` → 30 枳 exit 1（exempted 2）；`mixed + --reside redis,nohup --install npm` → 15 移 exit 0（单改案黄牌不咬门） | core 断言 + CLI 复现 | ⬜ |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl` 喂 `shuitu audit`：calls 8、muts 0、score 0、带「淮」、exit 0（exec 仅 "npm test" 无 install 动词、写径非改径形——手算依据已实读核验）；dingfen 的 `fixtures/fenced-stream.jsonl` 喂 `shuitu audit`：calls 6、muts 0、score 0、带「淮」、exit 0——同格式流跨项目可审、互不误伤 | CLI 测试 | ⬜ |
| A4 | CLI 语义 | `audit` 多流 + `--file` + `--install/--config/--reside`（并集语义）+ `--gate` + `--json`；坏 JSON 行 / 流缺失 / 坏册 → exit 2；`register --install/--config/--reside`（全空参 → exit 2）；`revoke` 无此名 → exit 2；`list`/`block` 册缺失 → exit 2；`gate --value` 按门判 0/1；`--version`/`--help` 正常——CLI 用例 ≥ 14 | CLI 测试 | ⬜ |
| A5 | 土牌块逐字节确定 | 同一土册两次 `shuitu block` shasum 相同；增一 reside 豁免词后文本改变；全缺省册输出确定性文本 | CLI shasum 复现 | ⬜ |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载水土插件：失败探针也无条件到达工具本体（结构性零拦截）；exec `npm install -g` 探针立案（装案）；exec `git config --global` 探针立案（改案）；exec `brew services start` 探针立案（驻案）；write `~/.zshrc` 探针立案（改径形）；配对卸词探针销案（复）；册豁免词生效（豁）；`exportStream()` 导出流离线 `audit` 重放，案数与异值与运行时账**账实一致**；gate 裁决翻转；土牌块两次渲染逐字节相同——集成用例 ≥ 8 | 集成测试 | ⬜ |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ⬜ |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ⬜ |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ⬜ |

## 复现命令

```bash
cd shuitu
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/shuitu.js audit fixtures/clean-stream.jsonl; echo $?                                   # 0
node src/bin/shuitu.js audit fixtures/drift-stream.jsonl; echo $?                                   # 1
node src/bin/shuitu.js audit fixtures/restored-stream.jsonl; echo $?                                # 0
node src/bin/shuitu.js audit fixtures/declared-stream.jsonl --file fixtures/shuitu-book.json; echo $? # 1
node src/bin/shuitu.js audit fixtures/mixed-stream.jsonl; echo $?                                   # 1
node src/bin/shuitu.js audit fixtures/drift-stream.jsonl --install npm; echo $?                     # 1
node src/bin/shuitu.js audit fixtures/drift-stream.jsonl --gate 70; echo $?                         # 0
node src/bin/shuitu.js audit fixtures/declared-stream.jsonl; echo $?                                # 1
node src/bin/shuitu.js audit fixtures/mixed-stream.jsonl --reside redis,nohup; echo $?              # 1
node src/bin/shuitu.js audit fixtures/mixed-stream.jsonl --reside redis,nohup --install npm; echo $? # 0
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔|取窗|显残|盲动|碎览|残值|材牌|全览|补览|自书为览|筏册|筏形|筏值|舍牌|外逸|遗筏|秘形|窥词|涉视|转运|渊值|鉴牌|礼册|白形|视账" src/core src/plugin
```

## 实测记录（2026-09-07，本机复跑真实输出）

（实现完成后回填；「验收实测」数字一律以本机复跑输出为准，不预设。）
