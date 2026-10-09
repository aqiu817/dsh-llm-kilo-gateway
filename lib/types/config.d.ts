/**
 * Configuration schema for the Kilo Gateway plugin.
 * @module dsh-llm-kilo-gateway/config
 */
/**
 * One reasoning level a catalog entry offers.
 *
 * Level ids keep the catalog's own variant names (`low`/`medium`/`high`,
 * `instant`/`thinking`, …) rather than being mapped onto a fixed vocabulary,
 * because an invented mapping would offer levels the model never claimed. The
 * wire value is what the gateway accepts as `reasoning_effort`; a level with no
 * wire value means "send no reasoning field at all".
 */
export interface KiloReasoningLevel {
    /** Level id, as the model picker addresses it. */
    id: string;
    /** Display name. */
    name: string;
    /** Value sent as `reasoning_effort`; absent means the field is omitted. */
    effort?: string;
}
/**
 * One catalog model as the plugin normalized it.
 *
 * Every capability is read from the catalog rather than assumed, so an absent
 * field falls back to the conservative answer (text-only, no tools).
 */
export interface KiloModel {
    id: string;
    name: string;
    contextLength: number;
    maxCompletionTokens: number;
    inputModalities: string[];
    outputModalities: string[];
    /** Whether the catalog listed `tools` among the supported parameters. */
    supportsTools?: boolean;
    /** Reasoning levels the catalog declared, in its own order. */
    reasoningLevels?: KiloReasoningLevel[];
    /** Catalog expiry, as the `YYYY-MM-DD` string the catalog states. */
    expires?: string;
    mayTrainOnPrompts: boolean;
}
/**
 * A `.volatile()` field as it reaches `apply()`.
 *
 * The host hands a volatile field out as a frozen reference cell rather than a
 * plain value: a settings write mutates the cell in place instead of reloading
 * the plugin fiber, so every read has to go through `get()` to observe the
 * current choice. Declared structurally rather than imported from
 * `@deepseek-ai/cosmokit`, which this package does not depend on — the host
 * provides the implementation, and the shape is the whole contract.
 */
export interface Volatile<T> {
    /** @returns the current value, including `undefined` for an absent one. */
    get(): T;
}
/**
 * Resolved plugin configuration.
 *
 * Every field but `baseURL` and `catalogUrl` is editable from the Plugins page
 * and therefore arrives as a {@link Volatile} reference.
 */
export interface Config {
    /** Endpoint the catalog and chat requests are sent to. */
    baseURL: string;
    /** Model-catalog endpoint. */
    catalogUrl: string;
    /** Credential reference resolved per request; empty selects anonymous access. */
    apiKeyEnv: Volatile<string>;
    /** How often the free-model catalog is re-fetched, in milliseconds. */
    refreshIntervalMs: Volatile<number>;
    /** Loopback port of the change-notification endpoint; 0 disables it. */
    notifyPort: Volatile<number>;
    /** Whether the browser half notifies on the first catalog read. */
    notifyOnFirstLoad: Volatile<boolean>;
    /**
     * Attempts the harness may make against one failed request; 0 disables
     * retrying. Read live per request, because the host consults the policy when
     * a failure happens rather than when the plugin activates.
     */
    maxRetries: Volatile<number>;
    /** How long one upstream attempt may run before it is abandoned, in milliseconds. */
    requestTimeoutMs: Volatile<number>;
}
