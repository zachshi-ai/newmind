# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §10 与夹具内容）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、result content 回填、孤儿 result 建档）；对象键与工具族同 mingshi/zhizu；径规整防同文件异写之诬；入口滤：`isError===true` 一律不入账；残见判定序锁死（豁免 → 偏窗=残见 → 限窗无 content=无据 → 限窗回程<窗值=取窗认全（全览） → 限窗回程≥窗值=残见 → 无窗无残记有 content=全览 → 无窗有残记=显残 → 无 content=无据之见）；残记默认形认尾、显式形认全文；盲动判定序锁死（先查账后记自书：残见≥1 ∧ 全览=0 ∧ 自书=0 → 立案 +30/案 cap60，**立案之笔不记自书——盲写不生据**，逐笔立案；无见闻/全无据之见静默；补览救后续不销已案）；碎览收尾现算（残见≥fragWindows ∧ 全览0 ∧ 自书0 ∧ 无盲动案 → +10/径 cap20，不双罚）；**据证链按会话分账**（跨会话互不赦免——甲读全救不了乙的盲）；分值 blind=min(60,30×盲动)、crawl=min(20,10×碎览)、total=min(100,和)；分带 全 0–14 / 昧 15–29 / 盲 ≥30；门默认 30——core 用例 ≥ 40 且全绿，断言恰好该分值 | `npm test`（core 部分） | ✅ 52 用例全绿 |
| A2 | 夹具分数（先于实现手算定死） | `clean-stream`：4 调用、views 2、writes 2、cases 0、残值 `{total:0, blind:0, crawl:0}`、带「全」、exit 0、counts `{blindActs:0, crawls:0, partialViews:0, fullViews:2, exempted:0}`；`blind-stream`：4 调用、views 2、writes 2、cases 1、残值 `{total:30, blind:30, crawl:0}`、带「盲」、exit 1；`marked-stream`：2 调用、views 1、cases 1、残值 `{total:30, blind:30}`、带「盲」、exit 1、markerHits 1；`crawly-stream`：6 调用、views 6、cases 1、残值 `{total:10, crawl:10}`、带「全」、exit 0、counts `{blindActs:0, crawls:1, partialViews:5, fullViews:1, exempted:0}`；`mixed-stream`：7 调用、views 5、writes 2、cases 1、残值 `{total:30, blind:30, crawl:0}`、带「盲」、exit 1、windowReads 4；附加口径：`blind + --gate 40` → pass exit 0；`crawly + --file shenqu-book.json`（fragWindows 2）→ 碎览 2 径案 20 昧 exit 0；`marked + --file noDefaults-book.json` → 0 全 exit 0、fullViews 1；`blind + --file noDefaults-book.json` → 0 全 exit 0、fullViews 2；`clean + --file exempt-book.json`（exempt 含 `src/`）→ views 0、writes 0、exempted 3、0 全 exit 0 | core 断言 + CLI 复现 | ✅ 十条复现命令退出码与分数逐字吻合(0/1/1/0/1/0/0/0/0/0);五夹具 core 断言逐字段 deepEqual;定标后实现前 refinement 披露:①mixed 夹具的豁免演示移入 clean+book 口径、mixed 改为三通道混合(定标 commit 内的初版混入 vendor/ 豁免需带册运行,口径不净);②「自书为览」精化为**自书只记无案之写**(盲写不生据,否则同径次刀永清白、cap60 不可达——licheng「实现前 refinement」先例,docs/03 §4.2 与 A1 同步修订,A2 夹具期望不受影响);③fullViews 按事件计数、豁免径的写不计入 writes(与 docs/03 §5「免出账」对齐,改实现不改表) |
| A3 | 跨项目互认（零误伤） | zhizu 的 `fixtures/modest-stream.jsonl`、dingfen 的 `fixtures/fenced-stream.jsonl`、xiangxiao 的 `fixtures/kept-stream.jsonl`、zhibi 的 `fixtures/hollow-stream.jsonl` 各自喂 `shenqu audit`（默认表）：历史流的老格式无 content/无窗字段/无残记——四流全部残值 0、带「全」、exit 0，不误伤任何既有夹具 | CLI 测试 | ✅ 四流零误伤(zhizu modest 3 调用/0 全、dingfen fenced 6 调用/0 全、xiangxiao kept 3 调用 1 全览/0 全、zhibi hollow 3 调用/0 全,exit 均 0) |
| A4 | CLI 语义 | `audit` 多流 + `--file` + `--exempt` + `--markers` + `--window-fields` + `--frag-windows` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 坏册 → exit 2；`register --exempt/--markers/--window-fields/--frag-windows`（全空参 → exit 2）；`revoke --exempt` 无此名 → exit 2；`list`/`block` 册缺失 → exit 2；`gate --value` 按门判 0/1；`--version`/`--help` 正常——CLI 用例 ≥ 14 | CLI 测试 | ✅ 26 用例全绿(含多流合并审计分账、`--markers`/`--window-fields` 旗标直生效) |
| A5 | 材牌块逐字节确定 | 同一材册两次 `shenqu block` shasum 相同；增一豁免子串后文本改变；全缺省册输出确定性文本（含生效表计数 10 形/18 名） | CLI shasum 复现 | ✅ 逐字节一致(shasum 594e4eca…×2);增豁免后文本改变;全缺省册「残记 10 形 · 窗字段 18 名 · 碎览阈 3 窗」 |
| A6 | 真实管道上的审材式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载审曲插件（读探针带 limit/offset 窗参数、截断时尾部带残记——真实 harness 读工具的通行形态）：失败探针也无条件到达工具本体（结构性零拦截）；取窗后动刀探针立案门红；显残探针立案；限窗内回程短于窗值=认全清白；补览后动刀清白；三窗不读全=碎览；豁免径在册全免；失败写不入账；材牌块两次渲染逐字节相同；`exportStream()` 导出流离线 `audit` 重放，案数与残值与运行时账**账实一致**；gate 裁决翻转——集成用例 ≥ 8 | 集成测试 | ✅ 11 用例全绿(账实一致 40 = 盲动 30 + 碎览 10,counts 逐字 deepEqual) |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出(exit 1) |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ✅ 89 tests, 89 pass(core 52 + cli 26 + 集成 11,0 跳过) |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅(本行即 A9 验证) |

## 复现命令

```bash
cd shenqu
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/shenqu.js audit fixtures/clean-stream.jsonl; echo $?     # 0
node src/bin/shenqu.js audit fixtures/blind-stream.jsonl; echo $?     # 1
node src/bin/shenqu.js audit fixtures/marked-stream.jsonl; echo $?    # 1
node src/bin/shenqu.js audit fixtures/crawly-stream.jsonl; echo $?    # 0
node src/bin/shenqu.js audit fixtures/mixed-stream.jsonl; echo $?     # 1
node src/bin/shenqu.js audit fixtures/blind-stream.jsonl --gate 40; echo $?    # 0
node src/bin/shenqu.js audit fixtures/crawly-stream.jsonl --file fixtures/shenqu-book.json; echo $?      # 0
node src/bin/shenqu.js audit fixtures/marked-stream.jsonl --file fixtures/noDefaults-book.json; echo $?  # 0
node src/bin/shenqu.js audit fixtures/blind-stream.jsonl --file fixtures/noDefaults-book.json; echo $?   # 0
node src/bin/shenqu.js audit fixtures/clean-stream.jsonl --file fixtures/exempt-book.json; echo $?       # 0
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册|量账|溢值|巨写|蔓延|屡改|创笔|足册|量牌|改笔" src/core src/plugin
```

## 实测记录（2026-09-07，本机复跑真实输出）

```
$ node --version
v24.18.0
$ npm ls @deepseek-ai/cordis @deepseek-ai/dsh-tools --depth=0
shenqu-dsh@0.1.0
├── @deepseek-ai/cordis@4.0.2
└── @deepseek-ai/dsh-tools@0.0.1-rc.1
$ npm test
ℹ tests 89
ℹ pass 89
ℹ fail 0
（core 52 + cli 26 + 集成 11，分文件运行各自全绿，0 跳过）
```

A7 的 grep（均无输出，退出码 1）：

```console
$ grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
$ grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
$ grep -rnE "讳形|空绿|…|量牌|改笔" src/core src/plugin
```

十条复现命令的退出码（与手算逐字吻合）：

```console
$ shenqu audit fixtures/clean-stream.jsonl     → 值 0  / 全 / exit 0（取窗认全 1：limit=100 回程 3 行）
$ shenqu audit fixtures/blind-stream.jsonl     → 值 30 / 盲 / exit 1（盲动 1 案）
$ shenqu audit fixtures/marked-stream.jsonl    → 值 30 / 盲 / exit 1（显残通道，markerHits 1）
$ shenqu audit fixtures/crawly-stream.jsonl    → 值 10 / 全 / exit 0（碎览 1 案，点名不咬门）
$ shenqu audit fixtures/mixed-stream.jsonl     → 值 30 / 盲 / exit 1（盲动 30，碎览不双罚 crawls 0）
$ shenqu audit fixtures/blind-stream.jsonl --gate 40 → 值 30 / exit 0（门是审计方的口径）
$ shenqu audit fixtures/crawly-stream.jsonl --file fixtures/shenqu-book.json → 值 20 / 昧 / exit 0（碎览 2 径案）
$ shenqu audit fixtures/marked-stream.jsonl --file fixtures/noDefaults-book.json → 值 0 / 全 / exit 0（残记默认表关）
$ shenqu audit fixtures/blind-stream.jsonl --file fixtures/noDefaults-book.json → 值 0 / 全 / exit 0（窗字段默认表关）
$ shenqu audit fixtures/clean-stream.jsonl --file fixtures/exempt-book.json → 值 0 / 全 / exit 0（豁免 3 径）
```

blind 重罪夹具的审计（盲动 1 案 30 / 带「盲」/ exit 1）：

```console
$ shenqu audit fixtures/blind-stream.jsonl
{
  "sessions": 1,
  "calls": 4,
  "views": 2,
  "writes": 2,
  "cases": 1,
  "score": { "total": 30, "blind": 30, "crawl": 0 },
  "band": "盲",
  "gate": 30,
  "verdict": "fail",
  "ok": false,
  "counts": { "blindActs": 1, "crawls": 0, "partialViews": 1, "fullViews": 1, "exempted": 0 },
  "gauge": { "viewedPaths": 1, "windowReads": 1, "markerHits": 0, "fragTop": [{ "path": "src/api.js", "partials": 1 }] },
  "issues": [
    "盲动 ×1（+30/案）：src/api.js 残见 1 笔（窗 1） —— 审曲面势，以饬五材"
  ]
}
$ echo $?
1
```

材牌块（同一材册两次渲染，shasum 逐字节一致）：

```console
$ shenqu block --file fixtures/shenqu-book.json | shasum
594e4eca73dc1c68e3d81575d5fedb5a3f1bf023  -
$ shenqu block --file fixtures/shenqu-book.json | shasum
594e4eca73dc1c68e3d81575d5fedb5a3f1bf023  -
```

集成账实对账（取窗盲动 + 三窗碎览，导出流离线审计 = 运行时账，40 = 30 + 10）：

```console
（integration.dsh.test.js 集成 10：offline.score.total === live.score.total === 40 ✅
 offline.counts === live.counts ✅（blindActs 1 · crawls 1））
```
