# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2/A3 含**先于实现手算**的期望值（见 docs/03 §3–§6 与夹具头注释）；实现与测试若与手算冲突，只能改实现，不得改本表。
> 「结果」列与文末实测记录在实现完成后回填——只回填真实命令输出，不预写。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、无 id 相邻并入、孤儿独立建档、content 缺失照记）；成败未知/失败不入账；效词表并集去重、ASCII 词界匹配（latest 不误伤 test、parse.test.js 命中）、CJK 子串匹配、命中坍缩（最长词胜出）；判定序 免验→空言→回令→离效→陈效（每件至多一项发现）；空言 +25/件 cap 50、回令 +20/件 cap 30、效值 min(100,虚+回)、分带 明 0–14 / 疏 15–29 / 虚 ≥30、门默认 30（恰 30 → fail）；免验默认空表、命中豁免只计数；离效/陈效只点名；词元提取 `/[a-z0-9]{3,}\|[\u4e00-\u9fff]{2,}/`；摘录掩码自洁四形——core 用例 ≥ 45 且全绿，断言恰好该分值与该词表 | `npm test`（core 部分） | ⏳ |
| A2 | 夹具分数（先于实现手算定死） | `clean-stream`：3 调用、成报 3、效类 2、空言 0、效值 0、带「明」、exit 0（静默 `mkdir` 成功永不审）；`vacuous-stream`：3 调用、成报 3、效类 2、空言 2、虚 50、带「虚」、exit 1；`echo-stream`：3 调用、成报 3、效类 3、回令 1（+20）、离效 1、陈效 1（均 0 分，判定序离效在前——第 3 次复验内容含词元命中故记陈效而非离效）、效值 20、带「疏」、exit 0；`exempt-stream`（配 `--exempt` 词表）：3 调用、成报 3、效类 3、免验 2、空言 0、效值 0、带「明」、exit 0 | core 断言 + CLI 复现 | ⏳ |
| A3 | 跨项目互认与盲点互证 | zhizhi 的 `fixtures/sample-stream.jsonl`（无 id 旧格式）与 jiebi 的 `fixtures/sample-stream.jsonl`（带 id）直接喂 `xiaoyan audit`：各 **8** 次调用；zhizhi 成报 **4**（write/read/edit/末次 npm test）、效类 **1**、空言 **1**（末次成功无 content 字段——账上无据）、效值 **25**、带「疏」、exit 0；jiebi 成报 **3**（read/edit/末次 npm test）、效类 **1**、空言 **1**、效值 **25**、带「疏」、exit 0——旧格式按诚实边界退化为「账上无据」；**zhizhi 证据账收编的那条验证证据，正是效验点名的空言**（数个数与称成色互证） | core 用例 | ⏳ |
| A4 | CLI 语义 | `audit`：效值超门 → exit 1，干净 → 0，不可读/坏 JSON/坏词表/坏免验表 → exit 2；`--gate <n>` 生效（含恰等于门 → fail）；`--words <file>` 追加效类词生效（自定义词命中的静默成功入账且默认词保留）；`--exempt <file>` 豁免生效；`--json` 紧凑输出；`--version`/`--help` 正常；`gate --value <n>` 按 `--gate`（默认 30）判 0/1；`zheng` 默认纯文本、`--json` 包装——CLI 用例 ≥ 14 | CLI 测试 | ⏳ |
| A5 | 真实管道上的称实式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载效验插件：失败探针与静默探针都无条件到达工具本体（结构性零拦截）；空输出的验证成功被记空言；以命令回显为输出的验证被记回令；`exempt()` 的免验词豁免生效；`report/xiaozhang/zheng/gate` 可用；`exportStream()` 被离线 `audit` 重放后数字与运行时一致（账实对账）——集成用例 ≥ 8 | 集成测试 | ⏳ |
| A6 | 证块逐字节确定 | 同一份流两次渲染 shasum 相同；`#k` 随渲染次数递增；空言/回令逐条列出（调用号/工具/摘录）；无空言回令时输出「证验在场——效类成功皆有可观。」 | 渲染器单测 + CLI shasum 复现 | ⏳ |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络；插件源码无 pre-execute 监听器（结构性零拦截）；词匹配是纯词界/子串 indexOf（零 NLP、零框架输出解析） | grep（下附命令，应无输出） | ⏳ |
| A8 | 测试总量 | 全部用例 ≥ 70 且全绿（core + cli + 集成） | `npm test` | ⏳ |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ⏳ |

## 复现命令

```bash
cd xiaoyan
npm install        # 安装官方 @deepseek-ai/* 包（集成验证需要）
npm test
node src/bin/xiaoyan.js audit fixtures/clean-stream.jsonl; echo $?     # 期望 0（0 分 · 明）
node src/bin/xiaoyan.js audit fixtures/vacuous-stream.jsonl; echo $?   # 期望 1（50 分 · 虚）
node src/bin/xiaoyan.js audit fixtures/echo-stream.jsonl; echo $?      # 期望 0（20 分 · 疏：点名不咬门）
node src/bin/xiaoyan.js audit fixtures/exempt-stream.jsonl --exempt fixtures/exempt-words.json; echo $?  # 期望 0（0 分 · 明）
```

**A7 的 grep 命令**（应无输出；第二条用监听器注册的精确模式，避免误伤注释散文）：

```bash
grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create" src/core src/plugin | grep -v "^\s*//"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
```

## 实测记录

（实现与测试完成后回填：`npm test` 真实输出、四夹具审计原文、证块 shasum、跨项目互认数字、集成账实对账数字。）
