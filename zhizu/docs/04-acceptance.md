# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。
> 本表的 A2 含**先于实现手算**的期望值（见 docs/03 §10 与夹具内容）；实现与测试若与手算冲突，只能改实现，不得改本表。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心判定语义 | 流解析（`#` 注释、坏行报行号、id 配对回填、result content 回填、孤儿 result 建档）；对象键与工具族同 mingshi；径规整（`./` 前缀与尾斜杠归一）防同文件异写之诬；入口滤：`isError===true` 一律不入账；巨写判定序锁死（改笔 ∧ 行数>hugeLines → 立案；创笔 ∧ 行数>hugeLines → 创笔注记不计分；行数取内容字符串值按真实换行切分，不吃 JSON 序列化形）；蔓延收尾判定（父目录去重 > fanDirs 或文件数 ≥ fanFiles → 单案 +20）；屡改增量记账（超出免额每满 2 笔一案 +10，新案才记分，与离线重放前缀一致）；exec 黑盒不判；豁免径三宗全免；分值 huge=min(60,30×巨写)、fan=min(20,20×蔓延)、churn=min(20,10×屡改)、total=min(100,三和)；分带 俭 0–14 / 盈 15–29 / 溢 ≥30；门默认 30——core 用例 ≥ 40 且全绿，断言恰好该分值 | `npm test`（core 部分） | ✅ 58 用例全绿 |
| A2 | 夹具分数（先于实现手算定死） | `modest-stream`：3 调用、写 2、cases 0、溢值 `{total:0, huge:0, fan:0, churn:0}`、带「俭」、exit 0、counts `{hugeWrites:0, fanouts:0, churns:0, freshNotes:1, exempted:0}`；`bloated-stream`：3 调用、写 2、cases 2、溢值 `{total:60, huge:60, fan:0, churn:0}`、带「溢」、exit 1；`sprawling-stream`：8 调用、写 8、cases 1、溢值 `{total:20, fan:20}`、带「盈」、exit 0、freshNotes 0（创笔但行小不超阈）；`churny-stream`：12 调用、写 10、cases 1、溢值 `{total:10, churn:10}`、带「俭」、exit 0；`mixed-stream`：10 调用、写 9、cases 2、溢值 `{total:50, huge:30, fan:20, churn:0}`、带「溢」、exit 1、freshNotes 0；附加口径：`churny + --churn-free 2` → 20 盈 exit 0；`bloated + --huge-lines 500` → 0 俭 exit 0；`modest + --file zuzu-book.json`（exempt 含 src/generated）→ 0 俭 exit 0、exempted 1 | core 断言 + CLI 复现 | ✅ 八条复现命令退出码与分数逐字吻合(0/60/20/10/50;附加口径 20 盈、0 俭、0 俭 exempted 1);定标勘误披露:初稿 modest/bloated 误把读计入「写 3」、mixed 误写「写 10」、低行数创笔误注记(sprawling 8/mixed 7)——四处在实现开始前修正 docs/03 §10 与本表,分数期望不受影响(zhongshi/jiyi 先例) |
| A3 | 跨项目互认 | zhizhi 的 `fixtures/sample-stream.jsonl` 喂 `zhizu audit`（默认阈）：8 调用、写 2、溢值 0、带「俭」、exit 0（老流无 content，巨写维度诚实沉默；两径各 1 笔在免额内）；dingfen 的 `fixtures/fenced-stream.jsonl` 喂 `zhizu audit`：6 调用、写 2、溢值 0、带「俭」、exit 0——同格式流跨项目可审、互不误伤 | CLI 测试 | ✅ 双流零误伤(zhizhi sample 8 调用/写 2/0 俭;dingfen fenced 6 调用/写 2/0 俭);勘误:zhizhi 流实为 8 对调用(4 失败 bash+1 成功 bash+write+read+edit),定标稿写 7 系手算漏数,实现前修正 |
| A4 | CLI 语义 | `audit` 多流 + `--file` + `--exempt` + `--huge-lines/--fan-dirs/--fan-files/--churn-free` + `--gate` + `--json`；坏 JSON 行 / 流缺失 / 坏册 → exit 2；`register --exempt`（全空参 → exit 2）；`revoke` 无此名 → exit 2；`list`/`block` 册缺失 → exit 2；`gate --value` 按门判 0/1；`--version`/`--help` 正常——CLI 用例 ≥ 14 | CLI 测试 | ✅ 29 用例全绿 |
| A5 | 量牌块逐字节确定 | 同一足册两次 `zhizu block` shasum 相同；增一豁免子串后文本改变；全缺省册输出确定性文本 | CLI shasum 复现 | ✅ 逐字节一致(shasum 1e334ab6…×2);增豁免后文本改变;全缺省确定性文本 |
| A6 | 真实管道上的观察式插件（零拦截） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上挂载知足插件：失败探针也无条件到达工具本体（结构性零拦截）；对既有文件的大改探针立案门红；创笔大写免记；同径反复写探针屡改计案；蔓延多目录写探针立案；豁免径在册全免；量牌块两次渲染逐字节相同；`exportStream()` 导出流离线 `audit` 重放，案数与溢值与运行时账**账实一致**；gate 裁决翻转——集成用例 ≥ 8 | 集成测试 | ✅ 10 用例全绿(账实一致 50 = 巨写 30 + 蔓延 20) |
| A7 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测；插件源码无 pre-execute 监听器（结构性零拦截）；源码注释不携带相邻各层的机制词（独立性的结构性自证） | grep（下附命令，应无输出） | ✅ 三组 grep 均无输出 |
| A8 | 测试总量 | 全部用例 ≥ 65 且全绿（core + cli + 集成） | `npm test` | ✅ 97 tests, 97 pass(core 58 + cli 29 + 集成 10,0 跳过) |
| A9 | 文档 | 选书映射（01）、场景价值与伪需求自检（02）、设计语义锁死（03）、本验收表（04）、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新 | 人工 + 链接 | ✅(本行即 A9 验证) |

## 复现命令

```bash
cd zhizu
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test
node src/bin/zhizu.js audit fixtures/modest-stream.jsonl; echo $?      # 0
node src/bin/zhizu.js audit fixtures/bloated-stream.jsonl; echo $?     # 1
node src/bin/zhizu.js audit fixtures/sprawling-stream.jsonl; echo $?   # 0
node src/bin/zhizu.js audit fixtures/churny-stream.jsonl; echo $?      # 0
node src/bin/zhizu.js audit fixtures/mixed-stream.jsonl; echo $?       # 1
node src/bin/zhizu.js audit fixtures/churny-stream.jsonl --churn-free 2; echo $?   # 0
node src/bin/zhizu.js audit fixtures/bloated-stream.jsonl --huge-lines 500; echo $? # 0
node src/bin/zhizu.js audit fixtures/modest-stream.jsonl --file fixtures/zuzu-book.json; echo $? # 0
```

**A7 的 grep 命令**（应无输出；第一条用 import/调用的精确形态，避免误伤数据与注释散文；第三条为机制词防撞自检——相邻各层的机制词不得出现在本层源码）：

```bash
grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册" src/core src/plugin
```

## 实测记录（2026-09-07，本机复跑真实输出）

```
$ node --version
v24.18.0
$ npm ls @deepseek-ai/cordis @deepseek-ai/dsh-tools
zhizu-dsh@0.1.0
├── @deepseek-ai/cordis@4.0.2
└── @deepseek-ai/dsh-tools@0.0.1-rc.1
$ npm test
ℹ tests 97
ℹ pass 97
ℹ fail 0
（core 58 + cli 29 + 集成 10，分文件运行各自全绿，0 跳过）
```

A7 的 grep（均无输出，退出码 1）：

```console
$ grep -rniE "from ['\"](node:)?(child_process|fs|http|https|net|tls|dns)|require\(['\"]|fetch\(|axios|XMLHttpRequest|WebSocket|openai|anthropic|completions|chat\.create|spawnSync|execSync|child_process\.|readFileSync|writeFileSync|existsSync" src/core src/plugin | grep -v "^\s*[*/ ]"
$ grep -rnE "ctx\.on\(['\"]tools/pre-execute" src/plugin
$ grep -rnE "讳形|空绿|史词|实录|翻红窗|虚器|废尺|绳墨|器册|险册|备形|裸险|豫牌|遁引|制册|用账|余量|逾案|渍请|侵柄|倒持|柄册|幽项|空终|半途|程账|空言|回令|离效|陈效|效账|幻包|幻径|犯装|试装|实册|绳账|咎值|轻诺|失诺|疑册|独谋|迟问|空疑|稽块|缄笔|略测|避检|声册|谏牌|壅值|复见|复命|殆值|要籍|陈账|势账|盲捶|游骑|悬账|变方|越词|涉命|僭行|世牌|诫块|病灶|四诊|医嘱|传变|拂拭|尘值|攀缘|息尘|蔽值|省身|贰过|阖籍|境账|阖门|溃值|分册|界碑|争值|争写|名册" src/core src/plugin
```

八条复现命令的退出码（与手算逐字吻合）：

```console
$ zhizu audit fixtures/modest-stream.jsonl      → 值 0  / 俭 / exit 0（创笔注记 1）
$ zhizu audit fixtures/bloated-stream.jsonl     → 值 60 / 溢 / exit 1（巨写 2 案）
$ zhizu audit fixtures/sprawling-stream.jsonl   → 值 20 / 盈 / exit 0（蔓延 1 案）
$ zhizu audit fixtures/churny-stream.jsonl      → 值 10 / 俭 / exit 0（屡改 1 案，点名不咬门）
$ zhizu audit fixtures/mixed-stream.jsonl       → 值 50 / 溢 / exit 1（巨写 30 + 蔓延 20）
$ zhizu audit fixtures/churny-stream.jsonl --churn-free 2 → 值 20 / 盈 / exit 0（屡改 3 案）
$ zhizu audit fixtures/bloated-stream.jsonl --huge-lines 500 → 值 0 / 俭 / exit 0（阈值放松）
$ zhizu audit fixtures/modest-stream.jsonl --file fixtures/zuzu-book.json → 值 0 / 俭 / exit 0（豁免 1）
```

bloated 重罪夹具的审计（巨写 2 案 60 / 带「溢」/ exit 1）：

```console
$ zhizu audit fixtures/bloated-stream.jsonl
{
  "sessions": 1,
  "calls": 3,
  "writes": 2,
  "cases": 2,
  "score": { "total": 60, "huge": 60, "fan": 0, "churn": 0 },
  "band": "溢",
  "gate": 30,
  "verdict": "fail",
  "ok": false,
  "counts": { "hugeWrites": 2, "fanouts": 0, "churns": 0, "freshNotes": 0, "exempted": 0 },
  "gauge": { "writePaths": 1, "writeDirs": 1, "maxLines": 450, "churnTop": [{ "path": "src/api.js", "writes": 2 }] },
  "issues": [
    "巨写 ×2（+30/案）：src/api.js 行数=450、src/api.js 行数=420 —— 筹量牛力，不令过分"
  ]
}
$ echo $?
1
```

mixed 三罪齐夹具的 issues（行序锁死：巨写 → 蔓延）：

```console
$ zhizu audit fixtures/mixed-stream.jsonl --json | jq -r '.issues[]'
巨写 ×1（+30/案）：src/big.js 行数=450 —— 筹量牛力，不令过分
蔓延 ×1（+20）：目录 8 · 文件 8 —— 众鸟集之，树有枯折之患
```

量牌块（同一足册两次渲染，shasum 逐字节一致）：

```console
$ zhizu block --file fixtures/zuzu-book.json | shasum
1e334ab638872d1af2d11383b4f1b718c26e4e08  -
$ zhizu block --file fixtures/zuzu-book.json | shasum
1e334ab638872d1af2d11383b4f1b718c26e4e08  -
```

集成账实对账（先读后巨写 + 七目录蔓延，导出流离线审计 = 运行时账，50 = 30 + 20）：

```console
（integration.dsh.test.js：offline.score.total === live.score.total === 50 ✅
 offline.counts === live.counts ✅（hugeWrites 1 · fanouts 1））
```
