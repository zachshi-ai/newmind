# 揖盗 · yidao —— DeepSeek Harness 的守门开关治理

> **「况今奸宄竞逐，豺狼满道，乃欲哀亲戚，顾礼制，是犹开门而揖盗，未可以为仁也。」**
> **「乃改易权服，扶令上马，使出巡军。」——《三国志·吴志·吴主传》**

agent 被卡住时解围的顺手姿势恰是拆锁：`curl` 报证书错误就写
`verify=False`，Node 报验签失败就上 `rejectUnauthorized: false` 或
`NODE_TLS_REJECT_UNAUTHORIZED=0`，fetch 被跨域拦下就 `origin: "*"`。
证书错误消失了，这单活绿了——**拆的不是障碍是防线**：中间人、抢注域、
恶意响应畅通无阻。这一行混在几百行 diff 里几乎不可分，SAST 扫得到现状
却答不出「这行锁是哪一笔写、在遇到什么阻之后拆的、拆得有没有名分」——
归因只发生在会话流内。

**揖盗**给 DeepSeek Harness 装上第三十八个能力类型：**揖盗式插件**（结构性
零拦截）+ 零依赖审计 CLI + Agent Skill。它不拦写（账与闸分治，拦是知止的
地盘）、不做语义判断（不判这次拆锁值不值——本地调试与遇阻解围在词面上
只差一个授权声明，裁决权归人：锁册免拆明言即免案），只做词法可证的三问：
**形落没落、阻在不在窗、尾文合没合**——弱锁形 12 开箱在岗，exec 阻账
不问 isError 旗（败相在文不在旗），拆锁窗败相归因，先拆后合注记不罚。

## 快速开始

```bash
cd your-repo
npm install github:zachshi-ai/newmind#yidao-dsh      # 或复制本目录

# 开工（可选）：立锁册——确需关验的径先免拆
yidao register --path "local-dev/*"                  # 免拆授权（* 跨目录）

# 收工：审锁
yidao audit session.jsonl --file .yidao.json         # exit 0 通过 / 1 门禁红 / 2 用法错
yidao audit s1.jsonl s2.jsonl --json                 # 多流合审
yidao block --file .yidao.json                       # 锁牌块：锁册与形表公示（逐字节确定）
```

无册照判：弱锁形 12 开箱在岗，校场（tests/mocks/fixtures 等 10 名段）
默认豁免——演武之地不设门禁，交付代码皆门户。

## 判定语义（docs/03 锁死）

**受审之卷**：write 族 p: 径，无后缀门；校场名段 ∪ 锁册 excuse 立案前豁免。
**阻账**：exec 族逐笔全记不问 isError 旗——败相在文不在旗；exec 落盘黑盒
不判。**尾文**：末笔带 content 之成功写，无文之写不改尾文（注记）。

**弱锁形 12**（单行正则，一处=一行=一案）：

| 族 | 形 |
|----|-----|
| 验锁 10 | `verify=False` · `ssl_verify=False` · `CERT_NONE` · `check_hostname=False` · `rejectUnauthorized:false` · `NODE_TLS_REJECT_UNAUTHORIZED=0` · `GIT_SSL_NO_VERIFY` · `sslVerify=false` · `InsecureSkipVerify:true` · `--insecure` |
| 网锁 2 | `Access-Control-Allow-Origin:*` · `origin:'*'` |

**拆锁窗**（本层独有的机制）：尾笔前近 10 笔入账内的阻账正文命中**同族
阻词**（验锁 6：certificate/self-signed/ssl/tls/handshake/证书；网锁 4：
cors/cross-origin/access-control/跨域）→ **遇阻 +30/处**（拆锁与所遇之阻
对见，单案即红）；否则 **素拆 +15/处**（黄牌点名不咬门）。

**锁值** = min(60,30×遇阻) + min(40,15×素拆)，total = min(100)。分带
**扃 0–14 / 倚 15–29 / 洞 ≥30**，门默认 30。

**复锁注记**：先前写过弱锁形、尾文改净 → 0 分——先拆后合的门不算开的门，
账本结构性地奖励收工前的复原（扶令上马）。

**锁牌块**（接缝供给）：锁册公示 + 形表公示 + 案账清点 + 逐案点名
（径:行:形 与窗内阻词），永不携带尾文行原文与败笔正文——掩码是结构性
保证；同输入两次渲染逐字节相同（shasum 可证）。

## 与既立各层的边界（结构性）

- **乡校**（一声一锁）：它审批评通道静音（让报错闭嘴），本层审守门开关
  关闭（让验证不发生）；
- **防川**（一川一锁）：它审错误被咽下（catch 空体），本层审校验被关
  （错误根本不再发生）；
- **fayi**（一尺一锁）：窗归因同构而对象异——它的窗在红验绿验之间
  （尺被改以翻绿），本层的窗在败相与拆锁之间（锁被拆以过关）；
- **渊鱼/捭阖**（一入一出两锁）：密物入目归渊鱼、密物出境归捭阖、
  门闩落地归本层；
- **扫屋**（一垢一锁）：调试残垢是开发过程的遗留物，弱锁是安全机制的
  有意调低——同卷两账正交。

## 测试

```bash
npm install && npm test
```

65 tests（core 32 + cli 21 + 真实管道集成 12），全部零 LLM、零网络、
零子进程、零文件系统探测；集成测试挂载 npm 官方 `@deepseek-ai/cordis` +
`@deepseek-ai/dsh-tools` 真实工具管道，`exportStream()` 导出流离线重放
账实一致。复现命令见 docs/04-acceptance.md。

## 文档

- [docs/01-book.md](docs/01-book.md) —— 选书：三国志的逐条映射
- [docs/02-problem.md](docs/02-problem.md) —— 问题：Agent 遇阻拆锁
- [docs/03-design.md](docs/03-design.md) —— 设计语义锁死
- [docs/04-acceptance.md](docs/04-acceptance.md) —— 验收标准（先于实现）与实测
- [SKILL.md](SKILL.md) —— Agent 协作协议（免拆/复锁五条纪律）

## 许可

MIT（见 package.json）。
