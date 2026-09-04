# 03 · 设计：本愿契约、尘值、拂拭块与终验门

## 架构：不拦动作、不审判断，只守本愿、供给上下文

与前两层的根本分工：zhizhi 挂 `tools/pre-execute` **拦截动作**；jiebi 挂 `tools/result` **观察并校验判断账本**；正念挂 `tools/result` **度量本愿在场**，并对外供给**拂拭块**——一个逐字节确定性的上下文物件，供宿主在接缝（压缩、回合边界、收尾）注入。插件里不存在 pre-execute 监听器（结构性零拦截），也不校验任何 Agent 产物（度量只读契约与动作流）。

```
任务开工 ──▶ 立本愿契约（wish contract，开工时声明一次）──▶ ctx.zhengnian.setContract()
                                                                │
模型请求调用 ──▶ tools/pre-execute ──▶ 真实工具执行 ──▶ tools/result
                     （正念不在此接缝存在——零拦截是结构性的）   │
                                                                ▼
                                              ┌──────────────────────────────┐
                                              │ 正念供给式插件（Cordis）        │
                                              │  · 尘值账本（失念·攀缘·息尘）    │
                                              │  · 事件流导出（含 reanchor 事件）│
                                              │  · ctx.zhengnian.reanchor()   │──▶ 拂拭块 ──▶ 宿主在接缝注入
                                              │  · ctx.zhengnian.acceptance() │──▶ 终验门
                                              └──────────────────────────────┘
                                                                │
                          离线：zhengnian audit <契约> <流.jsonl> ──▶ 尘值 + 终验 ──▶ CI 门禁（exit code）
```

同一事物的两种消费：

- **运行时**（Cordis 插件）：`ctx.zhengnian.setContract / dust / reanchor / acceptance / report / exportStream / beginTurn / endTurn`；
- **离线**（零依赖 CLI）：`template / contract / reanchor / audit`，对任何正念流（兼容 zhizhi / jiebi stream）做事后审计。

## 本愿契约（wish contract v1）

契约是本愿的**形状**：开工时声明一次，之后的一切度量与拂拭都从它确定性推导。Agent 在契约面前没有产物可伪造——它不是 Agent 写的，是任务方立的。

```jsonc
{
  "version": 1,
  "id": "w-001",
  "wish": "修复 payments 模块的重复扣款，并让回归测试全绿",   // 本愿一句话，必填
  "anchors": {
    "keywords": ["payment", "duplicate", "扣款"],          // ≥1 个，失念可测的前提
    "paths": ["src/payments/"]                              // 可选，锚点路径（前缀匹配）
  },
  "scope": {
    "allowRoots": ["src/payments/", "tests/payments/"]     // 愿界：允许写入的根
  },                                                        // 或 { "allowAll": true }（无界，攀缘分结构性沉默）
  "acceptance": [                                           // 终验：完成必须对账的证据，≥1 条
    { "ref": "a1", "name": "bash", "argsContains": "npm test" },
    { "ref": "a2", "artifact": "reports/repro-fixed.txt" }
  ],
  "window": 10                                              // 可选，失念窗口，默认 10
}
```

schema 校验（`zhengnian contract`）分项：

- `version` 必须 1；`id`、`wish` 必须非空字符串；
- `anchors.keywords` 必须是 ≥1 个非空字符串的数组；`anchors.paths` 可选，存在则每个非空；
- `scope` 必须对象，且**恰好一**：非空 `allowRoots` 数组 **或** `allowAll === true`（两者并存/皆无 → 非法）；
- `acceptance` 必须 ≥1 条，每条有非空 `ref`，且带 `name`+`argsContains`（都非空）**或** `artifact`（非空）；
- `window` 可选，正整数。

非法 → CLI 退出码 2。**契约非法不度量**——一个没有形状的本愿，尘值对它保持沉默。

## 尘值（dust score）

一个确定性的数字，回答："此刻的动作流离本愿有多远？" 0–14 净，15–29 浮（浮尘），≥30 蒙（蒙尘，CI 门默认阈 30）。**尘值不度量对错**——尘值 0 只保证"动作还在锚点附近、没伸出愿界、拂拭没断顿"，不保证那些动作本身正确。

每个计分项都来自原典条款（docs/01-book.md），无一凭感觉设定：

| 检查项 | 计分 | 上限 | 出处 |
|---|---|---|---|
| **失念**：最近窗口（`window`，默认 10 次调用）内，从最新一次调用往回的**锚点零交集连击**长度 L，每次 +8 | min(40, 8×L) | 40 | 念者，于曾习境，令心明记不忘（《成唯识论》）——动作里没有所缘的痕迹＝失念 |
| **攀缘**：写类动作的路径落在 `allowRoots` 之外，每次 +12；路径提取失败不罚，计入 `unparsedWrites` 诚实计数 | min(40, 12×n) | 40 | 心攀缘外境——手伸出了愿界 |
| **息尘**：调用序列按拂拭（reanchor 事件）切段，长度 > `maxStale`（默认 30）的段每段 +10 | min(20, 10×k) | 20 | 时时勤拂拭，勿使惹尘埃（神秀偈）——"时时"是频率条款 |

总 cap 100。分带：`0–14 净`、`15–29 浮`、`≥30 蒙`（`--gate` 默认 30，audit 退出码 1）。

### 失念的确定性定义

调用 `c` 与本愿**锚点有交集**（goal-relevant），当且仅当：

1. `anchors.keywords` 中任一词（大小写不敏感）作为子串出现在 `JSON.stringify(c.args)` 中；**或**
2. `c` 的主路径落在 `anchors.paths` 中任一前缀之内；**或**
3. `c` 是写类动作且其主路径落在 `scope.allowRoots` 中任一前缀之内（有界之愿里，手在愿内＝念在）——`allowAll` 时本条不适用（无界之愿退回 1/2，诚实地承认"范围度量对你沉默"）。

失念分只看**从最新调用往回的连续零交集连击**：中间曾失念、后来回来了，不算——"不怕念起，只怕觉迟"，度量的是**此刻**离开所缘多久，不是历史上有过几次走神。

### 攀缘的确定性定义

- **写类动作**：结构化写工具（`write / edit / create / update / delete / mkdir / touch / move / rename / patch / apply_patch / str_replace / multiedit / notebook_edit`，大小写不敏感）＋ shell 类工具（`bash / shell / terminal / exec`）中命令命中变更模式（重定向 `>`/`>>`、`tee`、`sed -i`、`dd`、`cp`、`mv`、`rm`、`chmod`、`chown`、`ln`、`mkdir`、`touch`、`truncate`、`git add/commit/restore/clean/reset --hard/checkout --`）；
- **主路径提取**：结构化工具取 `args.path / file_path / file / target / filename` 第一个存在的字符串；shell 取命令中第一个可提取的路径 token（重定向目标、tee 目标、变更命令的首个非选项参数）。**提取失败不罚**——宁漏勿错，计入 `unparsedWrites`；
- **愿界判定**：路径与 `allowRoots` 都做归一化（剥 `./`、统一 `/`）后做前缀匹配；愿界以相对路径书写，绝对路径视为界外。

### 息尘的确定性定义

流中 `{"type":"reanchor"}` 事件把调用序列切段；零拂拭事件时全流为一段。段长 > `maxStale` 记一次违例。这样"从头到尾不拂拭"最多只记一段（+10）——息尘罚的是**断顿的次数结构**，不是流长。

## 拂拭块（reanchor block）

供给物的全部意义在于**逐字节确定**：同一契约＋同一尘值状态 → 同一串字节。宿主可以在任何接缝注入它而不必担心不可复现。

```
【拂拭 · re-anchor】#3
本愿：修复 payments 模块的重复扣款，并让回归测试全绿
锚点：payment / duplicate / 扣款
锚径：src/payments/
愿界：src/payments/ / tests/payments/
终验：a1=bash~npm test；a2=artifact=reports/repro-fixed.txt
尘值：18（失念 8 · 攀缘 0 · 息尘 10）
——《坛经》：时时勤拂拭，勿使惹尘埃。
```

- `#k` 是拂拭序号（运行时每 `reanchor()` 一次 +1；离线无状态时恒 `#1`）；
- 尘值行仅在携带状态（`--stream` 或运行时）时出现——离线的 `zhengnian reanchor wish.json` 是纯愿块，不假装自己量过什么；
- `allowAll` 时愿界行写作 `全域（allowAll——攀缘之门对无界之愿保持沉默）`。

## 终验门（acceptance gate）

`--acceptance` 时逐条核对契约 `acceptance[]`：

- `name + argsContains`：流中存在一次调用，`name` 逐字相同**且** `argsContains`（大小写不敏感）是其 args 序列化结果的子串 → `verified`；
- `artifact`：给了 `--cwd <dir>` 则查 `existsSync(join(dir, artifact))`；否则查流中是否有调用 args 序列化包含 artifact 字符串；都没有 → `unverified`（**不假装核对了没核对的东西**——要文件系统核对，就给 `--cwd`）；
- 任一条 `unverified` → 终验门 fail（exit 1），fail 清单逐条列出。

终验门与 zhizhi 完成核验的边界：zhizhi 问"**有没有**验证证据"（任何验证性命令都算），终验门问"**证据是不是对着本愿的**"（契约声明的终验在不在流里）。一个管有无，一个管对准。

## 正念流（zhengnian stream，兼容 zhizhi / jiebi stream）

每行一个 JSON 对象，`#` 与空行为注释。在 zhizhi/jiebi 事件之上新增一种：

```
{ type:'reanchor', id, turn?, at }     // 拂拭事件：切段与序号的依据
```

zhizhi / jiebi 导出的流可以直接喂给 `zhengnian audit`——三层治理共用一本账。

## 失败哲学

- **观察永不反噬**：`tools/result` 监听器里的任何异常被吞掉，管道照常（与 zhizhi / jiebi 同款约定）；
- **无契约不度量**：契约没立或不合法，尘值保持沉默并明说（`contractInstalled:false`），绝不假装量了；
- **提取失败不罚**：路径提取是粗糙的确定性启发——宁漏勿错，漏掉的计入 `unparsedWrites` 让人看得见；
- **不承诺正确**：尘值 0 的会话仍可能在有效地做错事。正念保证的是本愿的形状、漂移的数字、终验的对账——不是结果的正确。
