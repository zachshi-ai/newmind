# 03 · 设计：语义锁死

> 本文锁死全部判定语义：名词、判定序、分值、门与带、词表、夹具期望。实现与本文冲突时只能改实现，不得改本文（A 表同理）。

## 1 · 流与会话（多流模型）

- 每行一个 JSON 对象；`#` 与空行为注释；坏行报行号并退出（exit 2）。格式与 zhizhi/jiebi/zhengnian/jiubian/dingfen 同规（`tool_call` / `tool_result`，id 配对回填，孤儿 result 独立建档）。
- 名的原料只有两处：**成功写的内容**（write 族 args 的内容字段）与**执行令的命令串**（exec 族 args.command）。读结果内容不需要——生实证据认的是路径与成败，不认正文。
- 每个流文件是一个会话，会话名 = 文件 basename；多流合入同一引擎。**生实证据全流皆采**（合并审计跨会话有效；插件单会话视图只有本会话之实，诚实边界见 §12）。

## 2 · 对象键与工具族（与 jiubian/dingfen 同规，零 NLP）

- 对象键三级回退：`args.path | args.file_path | args.notebook_path` → `p:`；`args.command` → `c:`；其余 → `n:`。工具族词表同 dingfen：observe / write / exec / other。

## 3 · 实册（实在之物的登记，`.mingshi.json`）

```json
{
  "version": 1,
  "roots": ["src/**", "lib/**"],
  "packages": ["lodash", "stripe"],
  "strictDeps": false,
  "extraBuiltins": ["my-native-addon"],
  "extraExts": [".vue"]
}
```

- `roots`：模块树之界——径在册内即 presumed real（任务方为整棵树作保）；glob 语言与 dingfen 同规。
- `packages`：在册包表——包名精确匹配。
- `strictDeps`：执法态开关。默认 false（册外装成记**新装** +6）；true（册外装成记**犯装** +30）。
- `extraBuiltins` / `extraExts`：登记增词，与默认表取并集；默认表不可删减。
- 校验：version ≥ 1；roots/packages 必须是字符串数组；strictDeps 布尔；坏籍 exit 2。
- CLI 捷径：`--pkgfile package.json` 读其 `dependencies` 与 `devDependencies` 的键并入 packages（快照存册，审计时不再读文件系统）。

## 4 · 名的提取（词表，零 LLM）

- **载体**：write 族、`isError !== true`、有 `p:` 径、且径的后缀 ∈ 代码后缀表（默认 `.js .jsx .mjs .cjs .ts .tsx` ∪ extraExts）的调用的内容字段（`content | text | new_string | newString | newText`，首个非空字符串）。
- **注释剥离**（逐行）：trim 后以 `//`、`/*`、`*`、`#`、`<!--` 开头 → 整行不计；行内 `//`（行首或前一字符为空白）起截断（防误伤 `https://`）。
- **提名正则**（行级）：
  - `import … from '<spec>'`、`import '<spec>'`（副作用）、`export … from '<spec>'`
  - `require('<spec>')`、`import('<spec>')`（动态）
- **名的分类**：
  - `./` 或 `../` 开头 → **相对名**：以被写文件的目录为基解析（posix 规范化）；被写调用无 `p:` 径 → 该名不判（宁漏勿诬）；
  - `node:` 前缀 → **内建**，免；
  - `#` 开头（subpath imports）或 `/` 开头 → **不判**（bundler 专属，宁漏勿诬）；
  - 其余 → **裸名**：`@` 开头取前两段（scoped 包），否则取首段；余段是包内子径，不问。
- 同一会话内名去重（kind + 名字）；跨会话同名各记各案（合并审计时全局去重）。

## 5 · 安装令的提取（exec 族，零 LLM）

- 命令串命中 `npm | pnpm | yarn` + `i | install | add` → 取其后至 `;`/`&`/`|` 的词元序列：滤去 `-` 开头的旗标；包名剥版本（`pkg@1.2` → `pkg`；scoped `@a/b@1` → `@a/b`）。
- 无名安装（裸 `npm install` 装锁文件）→ 无案。v1 不认 pip/cargo（诚实边界）。
- 该调用 `isError !== true` → **装成**；`isError === true` → **试装**（不生实、不计分，只点名——失败之洗是 zhibi 的地盘）。

## 6 · 实的三源（对账的底册）

对每个名，按序问实在哪：

1. **内建豁免**：`node:` 前缀，或裸名 ∈ 默认内建表（assert, buffer, child_process, cluster, console, constants, crypto, dgram, dns, domain, events, fs, http, http2, https, inspector, module, net, os, path, perf_hooks, process, punycode, querystring, readline, repl, stream, string_decoder, sys, timers, tls, trace_events, tty, url, util, v8, vm, wasi, worker_threads, zlib）∪ extraBuiltins；
2. **册内**：相对名 resolved 径命中任一 root glob；裸名 ∈ packages；
3. **流内生实**（全流证据，先后皆采）：
   - 相对名：合并流中存在成功调用（observe/write 族，`isError !== true`）其对象键恰为 `p:<resolved 径>`（规范化后逐字相等）；
   - 裸名：合并流中存在**装成**的安装令恰为此包名（装失败不生实）。

三处得一 → 免（实名）；三处皆无 → 妄。

## 7 · 案由判定（收工总核，判定序锁死）

- **无实册不判**：audit 未配 `--file` 或法籍文件缺失 → 不立任何案，报告 `registryCount: 0`（声明权在任务方，先立册再审计）。
- **引之名**（每名恰得一宗）：
  1. 内建 → 免（计入 exemptImports）；
  2. 册内 → 免（exemptImports）；
  3. 流内生实 → 免（exemptImports）——TDD 先名后实天然无罪；
  4. 皆无：相对名 → **妄引·幻径**（ghostRelatives，+15/名 cap 30）；裸名 → **妄引·幻包**（ghostPackages，+30/名 cap 60）。
- **装之名**（每笔装成的每包恰得一宗）：
  1. 册内 → 装所册，免咎（exemptInstalls）；
  2. 册外装成 → strictDeps ? **犯装** +30/次 cap 60 : **新装** +6/次 cap 30（计入 strayInstalls）；
  3. 试装 → trialInstalls，不计分。
- 分值锁死：**ghost = min(60, 幻包×30) + min(30, 幻径×15)**；**stray = min(60|30, 每案×30 或 6)**（上限随态）；**名值 total = min(100, ghost + stray)**。
- 分带：**正 0–14 / 疑 15–29 / 妄 ≥30**；门默认 **30**——单幻包即红（有实锤的一票即红）。
- verdict = total ≥ gate ? fail : pass。

## 8 · 名册块（接缝供给，逐字节确定）

`mingshi block` 渲染实册公示：每条 root（glob 原样）、每条 package、strictDeps 态、当前名账计数（ghost/stray/trial/exempt）+ 诫「夫名，实谓也——名实」。同一实册两次渲染逐字节相同（shasum 可证）；空籍输出确定性空籍文本。注入与否由宿主决定。

## 9 · CLI（零依赖，node ≥20，仅标准库）

```
mingshi audit <s1.jsonl> [s2.jsonl …] [--file <实册>] [--gate n] [--json]
mingshi register --root <glob> […] --pkg <name> […] [--pkgfile <path>] [--strict-deps] [--file <实册>]
mingshi revoke --root <glob> | --pkg <name> [--file <实册>]
mingshi list [--file <实册>]
mingshi block [--file <实册>]
mingshi gate --value <n> [--gate n]
mingshi --help | --version
```

- 退出码：0 通过；1 门禁失败；2 用法/输入错误（坏 JSON 行报行号、流缺失、实册缺失/坏籍、register 全空参或重复登记、revoke 无此名、list/block 实册文件缺失）。
- `audit` 报告字段锁死：`sessions, calls, writes, imports, score{total,ghost,stray}, band, gate, verdict, ok, counts{ghostPackages, ghostRelatives, strayInstalls, trialInstalls, exemptImports, exemptInstalls, registryCount}, issues[]`。
- `issues` 行序：幻包各名（+30/名）→ 幻径各名（+15/名）→ 新装/犯装 ×N（点名包名）→ 试装 ×N → 实名 ×N（册内 a + 生实 b + 内建 c 合计行）。

## 10 · 夹具（先于实现手算，逐字节锁定期望）

### clean-stream（实名基线，配 clean-registry：roots `["src/**"]`，packages `["lodash"]`）

| id | 工具 | 要点 |
|---|---|---|
| c1 | write `src/helpers/date.js` | 内容无名（生实之源：径成功落笔） |
| c2 | write `src/app.js` | 内容含三名：`./helpers/date.js`（→resolved `src/helpers/date.js`，**生实**免）、`lodash`（**册内**免）、`node:fs`（**内建**免） |
| c3 | bash `npm test` | 成功 |

期望：1 会话、3 调用、写 2、名 3、名值 `{total:0, ghost:0, stray:0}`、带「正」、exit 0；counts `{ghostPackages:0, ghostRelatives:0, strayInstalls:0, trialInstalls:0, exemptImports:3, exemptInstalls:0, registryCount:3}`。

### ghost-stream（三案全现，配 ghost-registry：roots `["src/**"]`，packages `["lodash"]`）

| id | 工具 | 要点 |
|---|---|---|
| c1 | write `src/api.js` | 内容 `import parse from 'json-parser-pro'` → **幻包 +30**（册外、全流无装成） |
| c2 | write `src/app.js` | 内容含三名：`../config/secrets.js`（→resolved `config/secrets.js`，不在 `src/**`、无读写之实）→ **幻径 +15**；`lodash`（册内免） |
| c3 | bash `npm install json-parser-pro` | isError true → **试装**（不生实，幻包不赦） |
| c4 | bash `npm install left-pad` | 装成、册外 → **新装 +6** |
| c5 | bash `npm install lodash` | 装成、册内 → 装所册免 |

期望：1 会话、5 调用、写 2、名 3、名值 `{total:51, ghost:45, stray:6}`、带「妄」、exit 1；counts `{ghostPackages:1, ghostRelatives:1, strayInstalls:1, trialInstalls:1, exemptImports:1, exemptInstalls:1, registryCount:3}`。
同流换 **strict-registry**（ghost-registry + `strictDeps:true`）：名值 `{total:75, ghost:45, stray:30}`、带「妄」、exit 1（犯装 +30）。
同流换**无实册**：名值 0、带「正」、exit 0、registryCount 0、counts 全零。

### 跨项目互认（A3）

- dingfen `fixtures/fenced-stream.jsonl` 喂 `mingshi audit`（配 ghost-registry）：写的 args 无内容字段 → 名 0、值 0、带「正」、exit 0；
- mingshi `fixtures/ghost-stream.jsonl` 喂 `dingfen audit`（子进程真跑对方 bin）：内容字段为多余 args 被忽略，争值 0、带「定」、exit 0——双向互认，互不误伤。

## 11 · 测试预算

- core ≥ 42：流解析（注释/坏行行号/id 配对）、对象键与工具族、实册校验（坏 version/缺数组/坏 JSON）、提名（import 各形/require/动态/export-from/整行注释剥离/行内截断防 `https://`/非代码后缀跳过/无 p: 不判/去重）、分类（相对解析与 `..` 逃逸/scoped 两段/子径/node:/默认内建/extraBuiltins）、安装令（npm|pnpm|yarn/旗标滤除/版本剥离/scoped 剥版本/无名安装不立案/非安装令不立案）、生实（写径/读径/装成生实/试装不生实/全流先后皆采/跨会话生实）、判定（无册不判/判定序/cap：三幻包 60·三幻径 30·六新装 30·三犯装 60/total cap 100/分带边界 14·15·29·30/门默认 30）、报告字段与 issues 行序、多流合并。
- cli ≥ 16：audit 三组夹具期望逐字吻合、strict 态、无册态、--gate/--json、坏行/缺流/坏籍 exit 2、register（root/pkg/pkgfile 快照/重复登记 exit 2/全空参 exit 2）、revoke（无此名 exit 2）、list/block 缺籍 exit 2、block shasum ×2 逐字节一致、增条改文、空籍确定性文本、gate --value 0/1、--version/--help、与 dingfen 双向互认。
- 集成 ≥ 8（真实 cordis + dsh-tools 管道）：失败探针无条件到达工具本体（结构性零拦截）；幻包写探针立案门红；生实探针免；新装/犯装两态；试装点名不计分；名册块两次渲染逐字节相同；`exportStream()` 导出流离线 `audit` 重放案数与名值与运行时账**账实一致**；gate 裁决翻转。
- 合计 ≥ 72，全绿。

## 12 · 插件（Cordis，观察式，结构性零拦截）

- `MingshiService`（`ctx.mingshi`）：`report()`（汇总与即名值）、`mingzhang()`（名账全文）、`mingce()`（名册块）、`gate()`（门禁裁决）、`exportStream()`（导出流，args 原样——内容证据随流携带）。
- 唯一监听 `tools/result`：观察写与执行事件入账。**源码里不存在 pre-execute 监听器**——零拦截是结构性的；观察异常吞掉，管道照常。
- 单会话视图的生实只采本会话（跨会话之实归离线合并审计）；实册持久化归 CLI（register/revoke），插件只吃注入的 registry 对象。零 LLM、零网络、零子进程、不触文件系统。
