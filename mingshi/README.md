# 名实 · Mingshi

> **夫名，实谓也。知此之非此也，知此之不在此也，明其不彼也，则不谓也。**——《公孙龙子·名实论》

一门两千三百年的名家名实之学，能不能精确地解决人工智能的一个真实问题？

能。LLM 编码代理有一个著名病灶：**写下的名字没有实**。`import parse from 'json-parser-pro'`——这个包在环境里不存在，是模型幻觉出来的名字；更险的是它可能**存在**：攻击者批量抢注模型常幻觉的包名（slopsquatting），一装即穿透供应链。幻径之引则让 CI 在收工之后才炸出 `Cannot find module`。事后审计连「这个名字当时有没有实、是谁写下的、装成没装成」都无处问起。名实把这三种失败变成**可登记、可对账、可门禁、可重放**的结构事实——知其不在，则不谓也。

## 它是什么

DeepSeek Harness 的**核名式插件**（Cordis）+ 零依赖审计 CLI + Agent Skill。

本实验室第十九层治理，与前十八层的边界（结构性，不是纪律性）：

| 层 | 思想源头 | 治什么 | 时点 |
|---|---|---|---|
| [知止 zhizhi](../zhizhi/)（手） | 《道德经》 | 行为失控 | pre-execute 拦截 |
| [解蔽 jiebi](../jiebi/)（眼） | 《荀子·解蔽》 | 判断失真 | 审判断账本 |
| [正念 zhengnian](../zhengnian/)（心） | 《六祖坛经》 | 意图漂移 | 契约度量 + 供给 |
| 不贰 buer（习） | 《论语》 | 重蹈覆辙 | 事故过账后 |
| [治未病 weibing](../weibing/)（工） | 《黄帝内经》 | 带病开工 | t=0 体检 |
| [九变 jiubian](../jiubian/)（足） | 《孙子兵法》 | 势途脱钩 | t>0 勘流审计 |
| 立诚 licheng（诺） | 《周易》 | 承诺蒸发 | 承诺立账结账 |
| [有涯 youya](../youya/)（薪） | 《庄子·养生主》 | 会话内失忆 | 见闻账 + 要籍供给 |
| [论世 lunshi](../lunshi/)（言） | 《孟子》 | 输入渠道僭令 | 渠道账 + 越词对账 |
| [定分 dingfen](../dingfen/)（封） | 《商君书·定分》 | 多会话并发争写 | 领分定界 + 多流审争 |
| [捭阖 baihe](../baihe/)（口） | 《鬼谷子·捭阖》 | 信息出境泄密 | 阖籍 + 境账 + 溃值 |
| [法仪 fayi](../fayi/)（尺） | 《墨子·法仪》 | 验收尺自污染 | 翻红窗 + 虚器词表 |
| [直笔 zhibi](../zhibi/)（笔） | 《春秋》 | 失败隐匿洗白 | 笔账 + 讳形表 |
| [豫立 yuli](../yuli/)（备） | 《中庸》 | 险行无备 | 险册 + 备形对账 |
| [度支 duzhi](../duzhi/)（量） | 《礼记·王制》 | 资源无账烧穿 | 制册 + 用账 |
| [二柄 erbing](../erbing/)（柄） | 《韩非子·二柄》 | 人机决策权界 | 柄册 + 命形对账 |
| 终始 zhongshi（程） | 《大学》 | 任务项终始失账 | 事册 + 程账 |
| 效验 xiaoyan（效） | 《论衡·疾虚妄》 | 空转成功 | 效账 + 三问 |
| **名实 mingshi（名）** | **《公孙龙子·名实论》** | **写下的名没有实：幻径之引、幻包之装** | **实册 + 名账 + 收工核名** |

**尺被改是法仪的事（验收器自污染），名无实是名实的事（名字没有对应物）**；任务书里引用的命令在不在是治未病的事（t=0 体检活体环境），Agent 自产之名有没有实是名实的事（t>0 离线流对账实册）。

## 核心概念

- **实册**（`.mingshi.json`）：机器可读的实在之清单——`roots`（树界：径在册内即任务方作保）+ `packages`（在册包表）+ `strictDeps`（执法态开关）；声明权在任务方，无册不判；
- **名的三源**：判定序锁死——**内建**（node: 前缀 ∪ 默认表 ∪ 增词）→ **册内**（root glob / 包名精确）→ **流内生实**（成功读写之径逐字相等、装成之包名；**先后皆采**，TDD 先名后实天然无罪）；三处皆无 → 妄；
- **三案**：**幻包**（册外且全流无装成的包名，+30/名 cap 60）、**幻径**（册外且全流无读写的相对径，+15/名 cap 30）、**新装/犯装**（册外装成：宽态 +6/次留痕，strictDeps 执法态 +30/次）；**试装**（装而未成）只点名不计分；
- **名值**（0–100）＝ ghost + stray，分带 **正 0–14 / 疑 15–29 / 妄 ≥30**，门默认 30——**单幻包即红**；
- **名册块**：接缝处逐字节确定地供给实册公示与名账计数，注入与否由宿主决定；
- **核名**：多流离线重放——生实证据**全流皆采**（合并审计跨会话有效），重放同一批流必得同一判词（置吏不收贿）。

## 快速开始

```bash
cd mingshi
npm install          # 仅集成测试需要官方 @deepseek-ai/* 包（devDependencies）
npm test             # 74 tests, 74 pass

# 开工立册（登记树界与包册；--pkgfile 快照 package.json 的依赖）
mingshi register --root 'src/**' --root 'test/**' --pkgfile package.json

# 收工核名（多流离线重放，退出码可进 CI / 编排器）
mingshi audit session.jsonl --file .mingshi.json

# 名册块（实册公示，逐字节确定）
mingshi block --file .mingshi.json

# 依赖收紧（执法态：册外装成记犯装）
mingshi register --strict-deps
```

审计报告（ghost 妄案夹具，幻包 30 + 幻径 15 + 新装 6 → 名值 51 / 带「妄」/ exit 1）：

```json
{
  "sessions": 1,
  "calls": 5,
  "writes": 2,
  "imports": 3,
  "score": { "total": 51, "ghost": 45, "stray": 6 },
  "band": "妄",
  "verdict": "fail",
  "counts": { "ghostPackages": 1, "ghostRelatives": 1, "strayInstalls": 1, "trialInstalls": 1, "exemptImports": 1, "exemptInstalls": 1, "registryCount": 3 },
  "issues": [
    "幻包 ×1（+30/名）：json-parser-pro —— 名下无实：册外且全流无装成",
    "幻径 ×1（+15/名）：../config/secrets.js → config/secrets.js —— 名下无实：册外且全流无读写",
    "新装 ×1（+6/次）：left-pad —— 册外装成，留痕可见",
    "试装 ×1（不计分）：json-parser-pro —— 装而未成，不生实",
    "实名 ×1：册内 1 + 生实 0 + 内建 0 —— 夫名，实谓也"
  ]
}
```

## 为什么可信

- **模型无关（model-free）**：零 LLM 调用、零提示词注入、零网络、零子进程、零文件系统探测、可逐字重放——core 与插件只吃流与实册；
- **结构性零拦截**：插件源码里不存在 pre-execute 监听器——名册公示 + 事后对账足以自治（知其不在则不谓）；
- **生实全流皆采**：先引后建（TDD）、先引后装、跨会话生实，一律免罪——治理不误伤美德；
- **账实对账**：插件 `exportStream()` 导出流离线 `audit` 重放，案数与名值与运行时账逐字一致（集成测试实证）。

## 诚实边界

1. v1 只认 JS/TS 生态（import/require/export-from 之名、npm/pnpm/yarn 安装之包）——Python/Cargo 留待扩充；
2. 路径别名（`@/x`、tsconfig paths）与 `#` subpath imports 不解析——不判（宁可放过，不可错罚）；
3. 幻觉包名被抢注后安装会**成功**——宽态下它只是新装 +6；名实不假装能分辨真包与抢注的幻包（那是注册表的职责），它的职责是让每个册外之名必须留痕，要拦开 strictDeps；
4. bash 写与无内容字段之写是黑盒——heredoc 里的 import 不判；
5. 无实册不判（registryCount 0）——先立册，再审计。

详细论证：[选书映射](docs/01-book.md) · [场景与伪需求自检](docs/02-problem.md) · [设计语义锁死](docs/03-design.md) · [验收标准与实测](docs/04-acceptance.md)。Agent 协作协议见 [SKILL.md](SKILL.md)。

## 许可

MIT
