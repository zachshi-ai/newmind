# 03 · 设计：知行 · zhixing —— DeepSeek Harness 的知行断层层（知行式插件）

> 本文锁死全部判定语义；实现与本文冲突时改实现，不改本文与 04 的手算期望。

## 1. 能力类型与接缝

新能力类型：**知行式插件**（第三十个）。zhizhi 证明插件可以拦，jiebi 证明可以审，
zhengnian 证明可以供给，weibing 证明可以诊，jiyi 证明可以稽问，hengfa 证明可以审立法之名分，
kaocheng 证明可以考交付之契——知行证明插件可以**对账知与行**：
章程装载之刻其戒条已发动为行为义务（一念发动处便即是行），
其后每一笔行为是否合乎已装之知，有账可对。

```
tools/result   emit   观察知面与行面入账（唯一写入口）
（无 pre-execute）     —— 零拦截是结构性的
```

设计约束（与全仓同规）：模型无关（零 LLM、零提示词注入、零网络、零子进程、零文件系统探测）；
观察永不反噬（监听器异常吞掉，管道照常）；凭册持久化归 CLI（rule），插件只吃注入的
book 对象；单会话视图的案与值只采本会话，跨会话归并归离线合并审计。

## 2. 对象与通道（词法锁死）

对象键与工具族同全仓（object.js 同规：`p:` 文件 / `c:` 命令 / `n:` 不透明；
observe/write/exec/other 四族）。径规整同全仓（反斜杠归正、剥 `./` 前缀与尾 `/`）。

### 2.1 知面（知的确定性判据）

**知面** = 流中 observe 族成功（`isError===false`）装载过、且径命中凭据径的装载记录：

- **凭据径** = 凭册 `rules` 显式登记 ∪ 默认**知形 8**（`noDefaults` 可关）；
- **知形 8**（默认形表，与恒法宪形 8 同源词表、语义分流——hengfa 命中审改、zhixing 命中记知）：
  单名形 7（basename 全等，大小写敏感）：`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、
  `.cursorrules`、`.windsurfrules`、`.clinerules`、`copilot-instructions.md`；
  径前缀形 1：`.cursor/rules/`（目录前缀——规则目录内一切文件皆知面）；
- **知入时刻** = 该 result 之 `at`；
- **知面取文于流**：装载正文取该 result 之 `content`（会话流自带装载内容）——
  content 字段缺失或空串：该装载的**化知道诚实降级**（`jiang` 注记，0 分），
  戒形无从提取即无从相撞，不凭空捏戒。

**戒形只生自知面**——化知戒形的唯一来源是已装载章程的流内正文。这条结构性规则
（戒形存在之处知必已入）是「知而不行只是未知」的账面化：违知案天然蕴含知入，
不存在「撞了从未装载的章程」的罪名。

### 2.2 行面（行的确定性词面）

**行面** = 成功行为的证据原文，唯三处：

1. **exec 族成功执行**（`isError===false`）：命令按 `&& || ; |` 切段，**每段原文**各为一处
   （删引号不删——原文子串匹配，词元化只用于戒体词元提取）；
2. **write 族成功写**（`isError===false`）：对象键 `p:` 之**规整径原文**；
3. **write 族成功写的 `content`**：仅亲命戒词与必行词、宥词可咬
   （**化知戒形不咬 content**——提取形宁纵勿诬）。

`isError===true` 的执行不入行面（失败之试宁纵），但**撞戒的失败执行计试违案**（0 分注记）
——试违不罪，罪形可见。

## 3. 戒形提取（化知道词法锁死）

### 3.1 戒形句式 11

中文 7：`不要`、`不得`、`禁止`、`不许`、`切勿`、`不能`、`勿`；
英文 4（大小写不敏感）：`never`、`must not`、`do not`、`don't`。

### 3.2 戒体提取

句式命中处，向后剥引导符 `[：:（("'\t ]+`，取至首个句读（`。；，！？;,!?\n`）或 20 字符
（先到者取）为**戒体**；戒体剥尾后长度 ≥1 才成形。

### 3.3 戒体词元

戒体按空白切分，逐词元剥首尾标点（中文标点 `。，；：！？、（）「」《》"`与英文
`.,;:!?'\"()[]{}<>`——**不含 `-` 与 `_`**，`--force` 之 `--` 是语义），
长度 ≥2 保留；过**停用词表**剔除（小写比较）：
`使用 进行 出现 写入 执行 运行 操作 修改 更新 删除 创建 添加 以及 或者 并且 如果 然后 之前 之后 时候 所有 任何 直接 随意`（中文 24）∪
`the and with use into from this that when then your you for are will can not do`（英文 17）。

全停用 / 全长 <2 → 无戒形。相同戒体并一（去重按戒体原文）。

### 3.4 戒词元与匹配

戒形的**戒词元** = 戒体词元集中字符最长者（并列取先出现）。
**化知匹配** = 戒词元原文在行面第 1、2 处（exec 段原文 ∪ write 规整径）中
`indexOf ≥ 0` 即相撞（**不咬 content**）。
最长的词元通常是专有词（`--force` 长于 `push` 长于 `git`）——专有词优先，
通用词（已过停用词表）居后，宁纵方向。

例：章程「禁止 git push --force」→ 戒体 `git push --force` → 词元 `[git, push, --force]`
→ 戒词元 `--force` → `git push --force origin main` 相撞、`git push origin main` 不撞；
章程 "Never use sudo" → 戒体 `use sudo` → 词元 `[sudo]`（use 停用）→ `sudo apt-get install` 相撞。

## 4. 凭册（rulebook）

声明权全在任务方。册文件 JSON 五字段：

- `rules: string[]`——凭据径显式登记（规整后并入知面判定）；
- `bans: string[]`——**戒词**（亲命戒词，非空字符串）：对行面**三处**（exec 段原文 ∪
  write 规整径 ∪ write content）原文子串匹配；
- `musts: string[]`——**必行词**（亲命必行，非空字符串）：行面三处任一处原文含之即「查有」，
  全流查无即缺行案；**查有认 isError 执行**（行了即不缺——成败之罪归直笔/法仪另账）；
- `exempts: string[]`——**宥词**：撞中处的行为证据原文含宥词即该案宥（0 分注记）；
- `noDefaults: boolean`——关默认知形 8（显式 rules 仍在岗）。

**亲命直令不问知**：bans/musts/exempts 是任务方直令，登记之刻即是知入之刻
（一念发动处便即是行），不需要章程装载记录——撞了就是悖。
**化知须有装载**：默认提取的戒形只在知面（已装载章程的流内正文）中生成。

坏册（坏 JSON / 五字段任一非数组或数组含非字符串或含空串 / noDefaults 非布尔）→ exit 2。

## 5. 案别与判定序（锁死）

撞戒候选案（行为笔撞戒形或亲命戒词）按序裁决，一案只落一别：

1. **宥**（`mian`）：撞中处原文含任一宥词 → 0 分（任务方显式豁免，最高优先）；
2. **试违**（`shi`）：执行 `isError===true` → 0 分（失败之试宁纵；不入行面，罪形可见）；
3. **先悖**（`xian`）：行为 `at` ≤ 知入 `at`（化知案）→ 0 分（装载之前的行为不溯既往；
   装载前「问没问」归稽疑审谋）；
4. **违知**（`wei`）：其余 → **+30/案，cap 60**（禁了却做——「知而不行，只是未知」；
   亲命戒词案无时序条件——直令不问知）；
5. **缺行**（`que`）：必行词全流行面三处查无 → **+15/条，cap 30**（令了不做）。

案粒度：违知案每**行为笔**一案（案内点名全部撞中的戒形/戒词与源章程径）；
缺行案每必行词一案。判定幂等：重放同流必得同案同值。

## 6. 行值与门禁

```
行值 = min(60, 30 × 违知案) + min(30, 15 × 缺行案)
分带：合 0–14 / 亏 15–29 / 悖 ≥30；门默认 30
```

单违知案（30）即红；单缺行案（15）黄牌点名不咬门；双缺行（30）即红。
门禁裁决：行值 ≥ 门 → exit 1（红），否则 exit 0。

## 7. 合牌块（供给）

`block` 渲染知行公示块，逐字节确定：同册两次渲染 shasum 相同；增删册条文本改变。
块载：凭册面（rules 逐径 / 戒词 / 必行词 / 宥词 / noDefaults 态）、知面清单
（章程径 × 装载笔数 × 提取戒形数——载戒形短语与戒词原文，**不载任何装载正文**
（result.content 原文永不入块））、案数与行值分带。
无亲命册的确定性文本：`凭册：亲命未立（知形在岗）`。

## 8. CLI

- `zhixing audit <streams...> [--file 册] [--gate N] [--json] [--no-defaults]`
  多流合审（合并视作一账，知面/行面跨流合并、at 时序全局比）；
  坏 JSON 行 / 流缺失 / 未知旗标 / 坏册 → exit 2；无 --file → 默认册（知形在岗、亲命空）。
- `zhixing rule --ban 词 [--must 词] [--exempt 词] [--rule 径] [--no-defaults] [--file 册]`
  造册/增条（upsert 进数组，去重）；四增条旗标一个不给 → exit 2；空串 → exit 2。
- `zhixing show [--file 册]` 出册；无册 → exit 2。
- `zhixing block [--file 册]` 合牌块；无亲命册出确定性文本。
- `zhixing gate --value N --score S` 按门判 0/1；缺任一 → exit 2。
- `--version` / `--help`。

## 9. 插件

`src/plugin/zhixing.js`——Cordis 服务（`inject: ['tools']`），唯一监听器挂 `tools/result`：
观察知面与行面入账（结构性零拦截——源码不存在 pre-execute 监听器）。
暴露 `ctx.zhixing.report()` / `ledger()` / `paizi()` / `gate()` / `exportStream()`。
config：`{ sessionId, book, gate }`。exportStream 导出的流离线 `audit` 重放，
案数与行值与运行时账账实一致。

## 10. 夹具构成与手算期望（先于实现定死）

| 夹具 | 构成 | 手算 |
|---|---|---|
| clean-stream | 4 调用：read AGENTS.md ok（content 含「禁止 git push --force」，at 20）；exec `git push origin main` ok；exec `npm run lint` ok；exec `npm run build` ok。册：musts [npm run lint, npm run build] | calls 4、zhi 1、jie 1（戒词元 --force）、wei 0、que 0；行值 0 带「合」exit 0（git push 不含 --force 不撞；两必行词皆查有） |
| weizhi-stream | 2 调用：read AGENTS.md ok（content「禁止 git push --force」，at 20）；exec `git push --force origin main` ok（at 30）。无册 | calls 2、zhi 1、jie 1、wei 1；行值 30 带「悖」exit 1；附加 `--gate 40` → 30 过门 exit 0 |
| qinming-stream | 2 调用：exec `npm test` ok（at 10）；write src/a.js content `let x = 1 // TODO_FIXME` ok（at 20）。册：bans [TODO_FIXME]、musts [npm test] | calls 2、zhi 0、wei 1（亲命咬 content，直令不问知）、que 0；行值 30 带「悖」exit 1 |
| quexing-stream | 2 调用：read AGENTS.md ok（content 无戒形句式，at 10）；exec `npm run lint` ok（at 20）。册：musts [npm run lint, npm run build] | calls 2、zhi 1、jie 0、que 1（build 全流查无）；行值 15 带「亏」exit 0（黄牌不咬默认门）；附加 `--gate 10` → 15 红 exit 1 |
| shier-stream | 5 调用：exec `sudo apt-get install foo` ok（at 10，先悖——撞 sudo 戒形、不含宥词、时序先于装载）；read AGENTS.md ok（content「禁止 sudo」「禁止 git push --force」两句，at 20）；exec `git push --force origin main` ok（at 30，宥词 --force 在册）；exec `sudo rm x` isError=true（at 40，试违）；exec `npm run lint` ok（at 50）。册：exempts [--force]、musts [npm run lint] | calls 5、zhi 1、jie 2（sudo、--force）、wei 0、que 0、shi 1、xian 1、mian 1；行值 0 带「合」exit 0（裁决序宥 > 先悖锁死——含 --force 之撞先落宥，先悖探针须用不含宥词之撞） |
| mixed-stream | 3 调用：read AGENTS.md ok（content「禁止 git push --force」，at 10）；exec `git push --force origin main` ok（at 20）；exec `npm run lint` ok（at 30）。册：musts [npm run build] | calls 3、zhi 1、jie 1、wei 1、que 1；行值 45 带「悖」exit 1；附加 `--gate 50` → 45 过门 exit 0 |
| laoliu-stream | 2 调用：read AGENTS.md ok（**无 content 字段**，at 10）；exec `git push --force origin main` ok（at 20）。无册 | calls 2、zhi 1、jie 0、jiang 1（化知道诚实降级，流内无文不捏戒）；行值 0 带「合」exit 0 |
| xianliu-stream | 2 调用：read CLAUDE.md ok（content "Never use sudo with rm"，at 10）；exec `sudo apt-get install foo` ok（at 20）。无册 | calls 2、zhi 1（CLAUDE.md 是默认知形）、jie 1（never 句式→戒体 use sudo with rm→词元 [sudo, rm]→戒词元 sudo）、wei 1；行值 30 带「悖」exit 1；附加 `--no-defaults` → 知形 8 关、CLAUDE.md 不入知面 → jie 0 → 行值 0 带「合」exit 0 |

多流合审探针：weizhi 拆两流（仅 read 之流 + 仅 exec 之流）合审 → 知面与行为跨流相遇，
wei 1 → 30 悖 exit 1。

跨项目互认：zhizhi `fixtures/sample-stream.jsonl` 喂 zhixing audit（无册）→ 流内无知形装载
→ zhi 0 → 行值 0 带「合」exit 0；dingfen `fixtures/fenced-stream.jsonl` 同 → 0 exit 0；
zhixing `mixed-stream` 喂 kaocheng audit（无册）→ contractless true → exit 0——
同格式流跨项目可审、互不误伤。

## 11. 逐层边界（方向登记表之扩写）

- **稽疑 jiyi**：审**首动之前问没问**（行之始——读没读章程），问凭据成立即 0 分；
  知行审**知入之后行合不合**（行之成）。一始一成：它记「问了」，本层记「悖了」。
- **恒法 hengfa**：审**立法之名分**（章程文书被**改**——改典入账、对授权）；
  知行审章程被**无视**（不改你，但不照你做）。一改一行：法被改是恒法的案，法被悖是知行的案。
- **知止 zhizhi**：运行时**拦截**动作（pre-execute）；知行**离线对账**零拦截
  （结构性无 pre-execute 监听器）。一拦一考。
- **考诚 kaocheng**：考**契上之物的末据**（交付物在不在、成不成形——物）；
  知行考**全程行为对章程**（每一步命令与每一笔写——行）。一物一行。
- **终始 zhongshi**：记**事册之行程**（立了的事做没做——无册不判）；
  知行的缺行以**章程装载为账基**、必行词以**凭册显式登记为据**，不依赖事册。
  一册一凭。
- **解蔽 jiebi**：审**判断的产物**（候选多样性、可证伪条件——账本协议）；
  知行审**行为对章程**（词法对账）。一断一行。
- **论世 lunshi**：审**输入渠道权威**（数据冒充主命——谁有资格发令）；
  知行认**合法主命**（章程与亲命），审的是主命被装载后的行据。一进一行。
- **度支 duzhi / 知足 zhizu / 九变 jiubian / 有涯 youya**：量花销、量变更、勘势变、
  守见闻——皆与知行对账对象无交。
