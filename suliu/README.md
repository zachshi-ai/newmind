# 溯流 · suliu —— DeepSeek Harness 的因果臆断治理层

> 《阅微草堂笔记·姑妄听之二》河中石兽 × Agent 归因无验（据理臆断）
>
> 「然则天下之事，但知其一，不知其二者多矣，**可据理臆断欤**？」

agent 修完一单活写复盘报告——「根因是缓存过期导致的数据不一致」
「The root cause is a race condition in the connection pool」——这些话
通顺、自信、有专业外观，可其中相当一部分，agent 从头到尾**没有对所断
言之因做过一次干预性验证**：没改过那个缓存配置再看错不失、没复现过
一次竞态、没做过一次对照——它读过几眼日志（看过现场），凭「一般的
系统都是这样坏」的先验之理推出了一个「确论」。讲学家看过现场、推理
无懈，唯独没挖开过一寸沙；假根因也没有恶意，假根因只是没有人逼它
**出示验证的形迹**。溯流就是那个逼问者。

- 它只判一件零 LLM 能确定性回答的事：**写下这句根因之前，流里有没有
  动过因、验过果的形迹**；因果的真伪（缓存到底过没过期）是语义判断，
  裁决权归人；
- **凡因必验**：验因三通道——拔验（动因 write ∧ 其后成功 exec 验果）
  清白；重演（果词 × 疑因同笔 ≥2 笔）与勘验（看过现场）只算望档
  **+15 黄牌——看过 ≠ 验过**；三通道全无 = 臆断 **+30 单案即红**；
- **疑而后言不入罪**：「根因可能是 X」（推词在场）只留显疑注记——
  臆断之罪不在断而在确；
- 只审**诊面**（postmortem/incident/rca/复盘/根因/排查/诊断等 14 径
  形）——归因断言的当众之地是诊断文书；演武之地（tests/scratch/
  drafts 等名段）与臆册明言之径免审。

## 快速开始

```bash
npm install                      # devDependencies 供集成验证；CLI 本体零依赖
node src/bin/suliu.js audit fixtures/yiduan-stream.jsonl; echo $?    # 1（单臆断 30 红）
node src/bin/suliu.js audit fixtures/bayan-stream.jsonl; echo $?     # 0（拔验清白）
node src/bin/suliu.js audit fixtures/kanyan-stream.jsonl; echo $?    # 0（望断 15 黄牌不咬门）

npm test                         # 65 tests（core 35 + cli 16 + 真实管道集成 14）
```

CLI：

```bash
suliu audit <s1.jsonl> [s2.jsonl …] [--file <臆册>] [--gate n] [--json]
suliu register --path <glob>     # 立免审（推演/草稿性质文书，重复去重）
suliu revoke --path <glob>
suliu list / block / gate --value <n>
```

## 结构

```
docs/01-book.md        选书：河中石兽逐条映射
docs/02-problem.md     问题、价值与伪需求自检
docs/03-design.md      设计语义锁死（词法/通道/判定序/门禁/边界/既知代价）
docs/04-acceptance.md  验收标准（手算底稿先于实现）与实测记录
src/core/guiyin.js     归因词法：诊面形/归因形/推词/指代形/果词/因面词元
src/core/yanyin.js     验因引擎：因账·三通道·臆值门禁（judge 幂等）
src/core/supai.js      溯牌块：接缝供给，逐字节确定
src/core/{stream,audit,yice,object}.js  流解析/多流合审/臆册/对象族
src/plugin/suliu.js    Cordis 插件（tools/result 接缝，结构性零拦截）
fixtures/              手算底稿逐条对应的夹具流
```

## 与相邻层的边界

**「看过」是 chachu 的清白线，是本层的黄牌线**：察传审断言之**物**
进没进流（存在性——目见即清白），本层审归因之**因**验没验（因果性
——看过现场只算勘验望档，拔验才清白）；词表零交集、谓词正交。同
理与 xiaoyan（成功成报）、jiubian（失败后行为）、shihu（状态陈报）、
jiaotuo（伪引）、zhixia（卷内自洽）各守一面——归因之验只有本层过堂。
全量边界与既知代价见 docs/03 §13–§14。

## 许可

MIT，见 [LICENSE](LICENSE)。
