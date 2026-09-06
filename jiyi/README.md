# 稽疑 · Jiyi — DeepSeek Harness 的稽问层

> **汝则有大疑，谋及乃心，谋及卿士，谋及庶人，谋及卜筮。**——《尚书·周书·洪范》
>
> 谋及乃心（自己的判断）只是四谋之一，且在洪范的定案规则里**从不单独作数**：即使「汝则从」，也须「龟从，筮从」才成其吉。

## 它解决什么问题

Agent 面对环境的一切未知——命令怎么跑、仓库什么规矩、构建怎么触发——用内心猜测代替环境稽问：猜 `npm run build` 而 scripts 里根本没有、不读 AGENTS.md 就写代码踩进 lint、不看 Makefile 就裸跑。猜错的每一笔都是真实的失败调用与返工（duzhi 记得出失败笔数、jiubian 记得出盲捶次数，但都以失败已发生为前提），而「失败之前那一步缺失——首动之前问没问」全仓无账，事后审计连问都无处问起。

稽疑把它变成账目：**疑册**（任务方登记必问清单）→ **问凭据**（成功读取 ∪ 命令含名，两通道得一即免）→ **问账**（逐疑条案别：谋及/空疑/迟问/独谋/未见/无动）→ **谋值**分带门禁（谋 0–14 / 疏 15–29 / 独 ≥30，门 30）→ **稽块**（接缝处逐字节确定的问况供给）。

## 快速开始

```bash
cd your-repo
jiyi register --ask AGENTS.md --on write --ask package.json --on exec   # 开工立册
# ……Agent 作业，产生 session.jsonl……
jiyi audit session.jsonl --file .jiyi.json    # 收工稽问；exit 1 = 门禁红，可进 CI
jiyi block --file .jiyi.json                  # 稽块公示（逐字节确定）
```

- **默认形表**：未登记时 AGENTS.md / CLAUDE.md / README.md（on write）默认生效；默认条「未见不罚」（环境里可能没有），显式登记即任务方作保（独谋 +15/条）；
- **清白道在册**：读取 404 = 空疑（疑自解）、`cat package.json` = 命令通道认问、先动后问 = 迟问（+5，毕竟问了）、触发域内无动作 = 不判；
- **零依赖**：核心与 CLI 零 npm 依赖、零 LLM、零网络、零子进程、零文件系统探测——离线流对账，可验尸任何历史会话。

## 包结构

```
src/core/     引擎（ji.js 判定 + wen.js 凭据 + askfile.js 疑册 + jice.js 稽块 + audit.js 离线审计）
src/bin/      零依赖 CLI（audit / register / revoke / list / block / gate）
src/plugin/   Cordis 插件（tools/result 观察式，结构性零拦截——无 pre-execute 监听器）
fixtures/     验收夹具（头注释载明先于实现的手算期望）
docs/         01 选书映射 · 02 问题定义 · 03 设计语义锁死 · 04 验收标准
test/         core + cli + integration（真实 @deepseek-ai/cordis × dsh-tools 管道）
```

## 文档

- [docs/01-book.md](docs/01-book.md) — 选书：《尚书·洪范》稽疑章的逐条映射
- [docs/02-problem.md](docs/02-problem.md) — 谁在什么场景下的什么问题、价值何在、伪需求自检
- [docs/03-design.md](docs/03-design.md) — 设计语义锁死（判定序、计分、边界行）
- [docs/04-acceptance.md](docs/04-acceptance.md) — 验收标准与实测结果
- [SKILL.md](SKILL.md) — Agent 协作协议

## 许可

MIT
