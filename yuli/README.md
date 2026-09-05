# 豫立 · Yuli —— DeepSeek Harness 的行前定层

> 凡事豫则立，不豫则废：言前定则不跲，事前定则不困，**行前定则不疚**，道前定则不穷。——《礼记·中庸》

**不拦行险，只问退路**：Agent 会清理目录、会同步历史、会「顺手」删表——不可逆操作（`rm -rf`、`git push --force`、`git reset --hard`、`DROP TABLE`、`curl | sh`）落地的那一瞬之前，流里有没有留下任何退路（备份、存档、干跑），此前没有一层的账本有字段承载它。豫立给 DeepSeek Harness 装上**行前定的账本**：**险册**收险形、**备形**对退路、**案别**逐案记账、**险值**分带门禁、**豫牌块**裸险点名——「删了什么、删的时候有没有备」从灾后通读 transcript 才能发现，变成账上逐案可问。

- 谁的问题：在 DeepSeek Harness（或任何 Cordis 架构运行时）上委派**触碰真实文件、真实版本库、真实数据库**的长任务的工程师与团队，以及给 Agent 会话设 CI 门禁的平台方
- 什么问题：不可逆操作是瞬时单向的事——物已灭、史已断，退路若不在行前，就永远不在了；十三层治理里没有任何一层问过「行前备在不在」
- 价值：四族险形逐案入账（裸险/虚险/落款/有备）、险值 0–70 分带门禁（豫/跲/废）、豫牌块裸险点名；与主流的**审批制**（拦下危险操作等人批）互补——豫立给出**备案制**：行前留备即放行，有备者不疚，无备者入账

完整生命周期文档：[选书](docs/01-book.md) · [问题](docs/02-problem.md) · [设计](docs/03-design.md) · [验收](docs/04-acceptance.md)

## 机制一分钟

| 件 | 是什么 |
|----|--------|
| 险册 | 任务方声明权：`risk` 显式险词（比默认词表更懂自己环境）∪ `exempt` 款词（豁免不是关闸，是落款）；`.yuli.json` 并集去重、只增不删 |
| 险形 | 四族默认形表（显式词法零语义）：**灭迹**（rm -rf / find -delete / xargs rm / shred）、**断史**（force-push / reset --hard / clean -f / checkout-- / restore / branch -D）、**覆宗**（drop / truncate / delete from / docker volume）、**遁引**（curl/wget 管道入 sh）——单文件 `rm file` 不入账（宁漏勿诬） |
| 备形 | 行前之备的词法证据：**影写**（cp/rsync/tar/zip/dump，与险行**词法相交**——备过什么物赦什么物）、**存史**（commit/stash/tag/非强推 push，全族全局——受版本树庇护一荣俱荣）、**干跑**（`--dry-run` 之形、干 clean）、**布影**（dump/拷贝，词法相交）；clean -f 唯二途：在先干 clean 或相交之影——commit 不赦 clean（未追踪之物不在版本树内）；遁引与显式族**永缺备**——影存不住任意执行，唯落款可赦 |
| 案别 | 判定序锁死：虚险（未遂，0 分）> 干跑（无伤之形）> 落款（款词在）> 裸险（任一命中族缺备）> 有备（全族有备，0 分）；多族一调用一案不复利；孤儿按成功侧口径 |
| 险值 | `min(100, min(60, 30×默认裸险案) + min(30, 10×显式裸险件))`；分带 **豫(0–14) / 跳(15–29) / 废(≥30)**；门默认 30——单条默认族裸险即红（不可逆之灾不待第二案） |
| 豫牌块 | 接缝处逐字节确定的裸险点名（案序 + 族 + 摘录 ≤48 字符）；牌是镜子不是法官——只公示备在不在，不仲裁该不该删；shasum 可证 |

## 快速开始

```bash
cd yuli
npm install                  # 仅集成测试需要官方 @deepseek-ai/* 包；核心与 CLI 零依赖
npm test                     # 67 tests 全绿（core 40 + cli 17 + 真实管道集成 10）

# 验尸任何历史会话流（契约无关）
node src/bin/yuli.js audit <stream.jsonl>                       # 险值 + 分带 + 门禁（≥30 废 → exit 1）
node src/bin/yuli.js audit <stream.jsonl> --exempt reviewed-ok  # 款词生效（落款 0 分）
node src/bin/yuli.js audit <stream.jsonl> --risk 'kubectl delete' --gate 60  # 显式险词 + 更宽的门
node src/bin/yuli.js risks <stream.jsonl>                       # 逐案清单（裸险/虚险/落款/有备/干跑）
node src/bin/yuli.js yupai <stream.jsonl>                       # 豫牌块
node src/bin/yuli.js enroll --risk 'helm uninstall'             # 豫册并集去重、只增不删

# 三夹具（期望值先于实现手算，见 docs/04）
node src/bin/yuli.js audit fixtures/naked-stream.jsonl                       # 险值 60（废）exit 1
node src/bin/yuli.js audit fixtures/naked-stream.jsonl --risk 'kubectl delete'  # 险值 70（废）exit 1
node src/bin/yuli.js audit fixtures/netted-stream.jsonl --exempt reviewed-ok # 险值 0（豫）exit 0
node src/bin/yuli.js audit fixtures/netted-stream.jsonl                      # 险值 30（废）——遁引无款词即裸险
node src/bin/yuli.js audit fixtures/mixed-stream.jsonl                       # 险值 30（废）exit 1
```

作为 Cordis 插件挂载：

```js
import yuli from './src/plugin/yuli.js'
ctx.plugin(yuli, { gate: 30, risk: ['kubectl delete'], exempt: ['reviewed-ok'] })

ctx.yuli.report()       // { totals, score, band, gate }
ctx.yuli.yuzhang()      // 险账逐案清单（裸险/虚险/落款/有备/干跑）
ctx.yuli.yupai()        // 豫牌块（逐字节确定，#k 递增）
ctx.yuli.gate()         // { score, verdict, ok }
ctx.yuli.exportStream() // 导出流 → yuli audit 离线重放对账
```

## 与十四层的边界

只审「不可逆操作 → 行前退路」：险册 + 四族险形 + 备形对账 + 案别 + 险值门禁 + 豫牌块供给；**结构性零拦截**（插件不存在 pre-execute 监听器——动作拦截是 zhizhi 地盘，豫立是备案制不是审批制）；不审出境参数里的物（捭阖地盘——一毁一出，两只手）；不判红绿真伪（直笔地盘——直笔保记录之真，豫立以记录为信史、审记录里的事）；不审量尺之弯（法仪地盘）；不勘失败后的不改（九变地盘——一次成功的灭失同样是灾，九变看不见）；不守本愿（正念地盘）、不审判断（解蔽地盘）、不体检任务书（治未病地盘——治未病审 t=0 任务书之缺资，豫立审 t>0 险行退路之有无）、不巡见闻（有涯地盘）、不审输入发令资格（论世地盘）、不封写域（定分地盘）、不记教训（不贰地盘）、不追承诺（立诚地盘）。险形是显式词法（零 LLM）——宁可放过不可错罚：未遂只注记、单文件 rm 不入账、词表之外的险不入账、时序以流序为准（缺 at 照判）。

## 诚实边界

1. 流里没发生的破坏账上看不见（带外通道是流审计各层的共同边界）；
2. 影写/布影以**词法相交**定关系——备份内容是否完整可恢复是语义判断，零 LLM 下不做；
3. `isError=true` 的险行只记虚险——半伤（删到一半失败）不可辨，宁纵勿诬；
4. 险值 0 不是安全分：只说明账上无裸险，词表外的世界管不着——治已形之裸险，不测未形之险。

## 许可

MIT。
