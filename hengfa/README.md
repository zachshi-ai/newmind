# 恒法 · hengfa —— DeepSeek Harness 的规矩源恒典层

> **「有生法，有守法，有法於法。夫生法者，君也；守法者，臣也。……法者不可不恒也，
> 存亡治乱之所以出。」——《管子·任法》**

#28 · newmind 老思想 × 新智能实验室。恒法式插件（DeepSeek Harness 插件层的第二十九个能力类型）+ 零依赖审计 CLI + Agent Skill。

## 问题：Agent 矫法自便（规矩源自改无账）

agent 干活时发现「照规矩这单活过不去」——lint 报错、strict 拦路、CI 红、AGENTS.md 碍事——
于是顺手改写仓库的**常驻规矩源**：关一条 eslint 规则、把 tsconfig 的 strict 放宽、删掉
workflow 里的检查步骤、改写约束自己的治理文书、甚至 `rm` 掉章程文件。这一单活绿了，
仓库的规矩却被这一单活改写了；下一单活、下一个会话继承松掉的规矩——「昨天严今天松」，
而「谁在何时动了规矩、任务方授没授权、动完复原了没有」三问全仓无账。

乡校审的是写进代码一行的静音指令（@ts-ignore），显式让渡了配置级静音（eslint 配置 off、
CI 删步骤「不判，宁纵勿诬」）；法仪审的是验收器（任务方器册登记的测试之尺）且只审翻红窗。
常驻规矩源的未授权改写——不问红绿、不问语义、凡改即案——是两层各自让渡出来的真空地带。

## 机制（全部确定性，零 LLM）

- **典形三族 25 形**（默认形表，无册照判、开箱在岗）：
  - **宪形 8**（治理文书）：`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.cursorrules`、
    `.windsurfrules`、`.clinerules`、`copilot-instructions.md` 单名 7 + `.cursor/rules/` 径前缀 1；
  - **禁形 4**（CI 流程）：`.github/workflows/` 前缀 ∧ `.yml|.yaml` 组合 1 +
    `.gitlab-ci.yml`、`Jenkinsfile`、`.drone.yml` 单名 3；
  - **章形 13**（检查章程）：`.eslintrc`、`eslint.config.`、`.prettierrc`、`prettier.config.`、
    `biome.json`、`tsconfig`、`.stylelintrc` 名前缀 7 + `.editorconfig`、
    `.pre-commit-config.yaml`、`.flake8`、`mypy.ini`、`ruff.toml`、`.ruff.toml` 单名 6。
- **改典通道唯三**：write 族 `p:` 径命中典形 ∪ exec 生产词法（cp/mv 末个非旗标词元、
  tee/touch 任一词元、重定向目标，`2>&1` 天然不中）∪ 灭词表
  （rm/unlink/rmdir/del/erase/trash/shred × 词元命中——灭典也是改典）；
  观察不是改（读规矩是守法不是立法）；失败之改不入账。
- **典册开门**（任务方声明，声明权全在任务方）：`open` glob 列——授权可改的规矩源免案；
  **无册 = 全护**（规矩是仓库的公共物，授权只能来自册——生法者君）。
- **每径一案、末笔定基点**；**复典据**只认 git 词面（`git revert` 全域、`git restore <径>`、
  `git checkout -- <径>`），基点时序保护——先复后改不销案；复典销案不销账（出账留注记）。
- **法值** = min(60,30×未复宪) + min(60,30×未复禁) + min(30,15×未复章)，封顶 100；
  分带 **恒 0–14 / 摇 15–29 / 篡 ≥30**；门默认 30——单宪案、单禁案即红，单章案黄牌点名不咬门。
- **法牌块**接缝供给：典形公示 + 典册公示 + 案账清点，逐字节确定（shasum 可证），
  永不携带写入内容原文。

## 快速开始（CLI）

```bash
cd your-repo
hengfa register --path "eslint.config.*"              # 任务要改章程？先立门
hengfa register --path ".github/workflows/deploy.yml"
# ……Agent 作业……
hengfa audit session.jsonl --file .hengfa.json        # 收工审法（exit 码可进 CI）
hengfa block --file .hengfa.json                      # 法牌块：典形与典册公示
```

- **无册照判**：不带册审计时典形全护——默认形开箱在岗，册只管开门；
- **开门要趁开工立**：任务正当改章程的路完全通畅，无门之改也不是罪，是账；
- **门禁**：法值 ≥ 30 即红——单宪案/单禁案即红，两章案即红，单章案（15）黄牌；
- **改了想干净**：`git revert` / `git restore <径>` / `git checkout -- <径>` 词面即复典出账
  （注记留痕，历史可见）。

## 插件（Cordis）

```js
import { hengfa } from 'hengfa-dsh'

app.plugin(hengfa, {
  sessionId: 'session-1',
  book: { version: 1, open: ['eslint.config.*'] }, // 典册（开门授权）；null = 全护
  gate: 30,
})

ctx.hengfa.report()   // 汇总：观察数、案数、法值、分带、门禁
ctx.hengfa.ledger()   // 案账全文：逐案（径/族/基点/复否）
ctx.hengfa.paizi()    // 法牌块（逐字节确定）
ctx.hengfa.gate()     // 门禁裁决
ctx.hengfa.exportStream() // 导出会话流，供 hengfa audit 离线重放对账
```

结构性零拦截：源码里不存在 pre-execute 监听器，唯一挂载点是 `tools/result` 观察口——
观察永不反噬，失败探针也无条件到达工具本体。

## 与相邻各层的边界（结构性）

一行一源（乡校审行内静音指令、让渡配置级），一尺一典（法仪审器册之尺的翻红窗），
一机器一仓库（水土审机器常驻态、恒法审仓库规矩源），一契一典（考诚考契约之物、
恒法记规矩源之变），一量一名分（知足量写之量、恒法记改典之名分，每径一案不数次数）。
全部 27 层的逐条边界见 `docs/03 §9`。

## 测试与文档

```bash
npm install && npm test    # 92 tests：core 58 + cli 24 + 集成 10（真实 cordis + dsh-tools 管道）
```

- `docs/01-book.md` 选书：《管子·任法》逐条映射；
- `docs/02-problem.md` 场景、价值与伪需求自检；
- `docs/03-design.md` 设计语义锁死（含定标勘误与既知从宽代价）；
- `docs/04-acceptance.md` 验收标准（先于实现手算定死）与实测记录。

## 许可

MIT
