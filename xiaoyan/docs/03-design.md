# 03 · 设计：效账、效值与证块（语义在本文件锁死，实现与测试不得擅自放宽）

> 本文件是唯一语义权威。词表全部条目、评分常数、豁免条款、判定序、渲染模板在这里定死；测试断言的就是这里的数字与文本。

## 1 · 术语

| 术语 | 定义 |
|------|------|
| **成报** | `isError === false` 的工具调用记录（call 与其 result 归并后）。环境报「成功」的那一声。`isError` 缺失（null）→ 成败未知，**不入效账**（诚实退化）。`isError === true` → 失败，**永不入账**（审败账是九变的地盘）。 |
| **效类** | 调用的工具名与参数文本命中**效词表**。只有效类成报入效账。 |
| **效账** | 全部效类成报的逐件三问判定记录。 |
| **空言** | 效类成报且 content 缺失/非字符串/`trim()` 后为空串——**有实乎？无**（耳目无实）。虚分 +25/件，cap 50。 |
| **回令** | 效类成报，content 非空，且 `content.trim().toLowerCase()` 是 argsText（`JSON.stringify(args ?? {})` 小写化）的**子串**——以令为证，**所验乎？未验**（唯令是陈，无所观察）。回分 +20/件，cap 30。 |
| **离效** | 效类成报，非空言非回令，argsText 的词元集合与 content 无任何命中——答非所问，**所验乎？离**。**只点名不计分**（疑而勿罚）。 |
| **陈效** | 效类成报，非空言非回令非离效（有词相干），与某条**先例**成报同参（tool 与 args 的 JSON 串逐字节相同）且 content 与最近先例不同——旧果已陈，勿复引。**只点名不计分**。与最近先例相同 → 不点名（复验同果是合法确认）。 |
| **免验** | argsText 命中**免验词表**（显式配置，默认空表）→ 该成报豁免全部三问判定，只计数。主文本**不**自动豁免——提及不等于授权沉默。 |
| **词元** | argsText 小写化后按 `/[a-z0-9]{3,}\|[\u4e00-\u9fff]{2,}/g` 提取、去重（JSON 脚手架的键名一并计入——刻意往宁纵方向偏置）。 |
| **效值** | min(100, 虚 + 回)；虚 = min(50, 25 × 空言数)，回 = min(30, 20 × 回令数)。0–100。 |
| **证块** | 接缝处供给的成色清单，逐字节确定，#k 递增。 |

## 2 · 流解析（与 zhizhi / jiebi / zhengnian / jiubian / lunshi / zhibi 同格式）

每行一个 JSON 对象；`#` 与空行为注释；坏行报行号。识别 `tool_call` / `tool_result` / `principal` / `turn_start` / `turn_end` / `reanchor`。调用归并规则与论世的解析器一致（跨项目互审的前提）：

- 带 id：call 建档（id 首见为准），result 按 id 回填 `isError` 与 `content`；
- 无 id（zhizhi 旧格式）：result 并入紧邻其前的无 id call；
- 孤儿 result 独立建档——不丢任何一次真实执行。

与论世的差异（本层必须**记住空**）：`tool_result` 的 `content` 字段**原样保留**（含缺失/空串）——空言的判定原料就是「没有内容」这件事本身。`principal` 事件只计数（本层不审主渠道，主文本不参与任何豁免）。

产出：`principalBlocks`、`calls`（时间序：`{ seq, pos, ref, name, args, isError, content, at }`，`isError` 为 true/false/null，`content` 为字符串或 undefined）。

## 3 · 判定序（每个成报至多一项发现，前者命中即止）

```
成败未知（isError null）→ 不入账
失败（isError true）   → 不入账（九变地盘）
成功（isError false）：
  非效类                          → 合法沉默，忽略（连计数都不入）
  效类成报：
    免验命中                       → 免（计数 exempted，无发现）
    空言（content 缺失/trim 空）    → 虚 +25     【有实乎？无】
    回令（content ⊆ argsText）     → 回 +20     【所验乎？以令为证】
    离效（词元零命中）              → 点名 0 分   【所验乎？离】
    陈效（同参异果）                → 点名 0 分   【先例乎？旧果已陈】
    皆非                           → 干净成报，无发现
```

## 4 · 默认效词表（DEFAULT_XIAO_WORDS，25 条；ASCII 词界匹配，CJK 子串匹配）

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
- 词表是显式下限：非效类的沉默永不审，绝不虚构嫌疑。

## 5 · 免验词表（DEFAULT_MIANYAN_WORDS = 空表，全靠显式声明）

- `--exempt <file>` / 插件 `exempt` 配置：JSON 字符串数组，小写化去重；
- 匹配规则与效类一致（ASCII 词界 / CJK 子串），只对 argsText；
- 命中任一免验词 → 该成报豁免全部三问判定，计数 `exempted`，无发现、无分值；
- 默认空表：v1 不预置任何免验词——什么该静默是每个仓库自己的事，声明权在使用者。

## 6 · 评分与分带

```
效值 = min(100, 虚 + 回)          虚 ∈ [0,50]，回 ∈ [0,30]
虚   = min(50, 25 × 空言数)       一件 25，两件封顶 50
回   = min(30, 20 × 回令数)       一件 20，两件封顶 30
分带：  0–14 明 ｜ 15–29 疏 ｜ ≥30 虚
门：    默认 30（≥ 门 → fail）
```

「明」：效类成报皆有可观（证验在场）；「疏」：空言/回令被点名但未咬门（验疏——亮黄牌，复核后放行或调门）；「虚」：空言虚语（红牌，门禁咬住）。单件空言（25）与单件回令（20）都落在疏带：偶发嫌疑被看见，合法静默不被冤杀——**宁可放过，不可错罚**。

## 7 · 摘录（excerpt48 + 掩码自洁，逐字节确定）

`excerpt48(s)`：字符串 `String(s)` 取前 48 字符，`\r`/`\n` 替换为 `⏎`，再过**掩码自洁**：`sk-<8 位以上字母数字>`、`Bearer <8 位以上字母数字._->`、`-----BEGIN <大写字母/空格> PRIVATE KEY-----`、`AKIA<16 位大写字母数字>` 四形命中即整体替换为 `⟪掩⟫`（报告不得成为新的出险面；这不是对出境的审计，出境另有其主——承直笔的同一卫生标准）。空言的摘录取 argsText；回令/离效/陈效的摘录取 content。args 摘录同一规则。

## 8 · 证块（接缝处的成色清单，逐字节确定）

```
【效验 · 证块】效账 #<k>
事莫明于有效，论莫定于有证——以下成功信号空言虚语，验证不算数：
  <n>. [调用<seq>] <tool> 空言: “<argsText 摘录>”→ 成功而耳目无实
  <n>. [调用<seq>] <tool> 回令: 以令为证——“<content 摘录>”
（无空言回令时本节显示：证验在场——效类成功皆有可观。）
离效：<s> 件（点名不计分）｜ 陈效：<t> 件 ｜ 免验：<e> 件 ｜ 效值：<v>（<带>）
—— 本块由确定性规则生成；重放同一流必得同一文本。
```

- `<k>` 为渲染序号：CLI 恒为 1；插件内每次调用递增（#1、#2、…）；
- 发现排序：按调用序（seq 升序）；空言行在前、回令行在后，同一件的空言与回令不可能并存（判定序互斥）；
- 给定同一份流（或插件同一账本状态），输出逐字节相同——shasum 可证。

## 9 · 插件（称实式，结构性零拦截）

- Cordis 服务 `xiaoyan`，`inject: ['tools']`，只挂 `ctx.on('tools/result')`：从 `exec.name` / `exec.arguments` / `result.isError` / `result.content` 取数——**源码不存在 pre-execute 监听器**（grep 可证）；
- 记录永不反噬：监听器内任何异常吞掉，管道照常；
- 服务 API（声明合并到 `ctx.xiaoyan`）：
  - `exempt(words)`：追加免验词（运行中可持续声明）；
  - `report()`：观察数 / 成报数 / 效类数 / 免验数 / 空言回令离效陈效数 / 即时效值与分带；
  - `xiaozhang()`：效账全文（逐件三问判定与发现）；
  - `zheng()`：证块（`{ text, k, vacuous, echo, stray, stale }`）；
  - `gate()`：门禁裁决（`{ score, vacuity, echo, gate, verdict, ok }`）；
  - `exportStream()`：导出会话流（tool_call + tool_result 成对，含 isError 与 content），供 `xiaoyan audit` 离线重放对账；
- 配置 `{ gate?, words?, exempt? }`；主文本不经插件入账（本层不审主渠道）；
- 对账与 CLI 共用同一 `computeAccount` 纯函数——账实对账由构造保证，集成测试再证一遍；
- 其余语义常数不开放配置——放宽门槛就是放宽验收。

## 10 · CLI（零依赖，exit 0/1/2）

```
xiaoyan audit <stream.jsonl> [--gate <n>] [--words <file>] [--exempt <file>] [--json]   效账审计（效值 + 分带 + 门禁）
xiaoyan zheng <stream.jsonl> [--words <file>] [--exempt <file>] [--json]                证块（默认纯文本）
xiaoyan gate --value <n> [--gate <n>]                                                   门禁裁决
xiaoyan --help | --version
```

- `audit`：效值 ≥ 门 → exit 1；干净 → 0；不可读/坏 JSON/坏词表/坏免验表 → exit 2；
- 无契约参数——效验契约无关，任何历史会话流直接验尸；
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
  "band": "虚",
  "gate": 30,
  "verdict": "fail",
  "ok": false,
  "events": [
    { "kind": "空言", "call": 1, "ref": "v1", "tool": "bash",
      "words": ["test"], "excerpt": "{\"command\":\"npm test\"}" },
    { "kind": "陈效", "call": 3, "prevCall": 2, "ref": "e3", "tool": "bash",
      "words": ["smoke"], "excerpt": "smoke: all services up · uptime 57s" }
  ],
  "issues": [
    "空言：调用1 bash v1 验证成功而内容为空（账上无据）",
    "回令：调用2 bash e2 以令为证——“vitest run src/parse.test.js”",
    "离效：调用3 bash e3 答非所问（内容与所验对象无词相干，只点名不计分）",
    "陈效：调用3 bash e3 与调用2 同参异果——旧果勿复引"
  ]
}
```

- `events` 只含空言与回令（计分件）加离效与陈效（点名件）；`issues` 逐条模板定死如上；`ref` 为 null 时显示 `-`；
- 措辞不得改动——测试断言的就是这些模板。

## 11 · 边界声明（结构性，不是纪律性）

1. 插件源码无 `pre-execute` 监听器——零拦截可 grep 验证（A7）；
2. 失败事件（isError=true）永不入账（九变地盘）；成败未知（isError null）不入账；非效类的静默成功永不审；不拦动作（zhizhi）、不审判断账本（jiebi）、不守本愿（zhengnian）、不做 t=0 体检（weibing）、不管势途（jiubian）、不管记忆衰减（youya）、不审渠道权威（lunshi）、不裁写域（dingfen）、不称量出境（baihe）、不审尺脏（fayi——器与物两本账）、不判笔直（zhibi——迹与物两本账）、不管行前退路（yuli）、不量总量花销（duzhi）、不审须柄授命（erbing）、不记任务项终始（zhongshi）、不记跨会话事故（buer）、不追承诺（licheng）；
3. 零 LLM 调用、零网络、零 NLP——效类与免验都是显式词表的词界/子串匹配，不是语义抽取；不解析测试框架输出（不数断言）；
4. 分只罚空言（虚）与回令（回）；离效、陈效只点名；免验件、非效类件一律 0 分——宁可放过，不可错罚。
