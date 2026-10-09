/**
 * Kilo Gateway free-model provider plugin for DeepSeek Harness.
 * @module dsh-llm-kilo-gateway
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Config } from './config.ts';
export { Config } from './config.ts';
export type { KiloModel, KiloReasoningLevel } from './config.ts';
export declare const name = "kilo-gateway";
/**
 * Services this plugin waits for before activating.
 *
 * Only `llm`. The settings namespace is deliberately absent: since 0.1.7 the
 * host reflects an activated entry's Config into the settings plane by itself,
 * so there is no section to install and no service to wait for. The editable
 * fields are declared with `.volatile()` on {@link Config}.
 *
 * `credentials` and `attachments` are resolved lazily at their use sites rather
 * than injected: both are optional for this plugin — an anonymous deployment
 * has no key to resolve, and a text-only one has no image to read — and a
 * missing optional service must not park the whole provider.
 */
export declare const inject: string[];
/**
 * Map one HTTP status onto the harness's retry vocabulary.
 *
 * This mapping *is* the retry policy: `dsh-llm-retry` retries the codes it
 * recognizes as recoverable and ends the turn on the rest.
 *
 * @param status - the upstream HTTP status.
 * @returns the harness failure code.
 */
export declare function failureCodeForStatus(status: number): string;
/**
 * Parse a `Retry-After` header into a delay.
 * @param value - the header value, as seconds or an HTTP date.
 * @returns the delay in milliseconds, or undefined when it names none.
 */
export declare function retryAfterMs(value: string | null): number | undefined;
/**
 * Unwrap a `.volatile()` reference cell.
 *
 * A volatile field arrives as a frozen `{ get }` cell that settings writes
 * mutate in place, so every read has to go through this; ordinary fields pass
 * through unchanged.
 *
 * @param value - a resolved config field.
 * @returns the plain value behind a cell, else the value itself.
 */
export declare function resolveVolatile<T>(value: T | { get(): T }): T;
export declare function apply(ctx: Context, config: Config): void;
