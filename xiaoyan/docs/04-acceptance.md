# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2/A3 含**先于实现手算**的期望值（见 docs/03 §3–§6 与夹具头注释）；实现与测试若与手算冲突，只能改实现，不得改本表。
> 「结果」列与文末实测记录在实现完成后回填——只回填真实命令输出，不预写。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、无 id 相邻并入、孤儿独立建档、content 缺失照记）；成败未知/失败不入账；效词表并集去重、ASCII 词界匹配（latest 不误伤 test、parse.test.js 命中）、CJK 子串匹配、命中坍缩（最长词胜出）；判定序 免验→空言→回令→离效→陈效（每件至多一项发现）；空言 +25/件 cap 50、回令 +20/件 cap 30、效值 min(100,虚+回)、分带 明 0–14 / 疏 15–29 / 虚 ≥30、门默认 30（恰 30 → fail）；免验默认空表、命中豁免只计数；离效/陈效只点名；词元提取 `/[a-z0-9]{3,}\|[\u4e00-\u9fff]{2,}/`；摘录掩码自洁四形——core 用例 ≥ 45 且全绿，断言恰好该分值与该词表 | `npm test`（core 部分） | ✅ 49 用例全绿 |
| A2 | 夹具分数（先于实现手算定死） | `clean-stream`：3 调用、成报 3、效类 2、空言 0、效值 0、带「明」、exit 0（静默 `mkdir` 成功永不审）；`vacuous-stream`：3 调用、成报 3、效类 2、空言 2、虚 50、带「虚」、exit 1；`echo-stream`：3 调用、成报 3、效类 3、回令 1（+20）、离效 1、陈效 1（均 0 分，判定序离效在前——第 3 次复验内容含词元命中故记陈效而非离效）、效值 20、带「疏」、exit 0；`exempt-stream`（配 `--exempt` 词表）：3 调用、成报 3、效类 3、免验 2、空言 0、效值 0、带「明」、exit 0 | core 断言 + CLI 复现 | ✅ 四夹具逐字吻合（0/50/20/0 分，exit 0/1/0/0，词表命中与发现计数全对） |
| A3 | 跨项目互认与盲点互证 | zhizhi 的 `fixtures/sample-stream.jsonl`（无 id 旧格式）与 jiebi 的 `fixtures/sample-stream.jsonl`（带 id）直接喂 `xiaoyan audit`：各 **8** 次调用；zhizhi 成报 **4**（write/read/edit/末次 npm test）、效类 **1**、空言 **1**（末次成功无 content 字段——账上无据）、效值 **25**、带「疏」、exit 0；jiebi 成报 **3**（read/edit/末次 npm test）、效类 **1**、空言 **1**、效值 **25**、带「疏」、exit 0——旧格式按诚实边界退化为「账上无据」；**zhizhi 证据账收编的那条验证证据，正是效验点名的空言**（数个数与称成色互证） | core 用例 | ✅ 两流实测 8 调用 / 空言 1 / 25 分 · 疏 · exit 0，与手算逐字吻合 |
| A4 | CLI 语义 | `audit`：效值超门 → exit 1，干净 → 0，不可读/坏 JSON/坏词表/坏免验表 → exit 2；`--gate <n>` 生效（含恰等于门 → fail）；`--words <file>` 追加效类词生效（自定义词命中的静默成功入账且默认词保留）；`--exempt <file>` 豁免生效；`--json` 紧凑输出；`--version`/`--help` 正常；`gate --value <n>` 按 `--gate`（默认 30）判 0/1；`zheng` 默认纯文本、`--json` 包装——CLI 用例 ≥ 14 | CLI 测试 | ✅ 15 用例全绿 |
| A5 | 真实管道上的称实式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载效验插件：失败探针与静默探针都无条件到达工具本体（结构性零拦截）；空输出的验证成功被记空言；以命令回显为输出的验证被记回令；`exempt()` 的免验词豁免生效；`report/xiaozhang/zheng/gate` 可用；`exportStream()` 被离线 `audit` 重放后数字与运行时一致（账实对账）——集成用例 ≥ 8 | 集成测试 | ✅ 10 用例全绿（重放一致 45=45） |
| A6 | 证块逐字节确定 | 同一份流两次渲染 shasum 相同；`#k` 随渲染次数递增；空言/回令逐条列出（调用号/工具/摘录）；无空言回令时输出「证验在场——效类成功皆有可观。」 | 渲染器单测 + CLI shasum 复现 | ✅ 逐字节一致（shasum c05e520…两次相同），#k 递增 |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络；插件源码无 pre-execute 监听器（结构性零拦截）；词匹配是纯词界/子串 indexOf（零 NLP、零框架输出解析） | grep（下附命令，应无输出） | ✅ 两组 grep 均无输出 |
| A8 | 测试总量 | 全部用例 ≥ 70 且全绿（core + cli + 集成） | `npm test` | ✅ 74 tests, 74 pass |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅ |

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

## 实测记录（2026-09-06，本机复跑真实输出）

```
$ node --version
v24.18.0
$ npm ls @deepseek-ai/cordis @deepseek-ai/dsh-tools
xiaoyan-dsh@0.1.0 /Users/zach/Documents/zcode/newmind/xiaoyan
├── @deepseek-ai/cordis@4.0.2
├─┬ @deepseek-ai/dsh-system-prompt@0.0.1-rc.5
│ └── @deepseek-ai/cordis@4.0.2 deduped
└── @deepseek-ai/dsh-tools@0.0.1-rc.1
$ npm test
ℹ tests 74
ℹ pass 74
ℹ fail 0
（core 49 + cli 15 + 集成 10，分文件运行各自全绿）
```

空言夹具的审计（两件静默空转 → 效值 50 / 虚 / exit 1）：

```console
$ xiaoyan audit fixtures/vacuous-stream.jsonl
{
  "calls": 3,
  "counts": { "successes": 3, "verified": 2, "exempted": 0, "vacuous": 2, "echo": 0, "stray": 0, "stale": 0 },
  "score": { "total": 50, "vacuity": 50, "echo": 0 },
  "band": "虚",
  "gate": 30,
  "verdict": "fail",
  "ok": false,
  "events": [
    { "kind": "空言", "call": 1, "ref": "v1", "tool": "bash", "words": ["test"],
      "excerpt": "{\"command\":\"npm test\"}" },
    { "kind": "空言", "call": 2, "ref": "v2", "tool": "bash", "words": ["lint"],
      "excerpt": "{\"command\":\"npm run lint\"}" }
  ],
  "issues": [
    "空言：调用1 bash v1 验证成功而内容为空（账上无据）",
    "空言：调用2 bash v2 验证成功而内容为空（账上无据）"
  ],
  "principal": { "blocks": 1 }
}
$ echo $?
1
```

四夹具门禁（疏带亮黄牌不门禁，虚带咬住）：

```console
$ xiaoyan audit fixtures/clean-stream.jsonl;      echo $?   # 0（0 分 · 明）
$ xiaoyan audit fixtures/vacuous-stream.jsonl;    echo $?   # 1（50 分 · 虚）
$ xiaoyan audit fixtures/echo-stream.jsonl;       echo $?   # 0（20 分 · 疏：回令被点名，门禁不咬）
$ xiaoyan audit fixtures/exempt-stream.jsonl --exempt fixtures/exempt-words.json; echo $?  # 0（0 分 · 明：免验 2 件）
```

证块（同一流两次渲染，shasum 逐字节一致）：

```console
$ xiaoyan zheng fixtures/vacuous-stream.jsonl | shasum
c05e520dee3835643497cf6b8b559eadd9578382  -
$ xiaoyan zheng fixtures/vacuous-stream.jsonl | shasum
c05e520dee3835643497cf6b8b559eadd9578382  -
$ xiaoyan zheng fixtures/echo-stream.jsonl
【效验 · 证块】效账 #1
事莫明于有效，论莫定于有证——以下成功信号空言虚语，验证不算数：
  1. [调用1] bash 回令: 以令为证——“vitest run src/parse.test.js”
离效：1 件（点名不计分）｜ 陈效：1 件 ｜ 免验：0 件 ｜ 效值：20（疏）
—— 本块由确定性规则生成；重放同一流必得同一文本。
```

跨项目互认与盲点互证（zhizhi/jiebi 历史流直接验尸；zhizhi 证据账收编的那条 npm test 成功，流里无 content——效验称出 25 分空言）：

```console
$ xiaoyan audit ../zhizhi/fixtures/sample-stream.jsonl --json | …
zhizhi: calls 8 / 成报 4 / 效类 1 / 空言 1 / 效值 25（疏）
$ xiaoyan audit ../jiebi/fixtures/sample-stream.jsonl --json | …
jiebi:  calls 8 / 成报 3 / 效类 1 / 空言 1 / 效值 25（疏）
```

集成重放对账（导出流离线审计 = 运行时账本，效值 45 = 虚 25 + 回 20）：

```console
（integration.dsh.test.js：offline.score.total === runtime.score.total → 45 === 45 ✅）
```
