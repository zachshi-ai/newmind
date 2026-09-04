# 03 · 设计：观察式插件、解蔽账本与蔽值

## 架构：不拦动作，只审判断

与 zhizhi 的根本分工：zhizhi 挂在 `tools/pre-execute` 上**拦截动作**；jiebi 在结构上**不存在** pre-execute 监听器——它挂 `tools/result` 观察结果，维护"判断对比账本"，并对外提供账本校验服务。**插件想拦截也做不到，这是结构性保证，不是纪律性承诺。**

```
模型请求调用 ──▶ tools/pre-execute ──▶ 真实工具执行 ──▶ tools/result
                     （jiebi 不在此接缝存在——零拦截是结构性的）        │
                                                                    ▼
                                                    ┌──────────────────────────┐
                                                    │ jiebi 观察式插件（Cordis） │
                                                    │  · 回合对比账本（候选多样性）│
                                                    │  · 事件流导出（jiebi stream）│
                                                    │  · ctx.jiebi.check(ledger) │
                                                    └──────────────────────────┘
                                                                     │
            Agent 在重大判断点产出解蔽账本 ──▶ jiebi check ──▶ 蔽值 ──┤
                                                                    ▼
                                              CI 门禁（exit code）· jiebi reconcile 账实对账
```

同一事件的两种消费：

- **运行时**（Cordis 插件）：`ctx.jiebi.report()` / `ctx.jiebi.exportStream()` / `ctx.jiebi.check(ledger)`；
- **离线**（零依赖 CLI）：`check / score / template / reconcile / audit`，可对任何符合 jiebi stream（兼容 zhizhi stream）格式的历史会话做事后审计。

## 解蔽账本（jiebi ledger v1）

账本是判断的**产物**：Agent 在重大判断点（根因诊断 / 方案选型 / 结论定稿）产出一个 JSON 文件。

```jsonc
{
  "version": 1,
  "id": "d-001",
  "kind": "diagnosis",                  // diagnosis | approach | conclusion
  "question": "测试失败的根因是什么？",
  "alternatives": [                     // 壹门：兼陈万物
    {
      "name": "缓存未失效",
      "steelman": "为什么它可能是对的（最强形式）",
      "killCondition": "出现什么证据时此案作废",
      "evidence": [                     // 证据引用，指向会话流里的调用 id
        { "ref": "t1-c2", "expect": "fail", "note": "命中 killCondition 的探针" }
      ]
    },
    { "name": "序列化层类型错误", "steelman": "…", "killCondition": "…" }
  ],
  "disconfirming": [                    // 虚门：不以所已臧害所将受
    { "ref": "t2-c1", "note": "与首选候选相左的观察" }
  ],
  "verdict": {                          // 静门 + 县衡
    "choice": "序列化层类型错误",        // 必须是 alternatives 之一
    "weights": "为什么它胜出（显式的秤）",
    "falsifiable": "什么证据出现时本结论作废"
  }
}
```

校验分两层，职责严格分离：

- **schema 校验**（`check`/`score`）：字段类型与取值域。非法 → 退出码 2；
- **蔽值评分**（`check`/`score`）：结构完备性。分高 → 退出码 1（默认阈 30）。**零语义判断**：不读字段内容的"意思"，只看"有没有、够不够"。

## 蔽值（occlusion score）

每个扣分项都对应荀子的一条原文——**蔽值不是凭感觉设的权重表，是"解蔽"的条款清单**：

| 检查项 | 扣分 | 上限 | 出处 |
|---|---|---|---|
| `alternatives.length < 2`（只有一个候选，甚至零个） | +40 | 40 | 蔽于一曲，而闇于大理 |
| 每个候选缺 `steelman`（最强形式） | +8/个 | 16 | 兼陈万物——没摆出最强形式的不算兼陈 |
| 每个候选缺 `killCondition`（死亡条款） | +8/个 | 16 | premortem / 事前验尸 |
| `disconfirming` 为空（零反证登记） | +15 | 15 | 不以所已臧害所将受谓之虚 |
| `verdict.falsifiable` 缺失（结论不带验尸条款） | +15 | 15 | 不以梦剧乱知谓之静 |
| `verdict.weights` 缺失（裁决不带秤） | +10 | 10 | 兼陈万物而中县衡焉 |
| `verdict.choice` 不在候选名单（裁决悬空） | +20 | 20 | 众异不得相蔽以乱其伦 |

总 cap 100。分带：`0–14 明`、`15–29 半蔽`、`≥30 蔽`（`--fail-over` 默认 30，`jiebi check` 退出码 1）。

诚实边界（写死在文档里）：蔽值度量**程序完备性**，不度量对错。蔽值 0 的判断仍可能是错的——但它是可修正的错；蔽值 80 的判断哪怕对了，也是不可审计的运气。

## 指纹归一化（signature）

对比审计的原子。从一次工具调用的 args 里提取**探针目标**（与 zhizhi 的精确指纹不同——jiebi 归一化到"同一个探查对象"，这样"换参数磨同一扇门"也逃不掉）：

```
command/cmd/script → 首词；若首词 ∈ {npm,pnpm,yarn,bun,git,cargo,go,make} 且有次词 → 取前两词
path/file/file_path/target → 该值
query/q/pattern → 该值（trim）
其余 → args 按键排序 JSON 化截断 64 字符
signature = `${name}:${target}`（无 args → `${name}`）
```

例：`bash npm test` / `bash npm test -- --grep foo` → 同一签名 `bash:npm test`；`read src/user.js` → `read:src/user.js`。

## jiebi stream（兼容 zhizhi stream）

每行一个 JSON 对象，`#` 与空行为注释。事件类型：

```
{ type:'turn_start'|'turn_end', id, at }
{ type:'tool_call',   id?, name, args, at }     // id = 证据引用锚点（jiebi 约定，可缺省）
{ type:'tool_result', id?, name, args, isError, errorDigest?, at }
{ type:'tool_denied', name, args, rule, at }    // zhizhi 兼容：jiebi 视其为普通失败探针
```

zhizhi 导出的流可以直接喂给 `jiebi audit`——两层治理共用一本账。

## 账实对账（reconcile）

判断可证伪的最后一块：**账本宣称的证据，必须在会话流里真实发生过**。

- 收集流里所有带 `id` 的 `tool_call`/`tool_result`（同 id 以首条为准，重复记 ambiguous）；
- 账本每条引用（`alternatives[].evidence[].ref` 与 `disconfirming[].ref`）：
  - 流中不存在 → `dangling`（悬空引用）→ `match=false`；
  - 带 `expect:'fail'|'success'` 且与该 id 的 `isError` 不符 → `contradicted`（账实不符）→ `match=false`；
  - 带且相符 → `verified`；带 id 但无 expect → `linked`；
- `verdict.choice` 必须命中某个 `alternatives[].name`（悬空裁决在 check 与 reconcile 两处都查）；
- 无任何引用 → `match=true` 但 `refsChecked:0`、`confidence:'none'`——对账器不假装核对了它没核对的东西。

## 对比审计（audit，what-if for cognition）

对一份裸会话流（或 zhizhi 流）做认知对比统计：

- 按回合（turn）聚合调用的签名序列；
- **单候选连击（monoculture streak）**：同一签名连续出现 ≥ N 次（默认 4，`--streak` 可调）且其间无任何其他签名探针 → 该回合记 flag；
- 每回合输出：调用数、不同探针数（distinctProbes）、失败探针数（failures——反证尝试的行为学痕迹）；
- `verdict`：`pass` | `flagged`；退出码 0/1。

与 zhizhi 止损的边界：zhizhi 拦的是**逐字相同指纹**的运行时重试；jiebi 查的是**归一化同目标**的离线连击——"每次换个参数磨同一扇门"在 zhizhi 眼里是合法的，在 jiebi 眼里现形。

## 失败哲学

- **观察永不反噬**：`tools/result` 监听器里的任何异常被吞掉，管道照常（与 zhizhi 同款约定）；
- **对账器不装懂**：核对不了就明说（`confidence:'none'`），绝不把"没核对"报成"已核对"；
- **静默认低噪**：审计输出全部 JSON、单遍重放、理由在现场捕获——不做任何事后语义重建。
