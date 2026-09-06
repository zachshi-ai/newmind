# 立诚 · Licheng

> **给 DeepSeek Harness 装上「立诚」层**：Agent 说出口的每一个承诺（"接下来我会补测试""稍后更新文档"）都成为绳账上的一个**结**——立结带**凭据**（拟之而后言），兑现凭据必须在会话流里**真实发生**（账实对账），改诺/弃约带理由显式登记即免咎（无咎者善补过），到结账仍悬着的结按**咎值**记欠（失诺 +30、轻诺 +10）。把《周易》的"言行，君子之枢机"变成 Agent 承诺信用的代码约束。
>
> **模型无关（model-free）**：零 LLM 调用、零提示词注入、零网络、零子进程、可逐字重放。
>
> **与六层正交**：zhizhi 拦**动作**（手）、jiebi 审**判断**（眼）、zhengnian 守**本愿**（心）、weibing 体检**开工**（脉）、buer 记**教训**（习）、jiubian 勘**应变**（势）——立诚清的是 Agent 对外**承诺**的账（口）：本愿是主人交代的（向上对齐），诺是自己说出的（向下负债）。插件结构性**零拦截**：唯一监听器挂在结果接缝，执行前的拦截接缝上没有本插件的存在。

```
Agent 出言承诺 ──▶ 绳账 knot ledger（promise 立结 · revise 改结 · abandon 解约 · discharge 补凭）
                                                                │
模型请求调用 ──▶ tools/pre-execute ──▶ 真实工具执行 ──▶ tools/result
                     （立诚不在此接缝存在——零拦截是结构性的）  │
                                                                ▼
                                结绳式插件：观察真实执行，维持在途绳账
                                                                │
        宿主在收尾接缝调用 ctx.licheng.settle() ──▶ 结账块（逐字节确定）
                                                                │
                licheng settle 绳账 × 会话流 ──▶ 咎值 + 结账门 ──▶ CI 门禁
```

## 为什么：一本书 × 一个真实问题

书：《周易》。Agent 的第七种烧钱方式是**允诺蒸发**：长会话里几十句"我会 X / 稍后 Y"，每一句都局部正确地蒸发——主任务完成、行为账本干净（zhizhi 绿灯）、判断账本干净（jiebi 蔽值 0），蒸发的只有**未来时的话语**。这与《周易》对言行的解剖精确对撞：

| 《周易》 | Agent 的病 | 立诚的机制 |
|---|---|---|
| 系辞上：**言行，君子之枢机**——枢机之发，荣辱之主也 | Agent 的话不是输出是动作：说出口的"接下来我会 X"是下游一切的前提，落空即事故 | **绳账**：口语承诺变机器可读的结，每条必须有下场 |
| 乾·文言：**庸言之信**，庸行之谨 | 失诺主战场在**微承诺**：每一句都小到没人记，加起来就是信用破产 | 凡诺必记，不分大小 |
| 系辞上：**拟之而后言**，议之而后动 | **轻诺**：出口的承诺连"怎样算兑现"都没有 | 诺须带凭据（discharge）；无凭之诺记**吝** |
| 乾·文言：**修辞立其诚** | 兑现可以口头伪造 | **账实对账**：凭据必须在会话流里真实发生（工具调用逐字匹配） |
| 系辞上：**无咎者，善补过也**；**震无咎者存乎悔** | 计划变了承诺作废——本身合法，病在**无声蒸发** | 改诺/弃约带理由显式登记即免咎（悔）；悬着的才记咎 |
| 系辞上：**悔吝者，言乎其小疵也**；悔 < 吝 < 咎 | 过错没有量级，无从门禁 | **咎值**量表：失诺 +30（咎）＞ 轻诺 +10（吝），分带无咎/吝/咎 |
| 系辞下：上古**结绳而治** | （命名所自）立一诺打一结，诺了则解；结不解，账不平 | 账名**绳账**，引擎动词**结账**（settle） |

详细论证见 [docs/01-book.md](docs/01-book.md)（选书与映射）与 [docs/02-problem.md](docs/02-problem.md)（场景、价值与伪需求自检）。

## 咎值（blame score）

一个确定性的数字，回答："此刻的绳账还欠多少？"——分高为欠。0–14 无咎，15–29 吝，≥30 咎（CI 门默认阈 30）。**咎值不度量对错**——它度量的是账面：兑现（信）与显式改诺/弃约（悔）都是 0 分，一笔失诺即进咎带。校准含义：**蒸发零容忍，改诺零成本，轻诺留小疵**。评分表与《周易》条文的逐条对应见 [docs/03-design.md](docs/03-design.md)。

## 快速开始

### 作为离线 CLI（零依赖）

```console
$ licheng template > r-001.jsonl              # 拿绳账骨架
$ licheng ledger r-001.jsonl                 # schema 校验
$ licheng settle r-001.jsonl session.jsonl   # 结账 + 咎值门禁
$ licheng block r-001.jsonl session.jsonl    # 结账块（供给物）
```

破账的结账块（真实输出，退出码 1——p-001 兑现、p-002 无凭悬结、p-003 带凭弃约）：

```
【立诚 · 结绳】
诺言：立 3 · 兑现 1 · 改诺 0 · 弃约 1 · 失诺 1
咎值：40（咎）· 门 30
悬结：p-002「同步 README 示例」咎+30，轻诺+10（整条链无凭据）
——《周易·系辞上》：无咎者，善补过也。
```

全平的账（同一命令，退出码 0）：

```
【立诚 · 结绳】
诺言：立 2 · 兑现 2 · 改诺 0 · 弃约 0 · 失诺 0
咎值：0（无咎）· 门 30
绳上无悬结。
——《周易·乾·文言》：庸言之信，庸行之谨。
```

`--json` 给完整报告（含 speech 漏账提示——流里有 5 句诺言措辞、账上只有 3 条立诺，`unaccounted: 2` 只提示不计分；无 speech 事件时诚实为 `null`）：

```json
{ "totals": { "promised": 3, "discharged": 1, "revised": 0, "abandoned": 1, "breached": 1 },
  "breakdown": { "blame": 30, "leniency": 10 }, "score": 40, "band": "咎", "verdict": "fail",
  "speech": { "events": 5, "markerHits": 5, "unaccounted": 2 } }
```

审计任何 Agent 会话流（兼容 zhizhi / jiebi / zhengnian 的共享 stream 格式；`--gate` 可调，`--lexicon` 可换诺言词表）。

### 作为 DeepSeek Harness 插件

标准 Cordis 插件，加进你的 dsh 组合：

```yaml
- name: '@deepseek-ai/dsh-tools'
- name: 'licheng-dsh'            # 或本地路径 './path/to/licheng/src/plugin/licheng.js'
  config:
    gate: 30                     # 结账门（咎值 ≥ gate 判 fail）
    enabled: true
```

挂上之后，同仓插件与宿主可通过服务记账与结账：

```js
ctx.licheng.make({ id: 'p-001', what: '跑全量测试', discharge: { tool: 'bash', contains: 'npm test', ok: true } })
ctx.licheng.revise({ id: 'p-001r', supersedes: 'p-001', reason: '范围收窄为 smoke' })
ctx.licheng.abandon('p-002', '宿主指示改用方案 B')
ctx.licheng.declare('p-003', { contains: 'README' })   // 补悔路径：宣告的凭据同样要对账
ctx.licheng.settle()      // 结账报告（咎值/分带/悬结），对观察到的真实调用对账
ctx.licheng.block()       // 结账块：逐字节确定的供给物（注入与否由宿主决定）
ctx.licheng.exportCalls() // 导出观察到的调用流（供离线引擎独立复算）
ctx.licheng.report()      // { ledgerSize, openKnots, gate, zeroIntercept }
```

Agent 侧协议见 [SKILL.md](SKILL.md)：凡诺必记、拟之而后言、变卦显式登记、收尾过结账门再宣布完成。

## 边界（不做的事）

- **不拦截任何动作**——插件唯一的监听器挂在结果接缝（观察真实执行），执行前的拦截接缝上没有本插件的存在，想拦也做不到（zhizhi 的地盘）；
- **不做语义判断**——凭据匹配是子串与布尔，诺言词表是显式清单（`--lexicon` 可替换，声明权在使用方）；零 NLP、零 LLM；
- **不读没入账的话**——绳账外的承诺措辞只做词表级**漏账提示**（advisory 不计分），绝不假装"读到了全部话语"；
- **不强迫许诺**——空账咎值 0 无咎：「古者言之不出，耻躬之不逮也」，少诺是德；立诚改变的是许诺的价格（出口即入账、无凭记吝、悬结记咎）；
- **不承诺兑现**——咎值 0 只是账平。立诚保证三件事：**说出口的话有了账，兑现有了对证，变卦有了痕迹。**

## 测试与验收

79 个测试（核心 55 + CLI 16 + 真实管道集成 8）全绿；集成测试挂在 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 的真实执行管道上，验证结构性零拦截（源码无拦截接缝 + 管道零反噬 + 每次执行完整入账）、账实对账（运行时 settle 与离线核心引擎 deepEqual）与诚实记账。验收标准表与实测输出见 [docs/04-acceptance.md](docs/04-acceptance.md)。

```bash
npm install && npm test   # 79 tests, 79 pass
```

## 仓库结构

```
licheng/
├── src/
│   ├── core/
│   │   ├── ledger.js      # 绳账 schema：四种条目、形状与账序校验、骨架
│   │   ├── stream.js      # 会话流解析（共享格式）+ speech 收集
│   │   ├── lexicon.js     # 诺言词表（默认 + 可替换，事件级去重）
│   │   ├── settle.js      # 结账引擎：链展开、凭据对账、咎值分带
│   │   └── block.js       # 结账块渲染（逐字节确定）
│   ├── plugin/licheng.js  # DeepSeek Harness 结绳式插件（Cordis，唯一结果接缝观察）
│   └── bin/licheng.js     # 零依赖 CLI
├── test/                  # node:test：核心 / CLI / 真实集成
├── fixtures/              # 绳账与会话流样例（clean / broken 配对）
└── docs/                  # 01-book · 02-problem · 03-design · 04-acceptance
```

运行时零第三方依赖（内核 `@deepseek-ai/cordis` 为 peerDependency，由宿主提供）；官方 dsh 包仅作 devDependencies 用于集成验证。

## 许可

MIT，见 [LICENSE](LICENSE)。
