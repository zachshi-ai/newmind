# 04 · 验收标准与实测结果

> 原则：验收标准先于实现确定；每一项都绑定可复现的命令；"通过"必须由测试输出佐证，不由文档自述。

## 验收标准表

| # | 验收项 | 标准（先于实现确定） | 验证方式 | 结果 |
|---|--------|----------------------|----------|------|
| A1 | 核心引擎完整性 | 指纹稳定、三条规则语义、变更重置、账本与导出流全路径覆盖，用例 ≥ 40 且全绿 | `npm test`（core 部分） | ✅ 57 用例全绿 |
| A2 | 真实管道拦截（止损） | 在 **npm 官方包** `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 构成的真实工具管道上：同一调用连败 2 次，第 3 次被拒绝；理由含失败历史；账本 `allowed=2, denied=1`（工具本体只跑 2 次） | 集成测试 1 | ✅ |
| A3 | 真实管道拦截（先读后写） | 未读路径写入被拒，理由含路径；成功读取后同路径写入直达工具；健康调用零干扰（对照组 5/5 放行） | 集成测试 2/3/4 | ✅ |
| A4 | 变更重置语义 | 成功的"先读后写"变更清空止损连败，随后重试直达工具本体；`mutationResets` 计数 ≥ 1 | 集成测试 2 + 核心 2 用例 | ✅ |
| A5 | 规则关闭 | `enabled=false` 时全部调用直达工具（含此前必被拦的形态） | 集成测试 7 | ✅ |
| A6 | 对账可证伪 | 运行时导出流与离线重放逐条一致（match=true）；且**人为注入不一致时 match 必须为 false**（机制本身可被测试证伪） | 集成测试 5 + 核心对账 2 用例 | ✅ |
| A7 | CLI 语义 | what-if 报告字段正确；`--fail-on-unverified` 无证据 turn → 退出码 1；`--gated --threshold` 对账一致；坏输入报行号、退出码 2 | CLI 测试 7 用例 | ✅ |
| A8 | 模型无关 | 核心 + 插件零 LLM 调用、零提示词注入 | 代码 grep（下附命令） | ✅ |
| A9 | 文档 | 场景→问题→价值（02）、选书映射（01）、设计语义（03）、本验收表（04）齐备，README 含快速开始 | 人工 + 链接 | ✅ |

## 复现命令

```bash
cd zhizhi
npm install        # 安装官方 @deepseek-ai/* 包（devDependencies，用于集成验证）
npm test           # 65 tests, 65 pass
```

**A8 的 grep 命令**（应无输出）：

```bash
grep -rniE "fetch\(|axios|https?://|openai|anthropic|completions|chat\.create" src/core src/plugin | grep -v "^\s*//"
```

## 实测记录（2026-09-04）

```
$ node --version
v24.18.0
$ npm view @deepseek-ai/cordis version
4.0.2
$ npm view @deepseek-ai/dsh-tools version
0.0.1-rc.1
$ npm test
ℹ tests 65
ℹ pass 65
ℹ fail 0
```

### 关键集成断言（真实管道，非模拟）

- 第 3 次重试的错误信息（模型实际收到的教学式拒绝）：

```
[知止·止损] 调用 probe_flaky（参数 {"tag":"boom"}）已连续失败 2 次，本次重试被确定性规则拦截。
重复同一动作不会产生新结果（知止可以不殆）。请停止原样重试：
重新阅读上一次的完整错误、修改参数或方法、或换一条路径。
失败历史（最近 2 次）：
  第1次失败: simulated failure: boom
  第2次失败: simulated failure: boom
```

- 未读先写的拒绝理由：

```
[知止·先读后写] 以下路径在本次会话中从未被读取过，写入已被拦截：notes/a.md
对没读过的文件做写入是猜测，不是编辑。请先用读取工具查看该文件，再执行写入。
```

### 样例 what-if 审计（fixtures/sample-stream.jsonl）

```console
$ node src/bin/zhizhi.js audit fixtures/sample-stream.jsonl
{"mode":"whatif",
 "totals":{"calls":8,"intercepted":2,
           "interceptedByRule":{"stopLoss":1,"readBeforeWrite":1},"turns":2,"evidence":1},
 "turns":[{"id":"t1","calls":5,"intercepted":2,"evidence":0,"verified":false},
          {"id":"t2","calls":3,"intercepted":0,"evidence":1,"verified":true}],
 "unverifiedTurns":[{"id":"t1","calls":5}],
 "waste":{"savedRoundTrips":2,"humanUnit":"2 轮模型往返"},
 "verdict":"pass"}
```

## 开发过程中被测试逼出来的设计修正（留档）

1. **`arguments` vs `args`**：管道执行对象的参数字段是 `arguments`，直接透传导致指纹永远失配、规则全哑——集成测试第一个抓到的真 bug。
2. **deny 回声**：被拦调用会以失败结果回声到 `tools/result`，不识别会导致拦截给自己记账（连败数虚增、导出流重复）。凭指纹去重。
3. **变更重置**：初版语义下"改完代码再跑测试"被误拦。增加"成功变更清空连败 + `mutationResets` 留痕"，兼顾合法重试与防作弊可见性。

三条都来自"先写断言、再跑真实管道"的顺序——这正是验收标准先于实现的意义。
