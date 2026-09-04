# 治未病 · Weibing

> **给 DeepSeek Harness 装上「治未病」层**：任务书与环境在开工（t=0）时过一遍**四诊**（望闻问切）——缺席的条款（无验/无界/无止）、自相矛盾的要求（相克）、落空的声明（妄证/缺资）逐一计为**病灶**，措辞信号计为**险兆**，合成**病值**与安/萌/病分带，每个病灶附**医嘱**与**传变**预告警（会烧到下游哪一层）。把《黄帝内经》的"圣人不治已病治未病"变成 Agent 开工时刻的代码约束。
>
> **模型无关（model-free）**：零 LLM 调用、零提示词注入、零网络、零子进程、可逐字重放。
>
> **与前四层正交**：zhizhi 拦**动作**（手）、jiebi 审**判断**（眼）、zhengnian 守**本愿**（心）、buer 记**教训**（习）——四层都在运行开始**之后**工作；治未病只在开工**之前**出诊。插件结构性**零监听**：源码里没有任何事件监听器，诊而不拦。

```
任务书 charter ──▶ ┌──────────── 治未病四诊（t=0，第一枚 token 之前）────────────┐
                   │ 望 schema：该在的条款在不在（无验/无界/无止）              │
                   │ 闻 词表：brief 的无边之词与无度之动词（险兆·萌级）          │
                   │ 问 关系：ref 重复 / artifact 撞车 / 目标径出愿界（相克）    │
                   │ 切 探针：命令在不在 PATH、文件在不在体检根（妄证/缺资）     │
                   └────────────────────────┬───────────────────────────────┘
                                            ▼
                              病值 score（安/萌/病）· CI 门禁（退出码）
                                            │
                        医嘱块 prescribe ──▶ 供宿主开工时注入；喂下游三层做预告警
```

## 为什么：一本书 × 一个真实问题

书：《黄帝内经》。2026 年 Agent 的治理预算几乎全部花在**恢复**上：重试、重规划、self-healing、compaction——按内经的标准全是"已病之治"和"下工救其已成"。而最贵的一种失败在开工那一刻就已注定：任务书没写终验（完成将对空气宣布）、没立愿界（漂移从第一个文件就开始）、没立止法（没人回答"到哪儿算完"）、终验引用的命令/文件在环境里根本不存在、两条要求互斥——这些**未病**在 t=0 全部无症状，却只能在 mid-run 用最贵的方式确诊：

> 夫病已成而后药之，乱已成而后治之，譬犹**渴而穿井，斗而铸锥**，不亦晚乎！（〈素问·四气调神大论〉）

第 47 轮才发现 `jq` 没装，就是渴而穿井。原典条款 → Agent 病的逐条映射、扁鹊三兄弟的价值重估、与 pre-mortem / FMEA / Definition of Ready 的管理学互证，见 [docs/01-book.md](docs/01-book.md)（选书）与 [docs/02-problem.md](docs/02-problem.md)（场景、价值与伪需求自检）。

## 病灶表（FMEA 式，全部可独立证伪）

| # | 病名 | 判据 | 权重 | 传变（金匮：见肝知肝传脾） |
|---|------|------|------|--------------------------|
| W1 | 无验 | 终验缺席 | 45 | 代偿完成无从对账（正念终验门无事可对） |
| W2 | 无界 | 愿界缺席 / allowRoots 空 / allowAll | 45 | 攀缘无从计分（愿界之外不存在） |
| W3 | 无止 | 止法缺席 | 30 | 浪费只能靠运行时止损（知止账本事后入账） |
| W4 | 相克 | ref 重复 / artifact 撞车 / 目标径出愿界 | 40/条·上限2 | 中局爆雷，返工不可恢复 |
| W5 | 妄证 | 声明的产物不在 / 命令不在 PATH | 35/条·上限2 | 第一次对账即翻车 |
| W6 | 缺资 | 依赖文件不在 / 工具不在 PATH | 35/条·上限2 | 第一轮工具调用即报错 |

险兆（闻诊词表，5/去重 token，无边/无度各封顶 10）；**病值 = min(100, Σ病灶+Σ险兆)**；分带 **安(0–15) / 萌(16–39) / 病(≥40)**；门禁默认 40（`--gate` 可调）。语义细则见 [docs/03-design.md](docs/03-design.md)。

## 快速开始

### 作为离线 CLI（零依赖）

```console
$ weibing template > t-001.json              # 拿任务书骨架
$ weibing charter t-001.json                 # schema 校验
$ weibing exam t-001.json --cwd <仓库根>      # 四诊体检 + 病值门禁
$ weibing prescribe t-001.json --cwd <仓库根> # 医嘱块（纯文本供给物）
```

带病开工的任务书，体检如实拒收（真实输出，退出码 1）：

```json
{
  "charter": "t-sick",
  "score": 100,
  "band": "病",
  "verdict": "fail",
  "gate": 40,
  "probes": { "probed": 0, "unprobed": 0 },
  "breakdown": { "lesions": 120, "omens": 15 },
  "lesions": [
    { "code": "W1", "name": "无验", "weight": 45, "detail": "终验缺席，完成将对着空气宣布", "prescription": "声明终验（ref + bash 命令 / artifact 路径），供知止证据核对与正念终验门对账" },
    { "code": "W2", "name": "无界", "weight": 45, "detail": "愿界缺席", "prescription": "立愿界 allowRoots，写入的根必须在开工时点名" },
    { "code": "W3", "name": "无止", "weight": 30, "detail": "止法缺席：无人回答「到哪儿算完」", "prescription": "立止法 maxSteps / maxMinutes，让「到哪儿算完」先于运行存在" }
  ],
  "omens": [ { "token": "所有", "kind": "unbounded" }, { "token": "彻底", "kind": "unbounded" }, { "token": "优化", "kind": "vague" } ],
  "transmissions": [
    "无验 → 代偿完成无从对账：正念终验门将无事可对，zhizhi 证据核对将无据可核",
    "无界 → 攀缘无从计分：愿界之外不存在，越界也就不存在（正念攀缘分结构性沉默）",
    "无止 → 浪费只能靠运行时止损（知止层的账本事后入账），开工前无人问一句「到哪儿算完」"
  ],
  "ok": false
}
```

全清的任务书，医嘱块只说一句话（同一输入 → 逐字节相同，shasum 可证）：

```
【治未病 · pre-flight】#t-clean
任务：把 support 目录里的报告标题更新为 v2，并以 coverage 文件为终验
体检根：/repo/fixtures
病值：0（安）· 门 40
病灶：0 · 险兆：0
未病。可以开工。
——《素问·四气调神大论》：圣人不治已病治未病，不治已乱治未乱。
```

### 作为 DeepSeek Harness 插件

标准 Cordis 插件，加进你的 dsh 组合：

```yaml
- name: '@deepseek-ai/dsh-tools'
- name: 'weibing-dsh'             # 或本地路径 './path/to/weibing/src/plugin/weibing.js'
  config:
    charter: { ... }              # 任务书契约（或运行时用 setCharter 注入）
    cwd: '/repo'                  # 切诊的体检根（文件/产物探针基准）
    gate: 40
    enabled: true
```

挂上之后，同仓插件与宿主可通过服务出诊：

```js
ctx.weibing.setCharter(c)      // 立任务书 / 换约（数据问题不抛错，valid:false + issues）
ctx.weibing.exam({ cwd })      // 四诊体检报告（无 charter 时诚实沉默 no-charter）
ctx.weibing.prescribe({ cwd }) // 医嘱块：逐字节确定的供给物（注入与否由宿主决定）
ctx.weibing.report()           // 就绪状态
```

Agent 侧协议见 [SKILL.md](SKILL.md)：开工先立任务书、过四诊、按医嘱补条款，然后才烧第一枚 token。

## 边界（不做的事）

- **零监听**——插件源码里没有任何事件监听器，不参与任何运行时接缝（想拦也做不到；那是 zhizhi 的地盘）；
- **诊而不拦**——门禁只是退出码与分带，物理上没有拦截能力，拦不拦由 CI/宿主决定；
- **不做语义判断**——闻诊是显式词表匹配（`--lexicon` 可扩展，声明权在任务方），零 NLP、零 LLM；
- **不假装核对**——无 `--cwd` 时文件类探针诚实记 `unprobed`，不计分、不报警；
- **不承诺成功**——病值 0 是必要条件。体检保证三件事：**就绪条款有了形状，带病开工有了数字，每个病灶有一条医嘱。**

## 测试与验收

72 个测试（核心 51 + CLI 13 + 真实管道集成 8）全绿；集成测试挂在 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 的真实执行管道上，验证结构性零监听（源码无监听器 + 管道调用前后体检结果逐字一致）、账实对账（运行时与 CLI/核心逐字一致）与诚实沉默。验收标准表与实测输出见 [docs/04-acceptance.md](docs/04-acceptance.md)。

```bash
npm install && npm test   # 72 tests, 72 pass
```

## 仓库结构

```
weibing/
├── src/
│   ├── core/
│   │   ├── charter.js     # 任务书契约 schema 与骨架
│   │   ├── lexicon.js     # 险兆词表（无边/无度）与计分封顶
│   │   ├── probes.js      # 切诊探针：PATH 扫描 / 体检根 stat（只读、零子进程）
│   │   ├── exam.js        # 四诊引擎：病灶 W1–W6 / 险兆 / 传变 / 病值分带
│   │   └── prescribe.js   # 医嘱块渲染（逐字节确定）
│   ├── plugin/weibing.js  # DeepSeek Harness 诊断式插件（Cordis，零监听）
│   └── bin/weibing.js     # 零依赖 CLI
├── test/                  # node:test：核心 / CLI / 真实集成
├── fixtures/              # 契约样例与探针存在性证据
└── docs/                  # 01-book · 02-problem · 03-design · 04-acceptance
```

运行时零第三方依赖（内核 `@deepseek-ai/cordis` 为 peerDependency，由宿主提供）；官方 dsh 包仅作 devDependencies 用于集成验证。

## 许可

MIT，见 [LICENSE](LICENSE)。
