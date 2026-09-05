# 03 · 设计：成色账、仪值与仪块（语义在本文件锁死，实现与测试不得擅自放宽）

> 本文件是唯一语义权威。词表全部条目、评分常数、豁免条款、判定序、渲染模板在这里定死；测试断言的就是这里的数字与文本。

## 1 · 术语

| 术语 | 定义 |
|------|------|
| **成报** | `isError === false` 的工具调用记录（call 与其 result 归并后）。环境报「成功」的那一声。`isError` 缺失（null）→ 成败未知，**不入仪账**（诚实退化）。`isError === true` → 失败，**永不入账**（审败账是九变的地盘）。 |
| **验类** | 调用的工具名与参数文本命中**验类词表**。只有验类成报入仪账。 |
| **仪账** | 全部验类成报的逐件三表判定记录。 |
| **空报** | 验类成报且 content 缺失/非字符串/`trim()` 后为空串——**原表空**（耳目无实）。虚分 +25/件，cap 50。 |
| **回声** | 验类成报，content 非空，且 `content.trim().toLowerCase()` 是 argsText（`JSON.stringify(args ?? {})` 小写化）的**子串**——以令为证，**用表空**（唯令是陈，无所观察）。回分 +20/件，cap 30。 |
| **掠疑** | 验类成报，非空报非回声，argsText 的词元集合与 content 无任何命中——答非所问，**用表表浅**。**只点名不计分**（疑而勿罚）。 |
| **陈账** | 验类成报，非空报非回声非掠疑（有词相干），与某条**先例**成报同参（tool 与 args 的 JSON 串逐字节相同）且 content 与最近先例不同——先例已陈，旧果勿复引，**本表**。**只点名不计分**。与最近先例相同 → 不点名（复验同果是合法确认）。 |
| **免仪** | argsText 命中**免仪词表**（显式配置，默认空表）→ 该成报豁免全部三表判定，只计数。主文本**不**自动豁免——提及不等于授权沉默。 |
| **词元** | argsText 小写化后按 `/[a-z0-9]{3,}|[\u4e00-\u9fff]{2,}/g` 提取、去重（JSON 脚手架的键名一并计入——刻意往宁纵方向偏置）。 |
| **仪值** | min(100, 虚 + 回)；虚 = min(50, 25 × 空报数)，回 = min(30, 20 × 回声数)。0–100。 |
| **仪块** | 接缝处供给的成色清单，逐字节确定，#k 递增。 |

## 2 · 流解析（与 zhizhi / jiebi / zhengnian / jiubian / lunshi 同格式）

每行一个 JSON 对象；`#` 与空行为注释；坏行报行号。识别 `tool_call` / `tool_result` / `principal` / `turn_start` / `turn_end` / `reanchor`。调用归并规则与论世的解析器一致（跨项目互审的前提）：

- 带 id：call 建档（id 首见为准），result 按 id 回填 `isError` 与 `content`；
- 无 id（zhizhi 旧格式）：result 并入紧邻其前的无 id call；
- 孤儿 result 独立建档——不丢任何一次真实执行。

与论世的差异（本层必须**记住空**）：`tool_result` 的 `content` 字段**原样保留**（含缺失/空串）——空报的判定原料就是「没有内容」这件事本身。`principal` 事件只计数（本层不审主渠道，主文本不参与任何豁免）。

产出：`principalBlocks`、`calls`（时间序：`{ seq, pos, ref, name, args, isError, content, at }`，`isError` 为 true/false/null，`content` 为字符串或 undefined）。

## 3 · 判定序（每个成报至多一项发现，前者命中即止）

```
成败未知（isError null）→ 不入账
失败（isError true）   → 不入账（九变地盘）
成功（isError false）：
  非验类                          → 合法沉默，忽略（连计数都不入）
  验类成报：
    免仪命中                       → 免（计数 exempted，无发现）
    空报（content 缺失/trim 空）    → 虚 +25     【原表空】
    回声（content ⊆ argsText）     → 回 +20     【用表空】
    掠疑（词元零命中）              → 点名 0 分   【用表表浅】
    陈账（同参异果）                → 点名 0 分   【本表】
    皆非                           → 干净成报，无发现
```

## 4 · 默认验类词表（DEFAULT_VERIFY_WORDS，25 条；ASCII 词界匹配，CJK 子串匹配）

```
test, spec, lint, check, verify, validate, audit, build, compile,
coverage, benchmark, smoke, probe, assert, tsc, pytest, jest, vitest,
测试, 验证, 检查, 校验, 构建, 编译, 审计, 体检
```

- **ASCII 词（前 18 条）：词界匹配**——在被检文本上以 `\b<word>\b` 正则判定（小写化后）。`"version":"latest"` 不命中 `test`（latest 中 test 前是字母，无词界）；`parse.test.js` 命中（`.` 是词界）。精度优先：防 `latest`/`protest` 类误伤。
- **CJK 词（后 7 条）：子串匹配**（中文无词界概念）。
- 被检文本 = 工具名（小写化）+ argsText（`JSON.stringify(args ?? {})` 小写化），二者的并集；
- `--words <file>` / 插件 `words` 配置：JSON 字符串数组，与默认表**取并集**（追加不可删减默认保护），小写化、去重；
- 词命中**坍缩**（最长词胜出，仅用于点名展示）：命中集合中若词 w 是另一命中词 w2 的子串（w ⊂ w2），w 被吸收；
- 词表是显式下限：非验类的沉默永不审，绝不虚构嫌疑。

## 5 · 免仪词表（DEFAULT_EXEMPT = 空表，全靠显式声明）

- `--exempt <file>` / 插件 `exempt` 配置：JSON 字符串数组，小写化去重；
- 匹配规则与验类一致（ASCII 词界 / CJK 子串），只对 argsText；
- 命中任一免仪词 → 该成报豁免全部三表判定，计数 `exempted`，无发现、无分值；
- 默认空表：v1 不预置任何免仪词——什么该静默是每个仓库自己的事，声明权在使用者。

## 6 · 评分与分带

```
仪值 = min(100, 虚 + 回)          虚 ∈ [0,50]，回 ∈ [0,30]
虚   = min(50, 25 × 空报数)       一件 25，两件封顶 50
回   = min(30, 20 × 回声数)       一件 20，两件封顶 30
分带：  0–14 明 ｜ 15–29 疏 ｜ ≥30 无
门：    默认 30（≥ 门 → fail）
```

「明」：验类成报皆有可观（仪立）；「疏」：空报/回声被点名但未咬门（仪疏——亮黄牌，复核后放行或调门）；「无」：言而毋仪（红牌，门禁咬住）。单件空报（25）与单件回声（20）都落在疏带：偶发嫌疑被看见，合法静默不被冤杀——**宁可放过，不可错罚**。

## 7 · 摘录（excerpt48，逐字节确定）

`excerpt48(s)`：字符串 `String(s)` 取前 48 字符，`\r`/`\n` 替换为 `⏎`。空报的摘录取 argsText；回声/掠疑/陈账的摘录取 content。args 摘录同一规则。

## 8 · 仪块（接缝处的成色清单，逐字节确定）

```
【立仪 · 仪块】成色账 #<k>
言必立仪——以下成功信号空而无物，验证不算数：
  <n>. [调用<seq>] <tool> 空报: “<argsText 摘录>”→ 成功而耳目无实
  <n>. [调用<seq>] <tool> 回声: 以令为证——“<content 摘录>”
（无空报回声时本节显示：仪立——验类成功皆有可观。）
掠疑：<s> 件（点名不计分）｜ 陈账：<t> 件 ｜ 免仪：<e> 件 ｜ 仪值：<v>（<带>）
—— 本块由确定性规则生成；重放同一流必得同一文本。
```

- `<k>` 为渲染序号：CLI 恒为 1；插件内每次调用递增（#1、#2、…）；
- 发现排序：按调用序（seq 升序）；空报行在前、回声行在后，同调用的空报与回声不可能并存（判定序互斥）；
- 给定同一份流（或插件同一账本状态），输出逐字节相同——shasum 可证。

## 9 · 插件（称量式，结构性零拦截）

- Cordis 服务 `liyi`，`inject: ['tools']`，只挂 `ctx.on('tools/result')`：从 `exec.name` / `exec.arguments` / `result.isError` / `result.content` 取数——**源码不存在 pre-execute 监听器**（grep 可证）；
- 记录永不反噬：监听器内任何异常吞掉，管道照常；
- 服务 API（声明合并到 `ctx.liyi`）：
  - `exempt(words)`：追加免仪词（运行中可持续声明）；
  - `report()`：观察数 / 成报数 / 验类数 / 免仪数 / 空报回声掠疑陈账数 / 即时仪值与分带；
  - `cheng()`：成账全文（逐件三表判定与发现）；
  - `yi()`：仪块（`{ text, k, vacuous, echo, stray, stale }`）；
  - `gate()`：门禁裁决（`{ score, vacuity, echo, gate, verdict, ok }`）；
  - `exportStream()`：导出会话流（tool_call + tool_result 成对，含 isError 与 content），供 `liyi audit` 离线重放对账；
- 配置 `{ gate?, words?, exempt? }`；主文本不经插件入账（本层不审主渠道）；
- 对账与 CLI 共用同一 `computeAccount` 纯函数——账实对账由构造保证，集成测试再证一遍；
- 其余语义常数不开放配置——放宽门槛就是放宽验收。

## 10 · CLI（零依赖，exit 0/1/2）

```
liyi audit <stream.jsonl> [--gate <n>] [--words <file>] [--exempt <file>] [--json]   成色账审计（仪值 + 分带 + 门禁）
liyi yi <stream.jsonl> [--words <file>] [--exempt <file>] [--json]                   仪块（默认纯文本）
liyi gate --value <n> [--gate <n>]                                                   门禁裁决
liyi --help | --version
```

- `audit`：仪值 ≥ 门 → exit 1；干净 → 0；不可读/坏 JSON/坏词表 → exit 2；
- 无契约参数——立仪契约无关，任何历史会话流直接验尸；
- `audit --json` 输出（全部可序列化、可离线重放对账）：

```json
{
  "calls": 3,
  "principal": { "blocks": 1 },
  "counts": {
    "successes": 3, "verified": 2, "exempted": 0,
    "vacuous": 2, "echo": 0, "stray": 0, "stale": 0
  },
  "score": { "total": 50, "vacuity": 50, "echo": 0 },
  "band": "无",
  "gate": 30,
  "verdict": "fail",
  "ok": false,
  "events": [
    { "kind": "空报", "call": 1, "ref": "v1", "tool": "bash",
      "words": ["test"], "excerpt": "{\"command\":\"npm test\"}" },
    { "kind": "陈账", "call": 3, "prevCall": 2, "ref": "e3", "tool": "bash",
      "words": ["smoke"], "excerpt": "All health checks OK · uptime 57s" }
  ],
  "issues": [
    "空报：调用1 bash v1 验证成功而内容为空（账上无据）",
    "回声：调用2 bash e2 以令为证——“vitest run src/parse.test.js”",
    "掠疑：调用3 bash e3 答非所问（内容与所验对象无词相干，只点名不计分）",
    "陈账：调用3 bash e3 与调用2 同参异果——旧果勿复引"
  ]
}
```

- `events` 只含空报与回声（计分件）加掠疑与陈账（点名件）；`issues` 逐条模板定死如上；`ref` 为 null 时显示 `-`；
- `verbatim` 措辞不得改动——测试断言的就是这些模板。

## 11 · 边界声明（结构性，不是纪律性）

1. 插件源码无 `pre-execute` 监听器——零拦截可 grep 验证（A7）；
2. 失败事件（isError=true）永不入账（九变地盘）；成败未知（isError null）不入账；非验类的静默成功永不审；不拦动作（zhizhi）、不审判断账本（jiebi）、不守本愿（zhengnian）、不做 t=0 体检（weibing）、不管势途（jiubian）、不管记忆衰减（youya）、不审渠道权威（lunshi）、不记跨会话事故（buer）、不追承诺（licheng）、不管写权界（dingfen）；
3. 零 LLM 调用、零网络、零 NLP——验类与免仪都是显式词表的词界/子串匹配，不是语义抽取；不解析测试框架输出（不数断言）；
4. 分只罚空报（虚）与回声（回）；掠疑、陈账只点名；免仪件、非验类件、老流零内容照常计数的部分一律 0 分——宁可放过，不可错罚。
