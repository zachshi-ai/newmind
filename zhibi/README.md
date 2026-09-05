# 直笔 · Zhibi —— DeepSeek Harness 的记录保真层

> 一门老思想，能不能精确地解决人工智能的一个真实问题？
>
> **《春秋》× Agent 失败隐匿洗白。** 书法不隐：失败性命令上落一个讳形（`|| true`、`set +e`、`&>/dev/null`、`--passWithNoTests`），失败就被洗成了绿色，下游与收工报告立在假绿上。直笔给 DeepSeek Harness 装上秉笔史官：史事逐案判**讳笔/空绿/诚红/试笔/豁笔**，**讳值**分带门禁，**实录块**在接缝处把每一笔曲笔当面点名——尺直笔曲，绿照样是假的。

## 病与方

| 病形 | 场景 | 直笔的判定 |
|---|---|---|
| 空绿收工 | `npm test` 红了救不回，写成 `npm test \|\| true`，此后再无真判，收工报告「全量通过」 | 族末讳笔 → **空绿案 +30/族**，门禁红灯 |
| 弛禁连环 | `set +e; make all; npm run test` 一顶帽子洗一族，多族同洗 | 一案多族逐族记账，双族即 60 |
| 塞目 | `make all &>/dev/null \|\| true`，输出通道齐毁，transcript 上无迹可读 | 塞目形 + 吞真形同案点名 |
| 已赎讳笔 | 讳笔落账后同族真判已还 | **讳笔案 +10**（书已曲过，但不空绿） |
| 诚红 | 末笔干净见红，无讳形 | 0 分——红而不讳，笔直 |
| 试笔 | `\|\| true` 没洗动、失败仍见红 | 0 分——讳而未成，信以传信 |
| 豁笔 | 任务方显式声明豁免词 | 0 分——声明权在任务方 |

## 快速开始

```bash
# 离线审计一条历史会话流（零依赖，Node ≥ 20）
node src/bin/zhibi.js audit  会话流.jsonl          # 讳值 + 分带 + 门禁（≥30 退出码 1）
node src/bin/zhibi.js block  会话流.jsonl          # 实录块（接缝处供给件）
node src/bin/zhibi.js list                         # 生效笔册
node src/bin/zhibi.js enroll --excuse smoke-optional   # 登记豁免词（只增不删）
node src/bin/zhibi.js audit 会话流.jsonl --excuse smoke-optional

# 作为 Cordis 插件挂载
import { apply } from 'zhibi-dsh'
ctx.plugin(apply, { gate: 30, excuses: ['smoke-optional'] })
ctx.zhibi.report()   // 概数 + 讳值 + 分带
ctx.zhibi.shilu()    // 实录块（逐字节确定，#k 递增）
ctx.zhibi.gate()     // 门禁裁决
```

## 四件套

- **笔册**：史词族表（12 默认 + 显式正则）× 讳形表（6 默认形 + 显式正则）× 豁免词（纯显式）——声明权在任务方，只增不删；
- **笔账**：史事（exec 族 ∧ 史词命中）逐案结算，判定序锁死：豁免 > 失败侧 > 讳形；族内先后只用**流内序列**（无时之流全判）；
- **讳值**：`min(30, 10×已赎讳笔) + min(60, 30×空绿族)`，分带 素(0–14)/讳(15–29)/诬(≥30)，门默认 30——一空绿即诬，三赎亦讳；
- **实录块**：逐字节确定的族末清单与讳笔点名，摘录经掩码映射（骑缝不漏凭据）。

## 边界（结构性，不是纪律性）

结构性零拦截（插件无 pre-execute 监听器）；不读文件内容（产物层的 `except: pass` 不是本层对象）；零 LLM、零网络、零子进程；契约无关、可验尸任何历史会话。与十二层的逐条边界见 [docs/03-design.md §11](docs/03-design.md)。

## 文档

- [01 · 选书：《春秋》](docs/01-book.md) —— 书法不隐 / 一字之贬 / 讳而可读 / 常事不书
- [02 · 问题定义](docs/02-problem.md) —— 四场景 + 反事实 + 伪需求自检
- [03 · 设计](docs/03-design.md) —— 笔册 / 史事 / 讳形 / 族末状态机 / 讳值 / 实录块
- [04 · 验收标准与实测结果](docs/04-acceptance.md) —— 验收先于实现，逐项绑定复现命令

## 测试

```bash
npm install && npm test   # core + cli + 真实 cordis 管道集成
```

## 许可

MIT
