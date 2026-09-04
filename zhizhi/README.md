# 知止 · Zhizhi

> **给 DeepSeek Harness 装上「知止」层**：在工具调用发生**之前**用确定性规则拦住失控动作，在行为账本里记下每一笔浪费，把《道德经》的「知止可以不殆」变成 Agent 运行时的代码约束。
>
> **模型无关（model-free）**：零 LLM 调用、零提示词注入、纯确定性规则、可逐字重放审计。

```
模型请求调用 ──▶ tools/pre-execute（waterfall）
                    │
                    ▼
              ┌──────────┐   连败≥阈值（止损）      ┌────────────┐
              │ 知止门    │──未读先写（先读后写）──▶ │ deny + 理由 │──▶ 模型看到教学式拒绝
              └──────────┘                          └────────────┘
                    │ allow
                    ▼
              真实工具执行 ──▶ tools/result ──▶ 知止账本（观察+证据）
```

## 为什么：一本书 × 一个真实问题

书：《道德经》。2026 年 Agent 的问题不再是"不够聪明"，而是**行为失控**——这与《道德经》讨论了两千多年的"行动的节制"精确对撞：

| 《道德经》 | Agent 的病 | 知止的机制 |
|---|---|---|
| 知止可以不殆（三十二章） | 同一命令连败 N 次还在重试，烧掉几万 token 才被人工叫停 | **止损**：同一调用指纹连续失败达阈值，重试被拦，理由里附失败历史 |
| 为之于未有，治之于未乱（六十四章） | 对从未读过的文件直接写入，靠猜编辑 | **先读后写**：写入未读路径，动作发生前拦住 |
| 轻诺必寡信，多易必多难（六十三章） | 没跑过任何测试就宣布"完成" | **完成核验**：验证性命令（测试/构建/lint）计入证据账本，无证据的 turn 被点名 |

详细论证见 [docs/01-book.md](docs/01-book.md)（选书与映射）与 [docs/02-problem.md](docs/02-problem.md)（场景、价值与伪需求自检）。

## 三条规则

| 规则 | 拦截什么 | 放行什么 |
|------|----------|----------|
| **止损 stopLoss** | 同名同参的调用连续失败 ≥ 阈值（默认 3）后，下一次原样重试 | 换了参数/方法的调用；成功过一次即清零；**成功写入/编辑后全部清零**——改完代码再跑测试是合法的（"变更重置"，且账本暴露 `mutationResets` 计数防作弊） |
| **先读后写 readBeforeWrite** | 写入（结构化写工具 + bash 重定向/tee/sed -i/dd/cp/mv…）本会话未读过的路径 | 读过的路径；读过目录即覆盖其下文件（`grep -rn foo src/` 覆盖 src 下一切） |
| **完成核验 verify** | 不拦截任何调用；只记录：成功的验证命令 = 证据，`zhizhi audit --fail-on-unverified` 让无证据的 turn 在 CI 里红灯 | —— |

**不做的事**：不做语义判断（没有 NLP）、不拦截首次失败（只罚"连续"）、读不到的高置信度写入宁漏勿错（fail 方向与安全一致）、约束门自身出错默认放行（fail-open，治大国若烹小鲜）。

## 快速开始

### 作为 DeepSeek Harness 插件

本包是标准 Cordis 插件，主入口即插件模块。把它加进你的 dsh 组合（`cordis.yml` 或 patch）：

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: 'zhizhi-dsh'          # 或本地路径 './path/to/zhizhi/src/plugin/zhizhi.js'
  config:
    stopLoss: { threshold: 3 }
    readBeforeWrite: { enabled: true }
    verify: { enabled: true }
    locale: 'zh'              # 拦截理由语言：'zh' | 'en'
    failOpen: true            # 约束门自身出错时放行
```

挂上之后，同仓插件可通过服务读账本：

```js
ctx.zhizhi.report()       // 知止账本：拦截数、放行数、活跃连败、证据、mutationResets……
ctx.zhizhi.exportStream() // 事件流（zhizhi stream），供离线审计对账
```

### 作为离线审计器（零依赖 CLI）

对任何 Agent 会话流做 **what-if 审计**：如果当时装了知止，能拦几次？

```console
$ zhizhi audit session.jsonl
{
  "mode": "whatif",
  "totals": { "calls": 8, "intercepted": 2,
              "interceptedByRule": { "stopLoss": 1, "readBeforeWrite": 1 } },
  "unverifiedTurns": [ { "id": "t1", "calls": 5 } ],
  "waste": { "savedRoundTrips": 2, "humanUnit": "2 轮模型往返" },
  "verdict": "pass"
}
```

```console
$ zhizhi audit --fail-on-unverified session.jsonl   # CI 门：无证据 turn → 退出码 1
$ zhizhi audit --gated --threshold 2 gated.jsonl    # 对知止运行时导出流逐条对账
```

事件流格式（JSONL）与字段说明见 [docs/03-design.md](docs/03-design.md)。

## 验证

本仓库不含任何模拟框架：集成测试直接挂载 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools`，驱动真实工具管道。

```console
$ npm install && npm test
# 65 tests, 65 pass —— 其中 8 个跑在真实 DeepSeek Harness 工具管道上
```

| 验收项 | 标准 | 结果 |
|--------|------|------|
| 核心引擎 | 指纹/三条规则/变更重置/账本全路径覆盖，测试全绿 | ✅ 57 用例 |
| 真实集成 | 真实 dsh-tools 管道：连败第 3 次被拒、未读先写被拒、健康调用零干扰、账本与离线重放逐字一致 | ✅ 8 用例 |
| 离线审计 | what-if 报告 + `--fail-on-unverified` 退出码语义 + gated 对账可证伪（不一致必须能被测出来） | ✅ 含对账失败注入测试 |
| 模型无关 | 插件与核心零 LLM 调用、零提示词注入 | ✅ 代码可 grep 验证 |

完整验收标准与复现命令见 [docs/04-acceptance.md](docs/04-acceptance.md)。

## 仓库结构

```
zhizhi/
├── src/
│   ├── core/
│   │   ├── fingerprint.js   # 指纹与路径提取（纯函数，确定性感知层）
│   │   ├── engine.js        # 三条规则 + 知止账本（状态机）
│   │   └── audit.js         # 离线审计（whatif / gated 对账）
│   ├── plugin/zhizhi.js     # DeepSeek Harness 插件（Cordis）
│   └── bin/zhizhi.js        # 零依赖 CLI
├── test/                    # node:test：核心 48+ / CLI / 真实集成 8
├── fixtures/                # 样例会话流
└── docs/                    # 01-book · 02-problem · 03-design · 04-acceptance
```

运行时零第三方依赖（内核 `@deepseek-ai/cordis` 为 peerDependency，由宿主提供）；官方 dsh 包仅作 devDependencies 用于集成验证。

## 许可

MIT
