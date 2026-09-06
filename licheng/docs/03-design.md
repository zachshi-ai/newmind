# 03 · 设计：绳账、咎值与结账门

## 总览

```
Agent 出言承诺 ──▶ 绳账 knot ledger（绳账协议 v1，JSONL / 插件内存账）
                    promise 立结 · revise 改结 · abandon 解约
                                                                │
模型请求调用 ──▶ tools/pre-execute ──▶ 真实工具执行 ──▶ tools/result
                     （立诚不在此接缝存在——零拦截是结构性的）  │
                                                                ▼
                                结绳式插件：观察调用，维持在途绳账
                                                                │
宿主在收尾接缝调用 ctx.licheng.settle() ──▶ 结账块（逐字节确定）
                                                                │
                licheng settle 绳账 × 会话流 ──▶ 咎值 + 结账门 ──▶ CI 门禁
```

六种插件能力类型：拦（zhizhi）/ 审（jiebi）/ 供给（zhengnian）/ 记习（buer）/ 诊断（weibing）/**结绳（licheng）**——观察结果接缝、维持绳账、随叫随结。结构性零拦截：源码没有 pre-execute 监听器。

## 绳账协议 v1（JSONL，一行一结）

`#` 与空行为注释。三种条目：

```jsonc
{"type":"promise","id":"p-001","what":"跑全量测试并贴出输出","discharge":{"tool":"bash","contains":"npm test","ok":true}}
{"type":"revise","id":"p-001r","supersedes":"p-001","reason":"新路径只迁 9 个模块，其余由宿主另派","what":"迁移 9 个模块并跑通 smoke"}
{"type":"abandon","id":"p-002a","supersedes":"p-002","reason":"宿主 mid-run 指示改用方案 B，原优化作废"}
{"type":"discharge","settles":"p-004","discharge":{"tool":"write","contains":"README"}}
```

| 条目 | 必需键 | 禁止键 | 语义 |
|------|--------|--------|------|
| `promise` | `type,id,what`；可选 `discharge` | 未知键、`supersedes/reason/settles` | 立结。无 `discharge` 即**无凭之诺**（轻诺候选） |
| `revise` | `type,id,supersedes,reason`；可选 `what,discharge` | 未知键、`settles` | 改结：目标必须**此刻仍开**；未覆盖的字段从目标**继承**；旧结合法关闭（悔，不记分） |
| `abandon` | `type,id,supersedes,reason` | 未知键、`what/discharge/settles` | 解约：目标必须**此刻仍开**；带理由显式作废（不记咎，入账可审计） |
| `discharge` | `type,settles,discharge` | 未知键、`id/what/reason/supersedes` | 兑现宣告（忘记立凭时的补悔路径）：目标必须**此刻仍开**；凭据由结账引擎对账，命中即 `discharged`，不命中则结仍悬着（口头兑现解不开结——伪造兑现无门） |

**schema 错误（exit 2，与计分无关）**：JSON 坏行（报行号）、缺必需键、空串字段、未知键、id 重复、`supersedes` 指向不存在的结、指向**已关闭**的结（改一个已改过的结是账目混乱，不是过错）。

**凭据 `discharge` 语法**：`{"tool": <可选，工具名精确匹配>, "contains": <必需，调用 args JSON 的子串>, "ok": <可选 boolean>}`。
`ok:true` 要求那次调用的结果 `isError === false`；`ok:false` 要求 `isError === true`；缺省不问成败。

## 结账语义（settle）

按账序单遍走账：

1. `promise` → 开结（带 `discharge` 则链上记"有凭"）；
2. `revise` → 目标闭为 `revised`，新结开（`what`/`discharge` 未覆盖则从目标继承，"有凭"标记随链传递）；
3. `abandon` → 目标闭为 `abandoned`；
4. `discharge` 宣告 → 目标（此刻仍开）的凭据被宣告覆盖，链上记"有凭"（补悔路径；宣告的凭据同样要对账——口头兑现解不开结）；
5. 收尾：仍开的结（每条链的链尾）逐个对账——凭据在会话流的**全部调用**里找匹配（`tool` 精确 + `contains` 为 `JSON.stringify(args)` 子串 + `ok` 对照 `isError`）：
   - 找到 → `discharged`（记首次命中的调用序号，账实对账成立）；
   - 找不到 → `breached`（**失诺**：咎）。

改诺链（p-003 → p-003r → p-003r2）逐结展开，最终只对**链尾**开结结账；被改/被弃的结按其终态入账，改诺与弃约本身记 0 分（悔）。

## 咎值（blame score，0–100）

确定性数字，回答："此刻的绳账还欠多少？"——分高为欠。

| 爻象 | 判据 | 分 | 原典 |
|------|------|-----|------|
| **咎**（失诺） | 链尾结账时凭据无匹配 | +30/条，cap 60 | 系辞上：枢机之发，荣辱之主也 |
| **吝**（轻诺） | 整条链从立诺到终态**从未有过凭据**（立诺无凭、改诺未补、无宣告）：终态失诺 → 与咎叠加；终态弃约 → 单独记吝 | +10/条，cap 20 | 系辞上：悔吝者，言乎其小疵也；拟之而后言 |
| **悔**（改诺/弃约） | 带理由显式登记 | 0（免费，但永久入账） | 系辞上：无咎者，善补过也；震无咎者存乎悔 |
| **信**（兑现） | 凭据在流中真实命中 | 0（账平） | 乾·文言：庸言之信，庸行之谨 |

**咎值 = min(100, min(60, 30×失诺) + min(20, 10×轻诺))**；
分带：**无咎(0–14) / 吝(15–29) / 咎(≥30)**；结账门默认 30（`--gate` 可调）。
校准含义：悔与信不记分；无凭之诺即使合法弃约也留吝痕（10/条，两笔入吝带）；**一笔失诺即进咎带**（30，过不了门）——蒸发零容忍，改诺零成本，轻诺留小疵。

## 漏账提示（audit，advisory 不计分）

会话流可携带可选 `speech` 事件（`{"type":"speech","text":"接下来我会补边界用例","turn":"t3"}`）。`licheng settle --json` 输出：

```jsonc
"speech": { "events": 4, "markerHits": 2, "unaccounted": 1 }   // 有 speech 事件
"speech": { "events": 0, "markerHits": 0, "unaccounted": null } // 流里没有话语：诚实写 null，绝不假装核对
```

`markerHits` 按**默认诺言词表**计数（事件含词即记一次，去重按事件）：接下来 / 稍后 / 回头 / 待会儿 / 然后（我） / 我会 / 我将 / 我打算 / 随后 / 接着（我）。`unaccounted = max(0, markerHits − promises)`，仅提示漏账，**永不计分**。词表可用 `--lexicon`（`{"markers":[...]}`）替换，声明权在使用方。

## 结账块（block，供给物）

逐字节确定（无时间戳、无随机数、悬结按账序），供宿主在收尾接缝注入上下文：

```
【立诚 · 结绳】
诺言：立 3 · 兑现 1 · 改诺 0 · 弃约 1 · 失诺 1
咎值：40（咎）· 门 30
悬结：p-002「同步 README 示例」咎+30，轻诺+10（整条链无凭据）
——《周易·系辞上》：无咎者，善补过也。
```

（同账里 p-001 兑现、p-003 带凭弃约——悔 0，不出现行。）全平的账以「绳上无悬结。」收尾，引文按分带二选一（无咎 → 文言；吝/咎 → 系辞），其余版式恒定。

## 插件（结绳式，Cordis）

```js
ctx.licheng.make(p)        // 立结（形状错误不抛错：valid:false + issues）
ctx.licheng.revise(r)      // 改结
ctx.licheng.abandon(id, reason)
ctx.licheng.declare(settles, discharge)  // 兑现宣告（补悔路径）
ctx.licheng.settle()       // 对观察到的调用实时结账 → 报告（咎值/分带/悬结）
ctx.licheng.block()        // 结账块文本
ctx.licheng.exportCalls()  // 导出观察到的调用流（账实对账：与离线引擎 deepEqual）
ctx.licheng.report()       // { ledgerSize, openKnots, gate, zeroIntercept }
```

观察接缝只有 `tools/result`（唯一写入口），监听器内异常全吞——观察永不反噬；无 pre-execute 监听器——零拦截是结构性的。

## 与六层的边界

- **不做动作治理**：没有 pre-execute 监听器，物理上拦不了任何调用（zhizhi 地盘）；
- **不校验判断**：不读解蔽账本字段，不做候选/反证分析（jiebi 地盘）；
- **不守本愿**：不度量动作流与本愿锚点的距离（zhengnian 地盘）——本愿是主人的，诺是自己的；
- **不做开工体检**：不读任务书、不探环境（weibing 地盘）；
- **不记跨会话教训、不勘环境应变**（buer / jiubian 地盘）；
- **零语义**：词表、子串、布尔，零 LLM、零提示词注入、零网络、零子进程，可逐字重放。
