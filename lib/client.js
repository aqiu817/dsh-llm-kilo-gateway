window.__ModuleLoader__.load({
	id: "dsh-llm-kilo-gateway/client",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		//#region locales
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			title: "Kilo Gateway",
			description: "免费模型目录的刷新与通知设置。",
			apiKeyEnv: "API Key 凭据名",
			apiKeyEnvHint: "填写凭据系统或环境变量中的名称，留空则匿名访问（约 200 次/小时/IP）。",
			refreshIntervalMs: "刷新间隔（毫秒）",
			refreshIntervalMsHint: "重新拉取免费模型目录的间隔，最短 60000 毫秒。",
			notifyPort: "通知端口",
			notifyPortHint: "浏览器端轮询的本地端口，填 0 关闭变更通知。",
			notifyOnFirstLoad: "首次加载时通知",
			notifyOnFirstLoadHint: "开启后启动即弹出一次目录摘要；关闭则只在模型增减时提示。",
			maxRetries: "失败重试次数",
			maxRetriesHint: "一次请求失败后，上层最多重试几次；填 0 关闭重试。仅限限流、超时、5xx 这类可恢复的失败。",
			requestTimeoutMs: "单次请求超时（毫秒）",
			requestTimeoutMsHint: "单次上游请求允许运行的最长时间，超时后放弃并交由重试处理。",
			apiKey: "Kilo API Key",
			apiKeyHint: "直接填写你自己的 Key；保存后只写入凭据系统，本页面不会回显。留空保存即沿用已存的 Key。",
			apiKeySet: "已配置",
			apiKeyUnset: "未配置",
			apiKeyAnonymous: "未配置凭据名，当前按匿名访问（约 200 次/小时/IP）。",
			apiKeyRefHint: "写入的凭据名为「{ref}」，与上方凭据名一致，因此无需再手动填写。",
			apiKeyUnavailable: "本部署未提供凭据服务，无法在页面内写入 Key。",
			apiKeyClear: "清除已存 Key",
			apiKeyCleared: "已清除",
			keyWriteFailed: "Key 未能写入：{message}",
			modelsTitle: "可用模型列表",
			modelsHint: "当前免费目录中的模型，以及目录自报的能力。",
			modelsEmpty: "尚未拉到目录，或当前没有免费模型。",
			modelsFetchFailed: "状态接口连不上；请确认宿主正在运行、通知端口未被关闭（填 0 即关闭）。",
			modelsRouteMissing: "端口上有服务在响应，但它没有 /state 路由——通常是另一个宿主（旧进程）还占着这个端口，或加载的是旧版插件。退出其他 dsh 进程后重启宿主即可。",
			modelsNotifyOff: "通知端口填的是 0，端点已关闭，因此读不到目录状态。填一个 1–65535 的端口并保存即可。",
			modelsFetchedAt: "目录更新于 {time}",
			modelsLastFailed: "最近一次拉取失败：{message}",
			colModel: "模型",
			colContext: "上下文",
			colMaxOut: "最大输出",
			colCapabilities: "能力",
			colExpires: "到期",
			capTools: "工具",
			capTraining: "可能用于训练",
			reasoningLevels: "推理强度",
			noReasoning: "无",
			modalityText: "文本",
			modalityImage: "图像",
			modalityAudio: "音频",
			modalityVideo: "视频",
			changeLogTitle: "模型增减日志",
			changeLogHint: "最近若干次目录变动，最新在前。",
			changeLogEmpty: "暂无变动记录。",
			changeLogAdded: "新增",
			changeLogRemoved: "移除",
			changeLogTotal: "变动后共 {total} 个免费模型",
			tokenStatsTitle: "Token 统计",
			tokenStatsHint: "本进程内按模型累计的用量；输入不含缓存命中部分。",
			tokenStatsEmpty: "尚无调用记录。",
			tokenStatsTotal: "合计（所有模型）",
			colCalls: "调用",
			colInput: "输入",
			colOutput: "输出",
			colCacheRead: "缓存读",
			colCacheWrite: "缓存写",
			colReasoningTokens: "推理",
			colLastUsed: "最近使用",
			privacy: "所有免费模型的提示词都可能被用于训练，请勿提交敏感内容。",
			notifyFailed: "Kilo Gateway",
			notifyFailedSub: "模型目录拉取失败",
			notifyUpdated: "Kilo Gateway",
			notifyUpdatedSub: "免费模型有变化",
			notifyRefreshed: "Kilo Gateway",
			notifyRefreshedSub: "免费模型目录已刷新",
			added: "新增",
			removed: "移除",
			noChanges: "个免费模型可用 · 无变化",
			readOnly: "当前部署不允许写入设置。",
			unavailable: "该插件当前未加载，暂时无法配置。",
			loading: "正在读取设置…",
			saveFailed: "本部署没有接受这些值，已保留供你修改。",
			save: "保存",
			saving: "保存中…",
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			title: "Kilo Gateway",
			description: "Refresh and notification settings for the free-model catalog.",
			apiKeyEnv: "API key credential",
			apiKeyEnvHint: "Name of the credential or environment variable holding the key; leave blank for anonymous access (about 200 requests/hour/IP).",
			refreshIntervalMs: "Refresh interval (ms)",
			refreshIntervalMsHint: "How often the free-model catalog is re-fetched; 60000 ms minimum.",
			notifyPort: "Notification port",
			notifyPortHint: "Loopback port the browser polls; 0 turns change notifications off.",
			notifyOnFirstLoad: "Notify on first load",
			notifyOnFirstLoadHint: "Raise one summary toast at startup; when off, only model additions and removals are announced.",
			maxRetries: "Retry attempts",
			maxRetriesHint: "How many times the harness may retry one failed request; 0 disables retrying. Only recoverable failures qualify — rate limits, timeouts, and 5xx.",
			requestTimeoutMs: "Request timeout (ms)",
			requestTimeoutMsHint: "How long one upstream attempt may run before it is abandoned and handed to the retry policy.",
			apiKey: "Kilo API key",
			apiKeyHint: "Paste your own key. It goes straight to the credentials service and never rides a response back to this page. Leaving it blank keeps the stored key.",
			apiKeySet: "Configured",
			apiKeyUnset: "Not configured",
			apiKeyAnonymous: "No credential name is set, so requests are anonymous (about 200/hour/IP).",
			apiKeyRefHint: "The key is stored under the credential name “{ref}”, the same one named above, so nothing else has to be filled in.",
			apiKeyUnavailable: "This deployment provides no credentials service, so a key cannot be written from here.",
			apiKeyClear: "Clear stored key",
			apiKeyCleared: "Cleared",
			keyWriteFailed: "The key was not written: {message}",
			modelsTitle: "Available models",
			modelsHint: "What the current free catalog holds, with the capabilities the catalog itself advertises.",
			modelsEmpty: "No catalog has been fetched yet, or it currently holds no free models.",
			modelsFetchFailed: "The status endpoint could not be reached; check that the host is running and the notification port is not off (0 disables it).",
			modelsRouteMissing: "Something is answering on this port but it has no /state route — usually another host (an older process) still holding the port, or an older build of the plugin. Quit the other dsh process and restart the host.",
			modelsNotifyOff: "The notification port is set to 0, so the endpoint is off and no catalog state can be read. Set a port from 1 to 65535 and save.",
			modelsFetchedAt: "Catalog updated at {time}",
			modelsLastFailed: "Last fetch failed: {message}",
			colModel: "Model",
			colContext: "Context",
			colMaxOut: "Max output",
			colCapabilities: "Capabilities",
			colExpires: "Expires",
			capTools: "tools",
			capTraining: "may train",
			reasoningLevels: "Reasoning effort",
			noReasoning: "none",
			modalityText: "text",
			modalityImage: "image",
			modalityAudio: "audio",
			modalityVideo: "video",
			changeLogTitle: "Catalog change log",
			changeLogHint: "The most recent catalog changes, newest first.",
			changeLogEmpty: "No changes recorded yet.",
			changeLogAdded: "new",
			changeLogRemoved: "removed",
			changeLogTotal: "{total} free models after the change",
			tokenStatsTitle: "Token usage",
			tokenStatsHint: "Usage this process accumulated per model; input excludes cache hits.",
			tokenStatsEmpty: "No calls recorded yet.",
			tokenStatsTotal: "Total (all models)",
			colCalls: "Calls",
			colInput: "Input",
			colOutput: "Output",
			colCacheRead: "Cache read",
			colCacheWrite: "Cache write",
			colReasoningTokens: "Reasoning",
			colLastUsed: "Last used",
			privacy: "Every free model may train on your prompts; do not submit sensitive content.",
			notifyFailed: "Kilo Gateway",
			notifyFailedSub: "Model fetch failed",
			notifyUpdated: "Kilo Gateway",
			notifyUpdatedSub: "Free models updated",
			notifyRefreshed: "Kilo Gateway",
			notifyRefreshedSub: "Free model catalog refreshed",
			added: "new",
			removed: "removed",
			noChanges: "free models available · No changes",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			loading: "Reading settings…",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
			save: "Save",
			saving: "Saving…",
		};
		/** The form frame's copy, read from this page's dictionary. */
		function formLabels(t) {
			return {
				unavailable: t("unavailable"),
				readOnly: t("readOnly"),
				saveFailed: t("saveFailed"),
				save: t("save"),
				saving: t("saving"),
			};
		}
		//#endregion

		//#region styles
		/*
		 * Written by hand rather than emitted from a CSS module: the `clientBundle`
		 * tsdown preset that produces those hashed class names is not published, so
		 * this bundle owns a prefixed class set and injects it once. Colours are
		 * shell design tokens, so the page follows the active theme.
		 */
		const CSS = [
			".dshKg_row{display:flex;flex-direction:column;gap:6px;margin:0 0 18px}",
			".dshKg_label{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:20px}",
			".dshKg_hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
			".dshKg_toggle{display:flex;align-items:center;gap:10px}",
			".dshKg_action{padding:5px 12px;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;cursor:pointer}",
			".dshKg_action:disabled{opacity:.55;cursor:default}",
			".dshKg_input{width:100%;box-sizing:border-box;padding:6px 10px;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:7px}",
			".dshKg_input:disabled{opacity:.55}",
			".dshKg_input.dshKg_invalid{border-color:var(--dsw-alias-border-danger, #d9534f)}",
			".dshKg_number{width:140px}",
			".dshKg_notice{display:flex;gap:8px;margin:0 0 18px;padding:10px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;background:var(--dsw-alias-bg-layer-2);border-radius:8px}",
			// Panels below the form read Host state rather than a draft, so they sit
			// outside the form frame's save cycle and carry their own hairline.

			".dshKg_section{margin:22px 0 0;padding:16px 0 0;border-top:1px solid var(--dsw-alias-border-l2)}",
			".dshKg_sectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 4px}",
			".dshKg_sectionTitle{margin:0;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:20px}",
			".dshKg_meta{margin:0 0 10px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
			".dshKg_warn{color:var(--dsw-alias-label-warning, #b26a00)}",
			".dshKg_scroll{max-height:280px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}",
			".dshKg_table{width:100%;border-collapse:collapse;font-size:12px;line-height:18px}",
			".dshKg_table th{position:sticky;top:0;padding:7px 10px;color:var(--dsw-alias-label-tertiary);font-weight:600;text-align:left;white-space:nowrap;background:var(--dsw-alias-bg-layer-2)}",
			".dshKg_table td{padding:7px 10px;color:var(--dsw-alias-label-secondary);vertical-align:top;border-top:1px solid var(--dsw-alias-border-l2)}",
			".dshKg_table td.dshKg_num{text-align:right;font-variant-numeric:tabular-nums}",
			".dshKg_table tr.dshKg_total td{color:var(--dsw-alias-label-primary);font-weight:600;border-top:1px solid var(--dsw-alias-border-l1)}",
			".dshKg_mono{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}",
			".dshKg_name{color:var(--dsw-alias-label-primary)}",
			".dshKg_chips{display:flex;flex-wrap:wrap;gap:4px}",
			".dshKg_chip{padding:1px 6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;background:var(--dsw-alias-bg-layer-3);border-radius:5px}",
			".dshKg_change{display:flex;flex-direction:column;gap:3px;padding:9px 10px}",
			".dshKg_change+.dshKg_change{border-top:1px solid var(--dsw-alias-border-l2)}",
			".dshKg_changeTime{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}",
			".dshKg_addList{color:var(--dsw-alias-label-success, #2e7d32)}",
			".dshKg_removeList{color:var(--dsw-alias-label-danger, #c62828)}",
			".dshKg_keyState{display:flex;align-items:center;gap:8px;margin:0 0 8px}",
			".dshKg_keyDot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}",
			".dshKg_keyDot.dshKg_on{background:var(--dsw-alias-label-success, #2e7d32)}",
			".dshKg_error{margin:0 0 10px;color:var(--dsw-alias-label-danger, #c62828);font-size:12px;line-height:18px}",
			".dshKg_empty{padding:14px 10px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
		].join("");
		const CSS_TAG_ID = "dsh-llm-kilo-gateway/SettingsPage.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG_ID) + "]") === null) {
			const tag = document.createElement("style");
			tag.setAttribute("data-plugin-css", CSS_TAG_ID);
			tag.textContent = CSS;
			document.head.append(tag);
		}
		//#endregion

		//#region settings page
		/** Field carrying the API key credential reference. */
		const FIELD_API_KEY_ENV = "apiKeyEnv";
		/** Field carrying the catalog refresh interval. */
		const FIELD_REFRESH = "refreshIntervalMs";
		/** Field carrying the loopback notification port. */
		const FIELD_PORT = "notifyPort";
		/** Field carrying the first-load notification switch. */
		const FIELD_FIRST_LOAD = "notifyOnFirstLoad";
		/** Field carrying the retry budget the harness may spend. */
		const FIELD_MAX_RETRIES = "maxRetries";
		/** Field carrying one upstream attempt's timeout. */
		const FIELD_TIMEOUT = "requestTimeoutMs";

		/** Shortest refresh interval the Host schema accepts. */
		const MIN_REFRESH_MS = 60000;
		/** Smallest and largest retry budget the Host schema accepts. */
		const RETRY_RANGE = { min: 0, max: 10 };
		/** Smallest and largest request timeout the Host schema accepts. */
		const TIMEOUT_RANGE = { min: 10000, max: 1800000 };
		/**
		 * Credential name assumed when the section names none.
		 *
		 * The page writes the key under whatever reference `apiKeyEnv` currently
		 * holds, so an empty field would have nowhere to put it. This is the same
		 * name the placeholder offers, so the field the user sees and the ref the key
		 * lands under are never two different answers.
		 */
		const DEFAULT_API_KEY_REF = "KILO_API_KEY";

		/**
		 * Read one field out of a section value, tolerating a section that has not
		 * been served yet (the first render happens before the Host's describe
		 * answer lands, so `value` is undefined then).
		 * @param value - the snapshot's resolved section.
		 * @param field - field name to read.
		 * @returns the stored value, or undefined.
		 */
		function fieldOf(value, field) {
			return typeof value === "object" && value !== null ? value[field] : undefined;
		}

		/**
		 * Parse a whole-number draft, accepting only what the Host schema accepts.
		 * @param text - the draft text.
		 * @param min - smallest acceptable value.
		 * @returns the parsed integer, or undefined when the draft is not acceptable.
		 */
		function parseWhole(text, min) {
			const trimmed = String(text).trim();
			if (!/^\d+$/.test(trimmed)) return undefined;
			const parsed = Number.parseInt(trimmed, 10);
			return Number.isSafeInteger(parsed) && parsed >= min ? parsed : undefined;
		}

		/**
		 * Fill `{name}` placeholders in a translated string.
		 *
		 * The dictionaries hold whole sentences rather than fragments, so a value
		 * interpolates into copy that already reads as one sentence in both
		 * languages.
		 *
		 * @param text - translated template.
		 * @param values - replacement values keyed by placeholder name.
		 * @returns the filled string.
		 */
		function fill(text, values) {
			return String(text).replace(/\{(\w+)\}/g, (whole, key) =>
				Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole,
			);
		}

		/** Format a token count for a table cell. */
		function tokenText(value) {
			return Number.isFinite(value) ? value.toLocaleString() : "0";
		}

		/**
		 * Format a context window or output ceiling.
		 *
		 * The catalog states these in raw tokens; a table of eight-digit numbers is
		 * unreadable, so they are shown as the round figure the picker also shows.
		 *
		 * @param value - token count.
		 * @returns a compact label.
		 */
		function sizeText(value) {
			if (!Number.isFinite(value) || value <= 0) return "—";
			if (value >= 1000000) return (value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1) + "M";
			if (value >= 1000) return Math.round(value / 1000) + "K";
			return String(value);
		}

		/** Format an instant as a local date-time, or an empty string. */
		function timeText(value) {
			return Number.isFinite(value) && value > 0 ? new Date(value).toLocaleString() : "";
		}

		/**
		 * Format a catalog date field.
		 *
		 * The catalog states expiries as a plain `YYYY-MM-DD` string while the
		 * plugin's own timestamps are epoch milliseconds, so both shapes reach this
		 * formatter. Reading a date string with `Number.isFinite` would render the
		 * expiry column as a permanent em dash.
		 *
		 * @param value - an epoch millisecond count or a date string.
		 * @returns a local date, or an em dash when the value is unusable.
		 */
		function dateText(value) {
			if (Number.isFinite(value) && value > 0) return new Date(value).toLocaleDateString();
			if (typeof value !== "string" || value.length === 0) return "—";
			const stamp = Date.parse(value);
			return Number.isFinite(stamp) ? new Date(stamp).toLocaleDateString() : "—";
		}

		/**
		 * The credential the page writes, resolved from the section in force.
		 *
		 * A blank `apiKeyEnv` means anonymous access, and there is then no name to
		 * store a key under — the page falls back to the same name its placeholder
		 * offers, so what the user fills in is what the adapter resolves.
		 *
		 * @param section - the settings section value.
		 * @returns the credential reference to read and write.
		 */
		function credentialRefOf(section) {
			const declared = fieldOf(section, FIELD_API_KEY_ENV);
			return typeof declared === "string" && declared.length > 0 ? declared : DEFAULT_API_KEY_REF;
		}

		/**
		 * The credentials handle the key control drives.
		 *
		 * The credentials namespace is resolved lazily rather than injected, so a
		 * deployment without the remotes assembly still renders the rest of the page
		 * and simply reports that a key cannot be written here. Injecting the
		 * namespace instead would park the whole page — every mount, not just this
		 * field — behind a service that need not exist.
		 *
		 * A credential's literal never rides a response; the only thing readable is
		 * whether one is configured, which is why the control is write-only.
		 *
		 * @param ctx - the browser plugin context.
		 * @returns the handle: `get`, `subscribe`, `read`, `write`, and `clear`.
		 */
		function createCredentials(ctx) {
			const service = () => (typeof ctx.get === "function" ? ctx.get("remote.credentials") : void 0);
			let view = { configured: false, writable: true, available: service() !== void 0 };
			let currentRef = "";
			const listeners = new Set();

			/** Publish a view, skipping the no-op case so the page does not re-render. */
			const publish = (next) => {
				if (next.configured === view.configured && next.writable === view.writable && next.available === view.available) return;
				view = next;
				for (const listener of listeners) listener(view);
			};

			return {
				get: () => view,
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				/**
				 * Ask about one reference.
				 *
				 * The answer is discarded when the reference has moved on, since a
				 * renamed credential name can be in flight while an older read settles.
				 * @param ref - the credential reference to describe.
				 */
				async read(ref) {
					currentRef = ref;
					const credentials = service();
					if (credentials === undefined) {
						publish({ configured: false, writable: true, available: false });
						return;
					}
					try {
						const response = await credentials.describe([ref]);
						if (ref !== currentRef) return;
						const entry = response.ok ? response.value[ref] : void 0;
						publish({ configured: entry?.configured === true, writable: entry?.writable !== false, available: true });
					} catch {
						if (ref !== currentRef) return;
						publish({ configured: false, writable: true, available: true });
					}
				},
				/**
				 * Write one credential literal.
				 * @param ref - the credential reference to write.
				 * @param value - the literal.
				 * @returns the outcome, so the control can report a refusal.
				 */
				async write(ref, value) {
					const credentials = service();
					if (credentials === undefined) return { ok: false, unavailable: true };
					try {
						const response = await credentials.set(ref, value);
						if (!response.ok) return { ok: false, message: response.error.message };
					} catch (err) {
						return { ok: false, message: err instanceof Error ? err.message : String(err) };
					}
					await this.read(ref);
					return { ok: true };
				},
				/**
				 * Remove the stored credential.
				 * @param ref - the credential reference to clear.
				 * @returns the outcome.
				 */
				async clear(ref) {
					const credentials = service();
					if (credentials === undefined) return { ok: false, unavailable: true };
					try {
						const response = await credentials.unset(ref);
						if (!response.ok) return { ok: false, message: response.error.message };
					} catch (err) {
						return { ok: false, message: err instanceof Error ? err.message : String(err) };
					}
					await this.read(ref);
					return { ok: true };
				},
			};
		}

		/**
		 * The one place the Host's live state is held, shared by the toast and the
		 * page's panels.
		 *
		 * Both consumers want the same fetch, but they live at different scopes: the
		 * toast has to keep running while no settings page is mounted, so the poller
		 * cannot live in the component. A tiny external store keeps one fetch feeding
		 * both, and gives the panels a `useSyncExternalStore` source that survives
		 * remounts without refetching.
		 *
		 * @returns the store: `getSnapshot`, `subscribe`, and `publish`.
		 */
		function createStateFeed() {
			let snapshot = { status: "loading", state: null, error: null };
			const listeners = new Set();
			return {
				getSnapshot: () => snapshot,
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				publish(next) {
					snapshot = next;
					for (const listener of listeners) listener();
				},
			};
		}

		/** Localized label for one input modality. */
		function modalityText(t, modality) {
			const key = "modality" + String(modality).charAt(0).toUpperCase() + String(modality).slice(1);
			return t(key) === key ? String(modality) : t(key);
		}

		/**
		 * Render the catalog chips one model advertises.
		 *
		 * Everything shown here is what the catalog itself declared, so the table
		 * cannot claim a capability the provider did not announce: tool support,
		 * image input, and the reasoning levels the picker will actually offer.
		 *
		 * @param props.model - one normalized model.
		 * @param props.t - the bound translator.
		 * @returns the chip list.
		 */
		function ModelCapabilities({ model, t }) {
			const chips = [];
			for (const modality of model.inputModalities ?? []) {
				chips.push(react.createElement("span", { className: "dshKg_chip", key: "m:" + modality }, modalityText(t, modality)));
			}
			if (model.supportsTools === true) chips.push(react.createElement("span", { className: "dshKg_chip", key: "tools" }, t("capTools")));
			const levels = model.reasoningLevels ?? [];
			chips.push(
				react.createElement(
					"span",
					{ className: "dshKg_chip", key: "reasoning" },
					t("reasoningLevels") + ": " + (levels.length > 0 ? levels.join(" / ") : t("noReasoning")),
				),
			);
			if (model.mayTrainOnPrompts === true) chips.push(react.createElement("span", { className: "dshKg_chip", key: "train" }, t("capTraining")));
			return react.createElement("div", { className: "dshKg_chips" }, chips);
		}

		/**
		 * The available-model list: what the catalog currently offers, newest fetch
		 * first, with the capabilities each model declared for itself.
		 *
		 * @param props.feed - the shared state snapshot.
		 * @param props.t - the bound translator.
		 * @returns the section.
		 */
		function ModelsPanel({ feed, t }) {
			const state = feed.state;
			const models = Array.isArray(state?.models) ? state.models : [];
			const header = react.createElement(
				"div",
				{ className: "dshKg_sectionHead" },
				react.createElement("h3", { className: "dshKg_sectionTitle" }, t("modelsTitle")),
			);
			const intro = react.createElement("p", { className: "dshKg_meta" }, t("modelsHint"));

			if (feed.status === "error") {
				// Three faults that look alike and need different fixes:
				//
				// - Polling is off by the setting: not a failure at all.
				// - `/notify` answers on this port, so a server IS there, but it has no
				//   `/state` route — a build of the plugin older than this page, or a
				//   second host still holding the port. Saying "check the port" would
				//   send the user to a port that is demonstrably serving requests.
				// - Nothing answers at all: the port really is closed or the plugin is
				//   not loaded.
				const notice = feed.disabled === true
					? t("modelsNotifyOff")
					: feed.serverAlive === true || feed.httpStatus === 404
						? t("modelsRouteMissing")
						: t("modelsFetchFailed");
				return react.createElement(
					"div",
					{ className: "dshKg_section" },
					header,
					intro,
					react.createElement("p", { className: feed.disabled === true ? "dshKg_meta" : "dshKg_error" }, notice),
					// The transport message is evidence only when the request never got
					// an answer; alongside a status code it would be meaningless.
					feed.disabled !== true && feed.httpStatus === null && feed.error !== null
						? react.createElement("p", { className: "dshKg_meta" }, feed.error)
						: null,
				);
			}

			const fetched = Number.isFinite(state?.fetchedAt) && state.fetchedAt > 0 ? timeText(state.fetchedAt) : "";
			const meta = react.createElement(
				"p",
				{ className: "dshKg_meta" },
				fetched === "" ? "" : fill(t("modelsFetchedAt"), { time: fetched }),
				state?.lastFetchSucceeded === false && typeof state.lastError === "string"
					? react.createElement("span", { className: "dshKg_warn" }, (fetched === "" ? "" : " · ") + fill(t("modelsLastFailed"), { message: state.lastError }))
					: null,
			);

			if (models.length === 0) {
				return react.createElement("div", { className: "dshKg_section" }, header, intro, meta, react.createElement("p", { className: "dshKg_empty" }, t("modelsEmpty")));
			}

			const rows = models.map((model) =>
				react.createElement(
					"tr",
					{ key: model.id },
					react.createElement(
						"td",
						null,
						react.createElement("div", { className: "dshKg_name" }, model.name ?? model.id),
						react.createElement("div", { className: "dshKg_mono" }, model.id),
					),
					react.createElement("td", { className: "dshKg_num" }, sizeText(model.contextLength)),
					react.createElement("td", { className: "dshKg_num" }, sizeText(model.maxCompletionTokens)),
					react.createElement("td", null, react.createElement(ModelCapabilities, { model, t })),
					react.createElement("td", { className: "dshKg_mono" }, dateText(model.expires)),
				),
			);

			return react.createElement(
				"div",
				{ className: "dshKg_section" },
				header,
				intro,
				meta,
				react.createElement(
					"div",
					{ className: "dshKg_scroll" },
					react.createElement(
						"table",
						{ className: "dshKg_table" },
						react.createElement(
							"thead",
							null,
							react.createElement(
								"tr",
								null,
								react.createElement("th", null, t("colModel")),
								react.createElement("th", null, t("colContext")),
								react.createElement("th", null, t("colMaxOut")),
								react.createElement("th", null, t("colCapabilities")),
								react.createElement("th", null, t("colExpires")),
							),
						),
						react.createElement("tbody", null, rows),
					),
				),
			);
		}

		/**
		 * The catalog change log: every addition and removal the Host recorded, with
		 * the display names captured at the time.
		 *
		 * @param props.feed - the shared state snapshot.
		 * @param props.t - the bound translator.
		 * @returns the section.
		 */
		function ChangeLogPanel({ feed, t }) {
			const log = Array.isArray(feed.state?.changeLog) ? feed.state.changeLog : [];
			const entries = log.map((entry, index) => {
				const added = Array.isArray(entry.added) ? entry.added : [];
				const removed = Array.isArray(entry.removed) ? entry.removed : [];
				const names = (list) => list.map((item) => (typeof item === "string" ? item : item?.name ?? item?.id ?? "")).filter(Boolean).join(", ");
				return react.createElement(
					"div",
					{ className: "dshKg_change", key: entry.at ?? index },
					react.createElement("div", { className: "dshKg_changeTime" }, timeText(entry.at) + (Number.isFinite(entry.total) ? " · " + fill(t("changeLogTotal"), { total: entry.total }) : "")),
					added.length > 0 ? react.createElement("div", { className: "dshKg_addList" }, "+ " + added.length + " " + t("changeLogAdded") + ": " + names(added)) : null,
					removed.length > 0 ? react.createElement("div", { className: "dshKg_removeList" }, "− " + removed.length + " " + t("changeLogRemoved") + ": " + names(removed)) : null,
				);
			});
			return react.createElement(
				"div",
				{ className: "dshKg_section" },
				react.createElement("div", { className: "dshKg_sectionHead" }, react.createElement("h3", { className: "dshKg_sectionTitle" }, t("changeLogTitle"))),
				react.createElement("p", { className: "dshKg_meta" }, t("changeLogHint")),
				entries.length === 0 ? react.createElement("p", { className: "dshKg_empty" }, t("changeLogEmpty")) : react.createElement("div", { className: "dshKg_scroll" }, entries),
			);
		}

		/**
		 * The token totals this process accumulated, keyed by model.
		 *
		 * @param props.feed - the shared state snapshot.
		 * @param props.t - the bound translator.
		 * @returns the section.
		 */
		function TokenStatsPanel({ feed, t }) {
			const stats = feed.state?.tokenStats !== undefined && feed.state.tokenStats !== null ? feed.state.tokenStats : {};
			const models = Object.keys(stats);
			const totals = models.reduce(
				(sum, id) => {
					const entry = stats[id] ?? {};
					sum.calls += entry.calls ?? 0;
					sum.inputTokens += entry.inputTokens ?? 0;
					sum.outputTokens += entry.outputTokens ?? 0;
					sum.cacheReadTokens += entry.cacheReadTokens ?? 0;
					sum.cacheWriteTokens += entry.cacheWriteTokens ?? 0;
					sum.reasoningTokens += entry.reasoningTokens ?? 0;
					return sum;
				},
				{ calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
			);
			const cell = (value) => react.createElement("td", { className: "dshKg_num" }, tokenText(value));
			const rows = models.map((id) => {
				const entry = stats[id] ?? {};
				return react.createElement(
					"tr",
					{ key: id },
					react.createElement("td", { className: "dshKg_mono" }, id),
					cell(entry.calls),
					cell(entry.inputTokens),
					cell(entry.outputTokens),
					cell(entry.cacheReadTokens),
					cell(entry.cacheWriteTokens),
					cell(entry.reasoningTokens),
					react.createElement("td", { className: "dshKg_mono" }, timeText(entry.lastUsedAt) || "—"),
				);
			});
			const head = react.createElement(
				"tr",
				null,
				react.createElement("th", null, t("colModel")),
				react.createElement("th", null, t("colCalls")),
				react.createElement("th", null, t("colInput")),
				react.createElement("th", null, t("colOutput")),
				react.createElement("th", null, t("colCacheRead")),
				react.createElement("th", null, t("colCacheWrite")),
				react.createElement("th", null, t("colReasoningTokens")),
				react.createElement("th", null, t("colLastUsed")),
			);
				return react.createElement(
					"div",
					{ className: "dshKg_section" },
					react.createElement("div", { className: "dshKg_sectionHead" }, react.createElement("h3", { className: "dshKg_sectionTitle" }, t("tokenStatsTitle"))),
					react.createElement("p", { className: "dshKg_meta" }, t("tokenStatsHint")),
					models.length === 0
						? react.createElement("p", { className: "dshKg_empty" }, t("tokenStatsEmpty"))
						: react.createElement(
								"div",
								{ className: "dshKg_scroll" },
								react.createElement(
									"table",
									{ className: "dshKg_table" },
									react.createElement("thead", null, head),
									react.createElement(
										"tbody",
										null,
										rows,
										// A summary row, labelled in words rather than with a
										// symbol: a bare "Σ" in the model column reads as a model
										// name, which is exactly how it was misread.
										react.createElement(
											"tr",
											{ key: "__total", className: "dshKg_total" },
											react.createElement("td", { className: "dshKg_name" }, t("tokenStatsTotal")),
											cell(totals.calls),
											cell(totals.inputTokens),
											cell(totals.outputTokens),
											cell(totals.cacheReadTokens),
											cell(totals.cacheWriteTokens),
											cell(totals.reasoningTokens),
											react.createElement("td", null, "—"),
										),
									),
								),
							),
				);
			}


		/**
		 * The Kilo Gateway settings page.
		 *
		 * It stages nothing and saves explicitly through the shared settings form:
		 * the shell's save is the one place a draft becomes a document mutation.
		 * Every field here is `.volatile()` in the Host schema, so an accepted save
		 * reaches the running plugin through its reference cell without reloading
		 * the fiber — the notification endpoint and the refresh timer re-read it
		 * live, and the toast poller below follows the port.
		 *
		 * The form controller arrives as the injected `kiloForm` prop rather than
		 * through the Plugins page: `plugins.bundle.config` receives no `form`
		 * argument, and taking the controller from `configForms` directly gives one
		 * code path wherever the page is mounted.
		 *
		 * @param {object} props - the slot's kit: the injected `kiloForm`, the bound
		 *   translator `t`, the shared `kiloFeed`, the page's `kiloCredentials`
		 *   handle, and the view the Plugins page asks for.
		 * @returns {object} the one-liner, or the settings form.
		 */
		function KiloGatewayPage(props) {
			const { t, kiloForm, kiloFeed, kiloCredentials } = props;

			const state = react.useSyncExternalStore(
				react.useCallback((listener) => kiloForm.subscribe(listener), [kiloForm]),
				() => kiloForm.getSnapshot(),
			);
			const feed = react.useSyncExternalStore(
				react.useCallback((listener) => kiloFeed.subscribe(listener), [kiloFeed]),
				() => kiloFeed.getSnapshot(),
			);

			// Drafts are local: the Host is the only authority on what a save
			// accepted, so the staged values live here until `mutate` answers.
			const [draft, setDraft] = react.useState(null);
			const [saving, setSaving] = react.useState(false);
			const [failed, setFailed] = react.useState(false);
			// The key is deliberately outside the draft: it does not live in the
			// settings document, so it has no revision to conflict with and is written
			// immediately rather than on save.
			const [keyDraft, setKeyDraft] = react.useState("");
			const [keyBusy, setKeyBusy] = react.useState(false);
			const [keyFailed, setKeyFailed] = react.useState(null);
			const [credential, setCredential] = react.useState(kiloCredentials?.get() ?? { configured: false, writable: false, available: false });
			/**
			 * Credential reference the key field addresses, read from the draft so a
			 * renamed reference is reflected before the form is saved.
			 */
			const draftRef = draft?.apiKeyEnv === undefined || draft.apiKeyEnv === "" ? DEFAULT_API_KEY_REF : draft.apiKeyEnv;

			// Hooks must run on every render of this component, so every hook sits
			// above the early returns below. The `summary` view draws the bundle
			// card's one-liner, which has no form.
			react.useEffect(() => {
				if (kiloCredentials === undefined) return undefined;
				return kiloCredentials.subscribe(setCredential);
			}, [kiloCredentials]);

			// The credential reference can be edited in the same form that shows the
			// key field, so the badge follows the draft rather than only the stored
			// section: otherwise a renamed reference would keep reporting the old
			// name's state until the form was saved.
			react.useEffect(() => {
				if (kiloCredentials === undefined) return;
				kiloCredentials.read(draftRef);
			}, [kiloCredentials, draftRef]);

			if (props.view === "summary") return t("description");

			// Until the Host answers `settings.describe` the section is unknown, so
			// the form has nothing to show and must not render controls that would
			// read from an undefined value.
			if (state.status === "loading") return t("loading");
			if (state.status === "unavailable") return t("unavailable");

			const stored = state.value;

			const apiKeyEnv = draft?.apiKeyEnv ?? String(fieldOf(stored, FIELD_API_KEY_ENV) ?? "");
			const refresh = draft?.refresh ?? String(fieldOf(stored, FIELD_REFRESH) ?? "");
			const port = draft?.port ?? String(fieldOf(stored, FIELD_PORT) ?? "");
			const firstLoad = draft?.firstLoad ?? fieldOf(stored, FIELD_FIRST_LOAD) === true;
			const maxRetries = draft?.maxRetries ?? String(fieldOf(stored, FIELD_MAX_RETRIES) ?? "");
			const timeout = draft?.timeout ?? String(fieldOf(stored, FIELD_TIMEOUT) ?? "");

			const writable = state.writable !== false;
			const dirty = draft !== null;

			const refreshValue = parseWhole(refresh, MIN_REFRESH_MS);
			const portValue = parseWhole(port, 0);
			const retriesValue = parseWhole(maxRetries, RETRY_RANGE.min);
			const timeoutValue = parseWhole(timeout, TIMEOUT_RANGE.min);
			const refreshInvalid = refreshValue === undefined;
			const portInvalid = portValue === undefined || portValue > 65535;
			const retriesInvalid = retriesValue === undefined || retriesValue > RETRY_RANGE.max;
			const timeoutInvalid = timeoutValue === undefined || timeoutValue > TIMEOUT_RANGE.max;
			const anyInvalid = refreshInvalid || portInvalid || retriesInvalid || timeoutInvalid;

			const stage = (patch) => {
				setFailed(false);
				setDraft((current) => ({
					apiKeyEnv,
					refresh,
					port,
					firstLoad,
					maxRetries,
					timeout,
					...current,
					...patch,
				}));
			};

			const save = async () => {
				if (!dirty || saving || anyInvalid) return;
				const ops = [];
				if (apiKeyEnv !== String(fieldOf(stored, FIELD_API_KEY_ENV) ?? "")) {
					ops.push({ op: "set", path: [FIELD_API_KEY_ENV], value: apiKeyEnv });
				}
				if (refreshValue !== fieldOf(stored, FIELD_REFRESH)) {
					ops.push({ op: "set", path: [FIELD_REFRESH], value: refreshValue });
				}
				if (portValue !== fieldOf(stored, FIELD_PORT)) {
					ops.push({ op: "set", path: [FIELD_PORT], value: portValue });
				}
				if (firstLoad !== (fieldOf(stored, FIELD_FIRST_LOAD) === true)) {
					ops.push({ op: "set", path: [FIELD_FIRST_LOAD], value: firstLoad });
				}
				if (retriesValue !== fieldOf(stored, FIELD_MAX_RETRIES)) {
					ops.push({ op: "set", path: [FIELD_MAX_RETRIES], value: retriesValue });
				}
				if (timeoutValue !== fieldOf(stored, FIELD_TIMEOUT)) {
					ops.push({ op: "set", path: [FIELD_TIMEOUT], value: timeoutValue });
				}
				setSaving(true);
				try {
					const landed = ops.length === 0 || (await kiloForm.mutate(ops, state.revision));
					if (landed) setDraft(null);
					else setFailed(true);
				} catch {
					setFailed(true);
				} finally {
					setSaving(false);
				}
			};

			/** Write the staged key now, then re-read whether the Host holds one. */
			const commitKey = async () => {
				if (keyDraft === "" || keyBusy || kiloCredentials === undefined) return;
				setKeyBusy(true);
				setKeyFailed(null);
				try {
					const outcome = await kiloCredentials.write(draftRef, keyDraft);
					if (outcome.ok) setKeyDraft("");
					else setKeyFailed(failureOf(outcome));
				} catch (err) {
					setKeyFailed(fill(t("keyWriteFailed"), { message: err instanceof Error ? err.message : String(err) }));
				} finally {
					setKeyBusy(false);
				}
			};

			/** Drop the stored key, then re-read the reported state. */
			const clearKey = async () => {
				if (keyBusy || kiloCredentials === undefined) return;
				setKeyBusy(true);
				setKeyFailed(null);
				try {
					const outcome = await kiloCredentials.clear(draftRef);
					if (outcome.ok) setKeyDraft("");
					else setKeyFailed(failureOf(outcome));
				} catch (err) {
					setKeyFailed(fill(t("keyWriteFailed"), { message: err instanceof Error ? err.message : String(err) }));
				} finally {
					setKeyBusy(false);
				}
			};

			const keyState = react.createElement(
				"div",
				{ className: "dshKg_keyState" },
				react.createElement("span", { className: "dshKg_keyDot" + (credential.configured ? " dshKg_on" : "") }),
				react.createElement("span", { className: "dshKg_hint" }, credential.configured ? t("apiKeySet") : t("apiKeyUnset")),
			);
			/** Whether a credentials service is reachable, so the key control can render. */
			const keyAvailable = credential.available === true;
			/** Turn one write outcome into the sentence the control reports. */
			const failureOf = (outcome) =>
				outcome.unavailable === true ? t("apiKeyUnavailable") : fill(t("keyWriteFailed"), { message: outcome.message ?? "" });

			return react.createElement(
				primitives.SettingsForm,
				{
					labels: formLabels(t),
					state: {
						available: state.status !== "unavailable",
						writable,
						dirty,
						invalid: refreshInvalid || portInvalid,
						saving,
						failed,
					},
					onSave: save,
					onDiscard: () => {
						setDraft(null);
						setFailed(false);
					},
				},
				// --- Your own key ---
				// The literal never rides a response, so this control is not part of the
				// settings document and is not staged with it: it writes through the
				// credentials service the moment it is committed, and the page only ever
				// learns whether one is configured.
				keyAvailable ? react.createElement(
					"div",
					{ className: "dshKg_row" },
					react.createElement("span", { className: "dshKg_label" }, t("apiKey")),
					keyState,
					react.createElement("input", {
						type: "password",
						className: "dshKg_input" + (keyFailed !== null ? " dshKg_invalid" : ""),
						value: keyDraft,
						disabled: keyBusy || credential.writable === false,
						autoComplete: "off",
						name: "kilo-gateway-api-key",
						placeholder: "sk-…",
						"aria-label": t("apiKey"),
						onChange: (event) => {
							setKeyFailed(null);
							setKeyDraft(event.target.value);
						},
						onKeyDown: (event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								void commitKey();
							}
						},
					}),
					react.createElement(
						"div",
						{ className: "dshKg_toggle" },
						react.createElement(
							"button",
							{
								type: "button",
								className: "dshKg_action",
								disabled: keyBusy || keyDraft === "",
								onClick: () => void commitKey(),
							},
							keyBusy ? t("saving") : t("save"),
						),
						credential.configured
							? react.createElement(
									"button",
									{
										type: "button",
										className: "dshKg_action",
										disabled: keyBusy || credential.writable === false,
										onClick: () => void clearKey(),
									},
									t("apiKeyClear"),
								)
							: null,
					),
						keyFailed !== null ? react.createElement("p", { className: "dshKg_error" }, keyFailed) : null,
					react.createElement("p", { className: "dshKg_hint" }, t("apiKeyHint")),
					apiKeyEnv === ""
						? react.createElement("p", { className: "dshKg_hint" }, t("apiKeyAnonymous"))
						: react.createElement("p", { className: "dshKg_hint" }, fill(t("apiKeyRefHint"), { ref: draftRef })),
				) : react.createElement("p", { className: "dshKg_notice" }, t("apiKeyUnavailable")),
				react.createElement(
					"div",
					{ className: "dshKg_row" },
					react.createElement("span", { className: "dshKg_label" }, t("apiKeyEnv")),
					react.createElement("input", {
						type: "text",
						className: "dshKg_input",
						value: apiKeyEnv,
						disabled: !writable,
						placeholder: "KILO_API_KEY",
						"aria-label": t("apiKeyEnv"),
						onChange: (event) => stage({ apiKeyEnv: event.target.value }),
					}),
					react.createElement("p", { className: "dshKg_hint" }, t("apiKeyEnvHint")),
				),
				react.createElement(
					"div",
					{ className: "dshKg_row" },
					react.createElement("span", { className: "dshKg_label" }, t("refreshIntervalMs")),
					react.createElement("input", {
						type: "number",
						className: "dshKg_input dshKg_number" + (refreshInvalid ? " dshKg_invalid" : ""),
						min: MIN_REFRESH_MS,
						step: 1000,
						value: refresh,
						disabled: !writable,
						"aria-label": t("refreshIntervalMs"),
						"aria-invalid": refreshInvalid,
						onChange: (event) => stage({ refresh: event.target.value }),
					}),
					react.createElement("p", { className: "dshKg_hint" }, t("refreshIntervalMsHint")),
				),
				react.createElement(
					"div",
					{ className: "dshKg_row" },
					react.createElement("span", { className: "dshKg_label" }, t("notifyPort")),
					react.createElement("input", {
						type: "number",
						className: "dshKg_input dshKg_number" + (portInvalid ? " dshKg_invalid" : ""),
						min: 0,
						max: 65535,
						step: 1,
						value: port,
						disabled: !writable,
						"aria-label": t("notifyPort"),
						"aria-invalid": portInvalid,
						onChange: (event) => stage({ port: event.target.value }),
					}),
					react.createElement("p", { className: "dshKg_hint" }, t("notifyPortHint")),
				),
				react.createElement(
					"div",
					{ className: "dshKg_row" },
					react.createElement(
						"div",
						{ className: "dshKg_toggle" },
						react.createElement(primitives.Switch, {
							checked: firstLoad,
							onChange: (next) => stage({ firstLoad: next }),
							label: t("notifyOnFirstLoad"),
							disabled: !writable,
						}),
						react.createElement("span", { className: "dshKg_label" }, t("notifyOnFirstLoad")),
					),
					react.createElement("p", { className: "dshKg_hint" }, t("notifyOnFirstLoadHint")),
				),
				react.createElement(
					"div",
					{ className: "dshKg_row" },
					react.createElement("span", { className: "dshKg_label" }, t("maxRetries")),
					react.createElement("input", {
						type: "number",
						className: "dshKg_input dshKg_number" + (retriesInvalid ? " dshKg_invalid" : ""),
						min: RETRY_RANGE.min,
						max: RETRY_RANGE.max,
						step: 1,
						value: maxRetries,
						disabled: !writable,
						"aria-label": t("maxRetries"),
						"aria-invalid": retriesInvalid,
						onChange: (event) => stage({ maxRetries: event.target.value }),
					}),
					react.createElement("p", { className: "dshKg_hint" }, t("maxRetriesHint")),
				),
				react.createElement(
					"div",
					{ className: "dshKg_row" },
					react.createElement("span", { className: "dshKg_label" }, t("requestTimeoutMs")),
					react.createElement("input", {
						type: "number",
						className: "dshKg_input dshKg_number" + (timeoutInvalid ? " dshKg_invalid" : ""),
						min: TIMEOUT_RANGE.min,
						max: TIMEOUT_RANGE.max,
						step: 1000,
						value: timeout,
						disabled: !writable,
						"aria-label": t("requestTimeoutMs"),
						"aria-invalid": timeoutInvalid,
						onChange: (event) => stage({ timeout: event.target.value }),
					}),
					react.createElement("p", { className: "dshKg_hint" }, t("requestTimeoutMsHint")),
				),
				react.createElement("p", { className: "dshKg_notice" }, t("privacy")),
				react.createElement(ModelsPanel, { feed, t }),
				react.createElement(ChangeLogPanel, { feed, t }),
				react.createElement(TokenStatsPanel, { feed, t }),
			);
		}
		//#endregion

		//#region notification toast
		/** How often the notification endpoint is polled while the page is open. */
		const POLL_INTERVAL_MS = 60000;
		/** Delay before the first poll, so startup traffic settles first. */
		const POLL_INITIAL_DELAY_MS = 3000;
		/** How long a toast stays on screen. */
		const NOTIFY_DURATION_MS = 30000;

		/** The toast overlay, created on first use and reused afterwards. */
		let overlay = null;
		/** The last payload rendered, so an unchanged catalog raises no toast. */
		let lastPayload = null;
		/** Whether this poller has already raised its first-load toast. */
		let initialShown = false;

		function createOverlay() {
			const element = document.createElement("div");
			element.id = "kilo-gateway-notify-overlay";
			element.style.cssText = [
				"position:fixed",
				"top:12px",
				"right:12px",
				"z-index:999999",
				"pointer-events:none",
				"display:flex",
				"flex-direction:column",
				"gap:8px",
				"max-width:380px",
			].join(";");
			return element;
		}

		function escapeHtml(text) {
			const div = document.createElement("div");
			div.textContent = String(text);
			return div.innerHTML;
		}

		function injectAnimation() {
			if (document.getElementById("kilo-notify-animation") !== null) return;
			const style = document.createElement("style");
			style.id = "kilo-notify-animation";
			style.textContent =
				"@keyframes kilo-slide-in{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}";
			document.head.appendChild(style);
		}

		function dismissToast(toast) {
			if (toast.parentNode === null) return;
			toast.style.transition = "opacity 0.3s, transform 0.3s";
			toast.style.opacity = "0";
			toast.style.transform = "translateX(20px)";
			setTimeout(() => {
				toast.remove();
			}, 300);
		}

		/**
		 * Render one catalog payload as a toast.
		 *
		 * The copy is built from the plugin's own dictionary rather than embedded
		 * English, so the toast follows the active language like the settings page.
		 *
		 * @param {object} payload - the notification endpoint's answer.
		 * @param {Function} t - the namespace-bound translator.
		 * @returns {HTMLElement} the toast element.
		 */
		function createToast(payload, t) {
			const toast = document.createElement("div");
			const isChange = payload.hasChanges === true && payload.error === undefined;
			const isError = typeof payload.error === "string";

			const bg = isError ? "#f44336" : isChange ? "#4caf50" : "#2196f3";
			const title = isError ? "⚠️  " + t("notifyFailed") : isChange ? "✨  " + t("notifyUpdated") : "📡  " + t("notifyRefreshed");
			const subtitle = isError ? t("notifyFailedSub") : isChange ? t("notifyUpdatedSub") : t("notifyRefreshedSub");

			let detailsHtml = "";
			if (isError) {
				detailsHtml = `<div style="margin-top:6px;font-size:12px;color:#fff">${escapeHtml(payload.error)}</div>`;
			} else if (isChange) {
				if (Array.isArray(payload.added) && payload.added.length > 0) {
					detailsHtml += `<div style="margin-top:6px;font-size:12px;color:#2e7d32"><b>+${payload.added.length} ${escapeHtml(t("added"))}:</b> ${payload.added.map(escapeHtml).join(", ")}</div>`;
				}
				if (Array.isArray(payload.removed) && payload.removed.length > 0) {
					detailsHtml += `<div style="margin-top:4px;font-size:12px;color:#c62828"><b>-${payload.removed.length} ${escapeHtml(t("removed"))}:</b> ${payload.removed.map(escapeHtml).join(", ")}</div>`;
				}
			} else {
				detailsHtml = `<div style="margin-top:6px;font-size:12px;color:#fff">${escapeHtml(payload.totalFree)} ${escapeHtml(t("noChanges"))}</div>`;
			}

			const stamp = Number.isFinite(payload.fetchedAt) && payload.fetchedAt > 0
				? new Date(payload.fetchedAt).toLocaleTimeString()
				: "";

			toast.innerHTML = `
        <div style="background:${bg};color:white;border-radius:12px;padding:14px 16px;box-shadow:0 4px 20px rgba(0,0,0,0.25);pointer-events:auto;animation:kilo-slide-in 0.3s ease-out;cursor:pointer;font-family:system-ui,-apple-system,sans-serif">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span style="font-weight:600;font-size:14px">${escapeHtml(title)}</span>
            <span style="font-size:11px;opacity:0.7">${escapeHtml(stamp)}</span>
          </div>
          <div style="font-size:13px;margin-top:2px;opacity:0.9">${escapeHtml(subtitle)}</div>
          ${detailsHtml}
        </div>
      `;

			toast.addEventListener("click", () => dismissToast(toast));
			setTimeout(() => dismissToast(toast), NOTIFY_DURATION_MS);
			return toast;
		}

		/** Draw one payload, replacing whatever the overlay currently shows. */
		function showNotification(payload, t) {
			injectAnimation();
			if (overlay === null) {
				overlay = createOverlay();
				document.body.appendChild(overlay);
			}
			while (overlay.firstChild !== null) overlay.firstChild.remove();
			overlay.appendChild(createToast(payload, t));
		}

		/** Remove the overlay, if one is mounted. */
		function removeOverlay() {
			if (overlay === null) return;
			overlay.remove();
			overlay = null;
		}
		//#endregion

		//#region plugin
		/** Dictionary namespace owned by this plugin. */
		const NS = "settings.kiloGateway";
		/**
		 * Settings namespace the Host half registers. Spelled rather than imported:
		 * a browser bundle must not depend on a Host package, so both halves state
		 * the same literal (the Host's is `kilo-gateway`).
		 */
		const SETTINGS_NS = "kilo-gateway";
		/** Services this plugin needs from the browser runtime. */
		const inject = ["slots", "locale", "configForms"];
		/**
		 * The bundle this plugin ships as. The Plugins page keys its configuration
		 * slot by the bundle's package name, so the page has to name the same
		 * string the profile installed (`pluginManager.listBundles` reports it).
		 */
		const BUNDLE_NAME = "dsh-llm-kilo-gateway";
		/** Row id inside that bundle, as the bundle patch declares it. */
		const ROW_ID = "kilo-gateway";

		/**
		 * Register the settings page into the Plugins page.
		 *
		 * Three slots carry a bundle's configuration, and which one is right
		 * depends on where the user stands:
		 *
		 * - `plugins.bundle.config`, keyed by the bundle name, is the form on the
		 *   bundle's own detail page.
		 * - `plugins.row.config`, keyed `<bundle>#<rowId>`, is the form on the
		 *   component row's detail page.
		 * - `plugins.item` is a list slot that mints a standalone card in the
		 *   Official group.
		 *
		 * All three are registered so the settings are reachable wherever the user
		 * looks. They ride `configForms.whileServed`, so a deployment that never
		 * mounted the Host half shows no trace of them.
		 *
		 * The form controller is injected rather than read from the page's own
		 * `form` argument: `plugins.bundle.config` receives no such argument, and
		 * one injected controller keeps every mount on the same code path.
		 *
		 * @param {object} ctx - the browser plugin context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "kilo-gateway: dictionaries");
			const t = ctx.locale.bind(NS);
			const form = ctx.configForms.get(SETTINGS_NS);
			const feed = createStateFeed();
			const credentials = createCredentials(ctx);
			const injectForm = () => ({ kiloForm: form, kiloFeed: feed, kiloCredentials: credentials });

			// A key can be written from the Models page, which addresses the same
			// credential reference; the settings section does not change when it is, so
			// without this the badge would keep reporting a state the Host replaced.
			// The remotes assembly is resolved lazily for the same reason the
			// credentials namespace is: a deployment without it must still render the
			// page, just without the invalidation follow-up.
			ctx.effect(() => {
				const remotes = typeof ctx.get === "function" ? ctx.get("remote") : void 0;
				if (remotes === undefined || typeof remotes.$on !== "function") return () => {};
				return remotes.$on("credentials/reference-updated", (ref) => {
					if (ref === credentialRefOf(form.getSnapshot().value)) void credentials.read(ref);
				});
			}, "kilo-gateway: credential invalidations");

			/** Register the page into one slot, while the Host serves the namespace. */
			const mount = (slot, options, label) => {
				ctx.effect(
					() =>
						ctx.configForms.whileServed([SETTINGS_NS], () =>
							ctx.slots.inject(slot, () =>
								ctx.slots.register({ ...options, name: slot, locale: NS, inject: injectForm }, KiloGatewayPage),
							),
						),
					label,
				);
			};

			mount("plugins.bundle.config", { key: BUNDLE_NAME }, "kilo-gateway: bundle settings page");
			mount("plugins.row.config", { key: `${BUNDLE_NAME}#${ROW_ID}` }, "kilo-gateway: row settings page");
			mount("plugins.item", { id: SETTINGS_NS, order: 40, label: () => t("title") }, "kilo-gateway: settings card");

			// --- Catalog change toast and page state ---
			// The endpoint is loopback-only and its port is a live setting, so the
			// poller follows the served section instead of a compiled-in URL: a port
			// edit restarts it, and port 0 (or a section the Host does not serve)
			// stops it outright. Reading the port from the settings section is also
			// why the Host half no longer falls back to a random port — a server the
			// client cannot address is not a working notification path.
			//
			// One poller serves both consumers: the same endpoint answers `/notify`
			// for the toast and `/state` for the page's panels, so the model list,
			// the change log, and the token totals always describe the same fetch the
			// toast announced.
			ctx.effect(() => {
				let timer = null;
				let activeUrl = null;
				let activeFirstLoad = false;
				let disposed = false;

				const readSettings = () => {
					const snapshot = form.getSnapshot();
					if (snapshot.status !== "ready" || typeof snapshot.value !== "object" || snapshot.value === null) return null;
					const port = snapshot.value[FIELD_PORT];
					return {
						url: Number.isInteger(port) && port > 0 ? `http://127.0.0.1:${port}/notify` : null,
						stateUrl: Number.isInteger(port) && port > 0 ? `http://127.0.0.1:${port}/state` : null,
						firstLoad: snapshot.value[FIELD_FIRST_LOAD] === true,
					};
				};

				/**
				 * Pull the page's state. Kept separate from the toast's poll so a
				 * failing `/state` cannot suppress a change toast, and vice versa.
				 *
				 * A non-ok answer is recorded with its status rather than collapsed
				 * into "unreachable": a 404 means the endpoint is not there at all,
				 * which is a different problem with a different fix than a refused
				 * connection.
				 *
				 * Both faults are then narrowed further by probing `/notify`, which
				 * shares this one listener and is therefore direct evidence of
				 * whether the server is alive at all. That distinction matters most in
				 * the case that is otherwise baffling: an older or second host still
				 * holding the configured port, where `/notify` answers happily while
				 * `/state` does not exist.
				 *
				 * @param stateUrl - the endpoint's `/state` URL.
				 * @param notifyUrl - the endpoint's `/notify` URL, probed on failure.
				 */
				const pollState = async (stateUrl, notifyUrl) => {
					/** Ask `/notify` whether anything is serving on this port at all. */
					const serverAlive = async () => {
						if (notifyUrl === null) return false;
						try {
							const probe = await fetch(notifyUrl, { cache: "no-store" });
							return probe.ok;
						} catch {
							return false;
						}
					};
					try {
						const response = await fetch(stateUrl, { cache: "no-store" });
						if (response.ok) {
							const payload = await response.json();
							if (!disposed) feed.publish({ status: "ready", state: payload, error: null, httpStatus: 200, serverAlive: true });
							return;
						}
						const alive = await serverAlive();
						if (!disposed) feed.publish({ status: "error", state: null, error: null, httpStatus: response.status, serverAlive: alive });
					} catch (err) {
						const alive = await serverAlive();
						if (!disposed) {
							feed.publish({
								status: "error",
								state: null,
								error: err instanceof Error ? err.message : String(err),
								httpStatus: null,
								serverAlive: alive
							});
						}
					}
				};

				const poll = async () => {
					if (activeUrl === null || disposed) return;
					try {
						const response = await fetch(activeUrl, { cache: "no-store" });
						if (!response.ok) return;
						const payload = await response.json();
						if (disposed || activeUrl === null) return;
						const changed = lastPayload === null || JSON.stringify(lastPayload) !== JSON.stringify(payload);
						if (!initialShown ? activeFirstLoad : changed) {
							showNotification(payload, t);
						}
						initialShown = true;
						lastPayload = payload;
					} catch {
						// Endpoint not up yet (or already gone); the next tick retries.
					}
				};

				const sync = () => {
					const settings = readSettings();
					const url = settings?.url ?? null;
					const stateUrl = settings?.stateUrl ?? null;
					const firstLoad = settings?.firstLoad ?? false;
					if (url === activeUrl && firstLoad === activeFirstLoad) return;
					// A new endpoint (or a restarted one) has its own first payload, so
					// the comparison baseline and the first-load flag start over.
					activeUrl = url;
					activeFirstLoad = firstLoad;
					lastPayload = null;
					initialShown = false;
					removeOverlay();
					if (timer !== null) {
						clearInterval(timer);
						timer = null;
					}
					if (url === null) {
						// Polling is off by the setting, so there is nothing to probe and
						// no fault to report: port 0 means "no notifications", not a failure.
						feed.publish({ status: "error", state: null, error: null, httpStatus: null, serverAlive: false, disabled: true });
						return;
					}
					void pollState(stateUrl, url);
					timer = setInterval(() => {
						void poll();
						void pollState(stateUrl, url);
					}, POLL_INTERVAL_MS);
					setTimeout(poll, POLL_INITIAL_DELAY_MS);
				};

				// The form's own snapshot drives the port, while a credential write
				// changes nothing the settings section carries.
				sync();
				const off = form.subscribe(sync);

				return () => {
					disposed = true;
					off();
					if (timer !== null) clearInterval(timer);
					removeOverlay();
				};
			}, "kilo-gateway: catalog change toast");
		}
		//#endregion

		exports.SETTINGS_NS = SETTINGS_NS;
		exports.DEFAULT_API_KEY_REF = DEFAULT_API_KEY_REF;
		exports.createCredentials = createCredentials;
		exports.createStateFeed = createStateFeed;
		exports.credentialRefOf = credentialRefOf;
		// These helpers are pure and carry the page's entire presentation contract,
		// so the tests pin them directly rather than walking a rendered tree.
		exports.utils = Object.freeze({ dateText, fill, modalityText, parseWhole, sizeText, timeText, tokenText });
		exports.dictionaries = Object.freeze({ zh, en });
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
