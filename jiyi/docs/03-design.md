# 03 · 设计：语义锁死

> 本章在实现前定稿；实现与本文冲突时只能改实现，不得改本文（A1 验收项）。
> 机制词全表：**疑册**（登记）→ **问凭据**（豁免的形）→ **问账**（对账逐条案别）→ **谋值**（分带门禁）→ **稽块**（接缝供给）。

## §1 对象与工具族（与 mingshi/jiubian/dingfen 同源）

- 对象键（按序取第一个命中）：`args.path / file_path / notebook_path`（非空字符串）→ `p:<值>`；`args.command`（非空 trim）→ `c:<trim>`；其余 → `n:<工具名>`。
- 工具族（小写匹配，exact 集合 ∪ 子串包含）：
  - observe：read/glob/grep/ls/cat/view ∪ read/grep/glob/list/search；
  - write：write/edit/apply/create/move/remove ∪ write/edit/patch/insert/create；
  - exec：bash/exec/run/shell/command ∪ bash/exec/run/shell/command；
  - 其余 → other。

## §2 疑册（askfile，默认 ./.jiyi.json）

```json
{ "version": 1, "asks": [{ "path": "AGENTS.md", "on": "write" }], "noDefaults": false }
```

- 条目：`path`（声明源路径，**逐字匹配、不归一化**——宁漏勿诬）+ `on ∈ { write, exec, any }`（触发域）。
- **默认形表**（`noDefaults: true` 时不并入）：`AGENTS.md → write`、`CLAUDE.md → write`、`README.md → write`。极保守：只列协作文书、只锁写域——环境里未必有，故默认条独谋轻罚、未见不罚（§6）。
- 归并：显式asks 与默认表按 `(path, on)` 去重，**显式档优先**（同键显式条覆盖默认条档位）；`on: any` 的条目与默认条 `(path, write)` 不去重（触发域不同是两条）。
- **无册不判**：askfile 缺失或 `asks` 为空且 `noDefaults` 为 true → 不判（counts 全零，issues 注记「无稽疑册——声明权在任务方，先立册再审计」）。

## §3 触发（invoke）与问凭据（fulfil）

- **触发**：该条的 `on` 域在流内出现**首笔调用**——成功失败皆算（动即是动；zhongshi 先例：失败调用亦记作工）。`on: write` 看 write 族、`on: exec` 看 exec 族、`on: any` 看 write ∪ exec。域内全流无调用 → **无动**（不判，不计 triggered）。
- **问凭据**（谋及卿士的机器判据，两通道得一即免）：
  1. **读取通道**：成功（isError ≠ true）的 observe 族调用，对象键 = `p:<ask.path>` **逐字相等**（不归一化）；
  2. **命令通道**：成功（isError ≠ true）的 exec 族调用，`args.command` 文本**包含** `ask.path` 逐字子串（词法相交，yuli 影写同规；`cat package.json` 认问）。
- 失败的 exec 不构成问凭据（没问成）；失败的 observe 不构成问凭据、但构成**空疑豁免**的凭据（§6）。

## §4 判定序（锁死，对每条触发之 ask）

1. **谋及**：首触发之前（流序，at 不参与判定）存在问凭据 → 案「谋及」，0 分。
2. **空疑**：全流存在失败的 observe 族调用且对象键 = `p:<ask.path>` 逐字相等（问过了，环境答「没有」——疑自解）→ 案「空疑」，0 分。（位次在迟问之前：环境答无从宽。）
3. **迟问**：首触发**之后**存在问凭据（先动后问——毕竟问了）→ 案「迟问」，+5/条。
4. **独谋**：全流无问凭据——
   - **显式档**（任务方登记即作保其存在）→ 案「独谋（显式）」，+15/条；
   - **默认档**（环境里未必有，不作保）→ 流内对该 path **无任何痕迹**（无任何族 `p:<path>` 对象调用、无 exec 文本含名）→ 案「未见」，0 分只点名；流内有痕迹（如失败 exec 含名——巧合子串不算凭据也不算空疑，但说明动过这条线）→ 案「独谋（默认）」，+5/条。
5. **无动**：触发域全流无调用 → 不判（不计入 counts，稽块注记）。

## §5 计分与分带（先于实现锁死）

- 迟问：`late = min(15, 5 × 迟问条数)`。
- 独谋：`blindExplicit = min(45, 15 × 显式独谋条数)`；`blindDefault = min(15, 5 × 默认独谋条数)`；`blind = blindExplicit + blindDefault`。
- `total = min(100, late + blind)`。
- 分带：**谋 0–14 / 疏 15–29 / 独 ≥30**。门默认 30——两条显式独谋即红（15×2=30）；单条显式独谋（15）与迟问（5/条）落疏带不咬门——宁可放过，不可错罚。

## §6 报告对象（字段序锁死）

```json
{
  "sessions": 1, "calls": 3, "asks": 3,
  "score": { "total": 0, "late": 0, "blind": 0 },
  "band": "谋", "gate": 30, "verdict": "pass", "ok": true,
  "counts": { "triggered": 3, "fulfilled": 1, "late": 0, "blind": 0, "emptyAsk": 0, "unseen": 2, "askCount": 3 },
  "issues": ["……"]
}
```

- `asks`：归并后疑条总数（显式 ∪ 默认）；`askCount` 与之相等（保留两字段便于对账）。
- `counts`：triggered=触发条数、fulfilled=谋及条数、late=迟问条数、blind=独谋条数（显式+默认）、emptyAsk=空疑条数、unseen=未见条数。
- issues 行序（锁死）：独谋（显式）→ 独谋（默认）→ 迟问 → 空疑 → 未见 → 谋及 → 无册注记。行文例：
  - `独谋（显式）×2（+15/条）：AGENTS.md、Makefile —— 谋不及物：首动之前流内无问凭据`
  - `迟问 ×1（+5/条）：package.json —— 先动后问：首触发之后才有问凭据`
  - `空疑 ×1（不计分）：CONTRIBUTING.md —— 问而环境答无：读取失败，疑自解`
  - `未见 ×2（不计分）：CLAUDE.md、README.md —— 默认条全流无踪：疑而不罚`
  - `谋及 ×1：AGENTS.md —— 先问后动：首触发之前已有问凭据`

## §7 稽块（block，逐字节确定）

```
【稽疑 · 疑册】
疑条 3 条（显式 1 ∪ 默认 2，noDefaults 否）：
  · AGENTS.md（write）[显式]
  · CLAUDE.md（write）[默认]
  · README.md（write）[默认]
问账：谋及 1 · 空疑 0 · 迟问 0 · 独谋 0 · 未见 2
谋值：0（谋）
汝则有大疑，谋及乃心，谋及卿士，谋及庶人，谋及卜筮——谋及乃心，从不单独定案。
本块由确定性规则生成；重放同一疑册必得同一文本。
```

- 无册时出确定性空籍文本（同 mingshi 空籍先例）。排序：显式在前、默认在后，各按登记序。

## §8 流解析（与 mingshi/dingfen 同规）

每行一个 JSON；`#` 与空行为注释；坏行报行号。calls 归并：带 id 的 call/result 配对回填 isError；无 id 的 result 并入紧邻其前无 id call；孤儿 result 独立建档。时序以流序为准，at 原样保留不参与判定。

## §9 夹具与手算（先于实现定死，A2）

| 夹具 | 疑册 | 流 | 手算 |
|---|---|---|---|
| clean-stream + clean-askfile | 显式 `{AGENTS.md, write}`（∪ 默认 2 条）| ① read AGENTS.md ✓ ② edit src/app.js ✓ ③ bash `npm run build` ✓ | AGENTS.md：触发=②、①有凭据→谋及；CLAUDE.md/README.md：触发=②、全流无踪→未见。`calls 3 · asks 3 · score {0,0,0} · band 谋 · exit 0 · counts {triggered 3, fulfilled 1, late 0, blind 0, emptyAsk 0, unseen 2, askCount 3}` |
| blind-stream + blind-askfile | 显式 `{AGENTS.md,write}` `{package.json,exec}` `{CONTRIBUTING.md,write}`（∪ 默认 2）| ① edit src/app.js ✓ ② read AGENTS.md ✓ ③ bash `ls` ✓ ④ read CONTRIBUTING.md ✗(404) ⑤ bash `cat package.json` ✓ | AGENTS.md：凭据②在触发①后→迟问 +5；package.json：触发=③、凭据=⑤（命令含名）在触发后→迟问 +5；CONTRIBUTING.md：全流无成功凭据、④失败读取→空疑免；CLAUDE.md/README.md→未见。`calls 5 · asks 5 · score {10,10,0} · band 谋 · exit 0 · counts {triggered 5, fulfilled 0, late 2, blind 0, emptyAsk 1, unseen 2, askCount 5}` |
| guilt-stream + guilt-askfile | 显式 `{AGENTS.md,write}` `{Makefile,exec}`（∪ 默认 2）| ① write src/main.js ✓ ② bash `make build` ✓ ③ bash `make test` ✓ | AGENTS.md（显式档）：全流无凭据→独谋 +15；Makefile：全流无凭据→独谋 +15；CLAUDE.md/README.md→未见。`calls 3 · asks 4 · score {30,0,30} · band 独 · exit 1 · counts {triggered 4, fulfilled 0, late 0, blind 2, emptyAsk 0, unseen 2, askCount 4}` |
| guilt-stream 无册 | — | 同上 | 无册不判：`score {0,0,0} · band 谋 · exit 0 · issues 含「无稽疑册」` |

## §10 边界行（与诸层的方向分界）

- **不拦动作**（zhizhi 地盘）：结构性零拦截，插件无 pre-execute 监听器；稽问不拦手，只让「没问就动」在账上现形。
- **不做 t=0 任务书体检**（weibing 地盘）：治未病审任务书里**写了的**命令与文件在环境里存不存在；稽疑审流里 Agent **动手前**问没问环境的规矩——前者审任务书之缺资，后者审流内之未问。
- **不审失败后应变**（jiubian 地盘）：盲捶是失败之后的重复（势变不改途），稽疑是首动之前的未问（疑而不谋）——先有稽疑之问，后有九变之变。
- **不巡见闻重复**（youya 地盘）：有涯管「读过的忘而复见」（重复），本层管「该问的未问先动」（首次）；本层借装载类成功读取作问凭据，与有涯的见闻账并行不悖。
- **不审写下的名**（mingshi 地盘）：名实审代码里的名有没有实（静态产物），稽疑审动手前的问有没有问（过程纪律）；猜错的命令炸在 exec——mingshi 无此账，本层有独谋案。
- **不审输入渠道权威**（lunshi 地盘）：论世审物渠道的祈使句有没有发令资格；稽疑审声明文书有没有被读过——读没读是流内事实，听没听是渠道语义。
- **不裁并发写域**（dingfen 地盘）、**不称成功成色**（xiaoyan 地盘）、**不量总量**（duzhi 地盘）、**不守本愿**（zhengnian 地盘）、**不审判断**（jiebi 地盘）。
- **零 LLM、零网络、零子进程、零文件系统探测**：源的存在性以流内证据自证（成功读取 / 失败读取 / 任务方作保），全部判定是词法与流序。

## §11 插件接口（Cordis，结构性零拦截）

- `JiyiService extends Service`：`report()`（汇总+谋值）、`wenzhang()`（问账全文）、`jice()`（稽块）、`gate()`（门禁裁决）、`exportStream()`（导出流供离线重放对账）。
- 监听 `tools/result`（唯一写入口，观察永不反噬——异常吞掉，管道照常）；**无 pre-execute 监听器**。
- 疑册持久化归 CLI（register/revoke），插件只吃注入的 askfile 对象。
