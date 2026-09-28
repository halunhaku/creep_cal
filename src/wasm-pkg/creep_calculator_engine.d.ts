/* tslint:disable */
/* eslint-disable */

/**
 * 性能计时器
 */
export class PerformanceTimer {
    free(): void;
    [Symbol.dispose](): void;
    elapsed(): number;
    constructor();
    reset(): void;
}

export function benchmark_calculation(model: string, iterations: number): number;

/**
 * ACI 209R-92 batch calculation using the official input units.
 */
export function calculate_aci209_batch(batch_data: any): any;

/**
 * ACI 209R-92 time series indexed by concrete age from casting.
 */
export function calculate_aci209_series(params: any, max_time: number): any;

/**
 * ACI 209R-92 creep coefficient at concrete age t.
 */
export function calculate_aci209_single(params: any, t: number): number;

/**
 * B4模型时间序列计算
 */
export function calculate_b4_series(params: any, max_time: number): any;

/**
 * B4模型单点计算（完整版本）
 */
export function calculate_b4_single(params: any, t: number): any;

/**
 * B4S模型时间序列计算
 */
export function calculate_b4s_series(params: any, days: number): any;

/**
 * B4S模型单点计算（完整版本）
 */
export function calculate_b4s_single(params: any, t: number): any;

/**
 * Published fib Model Code 2010 batch calculation.
 */
export function calculate_mc2010_batch(batch_data: any): any;

/**
 * Published fib Model Code 2010 series indexed by concrete age from casting.
 */
export function calculate_mc2010_series(params: any, max_time: number): any;

/**
 * Published fib Model Code 2010 creep result at concrete age t.
 */
export function calculate_mc2010_single(params: any, t: number): any;

/**
 * 内存使用情况（WebAssembly特定）
 */
export function get_memory_usage(): number;

export function main(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_performancetimer_free: (a: number, b: number) => void;
    readonly benchmark_calculation: (a: number, b: number, c: number) => number;
    readonly calculate_aci209_batch: (a: any) => [number, number, number];
    readonly calculate_aci209_series: (a: any, b: number) => [number, number, number];
    readonly calculate_aci209_single: (a: any, b: number) => [number, number, number];
    readonly calculate_b4_series: (a: any, b: number) => [number, number, number];
    readonly calculate_b4_single: (a: any, b: number) => [number, number, number];
    readonly calculate_b4s_series: (a: any, b: number) => [number, number, number];
    readonly calculate_b4s_single: (a: any, b: number) => [number, number, number];
    readonly calculate_mc2010_batch: (a: any) => [number, number, number];
    readonly calculate_mc2010_series: (a: any, b: number) => [number, number, number];
    readonly calculate_mc2010_single: (a: any, b: number) => [number, number, number];
    readonly get_memory_usage: () => number;
    readonly main: () => void;
    readonly performancetimer_elapsed: (a: number) => number;
    readonly performancetimer_new: () => number;
    readonly performancetimer_reset: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
