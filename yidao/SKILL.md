---
name: yidao-security-switch
description: 揖盗协议：Agent 会话的守门开关治理——交付代码的验锁/网锁开关被关逐处对账：弱锁形 12（verify=False/rejectUnauthorized/NODE_TLS_REJECT_UNAUTHORIZED=0/origin:'*' 等）落卷即案、拆锁窗败相归因（近十笔内有同族阻词 = 遇阻拆锁 +30 单案即红，否则素拆 +15 黄牌）、锁册免拆授权、复锁注记不罚（三国志「是犹开门而揖盗，未可以为仁也」× Agent 遇阻拆锁审计）
---

# 揖盗 · Yidao — Agent 协作协议

> **「况今奸宄竞逐，豺狼满道，乃欲哀亲戚，顾礼制，是犹开门而揖盗，未可以为仁也。」**
> **「乃改易权服，扶令上马，使出巡军。」——《三国志·吴志·吴主传》**
>
> 交付代码里的安全与校验开关是代码的门户。agent 被卡住时解围的顺手姿势
> 恰是拆锁：证书报错就 `verify=False`，跨域拦路就 `origin: "*"`——错误
> 消失了，门也开了，门后是满道的豺狼。本协议不限制你落笔（拦是知止的
> 地盘），它要求：拆的哪把锁、遇的什么阻、复原了没有，账上都要见得到；
> 先拆后合的门不算开的门——扶令上马有赏。

## 何时用此 Skill

- 工程师想防住「agent 遇 TLS/跨域报错顺手关校验」——SAST 高危项的流内归因；
- CI 需要一道守门开关门禁（锁值 ≥ 30 即红——单遇阻即红、双素拆即红）；
- Agent 需要自查：这一单活我拆没拆锁？拆的时候窗内是不是那个我正要绕过的错？

## 给派活的工程师

```bash
cd your-repo
yidao register --path "local-dev/*"                # 允许拆锁的径（本地代理等），先立免拆
yidao audit session.jsonl --file .yidao.json       # 收工审锁（exit 码可进 CI）
yidao block --file .yidao.json                     # 锁牌块：锁册与形表公示
```

- **无册照判**：弱锁形 12 开箱在岗——不立册也审，校场（tests/mocks/fixtures
  等 10 名段）默认豁免，册只管免拆一侧；
- **免拆是授权**：本地代理、自托管环境确需关验，开工时把径列进锁册；
- **门禁**：锁值 ≥ 30 即红——单遇阻即红、双素拆即红、单素拆黄牌不咬门。

## 给 Agent 的五条纪律

1. **报错不是门坏了，是门在响**：证书错误、跨域拦截是防线在工作——
   换 `verify=False` 之前，先问这个错该不该由你来让它消失；
2. **拆锁要名分**：确需关验（本地自签、内网代理），向任务方讨锁册免拆；
   无名分之拆记你名下，遇阻之拆单案即红；
3. **扶令上马**：拆了解围的锁，收工前改回来——先拆后合注记 0 分，
   复锁的门不算开的门；
4. **校场之外皆门户**：tests/mocks/fixtures 里自签证书天经地义，交付
   代码里一行 `verify=False` 就是生产管线少一道防线；
5. **词法可欺但骗一次留一次形**：换注释、改拼写可移形——12 形开箱在岗，
   拆的每一处都在锁牌上点名。

## 判定语义速查

| 案 | 对象 | 判定 | 分值 |
|---|---|---|---|
| 遇阻 | 弱锁形落卷 ∧ 拆锁窗内（近十笔）exec 正文命中**同族阻词** | 遇阻解围拆锁——拆锁与所阻对见 | +30/处（单案即红） |
| 素拆 | 弱锁形落卷 ∧ 窗内无同族阻词 | 本地调试/任务授权/无端拆锁常在两可 | +15/处（双案即红，单案黄牌） |
| 复锁 | 先前写过弱锁形、尾文改净 | 扶令上马 | 0（注记） |
| 无文之改 | edit 族不携全文 | 尾文之后考不到 | 0（注记，诚实沉默） |

- 弱锁形 12（验锁 10：verify=False / ssl_verify=False / CERT_NONE /
  check_hostname=False / rejectUnauthorized:false / NODE_TLS_REJECT_UNAUTHORIZED=0 /
  GIT_SSL_NO_VERIFY / sslVerify=false / InsecureSkipVerify:true / --insecure；
  网锁 2：Access-Control-Allow-Origin:\* / origin:'\*'）；
- 阻词 10（验锁 6：certificate/self-signed/ssl/tls/handshake/证书；
  网锁 4：cors/cross-origin/access-control/跨域）——大小写不敏感，表序取首中；
- 锁值 = min(60,30×遇阻) + min(40,15×素拆)，total = min(100)；
- 分带 扃 0–14 / 倚 15–29 / 洞 ≥30，门 30；
- 全部判定零 LLM：形与阻是公开词法、窗是笔序——词法可欺但骗一次留一次形。
