# 考诚 · kaocheng —— DeepSeek Harness 的交付契约层

> **「物勒工名，以考其诚；工有不当，必行其罪，以穷其情。」——《吕氏春秋·孟冬纪》**
>
> 孟冬之月，百工呈验一年的成品：器物上刻着工匠之名，工师按度程逐件核验，
> 不合格的顺着名字找到那双手。agent 宣布完成时对着自选的证据（某条绿命令、一句「已完成」），
> 任务方真正要的**物**——那份报告、那个 JSON、那个文件——从未被对着契约考过：
> 物从未被写（幽物）、写了是空壳（壳物）、声明 JSON 拿到的是解析不了的假货（畸物）、
> 写完又被顺手删掉（灭物）。**考诚不拦手（拦是知止的地盘），它把契约勒在册上，让每一件物对契受考。**

#27 · newmind 老思想 × 新智能实验室。考诚式插件（DeepSeek Harness 插件层的第二十八个能力类型）+ 零依赖审计 CLI + Agent Skill。

## 问题：交付契约失账（功有不当无处考）

任务方把验收条款立成契约（哪些径、什么结形、必含哪些域与词、至少几行），收工宣告完成时没有任何机制把契约对着流内物之末据逐条考过：

- **终始（zhongshi）**记众事的**行程**（作工与终形的流内凭据）——「有终」的事可以交付幽物，它看不见物；
- **效验（xiaoyan）**称**成功信号的成色**——绿而实的会话照样可以交付畸物；
- **法仪（fayi）**审**验收器的曲直**——尺直物畸，绿灯照样架在错的物上；
- **治未病（weibing）**在 t=0 诊任务书**有没有**终验条款——立了契之后收工时**执行**契约是 t>0 的空档。

「契约对物之末据」全仓无账，本层补的就是这个空档——器物不勒工名，考核就是空谈；契约不对末据，完成就是自封。

## 机制（全部确定性，零 LLM）

```
工据唯二：    write 族 p: 径命中契径 ∪ exec 生产词法（cp/mv 末词元、tee/touch 词元、重定向目标）
灭据：        rm/unlink/rmdir/del/erase/trash/shred 词族 × 词元匹配（规整逐字 ∪ 宽 glob）
判定序锁死：  幽物(+30) > 工见未考(0) > 灭物(+30) > 账上无末态(0) > 壳物(+20) > 畸物(+30) > 疵物 > 诚物(0)
诚值门禁：    you=min(60,30×幽)+mie=min(60,30×灭)+ke=min(40,20×壳)+qi=min(60,30×畸)
              +fields=min(30,10×缺域)+words=min(15,5×缺词)+lines=min(20,10×短卷)
              诚 0–14 / 欠 15–29 / 欺 ≥30，门 30——单幽/灭/畸即红、单壳黄牌不咬门
考牌供给：    契册公示 + 物账清点（逐件点名，永不携带末据正文），逐字节确定
```

- **契册五条**（任务方声明，声明权全在任务方）：`path` 契径、`form` 结形（json/text）、`fields` 域条（仅 json）、`words` 词条、`minLines` 卷条；
- **无册不判**：audit 无册出 contractless 报告（0 分诚带 exit 0 + 治理发现注记）——契约是任务方的意图，引擎无从代拟；
- **六案别**：幽物（全流无工）、工见未考（exec 工据、结形黑盒沉默）、灭物（末笔写后遭毁）、账上无末态（老流无 content 诚实沉默）、壳物（末据空白）、畸物（声 json 而不可解析）、疵物（域/词/卷有缺）、诚物（全条款过）；
- **清白道**：观察不是工（读取不豁免契约）、失败之写非工（但物不在场照判幽物——契约考果不考勉）、写间灭据不判灭（考其末）、末据考末不考程（中程烂写末笔合格即诚物）、exec 无径词面不判（宁漏勿诬）、`2>&1` 天然不中重定向；
- 结构性零拦截：插件无 pre-execute 监听器，观察永不反噬；零网络、零子进程、零文件系统探测。

## 快速开始（CLI）

```bash
cd your-repo
kaocheng register --name 报告 --path docs/report.md --min-lines 3 --words 结论
kaocheng register --name 结果 --path out/result.json --form json --fields summary,count
# ……Agent 作业……
kaocheng audit session.jsonl --file .kaocheng.json    # 收工考物（exit 码可进 CI；无册不判）
kaocheng audit session.jsonl --file .kaocheng.json --json
kaocheng block --file .kaocheng.json                  # 考牌块（可注入收尾上下文；逐字节确定）
kaocheng gate --value 30                              # 门禁裁决（exit 0/1）
```

退出码：0 通过 / 1 门禁失败（诚值 ≥ 门）/ 2 用法与输入错误。

## 插件（Cordis）

```js
import { Context } from '@deepseek-ai/cordis'
import dshTools from '@deepseek-ai/dsh-tools'
import kaocheng from 'kaocheng-dsh'

const ctx = new Context()
ctx.plugin(dshTools)
ctx.plugin(kaocheng, {
  sessionId: 'demo',
  book: { version: 1, items: [{ name: '结果', path: 'out/result.json', form: 'json', fields: ['summary', 'count'] }] },
})

ctx.kaocheng.report()     // 汇总：案数/诚值/分带/门禁
ctx.kaocheng.ledger()     // 物账全文：逐件清点（契名/径/案别/缺什么/末据凭据）
ctx.kaocheng.paizi()      // 考牌块（接缝供给，逐字节确定）
ctx.kaocheng.gate()       // 门禁裁决
ctx.kaocheng.exportStream() // 导出会话流，供 `kaocheng audit` 离线重放对账
```

## 与相邻各层的边界（结构性）

知止拦动作、解蔽审判断、正念守意图、治未病体检开工、九变勘应变、有涯守见闻、论世审发令资格、定分裁写域、不贰记跨会话之训、捭阖守出境、法仪护尺、直笔保笔、豫立审备、度支量入、二柄审柄、终始记程、效验称实、名实核名、立诚结诺、稽疑稽问、乡校听声、知足量出、审曲审残全、舍筏审落物之宿、渊鱼审入目之禁、水土审境变之复；**考诚审交付之契**——一程一物（终始）、一报一物（效验）、一尺一物（法仪）、一诊一考（治未病）、一散一缺（舍筏）、一量一果（知足）、一诺一契（立诚）。

## 测试与文档

```bash
npm install && npm test    # 66 tests：core 38 + cli 18 + 真实 dsh-tools 管道集成 10
```

- [01 选书](docs/01-book.md) · [02 问题与伪需求自检](docs/02-problem.md) · [03 设计语义锁死](docs/03-design.md) · [04 验收标准与实测](docs/04-acceptance.md)

## 许可

MIT（见 package.json）。
