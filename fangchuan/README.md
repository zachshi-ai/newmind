# 防川 · fangchuan —— DeepSeek Harness 的吞错形治理层

> **「防民之口，甚于防川。川壅而溃，伤人必多，民亦如之。是故为川者，决之使导；
> 为民者，宣之使言。」——《国语·周语上》**

#30 · newmind 老思想 × 新智能实验室。防川式插件（DeepSeek Harness 插件层的第三十一个能力类型）+ 零依赖审计 CLI + Agent Skill。

## 问题：Agent 吞错入码（运行期报错之口无账）

agent 写代码时，为了「这单活不炸」，把运行期的报错之口一只一只堵上：加载失败
`catch (e) { }`、校验异常 `except: pass`、网络失败 `.catch(() => null)`、
`catch { return; }`。测试是绿的（吞形不炸测试），任务宣告完成，代码上库——错误从
「报出来」变成「咽下去」，异常状态静默累积，炸点在下游，排障时连「当时错没错、
哪一行咽的」都无处问起（国人莫敢言，道路以目）。

乡校审**开发期**组织批评通道被静音（@ts-ignore/eslint-disable），运行期不在其形表；
直笔审**会话流内**命令记录被洗（`|| true`），交付代码内容不归它；法仪审**验收器**
（测试之尺的断言虚器），器外的交付代码不归它。运行期报错之口——三层的空白地。

## 机制（全部确定性，零 LLM）

- **湮形 6 形**（默认形表，无册照判）：空捕（`catch (e) { }`）、空还
  （`catch { return; }`）、空接（`.catch(() => null)` 等 4 写法）、单行空捕
  （`except: pass`）、多行空捕（except 体全为 pass/…/注释）、空救（Ruby 空 rescue）；
- **导词表 12 词**（决之使导）：体内有 console./throw/logger/print( 等即清白——
  日志、上抛、上报是导不是湮；`return null` 等降级决策不判（宁纵）；
- **码面豁免**：文档与数据后缀 10（.md/.json/.yml/…）+ `.min.` + `__snapshots__/`
  在立案前豁免——文档里的示例吞形是示例不是行为；
- **文账以末文为准**（考其末文）：湮案只看末笔带 content 之写——先前写过吞形后来
  改净的径是**已浚**不是湮（0 分注记）；edit 族无文之写不改末文（gauge 注记）；
  exec 重定向/cp/touch 落点文面不可见 → **沙川**注记；
- **川册纵列**（任务方声明，声明权全在任务方）：`indulge` glob 列——best-effort
  清理等「本该静默」之径免扫；无册 = 全扫（湮形是仓库的公共卫生）；
- **塞值** = min(60, 15×湮案数)；分带 **宣 0–14 / 淤 15–29 / 塞 ≥30**；门默认 30
  ——单湮案黄牌点名不咬门，两案即红；
- **导牌块**接缝供给：湮形公示 + 川册公示 + 案账清点 + 逐处点名（径:行:形），
  逐字节确定（shasum 可证），永不携带命中行原文。

## 快速开始（CLI）

```bash
cd your-repo
fangchuan register --path "src/best-effort/*"         # 本该静默的清理层，先立纵
# ……Agent 作业……
fangchuan audit session.jsonl --file .fangchuan.json  # 收工审川（exit 码可进 CI）
fangchuan block --file .fangchuan.json                # 导牌块：湮形与川册公示
```

- **无册照判**：不带册审计时湮形全护——6 形开箱在岗，册只管纵列一侧；
- **门禁**：塞值 ≥ 30 即红——两处吞形即红，单处黄牌点名；
- **改了就净**：吞形在后续写入中改净的径自动落已浚注记（考其末文，历史可见）。

## 插件（Cordis）

```js
import { fangchuan } from 'fangchuan-dsh'

app.plugin(fangchuan, {
  sessionId: 'session-1',
  book: { version: 1, indulge: ['src/best-effort/*'] }, // 川册（纵列授权）；null = 全扫
  gate: 30,
})

ctx.fangchuan.report()   // 汇总：观察数、径数、塞值、分带、门禁
ctx.fangchuan.ledger()   // 文账全文：逐径逐案（径/行/形/案别）
ctx.fangchuan.paizi()    // 导牌块（逐字节确定）
ctx.fangchuan.gate()     // 门禁裁决
ctx.fangchuan.exportStream() // 导出会话流，供 fangchuan audit 离线重放对账
```

结构性零拦截：源码里不存在 pre-execute 监听器，唯一挂载点是 `tools/result` 观察口——
观察永不反噬，失败探针也无条件到达工具本体。

## 与相邻各层的边界（结构性）

一声一川（乡校审开发期批评之声、防川审运行期错误之川），一笔一川（直笔审会话记录、
防川审交付代码），一器一川（法仪审验收器、防川审器外产物），一契一川（考诚考契上物、
防川扫全码面），一知一川（知行审会话里说了不做、防川审代码里错了不言），一门一川
（恒法审规矩源之授权、防川审码面之吞形）。全部 29 层的逐条边界见 `docs/03 §10`。

## 测试与文档

```bash
npm install && npm test    # 71 tests：core 41 + cli 20 + 集成 10（真实 cordis + dsh-tools 管道）
```

- `docs/01-book.md` 选书：《国语·周语上》逐条映射；
- `docs/02-problem.md` 场景、价值与伪需求自检；
- `docs/03-design.md` 设计语义锁死（含定标勘误与既知从宽代价）；
- `docs/04-acceptance.md` 验收标准（先于实现手算定死）与实测记录。

## 许可

MIT
