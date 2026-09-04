# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §11 与夹具头注释）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填）；会话 id 撞名报错；对象键三级回退（p:/c:/n:）与工具族词表同 jiubian；写事件 = write 族且 `isError !== true`；争写交错判定（有序对相邻写含他方写 → 每键每有序对至多 1 处）；先后共写不计分；判定序侵入 > 越分 > 未领分（同一写不双计）；分的开放时段 `[at, releasedAt)`；争写 +30/处 cap 60、侵入 +30/径 cap 60、越分 +6/径 cap 30、total cap 100；分带 定 0–14 / 竞 15–29 / 争 ≥30；门默认 30——core 用例 ≥ 40 且全绿，断言恰好该分值 | `npm test`（core 部分） | ✅ 52 用例全绿 |
| A2 | 夹具分数（先于实现手算定死） | `fenced-stream`：6 调用、写 2、争值 0、带「定」、exit 0；`racer-a`+`racer-b`：11 调用、写 8、争写 2 处（恰达 cap 60）、共写 1（HANDOFF.md）、争值 60、带「争」、exit 1；`stray`+`stray-registry`：5 调用、写 4、侵入 1（30）+ 越分 1（6）= 36、带「争」、exit 1；同流换无 tenant 分册：争值 12、带「定」、exit 0 | core 断言 + CLI 复现 | ✅ 四组期望逐字吻合（0 / 60 / 36 / 12 分与全部计数） |
| A3 | 跨项目互认 | jiubian 的 `fixtures/adaptive-stream.jsonl` 与 zhizhi 的 `fixtures/sample-stream.jsonl`（无 id 旧格式）直接喂 `dingfen audit`：各 1 会话、争值 0、带「定」、exit 0——同格式流可跨项目审计，旧格式不炸 | CLI 测试 | ✅ 两流均 1 会话 / 0 分 / 定 / exit 0（旧格式不炸） |
| A4 | CLI 语义 | `audit` 多流 + `--file` + `--gate` + `--json`；坏 JSON / 流缺失 / 会话 id 撞名 → exit 2；`claim` 缺 `--id`/`--fence` → exit 2，争界告警附见证径，`--strict` 争界 → exit 1；`release` 无开放分 → exit 2；`list`/`block` 册缺失 → exit 2；`gate --value` 按门判 0/1；`--version`/`--help` 正常——CLI 用例 ≥ 16 | CLI 测试 | ✅ 16 用例全绿 |
| A5 | 界碑块逐字节确定 | 同一分册两次 `dingfen block` shasum 相同；增一开放之分后文本改变；空册输出确定性空册文本；每处争界告警附**见证径**且见证径真实命中双方 glob（见证自证，core 断言） | CLI shasum 复现 + core 用例 | ✅ 逐字节一致（shasum 16ac9fbe…×2）；见证自证通过 |
| A6 | 真实管道上的封界式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载定分插件：写探针无条件到达工具本体（结构性零拦截）；写账随 `tools/result` 步进；注入分册后侵入/越分照判；`jiebei()` 逐字节稳定；双引擎 `exportStream()` 合并离线 `audit` 重放，侵入/越分/争写与运行时账**账实一致**——集成用例 ≥ 8 | 集成测试 | ✅ 9 用例全绿（账实一致 72 = 6 + 36 + 30） |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程；插件源码无 pre-execute 监听器（结构性零拦截） | grep（下附命令，应无输出） | ✅ 两组 grep 均无输出 |
| A8 | 测试总量 | 全部用例 ≥ 72 且全绿（core + cli + 集成） | `npm test` | ✅ 77 tests, 77 pass |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅ |

## 复现命令

```bash
cd dingfen
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/dingfen.js audit fixtures/fenced-stream.jsonl; echo $?                      # 0
node src/bin/dingfen.js audit fixtures/racer-a.jsonl fixtures/racer-b.jsonl; echo $?     # 1
node src/bin/dingfen.js audit fixtures/stray.jsonl --file fixtures/stray-registry.json; echo $?  # 1
```

**A7 的 grep 命令**（应无输出；第二条用监听器注册的精确模式，避免误伤注释散文）：

```bash
grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create|child_process|execSync|spawn" src/core src/plugin | grep -v "^\s*//"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
```

## 实测记录（2026-09-05，本机复跑真实输出）

```
$ node --version
v24.18.0
$ npm ls @deepseek-ai/cordis @deepseek-ai/dsh-tools
dingfen-dsh@0.1.0
├── @deepseek-ai/cordis@4.0.2
└── @deepseek-ai/dsh-tools@0.0.1-rc.1
$ npm test
ℹ tests 77
ℹ pass 77
ℹ fail 0
（core 52 + cli 16 + 集成 9，分文件运行各自全绿）
```

A7 的 grep（均无输出，退出码 1）：

```console
$ grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create|child_process|execSync|spawn" src/core src/plugin | grep -v "^\s*//"
$ grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
```

racer 交错夹具的审计（两处争写 = cap 60 / 带「争」/ exit 1）：

```console
$ dingfen audit fixtures/racer-a.jsonl fixtures/racer-b.jsonl
{
  "sessions": 2,
  "calls": 11,
  "writes": 8,
  "score": { "total": 60, "strife": 60, "trespass": 0, "stray": 0 },
  "band": "争",
  "gate": 30,
  "verdict": "fail",
  "ok": false,
  "counts": { "strifeSpots": 2, "coWrites": 1, "trespassPaths": 0, "strayPaths": 0, "unclaimed": 0 },
  "issues": [
    "争写 ×2：core/auth.js（racer-a × racer-b）、src/api/router.js（racer-a × racer-b）——交错覆盖，后者闭眼",
    "共写 ×1（不计分）：HANDOFF.md —— 先后接手，非相争"
  ]
}
$ echo $?
1
```

权界夹具的审计（侵入 30 + 越分 6 = 36 / 带「争」/ exit 1）与无 tenant 对照（12 / 定 / exit 0）：

```console
$ dingfen audit fixtures/stray.jsonl --file fixtures/stray-registry.json
{
  "sessions": 1, "calls": 5, "writes": 4,
  "score": { "total": 36, "strife": 0, "trespass": 30, "stray": 6 },
  "band": "争", "verdict": "fail",
  "issues": [
    "侵入 ×1（+30）：src/api/notes.md —— 落入 tenant 开放之分（src/api/**）",
    "越分 ×1（+6）：docs/plan.md —— 漂出自家分界（src/auth/**）"
  ]
}
$ echo $?                                    # 1
$ dingfen audit fixtures/stray.jsonl --file /tmp/notenant.json   # 同流，tenant 未领分
  → "score": { "total": 12, "strife": 0, "trespass": 0, "stray": 12 }, "band": "定"
$ echo $?                                    # 0
```

界碑块（同一分册两次渲染，shasum 逐字节一致）：

```console
$ dingfen block --file fixtures/stray-registry.json | shasum
16ac9fbec773fc71c259ac0283c087bffecb4a1b  -
$ dingfen block --file fixtures/stray-registry.json | shasum
16ac9fbec773fc71c259ac0283c087bffecb4a1b  -
$ dingfen block --file fixtures/stray-registry.json
【定分 · 界碑】
在册开放之分 2 条：
  · stray ── src/auth/**
  · tenant ── src/api/**
争界：无——分已定，行者不顾。
本块由确定性规则生成；重放同一分册必得同一文本。
```

集成账实对账（双引擎交错写 + 注入分册，导出流离线审计 = 运行时账，72 = 6 + 36 + 30）：

```console
（integration.dsh.test.js：offline.score.total === 72 ✅
 offline.score.total === ra.score.total + rb.score.total + offline.score.strife → 72 === 6 + 36 + 30 ✅
 offline.score.trespass === rb.score.trespass → 30 === 30 ✅
 offline.score.stray === ra.score.stray + rb.score.stray → 12 === 6 + 6 ✅）
```
