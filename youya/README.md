# 有涯 · Youya —— DeepSeek Harness 的见闻记忆层

> 吾生也有涯，而知也无涯。以有涯随无涯，殆已。——《庄子·养生主》

**世未变而它忘了**：第 3 轮读过的文件第 40 轮原样再读一遍（复见）、跑过的命令在账内无任何写入时原样重跑（复命）——每一次都是用有限窗口去装它已经装过的东西，庄子叫这个「殆」，今天我们叫 context rot。有涯给 DeepSeek Harness 装上会话中上下文记忆的账本：复见/复命逐案入账、殆值 0–100 分带门禁、要籍块在接缝处供给账内工作集地图。

- 谁的问题：在 DeepSeek Harness（或任何 Cordis 架构运行时）上委派**长任务**的工程师，与给会话设 CI 门禁的平台方
- 什么问题：上下文窗口有限而会话流无限增长，早期见闻被无声挤出工作记忆——**没有机制让"它开始忘了"可见**（七层治理里最后一条无人看守的通道）
- 价值：context rot 从体感变成可审计的指标；每次复见都有可核算的成本；要籍块让"只载要物"有了抓手——刀刃若新发于硎

完整生命周期文档：[选书](docs/01-book.md) · [问题](docs/02-problem.md) · [设计](docs/03-design.md) · [验收](docs/04-acceptance.md)

## 机制一分钟

| 件 | 是什么 |
|----|--------|
| 见闻账 | 从结果流确定性提取的两宗病形：**复见**（装载类工具 read/cat/view，世未变而原样重装载）、**复命**（exec 族同串命令，其间账内无成功写入而重执行） |
| 并案 | 同对象紧邻罪记并一案（三连原样读记 2 免 1），夹任何其他调用即分案——一次遗忘发作 ≠ 多次再犯 |
| 判定边界 | 基线后夹有**失败**（装载/同命令执行）→ 设瑕免记：那是势变之地（九变的地盘）。有涯只罚「世界没变它忘了」，不罚「世界变了它在应对」 |
| 殆值 | `min(100, min(60, 12×复见案) + min(40, 8×复命案))`；分带 **新硎(0–14) / 割(15–29) / 折(≥30)**（良庖岁更刀割也，族庖月更刀折也）；门默认 30 |
| 陈账 | 末次内容触碰距今 ≥ 40 调用（可配）的路径——复见之诱的点名清单，不计分只点名 |
| 要籍块 | 接缝处逐字节确定的账内工作集地图（陈账 + 工作集计数 + 殆值），注入与否由宿主决定，shasum 可证 |

## 快速开始

```bash
cd youya
npm install                  # 仅集成测试需要官方 @deepseek-ai/* 包；核心与 CLI 零依赖
npm test                     # 74 tests 全绿（core 47 + cli 15 + 真实管道集成 12）

# 验尸任何历史会话流（契约无关）
node src/bin/youya.js audit <stream.jsonl>            # 殆值 + 分带 + 门禁（≥30 折 → exit 1）
node src/bin/youya.js audit <stream.jsonl> --gate 20  # 关键任务用更严的门
node src/bin/youya.js yaoji <stream.jsonl>            # 要籍块（陈账 + 工作集地图）

# 三夹具（期望值先于实现手算）
node src/bin/youya.js audit fixtures/amnesiac-stream.jsonl   # 殆值 32（折）exit 1
node src/bin/youya.js audit fixtures/hazy-stream.jsonl       # 殆值 20（割）exit 0
node src/bin/youya.js audit fixtures/fresh-stream.jsonl      # 殆值 0（新硎）exit 0
```

作为 Cordis 插件挂载：

```js
import youya from './src/plugin/youya.js'
ctx.plugin(youya, { gate: 30, chenGap: 40 })

ctx.youya.report()   // { totals, score, band, gate }
ctx.youya.jianwen()  // 逐记清单（复见/复命，带位次与对象）
ctx.youya.yaoji()    // 要籍块（逐字节确定，#k 递增）
ctx.youya.gate()     // { score, fujian, fuming, verdict, ok }
ctx.youya.exportStream()  // 导出会话流，供 youya audit 离线对账
```

插件在 `tools/result` 持续巡忆（结构性零拦截：源码无任何 pre-execute 监听器），观察异常一律吞掉、管道照常。

## 与七层的边界（结构性，不是纪律性）

本愿不失是正念的事，**见闻不忘是有涯的事**；火传是 buer 的事，**薪是有涯的事**。有失败介入的重复是势变（九变地盘）——世未变的重复才是遗忘。逐层判定表见 [设计 §9](docs/03-design.md)；不越界的证据是 grep（[验收 A8](docs/04-acceptance.md)），不是承诺。

## 诚实边界

只记账内之变（外部世界的变化流里看不见——轮询类会话可能被误计，声明权在流）；复见限装载类工具，检索类同路径异参是合法的再问；路径不归一化（宁漏勿诬）；殆值 0 不是记性满分。全部条款见 [选书 · 诚实边界](docs/01-book.md)。

## 许可

MIT
