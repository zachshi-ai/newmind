# 水土 · Shuitu — Agent 协作协议

> **橘生淮南则为橘，生于淮北则为枳，叶徒相似，其实味不同。所以然者何？水土异也。**——《晏子春秋》
>
> `npm install -g`、`git config --global`、rc 文件里追的一行 export、`brew services start` 起的服务、crontab 里加的任务——全是改水土的手：每笔都真实落在共享机器上，任务宣告完成而水土全数留在那里。下一个会话（或明天的同款任务）在同一片水土上作业，绿灯照旧而行为已变——**叶徒相似，其实味不同**。本协议不禁止你改环境，它只要求每一笔常驻境变有归宿：要么复（卸/还原/停）、要么豁（土册明言）、要么上账承责——无凭据的悬改一律现形。

#26 · newmind 老思想 × 新智能实验室。察土式插件（DeepSeek Harness 插件层的第二十七个能力类型）+ 零依赖审计 CLI + Agent Skill。

## 问题：Agent 境变不复位

事后连「哪笔改动是谁在什么时候留下的、复位了没有」都无处问起：

- **舍筏（shefa）**管任务域内的**散物**（`scratch/`、`.bak`），边界行明言「本层管物」——机器的**常驻状态**是被让渡的；
- **豫立（yuli）**审**灭掉之前**有没有备，不管**改过之后**复位了没有；
- **度支（duzhi）**量花了几笔、**名实（mingshi）**核装的名有没有登记之实——都问不到「复位了没有」；
- `--break-system-packages`（PEP 668）与 `brew services list` 的存在本身，就是业界对这种病的结构性招供。

## 机制（全部确定性，零 LLM）

```
改动通道唯二：write 族 p: 径命中改径形 ∪ exec 三族词法（装形 17 ∪ 改词形 4 ∪ 驻形 9）
              ∪ exec 词面提取目标（重定向/tee/cp）命中改径形
判定序锁死：  豁（土册三列子串命中，立案前完全出账） > 复（基点后配对复位凭据） > 遗
复位凭据：    卸词×manager×包名（node 卸需 -g、pip 卸免 scope、版本尾饰两侧同剥）
              ∪ git config --unset / npm config delete / defaults delete
              ∪ services stop ∪ docker stop ∪ crontab -r ∪ kill 族 / rm（段首，全域从宽）
异值门禁：    reside=min(60,30×驻遗)+inst=min(30,15×装遗)+conf=min(30,15×改遗)，
              淮 0–14 / 移 15–29 / 枳 ≥30，门 30——单驻案即红、两装案或两改案即红
土牌供给：    土册公示 + 终局清点（逐字节确定），逐字节确定
```

- **清白道**：项目域安装天然白（`npm install` 无 `-g`）、仓库局部 git config 白、询值白（scope 后恰 1 词元是读）、`crontab -l` 白、`/dev/null` 弃物址白、basename 全等防 `src/profile/` 之诬、失败不入账、先卸后装不销案、单装案或单改案黄牌不咬门；
- 结构性零拦截：插件无 pre-execute 监听器，观察永不反噬；零网络、零子进程、零文件系统探测。

## 快速开始（CLI）

```bash
cd your-repo
shuitu register --install brew --reside redis   # 开工立土册：这单活授权哪些常驻改动（可附 --config）
# ……Agent 作业……
shuitu audit session.jsonl                      # 收工审土（exit 码可进 CI；无册照判）
shuitu audit session.jsonl --file .shuitu.json --json
shuitu block --file .shuitu.json                # 土牌块（可注入收尾上下文；逐字节确定）
shuitu gate --value 30                          # 门禁裁决（exit 0/1）
```

退出码：0 通过 / 1 门禁失败（异值 ≥ 门）/ 2 用法与输入错误。

## 插件（Cordis）

```js
import { Context } from '@deepseek-ai/cordis'
import dshTools from '@deepseek-ai/dsh-tools'
import shuitu from 'shuitu-dsh'

const ctx = new Context()
ctx.plugin(dshTools)
ctx.plugin(shuitu, { sessionId: 'demo', book: { version: 1, install: [], config: [], reside: [] } })

ctx.shuitu.report()     // 汇总：改动/案数/异值/分带/门禁
ctx.shuitu.gaizhang()   // 改账全文：逐案清点（key/族/归宿/会话）
ctx.shuitu.tupai()      // 土牌块（接缝供给，逐字节确定）
ctx.shuitu.gate()       // 门禁裁决
ctx.shuitu.exportStream() // 导出会话流，供 `shuitu audit` 离线重放对账
```

## 与相邻各层的边界（结构性）

知止拦动作、解蔽审判断、正念守意图、治未病体检开工、九变勘应变、有涯守见闻、论世审发令资格、定分裁写域、不贰记跨会话之训、捭阖守出境、法仪护尺、直笔保笔、豫立审备、度支量入、二柄审柄、终始记程、效验称实、名实核名、立诚结诺、稽疑稽问、乡校听声、知足量出、审曲审残全、舍筏审落物之宿、渊鱼审入目之禁；**水土审境变之复**——一物一境（舍筏）、一灭一改（豫立）、一入一改（渊鱼）、一名一境（名实，同一安装令两账并行）。

## 测试与文档

```bash
npm install && npm test    # 67 tests：core 44 + cli 14 + 真实 dsh-tools 管道集成 9
```

- [01 选书](docs/01-book.md) · [02 问题与伪需求自检](docs/02-problem.md) · [03 设计语义锁死](docs/03-design.md) · [04 验收标准与实测](docs/04-acceptance.md)

## 许可

MIT（见 package.json）。
