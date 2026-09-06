# 04 · 验收标准（实现前定稿）

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §9 与夹具头注释）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、孤儿 result 建档）与对象键/工具族词表同 mingshi；疑册归并（显式 ∪ 默认形表按 (path,on) 去重、显式档优先、noDefaults 可关、any 与默认 write 不互并）；触发域（write/exec/any 首笔调用，成败皆算，域内无调用不判）；问凭据两通道（成功 observe 对象键路径经 normalizePath 规整后相等 ∪ 成功 exec 命令文本含 path 原文子串）；判定序锁死（谋及〔含动即问同笔〕→空疑→迟问→独谋显式/未见/独谋默认→无动）；计分锁死（迟问 +5/条 cap15、独谋显式 +15/条 cap45、独谋默认 +5/条 cap15、total=min(100,late+blind)）；分带 谋 0–14 / 疏 15–29 / 独 ≥30；门默认 30——core 用例 ≥ 42 且全绿，断言恰好该分值 | `npm test`（core 部分） | ⬜ |
| A2 | 夹具分数（先于实现手算定死） | `clean-stream`+`clean-askfile`：3 调用、疑条 3、谋值 `{total:0, late:0, blind:0}`、带「谋」、exit 0、counts `{triggered:3, fulfilled:1, late:0, blind:0, emptyAsk:0, unseen:2, askCount:3}`；`blind-stream`+`blind-askfile`：5 调用、疑条 5、谋值 `{total:10, late:10, blind:0}`、带「谋」、exit 0、counts `{triggered:5, fulfilled:0, late:2, blind:0, emptyAsk:1, unseen:2, askCount:5}`；`guilt-stream`+`guilt-askfile`：3 调用、疑条 4、谋值 `{total:30, late:0, blind:30}`、带「独」、exit 1、counts `{triggered:4, fulfilled:0, late:0, blind:2, emptyAsk:0, unseen:2, askCount:4}`；`guilt-stream` 无册：值 0、带「谋」、exit 0、issues 含「无稽疑册」 | core 断言 + CLI 复现 | ⬜ |
| A3 | 跨项目互认 | dingfen 的流夹具喂 `jiyi audit`（配 clean-askfile）：值 0、带「谋」、exit 0（对方流不触发不判）；jiyi 的 `fixtures/guilt-stream.jsonl` 喂 `dingfen audit`（子进程真跑对方 bin）：争值 0、带「定」、exit 0——同格式流双向可审，多余内容字段互不误伤 | CLI 测试 | ⬜ |
| A4 | CLI 语义 | `audit` 多流 + `--file` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 疑册缺失或坏籍 → exit 2；`register` 无 `--ask` → exit 2、`--on` 非法值 → exit 2、`--ask`/`--on` 成对可重复、重复登记同 (path,on) 去重；`revoke` 无此条 → exit 2；`list`/`block` 疑册文件缺失 → exit 2；`gate --value` 按门判 0/1；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ⬜ |
| A5 | 稽块逐字节确定 | 同一疑册两次 `jiyi block` shasum 相同；增一条显式疑条后文本改变；空籍（asks 空 ∪ noDefaults true）输出确定性空籍文本 | CLI shasum 复现 | ⬜ |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载稽疑插件：失败探针也无条件到达工具本体（结构性零拦截）；显式疑条独谋案门红；谋及豁免探针免；迟问案计 5；空疑（404 读取）免；未见（默认条无踪）不罚；bash 命令含名认问凭据；稽块两次渲染逐字节相同；`exportStream()` 导出流离线 `audit` 重放，案数与谋值与运行时账**账实一致**——集成用例 ≥ 8 | 集成测试 | ⬜ |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截） | grep（下附命令，应无输出） | ⬜ |
| A8 | 测试总量 | 全部用例 ≥ 70 且全绿（core + cli + 集成） | `npm test` | ⬜ |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ⬜ |

## 复现命令（交付后回填实测输出）

```bash
cd jiyi
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/jiyi.js audit fixtures/clean-stream.jsonl --file fixtures/clean-askfile.json; echo $?   # 0
node src/bin/jiyi.js audit fixtures/blind-stream.jsonl --file fixtures/blind-askfile.json; echo $?   # 0
node src/bin/jiyi.js audit fixtures/guilt-stream.jsonl --file fixtures/guilt-askfile.json; echo $?   # 1
node src/bin/jiyi.js audit fixtures/guilt-stream.jsonl; echo $?                                      # 0（无册不判）
```

**A7 的 grep 命令**（应无输出；用 import/调用的精确形态，避免误伤注释散文）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
```
