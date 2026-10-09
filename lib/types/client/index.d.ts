/**
 * Browser half of the Kilo Gateway plugin: the settings page on the Plugins
 * page, its read-only panels, and the catalog-change toast.
 * @module dsh-llm-kilo-gateway/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/**
 * Settings namespace the host half registers (`kilo-gateway`). Spelled here
 * rather than imported, because a browser bundle must not depend on a host
 * package; both halves state the same literal.
 */
export declare const SETTINGS_NS = "kilo-gateway";
/**
 * Credential name the key field writes under when the section names none.
 *
 * A blank `apiKeyEnv` means anonymous access, which leaves no name to store a
 * key under, so the page falls back to the same name its own placeholder offers.
 */
export declare const DEFAULT_API_KEY_REF = "KILO_API_KEY";
/**
 * Services this browser half needs. `slots` comes from
 * `@deepseek-ai/dsh-client-ui-renderer`, `locale` from
 * `@deepseek-ai/dsh-client-locale`, and `configForms` from
 * `@deepseek-ai/dsh-client-ui-settings`; all three are named in this package's
 * `dsh.client.inject` so the loader orders their rows first.
 *
 * The remotes services (`remote`, `remote.credentials`) are deliberately NOT
 * listed here: they are resolved lazily so a deployment without them still
 * renders the page, minus the key control.
 */
export declare const inject: string[];
/**
 * The credential reference the key control reads and writes, for a section that
 * may name none.
 * @param section - the settings section value.
 * @returns the reference to address.
 */
export declare function credentialRefOf(section: unknown): string;
/**
 * Build the handle the key control drives, over the lazily-resolved
 * `remote.credentials` namespace.
 * @param ctx - the browser plugin context.
 * @returns the handle: `get`, `subscribe`, `read`, `write`, and `clear`.
 */
export declare function createCredentials(ctx: ClientContext): {
    get(): { configured: boolean; writable: boolean; available: boolean };
    subscribe(listener: (view: { configured: boolean; writable: boolean; available: boolean }) => void): () => void;
    read(ref: string): Promise<void>;
    write(ref: string, value: string): Promise<{ ok: true } | { ok: false; message?: string; unavailable?: true }>;
    clear(ref: string): Promise<{ ok: true } | { ok: false; message?: string; unavailable?: true }>;
};
/**
 * Create the store the toast and the settings page's panels share, so one fetch
 * feeds both.
 * @returns the store: `getSnapshot`, `subscribe`, and `publish`.
 */
export declare function createStateFeed(): {
    getSnapshot(): { status: string; state: unknown; error: string | null };
    subscribe(listener: () => void): () => void;
    publish(next: { status: string; state: unknown; error: string | null }): void;
};
/**
 * Register the settings page and start the catalog-change poller.
 * @param ctx - the browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
