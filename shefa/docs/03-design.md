# 03 · 设计：语义锁死

> 本文锁死全部判定语义。实现与本文冲突只能改实现；夹具期望（§10）先于实现手算定死，实现与手算冲突只能改实现，不得改期望。

## 1 · 流与会话（多流模型）

- 会话流 = JSONL，每行一个 JSON 事件；`#` 开头与空行为注释；坏行报行号（exit 2）。
- 多流合审：每个流文件是一个会话（会话 id = 文件名去扩展），合入同一引擎出统一判词；撞名 exit 2。
- 重放同一批流必得同一判词（置吏不收贿）；本层判定只用流内序列，不依赖时间戳（缺 `at` 照判）。

## 2 · 对象键与工具族（与 jiubian/dingfen/mingshi/xiangxiao/zhizu 同规，零 NLP）

- 对象键（按序取第一个命中）：`args.path` / `args.file_path` / `args.notebook_path`（字符串）→ `p:<值>`；`args.command`（字符串）→ `c:<trim>`；其余 → `n:<工具名>`。
- 工具族：观察（read/glob/grep/ls/cat/view 及含 read/grep/glob/list/search 子串）、写（write/edit/apply/create/move/remove 及含 write/edit/patch/insert/create 子串）、执行（bash/exec/run/shell/command 及含同名子串）、其他。
- 径规整：反斜杠归正斜杠、循环剥 `./` 前缀、剥尾 `/`——防同文件异写之诬。
- 本层不依赖 result content（与 zhizu 不同）：落物证据全在 p: 与 c: 词面，老流（无 content）照判。

## 3 · 筏册（`.shefa.json`）——归宿声明之册

```json
{ "version": 1, "keep": [], "raft": [], "roots": [], "noDefaults": false }
```

- **keep**：交付形/留存形（子串，大小写敏感）——命中者写前就是交付物，完全出账。声明权在任务方；CLI 旗标并集。
- **raft**：显式筏形（子串），与默认形表取并集（`noDefaults: true` 则只用显式）。
- **roots**：任务域界 glob——命中任一 root 即域内，否则域外。roots 空（无册/未声明）时回退系统区词形判域外：径以 `/tmp/`、`/var/`、`/private/var/`、`~/`、`/dev/`、`/etc/` 之一为前缀即域外，否则域内。
- **glob 语义**：`**` 跨 `/`，`*` 不跨 `/`，`?` 单字符；尾 `/` 视为目录前缀（`src/` ≡ `src/**`）；规整后匹配、大小写敏感。
- 默认筏形表 15 形（开箱在岗）：目录形 7——`tmp/`、`temp/`、`scratch/`、`sandbox/`、`draft/`、`wip/`、`debug/`；副本形 8——`backup`、`.bak`、`.tmp`、`.orig`、`.rej`、`.swp`、`.old`、`copy_of_`。
- 默认 keep 形 1 形：`/dev/null`（弃物址，天然白）。
- 无册照判：册缺失时默认形表照常在岗（xiangxiao 同规）；坏册报错（exit 2）。信任模型同 duzhi/zhizu：册是任务方签发，CLI 旗标是审计方口径（旗标 > 册 > 默认）。

## 4 · 落物与销案（判定序锁死，零 LLM）

### 4.1 落物通道（唯二）

- **write 族**：`isError !== true` 且 p: 径命中任一筏形 → 该径落物一笔。
- **exec 族**：`isError !== true` 且命令词面提取出的落物径命中任一筏形 → 该径落物一笔。词法（§4.2）。
- 观察族、其他族、n: 不透明对象：永不落物。失败（isError===true）一律不入账。

### 4.2 exec 落物词法（锁死）

- 命令文本按 `&&`、`||`、`;`、`|` 切段；段内空白切词元；词元剥成对引号。
- 段型判定（按段首词元的 basename）：
  - `cp` / `mv`：取最后一个非旗标词元为落物目标；
  - `tee` / `touch`：取其余全部非旗标词元为落物目标；
  - 其余段：重定向正则提取——`/(?:^|\s)[012&]*>{1,2}\s*([^\s;&|]+)/g` 的捕获组，目标形如 `&<数字>`（`2>&1`）的丢弃。
- 目标词元过滤：`-` 开头（旗标）丢；命中默认/显式 keep 丢（`/dev/null`）；规整后命中筏形 → 落物。
- 诚实边界：exec 词法是**词面账**——目标为目录时账面记目录径（`rm -r <径>` 词面可销）；不做文件系统语义、不展开 `~`、不探测存在性。

### 4.3 案模型：每径一案，末次落物定基点

- 筏账按规整径去重，**每径至多一案**：首落立案（记首落会话/序），后续同径落物只刷新**末落基点**（不另立案）。
- 归宿在收尾判定（judge 时对每案现算，幂等、不落账），判定序锁死 **舍 > 归 > 外逸 > 遗**（先删先赢：rm 是「物不在场」的最强信号，其后的 add 词面不动摇舍）：
  1. **舍**：末落基点之后存在成功 rm 形凭据——段内任一词元 ∈ {rm, rmdir, unlink}，且其余词元（规整后）与案径**逐字相等**或**glob 匹配**（`*` 匹配任意含 `/`，`?` 单字符）；或末落基点之后存在成功 `git clean` 凭据（全域销案）；
  2. **归**：末落基点之后存在成功 `git add` 凭据（词元匹配案径，同 rm 匹配法；段含 `git`+`add` 词元），且更后有成功 commit 凭据（段含 `git`+`commit` 词元）——add 是径的见证，commit 是收编的完成；
  3. **外逸**：舍归皆无，且案径在域外（§3 roots / 系统区回退）；
  4. **遗**：舍归皆无，且案径在域内。
- **全域舍凭据的说明**：`git clean` 的「舍」作用于全部在案疑筏而非单径（§4.3 第 1 条），宁纵方向——clean 的语义本就是全场清筏。
- **凭据时序保护**：凭据必须在末落基点**之后**（流序）——先删后写不销案（物又回来了）；凭据调用 `isError===true` 不算。

## 5 · 清白道（汇总）

1. **豁免在册**：keep 形（册 ∪ 旗标）命中 → 完全出账（不立案），注记每径一记；
2. **弃物址天然白**：`/dev/null` 默认 keep；
3. **非筏形不判**：径不含任何筏形 → 永不入账（交付径 `src/util.js` 天然沉默）；
4. **就地改写不判**：对既有径的非筏形写本就不入账（造新物才落筏；改写的量归知足）；
5. **exec 无径词面不判**：`npm test`、`npm install` 等无路径词面的调用天然沉默；
6. **失败不入账**：失败写未落盘、失败 rm 没删成，都不是事实；
7. **凭据时序保护**：先删后写不销案（§4.3）；
8. **老流照判**：本层不依赖 content（§2）；
9. **单案域内遗 15 分黄牌**：点名不门禁（宁纵勿诬）。

## 6 · 分值与分带门（锁死）

- `infield = min(30, 15 × 遗案)`；`exfield = min(60, 30 × 外逸案)`；`total = min(100, infield + exfield)`。
- 分带：**净 0–14 / 滞 15–29 / 积 ≥30**。门默认 30。
- 门禁分寸：单外逸（30）即红——域外的物一散就是灾；两案域内遗（30）即红；单案域内遗（15）落滞带点名不咬门。
- 中带可达性：单案域内遗 15 ∈ 滞带 ✓；外逸 + 域内遗 45 ✓。

## 7 · issues 行序（锁死）

外逸 → 遗筏 → 舍 → 归 → 豁免 → 净筏（无案时出「净筏」行）。

## 8 · 报告形状（CLI 与插件共用，锁定）

```json
{
  "sessions": 1, "calls": 5, "rafts": 3, "paths": 3, "cases": 3,
  "score": { "total": 60, "infield": 30, "exfield": 30 },
  "band": "积", "gate": 30, "verdict": "fail", "ok": false,
  "counts": { "dropped": 3, "removed": 0, "adopted": 0, "exempted": 0, "left": 2, "stray": 1 },
  "gauge": { "raftTop": [{ "path": "scratch/repro.js", "hits": 1 }] },
  "issues": ["…"]
}
```

- `rafts`=落物事件笔数；`paths`=案径数；`cases`=遗 + 外逸案数；`counts.dropped/removed/adopted/exempted/left/stray`=落物笔/舍/归/豁免注记/域内遗/外逸；`gauge.raftTop`=按落物笔数取前三的筏径。

## 9 · 舍牌块（接缝供给，逐字节确定）

同一筏册与同一清点两次渲染必得同一文本（shasum 可证）：

```
【舍筏 · 舍牌】
筏册：keep N 条 · 筏形 N 条 · 域界 N 条 · 默认形表 开/关
清点：落物 N 笔 · 筏径 N · 舍 n · 归 n · 外逸 n · 遗 n
外逸点名：
  · /tmp/probe.py（形 tmp/ · 会话 s1）
遗筏点名：
  · src/utils.js.bak（形 .bak · 会话 s1）
法尚应舍，何况非法——舍筏
本块由确定性规则生成；重放同一筏册必得同一文本。
```

点名段按 issues 行序（外逸先、遗后，各按案径字典序）；无案时该段出「  · 无——渡尽舍筏」。全缺省册出确定性文本。

## 10 · 夹具期望（先于实现手算定死，实现与手算冲突只能改实现）

夹具时间戳 `at` 为单调整数；域界缺省（无册）时域外判定用系统区词形。

| 夹具 | 流构成（手算依据） | 期望（定死） |
|------|--------------------|--------------|
| clean-stream | c1 write src/util.js（非筏形）· c2 edit docs/guide.md（非筏形）· c3 bash "npm test"（无径词面） | calls 3、rafts 0、cases 0、score {0,0,0}、净、exit 0、counts 全 0 |
| leftover-stream | c1 write scratch/repro.js（筏形 scratch/ · 域内）· c2 bash "cp src/utils.js src/utils.js.bak"（目标 .bak · 域内）· c3 write /tmp/probe.py（筏形 tmp/ · 系统区域外）· c4 edit src/fix.js · c5 bash "npm test" | calls 5、rafts 3、paths 3、cases 3、score {total:60, infield:30, exfield:30}、积、exit 1、counts {dropped:3, removed:0, adopted:0, exempted:0, left:2, stray:1} |
| shepherded-stream | c1 write scratch/repro.js · c2 write src/utils.js.bak · c3 bash "rm scratch/repro.js src/utils.js.bak"（rm 词元逐字命中两案径）· c4 edit src/fix.js | calls 4、rafts 2、paths 2、cases 0、score {0,0,0}、净、exit 0、counts {dropped:2, removed:2} |
| adopted-stream | c1 write scratch/check.js · c2 bash "git add scratch/check.js"（add 见证）· c3 bash "git commit -m 'wip: add scratch check'"（commit 凭据）· c4 edit src/app.js | calls 4、rafts 1、paths 1、cases 0、score {0,0,0}、净、exit 0、counts {dropped:1, adopted:1} |
| mixed-stream | c1 write src/utils.js.bak（案）· c2 bash "rm src/utils.js.bak"（舍）· c3 write scratch/verify.py（案）· c4 bash "git add scratch/verify.py" · c5 bash "git commit -m save"（归）· c6 write scratch/tmpdump.txt（案 · 域内遗）· c7 bash "echo dump > /var/tmp/state.json"（重定向落物 · 筏形 tmp/ · 系统区外逸）· c8 write src/deliver.js（非筏形） | calls 8、rafts 4、paths 4、cases 2、score {total:45, infield:15, exfield:30}、积、exit 1、counts {dropped:4, removed:1, adopted:1, left:1, stray:1} |

附加口径：

| 命令 | 期望（定死） |
|------|--------------|
| `audit leftover-stream --file shefa-book.json`（keep ["scratch/",".bak"]，roots ["src/**","scratch/**","/tmp/**"]） | 域内回 roots 判定：repro 与 .bak 豁免（exempted 2）、/tmp/probe.py 命中 /tmp/** 域内遗 15 → score 15、滞、exit 0 |
| `audit leftover-stream --keep scratch/,.bak` | 同豁免但无 roots：/tmp/probe.py 系统区外逸 30 → score 30、积、exit 1、exempted 2 |
| `audit leftover-stream --no-defaults --raft .bak` | 默认形表关、只 .bak 在岗：rafts 1（仅 utils.js.bak）、域内遗 15 → score 15、滞、exit 0 |
| `audit mixed-stream --gate 50` | 45 < 50 → verdict pass、exit 0（门禁翻转） |

跨项目互认（A3，实现期以实读夹具为准——手算依据已核）：`zhizhi/fixtures/sample-stream.jsonl` 喂本层：exec 仅 "npm test"（无径词面）、写径 src/patch.js 与 src/user.js（非筏形）→ calls 8、rafts 0、score 0、净、exit 0；`dingfen/fixtures/fenced-stream.jsonl` 喂本层：exec 仅 "npm test"、写径 src/auth/login.js 与 src/auth/token.js（非筏形）→ 0 净、exit 0。

## 11 · 与相邻层的边界（结构性，不是纪律性）

- **zhizhi（拦）**：知止问「这一步该不该做」，本层问「做完之后物去哪了」——一拦一账。本层结构性零拦截。
- **zhizu（量出）**：知足量写的**量**（行数/写域/反复），本层问写的**物**的归宿——一量一终；写得再节俭，一件 `.bak` 也是筏。
- **yuli（行前定）**：豫立审**灭掉之前**有没有备，本层审**留下之后**有没有清——一灭一留；且备份造出的副本正是本层头号筏源（yuli 的备形就是本层的筏形，两账并行不悖）。
- **dingfen（封界）**：定分裁**跨会话写域归属**（谁有资格写哪里），本层审**单会话落物归宿**（写下的散件收没收尾）——一分一敛；定分的界是领地，本层的域是任务域，谓词不同。
- **zhongshi（记程）**：终始记**任务书立下的事**走到哪（事之程），本层记**任务书没立过的散件**去哪了（物之宿）——事在册上，筏在账上。
- **licheng（结绳）**：立诚追**说出口的诺**（话语），本层追**落下地的物**（痕迹）——诺在话语里，筏在账上。
- **youya（巡忆）**：有涯管**读的重复**（复见），本层管**写的残留**（遗筏）——一读一写；遗筏误导下一会话之读，恰是有涯复见之外的另一病。
- **shenqu（审材）**：审曲审**读入证据的残全**（看见的完不完整，入之全），本层审**写出之物的归宿**（留下的清没清，出之尾）——一入一出；残卷是没看全就动刀，遗筏是动完刀不敛迹。
- **baihe（守境）**：捭阖管**出去的物**（出境泄密），本层管**留下的物**（在场散件）——物出境归它，物在场归本层。
- **buer（在途，学习闭环）**：不贰过记**跨会话的教训**，本层记**单流内物账**——跨会话归它，流内归本层；本层不做任何跨会话归并（多流合审是把多条流拼进同一时间轴记账，不是跨会话学习）。

## 12 · 诚实边界

- **词面账**：exec 落物与 rm/归凭据全是词面为凭——不做文件系统语义、不探测存在性、不展开 `~`；目录目标记目录径（词法粗粒度的既知代价，宁纵勿诬）。
- **词法可欺**：写进代码的 `fs.writeFileSync('scratch/x')`、`os.tmpdir()` 拼径、别名 `rm='rm -i'`——词面之外一律不可见；骗得过一次，留一次形（账在，绕行的路径本身是新词面）。
- **git clean 全域销案从宽**：clean 之后同流的在案疑筏全部销为「舍」——若 clean 实际没清到（-i 交互、路径别名），账面已白；这是宁纵方向的既知代价。
- **归凭据从宽**：add 见证 + 其后任一成功 commit 即销——不校验该 commit 实际包含哪些径；词面之外的责任归 git 本身。
- **流内为界**：本层只对流内词面记账，不做终态文件系统盘点（「场上现在实际有什么」超出离线审计——零文件系统探测是结构约束）；「遗」的严格语义是「流内无舍归凭据」，不是「磁盘上一定还在」。
- **域内/域外是声明语义**：roots 是任务方的声明，系统区词形是保守回退；无声明且非系统区的散件按域内黄牌处理（宁纵）。
- **不判该不该留**：交付物声明（keep）之外，「这件散件到底该不该留」是语义判断——本层只让「无凭据的悬物」现形上账，不假装能读懂意图（零 LLM）。
- **时序以流序为准**：缺 `at` 照判；多流合审按参序拼接（同 zhongshi 口径）。
