# 平准 · pingzhun —— DeepSeek Harness 的命脉籍面治理

> **「令意总一盐、铁，非独为利入也，将以建本抑末，离朋党，禁淫侈，绝并兼之路也。」**
> **「平准则民不失职，均输则民齐劳逸。故平准、均输，所以平万物而便百姓，非开利孔而为民罪梯者也。」**
> ——《盐铁论·本议第一／复古第六》

依赖是软件项目的盐铁：自己不写、必须取之于 registry 的生产必需品。agent
被依赖问题卡住时会顺手解围——添一个新包（每难必附）、把 `"a": "1.2.3"`
改成 `"^1.2.3"`（松锁过关）、往 requirements 顶上加 `-i https://某镜像`
（移源）、往 scripts 里埋一只 `postinstall`（埋钩）。每一笔都让这一单活变绿，
而「谁在何时添了什么附、松了哪把锁、移了哪个源、埋了哪只钩、任务方授没
授权」——籍面上无账可问。

**平准**给 DeepSeek Harness 装上第三十二个能力类型：**平准式插件**（结构性
零拦截）+ 零依赖审计 CLI + Agent Skill。它不拦写（账与闸分治，拦是知止的
地盘）、不做语义判断（不判这次添附值不值——裁决权归人），只做词法可证的
四问：**增附、去锁、越源、钩入**——添没添、松没松、源在不在、钩新不新，
末文对旧本逐附名对账，纳籍授权归任务方的命籍明言。

## 快速开始

```bash
cd your-repo
npm install github:zachshi-ai/newmind#pingzhun-dsh   # 或复制本目录

# 开工（可选）：立命籍——正当依赖工作先纳籍
pingzhun register --path "third-party/*"             # 纳籍授权（* 跨目录）
pingzhun register --form Makefile                    # 增籍形（basename 全等）

# 收工：审籍
pingzhun audit session.jsonl --file .pingzhun.json   # exit 0 通过 / 1 门禁红 / 2 用法错
pingzhun audit s1.jsonl s2.jsonl --json              # 多流合审（旧本池跨流）
pingzhun block --file .pingzhun.json                 # 准牌块：籍形与命籍公示（逐字节确定）
```

无册照判：默认籍形 22 开箱在岗，无册 = 全账——籍面是仓库公共命脉
（名山大泽不以封），授权只能来自册。

## 判定语义（docs/03 锁死）

**对象**：write 族 `p:` 径命中籍面（默认籍形 22：npm 7 ∪ Python 6 ∪ Rust 2
∪ Go 2 ∪ Ruby 2 ∪ PHP 2，basename 全等 + requirements 名前缀形）∪ 命籍
extra。**旧本池**：同规整径更早的带 content 之写 ∪ observe 族成功读取之
结果正文（流内取文，读取永不判案）。**暗籍**：exec 生产词法（cp/mv/tee/
touch/重定向）落点命中籍面——文面经命令生成，诚实沉默。

**四案**（面案取新增：旧本在判新增、旧本缺判全量；递案无底本不判）：

| 案 | 词法 | 分值 |
|----|------|------|
| **增附** | npm/composer JSON 深判（dependencies/devDependencies/optionalDependencies/peerDependencies ∪ require/require-dev）∪ requirements 行级，旧本全集所无 | +15/名，cap 60 |
| **去锁** | 同附名精确版（`1.2.3`）→ 范围（`^ ~ * >=`）或脱钉；精确→精确递进不判、删附不判 | +10/名，cap 60 |
| **越源** | requirements `-i/--index-url/--extra-index-url/--trusted-host` ∪ package.json `publishConfig.registry` ∪ composer `repositories.*.url` ∪ pyproject `[[tool.uv.index]]`/`[tool.poetry.source]` ∪ Gemfile `source`，宿主非默认域（相等或子域） | +30/处，cap 60 |
| **钩入** | package.json `scripts` 新增 `preinstall`/`install`/`postinstall`/`prepare`（旧本已有不判——护钩；解析失败词面回退） | +30/键，cap 60 |

**准值** = min(60,30×越源) + min(60,30×钩入) + min(60,15×增附) + min(60,10×去锁)，
total = min(100)。分带 **平 0–14 / 偏 15–29 / 倾 ≥30**，门默认 30：单越源或
单钩入即红、两增附即红、单增附黄牌点名不咬门、单去锁仅点名。

**准牌块**（接缝供给）：籍形公示 + 命籍公示 + 案账清点 + 逐案点名
（径:行:案别 附名/键名/宿主），永不携带命中行原文与 spec 值原文——
掩码是结构性保证；同输入两次渲染逐字节相同（shasum 可证）。

## 与既立各层的边界（结构性）

- **恒法**（一典一籍）：它审规矩源之名分且显式让渡了杂糅文件
  （package.json/pyproject「既装依赖又载章程」），本层接的正是那块让渡地；
- **名实**（一装一籍）：它记装成之包的事件（幻包装一次），本层审籍册上
  常驻的授权（幻名入籍则次次必装）；
- **水土**（一境一籍）：它审机器常驻态，本层审仓库籍面内容；
- **知足**（一量一籍）：它量写之量，两行的籍面改动在它账上不可见，本层
  恰审这两行的内容；
- **防川**（一川一籍）：它审码面吞错之形（.json 是它的豁免），本层恰以
  籍面为审查对象——正交不引词；
- **考诚**（一契一籍）：它考契上物之末据（无册不判），本层审全籍面
  （无册照判）。

## 测试

```bash
npm install && npm test
```

77 tests（core 41 + cli 25 + 真实管道集成 11），全部零 LLM、零网络、零子进程、
零文件系统探测；集成测试挂载 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools`
真实工具管道，`exportStream()` 导出流离线重放账实一致。复现命令见
docs/04-acceptance.md。

## 文档

- [docs/01-book.md](docs/01-book.md) —— 选书：盐铁论的逐条映射
- [docs/02-problem.md](docs/02-problem.md) —— 问题：Agent 依赖面自便
- [docs/03-design.md](docs/03-design.md) —— 设计语义锁死
- [docs/04-acceptance.md](docs/04-acceptance.md) —— 验收标准（先于实现）与实测
- [SKILL.md](SKILL.md) —— Agent 协作协议（开籍/纳籍五条纪律）

## 许可

MIT（见 package.json）。
