/**
 * Minimal `logForDebugging` shim (plan 8d98da29 P0.2).
 *
 * The vendored ink fork imports `logForDebugging` from takumi's utils/debug,
 * whose real implementation cascades into takumi's bootstrap/state subsystem
 * (~2000 lines). The fork only needs the logging call to exist, so this no-op
 * satisfies the contract and severs the cascade cleanly.
 */
export function logForDebugging(..._args: unknown[]): void {
  /* no-op in open-assistants */
}
