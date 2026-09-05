# 终始 · Zhongshi —— DeepSeek Harness 的记程层

> 物有本末，**事有终始**，**知所先后**，则近道矣。——《大学》

**不拦做事，只问每件事走到哪**：任务书里立了 12 件事，Agent 埋头做完 7 件就宣布完成——没做的 5 件在两万行 transcript 里一次都没被碰过（**幽项**），做了一半撂下的没人提（**半途**），宣布「完成」之后手还在改的更没人对过序（**空终**）；会话中断后续跑，「每件事到哪了」没有一张图。终始给 DeepSeek Harness 装上**众事的行程账**：**事册**立事、**程账**逐项记账、**案别**末笔定案、**先后账**审立序、**程值**分带门禁、**程账块**就是中断续跑的交接班记录——「第 3 件事做完了吗、第 7 件事开过工吗」从通读全流人肉比对，变成账上逐事可问。

- 谁的问题：在 DeepSeek Harness（或任何 Cordis 架构运行时）上**委派多事项长任务**的工程师与团队，以及需要中断续跑交接、给会话设 CI 门禁的平台方
- 什么问题：todo 列表是自愿式的、收工报告是自我叙事式的——「靡不有初，鲜克有终」（《诗经·大雅·荡》）在 Agent 身上是机器版的精确复刻：开头的效率惊人，收尾的账无人查过；十五层治理里没有任何一层记过「立了的事各自走到哪」
- 价值：幽项/半途/空终三个罪名第一次有了确定性定义与逐案账目；程值 0–100 分带门禁（近道/鲜终/无终，单幽项即红）；程账块（逐字节确定，shasum 可证）让中断恢复从「重构现场」变成「读一张表」；**追认合法**——对历史流补册重放即见当年的漏项

完整生命周期文档：[选书](docs/01-book.md) · [问题](docs/02-problem.md) · [设计](docs/03-design.md) · [验收](docs/04-acceptance.md)

## 机制一分钟

| 件 | 是什么 |
|----|--------|
| 事册 | 任务方声明权（`.zhongshi.json`）：items 逐事登记（id/name/aliases/**terminal 终形**/**abandon 弃形**）∪ order 显式立序对；enroll 按 id 并集去重、只增不删；**无册不判**——册外之事不审，攀缘归正念 |
| 作工面 | 观察 ∪ 写 ∪ 执行族全记（查即始：grep 项词、读项径都是开工之迹）；**todo 族显式排除**——todo 工具参数里天然全是项词，计作工则立册即全始、幽项永不可判 |
| 分类序 | 弃形 > 终形 > 作工（显式的言压过隐默的迹）；一调用可并行结账多项；失败调用亦记作工（试错也是始——宁纵方向） |
| 案别 | 末笔定案：**幽项**（全流无迹 +30/项 cap60）/ **半途**（末为作工 +15/项 cap30）/ **有终**（终言在末，0 分）/ **有弃**（弃言在末，0 分点名）；**空终**=终言后复作工，逐案 +20 cap40——终被自己的手推翻，罪加一等；未宣终形之项不得认终（无凭之终不认） |
| 先后账 | order [A,B] 失序 ⟺ B 首作工早于 A 首终（+10/处 cap30）；**A 无终不判**——不让 B 代 A 受罚 |
| 程值 | 四轴合计 cap 100；分带 **近道(0–14) / 鲜终(15–29) / 无终(≥30)**；门默认 30——单幽项即红（全流无迹是唯一不可能冤枉的罪名），单半途/单空终记账不拦门 |
| 程账块 | 接缝处逐字节确定的续跑图：逐事一行（案别 + 始末序号）、空终与失序点名；牌是镜子不是法官——只公示每事到哪，shasum 可证 |

## 快速开始

```bash
cd zhongshi
npm install                  # 仅集成测试需要官方 @deepseek-ai/* 包；核心与 CLI 零依赖
npm test                     # 68 tests 全绿（core 44 + cli 14 + 真实管道集成 10）

# 立事册（开工一次；追认合法——对历史流补册重放即见漏项）
node src/bin/zhongshi.js enroll --item '{"id":"T1","name":"重复扣款修复","aliases":["dedupe"],"terminal":["test dedupe"]}'
node src/bin/zhongshi.js list

# 验尸任何历史会话流（契约无关；多流按参序拼接 = 中断续跑）
node src/bin/zhongshi.js audit <stream.jsonl>… --register .zhongshi.json   # 程值 + 分带 + 门禁（≥30 无终 → exit 1）
node src/bin/zhongshi.js ledger <stream.jsonl>…                            # 逐事清单（幽项/半途/有终/有弃 + 空终 + 失序）
node src/bin/zhongshi.js kuai <stream1.jsonl> <stream2.jsonl>              # 程账块（续跑图）

# 三组夹具（期望值先于实现手算，见 docs/04）
node src/bin/zhongshi.js audit fixtures/silent-stream.jsonl --register fixtures/silent.zhongshi.json                        # 75（无终）exit 1——静默漏项 2 + 半途 1
node src/bin/zhongshi.js audit fixtures/washed-stream.jsonl --register fixtures/washed.zhongshi.json                        # 60（无终）exit 1——空终 1 + 半途 2 + 失序 1
node src/bin/zhongshi.js audit fixtures/fenced-part1.jsonl --register fixtures/fenced.zhongshi.json                         # 45（无终）exit 1——真中断就该红
node src/bin/zhongshi.js audit fixtures/fenced-part1.jsonl fixtures/fenced-part2.jsonl --register fixtures/fenced.zhongshi.json  # 0（近道）exit 0——跨会话账平
node src/bin/zhongshi.js kuai fixtures/fenced-part1.jsonl fixtures/fenced-part2.jsonl --register fixtures/fenced.zhongshi.json   # 续跑图：T1 始#1（上一班）终#4（这一班）
```

作为 Cordis 插件挂载：

```js
import zhongshi from './src/plugin/zhongshi.js'
ctx.plugin(zhongshi, {
  gate: 30,
  items: [{ id: 'T1', name: '重复扣款修复', aliases: ['dedupe'], terminal: ['test dedupe'] }],
  order: [['T1', 'T2']],
})

ctx.zhongshi.report()       // { totals, score, band, gate }
ctx.zhongshi.chengzhang()   // 程账逐事清单 + 空终 + 失序
ctx.zhongshi.chengkuai()    // 程账块（逐字节确定，#k 递增）——宿主在接缝处注入即得续跑图
ctx.zhongshi.gate()         // { score, verdict, ok }
ctx.zhongshi.exportStream() // 导出流 → zhongshi audit 离线重放对账
```

## 与十六层的边界

只审「任务方立下的事 → 流里的终始行程」：事册 + 程账 + 案别 + 先后账 + 程值门禁 + 程账块供给；**结构性零拦截**（插件不存在 pre-execute 监听器——动作拦截是 zhizhi 地盘）；不守**一愿**（正念地盘——愿是一，事是多：anchors 守本愿在场，程账记众事行程，agent 可以毫无漂移而漏三事，也可以逐事做完而早已攀缘）；不追**自诺**（立诚地盘——诺在话语里，事在册上：agent 从没承诺过的任务书之项，立诚看不见，终始照记）；不量**总量**（度支地盘——总账不分项，分项不计总）；不体检任务书形状（治未病地盘——t=0 看条款写没写，t>0 看众事走没走到）；不审判断账本（解蔽地盘——幽项静默到连「宣称」都没有，以宣称对象的层全看不见）；不管失败后的改途（九变地盘——改途应不应发是它的事，走到没走到是本层的事）；不巡见闻重复（有涯地盘）、不审输入权威（论世地盘）、不封写域（定分地盘）、不称出境（捭阖地盘）、不判红绿真伪（直笔地盘）、不审退路（豫立地盘）、不审权柄（二柄地盘）、不审量尺（法仪地盘）、不记教训（不贰地盘）。事册是显式词法（零 LLM），大小写归一子串匹配——宁可放过不可错罚：失败调用亦记作工、A 无终不判失序、册外之事不审、时序以流序为准（缺 at 照判）。

## 诚实边界

1. 流里没发生的作工账上看不见，册上没立的事不审（带外通道与册外世界是流审计各层的共同边界）；
2. 词面之粗：无关路径恰含项词会**伪始**（错在宽侧——把幽项错记成半途是宁纵方向）；项词字面全异的真作工会漏（别名可补）；项词之间的字面包含关系是册方之责；
3. 终形是认终的唯一凭据：未宣终形之项做再多也只能记至「行」——逼的不是 agent，是册方把「怎样算完」说出口；
4. 词法可欺：把项词/终形词故意塞进无关调用可以伪始伪终——确定性词法的保证是可审计可重放可门禁，不是不可欺；骗一次，账上留一次形；
5. 程值 0 不是完成保证：只说明册上每事账面有终有据；终形定得对不对，是任务方与量尺诸层的事。

## 许可

MIT。
