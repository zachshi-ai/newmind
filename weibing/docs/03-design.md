# 03 · 设计：任务书契约（charter）· 四诊 · 病灶与险兆 · 病值与门禁 · 医嘱供给

原则：零 LLM、零网络、零子进程；一切判断可逐字重放；缺席与落空分开计分；探针只读。

## 一、任务书契约（charter v1）

体检的对象是**任务书本身**——不是 Agent 的账本，不是动作流。契约骨架（`weibing template`）：

```json
{
  "version": 1,
  "id": "t-001",
  "brief": "任务的一句话原文（体检的闻诊对象，必填）",
  "paths": ["src/v2/"],
  "scope": { "allowRoots": ["src/v2/", "tests/v2/"], "allowAll": false },
  "acceptance": [
    { "ref": "a1", "name": "bash", "argsContains": "npm test" },
    { "ref": "a2", "artifact": "reports/repro.txt" }
  ],
  "stop": { "maxSteps": 200, "maxMinutes": 45 },
  "requires": { "files": ["package.json"], "tools": ["node"] }
}
```

schema 规则（全路径校验，任一违反 → `valid:false` + issues）：

| 字段 | 规则 |
|------|------|
| `version` | 必须为 1 |
| `id` / `brief` | 非空字符串（brief 去首尾空白后非空） |
| `paths` | 可选；字符串数组；每条非空、非绝对路径（不以 `/` 开头）、不含 `..` 段 |
| `scope` | 可选；对象；`allowRoots` 字符串数组（同上路径规则）；`allowAll` 布尔（true 即无界，见 W2） |
| `acceptance` | 可选；数组；每条 `ref` 非空且全表唯一；`argsContains` 与 `artifact` **必须给且只给一个**；`argsContains` 必须带 `name` |
| `stop` | 可选；对象；`maxSteps` / `maxMinutes` 为正整数，至少一项才视作"有止法" |
| `requires` | 可选；对象；`files` / `tools` 字符串数组（files 走路径规则） |
| 未知键 | 顶层未知键 → issue（严格 schema） |

## 二、四诊：体检的四个确定性遍历

四诊传统（《难经·六十一难》定型）→ 四次确定性扫描，各司其职：

| 诊 | 对象 | 机制 | 能发现 |
|---|---|---|---|
| **望**（望而知之） | 任务书的结构本身 | schema 校验后逐字段检查"该在的条款在不在" | 无验、无界、无止 |
| **闻**（闻而知之） | `brief` 的措辞 | 显式词表匹配（无边之词、无度之动词） | 险兆（萌级） |
| **问**（问而知之） | 条款之间的关系 | 引用去重、目标径与愿界的前缀相交 | 相克 |
| **切**（切脉而知之） | 环境的事实 | 只读探针：PATH 扫描找命令、`--cwd` 下 stat 文件 | 妄证、缺资 |

词表（默认词表内置，`--lexicon` 可追加，声明权在任务方）：

- 无边之词（unbounded）：所有 · 全部 · 凡是 · 一律 · 每个 · 彻底 · 完全 · 永远 · 绝不 · 任何 · all · every · everything · always · never · entirely · completely
- 无度之动词（vague）：优化 · 改进 · 完善 · 看看 · 了解 · 研究 · 考虑 · 梳理 · explore · improve · optimize · consider · look into · understand · review · familiarize

匹配规则：英文小写化后子串匹配（与正念锚点同一确定性运算）；**每个去重 token 只计一次**（与出现次数无关）；命中即记，不做语义判断。

## 三、病灶表（W1–W6，每项一个可独立证伪的加权条款）

| # | 病名 | 判据（望/问/切） | 权重 | 上限 | 传变（金匮：见肝知肝传脾） | 医嘱（开给谁） |
|---|------|----------------|------|------|--------------------------|----------------|
| W1 | 无验 | `acceptance` 缺席或空数组 | 45 | — | 代偿完成无从对账：正念终验门将无事可对，zhizhi 证据核对将无据可核 | 声明终验（ref + bash 命令 / artifact 路径） |
| W2 | 无界 | `scope` 缺席，或 `allowRoots` 缺席/空，或 `allowAll: true` | 45 | — | 攀缘无从计分：愿界之外不存在，越界也就不存在（正念攀缘分结构性沉默） | 立愿界 allowRoots |
| W3 | 无止 | `stop` 缺席，或 `maxSteps` / `maxMinutes` 皆无 | 30 | — | 浪费只能靠运行时止损（知止账本事后入账），开工前无人问"到哪儿算完" | 立止法 maxSteps / maxMinutes |
| W4 | 相克 | ① 终验 `ref` 重复；② 终验 `artifact` 路径重复；③ `paths` 声明的目标径在所有 `allowRoots` 之外（逐条计） | 40/条 | 2 条 | 中局爆雷：互斥要求同时到期，返工不可恢复 | 收敛矛盾：目标径入界、终验引用唯一 |
| W5 | 妄证 | 切诊落空：`artifact` 路径在 `--cwd` 下不存在；`argsContains` 首词不在 PATH | 35/条 | 2 条 | 第一次对账即翻车：mid-run 确诊是世界上最贵的确诊方式 | 修证：补建产物路径或换存在的证据 |
| W6 | 缺资 | 切诊落空：`requires.files` 文件不存在；`requires.tools` 命令不在 PATH | 35/条 | 2 条 | 第一轮工具调用即报错：预算烧在发现自己没带工具上 | 备资：装命令、补文件，或删掉这条依赖声明 |

诚实条款：**无 `--cwd` 时文件类探针不执行**——记入 `probes.unprobed`，不计分、不报警（不假装核对过）；PATH 探针不依赖 cwd，始终执行。

权重设计原理（FMEA 表）：任何单项硬伤（45/45/40）单独入病带必拦；两项实证落空（35+35）必拦；单项实证落空（35）与无止法（30）为萌级黄灯——运行时各层尚可止损，体检只预告不禁行。

## 四、病值与分带

```
病值 score = min(100, Σ病灶 + Σ险兆)      险兆：5/去重token，无边上限10，无度上限10
分带：0–15 安（未病） · 16–39 萌（欲病救萌） · ≥40 病（带病开工）
门禁：score ≥ gate → 退出码 1（gate 默认 40，--gate 可调；诊而不拦，拦不拦由 CI/宿主决定）
```

萌与病直接取自原典：「上工救其**萌芽**……下工救其已成，救其已败」。

报告形态（JSON，可逐字重放）：

```json
{
  "charter": "t-001", "cwd": "/repo", "gate": 40,
  "score": 75, "band": "病", "verdict": "fail", "ok": false,
  "probes": { "probed": 3, "unprobed": 0 },
  "breakdown": { "lesions": 75, "omens": 0 },
  "lesions": [ { "code": "W1", "name": "无验", "weight": 45, "kind": "…", "detail": "…", "prescription": "…" } ],
  "omens":   [ { "token": "所有", "kind": "unbounded", "label": "无边之词", "weight": 5 } ],
  "transmissions": ["无验 → …"],
  "issues": ["无验 +45：终验缺席，完成将对着空气宣布（传变：正念终验门将无事可对）"]
}
```

病灶按 W1→W6 固定码序排列，险兆按无边→无度、词表内序排列——同输入永远同输出。

## 五、医嘱块（prescribe，供给物）

`weibing prescribe` 输出**逐字节确定**的纯文本体检单（同一 charter + 同一探针结果 → 同一字节，shasum 可证；无时间戳、无随机数），供宿主在开工接缝注入上下文，也是给人看的处方笺：

```
【治未病 · pre-flight】#t-001
任务：把代码迁到新框架
体检根：/repo
病值：75（病）· 门 40
病灶 2：
  - W1 无验 +45 —— 医嘱：声明终验（ref + bash 命令 / artifact 路径），供知止证据核对与正念终验门对账
  - W2 无界 +45 —— 医嘱：立愿界 allowRoots，写入的根必须在开工时点名
险兆 1：
  - 「所有」无边之词 +5 —— 医嘱：无边之词改成可数的界，点名列出对象
传变 2：
  - 无验 → 代偿完成无从对账：正念终验门将无事可对，zhizhi 证据核对将无据可核
  - 无界 → 攀缘无从计分：愿界之外不存在，越界也就不存在（正念攀缘分结构性沉默）
——《素问·四气调神大论》：圣人不治已病治未病，不治已乱治未乱。
```

全清时以「未病。可以开工。」收尾——给"从未生病的运行"记账（扁鹊长兄的那笔账）。

## 六、插件：诊断式（结构性零监听）

```js
ctx.weibing.setCharter(c)   // 立任务书（数据问题不抛错，valid:false + issues）
ctx.weibing.exam({ cwd })   // 体检报告（无 charter 时诚实沉默：{ valid:false, error:'no-charter' }）
ctx.weibing.prescribe({ cwd }) // 医嘱块（逐字节确定）
ctx.weibing.report()        // 就绪状态：是否立了 charter、最近一次体检摘要
```

与四类先例的姿态对照：zhizhi **拦**（pre-execute）、jiebi **审**（tools/result 观察账本）、zhengnian **供给**（tools/result 度量 + 接缝供给）、buer **记习**（事故过账）；weibing **零监听**——源码里没有任何 `ctx.on(...)`，不参与任何接缝，只在被问时出诊。诊断绝不反噬：exam 内部任何异常都吞掉并返回 `{ valid:false }`，管道照常（它本来就不在管道上）。

## 七、边界（不做的事）

- **不做运行时治理**——不拦任何动作（zhizhi）、不审任何判断账本（jiebi）、不度量任何意图在场（zhengnian）、不记任何跨会话账（buer）；
- **不做语义判断**——闻诊是显式词表匹配，不是 NLP；词表声明权在任务方（`--lexicon`）；
- **不假装核对**——无 cwd 时文件探针诚实记 `unprobed`，不计分；
- **诊而不拦**——门禁只是退出码与 band，物理上没有任何拦截能力；
- **不承诺成功**——病值 0 是必要条件。体检保证的是：就绪条款有了形状、带病开工有了数字、每个病灶有一条医嘱。
