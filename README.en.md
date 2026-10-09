# dsh-llm-kilo-gateway

[![test](https://github.com/aqiu817/dsh-llm-kilo-gateway/actions/workflows/test.yml/badge.svg)](https://github.com/aqiu817/dsh-llm-kilo-gateway/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[中文](./README.md) | **English**

A **Kilo Gateway free-model** provider plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

It auto-discovers Kilo Gateway's free-model catalog, registers those models as providers you can
use directly in the Harness, and adds a settings page: your own API key, the available-model list,
a catalog change log, and per-model token totals.

> **The short version**: it gets you a dozen free models at no cost, but **prompts and outputs sent
> to these free models may be logged upstream and used for training**. Do not run anything sensitive
> through them.

---

## ⚠️ Risks and limitations (read this first)

**Every claim below cites its source. The terms-of-service quotes are Kilo's own published text;
the measurements are this plugin's observations of live API responses.**

### 1. Free-model input may be logged and used for training

This plugin **measured** it in the model catalog: of 401 models, 16 are free, and **all 16** are
flagged `mayTrainOnYourPrompts: true`. Kilo's own documentation says:

> Auto Free may route your request to providers that **log prompts and outputs and use them to
> improve their services**. **Do not submit personal or confidential data** when using Auto Free.

The NVIDIA-backed free endpoints state it more strictly:

> **Trial use only — do not submit personal or confidential data.** Your usage is logged for safety
> purposes and to improve NVIDIA's products and services.

### 2. Kilo's terms grant a broad license over submitted data

Section 7(A) of the Kilo Terms of Service ([kilo.ai/terms](https://kilo.ai/terms), last updated
**2026-09-30**) provides that by uploading data you grant Kilo a
"**perpetual, irrevocable, fully-paid, royalty-free, worldwide, sublicensable, transferable**"
right and license, "to provide and improve the Services and Kilo's other products and services."

The same section also states:

> If you elect not to grant a license to any AI Model to use your Customer Data for **training**
> purposes, you **may not be able to use certain AI Models**.

The opt-out offered by Section 9 covers **marketing email**, not AI training. Community discussion
(not an official statement) suggests zero data retention (ZDR) currently appears to be limited to
enterprise/team plans. **This plugin neither changes these terms nor offers any way around them.**

### 3. Free quota and rate limits

- **Anonymous access**: the official docs say free models work for both authenticated and anonymous
  users, but **anonymous users are limited to 200 requests/hour/IP**.
- **Upstream throttling**: the official docs note that "some free models may be rate-limited by the
  upstream provider." Measured, the free pool returns
  `429 Provider returned error / request limited concurrency reached` — that is the upstream
  concurrency cap, not a configuration problem.
- **Free does not mean permanently free**: these models all list `pricing` of 0 in the catalog, but
  upstream can change that at any time.

### 4. Free models disappear

The free catalog is **dynamic**. Measured, 3 models carry explicit expiry dates:

| Model | Expires |
| --- | --- |
| `poolside/laguna-s-2.1:free` | 2026-10-31 |
| `poolside/laguna-xs-2.1:free` | 2026-10-31 |
| `dots-studio/dots-3-note-preview:free` | 2026-12-31 |

The rest carry no expiry date, which does not mean they are safe to depend on. **Any workflow built
on a free model must be prepared for that model to vanish.** The settings page keeps a change log so
you can see it happen.

### 5. Other known boundaries of this plugin

- **The free pool's stability is not something this plugin controls.** Measured: upstream 400s (a
  model whose declared output ceiling exceeds what its upstream actually accepts), 429s (concurrency
  throttling), and "HTTP 200 with empty content." The plugin classifies recoverable failures
  correctly and retries them, but a request still fails once the retry budget is spent.
- **Reasoning levels reflect only what the catalog declares.** Whatever levels the catalog lists is
  what is shown; nothing is inferred.
- **`expires` is displayed, not enforced.** The expiry date appears in the settings page but is not
  used to filter out expired models.
- **A port conflict disables the notify endpoint.** See "Notify path." This is deliberate. Note that
  **with two hosts running at once, the old process holds the port** and the new process's endpoint
  stays closed.

### 6. No guarantee is made about upstream behaviour

This plugin is a **third-party client** and is not affiliated with Kilo. Upstream API fields,
rate-limit policy, training terms, and even endpoint addresses can change at any time. When
something breaks, check whether it is an upstream change before assuming it is a plugin defect.

---

## Features

- 🔄 **Automatic free-model discovery** — reads `isFree: true` models from the Kilo Gateway catalog;
  no hand-maintained list
- 📅 **Scheduled refresh** — every 24 hours by default, adjustable in the settings page
- 🔔 **Change notifications** — a toast when models are added or removed, plus a log entry
- 🧰 **Full tool calling** — sends `tools`, parses streaming `delta.tool_calls`, assembles an
  executable tool block
- 🧠 **Reasoning effort** — reads each model's **actually declared** levels from `opencode.variants`
- 🖼️ **Image input** — driven by the catalog's `architecture.input_modalities`; images are sent
  upstream as data URLs
- 📊 **Token statistics** — per-model call counts and token kinds (cache reads and writes broken out)
- 🔑 **Bring your own key** — paste an API key in the settings page; it goes into the Harness
  credentials service and is **never echoed back**
- 📋 **Available-model list and change log** — the catalog's current state and its history, in the
  settings page
- ♻️ **Upstream error retry** — status codes mapped onto the Harness retry vocabulary; `429`/`5xx`/
  timeouts retry automatically

## Requirements

| Dependency | Version |
| --- | --- |
| Node.js | **≥ 22** |
| DeepSeek Harness | **0.2.x** (verified on 0.2.0-rc.2) |

The plugin's runtime packages (`dsh-llm`, `cordis`, `schemastery`, …) are declared as
**`peerDependencies`** with the range `*`, and **all of them are marked `optional`** in
`peerDependenciesMeta`. None of that is accidental:

- **They must be `peerDependencies`.** When the Harness decides which installed instance to redirect
  a plugin's bare imports to, it reads exactly the `peerDependencies` key names from the plugin's
  manifest (the host function is `readPeerNames`). If those names appear only under `dependencies`,
  the redirect never happens and the plugin gets its own private copy of `dsh-llm` — a different
  instance from the host's, so adapter registration does not take effect.
- **The range must be `*`.** The host compares the **version ranges** of `@deepseek-ai/dsh` and
  `@deepseek-ai/dsh-*` peers against the **running dsh runtime version** (not against the package's
  own version). Measured: pinning `dsh-llm` to `^0.1.5-rc.2` made the host refuse to load the plugin:

  ```
  dsh: skipping profile bundle "...": Plugin dsh-llm-kilo-gateway@1.0.0 is
  incompatible with dsh 0.2.0-rc.2: peerDependencies {"@deepseek-ai/dsh-llm":"^0.1.5-rc.2"}
  ```

  A pinned range makes the plugin lock itself out on the next rc bump, so `*` is left in place and
  the host's compatibility check is the gate.
- **They must be marked `optional`.** This one is for npm, not the host (the host reads only the key
  names and ignores `meta`). npm's `latest` tag points at an **older** `@deepseek-ai/dsh-llm`,
  `0.0.1-rc.1`; without the optional marker npm resolves and installs a wrong-version copy into the
  consumer's project. Measured, with the markers `added 1 package` and no `@deepseek-ai/*` directory
  appeared in the consumer, while the plugin's imports still resolved to the host's copy (verified
  with `require.resolve` pointing at the same file).

## Installation

```bash
# Install from npm into a profile (the web profile here)
dsh plugin --profile web add dsh-llm-kilo-gateway
```

Installing from source uses `link:` (a symlink), so source edits take effect immediately:

```bash
dsh plugin --profile web add link:/path/to/dsh-llm-kilo-gateway
```

**Desktop**: the profile is named `desktop` and the command is the same, but use the CLI that ships
with the desktop app (the host refuses `dsh --profile desktop`, because that profile is managed
exclusively by the Electron app).

**Restart the host** after installing. A Kilo Gateway group appears in the model picker, and a
settings card appears under Settings → Plugins.

## Settings page

Reachable from the **Kilo Gateway** card on the sidebar Plugins page, or from the detail page of the
`dsh-llm-kilo-gateway` bundle card.

### Editable fields

| Field | Default | Meaning |
| --- | --- | --- |
| `apiKeyEnv` | (empty) | Credential name for the API key; **empty means anonymous access** (200 requests/hour/IP) |
| `refreshIntervalMs` | `86400000` | Catalog refresh interval in ms; floor 60000 |
| `notifyPort` | `9876` | Notify endpoint port; **0 disables it** |
| `notifyOnFirstLoad` | `true` | Whether the first catalog load raises a notification |
| `maxRetries` | `2` | How many times one failed request may be retried (0 disables); ceiling 10 |
| `requestTimeoutMs` | `300000` | Timeout for one upstream request in ms; 10 s – 30 min |

`baseURL` and `catalogUrl` are **not** on the settings page: editing them rewrites the entry config
and reloads the fiber, which makes them shell/release-layer fields.

### Your own API key

"Kilo API Key" is a **write-only** control: the secret literal never enters the settings document
and is never returned by `settings.describe`, so the page only knows whether a key is configured.
Writes go through the Harness credentials service at the address given by the **current value of
`apiKeyEnv`**; when that field is empty it falls back to the `KILO_API_KEY` shown in the placeholder.

This is a hard constraint: **a secret must never go into a header or a settings section** — the host
returns the whole section verbatim to the browser.

You can also skip the page and use an environment variable:

```bash
export KILO_API_KEY=your_key_here
```

### Read-only panels

Three panels sit at the bottom of the page, fed by the host's loopback endpoint:

- **Available models** — the current free models and the capabilities the catalog claims for them.
  Only capabilities the catalog **declares** are shown; nothing is inferred or filled in.
- **Catalog change log** — the last 50 catalog changes, newest first.
- **Token statistics** — usage this process accumulated, per model. The "Total (all models)" row at
  the bottom is a **summary row**, not a model.

## Configuration

### Retry strategy

Retrying is performed by the Harness's `dsh-llm-retry`. This plugin does two things only: it
**classifies** status codes into failure codes, and it reports `maxRetries` as the budget.

| Status | Failure code | Retried |
| --- | --- | --- |
| 400 / 422 | `INVALID_REQUEST` | No |
| 401 / 403 | `AUTH` | No |
| 402 | `QUOTA` | No |
| 404 | `INVALID_MODEL` | No |
| 408 | `TIMEOUT` | **Yes** |
| 429 | `RATE_LIMIT` | **Yes** |
| 5xx | `SERVER` | **Yes** |

**Which failures are retryable is a classification result, not a setting** — a failure a user could
retry by hand is still one the request can never survive. The adapter itself retries a
connection-layer hiccup only once, and only **before the stream has started** (a deliberately smaller
budget than the host's, so the two retry loops do not multiply).

### Output budget ≠ output ceiling

A catalog entry's `max_completion_tokens` is the most a model **can** emit (a capability), not what
any one request should ask for (a budget). Sending the capability as the budget gets rejected
upstream. This plugin uses `min(catalog ceiling, 32768)`, matching the built-in `dsh-llm-pi-ai`
adapter's `DEFAULT_MAX_TOKENS = 32768` convention. A user can still ask for more explicitly through
the Harness's `maxTokens`.

## Notify path

The host half runs a loopback HTTP server on the configured port; the browser half polls **that same
port**.

| Route | Contents |
| --- | --- |
| `GET /notify` | Catalog summary (for the change toast) |
| `GET /state` | Model list + change log + token statistics (for the settings-page panels) |

Both routes **listen on `127.0.0.1` only**, and **every response carries the CORS headers**,
including 404s. The page and the endpoint are not same-origin, so without
`Access-Control-Allow-Origin` the browser blocks the entire response and collapses the status code
into a bare `Failed to fetch` — which is what previously steered this plugin's troubleshooting in
the wrong direction.

The server **does not** fall back to a random port when the port is taken (the client addresses the
configured port, so a different port means silent failure). A failed bind logs a warning and leaves
the endpoint off. **Diagnosing a port conflict:**

```bash
netstat -ano | grep 9876                              # who holds it
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select ProcessId,CommandLine
```

## Current free models (16)

The table below was generated from one real fetch and uses the same source and format as the
settings page's "Available models" panel. **The catalog changes at any time; the settings page is
authoritative.**

| Model ID | Context | Max output | Input modalities | Tools | Reasoning levels | Expires |
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

Notes:

- Every column is a **catalog-declared value**; the plugin infers nothing and fills nothing in. A
  missing field falls back to the conservative default (text-only, no tools).
- **Max output** is the model's capability ceiling, not a per-request budget — see "Output budget ≠
  output ceiling."
- **Reasoning levels** come from the catalog's `opencode.variants`. Level names differ per model and
  are passed through verbatim rather than mapped onto a fixed vocabulary. `—` means the catalog
  **declares no** levels, which is not the same as "does not support reasoning."
- **†** `openrouter/free` declares no output ceiling, so the plugin falls back to 32768 and marks it.
- A **Tools** value of ❌ means the catalog's `supported_parameters` does not include `tools`, so the
  plugin does not claim tool capability.
- `kilo-auto/free` is an **auto-router** entry that dispatches requests to other free models in the
  catalog.

## Architecture

```
dsh-llm-kilo-gateway/
├── package.json          # Package metadata + dsh bundle / client declarations
├── cordis.patch.yml      # Cordis composition base
├── LICENSE
├── lib/
│   ├── index.js          # Host half: adapter + catalog refresh + notify server
│   ├── client.js         # Browser half: settings page + panels + change toast
│   ├── discovery.js      # Catalog fetch and capability extraction
│   ├── wire.js           # Wire-format translation (pure functions, offline-testable)
│   ├── state.js          # State persistence
│   ├── state-util.js     # Pure functions: diffing, state building, token accumulation
│   ├── server.js         # Notify / state HTTP server
│   └── types/            # .d.ts
└── test/                 # Contract tests
    └── fixtures/         # Image fixture (the tests verify its integrity)
```

`lib/wire.js` is a separate file on purpose: the wire mapping is **pure functions**, and it is also
where protocol bugs hide, so isolating it makes it readable and testable without a network or a
running host.

### Flow

1. **Start** — synchronously read the last persisted model snapshot to seed the list, then fetch the
   catalog in the background
2. **Compare** — diff against the previous state, find additions/removals, append to the change log
3. **Register** — register the free models as Harness model providers
4. **Refresh** — on a timer (24 hours by default)
5. **Notify** — when the catalog changes, tell the browser half over the loopback endpoint

The model snapshot and token statistics persist to `~/.dsh/plugins/kilo-gateway/model-state.json`.

## Development

```bash
npm test    # 74 tests, all offline
```

| File | Coverage |
| --- | --- |
| `rc2-contract.test.mjs` | The volatile-field set; `installSection` is no longer called |
| `client-bundle.test.mjs` | Bundle registration protocol, export shape, three slots, credentials handle, dictionary key parity |
| `render.test.mjs` | Component tree per state, hook-count parity, panels actually in the tree, fault-copy distinction |
| `wire.test.mjs` | Message/tool/image/usage/finish_reason mapping; image fixture integrity |
| `discovery.test.mjs` | Capability extraction and conservative defaults |
| `retry-and-usage.test.mjs` | Status-code mapping, `Retry-After`, retry-policy completeness, token accumulation |
| `notify-server.test.mjs` | Port semantics, CORS (including 404s), `EADDRINUSE` does not retreat |

These tests are **a specification**, and every bug fix ships with a test that reproduces it: mapping
`tool_calls` to `stop`, dropping `tool_call_id`, sending CORS on 200s only, a retry policy missing
its `backoff` fields, treating a catalog ceiling as the output budget, moving a hook below an early
return — all of them fail.

`lib/client.js` is **hand-written**: the `clientBundle` tsdown preset that generates it has not been
published, so it is written directly in the loader's lazy-CJS factory format, which is why the tests
cover parts normally guaranteed by a build.

## Compatibility

| Component | Verified version |
| --- | --- |
| Node.js | 22+ (development machine 24.13.0) |
| DeepSeek Harness | 0.2.0-rc.2 |
| `@deepseek-ai/cordis` | 4.0.4 |
| `@deepseek-ai/schemastery` | 3.18.4 (`.volatile()` does not exist in 3.18.2) |

## License

MIT — see [LICENSE](./LICENSE).

This is a third-party client and is not affiliated with Kilo. Before using it, read
[Kilo's Terms of Service](https://kilo.ai/terms) and
[the guide to using Kilo for free](https://kilo.ai/docs/getting-started/using-kilo-for-free).
