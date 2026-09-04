# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。标准一经定稿不得为实现缺口事后删改。

## 验收标准表（实现前定稿）

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 流解析兼容性 | 共享会话流格式全路径：`#` 与空行注释合法、坏 JSON 报行号；带 id 的 call/result 正确配对且 id 首见为准；无 id 旧格式 result 并入紧邻其前 call；孤儿 result 独立建档（`isError:null`）；`turn_start/turn_end` 等非工具事件跳过 | core 用例 | ⬜ |
| A2 | 复见案判定语义 | 基线只认装载类（read/cat/view 精确）**成功**调用；同路径成功写入后的再装载是「鲜」不入罪；基线之后夹有失败装载（设瑕）免记；检索类（grep/glob/search/ls/list/find）与 `n:` 对象永不入复见账、不设基线；同对象紧邻记并一案、夹任何其他调用即分案；路径不归一化（`./a` 与 `a` 两对象）；复见三连读记 2 免 1（一案） | core 用例 | ⬜ |
| A3 | 复命案判定语义 | 基线只认 exec 族同串命令**成功**调用；其间**任意对象**成功写族调用全库重置（写后同串重跑不入罪）；同命令失败执行设瑕免记；并案/分案规则与复见同款；复见与复命互不干扰（同流并行记账） | core 用例 | ⬜ |
| A4 | 殆值与分带 | 公式 `min(100, min(60,12×复见案)+min(40,8×复命案))`；分带边界逐点可证（14→新硎、15→割、29→割、30→折）；`liveScore` 与离线重放**前缀一致**（进行中已构成案的段计入即时分）；门默认 30，`--gate` 可覆盖 | core 用例 + fixtures 三夹具手算期望值（fresh=0/新硎、hazy=20/割、amnesiac=32/折） | ⬜ |
| A5 | 要籍块逐字节确定 | 同一账本状态两次渲染逐字节相同（shasum 可证）；`#k` 随渲染递增且仅此一处不同；陈账按末次触碰位次升序、逐行编号；无时间戳字段；无陈账输出固定括号行；末行「—— 本块由确定性规则生成；重放同一流必得同一文本。」 | 渲染器单测 + CLI 复现 | ⬜ |
| A6 | 真实管道上的巡忆式插件（结构性零拦截） | 挂载 npm 官方 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 真实管道：插件源码无 pre-execute 监听；原样重读/重跑探针全部无条件到达工具本体、管道零反噬；report/jianwen/yaoji/gate 全链路可用；要籍块 `#k` 递增；`exportStream()` 与离线 `audit` 对同一流**账实对账**（deepEqual 分数与案数）；观察异常不冒泡 | 集成测试 | ⬜ |
| A7 | CLI 语义 | `audit`：干净流 → 0，折带流 → 1，坏文件/坏流 → 2；`--gate` 可翻 verdict（殆值 20 的流 `--gate 15` 从 pass 翻 fail）；`--json` 输出完整报告（含 breakdown 与逐案清单）；`yaoji` 默认纯文本、`--json` 包装；`gate --value` 子命令裁决；未知命令/缺参数 → 2 | CLI 测试 | ⬜ |
| A8 | 七层互不越界 | 插件与核心：无 pre-execute 监听器；无判断账本字段（alternatives/disconfirming）、无本愿契约字段（wish/anchors）、无任务书字段（charter）、无跨会话错误账本、无势账字段（盲捶/悬账/游骑/失机值）、无绳账字段（speech/咎值）——grep 应无输出 | 代码 grep（复现命令见下） | ⬜ |
| A9 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入、零网络、零子进程——grep `fetch\|http\|child_process\|openai\|anthropic\|completion` 应无输出 | 代码 grep（复现命令见下） | ⬜ |
| A10 | 测试总量 | 全部用例 ≥ 72 且全绿（core + cli + 集成，0 失败） | `npm test` | ⬜ |
| A11 | 文档与登记 | docs 01–04、SKILL.md、README 快速开始齐备；根 README 项目索引与方向登记更新（含与七层的边界行） | 人工 + 链接 | ⬜ |

## 复现命令

```bash
cd youya
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 见 A10 实测
node src/bin/youya.js audit fixtures/amnesiac-stream.jsonl; echo "exit=$?"    # 期望 殆值 32（折）exit=1
node src/bin/youya.js audit fixtures/hazy-stream.jsonl; echo "exit=$?"        # 期望 殆值 20（割）exit=0
node src/bin/youya.js audit fixtures/fresh-stream.jsonl; echo "exit=$?"       # 期望 殆值 0（新硎）exit=0
```

**A8 的 grep 命令**（应无输出——不越七层地盘）：

```bash
grep -rn "tools/pre-execute" youya/src/            # 零拦截是结构性的
grep -rnE "alternatives|disconfirming" youya/src/  # 解蔽地盘
grep -rnE "\bwish\b|anchors" youya/src/            # 正念地盘
grep -rn "charter" youya/src/                      # 治未病地盘
grep -rnE "盲捶|悬账|游骑|失机" youya/src/          # 九变地盘
grep -rnE "绳账|咎值|speech" youya/src/            # 立诚地盘
grep -rnE "过账|省身|贰过" youya/src/              # 不贰地盘
```

**A9 的 grep 命令**（应无输出——模型无关）：

```bash
grep -rnE "fetch|https?://|child_process|openai|anthropic|completion|prompt" youya/src/
```

## 实测结果（实现后回填，数字一律来自本机复跑）

| # | 实测 | 状态 |
|---|------|------|
| A1–A11 | （待实现后以真实测试输出回填） | ⬜ |
