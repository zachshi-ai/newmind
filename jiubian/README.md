# 九变 · jiubian —— DeepSeek Harness 的勘流应变层

> **兵无常势，水无常形。能因敌变化而取胜者，谓之神。**——《孙子兵法·虚实篇》

一门两千五百年的兵法，能不能精确地解决人工智能的一个真实问题？

能。2026 年的 Agent 跑在**非平稳环境**里：并发会话在改同一批文件、依赖在中途漂移、需求在运行中被更新。而 Agent 的路径是开工时定的——于是有了第六种昂贵的失败：**世界变了，它没看见**。要么势已变而途不变（胶柱鼓瑟地盲捶死磕），要么途在动而势无凭（望风而动地连开新战线）。九变把这两种失机变成了**可测量、可门禁、可重放**的结构事实。

## 它是什么

DeepSeek Harness 的**勘流式插件**（Cordis）+ 零依赖审计 CLI + Agent Skill。

本实验室第六层治理，与前五层的边界（结构性，不是纪律性）：

| 层 | 思想源头 | 治什么 | 时点 |
|---|---|---|---|
| [知止 zhizhi](../zhizhi/)（手） | 《道德经》 | 行为失控 | pre-execute 拦截 |
| [解蔽 jiebi](../jiebi/)（眼） | 《荀子·解蔽》 | 判断失真 | 审判断账本 |
| [正念 zhengnian](../zhengnian/)（心） | 《六祖坛经》 | 意图漂移 | 契约度量 + 供给 |
| 不贰 buer（习） | 《论语》 | 重蹈覆辙 | 事故过账后 |
| 治未病 weibing（工） | 《黄帝内经》 | 带病开工 | t=0 体检 |
| **九变 jiubian（足）** | **《孙子兵法》** | **势途脱钩：该变不变、没凭乱变** | **t>0 勘流审计 + 变方供给** |

**本愿不许变是正念的事，路径必须变是九变的事**——君命有所不受，不受的是途，不是目的地。

## 核心概念

- **势变**：世界说「不」的时刻——一条 `isError:true` 的结果，确定性提取，零 LLM；
- **四裁决**：每条势变恰有一个裁决——**变**（回去再察了 / 有据复核了）、**盲捶**（无再察的逐字重试）、**悬**（文件势变全程未归还，挂账点名不计分）、**离**（改途离场，涂有所不由，正当权利）；
- **失机值**（0–100）＝ 滞（盲捶链，首记免分，+12/记，cap 60）＋ 妄（游骑：悬账未清时连开 ≥3 个无凭新战线，+20/轮，cap 40）；分带 **合 0–14 / 钝 15–29 / 胶 ≥30**，门默认 30；
- **变方**：悬账出现时在接缝处供给的应变清单——逐字节确定，重放同流必得同文。

**只罚结构可证之罪**：悬账不计分、首盲免分、改途离场不记过——不惩罚正当改途，是本层的硬承诺。

## 快速开始

```bash
npm install        # 安装官方 @deepseek-ai/* 包（仅集成验证需要）
npm test           # 83 tests, 83 pass

# 验尸任何历史会话流（契约无关）：
node src/bin/jiubian.js audit <stream.jsonl>            # 失机值 + 分带 + 门禁（exit 0/1/2）
node src/bin/jiubian.js audit <stream.jsonl> --gate 20  # 更严的门
node src/bin/jiubian.js bianfang <stream.jsonl>         # 变方块（应变清单）
```

插件用法（宿主侧）：

```js
import jiubian from './src/plugin/jiubian.js'
ctx.plugin(jiubian, { gate: 30 })

// 运行中任意时刻：
ctx.jiubian.report()   // 观察数 / 势变数 / 前科 / 即时失机值
ctx.jiubian.shi()      // 逐条势账与裁决
ctx.jiubian.bianfang() // 变方块（逐字节确定，#k 递增）
ctx.jiubian.gate()     // 门禁裁决
```

## 验收

验收标准先于实现定稿于 [docs/04-acceptance.md](docs/04-acceptance.md)，夹具期望值（0 / 36 / 40 分）与跨项目互认（zhizhi、jiebi 流 → 8 调用 / 24 分 / 钝）全部**先于实现手算**，实测逐字吻合；**83 tests, 83 pass**（core 57 + cli 16 + 集成 10，真实 dsh-tools 管道）。选书映射见 [docs/01-book.md](docs/01-book.md)，问题与伪需求自检见 [docs/02-problem.md](docs/02-problem.md)，锁死的语义见 [docs/03-design.md](docs/03-design.md)。Agent 侧操作规程见 [SKILL.md](SKILL.md)。

## 方向边界（与后来者）

只做 t>0 的**势途对齐**审计与变方供给：勘流式，结构性零拦截（源码无 pre-execute 监听器）；不拦动作（zhizhi 地盘）、不审判断账本（jiebi 地盘）、不守本愿契约（zhengnian 地盘）、不记跨会话事故账（buer 地盘）、不做 t=0 开工体检（weibing 地盘）；契约无关（可验尸任何历史会话）；零 LLM、零网络、零 NLP——对象键是显式字段，不是语义抽取。

## 许可

MIT
