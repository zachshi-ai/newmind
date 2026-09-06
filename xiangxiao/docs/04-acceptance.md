# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §10 与夹具内容）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、**result content 回填**、孤儿 result 建档）；对象键与工具族同 mingshi；默认词形表 16 形逐形命中（缄 10 + 略 5 + 避 1）+ 凭形 j01；大小写敏感、词界防御（`@ts-ignores` 不命中）；代码后缀门（默认 22 后缀 ∪ extraExts，.md 不判）；注释不剥离（指令住注释里）；判定序锁死：豁免（行内 mute 共现）→ 立案（缄笔/略测）→ 保留（读侧先见）→ 去重；读侧先见（observe 成功 + p: + 结果 content 逐行过表）；exec 避检只判成功侧、逐调用计案；有凭之默每径至多一记；分值 silence=min(60,30×缄)、bypass=min(60,30×避)、skip=min(30,10×略)、total=min(100,三和)；分带 畅 0–14 / 壅 15–29 / 毁 ≥30；门默认 30——core 用例 ≥ 42 且全绿，断言恰好该分值 | `npm test`（core 部分） | ⬜ |
| A2 | 夹具分数（先于实现手算定死） | `clean-stream`：3 调用、写 2、cases 0、壅值 `{total:0, silence:0, bypass:0, skip:0}`、带「畅」、exit 0、justified 1；`hushed-stream`：3 调用、写 3、cases 4、壅值 `{total:90, silence:60, bypass:30, skip:0}`、带「毁」、exit 1、counts `{mutedDirectives:3, bypassFlags:1, skippedTests:0, keptDirectives:0, justified:0, exempted:0}`；`skippy-stream`：3 调用、写 2、cases 2、壅值 `{total:20, silence:0, bypass:0, skip:20}`、带「壅」、exit 0、skippedTests 2；`kept-stream`：3 调用、写 2、cases 1、壅值 `{total:10, skip:10}`、带「畅」、exit 0、counts `{skippedTests:1, keptDirectives:1}`；`exempt-stream` 带 `--mute WPS-4119`：2 调用、写 2、cases 1、壅值 `{total:30, silence:30}`、带「毁」、exit 1、exempted 1；同流不带 `--mute`：cases 2、壅值 `{total:60, silence:60}` | core 断言 + CLI 复现 | ⬜ |
| A3 | 跨项目互认 | mingshi 的 `fixtures/ghost-stream.jsonl` 喂 `xiangxiao audit`：cases 0、壅值 0、带「畅」、exit 0（import 非静音指令）；xiangxiao 的 `fixtures/hushed-stream.jsonl` 喂 `mingshi audit`（配 mingshi clean-registry，子进程真跑对方 bin）：名值 0、带「正」、exit 0——同格式流双向可审，互不误伤 | CLI 测试 | ⬜ |
| A4 | CLI 语义 | `audit` 多流 + `--file` + `--mute` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 坏册 → exit 2；`register` 全空参 / 重复登记 → exit 2；`revoke` 无此名 → exit 2；`list`/`block` 册文件缺失 → exit 2；`gate --value` 按门判 0/1；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ⬜ |
| A5 | 谏牌块逐字节确定 | 同一声册两次 `xiangxiao block` shasum 相同；增一豁免词后文本改变；空册（文件在、无条目）输出确定性空册文本 | CLI shasum 复现 | ⬜ |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载乡校插件：失败探针也无条件到达工具本体（结构性零拦截）；缄笔写探针立案门红；避检 exec 探针立案；略测探针点名不咬门；有凭之默注记不计分；读探针带正文 → 写保留不计分；config mute 豁免；谏牌块两次渲染逐字节相同；`exportStream()` 导出流离线 `audit` 重放，案数与壅值与运行时账**账实一致**；gate 裁决翻转——集成用例 ≥ 8 | 集成测试 | ⬜ |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ⬜ |
| A8 | 测试总量 | 全部用例 ≥ 72 且全绿（core + cli + 集成） | `npm test` | ⬜ |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ⬜ |

## 复现命令

```bash
cd xiangxiao
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/xiangxiao.js audit fixtures/clean-stream.jsonl; echo $?                                 # 0
node src/bin/xiangxiao.js audit fixtures/hushed-stream.jsonl; echo $?                                # 1
node src/bin/xiangxiao.js audit fixtures/skippy-stream.jsonl; echo $?                                # 0
node src/bin/xiangxiao.js audit fixtures/kept-stream.jsonl; echo $?                                  # 0
node src/bin/xiangxiao.js audit fixtures/exempt-stream.jsonl --mute WPS-4119; echo $?                # 1
node src/bin/xiangxiao.js audit fixtures/exempt-stream.jsonl; echo $?                                # 1（60 分）
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|翻红窗|虚器|废尺|绳墨|幻包|幻径|犯装|试装|名册|结账|过账|省身|贰过|绳账|咎值|定分|争写|界碑|阖籍|溃值|险册|备形|裸险|制册|余量|渍请|侵柄|倒持|幽项|空终|半途|回令|离效|陈效|拂拭|尘值|攀缘|息尘|复见|复命|殆值|要籍|陈账|越词|涉命|僭行|世牌|势账|盲捶|游骑|失机|病灶|四诊|医嘱|传变|蔽值|止法" src/core src/plugin
```

## 实测记录（实现完成后回填）

⬜ 待实现后逐项回填真实输出。
