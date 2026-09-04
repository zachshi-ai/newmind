# 03 · 设计：语义锁死

> 本文在实现前定稿，实现与测试若与本文冲突，只能改实现，不得改本文（04 的验收项引用本文编号）。

## 1 · 流与会话（多流模型）

- 流格式与本仓五仓统一：JSONL，`#` 与空行为注释，`tool_call` / `tool_result` 事件，`id` 配对回填 `isError`；坏行报行号（与 jiubian 解析器同规，跨项目互审的前提）。
- **一个流文件 = 一个会话**。会话 id = 文件名去 `.jsonl` 后缀；两个流的会话 id 相同 → 用法错误（exit 2）。
- 全局时序 = `(at, 会话 id, 流内事件序)` 字典序。`at` 缺失的写事件属**无时之写**：不参与争写交错判定（该对象组整组标记"无时"，只记提示）。

## 2 · 对象键与工具族（与 jiubian 同规，零 NLP）

- 对象键按序取第一个命中：`args.path` / `args.file_path` / `args.notebook_path`（字符串）→ `p:<值>`；`args.command`（非空 trim）→ `c:<值>`；其余 → `n:<工具名>`。
- 工具族：write = `{write,edit,apply,create,move,remove}` ∪ 包含 `write/edit/patch/insert/create`；observe/exec/other 同 jiubian 词表。
- **写事件** = family=write 且 `isError !== true`（失败之写未改变世界，不入账；结果缺失视同已落——审计宁误旗不漏旗）。

## 3 · 分册（权界登记，`.dingfen.json`）

```json
{ "version": 1, "claims": [
  { "id": "stray", "fences": ["src/auth/**"], "at": 10, "releasedAt": null }
] }
```

- **领分 claim**：同 id 已有开放之分 → 原位更新（fences/at）；否则追加。开放 = `releasedAt == null`。
- **销分 release**：该 id 最近一条开放之分置 `releasedAt`；无开放之分 → exit 2。
- 分的**开放时段** = `[at, releasedAt ?? ∞)`。写事件落在某分开放时段内，该分才对它有效。

## 4 · 界的语言（最小 glob，确定性匹配）

- 仅支持：字面段、`*`（段内任意非空、不含 `/`）、`**`（独占一段，跨零或多段）。路径先规范化（`\`→`/`、去 `./`、并 `//`），大小写敏感，**不触碰文件系统**（离线流里的路径可以不存在——确定性优先于"真值"）。
- **争界**（claim 时告警）：两个开放之分（不同 id）的 glob 有共同命中径。判定用精确的段级交运算；**每处告警必须附一条见证径**，且见证径必须真实通过双方的匹配器（见证自证——告警自带可复现证据，防交运算实现漂移）。

## 5 · 三宗判定（对每条写事件，按序裁决，恰得一宗）

对写事件 `w`（会话 S，键 `k`，时刻 `t`）：

1. **争写**（流间事实，另算，见 §6）；
2. **侵入**：分册存在，且存在**他方**（id≠S）之分在 `t` 开放且其某 glob 命中 `k`（仅 `p:` 键判）→ 侵入。恰记一次（按对象去重）。
3. **越分**：未判侵入，且 S 自己的分在 `t` 开放、但其全部 glob 都不命中 `k`（仅 `p:` 键判）→ 越分（按对象去重）。
4. **未领分**：未判侵入，且 S 在 `t` 无开放之分 → 提示级，**不计分**（声明权在账方）。
5. 皆非 → 守分之写，无话。

判定序锁死：**侵入 > 越分 > 未领分**（同一写不得双计——闯了别人的分，罪在侵入，不在漂移）。无分册时 2/3/4 全部不判（纯流间审计）。

## 6 · 争写交错判定（lost update 窗口）

- 对每个键 `k`：收集全部**有时**写事件，按全局时序排成 `w₁..wₙ`。
- 对每对会话 `(X, Y)`（X≠Y，有序对）：若存在 X 的相邻两写 `wᵢ < wⱼ`（X 自己的写序列中相邻）与 Y 的一写 `wₘ` 使 `wᵢ < wₘ < wⱼ` → 记 **一处争写**（X 的 `wⱼ` 是闭眼覆盖——它落笔时看不见 Y 的 `wₘ`）。**每 (键, 有序对) 至多一处**。
- 先后共写（各会话对该键的写不交错）→ **共写**，提示级，0 分。

## 7 · 争值与门（先于实现锁死）

| 宗 | 罪名 | 分值 | cap |
|---|---|---|---|
| 流间 | 争写 | +30 / 处 | 60 |
| 权界 | 侵入 | +30 / 径（去重对象） | 60 |
| 纪律 | 越分 | +6 / 径（去重对象） | 30 |

`total = min(100, 争写分 + 侵入分 + 越分分)`。分带：**定 0–14（分已定，行者不顾）/ 竞 15–29（名未定，迹已竞）/ 争 ≥30（百人逐兔）**。门默认 30，`total ≥ 门` → fail（exit 1）。**单处争写或单径侵入即红**——有受害者的一票即红是本层的立场。

## 8 · 界碑块（接缝供给，逐字节确定）

同一分册状态，两次渲染逐字节相同（无 #k 计数——块只反映册态）。模板（`◇` 处按态二选一，无第三种字节）：

```
【定分 · 界碑】
在册开放之分 <k> 条：
  · <id> ── <fence₁> <fence₂> …
争界 <m> 处：
  · <id₁> × <id₂> ── 见证径 <witness>
◇ 在册开放为零时：「分册无开放之分——无分之地，写入先领分。」
◇ 无争界时：「争界：无——分已定，行者不顾。」
本块由确定性规则生成；重放同一分册必得同一文本。
```

## 9 · CLI（零依赖，node ≥20，仅标准库）

```
dingfen audit <s1.jsonl> [s2.jsonl …] [--file <分册>] [--gate n] [--json]
dingfen claim --id <id> --fence <glob> [--fence <glob>…] [--file <分册>] [--at <ms>] [--strict]
dingfen release --id <id> [--file <分册>] [--at <ms>]
dingfen list [--file <分册>]
dingfen block [--file <分册>]
dingfen gate --value <n> [--gate n]
dingfen --help | --version
```

- `--file` 缺省 = `./.dingfen.json`。claim：册不存在则建；`--at` 缺省 = `Date.now()`。claim 成功 exit 0（争界只告警）；`--strict` 下有争界 → exit 1；缺 `--id`/`--fence` → exit 2。
- release：无开放之分 → exit 2。list/block：册文件缺失 → exit 2（空册文件 → 确定性空册块）。
- audit：流文件缺失/坏 JSON/会话 id 撞名 → exit 2；报告含 `sessions/calls/writes/score{total,strife,trespass,stray}/band/gate/verdict/ok/counts{strifeSpots,coWrites,trespassPaths,strayPaths,unclaimed}/issues`。
- 退出码全局约定：0 通过；1 门禁失败（audit fail / --strict 争界）；2 用法/输入错误。

## 10 · 插件（Cordis，封界式，结构性零拦截）

- `name='dingfen'`，`inject=['tools']`，config：`{ fences?, sessionId?, registry?, gate? }`。
- **只监听 `tools/result`**（源码不存在 pre-execute 监听器）：write 族且 `isError !== true` 的调用入账。
- 服务 `ctx.dingfen`：`report()`（即时分/带/计数）、`zheng()`（逐条写账）、`jiebei()`（界碑块，由注入的 `config.registry` 渲染，逐字节确定）、`gate()`、`exportStream()`（与本仓流格式互认，供离线 `audit` 重放）。
- 运行时单侧视图：单引擎只见本会话之写，争写恒 0（§6 是流间事实）——侵入/越分照判（registry 注入）。**账实对账**：多引擎 `exportStream()` 合并离线重放，侵入/越分/争写必须与运行时账逐字一致。

## 11 · 夹具（先于实现手算，逐字节锁定期望）

### fenced-stream（会话 fenced，无分册）
6 调用、写 2（login.js、token.js 皆 edit）、单会话 → 争写 0、共写 0、争值 0、带「定」、exit 0。

### racer-a + racer-b（交错夹具）
- `core/auth.js`：A@100 → B@120 → A@140：有序对 (A,B) 记 1 处（B 落在 A@100 与 A@140 之间）；(B,A) 无（B 只写一次）。
- `src/api/router.js`：A@200 → B@220 → A@260：(A,B) 记 1 处。
- `HANDOFF.md`：A@300 → B@340：先后接手 → 共写 1，0 分。
- 合计：11 调用、写 8、争写 2 处 = 60（恰达 cap）、共写 1、争值 60、带「争」、exit 1。

### stray-stream + stray-registry（权界夹具）
分册：`stray` 领 `src/auth/**`（at:10）、`tenant` 领 `src/api/**`（at:10），均开放。
- s1 edit `src/auth/login.js`@100 → 守分。
- s2 edit `src/api/notes.md`@110 → tenant 开放之分命中 → **侵入 1 径**（不再判越分）。
- s3 edit `docs/plan.md`@120 → 无他方之分命中，自家分不命中 → **越分 1 径**。
- s4 edit `src/auth/token.js`@130 → 守分。
- 合计：5 调用、写 4、侵入 1（30）+ 越分 1（6）= 争值 36、带「争」、exit 1。
- **对照**：同一流换无 tenant 之分册 → s2 降为越分（6）→ 争值 12、带「定」、exit 0（侵入与越分的判然分界）。

## 12 · 测试预算

core（流解析/对象键/工具族/glob 与见证/分册操作/三宗/交错/争值分带）≥ 40；CLI ≥ 16；集成（真实 cordis+dsh-tools 管道）≥ 8；合计 ≥ 64，目标 ≥ 72。
