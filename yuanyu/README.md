# 渊鱼 · yuanyu —— DeepSeek Harness 的入目之禁层

> **周谚有言：「察见渊鱼者不祥，智料隐匿者有殃。」——《列子·说符》**
>
> 深渊里有鱼，看见了，不是眼力好，是祸端开了头。Agent 调试鉴权失败时 `cat .env`、
> 探索仓库时翻 `~/.ssh`、开 `.npmrc`——每一眼都是真实的装载：密物进入上下文窗口与
> transcript，随之进入日志、归档、贴出去的会话记录、下游模型商的留存。
> **什么都没偷出去，但每一件都已经是既成事实。** 渊鱼不拦这一眼（拦是知止的地盘），
> 它让每一眼看进隐匿都留痕、有价、过门。

#25 · newmind 老思想 × 新智能实验室。察渊式插件（DeepSeek Harness 插件层的第二十六个能力类型）+ 零依赖审计 CLI + Agent Skill。

## 问题：敏感面装载失账

事后连「哪次装载、看了哪类密物、是不是本职」都无处问起：

- **捭阖（baihe）**管物的**出境**，其边界行明言「装载不入账，手里有物不罚」——入目侧是被显式让渡的；
- **论世（lunshi）**管输入的**发令资格**（注入），不管内容敏不敏感；
- **有涯（youya）**记装载是为抓**重读之费**，**审曲（shenqu）**称装载的**残全**——都不问「该不该看」。

仓库入库有 gitleaks 把守，会话入目侧没有任何账——本层补的就是这个真空档。

## 机制（全部确定性，零 LLM）

```
装载通道唯二：observe 族 p: 径命中秘形 ∪ exec 窥词法（段首窥词 + 词元命中）
判定序锁死：  白形（静默） > 本职（礼册 duty，0 分注记） > 涉视（+15/案，每径一案）
转运加重：    装载所得密值在更后的 write 内容 / exec 命令原文逐字重现 → +30/案（每源一案）
渊值门禁：    sight=min(45,15×涉视) + spread=min(60,30×转运)，澄 0–14 / 浊 15–29 / 渍 ≥30，门 30
鉴牌供给：    礼册公示 + 视账清点（指纹掩码，永不携带值原文），逐字节确定
```

- **默认白形 3**（`.env.example/.env.sample/.env.template`——模板无罪）、**默认秘形 20**（尾形 11 ∪ `.env` ∪ 目录形 `.aws/.ssh/.gnupg/.kube` ∪ 名形 `id_rsa` 等）、**默认窥词 17**（`cat/head/tail/less/more/strings/base64/xxd/grep/egrep/rg/awk/sed/zcat/vi/vim/nano`）——开箱在岗，无册照判；
- **礼册**（任务方声明，声明权在任务方）：`duty` 本职形（改鉴权就该看 `.env`——册上明言即清白）、`secrets/peeks` 显式扩充、`noDefaults` 关默认秘形；
- **礼册赦的是看，不是传**：本职装载之密值照样转运立案；
- **转运**（智料隐匿者有殃）：要值行形三态（`KEY=V`/`KEY: V`/`"KEY": "V"`）+ 要词表 8（TOKEN/SECRET/PASSWORD/PASSWD/KEY/CRED/PASS/PRIVATE）+ 值卫（http 排除、len ≥ 16）+ sdbm+djb2 指纹——报告只见 `fp:…(len N)`，结构性掩码；
- 结构性零拦截：插件无 pre-execute 监听器，观察永不反噬；零网络、零子进程、零文件系统探测。

## 快速开始（CLI）

```bash
cd your-repo
yuanyu register --duty .env              # 开工立礼册：这单活本职要看什么（可附 --secrets/--peeks）
# ……Agent 作业……
yuanyu audit session.jsonl               # 收工审目（exit 码可进 CI；无册照判）
yuanyu audit session.jsonl --file .yuanyu.json --json
yuanyu block --file .yuanyu.json         # 鉴牌块（可注入收尾上下文；逐字节确定）
yuanyu gate --value 30                   # 门禁裁决（exit 0/1）
```

退出码：0 通过 / 1 门禁失败（渊值 ≥ 门）/ 2 用法与输入错误。

## 插件（Cordis）

```js
import { Context } from '@deepseek-ai/cordis'
import dshTools from '@deepseek-ai/dsh-tools'
import yuanyu from 'yuanyu-dsh'

const ctx = new Context()
ctx.plugin(dshTools)
ctx.plugin(yuanyu, { sessionId: 'demo', book: { version: 1, duty: ['.env'], secrets: [], peeks: [], noDefaults: false } })

ctx.yuanyu.report()   // 汇总：装载/案数/渊值/分带/门禁
ctx.yuanyu.ledger()   // 视账全文：逐案清点（径/形/案别/转运指纹/会话）
ctx.yuanyu.paizi()    // 鉴牌块（接缝供给，逐字节确定）
ctx.yuanyu.gate()     // 门禁裁决
ctx.yuanyu.exportStream() // 导出会话流，供 `yuanyu audit` 离线重放对账
```

## 与相邻各层的边界（结构性）

知止拦动作、解蔽审判断、正念守意图、治未病体检开工、九变勘应变、有涯守见闻、论世审发令资格、定分裁写域、不贰记跨会话之训、捭阖守出境、法仪护尺、直笔保笔、豫立审备、度支量入、二柄审柄、终始记程、效验称实、名实核名、立诚结诺、稽疑稽问、乡校听声、知足量出、审曲审残全、舍筏审落物之宿；**渊鱼审入目之禁**——一出一入（捭阖）、一重一禁（有涯）、一残一秘（审曲）、账与闸分治（知止）。

## 测试与文档

```bash
npm install && npm test    # 67 tests：core 41 + cli 17 + 真实 dsh-tools 管道集成 9
```

- [01 选书](docs/01-book.md) · [02 问题与伪需求自检](docs/02-problem.md) · [03 设计语义锁死](docs/03-design.md) · [04 验收标准与实测](docs/04-acceptance.md)

## 许可

MIT（见 package.json）。
