# 扫屋 · saowu —— DeepSeek Harness 的调试残迹治理

> **「一室之不治，何以天下家国为？」——清·刘蓉《习惯说》**
> **「大丈夫处世，当埽除天下，安事一室乎！」——《后汉书·陈蕃传》**

agent 修 bug 时撒下的调试探针——`console.log("DEBUG: here")`、`debugger;`、
`breakpoint()`、`binding.pry`、`set -x`——问题修完，探针全数留场，任务照常
宣布完成。这不是功能的缺失（测试绿、功能对），是**收拾的缺失**；而且代价
不在「难看」：`debugger;` 落进生产前端浏览器当场挂死，`breakpoint()`
（PEP 553）阻塞服务进程，带标记的打印把内部中间态写进生产日志。lint 工具
链早造好了扫帚（ESLint `no-console`/`no-debugger`、RuboCop `Lint/Debugger`、
pre-commit 官方 **debug-statements** hook——业界对此病的结构性招供），但
「当时撒没撒、末卷还剩没剩」只发生在会话流内，任何仓库快照工具都回不到
那个时刻。

**扫屋**给 DeepSeek Harness 装上第三十六个能力类型：**巡扫式插件**（结构性
零拦截）+ 零依赖审计 CLI + Agent Skill。它不拦写（账与闸分治，拦是知止的
地盘）、不做语义判断（不判这个 log 是不是故意的——正当之留归任务方的留册
明言），只做词法可证的三问：**撒了什么、末卷还剩什么、剩的那几处是不是
留册上明言的正当之留**——落笔入账（帚账唯写）→ 扫末卷，一处一行。

## 快速开始

```bash
cd your-repo
npm install github:zachshi-ai/newmind#saowu-dsh    # 或复制本目录

# 开工（可选）：立留册——任务本就是写 CLI/dev 脚本先许留
saowu register --path "scripts/*"                  # 许留授权（* 跨目录）

# 收工：扫垢
saowu audit session.jsonl --file .saowu.json       # exit 0 通过 / 1 门禁红 / 2 用法错
saowu audit s1.jsonl s2.jsonl --json               # 多会话合审
saowu block --file .saowu.json                     # 帚牌块：留册与案账公示（逐字节确定）
```

无册照扫：不立册也审——无册 = 全扫，正当之留必须明言，裁定权在任务方。

## 判定语义（docs/03 锁死）

**帚账唯写**（无默认径表，凡 `p:` 径皆受审）：write 族成功 ∧ `args.content`
非空 → 帚账（每径**末笔帚账 = 末卷**，扫末卷出案）；content 缺失只留无文
之痕（帚账不前的凭据）；观察不入账（读取不撒垢）；`isError=true` 不入账；
exec 是黑盒。

**垢形词法**（零 LLM，一处 = 一行，针优先于屑）：

- **遗针族 10 形**（调试原语——生产必炸或必然是调试遗物）：`debugger`
  （行首）、`breakpoint(`、`pdb|ipdb|pudb.set_trace(`、`import pdb`（行首）、
  `from pdb import`（行首）、`binding.pry|irb|remote_pry`、`byebug`（行首）、
  `dbg!(`、`set -x|set -o xtrace`（行首）、`console.trace(`；
- **遗屑两路**：打印原语 12（console.log/info/debug/warn、print、printf、
  pprint、echo、puts、println!、System.out.print、alert——`console.error`
  与 `logger.*` 不在表，错误导出与结构化日志正当）× 标记形 9（DEBUG/DBG/
  HERE/XXX/TODO 大写词界、`>>>`、`###`、`====`）同行共现；探针注释形
  `// debug:`/`# debug:` 独立在场；
- 册 forms 增形（须命名捕获组）；`noDefaults` 可关默认表。

**判定序**（每径）：留册 retain ∪ 试验场名段（tests/spec/fixtures/mocks/
debug 正则形 10）→ 立案前豁免；无带文之写 → 静默（帚不入黑盒）；扫末卷
→ 逐处立案；先前帚账命中而末卷净 → **已扫**注记（取土平之，净向 0 分）；
末卷之后有无文之痕 → **帚账不前**注记（案照出，账止于末卷）。

| 案 | 判定 | 分值 |
|----|------|------|
| **遗针** | 末卷含调试原语形 | +30/处 cap 60，**单针即红**（生产必炸，一眼可断） |
| **遗屑** | 原语 × 标记共现 ∪ 探针注释形 | +15/处 cap 40，**双屑即红**（一处是失手，两处是积习） |
| **已扫** | 先撒后扫，末卷净 | 0（注记——净向不罚） |
| **帚账不前** | 末卷后有无文之写 | 0（注记，诚实沉默） |

**垢值** = min(60, 30 × 遗针) + min(40, 15 × 遗屑)。分带**洁 0–14 / 蒙 15–29 /
垢 ≥30**，门默认 30：单屑 15 落蒙带，黄牌点名不咬门（宁可放过，不错罚
正当输出）。

有声 0 分、许留在册免案。

**帚牌块**（接缝供给）：留册公示 + 案账清点 + 逐处点名（径、行、形名），
永不携带任何行原文——掩码是结构性保证；同输入两次渲染逐字节相同
（shasum 可证）。

## 与既立各层的边界（结构性）

- **防川**（一删一留）：它审报错之口被堵（湮形——错误被删掉），本层审
  调试之声留场（垢形——探针被留下）；`catch (e) { console.log("DEBUG",
  e) }` 在它账上是导出清白、在本层是遗屑案，两账并记正交互证；
- **舍筏**（一筏一针）：它审文件级筏形（`scratch/`、`.bak` 整个文件的
  归宿），本层审行内垢形（正式代码里的一行探针）——`scratch/repro.js`
  归它、`src/auth.js:12` 的 `debugger;` 归本层；
- **乡校**（一压一撒）：它审批评通道被静音（@ts-ignore——写「闭嘴」），
  本层审调试通道在撒声（console.log——写「放声」），两默认形表零交集。

## 测试

```bash
npm install && npm test
```

71 tests（core 35 + cli 26 + 真实管道集成 10），全部零 LLM、零网络、
零子进程、零文件系统探测；集成测试挂载 npm 官方 `@deepseek-ai/cordis` +
`@deepseek-ai/dsh-tools` 真实工具管道，`exportStream()` 导出流离线重放
账实一致。复现命令见 docs/04-acceptance.md。

## 文档

- [docs/01-book.md](docs/01-book.md) —— 选书：扫屋一室之治的逐条映射
- [docs/02-problem.md](docs/02-problem.md) —— 问题：Agent 调试残迹留场
- [docs/03-design.md](docs/03-design.md) —— 设计语义锁死
- [docs/04-acceptance.md](docs/04-acceptance.md) —— 验收标准（先于实现）与实测
- [SKILL.md](SKILL.md) —— Agent 协作协议（留册/已扫协议）

## 许可

MIT（见 package.json）。
