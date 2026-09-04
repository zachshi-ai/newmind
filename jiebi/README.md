# 解蔽 · Jiebi

> **给 DeepSeek Harness 装上「解蔽」层**：在重大判断的**产物**上做确定性校验——替代方案是否被严肃并陈、反证是否被登记、结论是否自带可证伪条件、宣称的证据是否真实发生过。把《荀子·解蔽》的「虚壹而静」变成 Agent 认知层的代码约束。
>
> **模型无关（model-free）**：零 LLM 调用、零提示词注入、纯确定性规则、可逐字重放对账。
>
> **与知止 zhizhi 正交**：zhizhi 拦**动作**（tools/pre-execute），jiebi 审**判断**——jiebi 的插件里不存在 pre-execute 监听器，零拦截是结构性的。

```
模型请求调用 ──▶ tools/pre-execute ──▶ 真实工具执行 ──▶ tools/result
                     （jiebi 不在此接缝存在——零拦截是结构性的）        │
                                    ┌──────────────────────────────┘
                                    ▼
                    观察式插件：回合/会话对比账本（候选多样性、连击 flag）
                                    │
  Agent 在重大判断点产出解蔽账本 ──▶ jiebi check ──▶ 蔽值（0–100）
                                    │                         │
                          jiebi reconcile 账实对账          CI 门禁（exit code）
```

## 为什么：一本书 × 一个真实问题

书：《荀子·解蔽》。2026 年 Agent 烧钱的另一种方式是**想错了还理直气壮**：第 3 轮锁定根因假设，此后 20 轮全在为它收集辩护词。这与荀子两千两百年前解剖的"心术之公患"精确对撞：

| 《荀子·解蔽》 | Agent 的病 | 解蔽的机制 |
|---|---|---|
| 凡人之患，**蔽于一曲**，而闇于大理 | 单候选锚定：第一个像答案的假设直奔到底 | **壹门**：账本必须 ≥2 个被严肃对待的候选（各带 steelman 与 killCondition），否则蔽值 +40 |
| **不以所已臧害所将受谓之虚** | 确认偏误：旧判断锁死新证据，反证从未被收集 | **虚门**：`disconfirming[]` 为空 → +15，"缺席"第一次有了痕迹 |
| **不以梦剧乱知谓之静** | 凭空断言、结论不带验尸条款 | **静门**：结论必须带 `falsifiable`（+15），裁决必须带显式权重（+10） |
| **兼陈万物而中县衡焉** | 一言堂决策 | 账本程序本身：并陈 → 悬秤 → 裁决 |
| 心术之**公患** | 判断的产物也可以伪造 | **账实对账**：账本引用的证据必须在会话流里真实发生过（`jiebi reconcile`） |

详细论证见 [docs/01-book.md](docs/01-book.md)（选书与映射）与 [docs/02-problem.md](docs/02-problem.md)（场景、价值与伪需求自检）。

## 蔽值（occlusion score）

一个确定性的数字，回答："这个判断在程序上还有多少被锁死的余地？" 0–14 明，15–29 半蔽，≥30 蔽（CI 门默认阈 30）。**蔽值不度量对错**——蔽值 0 的判断仍可能错，但它是可修正的错；蔽值 80 的判断哪怕对了，也是不可审计的运气。评分表与《荀子》条文的逐条对应见 [docs/03-design.md](docs/03-design.md)。

## 快速开始

### 作为离线 CLI（零依赖）

```console
$ jiebi template > d-001.json          # 拿骨架（diagnosis | approach | conclusion）
$ jiebi check d-001.json               # 校验 + 蔽值；≥30 退出码 1（CI 门）
$ jiebi reconcile d-001.json run.jsonl # 账实对账：宣称的证据必须真实发生过
$ jiebi audit run.jsonl                # 对比审计：单候选连击检测
```

审计任何 Agent 会话流（兼容 zhizhi stream 格式）：

```console
$ jiebi audit session.jsonl
{
  "mode": "contrast",
  "totals": { "turns": 2, "calls": 8, "flags": 1 },
  "flags": [ { "type": "monoculture", "turn": "t1", "signature": "bash:npm test", "run": 4 } ],
  "verdict": "flagged"
}
```

### 作为 DeepSeek Harness 插件

标准 Cordis 插件，加进你的 dsh 组合：

```yaml
- name: '@deepseek-ai/dsh-tools'
- name: 'jiebi-dsh'              # 或本地路径 './path/to/jiebi/src/plugin/jiebi.js'
  config:
    streakThreshold: 4           # 会话级单候选连击阈值
    enabled: true
```

挂上之后，同仓插件可通过服务读写判断账本：

```js
ctx.jiebi.report()        // 对比账本：观察数、连击 flag、已核对账本的蔽值
ctx.jiebi.check(ledger)   // 账本注册 + 即时蔽值（供宿主在收尾接缝做门禁）
ctx.jiebi.exportStream()  // jiebi stream，供离线 reconcile / audit
ctx.jiebi.beginTurn(id)   // 可选回合边界（由宿主显式声明）
```

Agent 侧协议见 [SKILL.md](SKILL.md)：在根因诊断 / 方案选型 / 结论定稿前产出账本，`check` 过门再开口。

## 边界（不做的事）

- **不拦截任何动作**——插件源码里没有 pre-execute 监听器，想拦也做不到（zhizhi 的地盘）；
- **不做语义判断**——不读字段的"意思"，只看"有没有、够不够"；零 NLP、零 LLM；
- **不假装核对**——对账器核对不了的明说（`confidence:'none'`），绝不把"没核对"报成"已核对"；
- **不承诺正确**——蔽值低只是必要条件。解蔽保证的是：结论曾在候选竞争中存活、反证被登记、自带可证伪条件。

## 测试与验收

72 个测试（核心 52 + CLI 11 + 真实管道集成 9）全绿；集成测试挂在 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 的真实执行管道上。验收标准表与实测输出见 [docs/04-acceptance.md](docs/04-acceptance.md)。

```bash
npm install && npm test   # 72 tests, 72 pass
```

## 许可

MIT，见 [LICENSE](LICENSE)。
