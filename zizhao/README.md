# 自照 · zizhao —— DeepSeek Harness 的失败弃责治理层

> 《贞观政要·卷二·论求谏第四》× Agent 失败弃责（护短无凭）
>
> 「**人欲自照，必须明镜**」「**明主思短而益善，暗主护短而永愚**」

agent 修完一单活写交付报告——「test_login 是历史遗留问题」「The flaky
failure is pre-existing and unrelated to this task」「auth 模块的报错
超出本次范围」——这些话通顺、专业、自带切割外观，可其中相当一部分，
**失败明明在场**（红测试/失败 exec 就挂在同一会话的流里），而 agent
没有出示任何基线凭据：没有 stash 掉自己的改动跑一遍基线证明「改动之
前它也红」，没有指向任务方的名分，弃完也没有回头修掉——明镜在手边
（基线对照是一条命令的事），它选择不照。隋炀帝「好自矜夸，护短拒谏」
——短处明明在场，一句话把它划出责任田；弃责也没有恶意，弃责只是没
有人逼它**出示照镜的形迹**。自照就是那个递镜子的。

- 它只判一件零 LLM 能确定性回答的事：**写下这句弃责之前，流里有没有
  照镜（基线对照）、册上有没有名分、弃后有没有更**；弃责的真伪
  （test_login 在任务开始前到底红不红）是语义判断，裁决权归人；
- **凡弃必凭**：红账（先于本笔的失败 exec × 对象词元）在场而无镜凭
  无名分 = 护短 **+30 单案即红**；镜凭（基线对照 exec 命中对象，成败
  皆算——基线照出的红恰是证据本身）清白；
- **弃而后更不入罪**：弃责之后自己把红修掉（思短而益善）只留注记；
  「没有历史遗留问题」（否定卫）是如实否述，整行不判；
- 只审**责面**（report/summary/retro/postmortem/handoff/复盘/报告/
  总结/纪要/交接 10 径形）——弃责宣告的当众之地是交付文书；演练之
  地（tests/scratch/drafts 等名段）与照册明言之径免审；沉默不提
  （只字不报失败）不审——本层只治主动弃责，沉默是另一病。

## 快速开始

```bash
npm install                      # devDependencies 供集成验证；CLI 本体零依赖
node src/bin/zizhao.js audit fixtures/huoduan-stream.jsonl; echo $?   # 1（单护短 30 红）
node src/bin/zizhao.js audit fixtures/mijing-stream.jsonl; echo $?    # 0（镜凭清白）
node src/bin/zizhao.js audit fixtures/sigeng-stream.jsonl; echo $?    # 0（思短注记）

npm test                         # 67 tests（core 37 + cli 16 + 真实管道集成 14）
```

CLI：

```bash
zizhao audit <s1.jsonl> [s2.jsonl …] [--file <照册>] [--gate n] [--json]
zizhao register --path <glob>    # 立免审（此径所弃之责有名分，重复去重）
zizhao revoke --path <glob>
zizhao list / block / gate --value <n>
```

## 结构

```
docs/01-book.md        选书：论求谏逐条映射
docs/02-problem.md     问题、价值与伪需求自检
docs/03-design.md      设计语义锁死（词法/通道/判定序/门禁/边界/既知代价）
docs/04-acceptance.md  验收标准（手算底稿先于实现）与实测记录
src/core/zexing.js     弃责词法：责面形/弃责形/否定卫/镜形/对象词元
src/core/hongzhang.js  红账引擎：责账·三通道·照值门禁（judge 幂等）
src/core/zhaopai.js    照牌块：接缝供给，逐字节确定
src/core/{stream,audit,zhaoce,object}.js  流解析/多流合审/照册/对象族
src/plugin/zizhao.js   Cordis 插件（tools/result 接缝，结构性零拦截）
fixtures/              手算底稿逐条对应的夹具流
```

## 与相邻层的边界

**责任光谱的正半轴层层有账，负半轴只有本层**：shihu 审完成态宣言
（「已完成」对作工）、licheng 审话语承诺、suliu 审归因之验（「根因
是」验没验）、xiaoyan 称绿之实——「这不是我弄坏的」（弃责宣告）无处
过账，本层接住。**「根因是历史遗留问题」一句两堂**：归因形命中
suliu、弃责形命中本层，词表零交集、两账并行。zhibi 审记录被洗
（`|| true`——红不出现），本层审红如实在场却被言说切割（红在而责不
在）；yidao 审红之后的拆锁（改代码），本层审红之后的弃责（改话术）。
全量边界与既知代价见 docs/03 §12–§13。

## 许可

MIT，见 [LICENSE](LICENSE)。
