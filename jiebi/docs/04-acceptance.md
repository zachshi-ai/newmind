# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。

## 验收标准表

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 账本校验与蔽值完整性 | schema 校验（版本/枚举/类型/嵌套结构全路径）、七项蔽值扣分逐项可单测且可组合、cap 100、分带与阈值语义，核心用例 ≥ 45 且全绿 | `npm test`（core 部分） | ✅ 52 用例全绿 |
| A2 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载 jiebi 插件：**所有调用无条件到达工具本体**（连败探针 4/4 直达，对照组 6/6 执行，结构性零拦截）；会话对比账本正确记 monoculture flag；`ctx.jiebi.check()` 同步返回蔽值；`exportStream()` 与离线重放一致 | 集成测试 | ✅ 9 用例全绿 |
| A3 | CLI 语义 | `check`：蔽值超阈 → 1，schema 非法/坏 JSON → 2，通过 → 0；`score` 恒 0 且输出分项；`reconcile`：对账相符 → 0，悬空/账实不符 → 1，坏输入 → 2；`audit`：有 flag → 1，干净 → 0，坏流报行号 → 2 | CLI 测试 | ✅ 11 用例全绿 |
| A4 | 对账可证伪 | 账本引用流中不存在的 id → `dangling` 且 match=false；`expect:'fail'` 引用实际成功 → `contradicted` 且 match=false；注入不一致必须被查出（机制本身可被测试证伪） | reconcile 核心用例 | ✅ |
| A5 | 两层治理互认账本 | zhizhi 的 `fixtures/sample-stream.jsonl` 直接喂给 `jiebi audit`：t1（四次同签名探针连击）被记 monoculture flag，t2 干净——同格式流可跨项目审计 | CLI/核心用例 | ✅ `flags[0]={"turn":"t1","signature":"bash:npm test","run":4}` |
| A6 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络 | 代码 grep（下附命令，应无输出） | ✅ grep 无输出 |
| A7 | 测试总量 | 全部用例 ≥ 70 且全绿（core + cli + 集成） | `npm test` | ✅ 72 tests, 72 pass |
| A8 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义（03）、本验收表（04）、SKILL.md、README 快速开始齐备 | 人工 + 链接 | ✅ |

## 复现命令

```bash
cd jiebi
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 72 tests, 72 pass
```

**A6 的 grep 命令**（应无输出）：

```bash
grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create" src/core src/plugin | grep -v "^\s*//"
```

## 实测记录（2026-09-05）

```
$ node --version
v24.18.0
$ npm view @deepseek-ai/cordis version
4.0.2
$ npm view @deepseek-ai/dsh-tools version
0.0.1-rc.1
$ npm test
ℹ tests 72
ℹ pass 72
ℹ fail 0
```

### 关键实测样例

蔽值满贯的账本（单候选 + 零反证 + 无证伪条件 + 裁决悬空，七项全中 → 封顶 100）：

```console
$ node src/bin/jiebi.js check fixtures/biased-ledger.json
{
  "ledger": "d-001",
  "score": 100,
  "band": "蔽",
  "verdict": "fail",
  "gate": 30,
  "issues": [
    "候选少于 2 个（蔽于一曲） (+40)",
    "1 个候选缺 steelman（最强形式） (+8)",
    "1 个候选缺 killCondition（死亡条款） (+8)",
    "零反证登记（虚门未过） (+15)",
    "结论无可证伪条件（静门未过） (+15)",
    "裁决无显式权重（县衡未悬） (+10)",
    "裁决悬空：choice 未命中任何候选名 (+20)"
  ]
}
$ echo $?
1
```

通过虚壹静三门的账本：

```console
$ node src/bin/jiebi.js check fixtures/balanced-ledger.json
{
  "ledger": "d-002",
  "score": 0,
  "band": "明",
  "verdict": "pass",
  "gate": 30,
  "issues": []
}
```

账实对账（账本宣称的 4 条证据在流里逐条落地，方向一致 → verified）：

```console
$ node src/bin/jiebi.js reconcile fixtures/balanced-ledger.json fixtures/sample-stream.jsonl
{
  "ledger": "d-002",
  "match": true,
  "refsChecked": 4,
  "confidence": "refs",
  "refs": [
    { "ref": "t2-c1", "expect": "fail",    "isError": true,  "status": "verified" },
    { "ref": "t2-c4", "expect": "success", "isError": false, "status": "verified" },
    { "ref": "t1-c1", "expect": "fail",    "isError": true,  "status": "verified" },
    { "ref": "t2-c2", "from": "disconfirming", "isError": false, "status": "linked" }
  ],
  "verdict": { "choice": "序列化层类型错误", "resolved": true }
}
```

对比审计（t1 四次同签名探针 = 单候选连击；t2 四个不同探针 = 干净）：

```console
$ node src/bin/jiebi.js audit fixtures/sample-stream.jsonl
{
  "mode": "contrast",
  "threshold": 4,
  "totals": { "turns": 2, "calls": 8, "flags": 1 },
  "turns": [
    { "id": "t1", "calls": 4, "distinctProbes": 1, "failures": 4, "maxStreak": 4 },
    { "id": "t2", "calls": 4, "distinctProbes": 4, "failures": 1, "maxStreak": 1 }
  ],
  "flags": [ { "type": "monoculture", "turn": "t1", "signature": "bash:npm test", "run": 4 } ],
  "verdict": "flagged"
}
```

A5 跨项目互认（zhizhi 导出的流，jiebi 直接审）：

```console
$ node src/bin/jiebi.js audit ../zhizhi/fixtures/sample-stream.jsonl
{"mode":"contrast","threshold":4,"totals":{"turns":2,"calls":8,"flags":1},
 "flags":[{"type":"monoculture","turn":"t1","signature":"bash:npm test","run":4}],
 "verdict":"flagged"}
```

### 蔽值正确性的辩护

蔽值七项全部来自《荀子·解蔽》原文条款（见 docs/03-design.md 评分表），无一凭感觉设定；每项都有独立单测（构造最小账本、断言恰好该分值），组合与 cap 由专门用例覆盖（A1：52 用例含 15 个评分专项）。
