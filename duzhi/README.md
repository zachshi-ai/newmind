# 度支 · Duzhi —— DeepSeek Harness 的量纲治理层

> 一门老思想，能不能精确地解决人工智能的一个真实问题？
>
> **《礼记·王制》× Agent 资源无账烧穿。** 每一次工具调用都是真实支出，时程一分一秒都在走表——但 Agent 任务从不在开工时领一条线：这单活值多少次调用、多少时长，无人声明；跑穿之后连「花了多少、该花多少、何时越的线」三问都无处问起。度支给 DeepSeek Harness 装上度支司：**制册**立线（冢宰制国用）、**用账**对总量（量入以为出）、**余量块**在接缝处供蓄支图（三年之蓄有刻度）、**制值**分带门禁（越界曰非）——账与闸分治，闸是知止的地盘。

## 病与方

| 病形 | 场景 | 度支的判定 |
|---|---|---|
| 无制开工 | 从没人说过这单活值多少——无线可越，故无越可言，烧穿无从谈起 | **无制 40**，一次性（治理发现，不是诬告；追认补线即可重判） |
| 调用跑穿 | 「小修」任务过夜跑穿 214 次调用，第 61 次起每笔都是越线支出 | 第 maxCalls+1 次起**逾案 +6/次**，cap 60 |
| 时程跑穿 | 45 分钟的活干了 3 小时 40 分，恰在线上与过线长得一样 | `at − 首at > maxMinutes×60000` **严格大于**即逾——恰在线上合法 |
| 有线无账 | 任务书写了「控制在 100 次内」，但没有任何东西对账——写了白写 | 制册即任务书的机器可读形态，完工流一次审计逐案点名 |
| 两线同越 | 调用与时长同时爆 | via `both`，一案计一次，不双罚 |
| 无时不判 | 老流没有 `at` | 时长维度诚实退化（spanMs null），调用维度照判——宁漏勿诬 |
| 守界 | 线内走完 | **0 分**——不冤枉守界的花销；值不值是判断，另有其主 |

## 快速开始

```bash
# 离线审计一条历史会话流（零依赖，Node ≥ 20）
node src/bin/duzhi.js audit  会话流.jsonl --register .duzhi.json   # 制值 + 分带 + 门禁（≥30 退出码 1）
node src/bin/duzhi.js block  会话流.jsonl --register .duzhi.json   # 余量块（接缝处供给件）
node src/bin/duzhi.js declare --max-calls 120 --max-minutes 45 --id fix-login   # 立册（补丁语义）
node src/bin/duzhi.js list                                          # 生效之线
node src/bin/duzhi.js audit 历史流.jsonl --max-calls 30             # 追认验尸：补线重放，越线几案立现

# 作为 Cordis 插件挂载
import { apply } from 'duzhi-dsh'
ctx.plugin(apply, { register: { id: 'fix-login', maxCalls: 120, maxMinutes: 45 } })
ctx.duzhi.report()   // 概数 + 制值 + 分带
ctx.duzhi.yuliang()  // 余量块（逐字节确定，#k 递增）
ctx.duzhi.gate()     // 门禁裁决
```

## 四件套

- **制册**：预算声明 `{version:1, id, budget:{maxCalls?, maxMinutes?}}`，至少一条线；声明权在任务方，Agent 无从自我发额度；CLI 旗标与册互补、同键覆盖；追认合法（线是新的，越线是硬数字）；
- **用账**：出 = 流内每一次工具调用（**含失败**——失败也花了钱）∧ 时程 = 末带 at 调用 − 首带 at 调用；逐调用判逾案（`{seq, ref, at, via: calls|time|both}`），两线同越一案计一次；
- **制值**：`(无制?40:0) + min(60, 6×逾案)`，分带 **足**(0–14)/急(15–29)/**非**(≥30)，门默认 30；
- **余量块**：逐字节确定的蓄支图（任/入/出/蓄/带/逾，shasum 可证）——运行中的 Agent 第一次能看见「还剩多少」。

## 边界（结构性，不是纪律性）

- 零拦截：插件源码无 pre-execute 监听（grep 可证 + 行为学测试）——只在 `tools/result` 结账，动作之闸是 zhizhi 的地盘；
- 量纲只有两个：调用数与时程——token 与货币不在流里，度支不假装能算钱；
- 契约无关：不需要开工契约，挂上即审，任何历史流离线可验尸（zhizhi/jiebi 夹具跨项目互认）；
- 与各层的边界逐层写死于 docs/03-design.md §10（weibing 管在场性、度支管对账性；jiubian/youya 审单案性质、度支只记总量；yuli 管灭失之险、度支管烧穿之费）。

## 验收（摘要，全表见 docs/04-acceptance.md）

| 项 | 实测 |
|---|---|
| 测试 | **67 tests, 67 pass, 0 fail, 0 skipped**（core 41 + cli 17 + 集成 9，集成全部在真实 cordis+dsh-tools 管道运行） |
| 五夹具手算 | fenced 0/足 exit 0 · overrun 30/非 exit 1 · overtime 12/足 exit 0（--gate 10 → 1）· unbounded 40/非 exit 1（追认 4→12/足、3→18/急）· untimed 0/足 exit 0 |
| 跨项目互认 | zhizhi sample 流 8 调用 → 40/非 exit 1；zhibi hollow 流 3 调用 → 40/非 exit 1 |
| 余量块 | 同状态两跑 shasum 同值 `03c682ce…`；#k 递增仅首行不同；无时间戳 |
| grep 门 | 他层机制词表无输出；模型无关（零 LLM/网络/子进程）无输出 |

## 目录

```
duzhi/
├── docs/          01 选书 · 02 问题 · 03 设计 · 04 验收（先于实现定稿）
├── fixtures/      五夹具（流 + 制册，期望值手算锁死）
├── src/core/      stream 流解析 · register 制册 · ledger 用账 · audit 审计 · block 余量块
├── src/plugin/    Cordis 插件（结构性零拦截）
├── src/bin/       duzhi CLI（audit/block/declare/list/gate）
└── test/          core + cli + integration.dsh（真实管道）
```

## 许可

MIT。
