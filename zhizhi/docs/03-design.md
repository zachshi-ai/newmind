# 03 · 设计：接缝、规则语义与事件流

## 架构：只站公开接缝，不 fork 不改源码

DeepSeek Harness 的工具管道在 `ctx.tools` 服务上公开了完整的治理接缝（见其 `docs/capability-seams.md`）：

```
                       ┌────────────────────────────────────────────┐
模型请求工具调用 ──────▶ │ ctx.tools 管道                              │
                       │                                            │
                       │  tools/pre-execute (waterfall)             │
                       │    ├─ 知止门：guard() 只读裁决               │
                       │    │    deny ──▶ {kind:'deny', reason} ──┐ │
                       │    └─ next() ──▶ 真实工具执行             │ │
                       │                                         ▼ ▼
                       │  tools/result (emit) ──▶ 模型看到结果/拒绝理由
                       │        │
                       │        └─▶ 知止账本 observe()（唯一写入口）
                       └────────────────────────────────────────────┘
```

- **`tools/pre-execute`**：框架级 waterfall，监听器返回而不调 `next()` 即为否决（veto）——这是官方设计的拦截接口，知止的"门"就挂在这里。
- **`tools/result`**：结果结算事件，知止的"账本"挂在这里。
- **`ctx.zhizhi` 服务**：插件向同仓暴露 `report()` / `exportStream()`。

### 两个接缝上的工程事实（实测得来，写进设计）

1. **执行对象的参数字段是 `arguments`**，引擎统一用 `{name, args}`——插件层做一次 `toCall` 适配。指纹对不上，规则就永远沉默（这是我们集成测试抓到的第一个真 bug）。
2. **被拦调用会"回声"**：dsh 把 deny 物化为一次失败结果并发 `tools/result`。回声不是真实执行，插件凭指纹识别并跳过结算——否则拦截会给自己记账，连败数虚增。

## 规则语义（精确版）

### 止损 stopLoss ← 知止可以不殆

- 调用指纹 = 工具名 + 参数的稳定序列化 FNV-1a 摘要。同名同参 = 同一指纹。
- 连续失败计数按指纹独立累计；**成功一次即清零**（知止只惩罚"连续"失败）。
- 计数 ≥ `threshold`（默认 3）后，下一次同指纹调用被拦，理由含：失败次数、最近 N 次错误摘要、"换方法"指令（zh/en 双语可配）。
- **变更重置**：一次成功的变更性动作（结构化写工具，或 bash 的高置信度写入）使世界改变，此前所有连败清零——改完代码再跑测试是合法的。防作弊与诚实性：账本暴露 `mutationResets` 计数，"插无意义写入洗白连败"的模式对人可见。
- 拦后原样重试 → 再次被拦，计入 `redennied`（模型没听懂拒绝的信号，对人是重要情报）。

### 先读后写 readBeforeWrite ← 为之于未有

- 写入路径提取：结构化写工具按参数键（`path`/`file_path`/…）；bash 用白名单 + 确定性正则（`>` `>>` `tee` `sed -i` `dd of=` `touch` `rm` `mkdir` `cp`/`mv` 目标……），排除 fd 重定向与 `/dev/*`。
- 读取标记：只有**成功**的读取才计数；读过目录覆盖其下文件（前缀覆盖语义）。
- 覆盖判断不过 → deny，理由列出未读路径。
- **宁漏勿错**：提取器只报告高置信度目标，漏掉的写入不拦（漏拦损失一轮往返，误拦打断合法工作——两害相权）。

### 完成核验 verify ← 轻诺必寡信

- 不拦调用，只记账：成功的验证性 bash 命令（默认模式表：`npm/pnpm/yarn/bun test|check`、`vitest`、`pytest`、`go test`、`cargo test/check/clippy`、`make`、`tsc`、`eslint`、`ruff`……可配）= 证据。
- 运行时账本暴露 `evidence` / `lastEvidenceAt` / `callsSinceEvidence`；离线审计按 turn 聚合出 `unverifiedTurns`。

## 事件流（zhizhi stream）

JSONL，每行一个事件。运行时 `ctx.zhizhi.exportStream()` 导出；离线工具也可手工构造（what-if 审计裸会话）：

```jsonc
{"type":"turn_start","id":"t1","at":100}
{"type":"tool_call",  "name":"bash","args":{"command":"npm test"},"at":101}
{"type":"tool_result","name":"bash","args":{"command":"npm test"},"isError":true,"errorDigest":"…","at":102}
{"type":"tool_denied","name":"bash","args":{"command":"npm test"},"rule":"stopLoss","at":130}
{"type":"turn_end",   "id":"t1","at":149}
```

## 离线审计的两种模式

| 模式 | 输入 | 回答的问题 | 关键机制 |
|------|------|------------|----------|
| `whatif`（默认） | 裸会话流（每次调用都有结果） | 如果当时装了知止，能拦几次？ | 被判拦截的调用，其结果**不再进入引擎**（模拟调用没发生） |
| `gated` | 知止运行时导出流（被拦调用带 `tool_denied`） | 运行时和离线重放是否逐字一致？ | 拦截序列逐条对账；`consistency.match=false` 即为可证伪的失败信号 |

单遍重放：拦截理由在重放现场原样捕获，报告与运行时逐字一致，不做事后重建。

## 失败哲学

- **fail-open**：约束门 guard 抛错默认放行（`failOpen: true`）——节制层绝不能成为新的单点故障；
- **观察永不反噬**：`tools/result` 监听器内任何异常吞掉，管道照常；
- **guard 只读**：裁决不改变状态，重复裁决结果恒定——这让"先裁决后结算"的时序天然安全。
