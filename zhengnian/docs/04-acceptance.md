# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 契约 schema 与尘值完整性 | 契约 schema 全路径校验（version/id/wish/keywords/paths/scope 互斥/acceptance/window）、三项尘值（失念/攀缘/息尘）逐项可单测且断言恰好该分值、cap 100、分带与阈门语义、失念只计"从最新往回的连击"、提取失败不罚（unparsedWrites 计数）——核心用例 ≥ 45 且全绿 | `npm test`（core 部分） | ✅ 51 用例全绿 |
| A2 | 真实管道上的供给式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载正念插件：所有调用无条件到达工具本体（连败探针 4/4 直达，对照组 6/6 执行，结构性零拦截）；尘值账本随观察更新且失念/攀缘数字与公式吻合；`ctx.zhengnian.reanchor()` 返回逐字节稳定文本并记录 reanchor 事件；`exportStream()` 可被离线 audit 重放且数字与运行时一致；`acceptance()` 随终验证据出现而翻转 | 集成测试 | ✅ 11 用例全绿 |
| A3 | CLI 语义 | `template` 输出合法契约骨架；`contract`：合法 → 0，非法/坏 JSON → 2；`audit`：尘值超阈或终验未对账（--acceptance）→ 1，坏输入（不可读/坏 JSON/非法契约）→ 2，干净 → 0；`--gate` / `--max-stale` / `--window` / `--acceptance` / `--cwd` / `--stream` 生效；`reanchor` 输出拂拭块文本（`--json` 包装） | CLI 测试 | ✅ 13 用例全绿 |
| A4 | 终验门对准语义 | 契约终验（name+argsContains / artifact）逐条核对：流中无痕迹 → `unverified` 且门 fail；有痕迹 → `verified`；artifact 无 `--cwd` 且流中无痕迹 → `unverified`（不假装核对）；探针 `name` 必须逐字相同 | core + CLI 用例 | ✅ |
| A5 | 三层治理互认账本 | zhizhi 的 `fixtures/sample-stream.jsonl`（无调用 id 的旧格式，result 并入紧邻 call）与 jiebi 的 `fixtures/sample-stream.jsonl` 直接喂给 `zhengnian audit`（配 cross-wish 契约）：解析、失念/攀缘/息尘度量、终验门全部正常工作——同格式流可跨项目审计 | core 用例 | ✅ 两流均 8 次调用、尘值 0（净）、终验 fulfilled |
| A6 | 拂拭块逐字节确定 | 同一契约＋同一尘值状态两次渲染逐字节相同（shasum 相同）；契约键序无关（渲染顺序由代码固定）；`#k` 随拂拭次数递增；无状态时不出现尘值行 | 渲染器单测 + CLI 复现 | ✅ |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络 | 代码 grep（下附命令，应无输出） | ✅ grep 无输出 |
| A8 | 测试总量 | 全部用例 ≥ 70 且全绿（core + cli + 集成） | `npm test` | ✅ 75 tests, 75 pass |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 索引与方向登记更新 | 人工 + 链接 | ✅ |

## 复现命令

```bash
cd zhengnian
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 75 tests, 75 pass
```

**A7 的 grep 命令**（应无输出）：

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
ℹ tests 75
ℹ pass 75
ℹ fail 0
（core 51 + cli 13 + 集成 11，分文件运行各自全绿）
```

### 关键实测样例

蒙尘会话的审计（失念连击 4 次 + 2 次越界写入 + 拂拭断顿 1 段 → 66 分蒙，exit 1）：

```console
$ zhengnian audit fixtures/drifting-wish.json fixtures/drifting-stream.jsonl
{
  "contract": "w-001",
  "calls": 34,
  "score": 66,
  "band": "蒙",
  "verdict": "fail",
  "gate": 30,
  "breakdown": { "forget": 32, "grasp": 24, "cadence": 10 },
  "details": { "anchorMissStreak": 4,
               "outOfScopeWrites": [ { "ref": "c21", "path": "docs/api.md" },
                                     { "ref": "c28", "path": "scripts/ci.sh" } ],
               "unparsedWrites": 0, "reanchors": 0, "maxGap": 34 },
  "issues": [ "最近 4 次动作与本愿锚点零交集（失念） (+32)",
              "2 次写入落在愿界之外（攀缘：docs/api.md、scripts/ci.sh） (+24)",
              "1 段超过 30 次调用没有拂拭（息尘：最长 34 次） (+10)" ],
  "ok": false
}
$ echo $?
1
```

干净会话 + 终验门（尘值 0 净，a1 探针在流中真实发生 → fulfilled，exit 0）：

```console
$ zhengnian audit fixtures/clean-wish.json fixtures/clean-stream.jsonl --acceptance
{
  "contract": "w-002", "score": 0, "band": "净", "verdict": "pass",
  "breakdown": { "forget": 0, "grasp": 0, "cadence": 0 },
  "acceptance": { "verdict": "fulfilled",
    "refs": [ { "ref": "a1", "kind": "probe", "status": "verified", "via": "stream" } ] },
  "ok": true
}
$ echo $?
0
```

拂拭块（同一契约同一状态两次渲染，shasum 逐字节一致）：

```console
$ zhengnian reanchor fixtures/drifting-wish.json --stream fixtures/drifting-stream.jsonl | shasum
8386e5f13e02a8ef4ff787ce519253a8b07ead91  -
$ zhengnian reanchor fixtures/drifting-wish.json --stream fixtures/drifting-stream.jsonl | shasum
8386e5f13e02a8ef4ff787ce519253a8b07ead91  -
$ zhengnian reanchor fixtures/drifting-wish.json --stream fixtures/drifting-stream.jsonl
【拂拭 · re-anchor】#1
本愿：修复 payments 模块的重复扣款，并让回归测试全绿
锚点：payment / duplicate / 扣款 / test
锚径：src/payments/
愿界：src/payments/ / tests/payments/
终验：a1=bash~npm test；a2=artifact=reports/repro-fixed.txt
尘值：66（失念 32 · 攀缘 24 · 息尘 10）
——《坛经》：时时勤拂拭，勿使惹尘埃。
```

A5 跨项目互认（jiebi 导出的流配 cross-wish 契约，正念直接审）：

```console
$ zhengnian audit fixtures/cross-wish.json ../jiebi/fixtures/sample-stream.jsonl --acceptance --json
{"mode":"dust","contract":"w-cross","calls":8,"score":0,"band":"净","verdict":"pass",
 "breakdown":{"forget":0,"grasp":0,"cadence":0},
 "acceptance":{"verdict":"fulfilled","refs":[{"ref":"a1","kind":"probe","status":"verified","via":"stream"}]},
 "ok":true}
```

### 尘值正确性的辩护

尘值三项全部来自原典条款（见 docs/03-design.md 评分表），无一凭感觉设定；每项都有独立单测（构造最小调用序列、断言恰好该分值：失念 8/24/40/40、攀缘 12/36/40、息尘 0/10/20），组合与 cap 由专门用例覆盖（A1：51 用例含 17 个评分专项）；拂拭块的逐字节确定性由 shasum 复现与渲染器单测双重锁定（A6）。
