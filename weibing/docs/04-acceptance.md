# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 契约 schema 与体检完整性 | charter schema 全路径校验（version/id/brief/paths 路径规则/allowRoots/allowAll/acceptance 的 ref 唯一与 argsContains⊕artifact/stop 二选一非空/requires/未知键拒绝）；病灶 W1–W6 逐项可单测且断言恰好该分值（45/45/30/40/35/35）；相克逐条计且上限 2；妄证/缺资上限 2；险兆 5/去重 token 且无边上限 10、无度上限 10；总分 cap 100；分带 安(0–15)/萌(16–39)/病(≥40)；无 cwd 时文件探针诚实 unprobed 不计分——核心用例 ≥ 45 且全绿 | `npm test`（core 部分） | ✅ 51 用例全绿（实现中明确了一处职责划分：ref 唯一性属问诊 W4 病灶，schema 只管形状；此为语义澄清，验收阈值未动） |
| A2 | 真实管道上的诊断式插件（结构性零监听） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载 weibing 插件：插件源码无任何 `ctx.on(`（结构性零监听的直接证据）；穿过真实管道的所有调用（含失败探针）全部到达工具本体、管道零反噬；体检前后 `exam()` 结果逐字一致（零观察状态）；`ctx.weibing.exam()` 与核心 `runExam` 账实对账；`prescribe()` 与 CLI 输出逐字一致；setCharter 合法换约立即生效、非法诚实拒绝；无 charter 时 `exam()` 诚实沉默 `{valid:false,error:'no-charter'}` | 集成测试 | ✅ 8 用例全绿（连败探针 4/4 + 对照 2/2 直达工具本体；6 次调用前后 exam deepEqual；账实对账通过） |
| A3 | CLI 语义 | `template` 输出合法 charter 骨架；`charter`：合法 → 0，非法/坏 JSON → 2；`exam`：病值超阈 → 1，坏输入 → 2，干净 → 0；`--gate` / `--cwd` / `--lexicon` / `--json` 生效（`--gate` 提高后同一 charter 可从 fail 翻 pass）；`prescribe` 输出医嘱块文本（`--json` 包装）；`lexicon` 输出生效词表（含扩展）；未知命令/缺参数 → 2 | CLI 测试 | ✅ 13 用例全绿 |
| A4 | 医嘱块逐字节确定 | 同一 charter＋同一探针状态两次渲染逐字节相同（shasum 相同）；病灶按 W1→W6 固定码序、险兆按无边→无度固定序；全清时以「未病。可以开工。」收尾；无时间戳字段 | 渲染器单测 + CLI 复现 | ✅ shasum `a8e0e489…` 两次一致；确定性单测 JSON 级 deepEqual |
| A5 | 传变规则（金匮式预告警） | 无验 → 传变语点名"终验门无事可对"（正念）；无界 → 传变语点名"攀缘无从计分"（正念）；无止 → 传变语点名"运行时止损（知止）"；妄证/缺资 → 传变语点名 mid-run 翻车；医嘱显式引用下游层的字段名（终验/allowRoots/止法）——体检报告是下游层的预告警 | core 用例 | ✅ |
| A6 | 四层治理互不越界 | 插件源码无 pre-execute 监听、无账本读写、无流解析（zhizhi/jiebi/zhengnian/buer 的地盘一寸不占）；CLI 不读任何账本格式；体检只读 charter + 环境探针 | 代码 grep（下附命令，应无输出）+ 集成用例 | ✅ grep 无输出 |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程 | 代码 grep（下附命令，应无输出） | ✅ grep 无输出 |
| A8 | 测试总量 | 全部用例 ≥ 70 且全绿（core + cli + 集成） | `npm test` | ✅ 72 tests, 72 pass（core 51 + cli 13 + 集成 8，0 跳过） |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 索引与方向登记更新 | 人工 + 链接 | ✅ |

## 复现命令

```bash
cd weibing
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 见 A8 实测
```

**A6 的 grep 命令**（应无输出——插件不越四层地盘）：

```bash
grep -rniE "pre-execute|tools/result|ctx\.on\(|ledger|jsonl" src/plugin src/core | grep -v "^\s*//"
```

**A7 的 grep 命令**（应无输出——零 LLM、零网络、零子进程）：

```bash
grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create|child_process|spawn|exec\(" src/core src/plugin | grep -v "^\s*//"
```

## 实测结果（实现后回填，验收标准本身不改动）

- A1：✅ 51 核心用例全绿。schema 全路径（含未知键拒绝、路径规则、argsContains⊕artifact、stop 至少一项）；W1–W6 各自断言恰好分值；封顶（W4/W5/W6 各 2 条、险兆每 kind 10、总分 100）与分带边界（15/16/39/40）逐点可证；无 cwd 时 `probes.unprobed` 诚实计数。
- A2：✅ 8 集成用例全绿（官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 真实管道）。插件源码无任何 `ctx.on(`/`pre-execute`/`tools/result` 字样；连败探针 4/4 直达工具本体、管道零反噬；6 次调用（含 4 次失败）前后 `exam()` deepEqual（零观察状态）；运行时 `exam()`/`prescribe()` 与核心引擎/渲染器逐字一致；换约立即生效；无 charter 诚实沉默。
- A3：✅ 13 CLI 用例全绿。退出码 0/1/2 语义、`--gate 150` 使重病 charter 翻 pass、`--cwd` 使切诊落盘核对（probed≥4）、`--lexicon` 自定义词表命中且内置词表不受影响、`prescribe --json` 包装、未知命令 → 2。
- A4：✅ `weibing prescribe fixtures/sick-charter.json` 两次运行 shasum 均为 `a8e0e48947372cbbe1ba15f7432930985c7bdec3`；无时间戳/随机字段（确定性单测断言）。
- A5：✅ 六条传变语逐条断言（终验门/攀缘/知止/中局爆雷/翻车/第一轮）；医嘱显式引用下游字段名。
- A6：✅ `grep -rniE "pre-execute|tools/result|ctx\.on\(|ledger|jsonl" src/plugin src/core`（剔除注释行）无输出。
- A7：✅ `grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create|child_process|spawn|exec\(" src/core src/plugin`（剔除注释行）无输出。
- A8：✅ `npm test` → 72 tests, 72 pass, 0 skipped（core 51 + cli 13 + integration 8）。
- A9：✅ docs 01–04、SKILL.md、README、根 README 索引与方向登记均已更新。
