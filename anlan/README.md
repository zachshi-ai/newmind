# 安澜 · anlan —— DeepSeek Harness 的响应性施治治理层

> 戴明《转危为安》（Out of the Crisis）漏斗实验 × Agent 修复乒乓（逐帧皆真的响应性施治）
>
> 「**规则一：把漏斗对准靶心，保持不动。**」
>
> 「**若过程处于稳定状态，对它做出响应性调整，只会使变异越来越大。**」（据通行中译本转述）

agent 修一单活：`npm test -- auth` 红了（真回归或环境抖动，谁在单帧里
都分不清）→ 改 `src/auth.js` → 复跑绿了 → 几步之后又红 → 又改 → 又绿
……交付时全绿，每一帧都经得起现有全部相邻层的审计：上帧确实红（有据）、
这一改确实落盘（有作工）、末帧确实绿（无红可盖）。但拉通序列：叠了三
次、搅了三次——**单帧皆真，序列皆妄**，净效果趋零而改动面净增。这就是
修复乒乓：漏斗规则二/三在 agent 身上的逐帧重演。假施治也没有恶意，只是
没有人逼它**出示这串红绿交替账上的净效果**。安澜就是那个逼问者。

- 它只判一件零 LLM 能确定性回答的事：**同一验证对象翻了几叠、它动了几
  次手**——胜负笔是流内 exec 的成败旗标 × 诊形词面，搅笔是成功之写的
  径与文词面，叠数与搅窗是流内序列的逐字节可复算计数；
- **荡案 +30 单案即红**：叠数 ≥3 ∧ 搅窗 ≥2——三叠两搅的乒乓施治（漏斗
  规则二/三），荡值 min(60, 30×案)；
- **风浪注记 0 分**：叠 ≥3 ∧ 搅窗 <2——波自翻转而手未动，环境之波非人
  祸（红珠实验：波动来自系统）；顺手把 flaky 摘出来还给任务方；
- **叠 ≤2 静默**：单轮修复收敛（红→改→绿收工）是守准之德——漏斗规则
  一，本层为它留名不入罪；「治了又坏一轮」的叠 2 搅 2 宁纵让渡；
- **波不皆信号**：只有诊形（test/lint/build 44 形）的 exec 才记状态笔，
  null 老流不记（诚实退化）；全量绿洗全科（在场对象记顺）、全量红只挂
  输出点名者（无矢之红不挂）；只有澜册 spare 明言豁免的对象整线免审——
  无册照判，agent 无从自免。

## 快速开始

```bash
npm install                          # devDependencies 供集成验证；CLI 本体零依赖
node src/bin/anlan.js audit fixtures/clean-stream.jsonl; echo $?   # 0（守准·单轮修复）
node src/bin/anlan.js audit fixtures/anlang-stream.jsonl; echo $?  # 1（荡案 30 红）
node src/bin/anlan.js audit fixtures/fenglang-stream.jsonl; echo $? # 0（风浪·flaky 检出）
node src/bin/anlan.js audit fixtures/cemian-stream.jsonl --file fixtures/anlan-book.json; echo $? # 0（澜册豁免）
node src/bin/anlan.js audit fixtures/hepan-a.jsonl fixtures/hepan-b.jsonl; echo $? # 1（合审跨会话荡案）

npm test                             # 68 tests（core 37 + cli 19 + 真实管道集成 12）
```

CLI：

```bash
anlan audit <s1.jsonl> [s2.jsonl …] [--file <澜册>] [--gate n] [--json]
anlan register --spare <对象>        # 豁对象（波动已知之名分，重复去重）
anlan register --forms <形> / --no-defaults
anlan revoke --spare <对象>
anlan list / block / gate --value <n>
```

## 结构

```
anlan/
├── docs/            01 选书映射 · 02 问题与价值 · 03 设计语义锁死 · 04 验收与实测
├── fixtures/        19 条会话流（守准/荡案/风浪/未达门槛/收敛不赦/对象独立/双荡/全科镜/
│                    老流/无矢/迟搅/澜册/英文/观察/首绿起振/交错/合审×2）
├── src/
│   ├── core/        stream 解析 · object 工具族 · zhenxing 诊形词法 · bozhang 波账引擎
│   │                · lance 澜册 · dangpai 荡牌块 · audit 多流合审
│   ├── bin/         anlan CLI（零依赖，exit 0/1/2）
│   └── plugin/      anlan 插件（Cordis，tools/result 观察口，结构性零拦截）
├── test/            core 37 + cli 19 + 集成 12
└── SKILL.md         息浪协议（波不皆信号、治必对波、一次治好、叠三搅二即荡）
```

## 判定速查

| 档 | 形迹 | 分值 | 经义 |
|---|---|---|---|
| 荡案 | 同对象叠数 ≥3 ∧ 搅窗 ≥2 | +30/案（单案即红） | 漏斗规则二/三：逐帧响应，放大变异 |
| 风浪 | 同对象叠数 ≥3 ∧ 搅窗 <2 | 注记 0 分 | 红珠实验：波动来自系统，flaky 还给任务方 |
| 静默 | 叠数 ≤2 | 0 | 漏斗规则一：守准之德不入罪 |

## 与相邻各层的边界

每层都审一帧：zhizhi 数证据有无、jiubian 勘败后重复（乒乓每帧皆绿，盲捶
结构盲）、huiji 审痊愈宣称对流内红（本层零稿面）、zhizu 量单次写入（一次
大手术 vs N 次小刀序列）、xiaoyan 称单帧成色——**安澜是第一层审序列净
效果**：同一对象的胜负序列 × 搅动序列。逐层边界见 `docs/03 §12`。

## 许可

MIT（见仓库根 LICENSE——© 2026 zachshi-ai，仅限学术研究与非商业性使用）。
