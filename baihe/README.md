# 捭阖 · Baihe —— DeepSeek Harness 的出域权界层

> 口者，心之门户也；心者，神之主也。志意、喜欲、思虑、智谋，皆由门户出入，故关之以捭阖，制之以开闭。——《鬼谷子·捭阖第一》

**物在手不罚，物出境才罚**：Agent 为了干活读 `.env`、读密钥文件是域内合法行为；但装载进来的敏感物在出境类调用里原样发往外部——密钥拼进第三方 URL、内部数据 POST 给陌生域——机关一开，物就收不回来了（《鬼谷子》叫「口者，机关也，所以关闭情意也」，OWASP 叫 LLM06 Sensitive Information Disclosure）。捭阖给 DeepSeek Harness 装上出域权界的账本：**阖籍**称量物、**境账**记出境、**溃值**分带门禁、**阖门块**逐案点名——泄密从「无人看见」变成「账上见」，处置从「全部轮换」变成「点名轮换」。

- 谁的问题：在 DeepSeek Harness（或任何 Cordis 架构运行时）上委派**会触碰外部世界**的长任务的工程师与安全负责人，以及给出境设 CI 门禁的平台方
- 什么问题：出境是瞬时单向的事，参数里的敏感物流向了哪个域——十层治理里没有任何一层的账本有字段承载它；想发现只能通读全量 transcript，最贵的处置是「全部密钥轮换」
- 价值：出境逐案入账（泄物/试出/内域档/合法出境四案别）、溃值 0–60 分带门禁（密/疏/溃）、阖门块掩码点名——与论世（lunshi，输入侧「物不僭主」）合拢成权界闭环：一进一出

完整生命周期文档：[选书](docs/01-book.md) · [问题](docs/02-problem.md) · [设计](docs/03-design.md) · [验收](docs/04-acceptance.md)

## 机制一分钟

| 件 | 是什么 |
|----|--------|
| 阖籍 | 物的清单 = **默认形表**（sk / 代码仓令牌 / 协作令牌 / 云钥 / 私钥头 / 承凭 / 敏感赋值七形，显式词法零语义）∪ **显式登记**（`--declare` 子串，声明权在任务方，只增不删）；`$VAR`/`${VAR}` 引用形天然不命中——**名出境不是物出境** |
| 境账 | 出境调用逐案记账：参数原文含 `http(s)://` 即出境候选（工具名无关），每案判**四案别**——泄物（成功∧外域∧命中，唯一计分）、试出（失败，点名不计分，宁漏勿诬）、内域档（回环/白名单，本职不计分）、合法出境（外域成功无命中，0 分） |
| 域别 | 对阳言依崇高，对阴言依卑小：回环五形（localhost / 127.* / 0.0.0.0 / ::1 / [::1]）恒为内域；`--allow` 白名单域相等或紧贴点子域（不误配 evil-a.com）；其余外域 |
| 溃值 | `min(60, 25 × 外域泄案数)`；分带 **密(0–14) / 疏(15–29) / 溃(≥30)**——阖贵密，疏者罅之始，溃者堤决物不可追；门默认 30 |
| 阖门块 | 接缝处逐字节确定的泄物点名（位次 + host + 形名 + **掩码摘录**，报告中永不出现物的原文——数据结构里就没有）；shasum 可证 |
| 报告不泄原物 | 命中结构（`weigh` 返回值）只有掩码与掩码摘录——下游想泄也无处可泄，结构性保证而非纪律性承诺 |

## 快速开始

```bash
cd baihe
npm install                  # 仅集成测试需要官方 @deepseek-ai/* 包；核心与 CLI 零依赖
npm test                     # 65 tests 全绿（core 38 + cli 17 + 真实管道集成 10）

# 验尸任何历史会话流（契约无关）
node src/bin/baihe.js audit <stream.jsonl>                                  # 溃值 + 分带 + 门禁（≥30 溃 → exit 1）
node src/bin/baihe.js audit <stream.jsonl> --allow api.internal.corp        # 声明内域白名单
node src/bin/baihe.js audit <stream.jsonl> --declare '内部片段' --gate 20    # 显式登记物 + 更严的门
node src/bin/baihe.js leaks <stream.jsonl>                                  # 逐案泄物清单（掩码）
node src/bin/baihe.js hemen <stream.jsonl>                                  # 阖门块

# 三夹具（期望值先于实现手算）
node src/bin/baihe.js audit fixtures/leaker-stream.jsonl --allow api.internal.corp  # 溃值 50（溃）exit 1
node src/bin/baihe.js audit fixtures/seep-stream.jsonl                              # 溃值 25（疏）exit 0
node src/bin/baihe.js audit fixtures/tight-stream.jsonl                             # 溃值 0（密）exit 0
```

作为 Cordis 插件挂载：

```js
import baihe from './src/plugin/baihe.js'
ctx.plugin(baihe, { gate: 30, allow: ['api.internal.corp'], declare: ['内部片段'] })

ctx.baihe.report()      // { totals, score, band, gate }
ctx.baihe.jingzhang()   // 境账逐案清单（泄物/试出/内域档/合法出境，掩码命中）
ctx.baihe.hemen()       // 阖门块（逐字节确定，#k 递增）
ctx.baihe.gate()        // { score, verdict, ok }
ctx.baihe.exportStream()// 导出流 → baihe audit 离线重放对账
```

## 与十层的边界

只审「出去的参数里有没有不该出的物」：阖籍 + 境账 + 溃值 + 阖门块供给；**结构性零拦截**（插件不存在 pre-execute 监听器——出境拦截是知止的地盘）；不审输入渠道发令资格（论世地盘——本层是镜子里的对面，一进一出）；不审判断账本（解蔽地盘）；不守本愿契约（正念地盘）；不做 t=0 体检（治未病地盘）；不管势途应变（九变地盘）；不巡见闻连续性（有涯地盘——装载根本不入账）；不记跨会话错误账（不贰地盘）；不结承诺之账（立诚地盘）；不裁并发之争（定分地盘）。形表是显式词法清单，不做语义判断（零 LLM）——宁漏勿诬：失败出境只点名、$VAR 引用天然豁免、内域本职不计分、无命中不虚报。

## 许可

MIT，见 [LICENSE](LICENSE)。
