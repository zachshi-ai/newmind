# 察传 · chachu —— DeepSeek Harness 的无见立言治理

> 「夫得言不可以不察，數傳而白為黑，黑為白。」「聞而審則為福矣，
> 聞而不審，不若無聞矣。」——《吕氏春秋·慎行论·察传》

老思想 × 新智能实验室第 40 号项目：把《察传》的「得言必察」装进
DeepSeek Harness——agent 交付文书里的每一句平铺断言（「配置集中在
src/config.js」「测试位于 tests/e2e」），所指之物必须能追到流内之见
（读过、写过、跑过）；追不到就是**幻言**，门禁当众可断。

## 它治什么病

agent 写交付报告、交接书、README 时，一半的话不来自流内勘察而来自
模型先验想象：没读过 src/config.js 却说「配置集中在」、没列过 tests/e2e
却说「测试位于」、从没写过 logs/agent.log 却说「日志输出到」。文书
通顺自信，下游照着走第一脚踩空。jiaotuo 审引语对原文（要引号）、
shihu 审状态对作工（要状词）——**无引号的平铺断言，全仓无层过堂**。

| 档 | 判定 | 分值 |
|----|------|------|
| 幻言 | 得言形 + 径指物，流内无见据 | +30/案（单案即红） |
| 疑言 | 得言形 + 目录指物，无见据 | +15/案（单案黄牌） |
| 迟证 | 断言之笔在前，见据在后 | 注记 0 分 |
| 虚指 | 得言形而无所指 | 注记 0 分 |

见据三通道：**目见**（observe 成功）∪ **书见**（write 成功，含自指）∪
**验见**（exec 成功 ∧ 原文含指物），先于本笔为据；**基径**（证册
grounds，任务方明言）与**靶场**（tests/specs/fixtures 名段）立案前豁免；
模态门（应当/将把/TODO/will…）将来时不判。幻值分带：彰 0–14 / 疑
15–29 / 诞 ≥30，门默认 30。零 LLM、零网络、零子进程、零文件系统探测，
结构性零拦截（插件不存在 pre-execute 监听器）。

## 快速开始

```bash
npm install && npm test        # 65 tests（core 34 + cli 17 + 集成 14，真实 dsh-tools 管道）

node src/bin/chachu.js audit fixtures/huanyan-stream.jsonl; echo $?        # 1（双幻言 60 cap）
node src/bin/chachu.js audit fixtures/mujian-stream.jsonl; echo $?         # 0（目见在前）
node src/bin/chachu.js audit fixtures/yiyan-stream.jsonl; echo $?          # 0（疑言黄牌）
```

## CLI

```bash
chachu audit <s1.jsonl> [s2.jsonl …] [--file <证册>] [--gate n] [--json]
chachu register --path <glob> [--file <证册>]     # 立免审（重复去重）
chachu revoke --path <glob> [--file <证册>]
chachu list [--file <证册>]
chachu block [--file <证册>]                      # 证牌块（逐字节确定，shasum 可证）
chachu gate --value <n> [--gate n]
```

退出码：0 通过；1 门禁失败；2 用法/输入错误。无册照判（凡言必据）。

证册 `./.chachu.json`：

```json
{
  "version": 1,
  "excuse": ["docs/reports/*"],
  "grounds": ["src/config.js"]
}
```

`excuse` 免审稿径、`grounds` 基径（任务书已明言之物），声明权全在任务方；
grounds 直改册文件，register/revoke 管 excuse。

## 插件

```js
import chachu from './src/plugin/chachu.js'
ctx.plugin(chachu, { sessionId: 's1', book, gate: 30 })
ctx.chachu.report()   // 幻值与分带
ctx.chachu.ledger()   // 逐案逐注记
ctx.chachu.paizi()    // 证牌块
ctx.chachu.gate()     // 门禁裁决
ctx.chachu.exportStream()  // 导出流，供 chachu audit 离线重放
```

插件挂 `tools/result` 观察口：见据三通道记流内之见，write 稿面入传账；
观察异常吞掉、管道照常。单会话视图只采本会话，跨会话见据互证归
`chachu audit` 多流合审。

## 文档

- [docs/01-book.md](docs/01-book.md)——选书：《吕氏春秋·察传》逐条映射
- [docs/02-problem.md](docs/02-problem.md)——谁在什么场景下的什么问题、伪需求自检
- [docs/03-design.md](docs/03-design.md)——判定语义锁死（得言形/指物/见据/边界）
- [docs/04-acceptance.md](docs/04-acceptance.md)——验收标准与实测结果

## 边界（与相邻层）

市虎一状一证（状态陈报对作工）、矫托一托一证（引语对原文——引语不
避：所托之本不在流内时它给阙据注记、本层给幻言）、考诚一契一证、名
实一名一证、稽疑一问一证、youya 一重一证（同一笔目见它记费、本层作
据）、huashui 一鲜一证（物进过流之后变没变归它，进没进过归本层）。
跨会话教训归 buer。详见 docs/03 §11。

## 许可

MIT（见 [LICENSE](LICENSE)）。
