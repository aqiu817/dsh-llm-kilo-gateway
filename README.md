# dsh-llm-kilo-gateway

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **Kilo Gateway 免费模型**提供商插件。

自动发现 Kilo Gateway 的免费模型目录，把它们注册成 Harness 里可直接使用的 provider，
并提供一个设置页：你自己的 API Key、可用模型列表、模型增减日志、按模型累计的 Token 统计。

> **一句话结论**：它让 Harness 零成本地用上十几个免费模型，但**这些免费模型的提示词与输出可能被上游记录并用于训练**。不要用它处理任何敏感内容。

---

## ⚠️ 风险与限制（请先读这一节）

**以下每一条都标注了来源。官方条款部分引用 Kilo 的公开文档原文，实测部分是本插件对真实 API 响应的观察。**

### 1. 免费模型的输入可能被记录并用于训练

这是本插件在模型目录里**实测**到的：目录共 401 个模型，其中 16 个是免费的，
**16 个全部**标注 `mayTrainOnYourPrompts: true`。
Kilo 官方文档对此的表述是：

> Auto Free 可能会把你的请求路由到**会记录提示词与输出、并用它们改进自身服务**的 provider。
> 使用 Auto Free 时**不要提交个人或机密数据**。

NVIDIA 系免费端点的官方说明更严格：

> **仅供试用 —— 不要提交个人或机密数据。** 你的使用会被记录，用于安全目的以及改进 NVIDIA 的产品与服务。

### 2. Kilo 服务条款授予的许可范围很宽

Kilo 服务条款（[kilo.ai/terms](https://kilo.ai/terms)，最后更新 **2026-09-30**）第 7(A) 条规定：

> 上传数据即授予 Kilo 一项「**永久的、不可撤销的、已全额付讫的、免版税的、全球性的、可再许可的、可转让的**」权利与许可，
> 「用于提供和改进服务及 Kilo 的其他产品与服务」。

同条还写明：

> 如果你选择不授权任何 AI 模型把你的 Customer Data 用于**训练**目的，你**可能无法使用某些 AI 模型**。

第 9 条提供的退出选项是**营销邮件**，不是 AI 训练。社区讨论（非官方声明）称
零数据保留（ZDR）目前似乎限于企业/团队方案。**本插件不改变这些条款，也无从规避它们。**

### 3. 免费额度与限流

- **匿名访问**：官方文档称免费模型对已认证与匿名用户都可用，**匿名用户限 200 请求/小时/IP**。
- **上游限流**：官方文档称「部分免费模型可能被上游 provider 限流」。
  实测中免费池会返回 `429 Provider returned error / request limited concurrency reached`，
  这是上游的并发上限，不是配置问题。
- **免费不等于无成本**：目录里这些模型 `pricing` 全为 0，但上游随时可能调整。

### 4. 免费模型会消失

免费目录是**动态**的。实测中 3 个模型带有明确的到期日：

| 模型 | 到期 |
| --- | --- |
| `poolside/laguna-s-2.1:free` | 2026-10-31 |
| `poolside/laguna-xs-2.1:free` | 2026-10-31 |
| `dots-studio/dots-3-note-preview:free` | 2026-12-31 |

其余模型没有到期日，但这不代表长期可用。**任何依赖免费模型的工作流都要做好模型随时下线的准备。**
本插件的设置页会记录模型增减日志，便于你发现变化。

### 5. 本插件的其它已知边界

- **免费池的稳定性不可控。** 实测遇到上游返回 400（某模型声明的输出上限高于其上游实际接受值）、
  429（并发限流）、以及「HTTP 200 但内容为空」。插件会把可恢复的失败正确分类并重试，
  但重试预算用尽后仍会失败。
- **推理档位只反映目录所声明。** 目录说有哪些档位就显示哪些，不猜。
- **`expires` 只显示不过滤。** 到期日会显示在设置页，但不用于过滤已过期模型。
- **端口占用即禁用通知端点。** 见「通知链路」；这是刻意的设计。
  注意**两个宿主同时运行时，旧进程会占住端口**，导致新进程的端点是关闭的。

### 6. 本仓库不对上游行为作任何担保

本插件是**第三方客户端**，与 Kilo 无隶属关系。上游 API 的字段、限流政策、
训练的条款、甚至端点地址都可能随时变化。出现问题时请先确认是上游变更还是插件缺陷。

---

## 功能特性

- 🔄 **自动发现免费模型** — 从 Kilo Gateway 目录读取 `isFree: true` 的模型，无需手工维护列表
- 📅 **定时刷新** — 默认每 24 小时刷新，可在设置页调整
- 🔔 **变更通知** — 模型新增/移除时弹出通知，并写入增减日志
- 🧰 **完整工具调用** — 请求带 `tools`，解析流式 `delta.tool_calls`，组装成可执行的工具块
- 🧠 **推理强度** — 从目录的 `opencode.variants` 读出每个模型**真实声明**的档位
- 🖼️ **图像输入** — 按目录声明的 `architecture.input_modalities` 判断，图片以 data URL 送上游
- 📊 **Token 统计** — 按模型累计调用次数与各类 token（含缓存读写单列）
- 🔑 **自带 Key 输入** — 在设置页粘贴 API Key，写入 Harness 凭据系统，**永不回显**
- 📋 **可用模型列表与增减日志** — 设置页内查看目录现状与历史变化
- ♻️ **上游错误重试** — 状态码映射到 Harness 的重试词汇，`429`/`5xx`/超时自动重试

## 依赖要求

| 依赖 | 版本 |
| --- | --- |
| Node.js | **≥ 22** |
| DeepSeek Harness | **0.2.x**（在 0.2.0-rc.2 上验证） |

插件的运行时包（`dsh-llm`、`cordis`、`schemastery` 等）声明为 **`peerDependencies`**，
版本范围是 `*`，并在 `peerDependenciesMeta` 里**全部标为 `optional`**。两条都不是随手写的：

- **必须是 `peerDependencies`。** Harness 在决定「把插件的裸导入重定向到哪一份实例」时，
  读的正是插件清单元数据里的 `peerDependencies` 键名（宿主源码里是 `readPeerNames`）。
  这些名字若只出现在 `dependencies` 里，重定向就不会发生，插件会拿到一份私有的
  `dsh-llm` 副本 —— 与宿主不是同一个实例，适配器注册不会生效。
- **范围必须是 `*`。** 宿主会拿 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 这些 peer 的
  **版本范围**去比对**运行中的 dsh 运行时版本**（不是包自己的版本）。实测把 `dsh-llm`
  钉成 `^0.1.5-rc.2` 时，宿主直接拒绝加载：

  ```
  dsh: skipping profile bundle "...": Plugin dsh-llm-kilo-gateway@1.0.0 is
  incompatible with dsh 0.2.0-rc.2: peerDependencies {"@deepseek-ai/dsh-llm":"^0.1.5-rc.2"}
  ```

  钉死范围会让插件在 rc 升级后自己锁死自己，所以留 `*`，由宿主的兼容性检查把关。
- **必须标 `optional`。** 这是给 npm 看的，与宿主无关（宿主只读键名，不看 `meta`）。
  npm 的 `latest` 标签指向 `@deepseek-ai/dsh-llm` 的**旧版本** `0.0.1-rc.1`，
  不标 optional 时 npm 会照着自己解析出一份错版本的副本装进消费者工程。
  实测标注后 `added 1 package`，consumer 里不再多出 `@deepseek-ai/*` 目录；
  而插件的导入仍解析到宿主提供的那一份（已验证 `require.resolve` 指向同一文件）。

## 安装

```bash
# 从 npm 安装到 profile（本例为 web profile）
dsh plugin --profile web add dsh-llm-kilo-gateway
```

从源码安装用 `link:`（符号链接），改源码即刻生效：

```bash
dsh plugin --profile web add link:/path/to/dsh-llm-kilo-gateway
```

**桌面端**：profile 名是 `desktop`，命令相同，但要用桌面端自带的 CLI
（宿主会拒绝 `dsh --profile desktop`，因为该 profile 由 Electron 应用独占管理）。

装完**重启宿主**。模型选择器里会出现 Kilo Gateway 分组，「设置 → 插件」出现设置卡片。

### 从旧包名升级

本插件早期叫 `@deepseek-ai/dsh-plugin-kilo-gateway`。改名的原因是那个名字**不在你的作用域里**，
发布必然被 npm 拒绝（非该组织成员无权发布 `@deepseek-ai/*`），而且它会让人误以为这是官方包。

已装过旧名的话，profile 清单里还留着旧条目。**就地改目录名是能用的**：
宿主的 bundle 解析按 `dsh.profile.bundles` 里的字符串去找**目录**，
而路由的行名取自包清单自己的 `name`，所以旧条目会正常加载并显示为新名（实测 `--dump-config` 无任何 skip）。
`dsh plugin` 用的 pnpm 也不介意清单名与目录名不一致（那只是标识，不是解析键）。

但建议还是把清单换成新名，避免以后自己看混：

```bash
dsh plugin --profile web remove @deepseek-ai/dsh-plugin-kilo-gateway
dsh plugin --profile web add dsh-llm-kilo-gateway
```

## 设置页

入口是侧边栏「插件」页里的 **Kilo Gateway** 卡片，或 `dsh-llm-kilo-gateway` 这张 bundle 卡片的详情页。

### 可编辑字段

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `apiKeyEnv` | (空) | API Key 的凭据名；**留空 = 匿名访问**（200 请求/小时/IP） |
| `refreshIntervalMs` | `86400000` | 目录刷新间隔（毫秒），下限 60000 |
| `notifyPort` | `9876` | 通知端点端口，**填 0 关闭** |
| `notifyOnFirstLoad` | `true` | 首次加载是否弹通知 |
| `maxRetries` | `2` | 单次失败请求最多重试几次（0 = 关闭），上限 10 |
| `requestTimeoutMs` | `300000` | 单次上游请求超时（毫秒），10 秒 – 30 分钟 |

`baseURL` 与 `catalogUrl` **不在设置页**：改它们会重写 entry config 并重载 fiber，
属于 shell/发布层管理的字段。

### 你自己的 API Key

「Kilo API Key」是一个**只写**控件：密钥字面量不进入设置文档、不随 `settings.describe` 回传，
页面只知道「是否已配置」。写入走 Harness 凭据服务，地址是**当前 `apiKeyEnv` 的取值**；
该字段留空时回落到占位符提示的 `KILO_API_KEY`。

这是一条硬约束：**密钥绝不能放进请求头或设置分节**——宿主会把整个分节原样回传给浏览器。

也可以不用页面，改用环境变量：

```bash
export KILO_API_KEY=your_key_here
```

### 只读面板

页面底部有三个面板，数据来自宿主的 loopback 端点：

- **可用模型列表** — 当前免费模型及其目录自报的能力。只显示目录**声明过**的能力，不猜不补。
- **模型增减日志** — 最近 50 次目录变动，最新在前。
- **Token 统计** — 本进程按模型累计的用量。表尾的「合计（所有模型）」是一行**汇总**，不是模型。

## 配置

### 重试策略

重试由 Harness 的 `dsh-llm-retry` 执行。本插件只负责两件事：
把状态码**分类**成失败码，并把 `maxRetries` 作为预算报上去。

| 状态 | 失败码 | 会重试 |
| --- | --- | --- |
| 400 / 422 | `INVALID_REQUEST` | 否 |
| 401 / 403 | `AUTH` | 否 |
| 402 | `QUOTA` | 否 |
| 404 | `INVALID_MODEL` | 否 |
| 408 | `TIMEOUT` | **是** |
| 429 | `RATE_LIMIT` | **是** |
| 5xx | `SERVER` | **是** |

**哪些失败可重试是分类结果，不是设置项**——用户能手动重试的失败不代表请求能活下来。
适配器自己只在**流尚未开始**时重试一次连接层抖动（预算刻意小于宿主的，避免两层循环相乘）。

### 输出预算 ≠ 输出上限

目录里的 `max_completion_tokens` 是模型**最多能吐多少**（能力），不是每次请求该要多少（预算）。
把能力当预算发送会被上游拒绝。本插件取 `min(目录上限, 32768)`，
与内置 `dsh-llm-pi-ai` 适配器的 `DEFAULT_MAX_TOKENS = 32768` 惯例一致。
用户仍可通过 Harness 的 `maxTokens` 显式要求更多。

## 通知链路

Host 半边在配置端口上起一个 loopback HTTP 服务，浏览器半边按**同一端口**轮询。

| 路由 | 内容 |
| --- | --- |
| `GET /notify` | 目录摘要（变更 toast 用） |
| `GET /state` | 模型列表 + 增减日志 + Token 统计（设置页面板用） |

两个路由**仅监听 `127.0.0.1`**，且**每个响应都带 CORS 头**（含 404）。
页面与端点不同源，缺 `Access-Control-Allow-Origin` 时浏览器会屏蔽整个响应，
把状态码吞成一句 `Failed to fetch`——这曾导致本插件的故障排查被引向错误方向。

服务端**不会**在端口占用时回退到随机端口（客户端按配置端口寻址，换端口等于静默失效）。
绑定失败会记录警告并让端点保持关闭。**排查端口冲突**：

```bash
netstat -ano | grep 9876                              # 谁占着
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select ProcessId,CommandLine
```

## 当前免费模型（16 个）

下表由一次真实抓取生成，与设置页「可用模型列表」同源同格式。
**目录随时会变，以设置页为准。**

| 模型 ID | 上下文 | 最大输出 | 输入模态 | 工具 | 推理档位 | 到期 |
|---------|--------|---------|---------|------|---------|------|
| `stepfun/step-5-preview-free` | 1M | 64K | text, image | ✅ | low/medium/high | — |
| `kilo-auto/free` | 256K | 33K | text | ✅ | — | — |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 1M | 66K | text | ✅ | none/medium/high | — |
| `dots-studio/dots-3-note-preview:free` | 512K | 461K | text, image | ✅ | instant/thinking | 2026-12-31 |
| `inclusionai/ling-3.1-flash` | 262K | 33K | text | ✅ | instant/thinking | — |
| `poolside/laguna-s-2.1:free` | 262K | 33K | text | ✅ | instant/thinking | 2026-10-31 |
| `stealth/glyph-cluster` | 256K | 256K | text | ✅ | low/medium/high/xhigh | — |
| `liquid/lfm-2.5-2.6b:free` | 66K | 8K | text | ✅ | thinking | — |
| `nvidia/nemotron-3.5-lightning:free` | 1M | 66K | text | ✅ | instant/thinking | — |
| `thinkingmachines/inkling-small:free` | 1M | 262K | text, image, audio | ✅ | none/minimal/low/medium/high/max | — |
| `poolside/laguna-xs-2.1:free` | 262K | 33K | text | ✅ | instant/thinking | 2026-10-31 |
| `cohere/north-mini-code:free` | 256K | 64K | text | ✅ | instant/thinking | — |
| `nvidia/nemotron-3.5-content-safety:free` | 128K | 8K | text, image | ❌ | instant/thinking | — |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 256K | 66K | text, audio, image, video | ✅ | instant/thinking | — |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262K | 236K | text | ✅ | none/low/medium | — |
| `openrouter/free` | 200K | 33K † | text, image | ✅ | — | — |

说明：

- 各列都是**目录自报值**，插件不猜不补。缺字段时回落到保守缺省（纯文本、无工具）。
- **最大输出**是模型的能力上限，不是每次请求的预算 —— 见「输出预算 ≠ 输出上限」。
- **推理档位**取自目录的 `opencode.variants`，档位名各模型不同，插件按原样透出而不映射到固定词汇表。
  `—` 表示目录**没声明**档位，不等于「不支持推理」。
- **†** `openrouter/free` 没有声明输出上限，插件回落到 32768 并标注。
- **工具**列为 ❌ 时，目录的 `supported_parameters` 里没有 `tools`，插件因此不声明工具能力。
- `kilo-auto/free` 是一个**自动路由**入口，会把请求分发到目录中的其它免费模型。

## 架构

```
dsh-llm-kilo-gateway/
├── package.json          # 包元数据 + dsh bundle / client 声明
├── cordis.patch.yml      # Cordis composition base
├── LICENSE
├── lib/
│   ├── index.js          # Host 半边：适配器 + 目录刷新 + 通知服务
│   ├── client.js         # Browser 半边：设置页 + 面板 + 变更 toast
│   ├── discovery.js      # 目录抓取与能力提取
│   ├── wire.js           # 线格式翻译（纯函数，可离线测试）
│   ├── state.js          # 状态持久化
│   ├── state-util.js     # 纯函数：差异、状态构建、token 累计
│   ├── server.js         # 通知 / 状态 HTTP 服务
│   └── types/            # .d.ts
└── test/                 # 契约测试
    └── fixtures/         # 图片 fixture（测试会校验其完整性）
```

`lib/wire.js` 单独成文件是有意的：线格式映射是**纯函数**，也是协议 bug 的藏身处，
单独放一个模块就能不联网、不起宿主地读和测。

### 工作流程

1. **启动** — 同步读上次持久化的模型快照播种列表，再后台抓取目录
2. **比较** — 与上次状态比对，找出新增/移除，写入增减日志
3. **注册** — 把免费模型注册为 Harness 模型提供商
4. **刷新** — 定时刷新（默认 24 小时）
5. **通知** — 目录变化时通过 loopback 端点通知浏览器半边

模型快照与 Token 统计持久化在 `~/.dsh/plugins/kilo-gateway/model-state.json`。

## 开发

```bash
npm test    # 74 项测试，全部离线
```

| 文件 | 覆盖 |
| --- | --- |
| `rc2-contract.test.mjs` | volatile 字段集合、`installSection` 不再被调用 |
| `client-bundle.test.mjs` | bundle 注册协议、导出形状、三个插槽、凭据句柄、字典键对齐 |
| `render.test.mjs` | 逐状态渲染组件树、hook 数量一致、面板确实在树里、故障文案区分 |
| `wire.test.mjs` | 消息/工具/图片/用量/finish_reason 映射；图片 fixture 完整性 |
| `discovery.test.mjs` | 能力提取与保守缺省 |
| `retry-and-usage.test.mjs` | 状态码映射、`Retry-After`、重试策略完整性、token 累计 |
| `notify-server.test.mjs` | 端口语义、CORS（含 404）、`EADDRINUSE` 不退让 |

这些测试是**规格说明**，且每个 bug 修复都配了能复现它的测试：
把 `tool_calls` 映射成 `stop`、漏掉 `tool_call_id`、只给 200 加 CORS、
重试策略缺 `backoff`、把目录上限当输出预算、hook 挪到早返回之下——都会失败。

`lib/client.js` 是**手写的**：生成它的 `clientBundle` tsdown 预设未发布，
所以它直接以加载器的 lazy-CJS 工厂格式写成，测试因此覆盖了通常由构建保证的部分。

## 兼容性

| 组件 | 已验证版本 |
| --- | --- |
| Node.js | 22+（开发机 24.13.0） |
| DeepSeek Harness | 0.2.0-rc.2 |
| `@deepseek-ai/cordis` | 4.0.4 |
| `@deepseek-ai/schemastery` | 3.18.4（`.volatile()` 在 3.18.2 上不存在） |

## 许可证

MIT — 见 [LICENSE](./LICENSE)。

本项目为第三方客户端，与 Kilo 无隶属关系。使用前请自行阅读
[Kilo 服务条款](https://kilo.ai/terms) 与
[免费使用说明](https://kilo.ai/docs/getting-started/using-kilo-for-free)。
